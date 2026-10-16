# MASTER BUILD PROMPT: ForgeCode AI — Full AI-Powered Web IDE (Node.js & PostgreSQL on Voroa.com)

## 1. Project Overview

Build a complete, production-oriented, browser-based AI IDE named **ForgeCode AI**.

ForgeCode AI is a self-hosted cloud development environment inspired by Visual Studio Code, Cursor, and modern AI coding agents. It enables developers to create and manage projects, edit source code via Monaco Editor, connect external AI agents through the official Model Context Protocol (MCP), and apply precise, line-by-line code modifications with a professional visual diff-review workflow.

### Core Mission

Create a real, usable coding environment in which an AI agent can:

- Understand the hierarchical structure and AST of an existing project.
- Read files, inspect line ranges, and analyze functions.
- Create new files and folders with proper directory hierarchies.
- Edit specific lines using exact-context patches without unnecessarily rewriting entire files.
- Refactor functions and apply coordinated edits across multiple files.
- Diagnose, reproduce, and fix code bugs.
- Propose changes for human review with unified diff previews.
- Apply approved changes atomically to persistent project files.
- Undo unwanted modifications with snapshot rollback history.
- Run supported tests and scripts through a secure, isolated execution environment.
- Connect to the IDE through an authenticated, protocol-compliant Node.js MCP server.

### Platform Target

The application must be deployed on **Voroa.com**:
- **Application Web Service**: Hosted on Voroa Web Service running Node.js (Node.js 20+ LTS / 22 LTS).
- **Primary Database**: Hosted on Voroa Managed PostgreSQL (PostgreSQL 18 / 17 / 16).
- **Persistent Storage**: Configured via S3-compatible object storage (e.g., Cloudflare R2 / AWS S3) or Voroa mounted persistent storage, with a safe PostgreSQL-backed fallback for metadata and small workspaces.

The implementation must strictly respect the actual capabilities and resource limits of Voroa services. Do not assume that an ephemeral container filesystem provides persistent storage across restarts or that the web container can run unconstrained privileged Docker containers.

Do not deliver a static landing page, a mock UI, or an ungrounded chat interface. Build a fully operational application with a robust Node.js backend, Voroa PostgreSQL database, file operations engine, Monaco Editor, patch engine, and standard-compliant MCP server.

---

## 2. Mandatory Technology Stack

Use the following modern, production-grade technologies as the primary stack.

### Backend (Node.js)

- **Runtime**: Node.js 20+ LTS or 22 LTS (ES Modules `type: module` or compiled TypeScript).
- **Language**: TypeScript 5.x for end-to-end type safety, strict null checks, and maintainable interfaces.
- **Web Framework**: Express.js or Fastify (configured with standard middleware, security headers, and compression).
- **Validation**: Zod for runtime schema validation on all incoming API requests and MCP parameters.
- **Streaming**: Server-Sent Events (`text/event-stream`) and WebSockets (`ws`) for real-time AI tokens, diff generation, and terminal output.
- **Process Management & Concurrency**: Async/await with proper cancellation tokens (`AbortController`), worker threads for CPU-heavy tasks (diffing large files), and graceful shutdown handlers (`SIGTERM`, `SIGINT`).

### Database & ORM (PostgreSQL on Voroa)

- **Database Engine**: PostgreSQL (Voroa Managed PostgreSQL 18, 17, or 16).
- **ORM / Query Builder**: Prisma ORM or Drizzle ORM with TypeScript schema definitions.
- **Connection Management**: Connection pooling via `pg` / `@prisma/client` with configurable pool sizes and connection timeouts matching Voroa database connection limits.
- **Migrations**: Automated declarative migrations (`prisma migrate` or `drizzle-kit migrate`) executed on deployment.
- **Search Capabilities**: PostgreSQL Full-Text Search (`tsvector`, `tsquery`, GIN indexes) for code and file indexing without requiring heavy external Elasticsearch or vector clusters on initial launch.
- **Integrity**: Foreign key cascades, UUID v4 / ULID primary keys, composite indexes, atomic transactions, and strict check constraints.

> **Rule**: Do not silently replace PostgreSQL with SQLite, MySQL, or in-memory arrays.

### Frontend

- **Bundler & Tooling**: Vite with TypeScript and modern React (or lightweight reactive SPA architecture).
- **Core Editor**: Monaco Editor (`@monaco-editor/react` or vanilla `monaco-editor`) configured with custom dark themes, language workers, and bracket pair colorization.
- **Review Engine**: Monaco Diff Editor for side-by-side and inline diff reviews of AI-generated patches.
- **UI Architecture**: Tailwind CSS or CSS Modules with an uncompromising developer-focused dark aesthetic (Inter / JetBrains Mono typography, Lucide icons, resizable split panes via `react-resizable-panels`).
- **State Management**: Zustand or TanStack Query for caching file trees, editor state, and AI conversation streams.

### AI & Protocol Integrations

