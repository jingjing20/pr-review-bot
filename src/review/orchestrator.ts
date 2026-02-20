import type { ReviewAgent, ReviewContext, ReviewResult, PRReviewResult, ReviewComment } from './types.js';

export class ReviewOrchestrator {
	private agents: ReviewAgent[];

	constructor(agents: ReviewAgent[]) {
		this.agents = agents;
	}

	async reviewFile(context: ReviewContext): Promise<ReviewResult[]> {
		return Promise.all(this.agents.map((agent) => agent.review(context)));
	}

	async reviewPR(
		prNumber: number,
		prTitle: string,
		prBody: string | null,
		files: Array<{ chunk: import('../github/index.js').DiffChunk; fullContent?: string }>
	): Promise<PRReviewResult> {
		const commentsByFile = new Map<string, ReviewComment[]>();
		let totalComments = 0;
		const stats = { errors: 0, warnings: 0, suggestions: 0, nitpicks: 0 };
		const summaries: string[] = [];

		for (const file of files) {
			if (file.chunk.changeType === 'deleted') {
				continue;
			}

			const context: ReviewContext = {
				prTitle,
				prBody,
				file: file.chunk,
				fullFileContent: file.fullContent,
			};

			const results = await this.reviewFile(context);

			for (const result of results) {
				if (result.comments.length > 0) {
					const existing = commentsByFile.get(file.chunk.filePath) ?? [];
					commentsByFile.set(file.chunk.filePath, [...existing, ...result.comments]);
					totalComments += result.comments.length;

					for (const comment of result.comments) {
						stats[`${comment.severity}s` as keyof typeof stats]++;
					}
				}

				if (result.summary) {
					summaries.push(`[${result.agent}] ${file.chunk.filePath}: ${result.summary}`);
				}
			}
		}

		const summary = summaries.length > 0
			? summaries.join('\n')
			: '没有发现需要关注的问题。';

		return {
			prNumber,
			totalComments,
			commentsByFile,
			summary,
			stats,
		};
	}
}
