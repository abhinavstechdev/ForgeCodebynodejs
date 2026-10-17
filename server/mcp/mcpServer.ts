import { Request, Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
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
        const errorPayload = {
          success: false,
          isError: true,
          errorCode: err.code || (err.name === 'Error' && err.message.includes('Permission denied') ? 'AUTH_SCOPE_MISSING' : 'GIT_OPERATION_FAILED'),
          message: err.message,
          details: err.details,
        };
        return {
          isError: true,
          content: [{ type: 'text' as const, text: JSON.stringify(errorPayload, null, 2) }],
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

  // 5. Version Control & GitHub Integration
  server.tool(
    'git_status',
    'Returns full structured repository status: current branch, commit hash, upstream, ahead/behind counts, staged, unstaged, untracked, deleted, conflicted files, and in-progress operations.',
    {
      projectId: z.string().optional().describe('Project UUID. Defaults to active workspace.'),
    },
    wrapHandler('git_status', args => McpToolsHandler.gitStatus(ctx, args))
  );

  server.tool(
    'git_diff',
    'Returns git diff of working directory or staged modifications with statistics, line truncation limits, and secret scrubbing.',
    {
      projectId: z.string().optional().describe('Project UUID. Defaults to active workspace.'),
      staged: z.boolean().optional().describe('Diff staged changes against HEAD instead of working directory changes'),
      fromRevision: z.string().optional().describe('Base commit SHA or branch reference'),
      toRevision: z.string().optional().describe('Target commit SHA or branch reference'),
      filePath: z.string().optional().describe('Optional specific file path to limit diff'),
      maxLines: z.number().int().min(1).optional().describe('Maximum lines of diff output to return before truncation (default 1000)'),
    },
    wrapHandler('git_diff', args => McpToolsHandler.gitDiff(ctx, args))
  );

  server.tool(
    'git_commit',
    'Creates a git commit with specified message, rejecting empty commits unless files were staged or auto-staged.',
    {
      projectId: z.string().optional().describe('Project UUID. Defaults to active workspace.'),
      message: z.string().describe('Commit message explaining changes'),
      authorName: z.string().optional().describe('Author display name'),
      authorEmail: z.string().optional().describe('Author email address'),
    },
    wrapHandler('git_commit', args => McpToolsHandler.gitCommit(ctx, args))
  );

  server.tool(
    'git_push',
    'Pushes local commits directly to a remote GitHub repository. Supports authenticated GitHub Personal Access Tokens (PAT), branch targets, force push, and optional auto-commit.',
    {
      projectId: z.string().optional().describe('Project UUID. Defaults to active workspace.'),
      remoteUrl: z.string().optional().describe('Remote GitHub repository URL, e.g. https://github.com/owner/repo.git'),
      token: z.string().optional().describe('GitHub Personal Access Token (PAT, e.g. ghp_... or github_pat_...) for authenticated push access'),
      branch: z.string().optional().describe('Target branch to push to (defaults to current branch or "main")'),
      commitMessage: z.string().optional().describe('Optional commit message to stage and commit uncommitted changes before pushing'),
      force: z.boolean().optional().describe('Force push to remote repository (use with caution)'),
      remoteName: z.string().optional().describe('Remote name in git configuration (defaults to "origin")'),
    },
    wrapHandler('git_push', args => McpToolsHandler.gitPush(ctx, args))
  );

  server.tool(
    'git_history',
    'Returns structured commit history with commit SHA, message, author name, timestamp, and parent commits.',
    {
      projectId: z.string().optional().describe('Project UUID. Defaults to active workspace.'),
      maxCount: z.number().int().min(1).optional().describe('Maximum number of commits to retrieve (default 25)'),
      branch: z.string().optional().describe('Branch name to inspect history of'),
      fromRevision: z.string().optional().describe('Starting revision (commit SHA or ref)'),
      toRevision: z.string().optional().describe('Ending revision (commit SHA or ref)'),
      filePath: z.string().optional().describe('Optional specific file path to filter commits by'),
    },
    wrapHandler('git_history', args => McpToolsHandler.gitHistory(ctx, args))
  );

  server.tool(
    'git_sync',
    'Unified Smart Git Sync engine: verifies working tree, fetches updates, classifies divergence, reconciles via safe fast-forward, merge, or rebase, and pushes to remote with verification.',
    {
      projectId: z.string().optional().describe('Project identifier. Defaults to active workspace.'),
      remoteName: z.string().optional().describe('Remote name to synchronize with (defaults to "origin")'),
      branch: z.string().optional().describe('Target branch to synchronize. Defaults to current branch or upstream.'),
      strategy: z.enum(['safe', 'ff-only', 'merge', 'rebase']).optional().describe('Reconciliation strategy: safe, ff-only, merge, or rebase (default safe)'),
      push: z.boolean().optional().describe('Whether to push local commits to remote after successful reconciliation (default false)'),
      commitMessage: z.string().optional().describe('Optional commit message to safely auto-commit uncommitted changes before sync'),
      force: z.boolean().optional().describe('Explicit opt-in required for force-pushing (warning: may overwrite remote history)'),
      dryRun: z.boolean().optional().describe('Simulate the synchronization process without modifying working tree or pushing (default false)'),
      token: z.string().optional().describe('Optional GitHub Personal Access Token if not configured in environment'),
    },
    wrapHandler('git_sync', args => McpToolsHandler.gitSync(ctx, args))
  );

  server.tool(
    'clone_repository',
    'Clones a remote Git repository (public or private with token) into a local workspace and synchronizes with storage adapter.',
    {
      repositoryUrl: z.string().describe('Remote repository URL (HTTPS, SSH, or git://)'),
      projectId: z.string().optional().describe('Target project ID to associate cloned workspace with'),
      projectName: z.string().optional().describe('Display name for cloned project if creating a new workspace'),
      branch: z.string().optional().describe('Specific branch or tag to checkout on clone'),
      depth: z.number().int().min(1).optional().describe('Create a shallow clone with history truncated to the specified depth'),
      destinationPath: z.string().optional().describe('Custom destination path within storage sandbox'),
      token: z.string().optional().describe('GitHub token for authenticated private repository access'),
    },
    wrapHandler('clone_repository', args => McpToolsHandler.cloneRepository(ctx, args))
  );

  server.tool(
    'git_fetch',
    'Fetches branches and tags from a remote repository without integrating them into current working branches.',
    {
      projectId: z.string().optional().describe('Project UUID. Defaults to active workspace.'),
      remoteName: z.string().optional().describe('Remote name to fetch from (default "origin")'),
      branch: z.string().optional().describe('Optional specific branch ref to fetch'),
      token: z.string().optional().describe('GitHub token for authenticated access'),
    },
    wrapHandler('git_fetch', args => McpToolsHandler.gitFetch(ctx, args))
  );

  server.tool(
    'git_pull',
    'Fetches from and integrates with another repository or a local branch safely without discarding local changes.',
    {
      projectId: z.string().optional().describe('Project UUID. Defaults to active workspace.'),
      remoteName: z.string().optional().describe('Remote name (default "origin")'),
      branch: z.string().optional().describe('Branch to pull from'),
      token: z.string().optional().describe('GitHub token for authenticated access'),
      strategy: z.enum(['safe', 'ff-only', 'merge']).optional().describe('Integration strategy (default "safe")'),
    },
    wrapHandler('git_pull', args => McpToolsHandler.gitPull(ctx, args))
  );

  server.tool(
    'git_branch_list',
    'Lists local and optionally remote-tracking branches with current checkout indicators and commit hashes.',
    {
      projectId: z.string().optional().describe('Project UUID. Defaults to active workspace.'),
      includeRemote: z.boolean().optional().describe('Include remote-tracking branches (default true)'),
    },
    wrapHandler('git_branch_list', args => McpToolsHandler.branchList(ctx, args))
  );

  server.tool(
    'git_branch_create',
    'Creates a new branch at the specified starting revision and optionally checks it out.',
    {
      projectId: z.string().optional().describe('Project UUID. Defaults to active workspace.'),
      branchName: z.string().describe('Name of the new branch to create'),
      startPoint: z.string().optional().describe('Starting commit SHA or ref for the new branch'),
      checkout: z.boolean().optional().describe('Automatically switch to the new branch upon creation (default true)'),
    },
    wrapHandler('git_branch_create', args => McpToolsHandler.branchCreate(ctx, args))
  );

  server.tool(
    'git_branch_switch',
    'Switches to a different branch, safely refusing if uncommitted modifications would be overwritten.',
    {
      projectId: z.string().optional().describe('Project UUID. Defaults to active workspace.'),
      branchName: z.string().describe('Branch name to checkout'),
      create: z.boolean().optional().describe('Create branch if it does not already exist'),
    },
    wrapHandler('git_branch_switch', args => McpToolsHandler.branchSwitch(ctx, args))
  );

  server.tool(
    'git_branch_delete',
    'Deletes a local branch with safety checks protecting currently checked-out branch.',
    {
      projectId: z.string().optional().describe('Project UUID. Defaults to active workspace.'),
      branchName: z.string().describe('Branch name to delete (cannot delete currently checked out branch)'),
      force: z.boolean().optional().describe('Force delete branch even if unmerged (default false)'),
    },
    wrapHandler('git_branch_delete', args => McpToolsHandler.branchDelete(ctx, args))
  );

  server.tool(
    'git_set_upstream',
    'Configures tracking information for a local branch to an upstream remote repository branch.',
    {
      projectId: z.string().optional().describe('Project UUID. Defaults to active workspace.'),
      branch: z.string().optional().describe('Local branch name (defaults to current branch)'),
      remote: z.string().optional().describe('Remote name (default "origin")'),
      upstreamBranch: z.string().optional().describe('Remote branch name (defaults to local branch name)'),
    },
    wrapHandler('git_set_upstream', args => McpToolsHandler.setUpstream(ctx, args))
  );

  server.tool(
    'github_repo_info',
    'Retrieves repository metadata from GitHub API including default branch, permissions, visibility, and clone URLs.',
    {
      owner: z.string().describe('GitHub repository owner (user or organization)'),
      repo: z.string().describe('GitHub repository name'),
      token: z.string().optional().describe('GitHub token for authentication'),
    },
    wrapHandler('github_repo_info', args => McpToolsHandler.githubRepoInfo(ctx, args))
  );

  server.tool(
    'github_list_pull_requests',
    'Lists GitHub pull requests for a repository with status, branch references, and author details.',
    {
      owner: z.string().describe('GitHub repository owner'),
      repo: z.string().describe('GitHub repository name'),
      state: z.enum(['open', 'closed', 'all']).optional().describe('Pull request state filter (default "open")'),
      token: z.string().optional().describe('GitHub token for authentication'),
    },
    wrapHandler('github_list_pull_requests', args => McpToolsHandler.githubListPullRequests(ctx, args))
  );

  server.tool(
    'github_create_pull_request',
    'Creates a new pull request on GitHub between head branch and target base branch.',
    {
      owner: z.string().describe('GitHub repository owner'),
      repo: z.string().describe('GitHub repository name'),
      title: z.string().describe('Pull request title'),
      head: z.string().describe('Branch containing your changes'),
      base: z.string().describe('Target branch to merge changes into (e.g. main)'),
      body: z.string().optional().describe('Pull request description/body markdown'),
      draft: z.boolean().optional().describe('Create as draft pull request'),
      token: z.string().optional().describe('GitHub token for authentication'),
    },
    wrapHandler('github_create_pull_request', args => McpToolsHandler.githubCreatePullRequest(ctx, args))
  );

  server.tool(
    'github_compare',
    'Compares two commits or branches on GitHub and returns ahead/behind counts and changed files.',
    {
      owner: z.string().describe('GitHub repository owner'),
      repo: z.string().describe('GitHub repository name'),
      base: z.string().describe('Base branch or commit SHA to compare from'),
      head: z.string().describe('Head branch or commit SHA to compare to'),
      token: z.string().optional().describe('GitHub token for authentication'),
    },
    wrapHandler('github_compare', args => McpToolsHandler.githubCompare(ctx, args))
  );

  server.tool(
    'github_check_auth',
    'Tests GitHub authentication credentials and reports user identity, OAuth scopes, and API rate limits.',
    {
      token: z.string().optional().describe('GitHub token to verify claims and scopes for'),
    },
    wrapHandler('github_check_auth', args => McpToolsHandler.githubCheckAuth(ctx, args))
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
    userEmail: tokenRecord.user?.email || null,
    userName: tokenRecord.user?.name || null,
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
    userEmail: defaultUser?.email || null,
    userName: defaultUser?.name || null,
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

/**
 * Express Route Handler for Streamable HTTP Transport (POST /mcp)
 * Handles ChatGPT / Codex tool discovery and JSON-RPC message dispatching
 */
export async function handleMcpStreamableHttp(req: Request, res: Response) {
  let ctx = await authenticateMcpRequest(req);
  const authHeader = req.headers.authorization;

  // If an invalid bearer token was supplied
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

  // Support No-Auth mode if no token provided
  if (!ctx) {
    ctx = await getAnonymousMcpContext();
  }

  // Normalize Accept header so StreamableHTTP never rejects with 406 Not Acceptable
  if (!req.headers.accept || req.headers.accept === '*/*') {
    req.headers.accept = 'application/json, text/event-stream';
  } else if (!req.headers.accept.includes('text/event-stream')) {
    req.headers.accept = `${req.headers.accept}, text/event-stream`;
  }

  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Cache-Control', 'no-cache, no-transform');

  const mcpServer = createConfiguredMcpServer(ctx);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  await mcpServer.connect(transport);
  await transport.handleRequest(req, res, req.body);
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

  await transport.handlePostMessage(req, res, req.body);
}
