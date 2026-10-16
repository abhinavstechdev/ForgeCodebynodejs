import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../db/prisma.js';
import { signJwtToken, AuthRequest } from '../middleware/auth.js';
import { encryptSecret, decryptSecret, maskKey, generateMcpToken } from '../utils/crypto.js';

export class AuthController {
  static async register(req: Request, res: Response): Promise<void> {
    try {
      const { email, password, name } = req.body;
      if (!email || !password) {
        res.status(400).json({ error: 'Email and password are required' });
        return;
      }

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        res.status(409).json({ error: 'A user with this email already exists' });
        return;
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          name: name || null,
        },
      });

      // Create a default starter project for the new user
      const starterProject = await prisma.project.create({
        data: {
          ownerId: user.id,
          name: 'My Workspace',
          slug: 'my-workspace',
          description: 'Default starter workspace',
          storageDriver: 'postgres',
          storagePrefix: `user_${user.id}/default`,
        },
      });

      // Add a sample starter file
      await prisma.projectFile.create({
        data: {
          projectId: starterProject.id,
          path: 'src/index.ts',
          isFolder: false,
          version: 1,
          sha256: 'initial_hash',
          sizeBytes: 150,
        },
      });

      await prisma.fileContent.create({
        data: {
          projectId: starterProject.id,
          filePath: 'src/index.ts',
          sha256: 'initial_hash',
          content: `// Welcome to ForgeCode AI!\nconsole.log('ForgeCode AI running smoothly on Voroa.com');\n`,
        },
      });

      const token = signJwtToken(user);
      res.cookie('forgecode_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.status(201).json({
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
        token,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Registration failed', details: err.message });
    }
  }

  static async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        res.status(400).json({ error: 'Email and password are required' });
        return;
      }

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      const token = signJwtToken(user);
      res.cookie('forgecode_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.json({
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
        token,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Login failed', details: err.message });
    }
  }

  static async logout(req: Request, res: Response): Promise<void> {
    res.clearCookie('forgecode_token');
    res.json({ success: true, message: 'Logged out successfully' });
  }

  static async me(req: AuthRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    res.json({ user: req.user });
  }

  static async getAiSettings(req: AuthRequest, res: Response): Promise<void> {
    try {
      const settings = await prisma.userAiSetting.findUnique({
        where: { userId: req.user!.id },
      });

      if (!settings) {
        res.json({
          defaultProvider: 'openai',
          defaultModel: 'gpt-4o',
          keysConfigured: {
            openai: !!process.env.OPENAI_API_KEY,
            anthropic: !!process.env.ANTHROPIC_API_KEY,
            gemini: !!process.env.GEMINI_API_KEY,
          },
        });
        return;
      }

      const enc = (settings.encryptedKeys as Record<string, string>) || {};
      res.json({
        defaultProvider: settings.defaultProvider,
        defaultModel: settings.defaultModel,
        keysConfigured: {
          openai: !!enc.openai || !!process.env.OPENAI_API_KEY,
          anthropic: !!enc.anthropic || !!process.env.ANTHROPIC_API_KEY,
          gemini: !!enc.gemini || !!process.env.GEMINI_API_KEY,
          custom: !!enc.custom,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch AI settings', details: err.message });
    }
  }

  static async updateAiSettings(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { defaultProvider, defaultModel, apiKeys } = req.body;
      const current = await prisma.userAiSetting.findUnique({
        where: { userId: req.user!.id },
      });

      const existingEnc = (current?.encryptedKeys as Record<string, string>) || {};
      const updatedEnc = { ...existingEnc };

      if (apiKeys) {
        if (apiKeys.openai) updatedEnc.openai = encryptSecret(apiKeys.openai);
        if (apiKeys.anthropic) updatedEnc.anthropic = encryptSecret(apiKeys.anthropic);
        if (apiKeys.gemini) updatedEnc.gemini = encryptSecret(apiKeys.gemini);
        if (apiKeys.custom) updatedEnc.custom = encryptSecret(apiKeys.custom);
      }

      const saved = await prisma.userAiSetting.upsert({
        where: { userId: req.user!.id },
        create: {
          userId: req.user!.id,
          defaultProvider: defaultProvider || 'openai',
          defaultModel: defaultModel || 'gpt-4o',
          encryptedKeys: updatedEnc,
        },
        update: {
          defaultProvider: defaultProvider !== undefined ? defaultProvider : undefined,
          defaultModel: defaultModel !== undefined ? defaultModel : undefined,
          encryptedKeys: updatedEnc,
        },
      });

      res.json({ success: true, defaultProvider: saved.defaultProvider, defaultModel: saved.defaultModel });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to update AI settings', details: err.message });
    }
  }
}
