import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { prisma } from '../db/prisma.js';
import { getStorageDriver } from './storage/index.js';

export class ExecutionService {
  private static async getProjectWorkingDir(projectId: string): Promise<string> {
    const baseDir = path.resolve(process.env.STORAGE_LOCAL_DIR || './storage/workspaces');
    const projectDir = path.join(baseDir, projectId);
    await fs.mkdir(projectDir, { recursive: true });

    // Sync files from postgres storage if needed
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (project?.storageDriver === 'postgres') {
      const storage = getStorageDriver('postgres');
      const files = await storage.listFiles(projectId);
      for (const file of files) {
        try {
          const content = await storage.readFile(projectId, file.path);
          const fullPath = path.join(projectDir, file.path);
          await fs.mkdir(path.dirname(fullPath), { recursive: true });
          await fs.writeFile(fullPath, content, 'utf8');
        } catch {
          // ignore
        }
      }
    }

    return projectDir;
  }

  static async runCommand(projectId: string, command: string): Promise<{ jobId: string }> {
    const job = await prisma.executionJob.create({
      data: {
        projectId,
        command,
        status: 'running',
        startedAt: new Date(),
      },
    });

    const workDir = await this.getProjectWorkingDir(projectId);

    // Filter environment variables to protect system secrets
    const sanitizedEnv: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      USERPROFILE: process.env.USERPROFILE,
      NODE_ENV: 'test',
    };

    // Run command in shell
    const child = spawn(command, {
      cwd: workDir,
      env: sanitizedEnv,
      shell: true,
      timeout: 300000, // 5 min timeout
    });

    let output = '';
    const maxOutputBytes = 5 * 1024 * 1024; // 5MB

    child.stdout?.on('data', (data: Buffer) => {
      if (output.length < maxOutputBytes) {
        output += data.toString('utf8');
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      if (output.length < maxOutputBytes) {
        output += data.toString('utf8');
      }
    });

    child.on('close', async (exitCode: number | null) => {
      await prisma.executionJob.update({
        where: { id: job.id },
        data: {
          status: exitCode === 0 ? 'completed' : 'failed',
          exitCode: exitCode ?? -1,
          output,
          finishedAt: new Date(),
        },
      });
    });

    child.on('error', async (err: Error) => {
      await prisma.executionJob.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          output: `Error executing command: ${err.message}`,
          finishedAt: new Date(),
        },
      });
    });

    return { jobId: job.id };
  }

  static async getJobStatus(jobId: string) {
    const job = await prisma.executionJob.findUnique({
      where: { id: jobId },
    });
    if (!job) throw new Error(`Execution job not found: ${jobId}`);
    return {
      id: job.id,
      status: job.status,
      exitCode: job.exitCode,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
    };
  }

  static async getJobOutput(jobId: string) {
    const job = await prisma.executionJob.findUnique({
      where: { id: jobId },
    });
    if (!job) throw new Error(`Execution job not found: ${jobId}`);
    return {
      id: job.id,
      status: job.status,
      exitCode: job.exitCode,
      output: job.output || '',
    };
  }
}
