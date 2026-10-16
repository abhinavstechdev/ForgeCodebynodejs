import { simpleGit, SimpleGit } from 'simple-git';
import path from 'path';
import fs from 'fs/promises';
import { prisma } from '../db/prisma.js';
import { getStorageDriver } from './storage/index.js';
import { GitStatusSummary, GitCommitItem } from '../../shared/types.js';

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
}
