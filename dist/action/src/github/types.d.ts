export interface PullRequest {
    number: number;
    title: string;
    body: string | null;
    state: 'open' | 'closed';
    user: {
        login: string;
    };
    head: {
        ref: string;
        sha: string;
    };
    base: {
        ref: string;
        sha: string;
    };
    htmlUrl: string;
    createdAt: string;
    updatedAt: string;
}
export interface PullRequestFile {
    filename: string;
    status: 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed' | 'unchanged';
    additions: number;
    deletions: number;
    changes: number;
    patch?: string;
    previousFilename?: string;
}
export interface PRIdentifier {
    owner: string;
    repo: string;
    prNumber: number;
}
export declare function parsePRUrl(url: string): PRIdentifier;
//# sourceMappingURL=types.d.ts.map