- **MCP Implementation**: Official Model Context Protocol SDK (`@modelcontextprotocol/sdk`) implementing the Streamable HTTP / SSE transport on `/mcp`.
- **AI Providers**: Configurable adapters for OpenAI (`openai`), Anthropic (`@anthropic-ai/sdk`), Google Gemini (`@google/genai`), and any local/remote OpenAI-compatible endpoint (Ollama, vLLM, LM Studio).
- **Git Integration**: `simple-git` or Node.js Git bindings with sanitized arguments.
- **Language Support**: Monaco language support extended with lightweight LSP bridges over WebSockets where available.

---

## 3. Product Identity and Visual Design

**Product Name**: ForgeCode AI  
**Product Category**: AI-Native Cloud IDE & Collaborative Workspace

The user interface must convey the polish, precision, and density of Cursor and VS Code. It is built dark-first for developers who spend 10+ hours a day in their editor.

### Visual Style Guide

- **Color Palette**:
  - Background (Editor): `#1e1e1e` / `#18181b` (Deep Charcoal)
  - Background (Sidebar & Panels): `#252526` / `#1f1f23` (Neutral Dark Slate)
  - Activity Bar: `#333333` / `#121214`
  - Accent / Primary: `#007acc` / `#3b82f6` (Electric Blue) or `#8b5cf6` (AI Violet)
  - Borders & Dividers: `#3c3c3c` / `#27272a` (Subtle 1px solid)
  - Diff Additions: Background `#1b4725`, Border `#2ea043`, Gutter `#3fb950`
  - Diff Deletions: Background `#4b181e`, Border `#f85149`, Gutter `#f85149`
- **Typography**:
  - UI Font: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif.
  - Code Font: "JetBrains Mono", "Fira Code", Menlo, Monaco, Consolas, monospace (ligatures supported).
- **Layout Principles**:
  - Zero unnecessary white-space, giant marketing banners, or consumer-style rounded cards inside the editor viewport.
  - Pixel-perfect, compact UI elements (28px header bars, 22px status bar, 24px tree rows).
  - High responsive density with collapsible panels and smooth split-pane drag handles.

### Application Shell Architecture

```
+-------------------------------------------------------------------------+
| Top Command Bar: Project Selector | File Search | Layout | User Profile  |
+---+----------------------+---------------------------------+------------+
| A | File Explorer        | Central Editor Workspace         | AI Agent   |
| c | (Hierarchical Tree)  | (Monaco Editor / Diff Editor)    | Panel      |
| t |                      | Multi-tab header with dirty dots | (Chat,     |
| i | - src/               |                                 | Context,   |
| v |   - index.ts         |                                 | Proposals, |
| i |   - patchEngine.ts   |                                 | Hunks)     |
| t | - package.json       |                                 |            |
| y | - .env               |                                 |            |
|   |                      +---------------------------------+            |
| B |                      | Bottom Panel: Terminal | Output |            |
| a |                      | Diagnostics | Execution Logs    |            |
| r |                      |                                 |            |
+---+----------------------+---------------------------------+------------+
| Status Bar: Branch | Error/Warn | Line/Col | Encoding | MCP: Connected   |
+-------------------------------------------------------------------------+
```

---

## 4. Authentication, Authorization & User Management

ForgeCode AI must enforce multi-tenant isolation and secure credential management across all REST, WebSocket, and MCP endpoints.

### Authentication Features

- **User Registration & Login**: Email/password authentication with secure passwords hashed via `argon2` or `bcrypt` (cost factor 12+).
- **Session & Token Management**:
  - Secure HTTP-only, SameSite=Strict cookies containing signed JWTs or Redis/PostgreSQL session tokens.
  - Refresh token rotation for persistent logins with explicit revocation endpoints.
- **API Tokens**: Personal Access Tokens (PATs) hashed with SHA-256 for external CLI or custom tool access.
- **Tenant Isolation**: Every project, file, patch proposal, AI session, and MCP key has a strictly verified foreign key relationship to an authorized `user_id` or `workspace_id`.
- **RBAC Middleware**: Node.js route-level authorization middleware (`requireAuth`, `requireProjectAccess('read' | 'write' | 'admin')`).
- **Protection**: Rejection of insecure direct object references (IDOR). Attempting to read `/api/projects/{id}` for an unowned project must immediately return `404 Not Found` or `403 Forbidden`.

---

## 5. Project Management & Workspace Explorer

### Project Lifecycle

- **Create Project**: Initialize a project with a template (Node.js/Express, TypeScript, Next.js, Python, or Blank) or an empty folder.
- **Open Project**: Load project tree, active tabs, git state, and recent cursor positions from PostgreSQL.
- **Archive & Delete**: Soft-delete or hard-delete with cascade cleanup across database records and persistent storage objects.
- **Git Cloning**: Clone a remote Git repository into the workspace storage using authenticated credentials.
- **Import / Export**: Download the workspace as a `.zip` archive or upload a `.zip` file into a new project.

### File Explorer Capabilities

- **Virtual Tree Engine**: Fast recursive directory listing with lazy loading for large subdirectories (`node_modules` collapsed and excluded from deep recursive fetches by default).
- **File System Operations**:
  - Create File / Create Folder (with parent folder auto-creation).
  - Rename / Move (with atomic path updates and tab sync).
  - Delete File / Folder (with confirmation modal and undo buffer).
  - Drag and Drop file organization.
  - File/Folder context menu (Cut, Copy, Paste, Duplicate, Download, Reveal in Explorer).
