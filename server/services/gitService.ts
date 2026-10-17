import git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import * as diff from 'diff';
import { prisma } from '../db/prisma.js';
import { getStorageDriver } from './storage/index.js';
import {
  GitStatusSummary,
  GitCommitItem,
  GitPushOptions,
  GitPushResult,
} from '../../shared/types.js';
import { scrubSecrets } from '../utils/secretScrubber.js';

export class GitService {
  private static async getProjectWorkingDir(projectId: string): Promise<string> {
    const baseDir = path.resolve(process.env.STORAGE_LOCAL_DIR || './storage/workspaces');
    const projectDir = path.join(baseDir, projectId);
    await fsp.mkdir(projectDir, { recursive: true });

    // If project uses postgres storage, ensure files are synced to local disk for git
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (project?.storageDriver === 'postgres') {
      const storage = getStorageDriver('postgres');
      const files = await storage.listFiles(projectId);
      for (const file of files) {
        try {
          const content = await storage.readFile(projectId, file.path);
          const fullPath = path.join(projectDir, file.path);
          await fsp.mkdir(path.dirname(fullPath), { recursive: true });
          await fsp.writeFile(fullPath, content, 'utf8');
        } catch {
          // ignore
        }
      }
    }

    return projectDir;
  }

  private static async ensureRepo(workDir: string): Promise<void> {
    const gitDir = path.join(workDir, '.git');
    const exists = await fsp.access(gitDir).then(() => true).catch(() => false);
    if (!exists) {
      await git.init({ fs, dir: workDir, defaultBranch: 'main' });
    }
  }

  static async getStatus(projectId: string): Promise<GitStatusSummary> {
    try {
      const workDir = await this.getProjectWorkingDir(projectId);
      await this.ensureRepo(workDir);

      const matrix = await git.statusMatrix({ fs, dir: workDir });
      const staged: string[] = [];
      const unstaged: string[] = [];
      const untracked: string[] = [];

      for (const [filepath, head, workdir, stage] of matrix) {
        if (filepath.startsWith('.git')) continue;

        // If index differs from HEAD, it is staged
        if (stage !== head) {
          staged.push(filepath);
        }

        // Untracked: not in HEAD, not in index, but exists in workdir
        if (head === 0 && stage === 0 && workdir === 2) {
          untracked.push(filepath);
        } else if (workdir !== stage) {
          // Modified or deleted in worktree
          unstaged.push(filepath);
        }
      }

      let currentBranch = 'main';
      try {
        const b = await git.currentBranch({ fs, dir: workDir, fullname: false });
        if (b) currentBranch = b;
      } catch {
        currentBranch = 'main';
      }

      return {
        isRepo: true,
        currentBranch,
        staged,
        unstaged,
        untracked,
        ahead: 0,
        behind: 0,
      };
    } catch {
      return {
        isRepo: false,
        currentBranch: 'main',
        staged: [],
        unstaged: [],
        untracked: [],
        ahead: 0,
        behind: 0,
      };
    }
  }

  static async getDiff(projectId: string, staged = false): Promise<string> {
    try {
      const workDir = await this.getProjectWorkingDir(projectId);
      await this.ensureRepo(workDir);

      const matrix = await git.statusMatrix({ fs, dir: workDir });
      let diffOutput = '';

      let headOid: string | null = null;
      try {
        const logs = await git.log({ fs, dir: workDir, depth: 1 });
        headOid = logs[0]?.oid || null;
      } catch {
        headOid = null;
      }

      for (const [filepath, head, workdir, stage] of matrix) {
        if (filepath.startsWith('.git')) continue;

        if (staged && stage === head) continue;
        if (!staged && workdir === stage) continue;

        let oldContent = '';
        let newContent = '';

        if (headOid) {
          try {
            const { blob } = await git.readBlob({ fs, dir: workDir, oid: headOid, filepath });
            oldContent = Buffer.from(blob).toString('utf8');
          } catch {
            oldContent = '';
          }
        }

        const fullPath = path.join(workDir, filepath);
        try {
          newContent = await fsp.readFile(fullPath, 'utf8');
        } catch {
          newContent = '';
        }

        const filePatch = diff.createTwoFilesPatch(
          `a/${filepath}`,
          `b/${filepath}`,
          oldContent,
          newContent,
          'head',
          'working'
        );
        diffOutput += filePatch + '\n';
      }

      return diffOutput.trim();
    } catch {
      return '';
    }
  }

  static async stageFile(projectId: string, filePath: string): Promise<void> {
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
  }

  static async stageAll(projectId: string): Promise<void> {
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
  }

  static async unstageFile(projectId: string, filePath: string): Promise<void> {
    const workDir = await this.getProjectWorkingDir(projectId);
    await this.ensureRepo(workDir);

    const normPath = filePath.replace(/^[/\\]+/, '').replace(/\\/g, '/');
    await git.resetIndex({ fs, dir: workDir, filepath: normPath });
  }

