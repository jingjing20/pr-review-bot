export interface DiffChunk {
	filePath: string;
	oldPath?: string;
	changeType: 'added' | 'modified' | 'deleted' | 'renamed';
	hunks: DiffHunk[];
}

export interface DiffHunk {
	oldStart: number;
	oldLines: number;
	newStart: number;
	newLines: number;
	header: string;
	changes: DiffChange[];
}

export interface DiffChange {
	type: 'add' | 'delete' | 'context';
	lineNumber: number;
	content: string;
}

const DIFF_HEADER_REGEX = /^diff --git a\/(.+) b\/(.+)$/;
const HUNK_HEADER_REGEX = /^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/;

export function parseDiff(diffText: string): DiffChunk[] {
	const lines = diffText.split('\n');
	const chunks: DiffChunk[] = [];
	let currentChunk: DiffChunk | null = null;
	let currentHunk: DiffHunk | null = null;
	let newLineNumber = 0;
	let oldLineNumber = 0;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		const headerMatch = line.match(DIFF_HEADER_REGEX);
		if (headerMatch) {
			if (currentChunk) {
				chunks.push(currentChunk);
			}

			const oldPath = headerMatch[1];
			const newPath = headerMatch[2];
			const changeType = detectChangeType(lines, i, oldPath, newPath);

			currentChunk = {
				filePath: newPath,
				oldPath: changeType === 'renamed' ? oldPath : undefined,
				changeType,
				hunks: [],
			};
			currentHunk = null;
			continue;
		}

		const hunkMatch = line.match(HUNK_HEADER_REGEX);
		if (hunkMatch && currentChunk) {
			currentHunk = {
				oldStart: parseInt(hunkMatch[1], 10),
				oldLines: parseInt(hunkMatch[2] || '1', 10),
				newStart: parseInt(hunkMatch[3], 10),
				newLines: parseInt(hunkMatch[4] || '1', 10),
				header: line,
				changes: [],
			};
			currentChunk.hunks.push(currentHunk);
			oldLineNumber = currentHunk.oldStart;
			newLineNumber = currentHunk.newStart;
			continue;
		}

		if (currentHunk && (line.startsWith('+') || line.startsWith('-') || line.startsWith(' '))) {
			const prefix = line[0];
			const content = line.slice(1);

			if (prefix === '+') {
				currentHunk.changes.push({
					type: 'add',
					lineNumber: newLineNumber,
					content,
				});
				newLineNumber++;
			} else if (prefix === '-') {
				currentHunk.changes.push({
					type: 'delete',
					lineNumber: oldLineNumber,
					content,
				});
				oldLineNumber++;
			} else {
				currentHunk.changes.push({
					type: 'context',
					lineNumber: newLineNumber,
					content,
				});
				oldLineNumber++;
				newLineNumber++;
			}
		}
	}

	if (currentChunk) {
		chunks.push(currentChunk);
	}

	return chunks;
}

function detectChangeType(
	lines: string[],
	headerIndex: number,
	oldPath: string,
	newPath: string
): DiffChunk['changeType'] {
	for (let i = headerIndex + 1; i < Math.min(headerIndex + 10, lines.length); i++) {
		const line = lines[i];
		if (line.startsWith('new file mode')) return 'added';
		if (line.startsWith('deleted file mode')) return 'deleted';
		if (line.startsWith('rename from') || line.startsWith('similarity index')) return 'renamed';
		if (line.startsWith('@@')) break;
	}

	if (oldPath !== newPath) return 'renamed';
	return 'modified';
}

export function getAddedLines(chunk: DiffChunk): DiffChange[] {
	return chunk.hunks.flatMap((hunk) =>
		hunk.changes.filter((change) => change.type === 'add')
	);
}

export function getValidLineNumbers(chunk: DiffChunk): Set<number> {
	const validLines = new Set<number>();
	for (const hunk of chunk.hunks) {
		for (const change of hunk.changes) {
			if (change.type === 'add' || change.type === 'context') {
				validLines.add(change.lineNumber);
			}
		}
	}
	return validLines;
}

export function formatDiffForReview(chunk: DiffChunk): string {
	const lines: string[] = [];
	lines.push(`## ${chunk.filePath}`);
	lines.push(`Change type: ${chunk.changeType}`);
	lines.push('');
	lines.push('Each line is prefixed with a line number marker:');
	lines.push('- `[L<number>]` = line number in the new file (you can comment on these)');
	lines.push('- `[DEL]` = deleted line (do NOT use for comments)');
	lines.push('');

	for (const hunk of chunk.hunks) {
		lines.push('```diff');
		lines.push(hunk.header);
		for (const change of hunk.changes) {
			const prefix = change.type === 'add' ? '+' : change.type === 'delete' ? '-' : ' ';
			const lineMarker = change.type === 'delete' ? '[DEL]' : `[L${change.lineNumber}]`;
			lines.push(`${lineMarker} ${prefix}${change.content}`);
		}
		lines.push('```');
		lines.push('');
	}

	return lines.join('\n');
}
