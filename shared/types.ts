// Shared Types across Server and Client for ForgeCode AI

export type StorageDriverType = 'postgres' | 's3' | 'local';

export interface UserSummary {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: string;
}

export interface AuthSession {
  user: UserSummary;
  token: string;
}

export interface ProjectSummary {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
  description: string | null;
  storageDriver: StorageDriverType;
  storagePrefix: string;
  rootDirectory: string;
  createdAt: string;
  updatedAt: string;
  fileCount?: number;
}

export interface FileTreeItem {
  id: string;
  name: string;
  path: string;
  isFolder: boolean;
  version: number;
  sha256: string;
  sizeBytes: number;
  mimeType?: string | null;
  children?: FileTreeItem[];
}

export interface FileDetail {
  id: string;
  projectId: string;
  path: string;
  isFolder: boolean;
  version: number;
  sha256: string;
  sizeBytes: number;
  mimeType?: string | null;
  content: string;
  updatedAt: string;
}

export interface SaveFilePayload {
  content: string;
  expectedVersion: number;
  baseSha256: string;
}

export interface SaveFileResult {
  fileId: string;
  path: string;
  newVersion: number;
  newSha256: string;
  savedAt: string;
}

// -------------------------------------------------------------
// Patch Engine & Diff Types
// -------------------------------------------------------------

export type HunkStatus = 'pending' | 'accepted' | 'rejected' | 'conflicted';
export type ProposalStatus = 'pending' | 'applied' | 'rejected' | 'conflicted';

export interface PatchHunk {
  hunkId: string;
  hunkIndex: number;
  oldStartLine: number;
  oldLineCount: number;
  newStartLine: number;
  newLineCount: number;
  contextBefore: string[];
  oldLines: string[];
  newLines: string[];
  contextAfter: string[];
  oldContent: string;
  newContent: string;
  status: HunkStatus;
}

export interface EditProposal {
  id: string;
  projectId: string;
  filePath: string;
  baseVersion: number;
  baseSha256: string;
  explanation: string;
  hunks: PatchHunk[];
  status: ProposalStatus;
  createdAt: string;
  appliedAt?: string | null;
}

export interface DiffPreview {
  proposalId?: string;
  filePath: string;
  originalContent: string;
  proposedContent: string;
  unifiedDiff: string;
  hunks: PatchHunk[];
}

// -------------------------------------------------------------
// MCP Server Types
// -------------------------------------------------------------

export type McpScope =
  | 'files:read'
  | 'files:write'
  | 'patch:propose'
  | 'patch:apply'
  | 'git:read'
  | 'git:write'
  | 'terminal:execute';

export const ALL_MCP_SCOPES: McpScope[] = [
  'files:read',
  'files:write',
  'patch:propose',
  'patch:apply',
  'git:read',
  'git:write',
  'terminal:execute',
];

export interface McpTokenInfo {
  id: string;
  name: string;
  tokenPrefix: string;
  tokenPlain?: string; // only returned once upon creation
  scopes: McpScope[];
  projectId?: string | null;
  expiresAt?: string | null;
  lastUsedAt?: string | null;
  createdAt: string;
}

export interface McpAuditLogItem {
  id: string;
  tokenId: string;
  toolName: string;
  parameters: any;
  statusCode: number;
  durationMs: number;
  createdAt: string;
}

// -------------------------------------------------------------
// AI Provider & Chat Types
// -------------------------------------------------------------

export type AIProviderId = 'openai' | 'anthropic' | 'gemini' | 'custom';

export interface AIProviderConfig {
  id: AIProviderId;
  name: string;
  models: string[];
  defaultModel: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  filesReferenced?: string[];
  createdAt: string;
  proposalId?: string;
}

export interface ChatConversation {
  id: string;
  projectId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

// -------------------------------------------------------------
// Git Types
// -------------------------------------------------------------

export interface GitStatusSummary {
  isRepo: boolean;
  currentBranch: string;
  staged: string[];
  unstaged: string[];
  untracked: string[];
  ahead: number;
  behind: number;
}

export interface GitCommitItem {
  hash: string;
  message: string;
  author: string;
  date: string;
}

// -------------------------------------------------------------
// Execution & Diagnostics Types
// -------------------------------------------------------------

export interface DiagnosticItem {
  filePath: string;
  line: number;
  column: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
  source: string;
}

export interface ExecutionJobSummary {
  id: string;
  projectId: string;
  command: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  exitCode: number | null;
  output: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}
