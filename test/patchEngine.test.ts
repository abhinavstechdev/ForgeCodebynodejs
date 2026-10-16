import { describe, it, expect } from 'vitest';
import { PatchEngine } from '../server/services/patchEngine.js';
import { computeSha256 } from '../server/utils/crypto.js';

describe('PatchEngine (Line-by-Line Surgical Diff Review)', () => {
  it('generates structured hunks for line modifications without rewriting entire file', () => {
    const original = `function add(a: number, b: number): number {
  return a + b;
}

function subtract(a: number, b: number): number {
  return a - b;
}
`;

    const proposed = `function add(a: number, b: number): number {
  // Add operation with logging
  console.log('Adding', a, b);
  return a + b;
}

function subtract(a: number, b: number): number {
  return a - b;
}
`;

    const hunks = PatchEngine.generateHunks(original, proposed, 'calc.ts');

    expect(hunks.length).toBe(1);
    expect(hunks[0].newLines).toContain("  console.log('Adding', a, b);");
    expect(hunks[0].oldStartLine).toBe(1);
  });

  it('applies accepted hunks correctly while preserving untouched lines', () => {
    const original = `line 1
line 2
line 3
line 4
line 5
`;

    const proposed = `line 1
line 2 MODIFIED
line 3
line 4 MODIFIED
line 5
`;

    const proposal = PatchEngine.createProposal({
      projectId: 'test-proj',
      filePath: 'test.txt',
      baseVersion: 1,
      baseSha256: computeSha256(original),
      originalContent: original,
      proposedContent: proposed,
      explanation: 'Modify lines 2 and 4',
    });

    // Accept only the first hunk
    proposal.hunks[0].status = 'accepted';

    const result = PatchEngine.applyHunks(original, proposal.hunks);

    expect(result.success).toBe(true);
    expect(result.newContent).toContain('line 2 MODIFIED');
    expect(result.newContent).toContain('line 1');
    expect(result.newContent).toContain('line 3');
  });

  it('rejects hunk application when target context lines conflict', () => {
    const original = `const PORT = 3000;
const HOST = 'localhost';
`;

    const hunks = PatchEngine.generateHunks(
      original,
      `const PORT = 8080;\nconst HOST = 'localhost';\n`,
      'config.ts'
    );

    hunks[0].status = 'accepted';

    // Different concurrent content where target lines were completely removed
    const conflictedContent = `const APP_NAME = 'ForgeCode';\nconst VERSION = '1.0';\n`;

    const result = PatchEngine.applyHunks(conflictedContent, hunks);

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(hunks[0].status).toBe('conflicted');
  });

  it('creates unified diff representation accurately', () => {
    const original = `console.log("hello");\n`;
    const modified = `console.log("hello world");\n`;
    const diff = PatchEngine.createUnifiedDiff(original, modified, 'index.ts');

    expect(diff).toContain('-console.log("hello");');
    expect(diff).toContain('+console.log("hello world");');
  });
});
