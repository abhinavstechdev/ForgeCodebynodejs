import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { GitService } from '../services/gitService.js';
import { GitError } from '../utils/gitError.js';

export class GitController {
  private static handleError(res: Response, err: any, defaultMessage: string) {
    const statusCode = err instanceof GitError && err.code === 'GIT_PERMISSION_DENIED' ? 403 : 500;
    res.status(statusCode).json({
      error: defaultMessage,
      message: err.message,
      errorCode: err.code || 'GIT_OPERATION_FAILED',
      details: err.details,
    });
  }

  static async getStatus(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const status = await GitService.getStatus(projectId);
      res.json(status);
    } catch (err: any) {
      GitController.handleError(res, err, 'Git status failed');
    }
  }

  static async getDiff(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const staged = req.query.staged === 'true';
      const baseCommit = req.query.baseCommit as string | undefined;
      const headCommit = req.query.headCommit as string | undefined;
      const filePath = req.query.filePath as string | undefined;
      const maxLines = req.query.maxLines ? parseInt(req.query.maxLines as string, 10) : undefined;
      const result = await GitService.getDiff(projectId, {
        staged,
        fromRevision: baseCommit,
        toRevision: headCommit,
        filePath,
        maxLines,
      });
      res.json(result);
    } catch (err: any) {
      GitController.handleError(res, err, 'Git diff failed');
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
      GitController.handleError(res, err, 'Git staging failed');
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
      GitController.handleError(res, err, 'Git unstage failed');
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
      GitController.handleError(res, err, 'Git commit failed');
    }
  }

  static async getHistory(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const maxCount = req.query.maxCount ? parseInt(req.query.maxCount as string, 10) : 25;
      const branch = req.query.branch as string | undefined;
      const base = req.query.base as string | undefined;
      const head = req.query.head as string | undefined;
      const filePath = req.query.filePath as string | undefined;
      const history = await GitService.getHistory(projectId, {
        maxCount,
        branch,
        fromRevision: base,
        toRevision: head,
        filePath,
      });
      res.json({ history });
    } catch (err: any) {
      GitController.handleError(res, err, 'Git history failed');
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
      GitController.handleError(res, err, 'Git push failed');
    }
  }

  static async sync(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const { remoteName, branch, strategy, push, commitMessage, force, dryRun, token } = req.body;
      const result = await GitService.sync(projectId, {
        remoteName,
        branch,
        strategy,
        push,
        commitMessage,
        force,
        dryRun,
        token,
      });
      res.json(result);
    } catch (err: any) {
      GitController.handleError(res, err, 'Git sync failed');
    }
  }

  static async fetch(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const { remoteName, branch, token } = req.body;
      const result = await GitService.fetch(projectId, { remoteName, branch, token });
      res.json(result);
    } catch (err: any) {
      GitController.handleError(res, err, 'Git fetch failed');
    }
  }

  static async pull(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const { remoteName, branch, token, strategy } = req.body;
      const result = await GitService.pull(projectId, {
        remoteName,
        branch,
        token,
        strategy,
      });
      res.json(result);
    } catch (err: any) {
      GitController.handleError(res, err, 'Git pull failed');
    }
  }

  static async clone(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const { repositoryUrl, branch, depth, token } = req.body;
      const result = await GitService.clone({
        projectId,
        repositoryUrl,
        branch,
        depth,
        token,
      });
      res.json(result);
    } catch (err: any) {
      GitController.handleError(res, err, 'Git clone failed');
    }
  }

  static async branchList(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const summary = await GitService.branchList(projectId);
      res.json(summary);
    } catch (err: any) {
      GitController.handleError(res, err, 'Branch list failed');
    }
  }

  static async branchCreate(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const { branchName, startPoint, checkout } = req.body;
      const result = await GitService.branchCreate(projectId, branchName, startPoint, checkout);
      res.json(result);
    } catch (err: any) {
      GitController.handleError(res, err, 'Branch create failed');
    }
  }

  static async branchSwitch(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const { branchName } = req.body;
      const result = await GitService.branchSwitch(projectId, branchName);
      res.json(result);
    } catch (err: any) {
      GitController.handleError(res, err, 'Branch switch failed');
    }
  }

  static async branchDelete(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const { branchName, force } = req.body;
      const result = await GitService.branchDelete(projectId, branchName, force);
      res.json(result);
    } catch (err: any) {
      GitController.handleError(res, err, 'Branch delete failed');
    }
  }

  static async setUpstream(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const { branch, remote, upstreamBranch } = req.body;
      const result = await GitService.setUpstream(projectId, branch, remote, upstreamBranch);
      res.json(result);
    } catch (err: any) {
      GitController.handleError(res, err, 'Set upstream failed');
    }
  }

  static async getRemotes(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const remotes = await GitService.getRemotes(projectId);
      res.json({ remotes });
    } catch (err: any) {
      GitController.handleError(res, err, 'Failed to retrieve remotes');
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
      GitController.handleError(res, err, 'Failed to set remote');
    }
  }
}