- **Search**:
  - Fast filename fuzzy filtering (`Cmd/Ctrl + P`).
  - Full-text search across all project files (`Cmd/Ctrl + Shift + F`).
- **Tab State**: Multi-tab management, pinned tabs, unsaved modifications indicator (dirty dot), and "Save All" (`Cmd/Ctrl + Alt + S`).

---

## 6. Monaco Editor & File Saving Engine

Integrate genuine Monaco Editor rather than a simple textarea or static syntax highlighter.

### Editor Specifications

- **Language Support**: TypeScript, JavaScript, HTML, CSS, JSON, Markdown, Python, Go, Rust, SQL, YAML, Dockerfile, Bash, and XML.
- **Features**: IntelliSense, bracket matching, code folding, auto-formatting (`prettier` / `biome` hooks), multi-cursor editing, minimap, current-line highlight, search & replace with regex.
- **Model Management**: Global `monaco.editor.ITextModel` cache indexed by file URI to ensure opening the same file in multiple panels never duplicates models or creates desynchronized state.

### Atomic File Saving Protocol

Saving files through the Node.js backend must guarantee data integrity:

```
[ Monaco Editor ]
       |
       |  1. PUT /api/projects/:id/files/:path
       |     { content, expectedVersion, baseSha256 }
       v
[ Node.js Backend: File Service ]
       |
       |-- 2. Verify Project Ownership & Path Sanitization (no '..')
       |-- 3. Query PostgreSQL for current file version & sha256
       |-- 4. Check for CONFLICT:
       |        if current.sha256 != baseSha256 -> return 409 Conflict (with remote diff)
       |-- 5. Calculate new sha256 hash & increment version number
       |-- 6. Write content to Persistent Storage (Atomic Write)
       |-- 7. Update PostgreSQL `project_files` record in transaction
       |-- 8. Record `file_snapshots` entry (reversion history)
       v
[ 200 OK: { newVersion, newSha256, savedAt } ]
```

---

## 7. AI Coding Assistant & Context Engine

The integrated AI Assistant must not be a generic chatbot; it must be an autonomous coding agent with full awareness of the active project.

### Context Engine Capabilities

1. **Active Editor Context**: Current file path, active language, cursor position, and selected line range.
2. **Project Structure Intelligence**: High-level directory tree, `package.json` dependencies, and project configuration.
3. **Targeted File Retrieval**: Inspects imports and exports to pull referenced files into context.
4. **Token Budgeting**: Dynamically prunes context using sliding-window token allocators to prevent exceeding provider context limits (e.g. 128k/200k tokens).
5. **Secret Redaction**: Automatic regex-based redaction of environment variables, `.env` values, API tokens, and private keys before passing prompt context to external LLM providers.
6. **Streaming Protocol**: Real-time token delivery via Server-Sent Events (SSE) with structured delimiters separating conversational reasoning from proposed code modifications.

---

## 8. Multi-Provider AI Architecture

Build a modular AI provider adapter layer in TypeScript:

```typescript
export interface AICompletionOptions {
  model: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt: string;
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  abortSignal?: AbortSignal;
}

export interface AIProviderAdapter {
  id: string;
  name: string;
  streamCompletion(
    options: AICompletionOptions,
    onChunk: (chunk: string) => void
  ): Promise<void>;
  testConnection(): Promise<boolean>;
}
```

### Supported Provider Adapters

- **OpenAI Adapter**: Official SDK supporting `gpt-4o`, `gpt-4o-mini`, `o1`, `o3-mini`.
- **Anthropic Adapter**: Official SDK supporting `claude-3-7-sonnet`, `claude-3-5-sonnet`, `claude-3-5-haiku`.
- **Google Gemini Adapter**: Official SDK (`@google/genai`) supporting `gemini-2.5-pro`, `gemini-2.5-flash`.
- **Custom / OpenAI-Compatible Adapter**: Connects to Ollama, LM Studio, vLLM, DeepSeek, or Groq with configurable `baseURL` and `apiKey`.
- **Credential Protection**:
  - API keys stored encrypted in PostgreSQL using AES-256-GCM with a server-level encryption master key (`APP_SECRET_KEY`).
  - Keys are masked (`sk-****1234`) when returned to the browser.
  - Keys are never printed to console logs or exposed in frontend code.

---

## 9. Advanced Line-by-Line Patch & Diff Engine

> **CRITICAL REQUIREMENT**: The AI must NOT replace an entire 1,000-line file to edit 3 lines. The system must feature a dedicated Node.js line-by-line patching engine.

### Patch Proposal Structure

Every AI-proposed modification is compiled into a structured entity:

