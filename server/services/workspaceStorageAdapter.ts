import path from 'path';
import fs from 'fs/promises';
import { prisma } from '../db/prisma.js';
import { getStorageDriver } from './storage/index.js';

const IGNORED_DIRECTORIES = new Set(['.git', 'node_modules', '.cache', 'dist', 'build', '.prisma']);

/**
 * Adapter that explicitly synchronizes between virtual/database-backed storage
 * (e.g. Postgres Storage Driver) and a real filesystem-backed Git working tree.
 */
export class WorkspaceStorageAdapter {
  /**
   * Synchronizes files from the database storage driver to the physical Git working tree.
   */
  static async syncStorageToDisk(projectId: string, workDir: string): Promise<number> {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project || project.storageDriver !== 'postgres') {
      return 0;
    }

    const storage = getStorageDriver('postgres');
    const files = await storage.listFiles(projectId);
    let syncedCount = 0;

    for (const file of files) {
      try {
        const content = await storage.readFile(projectId, file.path);
        const fullPath = path.join(workDir, file.path);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content, 'utf8');
        syncedCount++;
      } catch {
        // Continue syncing other files
      }
    }

    return syncedCount;
  }

  /**
   * Synchronizes changes from the physical Git working tree back into the database storage driver.
   * Called after pull, merge, checkout, or clone operations.
   */
  static async syncDiskToStorage(projectId: string, workDir: string): Promise<{ updated: number; deleted: number }> {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project || project.storageDriver !== 'postgres') {
      return { updated: 0, deleted: 0 };
    }

    const storage = getStorageDriver('postgres');
    const existingDbFiles = await storage.listFiles(projectId);
    const dbPaths = new Set(existingDbFiles.map(f => f.path));

    const diskFiles: string[] = [];
    async function scanDir(currentDir: string, relPath: string) {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (IGNORED_DIRECTORIES.has(entry.name)) continue;
        const entryRel = relPath ? `${relPath}/${entry.name}` : entry.name;
        const entryFull = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          await scanDir(entryFull, entryRel);
        } else if (entry.isFile()) {
          diskFiles.push(entryRel);
        }
      }
    }

    await scanDir(workDir, '');

    let updated = 0;
    const currentDiskPaths = new Set(diskFiles);

    for (const filePath of diskFiles) {
      try {
        const fullPath = path.join(workDir, filePath);
        const content = await fs.readFile(fullPath, 'utf8');
        await storage.writeFile(projectId, filePath, content);
        updated++;
      } catch {
        // Skip unreadable files (e.g. binary)
      }
    }

    // Delete files that were deleted from disk
    let deleted = 0;
    for (const oldPath of dbPaths) {
      if (!currentDiskPaths.has(oldPath)) {
        try {
          await storage.deleteFile(projectId, oldPath);
          deleted++;
        } catch {
          // ignore
        }
      }
    }

    return { updated, deleted };
  }
}
