import 'dotenv/config';
import { Command } from 'commander';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { GitHubClient, parsePRUrl, parseDiff } from './github/index.js';
import { LogicReviewerAgent, SecurityCheckerAgent, StyleAdvisorAgent, ReviewOrchestrator } from './review/index.js';
import type { PRReviewResult } from './review/index.js';
import type { PRIdentifier } from './github/index.js';

const program = new Command();

program
	.name('pr-review')
	.description('AI-powered GitHub PR Review Bot')
	.version('0.1.0');

program
	.command('review')
	.description('Review a GitHub Pull Request')
	.argument('<pr-url>', 'GitHub PR URL (e.g., https://github.com/owner/repo/pull/123)')
	.option('--post-comment', 'Post review as GitHub comment')
	.option('-o, --output <dir>', 'Output directory for review markdown files', './reviews')
	.option('--no-save', 'Do not save review to file')
	.action(async (prUrl: string, options: { postComment?: boolean; output: string; save: boolean }) => {
		const githubToken = process.env.GITHUB_TOKEN;
		const openaiKey = process.env.OPENAI_API_KEY;
		const openaiBaseUrl = process.env.OPENAI_BASE_URL;
		const openaiModel = process.env.OPENAI_MODEL;

		if (!githubToken) {
			console.error('Error: GITHUB_TOKEN is required');
			process.exit(1);
		}

		if (!openaiKey) {
			console.error('Error: OPENAI_API_KEY is required');
			process.exit(1);
		}

		try {
			const prId = parsePRUrl(prUrl);
			console.log(`\n🔍 Reviewing PR #${prId.prNumber} in ${prId.owner}/${prId.repo}...\n`);

			const github = new GitHubClient(githubToken);
			const pr = await github.getPullRequest(prId);
			const diffText = await github.getPullRequestDiff(prId);
			const chunks = parseDiff(diffText);

			console.log(`📄 Found ${chunks.length} changed files\n`);

			const logicAgent = new LogicReviewerAgent(openaiKey, openaiBaseUrl, openaiModel);
			const securityAgent = new SecurityCheckerAgent(openaiKey, openaiBaseUrl, openaiModel);
			const styleAgent = new StyleAdvisorAgent(openaiKey, openaiBaseUrl, openaiModel);
			const orchestrator = new ReviewOrchestrator([logicAgent, securityAgent, styleAgent]);

			const files = chunks.map((chunk) => ({ chunk }));
			const result = await orchestrator.reviewPR(pr.number, pr.title, pr.body, files);

			printReviewResult(result);

			if (options.save) {
				const filePath = saveReviewToFile(result, prId, pr.title, prUrl, options.output);
				console.log(`\n💾 Review saved to: ${filePath}`);
			}

			if (options.postComment && result.totalComments > 0) {
				console.log('\n📝 Posting review to GitHub...');
				const commentBody = formatReviewAsMarkdown(result, pr.title, prUrl);
				await github.createIssueComment(prId, commentBody);
				console.log('✅ Review posted successfully!');
			}
		} catch (error) {
			console.error('Error:', error instanceof Error ? error.message : error);
			process.exit(1);
		}
	});

function saveReviewToFile(
	result: PRReviewResult,
	prId: PRIdentifier,
	prTitle: string,
	prUrl: string,
	outputDir: string
): string {
	if (!existsSync(outputDir)) {
		mkdirSync(outputDir, { recursive: true });
	}

	const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
	const filename = `${prId.owner}_${prId.repo}_pr${prId.prNumber}_${timestamp}.md`;
	const filePath = join(outputDir, filename);

	const content = formatReviewAsMarkdown(result, prTitle, prUrl);
	writeFileSync(filePath, content, 'utf-8');

	return filePath;
}


function printReviewResult(result: PRReviewResult): void {
	console.log('━'.repeat(60));
	console.log(`📊 Review Summary for PR #${result.prNumber}`);
	console.log('━'.repeat(60));
	console.log(`\nTotal issues found: ${result.totalComments}`);
	console.log(`  🔴 Errors: ${result.stats.errors}`);
	console.log(`  🟡 Warnings: ${result.stats.warnings}`);
	console.log(`  🔵 Suggestions: ${result.stats.suggestions}`);
	console.log(`  ⚪ Nitpicks: ${result.stats.nitpicks}`);

	if (result.totalComments > 0) {
		console.log('\n📝 Details:\n');

		for (const [filePath, comments] of result.commentsByFile) {
			console.log(`\n## ${filePath}`);
			for (const comment of comments) {
				const icon = {
					error: '🔴',
					warning: '🟡',
					suggestion: '🔵',
					nitpick: '⚪',
				}[comment.severity];

				console.log(`  ${icon} Line ${comment.lineNumber}: ${comment.message}`);
				if (comment.suggestion) {
					console.log(`     💡 Suggestion: ${comment.suggestion}`);
				}
			}
		}
	}

	console.log('\n' + '━'.repeat(60));
	console.log('Summary:');
	console.log(result.summary);
	console.log('━'.repeat(60));
}

function formatReviewAsMarkdown(result: PRReviewResult, prTitle: string, prUrl: string): string {
	const lines: string[] = [];

	lines.push(`# PR Review: ${prTitle}\n`);
	lines.push(`**PR:** [#${result.prNumber}](${prUrl})\n`);
	lines.push(`**Date:** ${new Date().toISOString()}\n`);
	lines.push('---\n');
	lines.push('## 🤖 AI Code Review\n');
	lines.push(`**Total issues found:** ${result.totalComments}\n`);
	lines.push(`- 🔴 Errors: ${result.stats.errors}`);
	lines.push(`- 🟡 Warnings: ${result.stats.warnings}`);
	lines.push(`- 🔵 Suggestions: ${result.stats.suggestions}`);
	lines.push(`- ⚪ Nitpicks: ${result.stats.nitpicks}\n`);


	if (result.totalComments > 0) {
		lines.push('### Details\n');

		for (const [filePath, comments] of result.commentsByFile) {
			lines.push(`#### \`${filePath}\`\n`);
			for (const comment of comments) {
				const icon = {
					error: '🔴',
					warning: '🟡',
					suggestion: '🔵',
					nitpick: '⚪',
				}[comment.severity];

				lines.push(`${icon} **Line ${comment.lineNumber}:** ${comment.message}`);
				if (comment.suggestion) {
					lines.push(`> 💡 ${comment.suggestion}`);
				}
				lines.push('');
			}
		}
	}

	lines.push('---');
	lines.push('*Generated by PR Review Bot*');

	return lines.join('\n');
}

program.parse();
