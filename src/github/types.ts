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

export function parsePRUrl(url: string): PRIdentifier {
	const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
	if (!match) {
		throw new Error(`Invalid GitHub PR URL: ${url}`);
	}
	return {
		owner: match[1],
		repo: match[2],
		prNumber: parseInt(match[3], 10),
	};
}
