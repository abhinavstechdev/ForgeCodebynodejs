import git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import * as diff from 'diff';
import { prisma } from '../db/prisma.js';
import {
  GitStatusDetailed,
  GitCommitItem,
  GitDiffOptions,
  GitDiffResult,
  GitHistoryOptions,
  GitPushOptions,
  GitPushResult,
  GitSyncOptions,
  GitSyncResult,
  GitCloneOptions,
  GitBranchSummary,
  GitBranchItem,
} from '../../shared/types.js';
import { scrubSecrets } from '../utils/secretScrubber.js';
import { GitError } from '../utils/gitError.js';
import { GitLockManager } from './gitLockManager.js';
import { WorkspaceStorageAdapter } from './workspaceStorageAdapter.js';

export class GitService {
  /**
   * Resolves physical working directory on disk and syncs virtual DB files if needed.
   */
  static async getProjectWorkingDir(projectId: string): Promise<string> {
    const baseDir = path.resolve(process.env.STORAGE_LOCAL_DIR || './storage/workspaces');
    const projectDir = path.join(baseDir, projectId);
    await fsp.mkdir(projectDir, { recursive: true });

    // Sync database storage to physical disk working tree
    await WorkspaceStorageAdapter.syncStorageToDisk(projectId, projectDir);

    return projectDir;
  }

  /**
   * Ensures physical directory is an initialized Git repository.
   */
  static async ensureRepo(workDir: string): Promise<void> {
    const gitDir = path.join(workDir, '.git');
    const exists = await fsp.access(gitDir).then(() => true).catch(() => false);
    if (!exists) {
      await git.init({ fs, dir: workDir, defaultBranch: 'main' });
      // Set default local identity
      await git.setConfig({
        fs,
        dir: workDir,
        path: 'user.name',
        value: 'ForgeCode User',
      }).catch(() => {});
      await git.setConfig({
        fs,
        dir: workDir,
        path: 'user.email',
        value: 'user@forgecode.ai',
      }).catch(() => {});
    }
  }

  /**
   * Checks if a git operation (merge, rebase, cherry-pick, revert) is currently in progress.
   */
  private static async detectOperationInProgress(workDir: string): Promise<null | 'merge' | 'rebase' | 'cherry-pick' | 'revert'> {
    const gitDir = path.join(workDir, '.git');
    const hasMerge = await fsp.access(path.join(gitDir, 'MERGE_HEAD')).then(() => true).catch(() => false);
    if (hasMerge) return 'merge';

    const hasRebaseMerge = await fsp.access(path.join(gitDir, 'rebase-merge')).then(() => true).catch(() => false);
    const hasRebaseApply = await fsp.access(path.join(gitDir, 'rebase-apply')).then(() => true).catch(() => false);
    if (hasRebaseMerge || hasRebaseApply) return 'rebase';

    const hasCherryPick = await fsp.access(path.join(gitDir, 'CHERRY_PICK_HEAD')).then(() => true).catch(() => false);
    if (hasCherryPick) return 'cherry-pick';

    const hasRevert = await fsp.access(path.join(gitDir, 'REVERT_HEAD')).then(() => true).catch(() => false);
    if (hasRevert) return 'revert';

    return null;
  }

  // -------------------------------------------------------------
  // 1. Detailed Status Access
  // -------------------------------------------------------------

