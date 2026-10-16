import { prisma } from '../../db/prisma.js';
import { getStorageDriver } from '../storage/index.js';
import { scrubSecrets, scrubEnvFileContent } from '../../utils/secretScrubber.js';

export interface ContextOptions {
  projectId: string;
  activeFilePath?: string;
  selectedLines?: { startLine: number; endLine: number; content: string };
  openTabs?: string[];
}

export interface AssembledContext {
  systemPrompt: string;
  projectOverview: string;
  activeFileContext?: {
    path: string;
    version: number;
    sha256: string;
    content: string;
    lineCount: number;
  };
}

export class ContextEngine {
  static async assembleContext(options: ContextOptions): Promise<AssembledContext> {
    const project = await prisma.project.findUnique({
      where: { id: options.projectId },
      include: {
        files: {
          select: {
            path: true,
            isFolder: true,
            version: true,
            sha256: true,
            sizeBytes: true,
          },
        },
      },
    });

    if (!project) {
      throw new Error(`Project ${options.projectId} not found`);
    }

    const storage = getStorageDriver(project.storageDriver);

    // 1. Project file tree overview
    const fileList = project.files
      .filter(f => !f.isFolder && !f.path.startsWith('node_modules/') && !f.path.startsWith('.git/'))
      .map(f => f.path)
      .slice(0, 100);

    let packageJsonSummary = '';
    const pkgFile = project.files.find(f => f.path === 'package.json');
    if (pkgFile) {
      try {
        const pkgContent = await storage.readFile(project.id, 'package.json');
        const parsed = JSON.parse(pkgContent);
        packageJsonSummary = `Dependencies: ${Object.keys(parsed.dependencies || {}).join(', ')}`;
      } catch {
        // ignore
      }
    }

    const projectOverview = `
Project Name: ${project.name}
Files in Project (${fileList.length} files):
${fileList.map(f => `- ${f}`).join('\n')}
${packageJsonSummary ? `\n${packageJsonSummary}` : ''}
`.trim();

    // 2. Active file content
    let activeFileContext: AssembledContext['activeFileContext'] | undefined;
    if (options.activeFilePath) {
      const fileRecord = project.files.find(f => f.path === options.activeFilePath);
      if (fileRecord) {
        try {
          let rawContent = await storage.readFile(project.id, fileRecord.path);
          if (fileRecord.path.endsWith('.env')) {
            rawContent = scrubEnvFileContent(rawContent);
          } else {
            rawContent = scrubSecrets(rawContent);
          }

          const lines = rawContent.split('\n');
          activeFileContext = {
            path: fileRecord.path,
            version: fileRecord.version,
            sha256: fileRecord.sha256,
            content: rawContent,
            lineCount: lines.length,
          };
        } catch {
          // ignore read error
        }
      }
    }

    // 3. System Prompt tailored for ForgeCode line-by-line patch engine
    const systemPrompt = `
You are ForgeCode AI, an expert, precision AI coding assistant and pair programmer built directly into the ForgeCode Web IDE.
You are helping the developer understand, build, refactor, and fix code in their project.

${projectOverview}

${activeFileContext ? `Active File: ${activeFileContext.path} (Total lines: ${activeFileContext.lineCount}, Version: ${activeFileContext.version})\nFile Content:\n\`\`\`\n${activeFileContext.content}\n\`\`\`` : ''}

${options.selectedLines ? `Selected Line Range (${options.selectedLines.startLine} to ${options.selectedLines.endLine}):\n\`\`\`\n${options.selectedLines.content}\n\`\`\`` : ''}

CRITICAL RULES FOR PROPOSING CODE CHANGES:
1. When you want to suggest edits to a file, provide clear reasoning, and then provide a proposed patch.
2. If proposing code modifications for the active file or a specific file, output the proposed revised version in a clear markdown code block tagged with the file path, for example:
\`\`\`typescript:src/index.ts
// Updated code here
\`\`\`
3. Keep edits surgical and line-by-line whenever possible. Do not invent unnecessary rewrites.
4. Adhere to strict security best practices: prevent path traversal, SQL injections, and never leak sensitive environment variables or secrets.
`.trim();

    return {
      systemPrompt,
      projectOverview,
      activeFileContext,
    };
  }
}
