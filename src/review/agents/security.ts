import OpenAI from 'openai';
import { z } from 'zod';
import type { ReviewAgent, ReviewContext, ReviewResult, ReviewComment } from '../types.js';
import { formatDiffForReview } from '../../github/index.js';

const SecurityIssueSchema = z.object({
	lineNumber: z.number(),
	severity: z.enum(['error', 'warning']),
	issue: z.string(),
	attackVector: z.string().optional(),
	suggestion: z.string().optional(),
});

const SecurityReviewOutputSchema = z.object({
	issues: z.array(SecurityIssueSchema),
	summary: z.string(),
});

const SYSTEM_PROMPT = `你是一个安全审计专家，专注于发现代码中的安全漏洞。

审查维度：
1. 注入风险 - SQL 注入、XSS、命令注入、路径遍历
2. 敏感信息 - 硬编码密钥、API Token、密码、日志中泄露敏感数据
3. 认证授权 - 权限检查缺失、不安全的身份验证
4. 不安全的依赖使用 - 危险的 eval、不安全的反序列化
5. SSRF - 服务端请求伪造风险
6. 加密问题 - 弱加密算法、不安全的随机数

输出要求：
- 安全问题必须标记为 error（高危）或 warning（中低危）
- 必须说明具体的攻击场景（attackVector）
- 提供修复建议
- 如果没有安全问题，返回空的 issues 数组
- 不要误报，只报告真正的安全风险
- 用中文回复`;

export class SecurityCheckerAgent implements ReviewAgent {
	name = 'security-checker';
	description = '检测代码中的安全漏洞';

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

		const userPrompt = `请从安全角度审查以下代码变更：

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
      "severity": "error" | "warning",
      "issue": "<安全问题描述>",
      "attackVector": "<攻击场景说明>",
      "suggestion": "<修复建议>"
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

		let parsed: z.infer<typeof SecurityReviewOutputSchema>;
		try {
			const json = JSON.parse(content);
			parsed = SecurityReviewOutputSchema.parse(json);
		} catch {
			return {
				agent: this.name,
				comments: [],
				summary: '解析安全审查结果失败',
			};
		}

		const comments: ReviewComment[] = parsed.issues.map((issue) => ({
			filePath: context.file.filePath,
			lineNumber: issue.lineNumber,
			severity: issue.severity,
			category: 'security' as const,
			message: `${issue.issue}${issue.attackVector ? ` (攻击场景: ${issue.attackVector})` : ''}`,
			suggestion: issue.suggestion,
		}));

		return {
			agent: this.name,
			comments,
			summary: parsed.summary,
		};
	}
}
