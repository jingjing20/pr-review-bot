import * as core from '@actions/core';
import * as github from '@actions/github';
import { GitHubClient, parseDiff, getValidLineNumbers } from '../src/github/index.js';
import type { ReviewCommentInput } from '../src/github/index.js';
import {
	LogicReviewerAgent,
	SecurityCheckerAgent,
	StyleAdvisorAgent,
	ReviewOrchestrator,
} from '../src/review/index.js';
import type { ReviewAgent, PRReviewResult, ReviewComment } from '../src/review/index.js';

async function run(): Promise<void> {
	try {
		const githubToken = core.getInput('github-token', { required: true });
		const openaiKey = core.getInput('openai-api-key', { required: true });
		const openaiBaseUrl = core.getInput('openai-base-url') || undefined;
		const openaiModel = core.getInput('openai-model', { required: true });
		const agentNames = core.getInput('agents').split(',').map((s: string) => s.trim());
		const postComment = core.getInput('post-comment') === 'true';

		const context = github.context;

		if (!context.payload.pull_request) {
			core.setFailed('This action only works on pull_request events');
			return;
		}

		const prNumber = context.payload.pull_request.number;
		const owner = context.repo.owner;
		const repo = context.repo.repo;

		core.info(`Reviewing PR #${prNumber} in ${owner}/${repo}...`);

		const client = new GitHubClient(githubToken);
		const prId = { owner, repo, prNumber };

		const pr = await client.getPullRequest(prId);
		const diffText = await client.getPullRequestDiff(prId);
		const chunks = parseDiff(diffText);

		core.info(`Found ${chunks.length} changed files`);

		const agents: ReviewAgent[] = [];

		if (agentNames.includes('logic')) {
			agents.push(new LogicReviewerAgent(openaiKey, openaiBaseUrl, openaiModel));
		}
		if (agentNames.includes('security')) {
			agents.push(new SecurityCheckerAgent(openaiKey, openaiBaseUrl, openaiModel));
		}
		if (agentNames.includes('style')) {
			agents.push(new StyleAdvisorAgent(openaiKey, openaiBaseUrl, openaiModel));
		}

		if (agents.length === 0) {
			core.setFailed('No valid agents specified');
			return;
		}

		const validLinesByFile = new Map<string, Set<number>>();
		for (const chunk of chunks) {
			validLinesByFile.set(chunk.filePath, getValidLineNumbers(chunk));
		}

		const orchestrator = new ReviewOrchestrator(agents);
		const files = chunks.map((chunk) => ({ chunk }));
		const result = await orchestrator.reviewPR(pr.number, pr.title, pr.body, files);

		core.setOutput('total-issues', result.totalComments);
		core.setOutput('errors', result.stats.errors);
		core.setOutput('warnings', result.stats.warnings);

		core.info(`Review completed: ${result.totalComments} issues found`);
		core.info(`  Errors: ${result.stats.errors}`);
		core.info(`  Warnings: ${result.stats.warnings}`);
		core.info(`  Suggestions: ${result.stats.suggestions}`);

		if (postComment && result.totalComments > 0) {
			const { lineComments, invalidComments } = filterValidComments(result.commentsByFile, validLinesByFile);

			if (lineComments.length > 0) {
				core.info(`Posting ${lineComments.length} inline review comments...`);
				await client.createReview(prId, pr.head.sha, lineComments);
				core.info('Inline comments posted successfully');
			}

			core.info('Posting summary comment...');
			const summaryBody = formatReviewAsMarkdown(result, pr.title, `https://github.com/${owner}/${repo}/pull/${prNumber}`, invalidComments);
			await client.createIssueComment(prId, summaryBody);
			core.info('Summary comment posted successfully');
		}

		if (result.stats.errors > 0) {
			core.warning(`Found ${result.stats.errors} error(s) in the code`);
		}
	} catch (error) {
		if (error instanceof Error) {
			core.setFailed(error.message);
		} else {
			core.setFailed('An unexpected error occurred');
		}
	}
}

function filterValidComments(
	commentsByFile: Map<string, ReviewComment[]>,
	validLinesByFile: Map<string, Set<number>>
): { lineComments: ReviewCommentInput[]; invalidComments: ReviewComment[] } {
	const lineComments: ReviewCommentInput[] = [];
	const invalidComments: ReviewComment[] = [];

	for (const [filePath, comments] of commentsByFile) {
		const validLines = validLinesByFile.get(filePath);
		for (const comment of comments) {
			if (validLines?.has(comment.lineNumber)) {
				const icon = {
					error: ':red_circle:',
					warning: ':yellow_circle:',
					suggestion: ':large_blue_circle:',
					nitpick: ':white_circle:',
				}[comment.severity];

				let body = `${icon} **[${comment.category}]** ${comment.message}`;
				if (comment.suggestion) {
					body += `\n\n> ${comment.suggestion}`;
				}

				lineComments.push({
					path: filePath,
					line: comment.lineNumber,
					body,
				});
			} else {
				invalidComments.push(comment);
			}
		}
	}

	return { lineComments, invalidComments };
}

function formatReviewAsMarkdown(
	result: PRReviewResult,
	prTitle: string,
	prUrl: string,
	invalidComments: ReviewComment[] = []
): string {
	const lines: string[] = [];

	lines.push(`# PR Review: ${prTitle}\n`);
	lines.push(`**PR:** [#${result.prNumber}](${prUrl})\n`);
	lines.push(`**Date:** ${new Date().toISOString()}\n`);
	lines.push('---\n');
	lines.push('## AI Code Review Summary\n');
	lines.push(`**Total issues found:** ${result.totalComments}\n`);
	lines.push(`- Errors: ${result.stats.errors}`);
	lines.push(`- Warnings: ${result.stats.warnings}`);
	lines.push(`- Suggestions: ${result.stats.suggestions}`);
	lines.push(`- Nitpicks: ${result.stats.nitpicks}\n`);

	if (invalidComments.length > 0) {
		lines.push('### Issues outside diff range\n');
		lines.push('The following issues could not be posted as inline comments:\n');

		for (const comment of invalidComments) {
			const icon = {
				error: ':red_circle:',
				warning: ':yellow_circle:',
				suggestion: ':large_blue_circle:',
				nitpick: ':white_circle:',
			}[comment.severity];

			lines.push(`${icon} **\`${comment.filePath}\` Line ${comment.lineNumber}:** ${comment.message}`);
			if (comment.suggestion) {
				lines.push(`> ${comment.suggestion}`);
			}
			lines.push('');
		}
	}

	lines.push('---');
	lines.push('*Generated by [AI PR Review Bot](https://github.com/jingjing20/pr-review-bot)*');

	return lines.join('\n');
}

run();

