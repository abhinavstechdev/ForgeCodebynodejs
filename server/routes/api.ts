import { Router } from 'express';
import { requireAuth, requireProjectAccess } from '../middleware/auth.js';
import { AuthController } from '../controllers/authController.js';
import { ProjectController } from '../controllers/projectController.js';
import { FileController } from '../controllers/fileController.js';
import { PatchController } from '../controllers/patchController.js';
import { AiController } from '../controllers/aiController.js';
import { McpController } from '../controllers/mcpController.js';
import { GitController } from '../controllers/gitController.js';
import { SearchController } from '../controllers/searchController.js';

const router = Router();

// -------------------------------------------------------------
// Authentication & User Profile
// -------------------------------------------------------------
router.post('/auth/register', AuthController.register);
router.post('/auth/login', AuthController.login);
router.post('/auth/logout', AuthController.logout);
router.get('/auth/me', requireAuth, AuthController.me);
router.get('/auth/ai-settings', requireAuth, AuthController.getAiSettings);
router.put('/auth/ai-settings', requireAuth, AuthController.updateAiSettings);

// -------------------------------------------------------------
// Projects
// -------------------------------------------------------------
router.get('/projects', requireAuth, ProjectController.list);
router.post('/projects', requireAuth, ProjectController.create);
router.get('/projects/:id', requireAuth, requireProjectAccess('viewer'), ProjectController.getById);
router.delete('/projects/:id', requireAuth, requireProjectAccess('admin'), ProjectController.delete);
router.get('/projects/:id/export', requireAuth, requireProjectAccess('viewer'), ProjectController.exportZip);

// -------------------------------------------------------------
// Files & Directories
// -------------------------------------------------------------
router.get('/projects/:projectId/tree', requireAuth, requireProjectAccess('viewer'), FileController.getTree);
router.post('/projects/:projectId/files', requireAuth, requireProjectAccess('editor'), FileController.createFile);
router.delete('/projects/:projectId/files', requireAuth, requireProjectAccess('editor'), FileController.delete);
router.get('/projects/:projectId/files/*', requireAuth, requireProjectAccess('viewer'), FileController.getFile);
router.put('/projects/:projectId/files/*', requireAuth, requireProjectAccess('editor'), FileController.saveFile);

// -------------------------------------------------------------
// Patches & Diff Engine
// -------------------------------------------------------------
router.get('/projects/:projectId/proposals', requireAuth, requireProjectAccess('viewer'), PatchController.list);
router.get('/projects/:projectId/proposals/:proposalId', requireAuth, requireProjectAccess('viewer'), PatchController.getById);
router.post('/projects/:projectId/proposals/:proposalId/apply', requireAuth, requireProjectAccess('editor'), PatchController.apply);
router.patch('/projects/:projectId/hunks/:hunkId', requireAuth, requireProjectAccess('editor'), PatchController.updateHunk);
router.post('/projects/:projectId/undo', requireAuth, requireProjectAccess('editor'), PatchController.undo);

// -------------------------------------------------------------
// AI Assistant
// -------------------------------------------------------------
router.post('/projects/:projectId/ai/chat', requireAuth, requireProjectAccess('editor'), AiController.chat);
router.get('/projects/:projectId/ai/conversations', requireAuth, requireProjectAccess('viewer'), AiController.getConversations);

// -------------------------------------------------------------
// Model Context Protocol (MCP) Dashboard
// -------------------------------------------------------------
router.get('/mcp/tokens', requireAuth, McpController.listTokens);
router.post('/mcp/tokens', requireAuth, McpController.createToken);
router.delete('/mcp/tokens/:id', requireAuth, McpController.deleteToken);
router.get('/mcp/audit-logs', requireAuth, McpController.getAuditLogs);

// -------------------------------------------------------------
// Git Source Control
// -------------------------------------------------------------
router.get('/projects/:projectId/git/status', requireAuth, requireProjectAccess('viewer'), GitController.getStatus);
router.get('/projects/:projectId/git/diff', requireAuth, requireProjectAccess('viewer'), GitController.getDiff);
router.post('/projects/:projectId/git/stage', requireAuth, requireProjectAccess('editor'), GitController.stage);
router.post('/projects/:projectId/git/unstage', requireAuth, requireProjectAccess('editor'), GitController.unstage);
router.post('/projects/:projectId/git/commit', requireAuth, requireProjectAccess('editor'), GitController.commit);
router.post('/projects/:projectId/git/push', requireAuth, requireProjectAccess('editor'), GitController.push);
router.post('/projects/:projectId/git/sync', requireAuth, requireProjectAccess('editor'), GitController.sync);
router.post('/projects/:projectId/git/fetch', requireAuth, requireProjectAccess('editor'), GitController.fetch);
router.post('/projects/:projectId/git/pull', requireAuth, requireProjectAccess('editor'), GitController.pull);
router.post('/projects/:projectId/git/clone', requireAuth, requireProjectAccess('editor'), GitController.clone);
router.get('/projects/:projectId/git/branches', requireAuth, requireProjectAccess('viewer'), GitController.branchList);
router.post('/projects/:projectId/git/branches', requireAuth, requireProjectAccess('editor'), GitController.branchCreate);
router.post('/projects/:projectId/git/branches/switch', requireAuth, requireProjectAccess('editor'), GitController.branchSwitch);
router.delete('/projects/:projectId/git/branches/:branchName', requireAuth, requireProjectAccess('editor'), GitController.branchDelete);
router.post('/projects/:projectId/git/upstream', requireAuth, requireProjectAccess('editor'), GitController.setUpstream);
router.get('/projects/:projectId/git/remotes', requireAuth, requireProjectAccess('viewer'), GitController.getRemotes);
router.post('/projects/:projectId/git/remotes', requireAuth, requireProjectAccess('editor'), GitController.setRemote);
router.get('/projects/:projectId/git/history', requireAuth, requireProjectAccess('viewer'), GitController.getHistory);

// -------------------------------------------------------------
// Search
// -------------------------------------------------------------
router.get('/projects/:projectId/search/files', requireAuth, requireProjectAccess('viewer'), SearchController.searchFiles);
router.get('/projects/:projectId/search/code', requireAuth, requireProjectAccess('viewer'), SearchController.searchCode);

export default router;
