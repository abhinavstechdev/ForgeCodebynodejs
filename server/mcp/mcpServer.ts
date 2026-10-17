import { Request, Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { hashToken } from '../utils/crypto.js';
import { McpToolsHandler, McpContext } from './tools.js';

// Map of active SSE sessions by sessionId
const activeTransports = new Map<string, SSEServerTransport>();
const sessionContexts = new Map<string, McpContext>();

export function createConfiguredMcpServer(ctx: McpContext): McpServer {
  const server = new McpServer({
    name: 'ForgeCode AI IDE MCP Server',
    version: '1.0.0',
  });

  const wrapHandler = (toolName: string, fn: (args: any) => Promise<any>) => {
    return async (args: any) => {
      const startTime = Date.now();
      let statusCode = 200;
      try {
        const result = await fn(args);
        await prisma.mcpAuditLog.create({
          data: {
            tokenId: ctx.tokenId,
            toolName,
            parameters: args || {},
            statusCode: 200,
            durationMs: Date.now() - startTime,
          },
        }).catch(() => {});
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        statusCode = 500;
        await prisma.mcpAuditLog.create({
          data: {
            tokenId: ctx.tokenId,
            toolName,
            parameters: args || {},
            statusCode: 500,
            durationMs: Date.now() - startTime,
          },
        }).catch(() => {});
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Error executing ${toolName}: ${err.message}` }],
        };
      }
    };
  };

  // 1. Discovery
  server.tool(
    'list_projects',
    'Lists all ForgeCode projects accessible to the authenticated user',
    {},
    wrapHandler('list_projects', () => McpToolsHandler.listProjects(ctx))
  );

  server.tool(
    'get_project_tree',
    'Returns recursive project folder and file structure with metadata',
    { projectId: z.string().optional() },
    wrapHandler('get_project_tree', args => McpToolsHandler.getProjectTree(ctx, args))
  );

  server.tool(
    'list_files',
    'Lists project files optionally filtered by pattern',
    { projectId: z.string().optional(), pattern: z.string().optional() },
    wrapHandler('list_files', args => McpToolsHandler.listFiles(ctx, args))
  );

  // 2. Reading & Searching
  server.tool(
    'read_file',
    'Reads the entire text content of a file in the project',
    { projectId: z.string().optional(), path: z.string() },
    wrapHandler('read_file', args => McpToolsHandler.readFile(ctx, args))
  );

  server.tool(
    'read_lines',
    'Reads specific line ranges to conserve tokens',
    {
      projectId: z.string().optional(),
      path: z.string(),
      startLine: z.number().int().min(1),
      endLine: z.number().int().min(1),
    },
    wrapHandler('read_lines', args => McpToolsHandler.readLines(ctx, args))
  );

  server.tool(
    'search_code',
    'Searches code content across project files using regex or literal strings',
    {
      projectId: z.string().optional(),
      query: z.string(),
      isRegex: z.boolean().optional(),
    },
    wrapHandler('search_code', args => McpToolsHandler.searchCode(ctx, args))
  );

  server.tool(
    'search_files',
    'Searches for files by file name or path pattern',
    { projectId: z.string().optional(), query: z.string() },
    wrapHandler('search_files', args => McpToolsHandler.searchFiles(ctx, args))
  );

  server.tool(
    'get_diagnostics',
    'Returns syntax or linter diagnostics for a given file',
    { projectId: z.string().optional(), path: z.string() },
    wrapHandler('get_diagnostics', args => McpToolsHandler.getDiagnostics(ctx, args))
  );

  // 3. File Operations
  server.tool(
    'create_file',
    'Creates a new file with initial content',
    {
      projectId: z.string().optional(),
      path: z.string(),
      content: z.string().optional(),
    },
    wrapHandler('create_file', args => McpToolsHandler.createFile(ctx, args))
  );

  server.tool(
    'create_directory',
    'Creates a directory and parent folders if required',
    { projectId: z.string().optional(), path: z.string() },
    wrapHandler('create_directory', args => McpToolsHandler.createDirectory(ctx, args))
  );

  server.tool(
    'rename_file',
    'Moves or renames a file or directory',
    {
      projectId: z.string().optional(),
      oldPath: z.string(),
      newPath: z.string(),
    },
    wrapHandler('rename_file', args => McpToolsHandler.renameFile(ctx, args))
  );

  server.tool(
    'delete_file',
    'Deletes a file or directory from the project',
    { projectId: z.string().optional(), path: z.string() },
    wrapHandler('delete_file', args => McpToolsHandler.deleteFile(ctx, args))
  );

  server.tool(
    'write_file',
    'Writes or overwrites complete file content with automated snapshot backup',
    {
      projectId: z.string().optional(),
      path: z.string(),
      content: z.string(),
    },
    wrapHandler('write_file', args => McpToolsHandler.writeFile(ctx, args))
  );

  // 4. Safe Code Editing
  server.tool(
    'propose_patch',
    'Submits a line-by-line patch proposal for developer review in ForgeCode IDE',
    {
      projectId: z.string().optional(),
      filePath: z.string(),
      proposedContent: z.string(),
      explanation: z.string().optional(),
    },
    wrapHandler('propose_patch', args => McpToolsHandler.proposePatch(ctx, args))
  );

  server.tool(
    'preview_diff',
    'Returns calculated diff for a proposal before applying',
    { proposalId: z.string() },
    wrapHandler('preview_diff', args => McpToolsHandler.previewDiff(ctx, args))
  );

  server.tool(
    'get_patch_status',
    'Checks whether a patch proposal is pending, applied, or rejected',
    { proposalId: z.string() },
    wrapHandler('get_patch_status', args => McpToolsHandler.getPatchStatus(ctx, args))
  );

  server.tool(
    'accept_patch',
    'Approves and applies all hunks in a patch proposal atomically to persistent storage',
    { proposalId: z.string() },
    wrapHandler('accept_patch', args => McpToolsHandler.acceptPatch(ctx, args))
  );

  server.tool(
    'accept_patch_hunk',
    'Approves an individual hunk within a patch proposal',
    { hunkId: z.string() },
    wrapHandler('accept_patch_hunk', args => McpToolsHandler.acceptPatchHunk(ctx, args))
  );

  server.tool(
    'reject_patch',
    'Rejects and discards a patch proposal',
    { proposalId: z.string() },
    wrapHandler('reject_patch', args => McpToolsHandler.rejectPatch(ctx, args))
  );

  server.tool(
    'undo_change',
    'Reverts a file to its snapshot prior to the last patch application',
    { projectId: z.string().optional(), filePath: z.string() },
    wrapHandler('undo_change', args => McpToolsHandler.undoChange(ctx, args))
  );

  // 5. Version Control
  server.tool(
    'git_status',
    'Returns current branch, staged, unstaged, and untracked files',
    { projectId: z.string().optional() },
    wrapHandler('git_status', args => McpToolsHandler.gitStatus(ctx, args))
  );

  server.tool(
    'git_diff',
    'Returns git diff of working directory or staged modifications',
    { projectId: z.string().optional(), staged: z.boolean().optional() },
    wrapHandler('git_diff', args => McpToolsHandler.gitDiff(ctx, args))
  );

  server.tool(
    'git_commit',
    'Creates a git commit with specified message',
    {
      projectId: z.string().optional(),
      message: z.string(),
      authorName: z.string().optional(),
      authorEmail: z.string().optional(),
    },
    wrapHandler('git_commit', args => McpToolsHandler.gitCommit(ctx, args))
  );

  server.tool(
    'git_history',
    'Returns recent git commit history',
    { projectId: z.string().optional(), maxCount: z.number().optional() },
    wrapHandler('git_history', args => McpToolsHandler.gitHistory(ctx, args))
  );

  // 6. Execution & Testing
  server.tool(
    'run_tests',
    'Triggers project test suite (e.g. npm test) in isolated execution sandbox',
    { projectId: z.string().optional() },
    wrapHandler('run_tests', args => McpToolsHandler.runTests(ctx, args))
  );

  server.tool(
    'get_execution_status',
    'Checks the status of an execution job',
    { jobId: z.string() },
    wrapHandler('get_execution_status', args => McpToolsHandler.getExecutionStatus(ctx, args))
  );

  server.tool(
    'get_execution_output',
    'Retrieves stdout/stderr output from an execution job',
    { jobId: z.string() },
    wrapHandler('get_execution_output', args => McpToolsHandler.getExecutionOutput(ctx, args))
  );

  return server;
}

/**
 * Validates incoming Bearer token against prisma.mcpToken
 */
export async function authenticateMcpRequest(req: Request): Promise<McpContext | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const rawToken = authHeader.substring(7).trim();
  const tokenHash = hashToken(rawToken);

  const tokenRecord = await prisma.mcpToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!tokenRecord) {
    return null;
  }

  if (tokenRecord.expiresAt && tokenRecord.expiresAt < new Date()) {
    return null;
  }

  // Update lastUsedAt asynchronously
  await prisma.mcpToken.update({
    where: { id: tokenRecord.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => {});

  return {
    userId: tokenRecord.userId,
    tokenId: tokenRecord.id,
    scopes: tokenRecord.scopes,
    defaultProjectId: tokenRecord.projectId,
  };
}

function getBaseUrl(req: Request): string {
  const forwardedProto = req.get('x-forwarded-proto');
  const protocol = forwardedProto ? forwardedProto.split(',')[0].trim() : req.protocol;
  const host = req.get('host') || 'forgecode-ai.getvoroa.com';
  return `${protocol}://${host}`;
}

export async function getAnonymousMcpContext(): Promise<McpContext> {
  const defaultUser = await prisma.user.findFirst({
    include: {
      projects: {
        orderBy: { createdAt: 'asc' },
        take: 1,
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return {
    userId: defaultUser?.id || 'anonymous-user',
    tokenId: 'anonymous-session',
    scopes: ['*'],
    defaultProjectId: defaultUser?.projects[0]?.id || null,
  };
}

/**
 * Express Route Handlers for MCP SSE Transport
 */
export async function handleMcpSse(req: Request, res: Response) {
  let ctx = await authenticateMcpRequest(req);

  // If an invalid bearer token was supplied
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ') && !ctx) {
    const baseUrl = getBaseUrl(req);
    res.setHeader(
      'WWW-Authenticate',
      `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource", scope="files:read files:write"`
    );
    res.status(401).json({ error: 'Unauthorized: Invalid or expired MCP bearer token' });
    return;
  }

  // If client explicitly requests auth challenge
  if (!ctx && (req.query.auth === 'required' || req.headers['x-mcp-require-auth'] === 'true')) {
    const baseUrl = getBaseUrl(req);
    res.setHeader(
      'WWW-Authenticate',
      `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource", scope="files:read files:write"`
    );
    res.status(401).json({ error: 'Unauthorized: MCP bearer token required' });
    return;
  }

  // If no auth provided, connect seamlessly in No-Auth (Anonymous/Public) Mode
  if (!ctx) {
    ctx = await getAnonymousMcpContext();
  }

  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  const transport = new SSEServerTransport('/mcp/messages', res);
  const mcpServer = createConfiguredMcpServer(ctx);

  activeTransports.set(transport.sessionId, transport);
  sessionContexts.set(transport.sessionId, ctx);

  transport.onclose = () => {
    activeTransports.delete(transport.sessionId);
    sessionContexts.delete(transport.sessionId);
  };

  await mcpServer.connect(transport);
}

export async function handleMcpMessage(req: Request, res: Response) {
  const sessionId = req.query.sessionId as string;
  if (!sessionId) {
    res.status(400).send('Missing sessionId query parameter');
    return;
  }

  const transport = activeTransports.get(sessionId);
  if (!transport) {
    res.status(404).send('Session not found or expired');
    return;
  }

  await transport.handlePostMessage(req, res);
}
