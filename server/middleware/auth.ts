import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../db/prisma.js';

const JWT_SECRET = process.env.APP_SECRET_KEY || 'forgecode_development_secret_key_12345';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

export interface AuthRequest extends Request {
  user?: AuthenticatedUser;
  projectRole?: string;
}

export function signJwtToken(user: AuthenticatedUser): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export function verifyJwtToken(token: string): AuthenticatedUser | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    return {
      id: decoded.id,
      email: decoded.email,
      name: decoded.name || null,
      role: decoded.role || 'user',
    };
  } catch {
    return null;
  }
}

/**
 * Authentication Middleware: checks Bearer token, Cookie, or personal access token
 */
export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  let token: string | undefined;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.cookies && req.cookies.forgecode_token) {
    token = req.cookies.forgecode_token;
  }

  if (!token) {
    res.status(401).json({ error: 'Unauthorized: Authentication required' });
    return;
  }

  const user = verifyJwtToken(token);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
    return;
  }

  req.user = user;
  next();
}

/**
 * Project Access Control Middleware: prevents IDOR and verifies project permissions
 */
export function requireProjectAccess(requiredRole: 'viewer' | 'editor' | 'admin' = 'editor') {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const projectId = req.params.projectId || req.params.id || req.body?.projectId;
    if (!projectId) {
      res.status(400).json({ error: 'Missing projectId' });
      return;
    }

    try {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          members: {
            where: { userId: req.user.id },
          },
        },
      });

      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      // Owner has full access
      if (project.ownerId === req.user.id) {
        req.projectRole = 'owner';
        next();
        return;
      }

      const membership = project.members[0];
      if (!membership) {
        res.status(403).json({ error: 'Forbidden: You do not have access to this project' });
        return;
      }

      const roleHierarchy: Record<string, number> = { viewer: 1, editor: 2, admin: 3 };
      const userLevel = roleHierarchy[membership.role] || 0;
      const requiredLevel = roleHierarchy[requiredRole] || 2;

      if (userLevel < requiredLevel) {
        res.status(403).json({ error: `Forbidden: Requires ${requiredRole} role` });
        return;
      }

      req.projectRole = membership.role;
      next();
    } catch (err: any) {
      res.status(500).json({ error: 'Access check failed', details: err?.message });
    }
  };
}
