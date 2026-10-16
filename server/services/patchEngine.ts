import * as Diff from 'diff';
import { computeSha256 } from '../utils/crypto.js';
import { PatchHunk, EditProposal, HunkStatus } from '../../shared/types.js';

export interface ComputeDiffOptions {
  projectId: string;
  filePath: string;
  baseVersion: number;
  baseSha256: string;
  originalContent: string;
  proposedContent: string;
  explanation: string;
}

export class PatchEngine {
  /**
   * Computes structured PatchHunks between originalContent and proposedContent
   */
  static generateHunks(originalContent: string, proposedContent: string, filePath = 'file'): PatchHunk[] {
    const patch = Diff.structuredPatch(
      filePath,
      filePath,
      originalContent,
      proposedContent,
      'original',
      'proposed',
      { context: 3 }
    );

    const hunks: PatchHunk[] = [];

    patch.hunks.forEach((h: any, index: number) => {
      const contextBefore: string[] = [];
      const oldLines: string[] = [];
      const newLines: string[] = [];
      const contextAfter: string[] = [];

      let seenDiff = false;
      let trailingContext = false;

      for (const line of h.lines) {
        if (line.startsWith(' ')) {
          const content = line.slice(1);
          oldLines.push(content);
          newLines.push(content);
          if (!seenDiff) {
            contextBefore.push(content);
          } else {
            trailingContext = true;
            contextAfter.push(content);
          }
        } else if (line.startsWith('-')) {
          seenDiff = true;
          oldLines.push(line.slice(1));
        } else if (line.startsWith('+')) {
          seenDiff = true;
          newLines.push(line.slice(1));
        }
      }

      hunks.push({
        hunkId: `hunk-${index + 1}-${Date.now()}`,
        hunkIndex: index,
        oldStartLine: h.oldStart,
        oldLineCount: h.oldLines,
        newStartLine: h.newStart,
        newLineCount: h.newLines,
        contextBefore,
        oldLines,
        newLines,
        contextAfter,
        oldContent: oldLines.join('\n'),
        newContent: newLines.join('\n'),
        status: 'pending',
      });
    });

    return hunks;
  }

  /**
   * Creates an EditProposal object ready for database storage and client inspection
   */
  static createProposal(options: ComputeDiffOptions): EditProposal {
    const hunks = this.generateHunks(options.originalContent, options.proposedContent, options.filePath);
    return {
      id: `prop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      projectId: options.projectId,
      filePath: options.filePath,
      baseVersion: options.baseVersion,
      baseSha256: options.baseSha256,
      explanation: options.explanation,
      hunks,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Applies approved hunks to currentContent.
   * Handles line offset adjustments and exact/fuzzy context matching.
   */
  static applyHunks(
    currentContent: string,
    hunks: PatchHunk[]
  ): { success: boolean; newContent: string; appliedCount: number; errors: string[] } {
    const lines = currentContent.split('\n');
    const errors: string[] = [];
    let appliedCount = 0;

    // Filter accepted hunks and sort them by oldStartLine descending so line shifts do not disrupt preceding hunks
    const acceptedHunks = hunks
      .filter(h => h.status === 'accepted')
      .sort((a, b) => b.oldStartLine - a.oldStartLine);

    if (acceptedHunks.length === 0) {
      return { success: true, newContent: currentContent, appliedCount: 0, errors: [] };
    }

    for (const hunk of acceptedHunks) {
      const matchIndex = this.findHunkLocation(lines, hunk);

      if (matchIndex === -1) {
        errors.push(
          `Conflict on hunk #${hunk.hunkIndex + 1}: Target lines could not be reliably located.`
        );
        hunk.status = 'conflicted';
        continue;
      }

      // Splice replacement lines
      // Calculate how many lines in original target: hunk.oldLines.length
      const deleteCount = hunk.oldLines.length;
      lines.splice(matchIndex, deleteCount, ...hunk.newLines);
      appliedCount++;
    }

    return {
      success: errors.length === 0,
      newContent: lines.join('\n'),
      appliedCount,
      errors,
    };
  }

  /**
   * Locates the line index in `lines` where the hunk's oldLines start.
   * Employs exact line matching first, with sliding window fuzzy whitespace fallback.
   */
  private static findHunkLocation(lines: string[], hunk: PatchHunk): number {
    const targetOldLines = hunk.oldLines;
    const targetStart = Math.max(0, hunk.oldStartLine - 1);

    // If hunk is purely an insertion (no oldLines)
    if (targetOldLines.length === 0) {
      return Math.min(targetStart, lines.length);
    }

    // 1. Try exact line matching at expected position
    if (this.matchesAt(lines, targetStart, targetOldLines, false)) {
      return targetStart;
    }

    // 2. Search locally around expected position (+- 20 lines)
    const searchRadius = 20;
    const minStart = Math.max(0, targetStart - searchRadius);
    const maxStart = Math.min(lines.length - targetOldLines.length, targetStart + searchRadius);

    for (let offset = 1; offset <= searchRadius; offset++) {
      if (targetStart - offset >= 0 && this.matchesAt(lines, targetStart - offset, targetOldLines, false)) {
        return targetStart - offset;
      }
      if (targetStart + offset <= lines.length - targetOldLines.length && this.matchesAt(lines, targetStart + offset, targetOldLines, false)) {
        return targetStart + offset;
      }
    }

    // 3. Fallback: Fuzzy trimmed whitespace match across entire file
    for (let i = 0; i <= lines.length - targetOldLines.length; i++) {
      if (this.matchesAt(lines, i, targetOldLines, true)) {
        return i;
      }
    }

    return -1;
  }

  private static matchesAt(lines: string[], startIndex: number, target: string[], fuzzy: boolean): boolean {
    if (startIndex + target.length > lines.length) return false;
    for (let i = 0; i < target.length; i++) {
      const line = lines[startIndex + i];
      const targetLine = target[i];
      if (fuzzy) {
        if (line.trim() !== targetLine.trim()) return false;
      } else {
        if (line !== targetLine) return false;
      }
    }
    return true;
  }

  /**
   * Generates a unified diff string for preview
   */
  static createUnifiedDiff(originalContent: string, proposedContent: string, filePath: string): string {
    return Diff.createPatch(filePath, originalContent, proposedContent, 'original', 'proposed');
  }
}
