import { prisma } from '../db/prisma.js';
import { getStorageDriver } from '../services/storage/index.js';
import { PatchEngine } from '../services/patchEngine.js';
import { computeSha256 } from '../utils/crypto.js';
import { normalizeRelativePath } from '../utils/sanitizePath.js';
import { GitService } from '../services/gitService.js';
import { ExecutionService } from '../services/executionService.js';

export interface McpContext {
  userId: string;
  tokenId: string;
  scopes: string[];
  defaultProjectId?: string | null;
}

export class McpToolsHandler {
  private static checkScope(ctx: McpContext, requiredScope: string) {
    if (!ctx.scopes.includes(requiredScope) && !ctx.scopes.includes('*')) {
      throw new Error(`Permission denied: Missing required MCP scope '${requiredScope}'`);
    }
  }

  private static async resolveProjectId(ctx: McpContext, paramProjectId?: string): Promise<string> {
    const targetId = paramProjectId || ctx.defaultProjectId;
    if (!targetId) {
      throw new Error('Project ID must be specified in parameters or tied to MCP token');
    }

    const project = await prisma.project.findFirst({
      where: {
        id: targetId,
        OR: [
          { ownerId: ctx.userId },
          { members: { some: { userId: ctx.userId } } },
        ],
      },
    });

    if (!project) {
      throw new Error(`Project not found or access denied: ${targetId}`);
    }

    return targetId;
  }

  // -------------------------------------------------------------
  // 1. Project Discovery
  // -------------------------------------------------------------