```typescript
export interface PatchHunk {
  hunkId: string;
  oldStartLine: number;
  oldLineCount: number;
  newStartLine: number;
  newLineCount: number;
  contextBefore: string[];
  oldLines: string[];
  newLines: string[];
  contextAfter: string[];
  status: 'pending' | 'accepted' | 'rejected';
}

export interface EditProposal {
  id: string;
  projectId: string;
  filePath: string;
  baseVersion: number;
  baseSha256: string;
  explanation: string;
  hunks: PatchHunk[];
  status: 'pending' | 'applied' | 'rejected' | 'conflicted';
  createdAt: string;
}
```

### Patch Execution Engine Workflow

1. **Context Matching**: The engine checks the target file at `baseVersion`. It matches `contextBefore` and `oldLines` using exact line matching, with fuzzy sliding fallback if minor whitespace differences exist.
2. **Conflict Detection**: If the user edited the file concurrently and `currentSha256 != baseSha256`, the patch marks affected hunks as `conflicted` and warns the user instead of corrupting the file.
3. **Monaco Diff Preview**:
   - The UI loads the original content on the left and the proposed content on the right.
   - Interactive floating action controls appear directly in the gutter: `Accept Hunk [✓]` and `Reject Hunk [✗]`.
4. **Hunk-Level Granularity**: The user can accept Hunk 1, reject Hunk 2, and accept Hunk 3.
5. **Atomic Application**: Upon clicking "Apply Selected", the backend:
   - Takes a database snapshot of the pre-patch state in `file_snapshots`.
   - Computes the new content by applying only the approved hunks.
   - Writes the new file atomically.
   - Updates the Monaco Editor model in real time without refreshing the page.
6. **One-Click Undo**: Any applied patch can be immediately reverted to the previous snapshot via `undo_change`.

---

## 10. Model Context Protocol (MCP) Server (Node.js)

Implement a native, fully protocol-compliant MCP server within the Node.js application using `@modelcontextprotocol/sdk`.

### Transport & Endpoint

- **Route**: `https://your-voroa-app.voroa.app/mcp`
- **Transport**: `SSEServerTransport` (Server-Sent Events + HTTP POST for messages) or Streamable HTTP.
- **Authentication**: Bearer token authentication in the HTTP headers (`Authorization: Bearer mcp_live_...`).
- **Capability Negotiation**: Declares tools, prompts, and resource capabilities in compliance with the MCP specification.

### MCP Tool Catalog

The Node.js MCP server must implement and register the following tools:

#### 1. Project Discovery
- `list_projects`: Returns list of projects the authenticated user has access to.
- `get_project_tree`: Returns recursive folder and file structure with file sizes and modified times.
- `list_files`: Lists files matching glob patterns (e.g., `src/**/*.ts`).

#### 2. Reading & Searching
- `read_file`: Reads entire file content (with size limit guard).
- `read_lines`: Reads specific line ranges (`startLine` to `endLine`) to conserve tokens.
- `search_code`: Searches code across project files using regex or literal strings.
- `search_files`: Searches for files by name/path pattern.
- `get_diagnostics`: Returns syntax or linter diagnostics for a given file.

#### 3. File Operations
- `create_file`: Creates a new file with specified content.
- `create_directory`: Creates a directory (and parents if needed).
- `rename_file`: Moves or renames a file or folder.
- `delete_file`: Deletes a file or directory.
- `write_file`: Writes/overwrites complete file content (creates backup snapshot).

#### 4. Safe Code Editing
- `propose_patch`: Submits a line-by-line patch or unified diff for review in the IDE.
- `preview_diff`: Returns calculated diff for a proposed patch before applying.
- `get_patch_status`: Checks whether a proposal is pending, applied, or rejected.
- `accept_patch`: Approves and applies an entire patch proposal.
- `accept_patch_hunk`: Approves a specific hunk within a patch proposal.
- `reject_patch`: Discards a patch proposal.
- `undo_change`: Reverts a file to its snapshot prior to the last patch application.

#### 5. Version Control
- `git_status`: Returns current branch, staged, unstaged, and untracked files.
- `git_diff`: Returns git diff of working directory or staged changes.
- `git_commit`: Creates a commit with the specified message.
- `git_history`: Returns recent commit log.

#### 6. Execution & Testing
- `run_tests`: Triggers project test runner (e.g. `npm test`) in the execution sandbox.
- `get_execution_status`: Checks status of a running execution job.
- `get_execution_output`: Retrieves stdout/stderr logs from an execution job.

### MCP Permissions & Security

- Granular permission scopes per MCP token:
  - `files:read`
  - `files:write`
  - `patch:propose`
  - `patch:apply`
  - `git:read` / `git:write`
  - `terminal:execute`
- Dedicated **MCP Management Dashboard** in the IDE to generate, inspect, scope, and revoke MCP tokens.

---

## 11. Persistent File Storage Strategy

Voroa Web Services run on containerized infrastructure where the local filesystem may be ephemeral across deploys and container recycles. Storage must be handled deliberately.

### Storage Architecture Abstraction

```typescript
export interface StorageDriver {
  readFile(projectPath: string): Promise<Buffer>;
  writeFile(projectPath: string, data: Buffer | string): Promise<{ sha256: string; bytes: number }>;
  deleteFile(projectPath: string): Promise<boolean>;
  deleteDirectory(projectPath: string): Promise<boolean>;
  listFiles(prefix: string): Promise<Array<{ path: string; size: number; lastModified: Date }>>;
  createSnapshot(projectPath: string, snapshotId: string): Promise<string>;
  restoreSnapshot(projectPath: string, snapshotId: string): Promise<boolean>;
}
```