  static async getStatus(projectId: string): Promise<GitStatusDetailed> {
    const workDir = await this.getProjectWorkingDir(projectId);
    await this.ensureRepo(workDir);

    try {
      const matrix = await git.statusMatrix({ fs, dir: workDir });
      const staged: string[] = [];
      const unstaged: string[] = [];
      const untracked: string[] = [];
      const deleted: string[] = [];
      const conflicted: string[] = [];

      for (const [filepath, head, workdir, stage] of matrix) {
        if (filepath.startsWith('.git')) continue;

        // Conflict state in index
        if (head === 1 && workdir === 2 && stage === 3) {
          conflicted.push(filepath);
          continue;
        }

        // Deleted in worktree
        if (workdir === 0 && (head !== 0 || stage !== 0)) {
          deleted.push(filepath);
          if (stage === 0) {
            staged.push(filepath); // staged deletion
          } else {
            unstaged.push(filepath); // unstaged deletion
          }
          continue;
        }

        // Staged changes
        if (stage !== head && workdir !== 0) {
          staged.push(filepath);
        }

        // Untracked files
        if (head === 0 && stage === 0 && workdir === 2) {
          untracked.push(filepath);
        } else if (workdir !== stage && workdir !== 0) {
          // Unstaged modifications
          unstaged.push(filepath);
        }
      }

      // Current branch & HEAD
      let currentBranch = 'main';
      try {
        const b = await git.currentBranch({ fs, dir: workDir, fullname: false });
        if (b) currentBranch = b;
      } catch {
        currentBranch = 'main';
      }

      const headCommit = await git.resolveRef({ fs, dir: workDir, ref: 'HEAD' }).catch(() => null);

      // Remotes
      const remotesList = await git.listRemotes({ fs, dir: workDir });
      const remotes = remotesList.map(r => ({ name: r.remote, url: r.url }));

      // Upstream tracking branch & ahead / behind calculation
      let upstreamBranch: string | null = null;
      let ahead = 0;
      let behind = 0;

      const defaultRemote = remotesList[0]?.remote || 'origin';
      const remoteRef = `refs/remotes/${defaultRemote}/${currentBranch}`;
      const remoteHead = await git.resolveRef({ fs, dir: workDir, ref: remoteRef }).catch(() => null);

      if (remoteHead) {
        upstreamBranch = `${defaultRemote}/${currentBranch}`;
        if (headCommit && headCommit !== remoteHead) {
          const mergeBase = await git.findMergeBase({ fs, dir: workDir, oids: [headCommit, remoteHead] }).catch(() => []);
          const baseOid = mergeBase[0];

          if (baseOid === remoteHead) {
            // Local is ahead of remote
            const localLogs = await git.log({ fs, dir: workDir, ref: headCommit, depth: 50 }).catch(() => []);
            ahead = localLogs.findIndex(c => c.oid === baseOid);
            if (ahead === -1) ahead = localLogs.length;
          } else if (baseOid === headCommit) {
            // Remote is ahead of local
            const remoteLogs = await git.log({ fs, dir: workDir, ref: remoteHead, depth: 50 }).catch(() => []);
            behind = remoteLogs.findIndex(c => c.oid === baseOid);
            if (behind === -1) behind = remoteLogs.length;
          } else if (baseOid) {
            // Diverged
            const localLogs = await git.log({ fs, dir: workDir, ref: headCommit, depth: 50 }).catch(() => []);
            const remoteLogs = await git.log({ fs, dir: workDir, ref: remoteHead, depth: 50 }).catch(() => []);
            ahead = localLogs.findIndex(c => c.oid === baseOid);
            if (ahead === -1) ahead = localLogs.length;
            behind = remoteLogs.findIndex(c => c.oid === baseOid);
            if (behind === -1) behind = remoteLogs.length;
          }
        }
      }

      const operationInProgress = await this.detectOperationInProgress(workDir);
      const workingTreeClean = staged.length === 0 && unstaged.length === 0 && untracked.length === 0 && deleted.length === 0 && conflicted.length === 0;

      return {
        isRepo: true,
        currentBranch,
        headCommit,
        upstreamBranch,
        staged,
        unstaged,
        untracked,
        deleted,
        renamed: [],
        conflicted,
        repositoryRoot: workDir,
        remotes,
        ahead,
        behind,
        workingTreeClean,
        operationInProgress,
      };
    } catch (err: any) {
      throw new GitError('GIT_OPERATION_FAILED', `Failed to retrieve repository status: ${err.message}`);
    }
  }

  // -------------------------------------------------------------
  // 2. Diff with Pagination, Stats & Secret Scrubbing
  // -------------------------------------------------------------

  static async getDiff(projectId: string, options: GitDiffOptions = {}): Promise<GitDiffResult> {
    const workDir = await this.getProjectWorkingDir(projectId);
    await this.ensureRepo(workDir);

    const maxLines = options.maxLines || 1000;

    try {
      const matrix = await git.statusMatrix({ fs, dir: workDir });
      let fullDiff = '';
      let filesChanged = 0;
      let totalInsertions = 0;
      let totalDeletions = 0;

      let baseOid: string | null = options.fromRevision || null;
      if (!baseOid) {
        baseOid = await git.resolveRef({ fs, dir: workDir, ref: 'HEAD' }).catch(() => null);
      }

      for (const [filepath, head, workdir, stage] of matrix) {
        if (filepath.startsWith('.git')) continue;
        if (options.filePath && filepath !== options.filePath) continue;

        if (options.staged && stage === head) continue;
        if (!options.staged && !options.fromRevision && workdir === stage) continue;

        let oldContent = '';
        let newContent = '';

        if (baseOid) {
          try {
            const { blob } = await git.readBlob({ fs, dir: workDir, oid: baseOid, filepath });
            oldContent = Buffer.from(blob).toString('utf8');
          } catch {
            oldContent = '';
          }
        }

        if (options.toRevision) {
          try {
            const { blob } = await git.readBlob({ fs, dir: workDir, oid: options.toRevision, filepath });
            newContent = Buffer.from(blob).toString('utf8');
          } catch {
            newContent = '';
          }
        } else {
          const fullPath = path.join(workDir, filepath);
          try {
            newContent = await fsp.readFile(fullPath, 'utf8');
          } catch {
            newContent = '';
          }
        }

        if (oldContent === newContent) continue;

        const filePatch = diff.createTwoFilesPatch(
          `a/${filepath}`,
          `b/${filepath}`,
          oldContent,
          newContent,
          baseOid ? baseOid.slice(0, 8) : 'base',
          options.toRevision ? options.toRevision.slice(0, 8) : 'working'
        );

        fullDiff += filePatch + '\n';
        filesChanged++;

        // Calculate insertions & deletions
        const patchLines = filePatch.split('\n');
        for (const line of patchLines) {
          if (line.startsWith('+') && !line.startsWith('+++')) totalInsertions++;
          if (line.startsWith('-') && !line.startsWith('---')) totalDeletions++;
        }
      }

      // Check max lines limit & truncate if necessary
      const lines = fullDiff.split('\n');
      let truncated = false;
      let finalDiff = fullDiff;

      if (lines.length > maxLines) {
        finalDiff = lines.slice(0, maxLines).join('\n') + `\n\n... [Diff truncated: showing ${maxLines} of ${lines.length} lines]`;
        truncated = true;
      }

      // Scrutinize and scrub secrets
      finalDiff = scrubSecrets(finalDiff);

      return {
        diff: finalDiff.trim(),
        truncated,
        filesChanged,
        insertions: totalInsertions,
        deletions: totalDeletions,
      };
    } catch (err: any) {
      throw new GitError('GIT_OPERATION_FAILED', `Failed to generate diff: ${err.message}`);
    }
  }