  static async commit(
    projectId: string,
    message: string,
    authorName?: string,
    authorEmail?: string
  ): Promise<{ commitHash: string; branch: string }> {
    const workDir = await this.getProjectWorkingDir(projectId);
    await this.ensureRepo(workDir);

    const matrix = await git.statusMatrix({ fs, dir: workDir });
    const hasStaged = matrix.some(([filepath, head, workdir, stage]) => !filepath.startsWith('.git') && stage !== head);

    // Auto-stage all modified & untracked files if nothing is staged
    if (!hasStaged) {
      for (const [filepath, head, workdir, stage] of matrix) {
        if (filepath.startsWith('.git')) continue;
        if (workdir === 0) {
          await git.remove({ fs, dir: workDir, filepath }).catch(() => {});
        } else if (workdir === 2) {
          await git.add({ fs, dir: workDir, filepath }).catch(() => {});
        }
      }
    }

    const commitHash = await git.commit({
      fs,
      dir: workDir,
      message,
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
  }

  static async getHistory(projectId: string, maxCount = 20): Promise<GitCommitItem[]> {
    try {
      const workDir = await this.getProjectWorkingDir(projectId);
      await this.ensureRepo(workDir);

      const logs = await git.log({ fs, dir: workDir, depth: maxCount });
      return logs.map(l => ({
        hash: l.oid,
        message: l.commit.message,
        author: l.commit.author.name,
        date: new Date(l.commit.author.timestamp * 1000).toISOString(),
      }));
    } catch {
      return [];
    }
  }

  static async getRemotes(projectId: string): Promise<Array<{ name: string; url: string }>> {
    try {
      const workDir = await this.getProjectWorkingDir(projectId);
      await this.ensureRepo(workDir);
      const remotes = await git.listRemotes({ fs, dir: workDir });
      return remotes.map(r => ({ name: r.remote, url: r.url }));
    } catch {
      return [];
    }
  }

  static async setRemote(projectId: string, url: string, name = 'origin'): Promise<void> {
    const workDir = await this.getProjectWorkingDir(projectId);
    await this.ensureRepo(workDir);

    const sanitizedUrl = url.trim().replace(/^https?:\/\/[^@]+@/, 'https://');
    await git.deleteRemote({ fs, dir: workDir, remote: name }).catch(() => {});
    await git.addRemote({ fs, dir: workDir, remote: name, url: sanitizedUrl });
  }

  static async push(
    projectId: string,
    options: GitPushOptions = {}
  ): Promise<GitPushResult> {
    const workDir = await this.getProjectWorkingDir(projectId);
    await this.ensureRepo(workDir);
    const remoteName = options.remoteName || 'origin';

    // 1. Commit uncommitted changes if commitMessage was provided
    if (options.commitMessage) {
      const status = await this.getStatus(projectId);
      const hasChanges =
        status.staged.length > 0 ||
        status.unstaged.length > 0 ||
        status.untracked.length > 0;
      if (hasChanges) {
        await this.commit(projectId, options.commitMessage, options.authorName, options.authorEmail);
      }
    }

    // 2. Ensure at least one commit exists
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

    // 3. Resolve target branch
    let branch = options.branch;
    if (!branch) {
      branch = (await git.currentBranch({ fs, dir: workDir, fullname: false }).catch(() => null)) || 'main';
    }

    // Ensure branch ref exists
    await git.branch({ fs, dir: workDir, ref: branch, checkout: true }).catch(() => {});

    // 4. Resolve Remote URL & Authentication
    if (options.remoteUrl) {
      await this.setRemote(projectId, options.remoteUrl, remoteName);
    }

    const remotes = await git.listRemotes({ fs, dir: workDir });
    const targetRemote = remotes.find(r => r.remote === remoteName);
    const targetUrl = targetRemote?.url || options.remoteUrl;

    if (!targetUrl) {
      throw new Error(
        'No remote Git repository URL configured. Provide remoteUrl (e.g. https://github.com/owner/repo.git) or configure an origin remote.'
      );
    }

    const token = options.token || process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

    try {
      const pushResult = await git.push({
        fs,
        http,
        dir: workDir,
        remote: remoteName,
        ref: branch,
        force: options.force,
        onAuth: () => ({ username: token || '' }),
      });

      if (pushResult && pushResult.ok === false) {
        throw new Error(pushResult.error || 'Push was rejected by remote server');
      }

      const latestLog = await git.log({ fs, dir: workDir, depth: 1 }).catch(() => []);
      const latestCommitHash = latestLog[0]?.oid || '';

      return {
        success: true,
        branch,
        remote: targetUrl,
        pushed: true,
        commitHash: latestCommitHash,
        message: `Successfully pushed branch '${branch}' to ${targetUrl}`,
      };
    } catch (err: any) {
      const cleanError = scrubSecrets(err?.message || 'Git push encountered an unknown error');
      throw new Error(`Git push failed: ${cleanError}`);
    }
  }
}
