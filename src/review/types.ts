import { z } from 'zod';
import type { DiffChunk } from '../github/index.js';

export const ReviewCommentSchema = z.object({
	filePath: z.string(),
	lineNumber: z.number(),
	severity: z.enum(['error', 'warning', 'suggestion', 'nitpick']),
	category: z.enum(['logic', 'security', 'style', 'performance']),
	message: z.string(),
	suggestion: z.string().optional(),
});

export type ReviewComment = z.infer<typeof ReviewCommentSchema>;

export const ReviewResultSchema = z.object({
	agent: z.string(),
	comments: z.array(ReviewCommentSchema),
	summary: z.string().optional(),
});

export type ReviewResult = z.infer<typeof ReviewResultSchema>;

export interface ReviewContext {
	prTitle: string;
	prBody: string | null;
	file: DiffChunk;
	fullFileContent?: string;
}

export interface ReviewAgent {
	name: string;
	description: string;
	review(context: ReviewContext): Promise<ReviewResult>;
}

export interface PRReviewResult {
	prNumber: number;
	totalComments: number;
	commentsByFile: Map<string, ReviewComment[]>;
	summary: string;
	stats: {
		errors: number;
		warnings: number;
		suggestions: number;
		nitpicks: number;
	};
}
