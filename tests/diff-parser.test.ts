import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseDiff, getAddedLines } from '../src/github/diff-parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('parseDiff', () => {
	const sampleDiff = readFileSync(
		join(__dirname, 'fixtures/sample.diff'),
		'utf-8'
	);

	it('should parse multiple file chunks', () => {
		const chunks = parseDiff(sampleDiff);
		expect(chunks).toHaveLength(3);
	});

	it('should detect added file', () => {
		const chunks = parseDiff(sampleDiff);
		const addedFile = chunks.find((c) => c.filePath === 'src/utils.ts');

		expect(addedFile).toBeDefined();
		expect(addedFile?.changeType).toBe('added');
		expect(addedFile?.hunks).toHaveLength(1);
	});

	it('should detect modified file', () => {
		const chunks = parseDiff(sampleDiff);
		const modifiedFile = chunks.find((c) => c.filePath === 'src/config.ts');

		expect(modifiedFile).toBeDefined();
		expect(modifiedFile?.changeType).toBe('modified');
	});

	it('should detect deleted file', () => {
		const chunks = parseDiff(sampleDiff);
		const deletedFile = chunks.find((c) => c.filePath === 'src/old-file.ts');

		expect(deletedFile).toBeDefined();
		expect(deletedFile?.changeType).toBe('deleted');
	});

	it('should parse line changes correctly', () => {
		const chunks = parseDiff(sampleDiff);
		const configFile = chunks.find((c) => c.filePath === 'src/config.ts');

		expect(configFile?.hunks[0].changes.length).toBeGreaterThan(0);

		const addedChanges = configFile?.hunks[0].changes.filter((c) => c.type === 'add');
		const deletedChanges = configFile?.hunks[0].changes.filter((c) => c.type === 'delete');

		expect(addedChanges?.length).toBe(3);
		expect(deletedChanges?.length).toBe(1);
	});

	it('should track line numbers correctly', () => {
		const chunks = parseDiff(sampleDiff);
		const utilsFile = chunks.find((c) => c.filePath === 'src/utils.ts');

		const addedLines = getAddedLines(utilsFile!);
		expect(addedLines[0].lineNumber).toBe(1);
		expect(addedLines[addedLines.length - 1].lineNumber).toBe(15);
	});
});
