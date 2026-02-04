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
export declare function parseDiff(diffText: string): DiffChunk[];
export declare function getAddedLines(chunk: DiffChunk): DiffChange[];
export declare function formatDiffForReview(chunk: DiffChunk): string;
//# sourceMappingURL=diff-parser.d.ts.map