  // -------------------------------------------------------------
  // 3. Complete History Access
  // -------------------------------------------------------------

  static async getHistory(projectId: string, options: GitHistoryOptions = {}): Promise<GitCommitItem[]> {
    const workDir = await this.getProjectWorkingDir(projectId);
    await this.ensureRepo(workDir);

    const maxCount = options.maxCount || 20;

    try {
      const depth = options.fromRevision && options.toRevision ? 100 : maxCount;
      const ref = options.toRevision || options.branch || 'HEAD';

      const logs = await git.log({
        fs,
        dir: workDir,
        ref,
        depth,
        filepath: options.filePath,
      }).catch(() => []);

      let filteredLogs = logs;
      if (options.fromRevision) {
        const fromIdx = logs.findIndex(l => l.oid === options.fromRevision);
        if (fromIdx !== -1) {
          filteredLogs = logs.slice(0, fromIdx);
        }
      }

      return filteredLogs.slice(0, maxCount).map(l => ({
        hash: l.oid,
        message: l.commit.message,
        author: l.commit.author.name,
        authorEmail: l.commit.author.email,
        date: new Date(l.commit.author.timestamp * 1000).toISOString(),
        parentHashes: l.commit.parent || [],
      }));
    } catch (err: any) {
      throw new GitError('GIT_OPERATION_FAILED', `Failed to retrieve commit history: ${err.message}`);
    }
  }

  // -------------------------------------------------------------
  // 4. Staging & Commit
  // -------------------------------------------------------------

  static async stageFile(projectId: string, filePath: string): Promise<void> {
    return await GitLockManager.withLock(projectId, 'stageFile', async () => {
      const workDir = await this.getProjectWorkingDir(projectId);
      await this.ensureRepo(workDir);

      const normPath = filePath.replace(/^[/\\]+/, '').replace(/\\/g, '/');
      const fullPath = path.join(workDir, normPath);
      const exists = await fsp.access(fullPath).then(() => true).catch(() => false);
      if (exists) {
        await git.add({ fs, dir: workDir, filepath: normPath });
      } else {
        await git.remove({ fs, dir: workDir, filepath: normPath }).catch(() => {});
      }
    });
  }

  static async stageAll(projectId: string): Promise<void> {
    return await GitLockManager.withLock(projectId, 'stageAll', async () => {
      const workDir = await this.getProjectWorkingDir(projectId);
      await this.ensureRepo(workDir);

      const matrix = await git.statusMatrix({ fs, dir: workDir });
      for (const [filepath, head, workdir, stage] of matrix) {
        if (filepath.startsWith('.git')) continue;
        if (workdir === 0) {
          await git.remove({ fs, dir: workDir, filepath }).catch(() => {});
        } else {
          await git.add({ fs, dir: workDir, filepath }).catch(() => {});
        }
      }
    });
  }

  static async unstageFile(projectId: string, filePath: string): Promise<void> {
    return await GitLockManager.withLock(projectId, 'unstageFile', async () => {
      const workDir = await this.getProjectWorkingDir(projectId);
      await this.ensureRepo(workDir);

      const normPath = filePath.replace(/^[/\\]+/, '').replace(/\\/g, '/');
      await git.resetIndex({ fs, dir: workDir, filepath: normPath });
    });
  }

