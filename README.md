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
   - 27 standard-compliant tools including project tree discovery, regex code search, file operations, diff proposals, and git version control.
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
| **Version Control** | `git_status`, `git_diff`, `git_commit`, `git_history` |
| **Execution & Tests** | `run_tests`, `get_execution_status`, `get_execution_output` |

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
