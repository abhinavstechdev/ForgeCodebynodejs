import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { verifyJwtToken } from '../middleware/auth.js';
import { prisma } from '../db/prisma.js';
import { getStorageDriver } from './storage/index.js';

export function setupTerminalWebSocket(wss: WebSocketServer) {
  wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    try {
      const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
      const token = url.searchParams.get('token');
      const projectId = url.searchParams.get('projectId');

      if (!token) {
        ws.send(JSON.stringify({ type: 'error', data: 'Unauthorized: Missing token' }));
        ws.close();
        return;
      }

      const user = verifyJwtToken(token);
      if (!user) {
        ws.send(JSON.stringify({ type: 'error', data: 'Unauthorized: Invalid token' }));
        ws.close();
        return;
      }

      if (!projectId) {
        ws.send(JSON.stringify({ type: 'error', data: 'Bad request: Missing projectId' }));
        ws.close();
        return;
      }

      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          OR: [
            { ownerId: user.id },
            { members: { some: { userId: user.id } } },
          ],
        },
      });

      if (!project) {
        ws.send(JSON.stringify({ type: 'error', data: 'Forbidden: Project access denied' }));
        ws.close();
        return;
      }

      // Prepare project directory
      const baseDir = path.resolve(process.env.STORAGE_LOCAL_DIR || './storage/workspaces');
      const projectDir = path.join(baseDir, project.id);
      await fs.mkdir(projectDir, { recursive: true });

      // Sync files from postgres storage if needed
      if (project.storageDriver === 'postgres') {
        const storage = getStorageDriver('postgres');
        const files = await storage.listFiles(project.id);
        for (const file of files) {
          try {
            const content = await storage.readFile(project.id, file.path);
            const fullPath = path.join(projectDir, file.path);
            await fs.mkdir(path.dirname(fullPath), { recursive: true });
            await fs.writeFile(fullPath, content, 'utf8');
          } catch {
            // ignore
          }
        }
      }

      // Shell determination
      const isWindows = process.platform === 'win32';
      const shell = isWindows ? 'powershell.exe' : (process.env.SHELL || 'bash');

      // Filtered environment
      const cleanEnv: NodeJS.ProcessEnv = {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        USERPROFILE: process.env.USERPROFILE,
        TERM: 'xterm-256color',
        FORGECODE_PROJECT_ID: project.id,
      };

      const ptyProcess: ChildProcess = spawn(shell, [], {
        cwd: projectDir,
        env: cleanEnv,
        shell: false,
      });

      ws.send(
        JSON.stringify({
          type: 'output',
          data: `\r\n\x1b[1;34m=== ForgeCode AI Sandboxed Terminal ===\x1b[0m\r\n\x1b[38;5;244mProject: ${project.name} (${projectDir})\x1b[0m\r\n\r\n`,
        })
      );

      ptyProcess.stdout?.on('data', (chunk: Buffer) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'output', data: chunk.toString('utf8') }));
        }
      });

      ptyProcess.stderr?.on('data', (chunk: Buffer) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'output', data: chunk.toString('utf8') }));
        }
      });

      ptyProcess.on('close', (code: number | null) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'output', data: `\r\nProcess exited with code ${code}\r\n` }));
          ws.close();
        }
      });

      ws.on('message', (message: string) => {
        try {
          const parsed = JSON.parse(message);
          if (parsed.type === 'input' && ptyProcess.stdin) {
            ptyProcess.stdin.write(parsed.data);
          }
        } catch {
          if (ptyProcess.stdin) {
            ptyProcess.stdin.write(message);
          }
        }
      });

      ws.on('close', () => {
        ptyProcess.kill();
      });
    } catch (err: any) {
      ws.send(JSON.stringify({ type: 'error', data: err.message }));
      ws.close();
    }
  });
}