  static async commit(
    projectId: string,
    message: string,
    authorName?: string,
    authorEmail?: string
  ): Promise<{ commitHash: string; branch: string }> {
    return await GitLockManager.withLock(projectId, 'commit', async () => {
      const workDir = await this.getProjectWorkingDir(projectId);
      await this.ensureRepo(workDir);

      if (!message || !message.trim()) {
        throw new GitError('INVALID_PARAMETER', 'Commit message cannot be empty.');
      }

      const matrix = await git.statusMatrix({ fs, dir: workDir });
      const hasStaged = matrix.some(([filepath, head, workdir, stage]) => !filepath.startsWith('.git') && stage !== head);

      // Auto-stage all modified & untracked files if nothing is staged
      if (!hasStaged) {
        let filesStaged = 0;
        for (const [filepath, head, workdir, stage] of matrix) {
          if (filepath.startsWith('.git')) continue;
          if (workdir === 0) {
            await git.remove({ fs, dir: workDir, filepath }).catch(() => {});
            filesStaged++;
          } else if (workdir === 2) {
            await git.add({ fs, dir: workDir, filepath }).catch(() => {});
            filesStaged++;
          }
        }
        if (filesStaged === 0) {
          throw new GitError('GIT_OPERATION_FAILED', 'No changes detected to commit.');
        }
      }

      const commitHash = await git.commit({
        fs,
        dir: workDir,
        message: message.trim(),
        author: {
          name: authorName || 'ForgeCode User',
          email: authorEmail || 'user@forgecode.ai',
        },
      });

      let branch = 'main';
      try {
        const b = await git.currentBranch({ fs, dir: workDir, fullname: false });
        if (b) branch = b;
      } catch {
        branch = 'main';
      }

      return { commitHash, branch };
    });
  }

  // -------------------------------------------------------------
  // 5. Remote Management
  // -------------------------------------------------------------

  static async getRemotes(projectId: string): Promise<Array<{ name: string; url: string }>> {
    const workDir = await this.getProjectWorkingDir(projectId);
    await this.ensureRepo(workDir);
    const remotes = await git.listRemotes({ fs, dir: workDir });
    return remotes.map(r => ({ name: r.remote, url: r.url }));
  }

  static async setRemote(projectId: string, url: string, name = 'origin'): Promise<void> {
    return await GitLockManager.withLock(projectId, 'setRemote', async () => {
      const workDir = await this.getProjectWorkingDir(projectId);
      await this.ensureRepo(workDir);

      const sanitizedUrl = url.trim().replace(/^https?:\/\/[^@]+@/, 'https://');
      await git.deleteRemote({ fs, dir: workDir, remote: name }).catch(() => {});
      await git.addRemote({ fs, dir: workDir, remote: name, url: sanitizedUrl });
    });
  }

  // -------------------------------------------------------------
  // 6. Push with Non-Fast-Forward Protection
  // -------------------------------------------------------------

  static async push(
    projectId: string,
    options: GitPushOptions = {}
  ): Promise<GitPushResult> {
    return await GitLockManager.withLock(projectId, 'push', async () => {
      const workDir = await this.getProjectWorkingDir(projectId);
      await this.ensureRepo(workDir);
      const remoteName = options.remoteName || 'origin';

      if (options.commitMessage) {
        const status = await this.getStatus(projectId);
        if (!status.workingTreeClean) {
          await this.commit(projectId, options.commitMessage, options.authorName, options.authorEmail);
        }
      }

      // Check at least one commit exists
      let logs = await git.log({ fs, dir: workDir, depth: 1 }).catch(() => []);
      if (!logs || logs.length === 0) {
        await this.stageAll(projectId);
        await this.commit(
          projectId,
          options.commitMessage || 'Initial commit from ForgeCode AI',
          options.authorName,
          options.authorEmail
        );
        logs = await git.log({ fs, dir: workDir, depth: 1 }).catch(() => []);
      }

      let branch = options.branch;
      if (!branch) {
        branch = (await git.currentBranch({ fs, dir: workDir, fullname: false }).catch(() => null)) || 'main';
      }

      await git.branch({ fs, dir: workDir, ref: branch, checkout: true }).catch(() => {});

      if (options.remoteUrl) {
        await this.setRemote(projectId, options.remoteUrl, remoteName);
      }

      const remotes = await git.listRemotes({ fs, dir: workDir });
      const targetRemote = remotes.find(r => r.remote === remoteName);
      const targetUrl = targetRemote?.url || options.remoteUrl;

      if (!targetUrl) {
        throw new GitError(
          'REMOTE_NOT_FOUND',
          `No remote Git repository URL configured for '${remoteName}'. Provide remoteUrl or configure an origin remote.`
        );
      }

      const token = options.token || process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

      // Check if remote is ahead and non-fast-forward push would be rejected
      const status = await this.getStatus(projectId);
      if (status.behind > 0 && !options.force) {
        throw new GitError(
          'NON_FAST_FORWARD',
          `Push rejected: Remote branch '${branch}' has ${status.behind} commits that local branch does not have. Run git_sync or git_pull before pushing, or enable force push if you intend to overwrite remote history.`
        );
      }

      try {
        const pushResult = await git.push({
          fs,
          http,
          dir: workDir,
          remote: remoteName,
          ref: branch,
          force: Boolean(options.force),
          onAuth: () => ({ username: token || '' }),
        });

        if (pushResult && pushResult.ok === false) {
          throw new GitError('GIT_OPERATION_FAILED', pushResult.error || 'Push was rejected by remote server');
        }

        const latestLog = await git.log({ fs, dir: workDir, depth: 1 }).catch(() => []);
        const commitHash = latestLog[0]?.oid || '';

        return {
          success: true,
          branch,
          remote: targetUrl,
          pushed: true,
          commitHash,
          message: `Successfully pushed branch '${branch}' to ${targetUrl}`,
        };
      } catch (err: any) {
        const cleanError = scrubSecrets(err?.message || 'Git push encountered an unknown error');
        if (err instanceof GitError) throw err;
        throw new GitError('GIT_OPERATION_FAILED', `Git push failed: ${cleanError}`);
      }
    });
  }

