import { Response } from 'express';
import { prisma } from '../db/prisma.js';
import { AuthRequest } from '../middleware/auth.js';
import { getStorageDriver } from '../services/storage/index.js';
import { computeSha256 } from '../utils/crypto.js';
import { normalizeRelativePath } from '../utils/sanitizePath.js';
import { PatchEngine } from '../services/patchEngine.js';
import { FileTreeItem } from '../../shared/types.js';

export class FileController {
  static async getTree(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const files = await prisma.projectFile.findMany({
        where: { projectId },
        orderBy: [{ isFolder: 'desc' }, { path: 'asc' }],
      });

      // Construct nested virtual tree
      const rootItems: FileTreeItem[] = [];
      const itemMap = new Map<string, FileTreeItem>();

      for (const file of files) {
        const item: FileTreeItem = {
          id: file.id,
          name: file.path.split('/').pop() || file.path,
          path: file.path,
          isFolder: file.isFolder,
          version: file.version,
          sha256: file.sha256,
          sizeBytes: file.sizeBytes,
          children: file.isFolder ? [] : undefined,
        };
        itemMap.set(file.path, item);
      }

      for (const file of files) {
        const item = itemMap.get(file.path)!;
        const lastSlash = file.path.lastIndexOf('/');
        if (lastSlash === -1) {
          rootItems.push(item);
        } else {
          const parentPath = file.path.substring(0, lastSlash);
          const parent = itemMap.get(parentPath);
          if (parent && parent.children) {
            parent.children.push(item);
          } else {
            rootItems.push(item);
          }
        }
      }

      res.json({ files: rootItems, flatList: files });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to retrieve file tree', details: err.message });
    }
  }

  static async getFile(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      // Get the wildcard path from route parameter
      const rawPath = (req.params as any)[0] || req.query.path as string;
      if (!rawPath) {
        res.status(400).json({ error: 'File path is required' });
        return;
      }

      const cleanPath = normalizeRelativePath(rawPath);
      const file = await prisma.projectFile.findUnique({
        where: { projectId_path: { projectId, path: cleanPath } },
      });

      if (!file || file.isFolder) {
        res.status(404).json({ error: `File not found: ${cleanPath}` });
        return;
      }

      const project = await prisma.project.findUnique({ where: { id: projectId } });
      const storage = getStorageDriver(project?.storageDriver);
      const content = await storage.readFile(projectId, cleanPath);

      res.json({
        id: file.id,
        projectId: file.projectId,
        path: file.path,
        isFolder: file.isFolder,
        version: file.version,
        sha256: file.sha256,
        sizeBytes: file.sizeBytes,
        content,
        updatedAt: file.updatedAt.toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to read file', details: err.message });
    }
  }

  /**
   * Section 6: Atomic File Saving Protocol with Optimistic Concurrency Control
   */
  static async saveFile(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const rawPath = (req.params as any)[0] || req.body.path;
      const { content, expectedVersion, baseSha256 } = req.body;

      if (!rawPath) {
        res.status(400).json({ error: 'Path is required' });
        return;
      }

      if (content === undefined) {
        res.status(400).json({ error: 'Content is required' });
        return;
      }

      const cleanPath = normalizeRelativePath(rawPath);
      const project = await prisma.project.findUnique({ where: { id: projectId } });
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      const storage = getStorageDriver(project.storageDriver);
      const existing = await prisma.projectFile.findUnique({
        where: { projectId_path: { projectId, path: cleanPath } },
      });

      // Optimistic concurrency conflict check:
      if (existing) {
        if (baseSha256 && existing.sha256 !== baseSha256) {
          // File was modified by someone else or another process
          const currentRemoteContent = await storage.readFile(projectId, cleanPath).catch(() => '');
          const conflictDiff = PatchEngine.createUnifiedDiff(
            currentRemoteContent,
            content,
            cleanPath
          );

          res.status(409).json({
            error: 'Conflict: File was modified remotely.',
            currentVersion: existing.version,
            currentSha256: existing.sha256,
            remoteContent: currentRemoteContent,
            conflictDiff,
          });
          return;
        }

        // Record snapshot before overwriting
        try {
          const preContent = await storage.readFile(projectId, cleanPath);
          await prisma.fileSnapshot.create({
            data: {
              fileId: existing.id,
              version: existing.version,
              sha256: existing.sha256,
              content: preContent,
              reason: 'user_save',
            },
          });
        } catch {
          // ignore snapshot error
        }
      }

      const newSha256 = computeSha256(content);
      const newBytes = Buffer.byteLength(content, 'utf8');

      // Atomic write to storage
      await storage.writeFile(projectId, cleanPath, content);

      // Atomic transaction in PostgreSQL
      const updatedRecord = await prisma.projectFile.upsert({
        where: { projectId_path: { projectId, path: cleanPath } },
        create: {
          projectId,
          path: cleanPath,
          isFolder: false,
          version: 1,
          sha256: newSha256,
          sizeBytes: newBytes,
        },
        update: {
          version: { increment: 1 },
          sha256: newSha256,
          sizeBytes: newBytes,
          updatedAt: new Date(),
        },
      });

      res.json({
        fileId: updatedRecord.id,
        path: updatedRecord.path,
        newVersion: updatedRecord.version,
        newSha256: updatedRecord.sha256,
        savedAt: updatedRecord.updatedAt.toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to save file', details: err.message });
    }
  }

  static async createFile(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const { path: rawPath, content = '', isFolder = false } = req.body;

      if (!rawPath) {
        res.status(400).json({ error: 'Path is required' });
        return;
      }

      const cleanPath = normalizeRelativePath(rawPath);
      const project = await prisma.project.findUnique({ where: { id: projectId } });
      const storage = getStorageDriver(project?.storageDriver);

      if (!isFolder) {
        await storage.writeFile(projectId, cleanPath, content);
      }

      const sha256 = isFolder ? 'directory' : computeSha256(content);
      const bytes = isFolder ? 0 : Buffer.byteLength(content, 'utf8');

      const record = await prisma.projectFile.create({
        data: {
          projectId,
          path: cleanPath,
          isFolder,
          version: 1,
          sha256,
          sizeBytes: bytes,
        },
      });

      res.status(201).json({ file: record });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to create file', details: err.message });
    }
  }

  static async delete(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const rawPath = (req.params as any)[0] || req.body.path;
      const cleanPath = normalizeRelativePath(rawPath);

      const project = await prisma.project.findUnique({ where: { id: projectId } });
      const storage = getStorageDriver(project?.storageDriver);

      await storage.deleteFile(projectId, cleanPath);
      await storage.deleteDirectory(projectId, cleanPath);

      await prisma.projectFile.deleteMany({
        where: {
          projectId,
          OR: [{ path: cleanPath }, { path: { startsWith: `${cleanPath}/` } }],
        },
      });

      res.json({ success: true, path: cleanPath });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to delete file', details: err.message });
    }
  }
}