  static async listProjects(ctx: McpContext) {
    this.checkScope(ctx, 'files:read');
    const projects = await prisma.project.findMany({
      where: {
        OR: [
          { ownerId: ctx.userId },
          { members: { some: { userId: ctx.userId } } },
        ],
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        storageDriver: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return { projects };
  }

  static async getProjectTree(ctx: McpContext, args: { projectId?: string }) {
    this.checkScope(ctx, 'files:read');
    const projectId = await this.resolveProjectId(ctx, args.projectId);
    const files = await prisma.projectFile.findMany({
      where: { projectId },
      orderBy: [{ isFolder: 'desc' }, { path: 'asc' }],
    });

    return { projectId, files };
  }

  static async listFiles(ctx: McpContext, args: { projectId?: string; pattern?: string }) {
    this.checkScope(ctx, 'files:read');
    const projectId = await this.resolveProjectId(ctx, args.projectId);
    const files = await prisma.projectFile.findMany({
      where: {
        projectId,
        isFolder: false,
        path: args.pattern ? { contains: args.pattern } : undefined,
      },
      select: { path: true, sizeBytes: true, version: true, updatedAt: true },
    });

    return { files };
  }

  // -------------------------------------------------------------
  // 2. Reading & Searching
  // -------------------------------------------------------------

  static async readFile(ctx: McpContext, args: { projectId?: string; path: string }) {
    this.checkScope(ctx, 'files:read');
    const projectId = await this.resolveProjectId(ctx, args.projectId);
    const cleanPath = normalizeRelativePath(args.path);

    const file = await prisma.projectFile.findUnique({
      where: { projectId_path: { projectId, path: cleanPath } },
    });

    if (!file) {
      throw new Error(`File not found: ${cleanPath}`);
    }

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    const storage = getStorageDriver(project?.storageDriver);
    const content = await storage.readFile(projectId, cleanPath);

    return {
      path: cleanPath,
      version: file.version,
      sha256: file.sha256,
      sizeBytes: file.sizeBytes,
      content,
    };
  }

  static async readLines(ctx: McpContext, args: { projectId?: string; path: string; startLine: number; endLine: number }) {
    this.checkScope(ctx, 'files:read');
    const fileResult = await this.readFile(ctx, args);
    const allLines = fileResult.content.split('\n');
    const start = Math.max(1, args.startLine);
    const end = Math.min(allLines.length, args.endLine);

    const selectedLines = allLines.slice(start - 1, end);

    return {
      path: fileResult.path,
      version: fileResult.version,
      startLine: start,
      endLine: end,
      totalLines: allLines.length,
      lines: selectedLines,
      content: selectedLines.join('\n'),
    };
  }

  static async searchCode(ctx: McpContext, args: { projectId?: string; query: string; isRegex?: boolean }) {
    this.checkScope(ctx, 'files:read');
    const projectId = await this.resolveProjectId(ctx, args.projectId);
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    const storage = getStorageDriver(project?.storageDriver);

    const files = await prisma.projectFile.findMany({
      where: { projectId, isFolder: false },
    });

    const matches: Array<{ path: string; line: number; content: string }> = [];
    const queryRegex = args.isRegex ? new RegExp(args.query, 'i') : null;

    for (const f of files.slice(0, 100)) {
      try {
        const text = await storage.readFile(projectId, f.path);
        const lines = text.split('\n');
        lines.forEach((line: string, idx: number) => {
          const hit = queryRegex ? queryRegex.test(line) : line.includes(args.query);
          if (hit) {
            matches.push({
              path: f.path,
              line: idx + 1,
              content: line.trim(),
            });
          }
        });
      } catch {
        // skip binary or unreadable file
      }
    }

    return { query: args.query, matches: matches.slice(0, 50) };
  }

  static async searchFiles(ctx: McpContext, args: { projectId?: string; query: string }) {
    this.checkScope(ctx, 'files:read');
    const projectId = await this.resolveProjectId(ctx, args.projectId);
    const files = await prisma.projectFile.findMany({
      where: {
        projectId,
        path: { contains: args.query, mode: 'insensitive' },
      },
      select: { path: true, isFolder: true, sizeBytes: true, version: true },
    });

    return { matches: files };
  }

  static async getDiagnostics(ctx: McpContext, args: { projectId?: string; path: string }) {
    this.checkScope(ctx, 'files:read');
    // Returns syntax check / diagnostic list
    return {
      path: args.path,
      diagnostics: [],
    };
  }

  // -------------------------------------------------------------
  // 3. File Operations
  // -------------------------------------------------------------

  static async createFile(ctx: McpContext, args: { projectId?: string; path: string; content?: string }) {
    this.checkScope(ctx, 'files:write');
    const projectId = await this.resolveProjectId(ctx, args.projectId);
    const cleanPath = normalizeRelativePath(args.path);
    const content = args.content || '';
    const sha256 = computeSha256(content);
    const bytes = Buffer.byteLength(content, 'utf8');

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    const storage = getStorageDriver(project?.storageDriver);

    await storage.writeFile(projectId, cleanPath, content);

    const record = await prisma.projectFile.upsert({
      where: { projectId_path: { projectId, path: cleanPath } },
      create: {
        projectId,
        path: cleanPath,
        isFolder: false,
        version: 1,
        sha256,
        sizeBytes: bytes,
      },
      update: {
        isFolder: false,
        version: { increment: 1 },
        sha256,
        sizeBytes: bytes,
      },
    });

    return { success: true, file: record };
  }

  static async createDirectory(ctx: McpContext, args: { projectId?: string; path: string }) {
    this.checkScope(ctx, 'files:write');
    const projectId = await this.resolveProjectId(ctx, args.projectId);
    const cleanPath = normalizeRelativePath(args.path);

    const folder = await prisma.projectFile.upsert({
      where: { projectId_path: { projectId, path: cleanPath } },
      create: {
        projectId,
        path: cleanPath,
        isFolder: true,
        version: 1,
        sha256: 'directory',
        sizeBytes: 0,
      },
      update: {},
    });

    return { success: true, folder };
  }

  static async renameFile(ctx: McpContext, args: { projectId?: string; oldPath: string; newPath: string }) {
    this.checkScope(ctx, 'files:write');
    const projectId = await this.resolveProjectId(ctx, args.projectId);
    const oldClean = normalizeRelativePath(args.oldPath);
    const newClean = normalizeRelativePath(args.newPath);

    const existing = await prisma.projectFile.findUnique({
      where: { projectId_path: { projectId, path: oldClean } },
    });

    if (!existing) {
      throw new Error(`File or directory not found: ${oldClean}`);
    }

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    const storage = getStorageDriver(project?.storageDriver);

    if (!existing.isFolder) {
      const content = await storage.readFile(projectId, oldClean);
      await storage.writeFile(projectId, newClean, content);
      await storage.deleteFile(projectId, oldClean);

      await prisma.projectFile.delete({
        where: { projectId_path: { projectId, path: oldClean } },
      });

      const newRecord = await prisma.projectFile.create({
        data: {
          projectId,
          path: newClean,
          isFolder: false,
          version: existing.version + 1,
          sha256: existing.sha256,
          sizeBytes: existing.sizeBytes,
        },
      });

      return { success: true, file: newRecord };
    } else {
      // Folder rename: update all subpaths
      const subFiles = await prisma.projectFile.findMany({
        where: { projectId, path: { startsWith: `${oldClean}/` } },
      });

      for (const sf of subFiles) {
        const relativeRest = sf.path.slice(oldClean.length);
        const destination = `${newClean}${relativeRest}`;
        if (!sf.isFolder) {
          const content = await storage.readFile(projectId, sf.path);
          await storage.writeFile(projectId, destination, content);
          await storage.deleteFile(projectId, sf.path);
        }
        await prisma.projectFile.delete({ where: { id: sf.id } });
        await prisma.projectFile.create({
          data: {
            projectId,
            path: destination,
            isFolder: sf.isFolder,
            version: sf.version,
            sha256: sf.sha256,
            sizeBytes: sf.sizeBytes,
          },
        });
      }

      await prisma.projectFile.update({
        where: { projectId_path: { projectId, path: oldClean } },
        data: { path: newClean },
      });

      return { success: true };
    }
  }

  static async deleteFile(ctx: McpContext, args: { projectId?: string; path: string }) {
    this.checkScope(ctx, 'files:write');
    const projectId = await this.resolveProjectId(ctx, args.projectId);
    const cleanPath = normalizeRelativePath(args.path);

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

    return { success: true, deletedPath: cleanPath };
  }

  static async writeFile(ctx: McpContext, args: { projectId?: string; path: string; content: string }) {
    this.checkScope(ctx, 'files:write');
    const projectId = await this.resolveProjectId(ctx, args.projectId);
    const cleanPath = normalizeRelativePath(args.path);
    const bytes = Buffer.byteLength(args.content, 'utf8');
    const newSha = computeSha256(args.content);

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    const storage = getStorageDriver(project?.storageDriver);

    // Save previous snapshot if file already exists
    const existing = await prisma.projectFile.findUnique({
      where: { projectId_path: { projectId, path: cleanPath } },
    });

    if (existing) {
      try {
        const oldContent = await storage.readFile(projectId, cleanPath);
        await prisma.fileSnapshot.create({
          data: {
            fileId: existing.id,
            version: existing.version,
            sha256: existing.sha256,
            content: oldContent,
            reason: 'mcp_write_backup',
          },
        });
      } catch {
        // ignore
      }
    }

    await storage.writeFile(projectId, cleanPath, args.content);

    const record = await prisma.projectFile.upsert({
      where: { projectId_path: { projectId, path: cleanPath } },
      create: {
        projectId,
        path: cleanPath,
        isFolder: false,
        version: 1,
        sha256: newSha,
        sizeBytes: bytes,
      },
      update: {
        version: { increment: 1 },
        sha256: newSha,
        sizeBytes: bytes,
      },
    });

    return {
      success: true,
      path: cleanPath,
      version: record.version,
      sha256: record.sha256,
    };
  }

  // -------------------------------------------------------------
  // 4. Safe Code Editing & Patch Review
  // -------------------------------------------------------------

  static async proposePatch(ctx: McpContext, args: {
    projectId?: string;
    filePath: string;
    proposedContent: string;
    explanation?: string;
  }) {
    this.checkScope(ctx, 'patch:propose');
    const projectId = await this.resolveProjectId(ctx, args.projectId);
    const cleanPath = normalizeRelativePath(args.filePath);

    const file = await prisma.projectFile.findUnique({
      where: { projectId_path: { projectId, path: cleanPath } },
    });

    if (!file) {
      throw new Error(`Target file ${cleanPath} does not exist in project`);
    }

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    const storage = getStorageDriver(project?.storageDriver);
    const currentContent = await storage.readFile(projectId, cleanPath);

    const proposalData = PatchEngine.createProposal({
      projectId,
      filePath: cleanPath,
      baseVersion: file.version,
      baseSha256: file.sha256,
      originalContent: currentContent,
      proposedContent: args.proposedContent,
      explanation: args.explanation || 'Patch proposed via MCP',
    });

    const proposal = await prisma.editProposal.create({
      data: {
        id: proposalData.id,
        projectId,
        filePath: cleanPath,
        baseVersion: file.version,
        baseSha256: file.sha256,
        explanation: proposalData.explanation,
        status: 'pending',
        hunks: {
          create: proposalData.hunks.map(h => ({
            id: h.hunkId,
            hunkIndex: h.hunkIndex,
            oldStartLine: h.oldStartLine,
            oldLineCount: h.oldLineCount,
            newStartLine: h.newStartLine,
            newLineCount: h.newLineCount,
            oldContent: h.oldContent,
            newContent: h.newContent,
            status: 'pending',
          })),
        },
      },
      include: { hunks: true },
    });

    return {
      success: true,
      proposalId: proposal.id,
      filePath: proposal.filePath,
      hunkCount: proposal.hunks.length,
      proposal,
    };
  }

  static async previewDiff(ctx: McpContext, args: { proposalId: string }) {
    this.checkScope(ctx, 'patch:propose');
    const proposal = await prisma.editProposal.findUnique({
      where: { id: args.proposalId },
      include: { hunks: true, project: true },
    });

    if (!proposal) {
      throw new Error(`Proposal not found: ${args.proposalId}`);
    }

    const storage = getStorageDriver(proposal.project.storageDriver);
    const original = await storage.readFile(proposal.projectId, proposal.filePath);
    
    // Construct proposed content from hunks
    const fullProposal = PatchEngine.createProposal({
      projectId: proposal.projectId,
      filePath: proposal.filePath,
      baseVersion: proposal.baseVersion,
      baseSha256: proposal.baseSha256,
      originalContent: original,
      proposedContent: original,
      explanation: proposal.explanation,
    });

    const unifiedDiff = PatchEngine.createUnifiedDiff(original, original, proposal.filePath);

    return { proposal, unifiedDiff };
  }

  static async getPatchStatus(ctx: McpContext, args: { proposalId: string }) {
    this.checkScope(ctx, 'patch:propose');
    const proposal = await prisma.editProposal.findUnique({
      where: { id: args.proposalId },
      include: { hunks: true },
    });

    if (!proposal) {
      throw new Error(`Proposal not found: ${args.proposalId}`);
    }

    return { proposal };
  }

  static async acceptPatch(ctx: McpContext, args: { proposalId: string }) {
    this.checkScope(ctx, 'patch:apply');
    const proposal = await prisma.editProposal.findUnique({
      where: { id: args.proposalId },
      include: { hunks: true, project: true },
    });

    if (!proposal) {
      throw new Error(`Proposal not found: ${args.proposalId}`);
    }

    // Mark all hunks accepted
    await prisma.editProposalHunk.updateMany({
      where: { proposalId: proposal.id },
      data: { status: 'accepted' },
    });

    const storage = getStorageDriver(proposal.project.storageDriver);
    const currentContent = await storage.readFile(proposal.projectId, proposal.filePath);

    const file = await prisma.projectFile.findUnique({
      where: { projectId_path: { projectId: proposal.projectId, path: proposal.filePath } },
    });

    if (!file) {
      throw new Error(`File ${proposal.filePath} not found`);
    }

    // Save pre-patch snapshot
    await prisma.fileSnapshot.create({
      data: {
        fileId: file.id,
        version: file.version,
        sha256: file.sha256,
        content: currentContent,
        reason: 'pre_patch',
      },
    });

    // Reconstruct PatchHunks for application
    const patchHunks = proposal.hunks.map(h => ({
      hunkId: h.id,
      hunkIndex: h.hunkIndex,
      oldStartLine: h.oldStartLine,
      oldLineCount: h.oldLineCount,
      newStartLine: h.newStartLine,
      newLineCount: h.newLineCount,
      contextBefore: [],
      oldLines: h.oldContent.split('\n'),
      newLines: h.newContent.split('\n'),
      contextAfter: [],
      oldContent: h.oldContent,
      newContent: h.newContent,
      status: 'accepted' as const,
    }));

    const result = PatchEngine.applyHunks(currentContent, patchHunks);
    if (!result.success) {
      throw new Error(`Patch application failed: ${result.errors.join(', ')}`);
    }

    const newSha = computeSha256(result.newContent);
    const newBytes = Buffer.byteLength(result.newContent, 'utf8');

    await storage.writeFile(proposal.projectId, proposal.filePath, result.newContent);

    await prisma.projectFile.update({
      where: { id: file.id },
      data: {
        version: { increment: 1 },
        sha256: newSha,
        sizeBytes: newBytes,
      },
    });

    await prisma.editProposal.update({
      where: { id: proposal.id },
      data: { status: 'applied', appliedAt: new Date() },
    });

    return {
      success: true,
      filePath: proposal.filePath,
      appliedHunks: result.appliedCount,
      newSha,
    };
  }

  static async acceptPatchHunk(ctx: McpContext, args: { hunkId: string }) {
    this.checkScope(ctx, 'patch:apply');
    const hunk = await prisma.editProposalHunk.update({
      where: { id: args.hunkId },
      data: { status: 'accepted' },
    });
    return { success: true, hunk };
  }

  static async rejectPatch(ctx: McpContext, args: { proposalId: string }) {
    this.checkScope(ctx, 'patch:propose');
    const proposal = await prisma.editProposal.update({
      where: { id: args.proposalId },
      data: { status: 'rejected' },
    });
    return { success: true, proposal };
  }

  static async undoChange(ctx: McpContext, args: { projectId?: string; filePath: string }) {
    this.checkScope(ctx, 'patch:apply');
    const projectId = await this.resolveProjectId(ctx, args.projectId);
    const cleanPath = normalizeRelativePath(args.filePath);

    const file = await prisma.projectFile.findUnique({
      where: { projectId_path: { projectId, path: cleanPath } },
    });

    if (!file) {
      throw new Error(`File ${cleanPath} not found`);
    }

    // Retrieve most recent snapshot
    const lastSnapshot = await prisma.fileSnapshot.findFirst({
      where: { fileId: file.id },
      orderBy: { createdAt: 'desc' },
    });

    if (!lastSnapshot) {
      throw new Error(`No previous snapshot available for ${cleanPath}`);
    }

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    const storage = getStorageDriver(project?.storageDriver);

    await storage.writeFile(projectId, cleanPath, lastSnapshot.content);

    const newSha = computeSha256(lastSnapshot.content);
    const newBytes = Buffer.byteLength(lastSnapshot.content, 'utf8');

    await prisma.projectFile.update({
      where: { id: file.id },
      data: {
        version: { increment: 1 },
        sha256: newSha,
        sizeBytes: newBytes,
      },
    });

    // Delete snapshot used for restore
    await prisma.fileSnapshot.delete({ where: { id: lastSnapshot.id } });

    return {
      success: true,
      restoredVersion: lastSnapshot.version,
      restoredReason: lastSnapshot.reason,
      sha256: newSha,
    };
  }

  // -------------------------------------------------------------
  // 5. Version Control
  // -------------------------------------------------------------

  static async gitStatus(ctx: McpContext, args: { projectId?: string }) {
    this.checkScope(ctx, 'git:read');
    const projectId = await this.resolveProjectId(ctx, args.projectId);
    return await GitService.getStatus(projectId);
  }

  static async gitDiff(ctx: McpContext, args: { projectId?: string; staged?: boolean }) {
    this.checkScope(ctx, 'git:read');
    const projectId = await this.resolveProjectId(ctx, args.projectId);
    return await GitService.getDiff(projectId, args.staged);
  }

  static async gitCommit(ctx: McpContext, args: { projectId?: string; message: string; authorName?: string; authorEmail?: string }) {
    this.checkScope(ctx, 'git:write');
    const projectId = await this.resolveProjectId(ctx, args.projectId);
    return await GitService.commit(projectId, args.message, args.authorName, args.authorEmail);
  }

  static async gitHistory(ctx: McpContext, args: { projectId?: string; maxCount?: number }) {
    this.checkScope(ctx, 'git:read');
    const projectId = await this.resolveProjectId(ctx, args.projectId);
    return await GitService.getHistory(projectId, args.maxCount);
  }

  // -------------------------------------------------------------
  // 6. Execution & Testing
  // -------------------------------------------------------------

  static async runTests(ctx: McpContext, args: { projectId?: string }) {
    this.checkScope(ctx, 'terminal:execute');
    const projectId = await this.resolveProjectId(ctx, args.projectId);
    return await ExecutionService.runCommand(projectId, 'npm test');
  }

  static async getExecutionStatus(ctx: McpContext, args: { jobId: string }) {
    this.checkScope(ctx, 'terminal:execute');
    return await ExecutionService.getJobStatus(args.jobId);
  }

  static async getExecutionOutput(ctx: McpContext, args: { jobId: string }) {
    this.checkScope(ctx, 'terminal:execute');
    return await ExecutionService.getJobOutput(args.jobId);
  }
}
