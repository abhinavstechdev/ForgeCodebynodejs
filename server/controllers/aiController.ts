import { Response } from 'express';
import { prisma } from '../db/prisma.js';
import { AuthRequest } from '../middleware/auth.js';
import { ContextEngine } from '../services/ai/contextEngine.js';
import { getAIAdapter } from '../services/ai/index.js';
import { PatchEngine } from '../services/patchEngine.js';
import { getStorageDriver } from '../services/storage/index.js';
import { decryptSecret } from '../utils/crypto.js';

export class AiController {
  static async chat(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const {
        message,
        conversationId: reqConvoId,
        activeFilePath,
        selectedLines,
        openTabs,
        provider: userProvider,
        model: userModel,
      } = req.body;

      if (!message) {
        res.status(400).json({ error: 'Message content is required' });
        return;
      }

      // Find or create conversation
      let conversationId = reqConvoId;
      if (!conversationId) {
        const newConvo = await prisma.aiConversation.create({
          data: {
            projectId,
            title: message.slice(0, 30) + '...',
          },
        });
        conversationId = newConvo.id;
      }

      // Record user message
      await prisma.aiMessage.create({
        data: {
          conversationId,
          role: 'user',
          content: message,
          filesReferenced: activeFilePath ? [activeFilePath] : [],
        },
      });

      // Retrieve user's configured AI settings and API keys
      const userSettings = await prisma.userAiSetting.findUnique({
        where: { userId: req.user!.id },
      });

      const providerId = userProvider || userSettings?.defaultProvider || 'openai';
      const model = userModel || userSettings?.defaultModel || 'gpt-4o';

      const encKeys = (userSettings?.encryptedKeys as Record<string, string>) || {};
      let apiKey = encKeys[providerId] ? decryptSecret(encKeys[providerId]) : undefined;

      // Prepare SSE streaming headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      res.write(`data: ${JSON.stringify({ type: 'start', conversationId })}\n\n`);

      // Assemble rich project context
      const context = await ContextEngine.assembleContext({
        projectId,
        activeFilePath,
        selectedLines,
        openTabs,
      });

      // Fetch last 6 messages from conversation for memory
      const pastMessages = await prisma.aiMessage.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        take: 6,
      });

      const chatHistory = pastMessages.reverse().map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

      const adapter = getAIAdapter(providerId);
      let assistantResponse = '';

      const abortController = new AbortController();
      req.on('close', () => abortController.abort());

      try {
        await adapter.streamCompletion(
          {
            model,
            systemPrompt: context.systemPrompt,
            messages: chatHistory,
            apiKey,
            abortSignal: abortController.signal,
          },
          (chunk: string) => {
            assistantResponse += chunk;
            res.write(`data: ${JSON.stringify({ type: 'chunk', text: chunk })}\n\n`);
          }
        );
      } catch (streamErr: any) {
        // If external API key is missing or failed, provide intelligent pair-programming fallback
        if (!assistantResponse) {
          const fallbackResponse = `I received your request: "${message}".\n\nTo enable live LLM completions via OpenAI, Anthropic, or Gemini, enter your API key in **AI Settings** (click the gear icon in the AI panel).\n\nHere is a recommended approach for your project:\n- Ensure module exports are clean.\n- Add unit tests for your core business logic.\n- Verify all asynchronous functions handle cancellation tokens.`;
          assistantResponse = fallbackResponse;
          res.write(`data: ${JSON.stringify({ type: 'chunk', text: fallbackResponse })}\n\n`);
        }
      }

      // Check if assistant response contains proposed code modification for active file
      let createdProposalId: string | undefined;
      const codeBlockMatch = assistantResponse.match(/```[a-zA-Z0-9_-]*(?::([^\n]+))?\n([\s\S]*?)```/);
      
      if (codeBlockMatch && context.activeFileContext) {
        const targetPath = codeBlockMatch[1] || context.activeFileContext.path;
        const proposedCode = codeBlockMatch[2];

        try {
          const project = await prisma.project.findUnique({ where: { id: projectId } });
          const storage = getStorageDriver(project?.storageDriver);
          const currentContent = await storage.readFile(projectId, targetPath);

          const proposalData = PatchEngine.createProposal({
            projectId,
            filePath: targetPath,
            baseVersion: context.activeFileContext.version,
            baseSha256: context.activeFileContext.sha256,
            originalContent: currentContent,
            proposedContent: proposedCode,
            explanation: `AI suggested changes from prompt: ${message.slice(0, 50)}`,
          });

          if (proposalData.hunks.length > 0) {
            const proposal = await prisma.editProposal.create({
              data: {
                id: proposalData.id,
                projectId,
                filePath: targetPath,
                baseVersion: context.activeFileContext.version,
                baseSha256: context.activeFileContext.sha256,
                explanation: proposalData.explanation,
                status: 'pending',
                hunks: {
                  create: proposalData.hunks.map(h => ({
                    id: h.hunkId,
                    hunkIndex: h.hunkIndex,
                    oldStartLine: h.oldStartLine,
                    oldLineCount: h.oldLineCount,
                    newStartLine: h.newStartLine,
                    newLineCount: h.newLineCount,
                    oldContent: h.oldContent,
                    newContent: h.newContent,
                    status: 'pending',
                  })),
                },
              },
            });
            createdProposalId = proposal.id;
          }
        } catch {
          // ignore proposal generation error
        }
      }

      // Save assistant message in conversation
      await prisma.aiMessage.create({
        data: {
          conversationId,
          role: 'assistant',
          content: assistantResponse,
          metadata: createdProposalId ? { proposalId: createdProposalId } : undefined,
        },
      });

      res.write(
        `data: ${JSON.stringify({
          type: 'end',
          conversationId,
          proposalId: createdProposalId,
        })}\n\n`
      );
      res.end();
    } catch (err: any) {
      if (!res.headersSent) {
        res.status(500).json({ error: 'AI Assistant error', details: err.message });
      } else {
        res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
        res.end();
      }
    }
  }

  static async getConversations(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const convos = await prisma.aiConversation.findMany({
        where: { projectId },
        include: {
          messages: { orderBy: { createdAt: 'asc' } },
        },
        orderBy: { updatedAt: 'desc' },
      });

      res.json({ conversations: convos });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch conversations', details: err.message });
    }
  }
}
