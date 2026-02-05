import { Octokit } from '@octokit/rest';
import type { PullRequest, PullRequestFile, PRIdentifier } from './types.js';

export interface ReviewCommentInput {
	path: string;
	line: number;
	body: string;
}

export class GitHubClient {
	private octokit: Octokit;

	constructor(token: string) {
		this.octokit = new Octokit({ auth: token });
	}

	async getPullRequest(id: PRIdentifier): Promise<PullRequest> {
		const { data } = await this.octokit.pulls.get({
			owner: id.owner,
			repo: id.repo,
			pull_number: id.prNumber,
		});

		return {
			number: data.number,
			title: data.title,
			body: data.body,
			state: data.state as 'open' | 'closed',
			user: { login: data.user?.login ?? 'unknown' },
			head: { ref: data.head.ref, sha: data.head.sha },
			base: { ref: data.base.ref, sha: data.base.sha },
			htmlUrl: data.html_url,
			createdAt: data.created_at,
			updatedAt: data.updated_at,
		};
	}

	async getPullRequestDiff(id: PRIdentifier): Promise<string> {
		const { data } = await this.octokit.pulls.get({
			owner: id.owner,
			repo: id.repo,
			pull_number: id.prNumber,
			mediaType: { format: 'diff' },
		});

		return data as unknown as string;
	}

	async getPullRequestFiles(id: PRIdentifier): Promise<PullRequestFile[]> {
		const { data } = await this.octokit.pulls.listFiles({
			owner: id.owner,
			repo: id.repo,
			pull_number: id.prNumber,
			per_page: 100,
		});

		return data.map((file) => ({
			filename: file.filename,
			status: file.status as PullRequestFile['status'],
			additions: file.additions,
			deletions: file.deletions,
			changes: file.changes,
			patch: file.patch,
			previousFilename: file.previous_filename,
		}));
	}

	async createReviewComment(
		id: PRIdentifier,
		body: string,
		commitId: string,
		path: string,
		line: number
	): Promise<void> {
		await this.octokit.pulls.createReviewComment({
			owner: id.owner,
			repo: id.repo,
			pull_number: id.prNumber,
			body,
			commit_id: commitId,
			path,
			line,
		});
	}

	async createIssueComment(id: PRIdentifier, body: string): Promise<void> {
		await this.octokit.issues.createComment({
			owner: id.owner,
			repo: id.repo,
			issue_number: id.prNumber,
			body,
		});
	}

	async createReview(
		id: PRIdentifier,
		commitSha: string,
		comments: ReviewCommentInput[],
		body?: string
	): Promise<void> {
		await this.octokit.pulls.createReview({
			owner: id.owner,
			repo: id.repo,
			pull_number: id.prNumber,
			commit_id: commitSha,
			body: body ?? '',
			event: 'COMMENT',
			comments: comments.map((c) => ({
				path: c.path,
				line: c.line,
				body: c.body,
			})),
		});
	}
}
