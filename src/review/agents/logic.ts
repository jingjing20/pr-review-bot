import OpenAI from 'openai';
import { z } from 'zod';
import type { ReviewAgent, ReviewContext, ReviewResult, ReviewComment } from '../types.js';
import { formatDiffForReview } from '../../github/index.js';


const LogicIssueSchema = z.object({
	lineNumber: z.number(),
	severity: z.enum(['error', 'warning', 'suggestion']),
	issue: z.string(),
	suggestion: z.string().optional(),
});

const LogicReviewOutputSchema = z.object({
	issues: z.array(LogicIssueSchema),
	summary: z.string(),
});

const SYSTEM_PROMPT = `你是一个严格的代码逻辑审查专家。

审查维度：
1. 边界条件处理 - 空值、越界、类型转换
2. 错误处理 - 异常捕获、错误传播
3. 逻辑漏洞 - 条件遗漏、状态不一致
4. 可能的 Bug - 拼写错误、错误的比较运算符

输出要求：
- 只指出真正的问题，不要过度挑剔
- 每个问题必须说明：在什么情况下会出问题
- 如果代码没有明显问题，返回空的 issues 数组
- 用中文回复

行号规则（重要）：
- 代码中每行以 [L<number>] 或 [DEL] 开头
- lineNumber 必须使用 [L<number>] 中的数字
- 不可使用 [DEL] 标记的行（这些是被删除的行）
- 只评论新增或修改的代码行`;

export class LogicReviewerAgent implements ReviewAgent {
	name = 'logic-reviewer';
	description = '审查代码逻辑正确性';

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

		const userPrompt = `请审查以下代码变更：

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
      "severity": "error" | "warning" | "suggestion",
      "issue": "<问题描述>",
      "suggestion": "<可选的修复建议>"
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

		let parsed: z.infer<typeof LogicReviewOutputSchema>;
		try {
			const json = JSON.parse(content);
			parsed = LogicReviewOutputSchema.parse(json);
		} catch {
			return {
				agent: this.name,
				comments: [],
				summary: '解析审查结果失败',
			};
		}

		const comments: ReviewComment[] = parsed.issues.map((issue) => ({
			filePath: context.file.filePath,
			lineNumber: issue.lineNumber,
			severity: issue.severity,
			category: 'logic' as const,
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
