import { StorageDriver } from './StorageDriver.js';
import { prisma } from '../../db/prisma.js';
import { computeSha256 } from '../../utils/crypto.js';
import { normalizeRelativePath } from '../../utils/sanitizePath.js';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export class PostgresStorageDriver implements StorageDriver {
  async readFile(projectId: string, filePath: string): Promise<string> {
    const cleanPath = normalizeRelativePath(filePath);
    const record = await prisma.fileContent.findUnique({
      where: {
        projectId_filePath: {
          projectId,
          filePath: cleanPath,
        },
      },
    });

    if (!record) {
      throw new Error(`File not found: ${cleanPath}`);
    }

    return record.content;
  }

  async writeFile(
    projectId: string,
    filePath: string,
    content: string
  ): Promise<{ sha256: string; bytes: number }> {
    const cleanPath = normalizeRelativePath(filePath);
    const bytes = Buffer.byteLength(content, 'utf8');

    if (bytes > MAX_FILE_SIZE_BYTES) {
      throw new Error(`File size exceeds 10MB limit: ${bytes} bytes`);
    }

    const sha256 = computeSha256(content);

    await prisma.fileContent.upsert({
      where: {
        projectId_filePath: {
          projectId,
          filePath: cleanPath,
        },
      },
      create: {
        projectId,
        filePath: cleanPath,
        sha256,
        content,
      },
      update: {
        sha256,
        content,
        updatedAt: new Date(),
      },
    });

    return { sha256, bytes };
  }

  async deleteFile(projectId: string, filePath: string): Promise<boolean> {
    const cleanPath = normalizeRelativePath(filePath);
    try {
      await prisma.fileContent.delete({
        where: {
          projectId_filePath: {
            projectId,
            filePath: cleanPath,
          },
        },
      });
      return true;
    } catch {
      return false;
    }
  }

  async deleteDirectory(projectId: string, directoryPath: string): Promise<boolean> {
    const cleanDir = normalizeRelativePath(directoryPath);
    const prefix = cleanDir ? `${cleanDir}/` : '';

    await prisma.fileContent.deleteMany({
      where: {
        projectId,
        filePath: {
          startsWith: prefix,
        },
      },
    });
    return true;
  }

  async listFiles(
    projectId: string,
    prefix?: string
  ): Promise<Array<{ path: string; size: number; lastModified: Date }>> {
    const cleanPrefix = prefix ? normalizeRelativePath(prefix) : '';
    const records = await prisma.fileContent.findMany({
      where: {
        projectId,
        filePath: cleanPrefix ? { startsWith: cleanPrefix } : undefined,
      },
      select: {
        filePath: true,
        updatedAt: true,
        content: true,
      },
    });

    return records.map((r: { filePath: string; updatedAt: Date; content: string }) => ({
      path: r.filePath,
      size: Buffer.byteLength(r.content, 'utf8'),
      lastModified: r.updatedAt,
    }));
  }
}
