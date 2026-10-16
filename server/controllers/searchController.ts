import { Response } from 'express';
import { prisma } from '../db/prisma.js';
import { AuthRequest } from '../middleware/auth.js';
import { getStorageDriver } from '../services/storage/index.js';

export class SearchController {
  static async searchFiles(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const query = (req.query.q as string || '').trim().toLowerCase();

      const files = await prisma.projectFile.findMany({
        where: {
          projectId,
          isFolder: false,
          ...(query ? { path: { contains: query, mode: 'insensitive' } } : {}),
        },
        select: {
          id: true,
          path: true,
          sizeBytes: true,
          version: true,
          updatedAt: true,
        },
        take: 50,
      });

      res.json({ files });
    } catch (err: any) {
      res.status(500).json({ error: 'Search files failed', details: err.message });
    }
  }

  static async searchCode(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const query = (req.query.q as string || '').trim();
      const isRegex = req.query.regex === 'true';

      if (!query) {
        res.json({ matches: [] });
        return;
      }

      const project = await prisma.project.findUnique({ where: { id: projectId } });
      const storage = getStorageDriver(project?.storageDriver);

      const files = await prisma.projectFile.findMany({
        where: { projectId, isFolder: false },
        select: { path: true },
        take: 100,
      });

      const matches: Array<{ path: string; line: number; content: string }> = [];
      const regex = isRegex ? new RegExp(query, 'i') : null;

      for (const f of files) {
        if (f.path.startsWith('node_modules/') || f.path.startsWith('.git/')) continue;
        try {
          const content = await storage.readFile(projectId, f.path);
          const lines = content.split('\n');
          lines.forEach((line, idx) => {
            const isMatch = regex ? regex.test(line) : line.toLowerCase().includes(query.toLowerCase());
            if (isMatch && matches.length < 100) {
              matches.push({
                path: f.path,
                line: idx + 1,
                content: line.trim(),
              });
            }
          });
        } catch {
          // ignore binary or unreadable
        }
      }

      res.json({ matches });
    } catch (err: any) {
      res.status(500).json({ error: 'Code search failed', details: err.message });
    }
  }
}