  // -------------------------------------------------------------
  // 7. Fetch & Pull
  // -------------------------------------------------------------

  static async fetch(
    projectId: string,
    options: { remoteName?: string; branch?: string; token?: string; prune?: boolean } = {}
  ): Promise<{ remote: string; branch: string; fetched: boolean }> {
    return await GitLockManager.withLock(projectId, 'fetch', async () => {
      const workDir = await this.getProjectWorkingDir(projectId);
      await this.ensureRepo(workDir);

      const remoteName = options.remoteName || 'origin';
      const remotes = await git.listRemotes({ fs, dir: workDir });
      const targetRemote = remotes.find(r => r.remote === remoteName);

      if (!targetRemote || !targetRemote.url) {
        throw new GitError('REMOTE_NOT_FOUND', `Remote '${remoteName}' does not exist.`);
      }

      const token = options.token || process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
      const branch = options.branch || (await git.currentBranch({ fs, dir: workDir, fullname: false })) || 'main';

      try {
        await git.fetch({
          fs,
          http,
          dir: workDir,
          remote: remoteName,
          ref: branch,
          prune: options.prune || false,
          onAuth: () => ({ username: token || '' }),
        });

        return {
          remote: targetRemote.url,
          branch,
          fetched: true,
        };
      } catch (err: any) {
        const cleanMessage = scrubSecrets(err.message || 'Fetch failed');
        throw new GitError('GIT_OPERATION_FAILED', `Git fetch failed: ${cleanMessage}`);
      }
    });
  }

  static async pull(
    projectId: string,
    options: { remoteName?: string; branch?: string; token?: string; strategy?: 'safe' | 'ff-only' | 'merge' } = {}
  ): Promise<{ success: boolean; branch: string; updatedHead: string; message: string }> {
    return await GitLockManager.withLock(projectId, 'pull', async () => {
      const workDir = await this.getProjectWorkingDir(projectId);
      await this.ensureRepo(workDir);

      // Verify working tree is clean to avoid losing uncommitted changes
      const status = await this.getStatus(projectId);
      if (!status.workingTreeClean) {
        throw new GitError(
          'WORKING_TREE_DIRTY',
          'Cannot pull: Your working tree has uncommitted changes. Commit or stage your changes before pulling.'
        );
      }

      const remoteName = options.remoteName || 'origin';
      const branch = options.branch || status.currentBranch || 'main';
      const token = options.token || process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
      const strategy = options.strategy || 'safe';

      // 1. Fetch latest remote commits
      await git.fetch({
        fs,
        http,
        dir: workDir,
        remote: remoteName,
        ref: branch,
        onAuth: () => ({ username: token || '' }),
      });

      const localHead = await git.resolveRef({ fs, dir: workDir, ref: branch });
      const remoteRef = `refs/remotes/${remoteName}/${branch}`;
      const remoteHead = await git.resolveRef({ fs, dir: workDir, ref: remoteRef });

      if (localHead === remoteHead) {
        return {
          success: true,
          branch,
          updatedHead: localHead,
          message: 'Already up to date.',
        };
      }

      const mergeBase = await git.findMergeBase({ fs, dir: workDir, oids: [localHead, remoteHead] });
      const baseOid = mergeBase[0];

      // Fast-forward check
      if (baseOid === localHead) {
        // Fast-forward
        await git.writeRef({
          fs,
          dir: workDir,
          ref: `refs/heads/${branch}`,
          value: remoteHead,
          force: true,
        });

        await git.checkout({
          fs,
          dir: workDir,
          ref: branch,
          force: true,
        });

        // Sync disk back to DB storage driver
        await WorkspaceStorageAdapter.syncDiskToStorage(projectId, workDir);

        return {
          success: true,
          branch,
          updatedHead: remoteHead,
          message: `Fast-forwarded '${branch}' to commit ${remoteHead.slice(0, 8)}.`,
        };
      }

      if (strategy === 'ff-only') {
        throw new GitError(
          'NON_FAST_FORWARD',
          `Cannot fast-forward: Local branch '${branch}' and remote have diverged. Use strategy 'merge' or run git_sync.`
        );
      }

      // Merge strategy
      try {
        const mergeResult = await git.merge({
          fs,
          dir: workDir,
          ours: branch,
          theirs: remoteRef,
          author: { name: 'ForgeCode User', email: 'user@forgecode.ai' },
        });

        await git.checkout({
          fs,
          dir: workDir,
          ref: branch,
          force: true,
        });

        await WorkspaceStorageAdapter.syncDiskToStorage(projectId, workDir);

        return {
          success: true,
          branch,
          updatedHead: mergeResult.oid || (await git.resolveRef({ fs, dir: workDir, ref: 'HEAD' })),
          message: `Successfully merged remote '${remoteName}/${branch}' into '${branch}'.`,
        };
      } catch (err: any) {
        if (err.name === 'MergeConflictError') {
          throw new GitError(
            'MERGE_CONFLICT',
            `Merge conflict detected while pulling: ${err.message}. Conflict markers preserved.`
          );
        }
        throw new GitError('GIT_OPERATION_FAILED', `Pull failed: ${err.message}`);
      }
    });
  }

