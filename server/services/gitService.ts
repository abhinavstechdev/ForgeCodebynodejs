import { simpleGit, SimpleGit } from 'simple-git';
import path from 'path';
import fs from 'fs/promises';
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
    await fs.mkdir(projectDir, { recursive: true });

    // If project uses postgres storage, ensure files are synced to local disk for git
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (project?.storageDriver === 'postgres') {
      const storage = getStorageDriver('postgres');
      const files = await storage.listFiles(projectId);
      for (const file of files) {
        try {
          const content = await storage.readFile(projectId, file.path);
          const fullPath = path.join(projectDir, file.path);
          await fs.mkdir(path.dirname(fullPath), { recursive: true });
          await fs.writeFile(fullPath, content, 'utf8');
        } catch {
          // ignore
        }
      }
    }

    return projectDir;
  }

  private static async getGitInstance(projectId: string): Promise<SimpleGit> {
    const workDir = await this.getProjectWorkingDir(projectId);
    const git = simpleGit(workDir);

    const isRepo = await git.checkIsRepo().catch(() => false);
    if (!isRepo) {
      await git.init();
      await git.addConfig('user.name', 'ForgeCode User');
      await git.addConfig('user.email', 'user@forgecode.ai');
    }

    return git;
  }

  static async getStatus(projectId: string): Promise<GitStatusSummary> {
    try {
      const git = await this.getGitInstance(projectId);
      const status = await git.status();

      return {
        isRepo: true,
        currentBranch: status.current || 'main',
        staged: status.staged,
        unstaged: status.modified.concat(status.deleted),
        untracked: status.not_added,
        ahead: status.ahead,
        behind: status.behind,
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
    const git = await this.getGitInstance(projectId);
    if (staged) {
      return await git.diff(['--cached']);
    }
    return await git.diff();
  }

  static async stageFile(projectId: string, filePath: string): Promise<void> {
    const git = await this.getGitInstance(projectId);
    await git.add(filePath);
  }

  static async stageAll(projectId: string): Promise<void> {
    const git = await this.getGitInstance(projectId);
    await git.add('.');
  }

  static async unstageFile(projectId: string, filePath: string): Promise<void> {
    const git = await this.getGitInstance(projectId);
    await git.reset(['HEAD', filePath]);
  }

  static async commit(
    projectId: string,
    message: string,
    authorName?: string,
    authorEmail?: string
  ): Promise<{ commitHash: string; branch: string }> {
    const git = await this.getGitInstance(projectId);

    if (authorName && authorEmail) {
      await git.addConfig('user.name', authorName);
      await git.addConfig('user.email', authorEmail);
    }

    // Auto-stage all before commit if nothing is staged
    const status = await git.status();
    if (status.staged.length === 0 && (status.modified.length > 0 || status.not_added.length > 0)) {
      await git.add('.');
    }

    const result = await git.commit(message);
    const branch = (await git.branch()).current || 'main';

    return {
      commitHash: result.commit,
      branch,
    };
  }

  static async getHistory(projectId: string, maxCount = 20): Promise<GitCommitItem[]> {
    try {
      const git = await this.getGitInstance(projectId);
      const log = await git.log({ maxCount });
      return log.all.map(c => ({
        hash: c.hash,
        message: c.message,
        author: c.author_name,
        date: c.date,
      }));
    } catch {
      return [];
    }
  }

  static async getRemotes(projectId: string): Promise<Array<{ name: string; url: string }>> {
    try {
      const git = await this.getGitInstance(projectId);
      const remotes = await git.getRemotes(true);
      return remotes.map(r => ({
        name: r.name,
        url: r.refs.push || r.refs.fetch || '',
      }));
    } catch {
      return [];
    }
  }

  static async setRemote(projectId: string, url: string, name = 'origin'): Promise<void> {
    const git = await this.getGitInstance(projectId);
    const sanitizedUrl = url.trim().replace(/^https?:\/\/[^@]+@/, 'https://');
    const remotes = await git.getRemotes(true);
    const existing = remotes.find(r => r.name === name);
    if (existing) {
      await git.remote(['set-url', name, sanitizedUrl]);
    } else {
      await git.addRemote(name, sanitizedUrl);
    }
  }

  static async push(
    projectId: string,
    options: GitPushOptions = {}
  ): Promise<GitPushResult> {
    const git = await this.getGitInstance(projectId);
    const remoteName = options.remoteName || 'origin';

    // 1. Commit uncommitted changes if commitMessage was provided
    if (options.commitMessage) {
      const status = await git.status();
      const hasChanges =
        status.staged.length > 0 ||
        status.modified.length > 0 ||
        status.not_added.length > 0 ||
        status.deleted.length > 0;
      if (hasChanges) {
        await this.commit(projectId, options.commitMessage, options.authorName, options.authorEmail);
      }
    }

    // 2. Ensure at least one commit exists
    const logResult = await git.log({ maxCount: 1 }).catch(() => null);
    if (!logResult || logResult.all.length === 0) {
      await git.add('.');
      await git.commit(options.commitMessage || 'Initial commit from ForgeCode AI');
    }

    // 3. Resolve target branch
    const status = await git.status();
    const branch = options.branch || status.current || 'main';

    // 4. Resolve Remote URL & Authentication
    const remotes = await git.getRemotes(true);
    const existingRemote = remotes.find(r => r.name === remoteName);
    const existingUrl = existingRemote?.refs.push || existingRemote?.refs.fetch;

    const targetUrl = options.remoteUrl || existingUrl;
    if (!targetUrl) {
      throw new Error(
        'No remote Git repository URL configured. Provide remoteUrl (e.g. https://github.com/owner/repo.git) or configure an origin remote.'
      );
    }

    // Sanitize target URL to ensure no credentials are leakable
    const sanitizedUrl = targetUrl.trim().replace(/^https?:\/\/[^@]+@/, 'https://');
    const token = options.token || process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

    let pushUrl = sanitizedUrl;
    if (token) {
      const encodedToken = encodeURIComponent(token.trim());
      pushUrl = sanitizedUrl.replace(/^https?:\/\//, `https://${encodedToken}@`);
    }

    // Configure or update remote with authenticated URL
    if (existingRemote) {
      await git.remote(['set-url', remoteName, pushUrl]);
    } else {
      await git.addRemote(remoteName, pushUrl);
    }

    try {
      const pushArgs = ['-u', remoteName, branch];
      if (options.force) {
        pushArgs.push('--force');
      }

      await git.push(pushArgs);

      const log = await git.log({ maxCount: 1 }).catch(() => null);
      const latestCommitHash = log?.latest?.hash || '';

      return {
        success: true,
        branch,
        remote: sanitizedUrl,
        pushed: true,
        commitHash: latestCommitHash,
        message: `Successfully pushed branch '${branch}' to ${sanitizedUrl}`,
      };
    } catch (err: any) {
      const cleanError = scrubSecrets(err?.message || 'Git push encountered an unknown error');
      throw new Error(`Git push failed: ${cleanError}`);
    } finally {
      // SECURITY: Reset remote origin URL to sanitized URL without sensitive PAT
      try {
        await git.remote(['set-url', remoteName, sanitizedUrl]);
      } catch {
        // ignore reset errors
      }
    }
  }
}