### Storage Drivers

1. **S3 / Cloudflare R2 Driver (Recommended for Production)**:
   - Uses `@aws-sdk/client-s3` with standard S3 API compatibility.
   - Zero data loss on container rebuilds.
   - Configured via `STORAGE_DRIVER=s3`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`.
2. **Persistent Volume / Mounted Disk Driver**:
   - Uses local Node.js `fs/promises` pointed to a persistent mount path (e.g., `/mnt/data/forgecode`).
   - Active when Voroa persistent volume storage is attached.
3. **PostgreSQL Blob Driver (Zero-Dependency Built-in Fallback)**:
   - Stores file payloads in a PostgreSQL `file_contents` table (`BYTEA` or text column) partitioned by `project_id`.
   - Ideal for initial launch and lightweight projects without requiring external S3 accounts.
   - Enforces 10MB per-file limit and uses transactional updates with SHA-256 hashes.

---

## 12. PostgreSQL Database Schema (Prisma / Drizzle)

The database schema must be implemented for Voroa PostgreSQL. Below is the production Prisma schema specification:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id            String         @id @default(uuid())
  email         String         @unique
  passwordHash  String
  name          String?
  role          String         @default("user")
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
  projects      Project[]
  memberships   ProjectMember[]
  mcpTokens     McpToken[]
  aiSettings    UserAiSetting?
}

model Project {
  id            String          @id @default(uuid())
  ownerId       String
  name          String
  slug          String
  description   String?
  storageDriver String          @default("postgres") // "postgres" | "s3" | "local"
  storagePrefix String
  rootDirectory String          @default("/")
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt

  owner         User            @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  members       ProjectMember[]
  files         ProjectFile[]
  proposals     EditProposal[]
  conversations AiConversation[]
  mcpTokens     McpToken[]
  executionJobs ExecutionJob[]

  @@unique([ownerId, slug])
  @@index([ownerId])
}

model ProjectMember {
  id        String   @id @default(uuid())
  projectId String
  userId    String
  role      String   @default("editor") // "viewer" | "editor" | "admin"
  createdAt DateTime @default(now())

  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([projectId, userId])
}

model ProjectFile {
  id          String         @id @default(uuid())
  projectId   String
  path        String         // Relative path e.g. "src/index.ts"
  isFolder    Boolean        @default(false)
  version     Int            @default(1)
  sha256      String
  sizeBytes   Int            @default(0)
  mimeType    String?
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt

  project     Project        @relation(fields: [projectId], references: [id], onDelete: Cascade)
  snapshots   FileSnapshot[]

  @@unique([projectId, path])
  @@index([projectId, path])
}

model FileContent {
  id          String   @id @default(uuid())
  projectId   String
  filePath    String
  sha256      String
  content     String   // Text content or Base64 encoded binary
  updatedAt   DateTime @updatedAt

  @@unique([projectId, filePath])
}

model FileSnapshot {
  id          String      @id @default(uuid())
  fileId      String
  version     Int
  sha256      String
  content     String
  reason      String      // "pre_patch" | "user_save" | "auto_save"
  createdAt   DateTime    @default(now())

  file        ProjectFile @relation(fields: [fileId], references: [id], onDelete: Cascade)

  @@index([fileId, version])
}

model EditProposal {
  id            String             @id @default(uuid())
  projectId     String
  filePath      String
  baseVersion   Int
  baseSha256    String
  explanation   String
  status        String             @default("pending") // "pending" | "applied" | "rejected" | "conflicted"
  createdAt     DateTime           @default(now())
  appliedAt     DateTime?

  project       Project            @relation(fields: [projectId], references: [id], onDelete: Cascade)
  hunks         EditProposalHunk[]

  @@index([projectId, status])
}

model EditProposalHunk {
  id            String       @id @default(uuid())
  proposalId    String
  hunkIndex     Int
  oldStartLine  Int
  oldLineCount  Int
  newStartLine  Int
  newLineCount  Int
  oldContent    String
  newContent    String
  status        String       @default("pending") // "pending" | "accepted" | "rejected"

  proposal      EditProposal @relation(fields: [proposalId], references: [id], onDelete: Cascade)

  @@index([proposalId, hunkIndex])
}

model McpToken {
  id          String    @id @default(uuid())
  tokenHash   String    @unique
  name        String
  userId      String
  projectId   String?
  scopes      String[]  // ["files:read", "files:write", "patch:propose", etc.]
  expiresAt   DateTime?
  lastUsedAt  DateTime?
  createdAt   DateTime  @default(now())

  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  project     Project?  @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@index([tokenHash])
}

model McpAuditLog {
  id         String   @id @default(uuid())
  tokenId    String
  toolName   String
  parameters Json?
  statusCode Int
  durationMs Int
  createdAt  DateTime @default(now())

  @@index([tokenId, createdAt])
}

model AiConversation {
  id        String      @id @default(uuid())
  projectId String
  title     String      @default("New Chat")
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt

  project   Project     @relation(fields: [projectId], references: [id], onDelete: Cascade)
  messages  AiMessage[]
}

model AiMessage {
  id             String         @id @default(uuid())
  conversationId String
  role           String         // "user" | "assistant" | "system"
  content        String
  filesReferenced String[]
  metadata       Json?
  createdAt      DateTime       @default(now())

  conversation   AiConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
}

model UserAiSetting {
  id             String  @id @default(uuid())
  userId         String  @unique
  defaultProvider String @default("openai")
  encryptedKeys  Json    // Encrypted API keys per provider
  defaultModel   String  @default("gpt-4o")

  user           User    @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model ExecutionJob {
  id         String    @id @default(uuid())
  projectId  String
  command    String
  status     String    @default("queued") // "queued" | "running" | "completed" | "failed" | "cancelled"
  exitCode   Int?
  output     String?
  startedAt  DateTime?
  finishedAt DateTime?
  createdAt  DateTime  @default(now())

  project    Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@index([projectId, status])
}
```