  // -------------------------------------------------------------
  // 8. Smart Git Sync Engine
  // -------------------------------------------------------------

  static async sync(projectId: string, options: GitSyncOptions = {}): Promise<GitSyncResult> {
    return await GitLockManager.withLock(projectId, 'sync', async () => {
      const workDir = await this.getProjectWorkingDir(projectId);
      await this.ensureRepo(workDir);

      const remoteName = options.remoteName || 'origin';
      const strategy = options.strategy || 'safe';
      const dryRun = Boolean(options.dryRun);
      const token = options.token || process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
      const warnings: string[] = [];

      // Step 1-4: Validate state & detect in-progress operations
      const inProgress = await this.detectOperationInProgress(workDir);
      if (inProgress) {
        throw new GitError(
          'OPERATION_IN_PROGRESS',
          `Cannot synchronize: A Git ${inProgress} operation is currently in progress. Complete or abort it before syncing.`
        );
      }

      const status = await this.getStatus(projectId);
      const branch = options.branch || status.currentBranch || 'main';

      const remotes = await git.listRemotes({ fs, dir: workDir });
      const targetRemote = remotes.find(r => r.remote === remoteName);

      if (!targetRemote || !targetRemote.url) {
        throw new GitError(
          'REMOTE_NOT_FOUND',
          `Remote '${remoteName}' not configured on this repository. Configure a remote before syncing.`
        );
      }

      const initialHead = status.headCommit || '';

      // Check working tree dirtiness
      if (!status.workingTreeClean) {
        if (options.commitMessage) {
          if (!dryRun) {
            await this.commit(projectId, options.commitMessage);
          } else {
            warnings.push(`Dry run: Working tree has uncommitted modifications that would be committed with message: "${options.commitMessage}".`);
          }
        } else {
          throw new GitError(
            'WORKING_TREE_DIRTY',
            'Cannot safely synchronize: Your working tree contains uncommitted changes. Commit, stage, or provide commitMessage to synchronize safely without data loss.'
          );
        }
      }

      // Step 5: Fetch updates from selected remote
      let fetchCompleted = false;
      let remoteHead: string | undefined;

      try {
        if (!dryRun) {
          await git.fetch({
            fs,
            http,
            dir: workDir,
            remote: remoteName,
            ref: branch,
            onAuth: () => ({ username: token || '' }),
          });
          fetchCompleted = true;
        } else {
          fetchCompleted = true;
        }

        const remoteRef = `refs/remotes/${remoteName}/${branch}`;
        remoteHead = await git.resolveRef({ fs, dir: workDir, ref: remoteRef }).catch(() => undefined);
      } catch (err: any) {
        warnings.push(`Could not fetch from remote '${remoteName}': ${scrubSecrets(err.message)}`);
      }

      // Step 6-7: Compare local and remote branch histories
      let localHead = await git.resolveRef({ fs, dir: workDir, ref: branch }).catch(() => initialHead);
      let ahead = 0;
      let behind = 0;

      if (remoteHead && localHead) {
        if (localHead === remoteHead) {
          ahead = 0;
          behind = 0;
        } else {
          const mergeBase = await git.findMergeBase({ fs, dir: workDir, oids: [localHead, remoteHead] }).catch(() => []);
          const baseOid = mergeBase[0];

          if (baseOid === remoteHead) {
            ahead = 1; // local ahead
          } else if (baseOid === localHead) {
            behind = 1; // remote ahead
          } else {
            ahead = 1;
            behind = 1; // diverged
          }
        }
      }

      // Step 8-9: Choose safe synchronization strategy
      let mergeCompleted = false;
      let rebaseCompleted = false;
      const conflicts: string[] = [];

      if (!dryRun && remoteHead && behind > 0) {
        if (ahead === 0) {
          // Fast-forward
          await git.writeRef({
            fs,
            dir: workDir,
            ref: `refs/heads/${branch}`,
            value: remoteHead,
            force: true,
          });
          await git.checkout({
            fs,
            dir: workDir,
            ref: branch,
            force: true,
          });
          localHead = remoteHead;
        } else {
          // Diverged
          if (strategy === 'safe' || strategy === 'ff-only') {
            throw new GitError(
              'NON_FAST_FORWARD',
              `Histories have diverged: Local branch '${branch}' has commits that do not exist on '${remoteName}/${branch}', and remote has new commits. Choose strategy 'merge' or 'rebase' to reconcile.`
            );
          }

          if (strategy === 'merge') {
            try {
              const mergeResult = await git.merge({
                fs,
                dir: workDir,
                ours: branch,
                theirs: `refs/remotes/${remoteName}/${branch}`,
                author: { name: 'ForgeCode User', email: 'user@forgecode.ai' },
              });
              await git.checkout({
                fs,
                dir: workDir,
                ref: branch,
                force: true,
              });
              localHead = mergeResult.oid || (await git.resolveRef({ fs, dir: workDir, ref: 'HEAD' }));
              mergeCompleted = true;
            } catch (err: any) {
              if (err.name === 'MergeConflictError') {
                conflicts.push(err.message);
                throw new GitError('MERGE_CONFLICT', `Merge conflict during synchronization: ${err.message}`, {
                  conflicts: [err.message],
                });
              }
              throw err;
            }
          }
        }
      }

      // Step 11: Push if requested
      let pushAttempted = false;
      let pushCompleted = false;

      if (options.push) {
        pushAttempted = true;
        if (!dryRun) {
          await this.push(projectId, {
            remoteName,
            branch,
            force: options.force,
            token,
          });
          pushCompleted = true;
        } else {
          warnings.push(`Dry run: Push would be executed for branch '${branch}' to remote '${targetRemote.url}'.`);
        }
      }

      // Sync updated disk files to database storage
      if (!dryRun) {
        await WorkspaceStorageAdapter.syncDiskToStorage(projectId, workDir);
      }

      const finalStatus = await this.getStatus(projectId);

      return {
        success: true,
        projectId,
        remote: targetRemote.url,
        branch,
        initialHead,
        localHead,
        remoteHead,
        ahead: finalStatus.ahead,
        behind: finalStatus.behind,
        workingTreeClean: finalStatus.workingTreeClean || false,
        strategy,
        fetchCompleted,
        mergeCompleted,
        rebaseCompleted,
        pushAttempted,
        pushCompleted,
        conflicts: conflicts.length > 0 ? conflicts : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
        message: dryRun
          ? `[Dry Run] Analysis complete for '${branch}'. Clean: ${finalStatus.workingTreeClean}. Ahead: ${finalStatus.ahead}, Behind: ${finalStatus.behind}.`
          : `Smart synchronization complete for branch '${branch}'. Local HEAD is at ${localHead.slice(0, 8)}.`,
      };
    });
  }

