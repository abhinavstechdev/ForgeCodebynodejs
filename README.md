# ForgeCode AI — Production AI-Powered Web IDE

> A production-oriented, browser-based cloud AI development environment inspired by Visual Studio Code and Cursor. ForgeCode AI integrates **Monaco Editor**, official **Model Context Protocol (MCP)** server, an **advanced line-by-line patch & diff review engine**, and **Voroa Managed PostgreSQL**.

[![Node.js](https://img.shields.io/badge/Node.js-22%20LTS-green.svg)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18%20%7C%2017-blue.svg)](https://voroa.com/)
[![MCP](https://img.shields.io/badge/MCP-1.6.0%20Protocol%20Compliant-purple.svg)](https://modelcontextprotocol.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Architecture Overview

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

### Key Capabilities

1. **Monaco Editor & Monaco Diff Viewer**:
   - Custom dark developer theme (`#18181b` / `#1f1f23`).
   - IntelliSense, bracket pair colorization, multi-cursor, and minimap.
   - Side-by-side and inline diff inspection with floating hunk controls (`[✓] Accept`, `[✗] Reject`, `Apply Selected`).

2. **Line-by-Line Patch & Diff Engine**:
   - Surgical hunk modifications instead of rewriting 1,000-line files for a 3-line change.
   - Myers diff algorithm with sliding-window fuzzy fallback matching.
   - Optimistic concurrency conflict detection (`baseSha256`).
   - Snapshot rollback history (`undo_change`) for bit-for-bit reversion.

3. **Native Model Context Protocol (MCP) Server**:
   - Implements `@modelcontextprotocol/sdk` Streamable HTTP / Server-Sent Events (SSE) on `/mcp`.
   - Bearer token authentication with granular scopes (`files:read`, `files:write`, `patch:propose`, `patch:apply`, `git:read`, `git:write`, `terminal:execute`).
   - 28 standard-compliant tools including project tree discovery, regex code search, file operations, diff proposals, git version control, and direct GitHub push (git_push).
   - 1-click configuration snippet export for **Claude Desktop**, **Cursor**, and **Antigravity**.

4. **Multi-Provider AI Architecture**:
   - Streaming SSE chat with sliding-window context engine.
   - Adapters for **OpenAI** (GPT-4o, o3-mini), **Anthropic** (Claude 3.5 Sonnet), **Google Gemini** (Gemini 2.5 Flash), and custom OpenAI-compatible endpoints (Ollama, LM Studio).
   - Server-side AES-256-GCM encryption of user API keys.
   - Automatic secret scrubbing of environment variables and private tokens before sending prompts to LLMs.

5. **Sandboxed Terminal & Git Integration**:
   - Real-time `xterm.js` web terminal connected over WebSockets (`/ws/terminal`).
   - Parameterized Git version control (`simple-git`) for staging, committing, diffing, and branch switching.

6. **Voroa.com Deployment & Persistent Storage**:
   - Zero-dependency built-in PostgreSQL blob storage driver (`FileContent` partitioned by `project_id`).
   - Configurable S3 / Cloudflare R2 object storage driver.
   - Persistent volume local mount driver.
   - Automated Prisma migrations and `/healthz` health check endpoint.

---

## Model Context Protocol (MCP) Integration

ForgeCode AI exposes a compliant MCP server at:
```
https://<your-voroa-app-or-host>/mcp
```

### Claude Desktop Configuration (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "forgecode": {
      "url": "https://your-app.voroa.app/mcp",
      "headers": {
        "Authorization": "Bearer mcp_live_YOUR_TOKEN_HERE"
      }
    }
  }
}
```

### Registered MCP Tools Catalog

| Category | Tools |
|---|---|
| **Project Discovery** | `list_projects`, `get_project_tree`, `list_files` |
| **Reading & Search** | `read_file`, `read_lines`, `search_code`, `search_files`, `get_diagnostics` |
| **File Operations** | `create_file`, `create_directory`, `rename_file`, `delete_file`, `write_file` |
| **Safe Code Editing** | `propose_patch`, `preview_diff`, `get_patch_status`, `accept_patch`, `accept_patch_hunk`, `reject_patch`, `undo_change` |
| **Version Control (Inspection)** | `git_status`, `git_diff`, `git_history` |
| **Version Control (Smart Sync & Write)** | `git_sync`, `git_commit`, `git_push`, `git_fetch`, `git_pull` |
| **Branch Management** | `git_branch_list`, `git_branch_create`, `git_branch_switch`, `git_branch_delete`, `git_set_upstream` |
| **GitHub Integration** | `clone_repository`, `github_repo_info`, `github_list_pull_requests`, `github_create_pull_request`, `github_compare`, `github_check_auth` |
| **Execution & Tests** | `run_tests`, `get_execution_status`, `get_execution_output` |

---

## Smart Git Sync & GitHub Integration

ForgeCode AI features a production-ready, pure-JS Git engine powered by `isomorphic-git` and authenticated GitHub REST API integrations. It requires **zero external Git CLI binaries** installed on the server container and operates seamlessly across serverless and isolated container environments like Voroa.com.

### 1. Smart Git Sync Engine (`git_sync`)

The `git_sync` tool safely reconciles changes between your local project workspace and a configured remote repository.

#### Workflow Steps
1. Validates project ID and resolves workspace working directory.
2. Synchronizes database storage (`WorkspaceStorageAdapter`) to disk working tree.
3. Inspects index state, working-tree modifications, staged files, and untracked files.
4. Detects whether any Git operation (`merge`, `rebase`, `cherry-pick`, `revert`) is currently in progress.
5. Acquires per-repository exclusive lock via `GitLockManager` to prevent race conditions.
6. Fetches latest refs from the configured remote repository.
7. Computes merge base (`findMergeBase`) and calculates ahead / behind commit distance.
8. Safely fast-forwards or reconciles histories via explicit strategy (`safe`, `ff-only`, `merge`, `rebase`).
9. Never automatically discards, resets, or stashes user changes without explicit instructions.
10. If merge conflicts occur, preserves conflict markers, aborts destructive steps, and returns structured conflict details.
11. Pushes to remote only when explicitly requested (`push: true`), requiring `force: true` for non-fast-forward pushes.
12. Synchronizes disk changes back to database storage (`WorkspaceStorageAdapter.syncDiskToStorage`).
13. Returns structured status report with commit hashes, ahead/behind counts, and operation summaries.

#### Parameters

```typescript
git_sync({
  projectId?: string;      // Project UUID (defaults to active workspace)
  remoteName?: string;     // Remote name (default: "origin")
  branch?: string;         // Target branch (default: current branch or upstream)
  strategy?: 'safe' | 'ff-only' | 'merge' | 'rebase'; // Sync strategy (default: "safe")
  push?: boolean;          // Push local commits to remote after reconciliation (default: false)
  commitMessage?: string;  // Commit message to safely auto-stage & commit changes before syncing
  force?: boolean;         // Explicit opt-in required for force-pushing (warning: may overwrite remote history)
  dryRun?: boolean;        // Preview analysis without mutating working tree or remote (default: false)
  token?: string;          // GitHub Personal Access Token (defaults to GITHUB_TOKEN environment variable)
})
```

#### Structured Response Fields

```typescript
{
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
  warnings?: string[];
  message: string;
}
```

---

### 2. Complete Git Status, Diff & History Access

#### `git_status`
Returns full structured porcelain repository status:
- `currentBranch`: Active branch name
- `headCommit`: Current commit SHA
- `upstreamBranch`: Tracking branch (e.g. `origin/main`)
- `ahead` / `behind`: Commit distance between local and remote
- `staged`: Staged file paths
- `unstaged`: Modified but unstaged file paths
- `untracked`: New untracked files
- `deleted`: Deleted file paths
- `conflicted`: Conflicted file paths (e.g. unmerged files)
- `workingTreeClean`: Boolean indicating zero uncommitted or untracked changes
- `operationInProgress`: `null | 'merge' | 'rebase' | 'cherry-pick' | 'revert'`

#### `git_diff`
Generates comprehensive unified diffs with:
- Staged diff (`staged: true`) or unstaged working tree diff (`staged: false`)
- Revision range comparison (`fromRevision` and `toRevision`)
- File path filter (`filePath`)
- Line limit pagination (`maxLines`, default 1000)
- Insertion & deletion file statistics
- **Automatic secret scrubbing**: All GitHub PATs (`ghp_...`, `github_pat_...`), API keys (`sk-...`), and passwords are redacted (`[REDACTED_SECRET]`) before diff is returned.

#### `git_history`
Retrieves commit log with commit SHA, commit message, author name & email, ISO timestamp, parent commit hashes, and file paths.

---

### 3. Full GitHub Repository Synchronization

| Tool | Purpose | Required Scope |
|---|---|---|
| `clone_repository` | Clones public/private remote repo into workspace and syncs to DB | `git:write` |
| `git_fetch` | Fetches remote branches and tags without merging | `git:read` |
| `git_pull` | Fetches and integrates remote changes into working branch | `git:write` |
| `git_push` | Pushes local commits to remote GitHub repository | `git:write` or `git:commit` |
| `git_branch_list` | Lists local and remote-tracking branches with current indicator | `git:read` |
| `git_branch_create` | Creates new branch at revision point and optionally checks out | `git:write` |
| `git_branch_switch` | Switches branches (safely protects uncommitted changes) | `git:write` |
| `git_branch_delete` | Deletes local branch (protects current checked-out branch) | `git:write` |
| `git_set_upstream` | Configures remote tracking upstream branch | `git:write` |
| `github_repo_info` | Inspects GitHub repository metadata via GitHub REST API | `git:read` |
| `github_list_pull_requests` | Lists open/closed pull requests from GitHub API | `git:read` |
| `github_create_pull_request` | Creates pull request between branches on GitHub | `git:write` |
| `github_compare` | Compares two branches or commits on GitHub | `git:read` |
| `github_check_auth` | Verifies GitHub token, user identity, scopes, and API rate limits | `git:read` |

---

### 4. OAuth Scopes & Authorization Model

ForgeCode AI enforces granular OAuth 2.1 scopes for all tools:

| Scope | Description | Allowed Tools |
|---|---|---|
| `git:read` | Read-only inspection of repository state, history, diffs, and GitHub metadata | `git_status`, `git_diff`, `git_history`, `git_fetch`, `git_branch_list`, `github_repo_info`, `github_list_pull_requests`, `github_compare`, `github_check_auth` |
| `git:write` | Write operations including sync, pull, clone, and branch management | `git_sync`, `clone_repository`, `git_pull`, `git_branch_create`, `git_branch_switch`, `git_branch_delete`, `git_set_upstream`, `github_create_pull_request` |
| `git:commit` | Creating local commits and pushing to remote repositories | `git_commit`, `git_push`, `git_sync` |

#### Handling Missing Scopes & Reauthorization
If your client token lacks a required scope, the server returns an actionable structured error:
```json
{
  "isError": true,
  "errorCode": "AUTH_SCOPE_MISSING",
  "message": "Permission denied: Missing required MCP scope 'git:read'"
}
```
To grant missing scopes:
1. Re-run OAuth authorization flow at `https://<your-host>/oauth/authorize`.
2. Request `git:read git:write git:commit` along with base scopes (`files:read files:write`).
3. Or generate an MCP access token in the ForgeCode AI Web UI under **Settings → MCP Tokens** with full Git permissions.

---

### 5. Error Code Reference

The server returns stable, machine-readable error codes in JSON responses:

| Error Code | Description | Recommended Action |
|---|---|---|
| `PROJECT_NOT_FOUND` | Project UUID not found or access denied | Verify project ID or select an accessible workspace |
| `NOT_A_GIT_REPOSITORY` | Working tree does not have a valid `.git` structure | Run `ensureRepo` or clone into workspace |
| `GIT_PERMISSION_DENIED` | GitHub API or remote Git HTTP returned 401/403 | Verify `GITHUB_TOKEN` credentials and PAT scopes (`repo`) |
| `AUTH_SCOPE_MISSING` | MCP token lacks `git:read` or `git:write` scope | Re-authenticate requesting the required scope |
| `REMOTE_NOT_FOUND` | Remote (e.g. `origin`) not configured on repository | Configure remote via `setRemote` or `git_push` |
| `BRANCH_NOT_FOUND` | Target branch ref does not exist locally or on remote | Create branch or check branch name spelling |
| `WORKING_TREE_DIRTY` | Uncommitted modifications prevent safe operation | Commit or stage changes, or pass `commitMessage` to sync |
| `NON_FAST_FORWARD` | Push rejected or ff-only pull failed due to divergence | Fetch and run `git_sync(strategy: 'merge')` |
| `MERGE_CONFLICT` | Conflict detected during pull or sync | Review conflicted files, resolve markers, and commit |
| `OPERATION_IN_PROGRESS` | Another operation holds lock or Git merge/rebase active | Complete/abort in-progress Git operation |
| `INVALID_PARAMETER` | Malformed branch name, path traversal, or invalid revision | Check parameter formatting |
| `GIT_OPERATION_FAILED` | Underlying Git execution error | Review error message details |

---

### 6. Workflow Examples

#### A. Checking Detailed Status
```json
// Tool: git_status
{}
```

#### B. Previewing Synchronization Safely (`dryRun`)
```json
// Tool: git_sync
{
  "dryRun": true,
  "strategy": "safe"
}
```

#### C. Synchronizing with Remote & Auto-Staging
```json
// Tool: git_sync
{
  "strategy": "merge",
  "commitMessage": "Auto-staged local updates before sync",
  "push": true
}
```

#### D. Pushing New Commits
```json
// Tool: git_push
{
  "branch": "main",
  "commitMessage": "feat: add user authentication controller"
}
```

#### E. Recovering from Merge Conflicts
If `git_sync` reports `MERGE_CONFLICT`:
1. Inspect conflicting files using `git_status`: check `conflicted: [...]`.
2. Inspect conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) using `read_file` or `git_diff`.
3. Edit files to resolve conflicts using `write_file` or patch tools.
4. Stage resolved files: `git_commit(message: "fix: resolve sync merge conflicts")`.
5. Run `git_sync(push: true)` to finish synchronization.

