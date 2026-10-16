import { Response } from 'express';
import { prisma } from '../db/prisma.js';
import { AuthRequest } from '../middleware/auth.js';
import { generateMcpToken } from '../utils/crypto.js';
import { ALL_MCP_SCOPES, McpScope } from '../../shared/types.js';

export class McpController {
  static async listTokens(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tokens = await prisma.mcpToken.findMany({
        where: { userId: req.user!.id },
        include: { project: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      });

      const formatted = tokens.map(t => ({
        id: t.id,
        name: t.name,
        tokenPrefix: `mcp_live_${t.tokenHash.slice(0, 8)}...`,
        scopes: t.scopes as McpScope[],
        projectId: t.projectId,
        projectName: t.project?.name,
        expiresAt: t.expiresAt?.toISOString() || null,
        lastUsedAt: t.lastUsedAt?.toISOString() || null,
        createdAt: t.createdAt.toISOString(),
      }));

      res.json({ tokens: formatted });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to list MCP tokens', details: err.message });
    }
  }

  static async createToken(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { name, projectId, scopes } = req.body;
      if (!name) {
        res.status(400).json({ error: 'Token name is required' });
        return;
      }

      const assignedScopes = scopes && Array.isArray(scopes) && scopes.length > 0 ? scopes : ALL_MCP_SCOPES;
      const { rawToken, tokenHash, prefix } = generateMcpToken();

      const created = await prisma.mcpToken.create({
        data: {
          tokenHash,
          name,
          userId: req.user!.id,
          projectId: projectId || null,
          scopes: assignedScopes,
        },
      });

      const appUrl = process.env.APP_URL || `http://${req.headers.host || 'localhost:3000'}`;
      const mcpEndpoint = `${appUrl}/mcp`;

      // Provide ready-to-use configuration snippet for Claude Desktop / Cursor
      const configSnippet = {
        mcpServers: {
          forgecode: {
            url: mcpEndpoint,
            headers: {
              Authorization: `Bearer ${rawToken}`,
            },
          },
        },
      };

      res.status(201).json({
        id: created.id,
        name: created.name,
        token: rawToken, // plain text returned ONLY at creation time
        tokenPrefix: prefix,
        scopes: created.scopes,
        projectId: created.projectId,
        endpoint: mcpEndpoint,
        configSnippet,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to create MCP token', details: err.message });
    }
  }

  static async deleteToken(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const token = await prisma.mcpToken.findUnique({ where: { id } });
      if (!token) {
        res.status(404).json({ error: 'Token not found' });
        return;
      }

      if (token.userId !== req.user!.id && req.user!.role !== 'admin') {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      await prisma.mcpToken.delete({ where: { id } });
      res.json({ success: true, message: 'MCP token revoked successfully' });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to revoke token', details: err.message });
    }
  }

  static async getAuditLogs(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userTokens = await prisma.mcpToken.findMany({
        where: { userId: req.user!.id },
        select: { id: true },
      });

      const tokenIds = userTokens.map(t => t.id);

      const logs = await prisma.mcpAuditLog.findMany({
        where: { tokenId: { in: tokenIds } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });

      res.json({ logs });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch MCP audit logs', details: err.message });
    }
  }
}
