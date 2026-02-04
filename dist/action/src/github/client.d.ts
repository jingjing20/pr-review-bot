import type { PullRequest, PullRequestFile, PRIdentifier } from './types.js';
export declare class GitHubClient {
    private octokit;
    constructor(token: string);
    getPullRequest(id: PRIdentifier): Promise<PullRequest>;
    getPullRequestDiff(id: PRIdentifier): Promise<string>;
    getPullRequestFiles(id: PRIdentifier): Promise<PullRequestFile[]>;
    createReviewComment(id: PRIdentifier, body: string, commitId: string, path: string, line: number): Promise<void>;
    createIssueComment(id: PRIdentifier, body: string): Promise<void>;
}
//# sourceMappingURL=client.d.ts.map