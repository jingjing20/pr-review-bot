import type { ReviewAgent, ReviewContext, ReviewResult, PRReviewResult } from './types.js';
export declare class ReviewOrchestrator {
    private agents;
    constructor(agents: ReviewAgent[]);
    reviewFile(context: ReviewContext): Promise<ReviewResult[]>;
    reviewPR(prNumber: number, prTitle: string, prBody: string | null, files: Array<{
        chunk: import('../github/index.js').DiffChunk;
        fullContent?: string;
    }>): Promise<PRReviewResult>;
}
//# sourceMappingURL=orchestrator.d.ts.map