  // -------------------------------------------------------------
  // 9. Clone Repository
  // -------------------------------------------------------------

  static async clone(options: GitCloneOptions): Promise<{ projectId: string; head: string; branch: string; directory: string }> {
    const rawUrl = options.repositoryUrl.trim();
    if (!rawUrl.startsWith('https://') && !rawUrl.startsWith('git@') && !rawUrl.startsWith('http://')) {
      throw new GitError('INVALID_PARAMETER', 'Invalid repository URL. Must be a valid HTTPS or Git repository URL.');
    }

    const sanitizedUrl = rawUrl.replace(/^https?:\/\/[^@]+@/, 'https://');
    const token = options.token || process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

    // Resolve or generate project ID
    let projectId = options.projectId;
    if (!projectId) {
      const defaultUser = await prisma.user.findFirst();
      if (!defaultUser) throw new GitError('GIT_OPERATION_FAILED', 'No user found in database to associate clone with.');
      
      const repoName = options.projectName || path.basename(sanitizedUrl, '.git') || 'cloned-repo';
      const project = await prisma.project.create({
        data: {
          ownerId: defaultUser.id,
          name: repoName,
          slug: `${repoName}-${Date.now().toString(36)}`,
          storageDriver: 'postgres',
          storagePrefix: `workspaces/${repoName}`,
        },
      });
      projectId = project.id;
    }

    const baseDir = path.resolve(process.env.STORAGE_LOCAL_DIR || './storage/workspaces');
    const workDir = options.destinationPath ? path.resolve(options.destinationPath) : path.join(baseDir, projectId);
    await fsp.mkdir(workDir, { recursive: true });

    return await GitLockManager.withLock(projectId, 'clone', async () => {
      try {
        await git.clone({
          fs,
          http,
          dir: workDir,
          url: sanitizedUrl,
          ref: options.branch,
          depth: options.depth || undefined,
          singleBranch: Boolean(options.branch),
          onAuth: () => ({ username: token || '' }),
        });

        const branch = (await git.currentBranch({ fs, dir: workDir, fullname: false })) || options.branch || 'main';
        const head = await git.resolveRef({ fs, dir: workDir, ref: 'HEAD' });

        // Synchronize cloned files to database storage driver
        await WorkspaceStorageAdapter.syncDiskToStorage(projectId!, workDir);

        return {
          projectId: projectId!,
          head,
          branch,
          directory: workDir,
        };
      } catch (err: any) {
        const cleanMsg = scrubSecrets(err.message || 'Clone failed');
        throw new GitError('GIT_OPERATION_FAILED', `Repository clone failed: ${cleanMsg}`);
      }
    });
  }

  // -------------------------------------------------------------
  // 10. Branch Management
  // -------------------------------------------------------------

