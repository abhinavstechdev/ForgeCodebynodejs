import { Response } from 'express';
import { prisma } from '../db/prisma.js';
import { AuthRequest } from '../middleware/auth.js';
import { getStorageDriver } from '../services/storage/index.js';
import { PatchEngine } from '../services/patchEngine.js';
import { computeSha256 } from '../utils/crypto.js';

export class PatchController {
  static async list(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const proposals = await prisma.editProposal.findMany({
        where: { projectId },
        include: {
          hunks: { orderBy: { hunkIndex: 'asc' } },
        },
        orderBy: { createdAt: 'desc' },
      });

      res.json({ proposals });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to list proposals', details: err.message });
    }
  }

  static async getById(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { proposalId } = req.params;
      const proposal = await prisma.editProposal.findUnique({
        where: { id: proposalId },
        include: {
          hunks: { orderBy: { hunkIndex: 'asc' } },
          project: true,
        },
      });

      if (!proposal) {
        res.status(404).json({ error: 'Proposal not found' });
        return;
      }

      const storage = getStorageDriver(proposal.project.storageDriver);
      const originalContent = await storage.readFile(proposal.projectId, proposal.filePath);

      res.json({ proposal, originalContent });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch proposal', details: err.message });
    }
  }

  static async updateHunk(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { hunkId } = req.params;
      const { status } = req.body; // 'accepted' | 'rejected' | 'pending'

      if (!['accepted', 'rejected', 'pending'].includes(status)) {
        res.status(400).json({ error: 'Invalid status' });
        return;
      }

      const updated = await prisma.editProposalHunk.update({
        where: { id: hunkId },
        data: { status },
      });

      res.json({ hunk: updated });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to update hunk', details: err.message });
    }
  }

  static async apply(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { proposalId } = req.params;
      const proposal = await prisma.editProposal.findUnique({
        where: { id: proposalId },
        include: {
          hunks: { orderBy: { hunkIndex: 'asc' } },
          project: true,
        },
      });

      if (!proposal) {
        res.status(404).json({ error: 'Proposal not found' });
        return;
      }

      const storage = getStorageDriver(proposal.project.storageDriver);
      const currentContent = await storage.readFile(proposal.projectId, proposal.filePath);

      const file = await prisma.projectFile.findUnique({
        where: { projectId_path: { projectId: proposal.projectId, path: proposal.filePath } },
      });

      if (!file) {
        res.status(404).json({ error: 'Target file not found' });
        return;
      }

      // Check for concurrent conflict
      if (file.sha256 !== proposal.baseSha256) {
        // Warn about drift
      }

      // Snapshot previous content
      await prisma.fileSnapshot.create({
        data: {
          fileId: file.id,
          version: file.version,
          sha256: file.sha256,
          content: currentContent,
          reason: 'pre_patch',
        },
      });

      // Map to patch engine hunk model
      const patchHunks = proposal.hunks.map(h => ({
        hunkId: h.id,
        hunkIndex: h.hunkIndex,
        oldStartLine: h.oldStartLine,
        oldLineCount: h.oldLineCount,
        newStartLine: h.newStartLine,
        newLineCount: h.newLineCount,
        contextBefore: [],
        oldLines: h.oldContent ? h.oldContent.split('\n') : [],
        newLines: h.newContent ? h.newContent.split('\n') : [],
        contextAfter: [],
        oldContent: h.oldContent,
        newContent: h.newContent,
        status: h.status as any,
      }));

      // If user hasn't explicitly accepted individual hunks, accept all non-rejected ones
      const hasExplicit = patchHunks.some(h => h.status === 'accepted');
      if (!hasExplicit) {
        patchHunks.forEach(h => {
          if (h.status !== 'rejected') h.status = 'accepted';
        });
      }

      const result = PatchEngine.applyHunks(currentContent, patchHunks);
      if (!result.success) {
        res.status(422).json({
          error: 'Could not cleanly apply patch hunks',
          details: result.errors,
        });
        return;
      }

      const newSha256 = computeSha256(result.newContent);
      const newBytes = Buffer.byteLength(result.newContent, 'utf8');

      // Save new file content
      await storage.writeFile(proposal.projectId, proposal.filePath, result.newContent);

      const updatedFile = await prisma.projectFile.update({
        where: { id: file.id },
        data: {
          version: { increment: 1 },
          sha256: newSha256,
          sizeBytes: newBytes,
          updatedAt: new Date(),
        },
      });

      await prisma.editProposal.update({
        where: { id: proposal.id },
        data: { status: 'applied', appliedAt: new Date() },
      });

      res.json({
        success: true,
        file: updatedFile,
        appliedHunks: result.appliedCount,
        newContent: result.newContent,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to apply patch', details: err.message });
    }
  }

  static async undo(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const { filePath } = req.body;

      if (!filePath) {
        res.status(400).json({ error: 'filePath is required' });
        return;
      }

      const file = await prisma.projectFile.findUnique({
        where: { projectId_path: { projectId, path: filePath } },
      });

      if (!file) {
        res.status(404).json({ error: 'File not found' });
        return;
      }

      const lastSnapshot = await prisma.fileSnapshot.findFirst({
        where: { fileId: file.id },
        orderBy: { createdAt: 'desc' },
      });

      if (!lastSnapshot) {
        res.status(400).json({ error: 'No previous snapshot found to revert to' });
        return;
      }

      const project = await prisma.project.findUnique({ where: { id: projectId } });
      const storage = getStorageDriver(project?.storageDriver);

      await storage.writeFile(projectId, filePath, lastSnapshot.content);

      const newSha256 = computeSha256(lastSnapshot.content);
      const newBytes = Buffer.byteLength(lastSnapshot.content, 'utf8');

      const updated = await prisma.projectFile.update({
        where: { id: file.id },
        data: {
          version: { increment: 1 },
          sha256: newSha256,
          sizeBytes: newBytes,
          updatedAt: new Date(),
        },
      });

      // Remove snapshot used for revert
      await prisma.fileSnapshot.delete({ where: { id: lastSnapshot.id } });

      res.json({
        success: true,
        message: `Successfully reverted ${filePath} to snapshot v${lastSnapshot.version}`,
        file: updated,
        content: lastSnapshot.content,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Undo failed', details: err.message });
    }
  }
}