---

## Quick Start & Local Development

### Prerequisites

- Node.js 20+ LTS or 22 LTS
- PostgreSQL database (or Voroa / Neon PostgreSQL instance)

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/abhinavstechdev/ForgeCodebynodejs.git
cd ForgeCodebynodejs
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in your database credentials:

```bash
cp .env.example .env
```

### 3. Initialize PostgreSQL Database

```bash
npx prisma generate
npx prisma db push
```

### 4. Run Development Servers

```bash
npm run dev
```

- **Frontend (Vite)**: `http://localhost:5173`
- **Backend API & Healthcheck**: `http://localhost:3000/healthz`
- **MCP Endpoint**: `http://localhost:3000/mcp`

---

## Deploying on Voroa.com

1. In Voroa Dashboard, create a **Managed PostgreSQL** database (PostgreSQL 18).
2. Create a **Web Service** pointing to this GitHub repository.
3. Set the following environment variables:
   - `NODE_ENV`: `production`
   - `PORT`: `3000`
   - `HOST`: `0.0.0.0`
   - `DATABASE_URL`: `[Linked Voroa Database URL]`
   - `APP_SECRET_KEY`: `[Generated 64-char hex key]`
   - `STORAGE_DRIVER`: `postgres`
4. Set Build & Start commands:
   - **Build Command**: `npm ci && npm run build && npx prisma migrate deploy`
   - **Start Command**: `npm run start`
5. Deploy service and verify via `/healthz`.

---

## License

MIT © [ForgeCode AI](https://github.com/abhinavstechdev/ForgeCodebynodejs)
