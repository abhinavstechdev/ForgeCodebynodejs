import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';
import { GitService } from '../server/services/gitService.js';
import { GitLockManager } from '../server/services/gitLockManager.js';
import { GitError } from '../server/utils/gitError.js';
import { McpToolsHandler, McpContext } from '../server/mcp/tools.js';
import { GitHubService } from '../server/services/githubService.js';
import { scrubSecrets } from '../server/utils/secretScrubber.js';
import { prisma } from '../server/db/prisma.js';

describe('Smart Git Sync & Complete Git Access Test Suite', { timeout: 30000 }, () => {
  let testDir: string;
  let testProjectId: string;
  let testUserId: string;

  beforeAll(async () => {
    testDir = path.join(os.tmpdir(), `forgecode-git-test-${Date.now()}`);
    await fsp.mkdir(testDir, { recursive: true });
    process.env.STORAGE_LOCAL_DIR = testDir;

    // Create a disposable user and project in database
    const user = await prisma.user.create({
      data: {
        email: `gittest-${Date.now()}@example.com`,
        name: 'Git Tester',
        passwordHash: 'dummy-hash',
      },
    });
    testUserId = user.id;

    const project = await prisma.project.create({
      data: {
        ownerId: user.id,
        name: 'Git Test Project',
        slug: `git-test-${Date.now()}`,
        storageDriver: 'postgres',
        storagePrefix: `workspaces/git-test-${Date.now()}`,
      },
    });
    testProjectId = project.id;
  });

  afterAll(async () => {
    // Cleanup temporary workspace files and database records
    try {
      await fsp.rm(testDir, { recursive: true, force: true });
    } catch {}

    try {
      if (testProjectId) {
        await prisma.projectFile.deleteMany({ where: { projectId: testProjectId } });
        await prisma.project.delete({ where: { id: testProjectId } });
      }
      if (testUserId) {
        await prisma.user.delete({ where: { id: testUserId } });
      }
    } catch {}
  });

  // -------------------------------------------------------------
  // 1. Git Status & Working Tree Classification
  // -------------------------------------------------------------
  describe('Git Status Inspection', () => {
    it('initializes repository and detects clean status on new project', async () => {
      const status = await GitService.getStatus(testProjectId);
      expect(status.isRepo).toBe(true);
      expect(status.currentBranch).toBe('main');
      expect(status.workingTreeClean).toBe(true);
      expect(status.staged).toHaveLength(0);
      expect(status.unstaged).toHaveLength(0);
      expect(status.untracked).toHaveLength(0);
    });

    it('detects untracked files', async () => {
      const workDir = await GitService.getProjectWorkingDir(testProjectId);
      await fsp.writeFile(path.join(workDir, 'untracked.txt'), 'hello untracked');

      const status = await GitService.getStatus(testProjectId);
      expect(status.workingTreeClean).toBe(false);
      expect(status.untracked).toContain('untracked.txt');
    });

    it('detects staged changes', async () => {
      await GitService.stageFile(testProjectId, 'untracked.txt');

      const status = await GitService.getStatus(testProjectId);
      expect(status.workingTreeClean).toBe(false);
      expect(status.staged).toContain('untracked.txt');
    });

    it('creates commit and confirms clean status', async () => {
      const commitRes = await GitService.commit(testProjectId, 'Initial test commit');
      expect(commitRes.commitHash).toBeDefined();
      expect(commitRes.commitHash.length).toBe(40);

      const status = await GitService.getStatus(testProjectId);
      expect(status.workingTreeClean).toBe(true);
      expect(status.headCommit).toBe(commitRes.commitHash);
      expect(status.staged).toHaveLength(0);
    });

    it('detects modified unstaged files and deletions', async () => {
      const workDir = await GitService.getProjectWorkingDir(testProjectId);
      // Modify file
      await fsp.writeFile(path.join(workDir, 'untracked.txt'), 'modified content');
      // Add another and commit then delete
      await fsp.writeFile(path.join(workDir, 'to-delete.txt'), 'goodbye');
      await GitService.stageFile(testProjectId, 'to-delete.txt');
      await GitService.commit(testProjectId, 'Add file to delete');
      await fsp.unlink(path.join(workDir, 'to-delete.txt'));

      const status = await GitService.getStatus(testProjectId);
      expect(status.unstaged).toContain('untracked.txt');
      expect(status.deleted).toContain('to-delete.txt');
      expect(status.workingTreeClean).toBe(false);

      // Stage all changes (both update and deletion) and commit so working tree is clean
      await GitService.stageAll(testProjectId);
      await GitService.commit(testProjectId, 'Update untracked.txt and commit deletion');

      const finalStatus = await GitService.getStatus(testProjectId);
      expect(finalStatus.workingTreeClean).toBe(true);
    });

    it('detects in-progress operations (merge and rebase)', async () => {
      const workDir = await GitService.getProjectWorkingDir(testProjectId);
      const mergeHeadFile = path.join(workDir, '.git', 'MERGE_HEAD');
      await fsp.writeFile(mergeHeadFile, 'dummy-merge-oid');

      const statusWithMerge = await GitService.getStatus(testProjectId);
      expect(statusWithMerge.operationInProgress).toBe('merge');

      await fsp.unlink(mergeHeadFile);

      // Rebase in progress detection
      const rebaseDir = path.join(workDir, '.git', 'rebase-merge');
      await fsp.mkdir(rebaseDir, { recursive: true });

      const statusWithRebase = await GitService.getStatus(testProjectId);
      expect(statusWithRebase.operationInProgress).toBe('rebase');

      await fsp.rm(rebaseDir, { recursive: true, force: true });
    });
  });

  // -------------------------------------------------------------
  // 2. Git Diff & History
  // -------------------------------------------------------------
  describe('Git Diff & History Inspection', () => {
    it('produces diff output with statistics', async () => {
      const workDir = await GitService.getProjectWorkingDir(testProjectId);
      await fsp.writeFile(path.join(workDir, 'untracked.txt'), 'line 1\nline 2\nline 3\n');

      const diffResult = await GitService.getDiff(testProjectId, { staged: false });
      expect(diffResult.diff).toContain('untracked.txt');
      expect(diffResult.insertions).toBeGreaterThanOrEqual(1);

      // Commit changes so working tree is clean
      await GitService.stageFile(testProjectId, 'untracked.txt');
      await GitService.commit(testProjectId, 'Commit untracked.txt updates');
    });

    it('scrubs API tokens and secrets from diff output', async () => {
      const workDir = await GitService.getProjectWorkingDir(testProjectId);
      const secretContent = 'API_KEY=ghp_SECRET_TOKEN_1234567890abcdef\nPASSWORD=supersecret';
      await fsp.writeFile(path.join(workDir, 'secret.env'), secretContent);

      const diffResult = await GitService.getDiff(testProjectId, { staged: false });
      expect(diffResult.diff).not.toContain('ghp_SECRET_TOKEN_1234567890abcdef');
      expect(diffResult.diff).toContain('[REDACTED_SECRET]');

      await fsp.unlink(path.join(workDir, 'secret.env'));
    });

    it('retrieves commit history with parent hashes and messages', async () => {
      const history = await GitService.getHistory(testProjectId, { maxCount: 10 });
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBeGreaterThan(0);
      expect(history[0].hash).toBeDefined();
      expect(history[0].message).toBeDefined();
      expect(history[0].author).toBeDefined();
    });

    it('rejects empty commits', async () => {
      const status = await GitService.getStatus(testProjectId);
      expect(status.workingTreeClean).toBe(true);

      await expect(
        GitService.commit(testProjectId, 'Empty commit should fail')
      ).rejects.toThrow(/No changes detected to commit/i);
    });
  });

  // -------------------------------------------------------------
  // 3. Branch Management
  // -------------------------------------------------------------
  describe('Branch Management', () => {
    it('lists branches and identifies current active branch', async () => {
      const summary = await GitService.branchList(testProjectId);
      expect(summary.current).toBe('main');
      expect(summary.branches.some(b => b.name === 'main' && b.current)).toBe(true);
    });

    it('creates a new branch and checks it out', async () => {
      const created = await GitService.branchCreate(testProjectId, 'feature/test-branch', undefined, true);
      expect(created.branch).toBe('feature/test-branch');
      expect(created.checkedOut).toBe(true);

      const summary = await GitService.branchList(testProjectId);
      expect(summary.current).toBe('feature/test-branch');
    });

    it('rejects invalid branch names with INVALID_PARAMETER error code', async () => {
      await expect(
        GitService.branchCreate(testProjectId, 'invalid branch with spaces')
      ).rejects.toThrow(GitError);

      try {
        await GitService.branchCreate(testProjectId, 'invalid..branch');
      } catch (err: any) {
        expect(err.code).toBe('INVALID_PARAMETER');
      }
    });

    it('switches branches safely and prevents deletion of current branch', async () => {
      // Switch back to main
      await GitService.branchSwitch(testProjectId, 'main');
      const summary = await GitService.branchList(testProjectId);
      expect(summary.current).toBe('main');

      // Attempt to delete current branch 'main'
      await expect(
        GitService.branchDelete(testProjectId, 'main')
      ).rejects.toThrow(/currently checked out/i);

      // Successfully delete feature branch
      const deleted = await GitService.branchDelete(testProjectId, 'feature/test-branch');
      expect(deleted.deleted).toBe('feature/test-branch');
    });

    it('refuses branch switch when working tree has uncommitted changes', async () => {
      // Create a second branch
      await GitService.branchCreate(testProjectId, 'test-branch-2', undefined, false);

      const workDir = await GitService.getProjectWorkingDir(testProjectId);
      await fsp.writeFile(path.join(workDir, 'dirty.txt'), 'dirty content');
      await GitService.stageFile(testProjectId, 'dirty.txt');

      // Switching should fail with WORKING_TREE_DIRTY
      await expect(
        GitService.branchSwitch(testProjectId, 'test-branch-2')
      ).rejects.toThrow(GitError);

      // Clean up
      await GitService.commit(testProjectId, 'Commit dirty.txt');
      await GitService.branchDelete(testProjectId, 'test-branch-2');
    });
  });

  // -------------------------------------------------------------
  // 4. Git Concurrency Lock Manager
  // -------------------------------------------------------------
  describe('Git Concurrency Lock Manager', () => {
    it('blocks concurrent operations with OPERATION_IN_PROGRESS', async () => {
      let releaseOp1: () => void = () => {};
      const op1Promise = new Promise<void>(resolve => {
        releaseOp1 = resolve;
      });

      const op1 = GitLockManager.withLock(testProjectId, 'longOp', async () => {
        await op1Promise;
        return 'op1-done';
      });

      // op2 attempted while op1 holds lock
      await expect(
        GitLockManager.withLock(testProjectId, 'conflictingOp', async () => 'op2')
      ).rejects.toThrow(GitError);

      try {
        await GitLockManager.withLock(testProjectId, 'conflictingOp', async () => 'op2');
      } catch (err: any) {
        expect(err.code).toBe('OPERATION_IN_PROGRESS');
      }

      // Now release op1 and ensure op1 finishes and lock is released
      releaseOp1();
      const res = await op1;
      expect(res).toBe('op1-done');
      expect(GitLockManager.isLocked(testProjectId)).toBe(false);
    });

    it('guarantees lock release even if operation throws an error', async () => {
      await expect(
        GitLockManager.withLock(testProjectId, 'failingOp', async () => {
          throw new Error('Forced lock failure');
        })
      ).rejects.toThrow('Forced lock failure');

      // Next operation must be able to acquire lock immediately
      const nextOp = await GitLockManager.withLock(testProjectId, 'nextOp', async () => {
        return 'lock-released-successfully';
      });
      expect(nextOp).toBe('lock-released-successfully');
    });

    it('supports re-entrant locks within the same asynchronous execution chain', async () => {
      const nestedResult = await GitLockManager.withLock(testProjectId, 'outerPush', async () => {
        // Outer lock is held as 'outerPush'
        const commitResult = await GitLockManager.withLock(testProjectId, 'innerCommit', async () => {
          // Inner lock call succeeds because it is in the same async context
          const stageResult = await GitLockManager.withLock(testProjectId, 'innerStage', async () => {
            return 'staged';
          });
          return `committed-${stageResult}`;
        });
        return `pushed-${commitResult}`;
      });

      expect(nestedResult).toBe('pushed-committed-staged');
      expect(GitLockManager.isLocked(testProjectId)).toBe(false);
    });

    it('manually unlocks repository via forceUnlock', async () => {
      // Artificially simulate an active lock
      await GitLockManager.withLock(testProjectId, 'testOp', async () => {
        expect(GitLockManager.isLocked(testProjectId)).toBe(true);
        const unlocked = GitLockManager.forceUnlock(testProjectId);
        expect(unlocked).toBe(true);
        expect(GitLockManager.isLocked(testProjectId)).toBe(false);
      });
    });
  });

  // -------------------------------------------------------------
  // 5. Smart Git Sync Engine
  // -------------------------------------------------------------
  describe('Smart Git Sync Engine', () => {
    it('detects missing remote with REMOTE_NOT_FOUND error code', async () => {
      try {
        await GitService.sync(testProjectId, { remoteName: 'nonexistent-remote' });
        expect.fail('Should have thrown REMOTE_NOT_FOUND');
      } catch (err: any) {
        expect(err).toBeInstanceOf(GitError);
        expect(err.code).toBe('REMOTE_NOT_FOUND');
      }
    });

    it('refuses unsafe synchronization when working tree has uncommitted modifications', async () => {
      // Configure remote
      await GitService.setRemote(testProjectId, 'https://github.com/example/repo.git', 'origin');

      const workDir = await GitService.getProjectWorkingDir(testProjectId);
      await fsp.writeFile(path.join(workDir, 'uncommitted.txt'), 'dirty sync test');

      try {
        await GitService.sync(testProjectId, { strategy: 'safe' });
        expect.fail('Should have thrown WORKING_TREE_DIRTY');
      } catch (err: any) {
        expect(err).toBeInstanceOf(GitError);
        expect(err.code).toBe('WORKING_TREE_DIRTY');
      }

      // Safe auto-commit with commitMessage option allows sync to proceed safely
      const autoCommitResult = await GitService.sync(testProjectId, {
        dryRun: true,
        commitMessage: 'Auto-staged changes before sync',
      });
      expect(autoCommitResult.success).toBe(true);
      expect(autoCommitResult.warnings?.some(w => w.includes('Auto-staged') || w.includes('Dry run'))).toBe(true);

      // Clean up
      await fsp.unlink(path.join(workDir, 'uncommitted.txt'));
    });

    it('performs dry-run synchronization without modifying repository', async () => {
      const result = await GitService.sync(testProjectId, {
        dryRun: true,
        strategy: 'safe',
      });

      expect(result.success).toBe(true);
      expect(result.strategy).toBe('safe');
      expect(result.fetchCompleted).toBe(true);
      expect(result.pushAttempted).toBe(false);
      expect(result.message).toContain('[Dry Run]');
    });
  });

  // -------------------------------------------------------------
  // 6. MCP Permissions & Scopes Authorization
  // -------------------------------------------------------------
  describe('MCP Permissions & Authorization Scopes', () => {
    it('enforces git:read scope for inspection tools (git_status, git_diff, git_history)', async () => {
      const noScopeCtx: McpContext = {
        userId: testUserId,
        tokenId: 'token-no-scope',
        scopes: ['files:read'],
        defaultProjectId: testProjectId,
      };

      await expect(
        McpToolsHandler.gitStatus(noScopeCtx, { projectId: testProjectId })
      ).rejects.toThrow(/Missing required MCP scope 'git:read'/);

      await expect(
        McpToolsHandler.gitDiff(noScopeCtx, { projectId: testProjectId })
      ).rejects.toThrow(/Missing required MCP scope 'git:read'/);

      await expect(
        McpToolsHandler.gitHistory(noScopeCtx, { projectId: testProjectId })
      ).rejects.toThrow(/Missing required MCP scope 'git:read'/);
    });

    it('allows inspection tools when git:read scope is granted', async () => {
      const readScopeCtx: McpContext = {
        userId: testUserId,
        tokenId: 'token-read-scope',
        scopes: ['git:read'],
        defaultProjectId: testProjectId,
      };

      const status = await McpToolsHandler.gitStatus(readScopeCtx, { projectId: testProjectId });
      expect(status.isRepo).toBe(true);

      const history = await McpToolsHandler.gitHistory(readScopeCtx, { projectId: testProjectId });
      expect(Array.isArray(history)).toBe(true);
    });

    it('enforces git:write or git:commit scope for mutating operations', async () => {
      const readOnlyCtx: McpContext = {
        userId: testUserId,
        tokenId: 'token-read-only',
        scopes: ['git:read'],
        defaultProjectId: testProjectId,
      };

      await expect(
        McpToolsHandler.gitCommit(readOnlyCtx, { projectId: testProjectId, message: 'Test commit' })
      ).rejects.toThrow(/Missing required MCP scope/);

      await expect(
        McpToolsHandler.gitPush(readOnlyCtx, { projectId: testProjectId })
      ).rejects.toThrow(/Missing required MCP scope/);

      await expect(
        McpToolsHandler.gitSync(readOnlyCtx, { projectId: testProjectId })
      ).rejects.toThrow(/Missing required MCP scope/);
    });

    it('allows mutating operations when git:write scope is present', async () => {
      const writeScopeCtx: McpContext = {
        userId: testUserId,
        tokenId: 'token-write-scope',
        scopes: ['git:read', 'git:write'],
        defaultProjectId: testProjectId,
      };

      const syncResult = await McpToolsHandler.gitSync(writeScopeCtx, {
        projectId: testProjectId,
        dryRun: true,
      });
      expect(syncResult.success).toBe(true);
    });
  });

  // -------------------------------------------------------------
  // 7. GitHub Integration & Security
  // -------------------------------------------------------------
  describe('GitHub Integration & Credentials Protection', () => {
    it('validates GitHub token and returns diagnostic details or handles missing auth gracefully', async () => {
      // With invalid/expired token, must throw GIT_PERMISSION_DENIED
      try {
        await GitHubService.checkAuth('ghp_invalid_dummy_token_12345');
        expect.fail('Should have failed authentication');
      } catch (err: any) {
        expect(err).toBeInstanceOf(GitError);
        expect(err.code).toBe('GIT_PERMISSION_DENIED');
        // Ensure raw token is not exposed in error message
        expect(err.message).not.toContain('ghp_invalid_dummy_token_12345');
      }
    });

    it('scrubs sensitive credentials from error messages and logs', () => {
      const rawError = 'Failed to connect: https://ghp_0123456789abcdefghijklmnopqrstuvwxyz:x-oauth-basic@github.com/owner/repo.git';
      const scrubbed = scrubSecrets(rawError);
      expect(scrubbed).not.toContain('ghp_0123456789abcdefghijklmnopqrstuvwxyz');
      expect(scrubbed).toContain('[REDACTED_SECRET]');
    });
  });
});
