import fs from 'fs/promises';
import path from 'path';
import { StorageDriver } from './StorageDriver.js';
import { computeSha256 } from '../../utils/crypto.js';
import { sanitizePath, normalizeRelativePath } from '../../utils/sanitizePath.js';

export class LocalStorageDriver implements StorageDriver {
  private baseStorageDir: string;

  constructor(baseStorageDir?: string) {
    this.baseStorageDir = path.resolve(
      baseStorageDir || process.env.STORAGE_LOCAL_DIR || './storage/workspaces'
    );
  }

  private getProjectDir(projectId: string): string {
    return path.join(this.baseStorageDir, projectId);
  }

  async readFile(projectId: string, filePath: string): Promise<string> {
    const projectDir = this.getProjectDir(projectId);
    const fullPath = sanitizePath(projectDir, filePath);
    return await fs.readFile(fullPath, 'utf8');
  }

  async writeFile(
    projectId: string,
    filePath: string,
    content: string
  ): Promise<{ sha256: string; bytes: number }> {
    const projectDir = this.getProjectDir(projectId);
    const fullPath = sanitizePath(projectDir, filePath);
    
    // Ensure parent directory exists
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    
    // Write atomically using temporary file
    const tempFile = `${fullPath}.tmp.${Date.now()}`;
    await fs.writeFile(tempFile, content, 'utf8');
    await fs.rename(tempFile, fullPath);

    const sha256 = computeSha256(content);
    const bytes = Buffer.byteLength(content, 'utf8');

    return { sha256, bytes };
  }

  async deleteFile(projectId: string, filePath: string): Promise<boolean> {
    try {
      const projectDir = this.getProjectDir(projectId);
      const fullPath = sanitizePath(projectDir, filePath);
      await fs.unlink(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  async deleteDirectory(projectId: string, directoryPath: string): Promise<boolean> {
    try {
      const projectDir = this.getProjectDir(projectId);
      const fullPath = sanitizePath(projectDir, directoryPath);
      await fs.rm(fullPath, { recursive: true, force: true });
      return true;
    } catch {
      return false;
    }
  }

  async listFiles(
    projectId: string,
    prefix?: string
  ): Promise<Array<{ path: string; size: number; lastModified: Date }>> {
    const projectDir = this.getProjectDir(projectId);
    const targetDir = prefix ? sanitizePath(projectDir, prefix) : projectDir;
    
    const results: Array<{ path: string; size: number; lastModified: Date }> = [];

    async function walk(currentDir: string) {
      try {
        const entries = await fs.readdir(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry.name);
          if (entry.isDirectory()) {
            if (entry.name !== 'node_modules' && entry.name !== '.git') {
              await walk(fullPath);
            }
          } else if (entry.isFile()) {
            const stat = await fs.stat(fullPath);
            const relPath = normalizeRelativePath(path.relative(projectDir, fullPath));
            results.push({
              path: relPath,
              size: stat.size,
              lastModified: stat.mtime,
            });
          }
        }
      } catch {
        // directory might not exist yet
      }
    }

    await walk(targetDir);
    return results;
  }
}