  static async branchList(projectId: string, includeRemote = true): Promise<GitBranchSummary> {
    const workDir = await this.getProjectWorkingDir(projectId);
    await this.ensureRepo(workDir);

    try {
      const current = (await git.currentBranch({ fs, dir: workDir, fullname: false })) || 'main';
      const localBranches = await git.listBranches({ fs, dir: workDir });
      const branches: GitBranchItem[] = [];

      for (const b of localBranches) {
        const sha = await git.resolveRef({ fs, dir: workDir, ref: `refs/heads/${b}` }).catch(() => undefined);
        branches.push({
          name: b,
          isRemote: false,
          current: b === current,
          sha,
        });
      }

      if (includeRemote) {
        const remotes = await git.listRemotes({ fs, dir: workDir });
        for (const r of remotes) {
          const remoteBranches = await git.listBranches({ fs, dir: workDir, remote: r.remote }).catch(() => []);
          for (const rb of remoteBranches) {
            const sha = await git.resolveRef({ fs, dir: workDir, ref: `refs/remotes/${r.remote}/${rb}` }).catch(() => undefined);
            branches.push({
              name: `${r.remote}/${rb}`,
              isRemote: true,
              current: false,
              sha,
            });
          }
        }
      }

      return {
        current,
        branches,
      };
    } catch (err: any) {
      throw new GitError('GIT_OPERATION_FAILED', `Failed to list branches: ${err.message}`);
    }
  }

  static async branchCreate(
    projectId: string,
    name: string,
    startPoint?: string,
    checkout = true
  ): Promise<{ branch: string; created: boolean; checkedOut: boolean }> {
    return await GitLockManager.withLock(projectId, 'branchCreate', async () => {
      const workDir = await this.getProjectWorkingDir(projectId);
      await this.ensureRepo(workDir);

      const cleanName = name.trim();
      if (!cleanName || /[\s~^:?*[\\\]]/.test(cleanName) || cleanName.includes('..')) {
        throw new GitError('INVALID_PARAMETER', `Invalid branch name '${cleanName}'. Cannot contain spaces, colons, or special characters.`);
      }

      await git.branch({
        fs,
        dir: workDir,
        ref: cleanName,
        object: startPoint || undefined,
        checkout: false,
      });

      let checkedOut = false;
      if (checkout) {
        await git.checkout({
          fs,
          dir: workDir,
          ref: cleanName,
        });
        checkedOut = true;
      }

      return {
        branch: cleanName,
        created: true,
        checkedOut,
      };
    });
  }

  static async branchSwitch(
    projectId: string,
    name: string,
    create = false
  ): Promise<{ currentBranch: string }> {
    return await GitLockManager.withLock(projectId, 'branchSwitch', async () => {
      const workDir = await this.getProjectWorkingDir(projectId);
      await this.ensureRepo(workDir);

      const cleanName = name.trim();
      const status = await this.getStatus(projectId);
      if (!status.workingTreeClean) {
        throw new GitError(
          'WORKING_TREE_DIRTY',
          `Cannot switch branches: You have uncommitted modifications that would be overwritten. Commit or stage your changes first.`
        );
      }

      if (create) {
        await git.branch({
          fs,
          dir: workDir,
          ref: cleanName,
          checkout: true,
        });
      } else {
        await git.checkout({
          fs,
          dir: workDir,
          ref: cleanName,
        });
      }

      await WorkspaceStorageAdapter.syncDiskToStorage(projectId, workDir);

      return {
        currentBranch: cleanName,
      };
    });
  }

  static async branchDelete(
    projectId: string,
    name: string,
    force = false
  ): Promise<{ deleted: string }> {
    return await GitLockManager.withLock(projectId, 'branchDelete', async () => {
      const workDir = await this.getProjectWorkingDir(projectId);
      await this.ensureRepo(workDir);

      const cleanName = name.trim();
      const current = await git.currentBranch({ fs, dir: workDir, fullname: false });
      if (cleanName === current) {
        throw new GitError('GIT_OPERATION_FAILED', `Cannot delete branch '${cleanName}' because it is currently checked out.`);
      }

      await git.deleteBranch({
        fs,
        dir: workDir,
        ref: cleanName,
      });

      return {
        deleted: cleanName,
      };
    });
  }

  static async setUpstream(
    projectId: string,
    branch?: string,
    upstreamRemote = 'origin',
    upstreamBranch?: string
  ): Promise<{ branch: string; upstream: string }> {
    return await GitLockManager.withLock(projectId, 'setUpstream', async () => {
      const workDir = await this.getProjectWorkingDir(projectId);
      await this.ensureRepo(workDir);

      const targetBranch = branch || (await git.currentBranch({ fs, dir: workDir, fullname: false })) || 'main';
      const targetUpstreamBranch = upstreamBranch || targetBranch;

      await git.setConfig({
        fs,
        dir: workDir,
        path: `branch.${targetBranch}.remote`,
        value: upstreamRemote,
      });

      await git.setConfig({
        fs,
        dir: workDir,
        path: `branch.${targetBranch}.merge`,
        value: `refs/heads/${targetUpstreamBranch}`,
      });

      return {
        branch: targetBranch,
        upstream: `${upstreamRemote}/${targetUpstreamBranch}`,
      };
    });
  }
}