---

## 13. Terminal, Command Execution & Sandbox Security

ForgeCode AI provides a built-in terminal and execution runner with layered defenses:

- **Architecture**: Web terminal connected via WebSocket using `xterm.js` on the frontend and `node-pty` / sandboxed child process on the backend.
- **Defense in Depth**:
  - The main web process must never execute arbitrary AI commands directly under root or without path containment.
  - Commands run with restricted environment variables (Node.js backend database credentials and system secrets are explicitly filtered out before spawning processes).
  - Working directory is strictly locked to the project root path.
  - Process limits: Maximum 5-minute execution timeout, memory limits, and output buffer truncation (maximum 5MB buffer).
- **Graceful Fallback**: If running in a restricted container where pseudo-terminals (`node-pty`) cannot be allocated, the system gracefully falls back to structured script execution via Node.js `child_process.spawn` with piped output streaming.

---

## 14. Git Version Control Integration

Real Git operations managed through Node.js (`simple-git`):

- **Repository Tracking**: Automatically detects if the workspace root is a git repository (`.git`).
- **Core Operations**:
  - `getStatus`: Uncommitted changes, untracked files, staged files.
  - `stageFile` / `stageAll` / `unstageFile`.
  - `commit`: Creates commits with author name and email.
  - `getHistory`: Retrieves commit graph with commit hashes, messages, authors, and dates.
  - `createBranch` / `switchBranch`.
  - `discardChanges`: Reverts changes with confirmation.
- **Safety Rule**: Git commands are run via parameterized API calls, never via string concatenation in a raw shell, preventing command injection attacks.

---

## 15. Search, Indexing & Productivity

- **Full-Text Code Search**: Fast PostgreSQL `tsvector` indexing of source code lines combined with in-memory regex streaming across loaded files.
- **Quick File Open (`Ctrl+P` / `Cmd+P`)**: Fuzzy-search over all relative file paths.
- **Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)**: Fast navigation to any action (e.g., Save, Toggle Terminal, New File, Switch AI Model, Diff Viewer).
- **Go to Line (`Ctrl+G` / `Cmd+G`)**: Instant jump to line/column in Monaco Editor.
- **Diagnostics Panel**: Collects syntax errors, TypeScript compile warnings, and test failure outputs in a unified bottom drawer.

---

## 16. Security & Hardening Checklist (Node.js & PostgreSQL)

1. **Path Traversal Protection**:
   ```typescript
   export function sanitizePath(projectRoot: string, userInputPath: string): string {
     const resolved = path.resolve(projectRoot, userInputPath.replace(/^\/+/, ''));
     if (!resolved.startsWith(path.resolve(projectRoot))) {
       throw new Error('Access denied: Path traversal detected');
     }
     return resolved;
   }
   ```
2. **HTTP Security Headers**: `helmet` enabled (strict CSP, HSTS, X-Content-Type-Options, Frameguard).
3. **Cross-Site Request Forgery (CSRF)**: Double-submit cookie or `SameSite=Strict` HTTP-only auth cookies.
4. **Rate Limiting**: `express-rate-limit` applied to auth routes (`/api/auth/*`), AI completions, and MCP tool invocations.
5. **SQL Injection Prevention**: 100% parameterized queries via Prisma / Drizzle ORM.
6. **AI Output Sanitization**: AI-generated code is treated as untrusted text until approved by the developer. It is never `eval()`-ed or rendered as unescaped HTML in the main application origin.
7. **Secret Scrubbing**: Automatic regex scrubbing of logs and prompts to prevent leaking API keys or JWT tokens.

---

## 17. Voroa.com Deployment & Database Architecture

ForgeCode AI is engineered specifically to deploy smoothly on **Voroa.com**.

### Voroa Architecture Diagram

