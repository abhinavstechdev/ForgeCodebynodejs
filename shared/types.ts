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
  | 'git:commit'
  | 'terminal:execute';

export const ALL_MCP_SCOPES: McpScope[] = [
  'files:read',
  'files:write',
  'patch:propose',
  'patch:apply',
  'git:read',
  'git:write',
  'git:commit',
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
  headCommit?: string | null;
  upstreamBranch?: string | null;
  staged: string[];
  unstaged: string[];
  untracked: string[];
  deleted?: string[];
  renamed?: string[];
  conflicted?: string[];
  repositoryRoot?: string;
  remotes?: Array<{ name: string; url: string }>;
  ahead: number;
  behind: number;
  workingTreeClean?: boolean;
  operationInProgress?: null | 'merge' | 'rebase' | 'cherry-pick' | 'revert';
}

export type GitStatusDetailed = GitStatusSummary;

export interface GitCommitItem {
  hash: string;
  message: string;
  author: string;
  authorEmail?: string;
  date: string;
  parentHashes?: string[];
  changedFiles?: string[];
}

export interface GitDiffOptions {
  projectId?: string;
  staged?: boolean;
  filePath?: string;
  fromRevision?: string;
  toRevision?: string;
  maxLines?: number;
}

export interface GitDiffResult {
  diff: string;
  truncated: boolean;
  filesChanged: number;
  insertions: number;
  deletions: number;
}

export interface GitHistoryOptions {
  projectId?: string;
  maxCount?: number;
  branch?: string;
  fromRevision?: string;
  toRevision?: string;
  filePath?: string;
}

export type GitSyncStrategy = 'safe' | 'ff-only' | 'merge' | 'rebase';

export interface GitSyncOptions {
  projectId?: string;
  remoteName?: string;
  branch?: string;
  strategy?: GitSyncStrategy;
  push?: boolean;
  commitMessage?: string;
  force?: boolean;
  dryRun?: boolean;
  token?: string;
}

export interface GitSyncResult {
  success: boolean;
  projectId: string;
  remote: string;
  branch: string;
  initialHead: string;
  localHead: string;
  remoteHead?: string;
  ahead: number;
  behind: number;
  workingTreeClean: boolean;
  strategy: string;
  fetchCompleted: boolean;
  mergeCompleted: boolean;
  rebaseCompleted: boolean;
  pushAttempted: boolean;
  pushCompleted: boolean;
  conflicts?: string[];
  changedFiles?: string[];
  warnings?: string[];
  errorCode?: string;
  message: string;
}

export interface GitCloneOptions {
  repositoryUrl: string;
  projectId?: string;
  projectName?: string;
  branch?: string;
  depth?: number;
  destinationPath?: string;
  token?: string;
}

export interface GitBranchItem {
  name: string;
  isRemote: boolean;
  current: boolean;
  sha?: string;
  upstream?: string;
}

export interface GitBranchSummary {
  current: string;
  branches: GitBranchItem[];
}

export interface GitPushOptions {
  remoteUrl?: string;
  token?: string;
  branch?: string;
  commitMessage?: string;
  authorName?: string;
  authorEmail?: string;
  force?: boolean;
  remoteName?: string;
}

export interface GitPushResult {
  success: boolean;
  branch: string;
  remote: string;
  pushed: boolean;
  commitHash?: string;
  message: string;
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
