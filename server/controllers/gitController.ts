import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { GitService } from '../services/gitService.js';

export class GitController {
  static async getStatus(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const status = await GitService.getStatus(projectId);
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ error: 'Git status failed', details: err.message });
    }
  }

  static async getDiff(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const staged = req.query.staged === 'true';
      const diff = await GitService.getDiff(projectId, staged);
      res.json({ diff });
    } catch (err: any) {
      res.status(500).json({ error: 'Git diff failed', details: err.message });
    }
  }

  static async stage(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const { filePath, all } = req.body;

      if (all) {
        await GitService.stageAll(projectId);
      } else if (filePath) {
        await GitService.stageFile(projectId, filePath);
      }

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: 'Git staging failed', details: err.message });
    }
  }

  static async unstage(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const { filePath } = req.body;
      if (!filePath) {
        res.status(400).json({ error: 'filePath is required' });
        return;
      }

      await GitService.unstageFile(projectId, filePath);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: 'Git unstage failed', details: err.message });
    }
  }

  static async commit(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const { message, authorName, authorEmail } = req.body;

      if (!message) {
        res.status(400).json({ error: 'Commit message is required' });
        return;
      }

      const result = await GitService.commit(
        projectId,
        message,
        authorName || req.user?.name || undefined,
        authorEmail || req.user?.email || undefined
      );

      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ error: 'Git commit failed', details: err.message });
    }
  }

  static async getHistory(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const maxCount = req.query.maxCount ? parseInt(req.query.maxCount as string, 10) : 25;
      const history = await GitService.getHistory(projectId, maxCount);
      res.json({ history });
    } catch (err: any) {
      res.status(500).json({ error: 'Git history failed', details: err.message });
    }
  }

  static async push(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const { remoteUrl, token, branch, commitMessage, authorName, authorEmail, force, remoteName } = req.body;

      const result = await GitService.push(projectId, {
        remoteUrl,
        token,
        branch,
        commitMessage,
        authorName: authorName || req.user?.name || undefined,
        authorEmail: authorEmail || req.user?.email || undefined,
        force,
        remoteName,
      });

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: 'Git push failed', details: err.message });
    }
  }

  static async getRemotes(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const remotes = await GitService.getRemotes(projectId);
      res.json({ remotes });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to retrieve remotes', details: err.message });
    }
  }

  static async setRemote(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const { url, name } = req.body;
      if (!url) {
        res.status(400).json({ error: 'Remote URL is required' });
        return;
      }
      await GitService.setRemote(projectId, url, name || 'origin');
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to set remote', details: err.message });
    }
  }
}