```
+-------------------------------------------------------------------------+
|                              VOROA.COM                                  |
|                                                                         |
|   +-----------------------------------------------------------------+   |
|   |                     Voroa Web Service                           |   |
|   |                                                                 |   |
|   |  - Engine: Node.js (v20+ LTS / v22 LTS)                         |   |
|   |  - Process: npm run start (Express/Fastify + Vite Built Assets) |   |
|   |  - Environment: PORT, HOST=0.0.0.0, DATABASE_URL                |   |
|   |  - Healthcheck Route: GET /healthz                              |   |
|   |  - MCP Server: /mcp (Streamable HTTP / SSE)                     |   |
|   +-------------------------------+---------------------------------+   |
|                                   |                                     |
|                      Internal Network / SSL                             |
|                                   v                                     |
|   +-----------------------------------------------------------------+   |
|   |                 Voroa Managed PostgreSQL                        |   |
|   |                                                                 |   |
|   |  - Version: PostgreSQL 18 (or 17 / 16)                          |   |
|   |  - Connection: DATABASE_URL with sslmode=require                |   |
|   |  - Tables: users, projects, files, proposals, mcp_tokens, etc.  |   |
|   |  - Automated Migrations: prisma migrate deploy on deploy        |   |
|   +-----------------------------------------------------------------+   |
|                                                                         |
+-------------------------------------------------------------------------+
```

### 1. Voroa Web Service Configuration

- **Service Type**: `web`
- **Language / Runtime**: Node.js 20 or 22
- **Build Command**:
  ```bash
  npm install && npm run build && npx prisma migrate deploy
  ```
- **Start Command**:
  ```bash
  npm run start
  ```
- **Host & Port Binding**:
  - The server must listen on `process.env.PORT` (or default `3000`) and bind to host `0.0.0.0`:
    ```typescript
    const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
    const HOST = '0.0.0.0';
    app.listen(PORT, HOST, () => {
      console.log(`ForgeCode AI running on http://${HOST}:${PORT}`);
    });
    ```
- **Healthcheck Endpoint**:
  - Expose `GET /healthz` returning HTTP 200 with database health status:
    ```typescript
    app.get('/healthz', async (req, res) => {
      try {
        await prisma.$queryRaw`SELECT 1`;
        res.json({ status: 'healthy', database: 'connected', timestamp: new Date() });
      } catch (err) {
        res.status(503).json({ status: 'unhealthy', error: 'Database unreachable' });
      }
    });
    ```

### 2. Voroa PostgreSQL Database Service Configuration

- **Service Type**: `postgres`
- **Database Version**: PostgreSQL 18 (default on Voroa) or 17 / 16.
- **Connection String**: Provided by Voroa environment variables as `DATABASE_URL` or `POSTGRES_URL`:
  ```
  postgresql://postgres:[PASSWORD]@[HOST]:[PORT]/[DATABASE]?sslmode=require
  ```
- **SSL Configuration**:
  When connecting to Voroa PostgreSQL in Node.js, configure SSL connection parameters to accept Voroa certificates:
  ```typescript
  import { Pool } from 'pg';

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
  ```

### 3. Environment Variables Reference (.env.example)

```env
# -------------------------------------------------------------
# ForgeCode AI — Voroa Production Environment Configuration
# -------------------------------------------------------------

# Voroa Web Service Configuration
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
APP_URL=https://forgecode.voroa.app
APP_SECRET_KEY=generate_a_64_char_hex_secret_key_here

# Voroa PostgreSQL Connection (Auto-populated by Voroa Database Link)
DATABASE_URL=postgresql://user:password@postgres-host:5432/forgecodedb?sslmode=require

# Persistent File Storage Driver: "postgres" | "s3" | "local"
STORAGE_DRIVER=postgres

# Optional S3 / Cloudflare R2 Object Storage (if STORAGE_DRIVER=s3)
S3_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=forgecode-workspaces
S3_ACCESS_KEY=your_access_key
S3_SECRET_KEY=your_secret_key

# Default AI Provider Settings (Optional server defaults; users can supply their own keys)
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GEMINI_API_KEY=

# MCP Configuration
MCP_BASE_PATH=/mcp
MCP_SESSION_TIMEOUT_MS=3600000

