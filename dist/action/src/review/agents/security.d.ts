import type { ReviewAgent, ReviewContext, ReviewResult } from '../types.js';
export declare class SecurityCheckerAgent implements ReviewAgent {
    name: string;
    description: string;
    private client;
    private model;
    constructor(apiKey: string, baseUrl?: string, model?: string);
    review(context: ReviewContext): Promise<ReviewResult>;
}
//# sourceMappingURL=security.d.ts.map