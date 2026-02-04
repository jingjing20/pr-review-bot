import { z } from 'zod';
import type { DiffChunk } from '../github/index.js';
export declare const ReviewCommentSchema: z.ZodObject<{
    filePath: z.ZodString;
    lineNumber: z.ZodNumber;
    severity: z.ZodEnum<["error", "warning", "suggestion", "nitpick"]>;
    category: z.ZodEnum<["logic", "security", "style", "performance"]>;
    message: z.ZodString;
    suggestion: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    message: string;
    filePath: string;
    lineNumber: number;
    severity: "error" | "warning" | "suggestion" | "nitpick";
    category: "logic" | "security" | "style" | "performance";
    suggestion?: string | undefined;
}, {
    message: string;
    filePath: string;
    lineNumber: number;
    severity: "error" | "warning" | "suggestion" | "nitpick";
    category: "logic" | "security" | "style" | "performance";
    suggestion?: string | undefined;
}>;
export type ReviewComment = z.infer<typeof ReviewCommentSchema>;
export declare const ReviewResultSchema: z.ZodObject<{
    agent: z.ZodString;
    comments: z.ZodArray<z.ZodObject<{
        filePath: z.ZodString;
        lineNumber: z.ZodNumber;
        severity: z.ZodEnum<["error", "warning", "suggestion", "nitpick"]>;
        category: z.ZodEnum<["logic", "security", "style", "performance"]>;
        message: z.ZodString;
        suggestion: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        message: string;
        filePath: string;
        lineNumber: number;
        severity: "error" | "warning" | "suggestion" | "nitpick";
        category: "logic" | "security" | "style" | "performance";
        suggestion?: string | undefined;
    }, {
        message: string;
        filePath: string;
        lineNumber: number;
        severity: "error" | "warning" | "suggestion" | "nitpick";
        category: "logic" | "security" | "style" | "performance";
        suggestion?: string | undefined;
    }>, "many">;
    summary: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    agent: string;
    comments: {
        message: string;
        filePath: string;
        lineNumber: number;
        severity: "error" | "warning" | "suggestion" | "nitpick";
        category: "logic" | "security" | "style" | "performance";
        suggestion?: string | undefined;
    }[];
    summary?: string | undefined;
}, {
    agent: string;
    comments: {
        message: string;
        filePath: string;
        lineNumber: number;
        severity: "error" | "warning" | "suggestion" | "nitpick";
        category: "logic" | "security" | "style" | "performance";
        suggestion?: string | undefined;
    }[];
    summary?: string | undefined;
}>;
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
//# sourceMappingURL=types.d.ts.map