# Execution & Terminal Settings
ENABLE_TERMINAL=true
MAX_EXECUTION_TIME_SEC=300
```

---

## 18. Testing & Quality Acceptance Suite

Implement automated testing across unit, integration, and end-to-end layers using Vitest / Jest and Supertest.

### Test Scenarios

1. **Authentication & Multi-Tenant Isolation**:
   - User A cannot view, edit, or delete files belonging to User B (`403 Forbidden`).
   - Revoked MCP tokens fail authentication immediately (`401 Unauthorized`).
2. **File Saving & Optimistic Concurrency**:
   - Concurrent writes with stale `baseSha256` trigger `409 Conflict`.
   - File contents and hashes match accurately across disk and PostgreSQL.
3. **Line-by-Line Patch Engine**:
   - Single-line edits, multi-line refactors, and hunk rejections produce exact expected file contents.
   - Ambiguous or conflicted hunks are rejected with explanatory errors.
   - Snapshot rollback (`undo_change`) restores bit-for-bit previous file content.
4. **MCP Protocol Verification**:
   - MCP protocol initialization and capability handshake complete successfully.
   - MCP tools `read_file`, `propose_patch`, `accept_patch`, and `list_files` execute with validated schemas.
5. **Voroa Health & Resilience**:
   - Fresh migrations apply cleanly on a clean Voroa PostgreSQL instance.
   - `/healthz` returns `200 OK` when PostgreSQL is online, and `503 Service Unavailable` on database outage.

---

## 19. Incremental Implementation Milestones

Execute the development in sequential, verifiable milestones. Each milestone must result in testable, running code.

### Milestone 1: Node.js Foundation & Voroa PostgreSQL Setup
- Initialize TypeScript Node.js project (`package.json`, `tsconfig.json`).
- Configure Express.js / Fastify web application with `/healthz`.
- Setup Prisma ORM / Drizzle ORM connected to PostgreSQL via `DATABASE_URL`.
- Run migrations for `User`, `Project`, and `ProjectFile` models.
- Implement user registration, login, JWT cookies, and project CRUD APIs.
- *Deliverable*: Deployed Node.js app on Voroa connected to Voroa PostgreSQL with authentication.

### Milestone 2: Modern IDE Layout & Monaco Editor
- Setup Vite frontend with responsive dark developer shell (Activity bar, Sidebar, Editor, Panel, Status bar).
- Embed Monaco Editor with tabs, dirty state indicators, and syntax highlighting for top languages.
- Connect file tree explorer to backend file CRUD APIs (`/api/projects/:id/files`).
- Implement atomic file saving with SHA-256 conflict detection.
- *Deliverable*: A fully functional browser IDE where users can create, browse, edit, and save real project files.

### Milestone 3: Advanced Line-by-Line Patch Engine & Diff Review
- Build the Node.js patch and diff computation engine (`diff` / Myers diff algorithm).
- Implement `EditProposal` and `EditProposalHunk` storage in PostgreSQL.
- Embed Monaco Diff Editor for side-by-side and inline diff inspection.
- Build "Accept Hunk", "Reject Hunk", "Apply All", and "Undo" controls.
- *Deliverable*: Safe, visual, line-by-line code review workflow with snapshot rollback history.

### Milestone 4: Native Node.js MCP Server
- Implement `@modelcontextprotocol/sdk` Streamable HTTP / SSE transport on `/mcp`.
- Register the full tool catalog (`read_file`, `propose_patch`, `accept_patch`, `search_code`, etc.).
- Build token-based authentication and granular permission checking.
- Create the MCP settings dashboard in the IDE to generate and manage connection tokens.
- *Deliverable*: External AI agents (Cursor, Claude Desktop, Antigravity) can connect to ForgeCode AI via MCP and propose edits.

### Milestone 5: Integrated AI Assistant & Provider Adapters
- Build streaming AI chat panel with Server-Sent Events.
- Implement provider adapters for OpenAI, Anthropic, Gemini, and custom OpenAI-compatible endpoints.
- Integrate project context engine (file contents, open tabs, active selection, directory tree).
- Wire AI responses directly into the Patch Engine so AI suggestions appear as visual diffs.
- *Deliverable*: In-editor AI assistant capable of reading project context and generating targeted diff proposals.

### Milestone 6: Terminal, Git & Developer Productivity
- Integrate `xterm.js` terminal connecting to backend process execution.
- Implement Git status, diff, commit, and branch switching via `simple-git`.
- Implement full-text code search (`Cmd+Shift+F`) and Quick Open (`Cmd+P`).
- *Deliverable*: Full developer environment with version control and execution tools.

### Milestone 7: Voroa Production Hardening & Optimization
- Comprehensive security audit (path traversal sanitization, helmet, rate limiting).
- Finalize production Dockerfile or Voroa buildpack configuration.
- Write end-to-end acceptance tests.
- Verify zero-downtime deploy and automated migration verification on Voroa.com.
- *Deliverable*: Production-ready, fully documented ForgeCode AI instance running live on Voroa.

---

## 20. Final Definition of Done

ForgeCode AI is considered complete and ready for production when:

1. **Voroa Deployment**: The Node.js application is running live on Voroa Web Service and connected securely via SSL to Voroa Managed PostgreSQL.
2. **Authentication**: Users can register, log in, generate PATs, and manage projects in complete isolation.
3. **Editor Experience**: Monaco Editor opens files instantly, supports tabs, displays syntax highlighting, and saves files atomically.
4. **Patch Workflow**: An AI request results in a targeted line-by-line patch proposal, displayed in Monaco Diff Editor, which can be reviewed hunk-by-hunk, accepted, applied, and undone.
5. **MCP Compliance**: An external agent can authenticate to `/mcp`, discover all tools, inspect the project tree, read files, and propose patches.
6. **Persistence**: Project files and database records survive application redeployment and container restarts.
7. **Security**: All paths are strictly sanitized against traversal, secrets are encrypted at rest, and unauthorized API calls are rejected.
8. **No Placeholders**: Every button, modal, toggle, and tool in the application is backed by real, working Node.js code.

Begin implementation by initializing Milestone 1: the Node.js TypeScript foundation, Voroa PostgreSQL schema migrations, and health check validation.
