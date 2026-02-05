import OpenAI from 'openai';
import { z } from 'zod';
import type { ReviewAgent, ReviewContext, ReviewResult, ReviewComment } from '../types.js';
import { formatDiffForReview } from '../../github/index.js';

const StyleIssueSchema = z.object({
	lineNumber: z.number(),
	severity: z.enum(['suggestion', 'nitpick']),
	issue: z.string(),
	suggestion: z.string().optional(),
});

const StyleReviewOutputSchema = z.object({
	issues: z.array(StyleIssueSchema),
	summary: z.string(),
});

const SYSTEM_PROMPT = `你是一个代码风格顾问，专注于提升代码可读性和可维护性。

审查维度：
1. 命名规范 - 变量、函数、类的命名是否清晰、有意义
2. 代码结构 - 函数是否过长、嵌套是否过深、职责是否单一
3. TypeScript 最佳实践 - 类型使用是否恰当、是否滥用 any
4. 注释质量 - 复杂逻辑是否缺少必要注释
5. 代码重复 - 是否有明显的重复代码可以抽象
6. 错误处理 - 错误处理是否合理

输出要求：
- 风格建议标记为 suggestion（值得改进）或 nitpick（小问题）
- 不要过度苛刻，专注于影响可读性和可维护性的问题
- 对于主观性强的问题，用 nitpick
- 如果代码风格良好，返回空的 issues 数组
- 用中文回复

行号规则（重要）：
- 代码中每行以 [L<number>] 或 [DEL] 开头
- lineNumber 必须使用 [L<number>] 中的数字
- 不可使用 [DEL] 标记的行（这些是被删除的行）
- 只评论新增或修改的代码行`;

export class StyleAdvisorAgent implements ReviewAgent {
	name = 'style-advisor';
	description = '代码风格和最佳实践建议';

	private client: OpenAI;
	private model: string;

	constructor(apiKey: string, baseUrl?: string, model?: string) {
		this.client = new OpenAI({
			apiKey,
			baseURL: baseUrl,
		});
		this.model = model ?? 'gpt-4o-mini';
	}

	async review(context: ReviewContext): Promise<ReviewResult> {
		const diffContent = formatDiffForReview(context.file);

		const userPrompt = `请从代码风格角度审查以下代码变更：

## PR 信息
标题: ${context.prTitle}
${context.prBody ? `描述: ${context.prBody}` : ''}

## 代码变更
${diffContent}

请以 JSON 格式输出，结构如下：
{
  "issues": [
    {
      "lineNumber": <行号>,
      "severity": "suggestion" | "nitpick",
      "issue": "<风格问题描述>",
      "suggestion": "<改进建议>"
    }
  ],
  "summary": "<简短总结>"
}`;

		const response = await this.client.chat.completions.create({
			model: this.model,
			messages: [
				{ role: 'system', content: SYSTEM_PROMPT },
				{ role: 'user', content: userPrompt },
			],
			temperature: 0.3,
			response_format: { type: 'json_object' },
		});

		const content = response.choices[0]?.message?.content ?? '{}';

		let parsed: z.infer<typeof StyleReviewOutputSchema>;
		try {
			const json = JSON.parse(content);
			parsed = StyleReviewOutputSchema.parse(json);
		} catch {
			return {
				agent: this.name,
				comments: [],
				summary: '解析风格审查结果失败',
			};
		}

		const comments: ReviewComment[] = parsed.issues.map((issue) => ({
			filePath: context.file.filePath,
			lineNumber: issue.lineNumber,
			severity: issue.severity,
			category: 'style' as const,
			message: issue.issue,
			suggestion: issue.suggestion,
		}));

		return {
			agent: this.name,
			comments,
			summary: parsed.summary,
		};
	}
}
