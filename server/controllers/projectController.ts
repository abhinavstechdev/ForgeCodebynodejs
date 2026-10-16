import { Response } from 'express';
import archiver from 'archiver';
import { prisma } from '../db/prisma.js';
import { AuthRequest } from '../middleware/auth.js';
import { getStorageDriver } from '../services/storage/index.js';
import { computeSha256 } from '../utils/crypto.js';

export class ProjectController {
  static async list(req: AuthRequest, res: Response): Promise<void> {
    try {
      const projects = await prisma.project.findMany({
        where: {
          OR: [
            { ownerId: req.user!.id },
            { members: { some: { userId: req.user!.id } } },
          ],
        },
        include: {
          _count: {
            select: { files: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
      });

      const formatted = projects.map(p => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        description: p.description,
        storageDriver: p.storageDriver,
        storagePrefix: p.storagePrefix,
        rootDirectory: p.rootDirectory,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
        fileCount: p._count.files,
      }));

      res.json({ projects: formatted });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to list projects', details: err.message });
    }
  }

  static async create(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { name, template = 'express', description } = req.body;
      if (!name) {
        res.status(400).json({ error: 'Project name is required' });
        return;
      }

      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'project';
      const storageDriver = process.env.STORAGE_DRIVER || 'postgres';

      const project = await prisma.project.create({
        data: {
          ownerId: req.user!.id,
          name,
          slug: `${slug}-${Date.now().toString(36)}`,
          description: description || null,
          storageDriver,
          storagePrefix: `user_${req.user!.id}/${slug}`,
        },
      });

      // Populate starter template files
      const storage = getStorageDriver(storageDriver);
      const starterFiles = getTemplateFiles(template, name);

      for (const [filePath, content] of Object.entries(starterFiles)) {
        await storage.writeFile(project.id, filePath, content);
        const sha256 = computeSha256(content);
        const bytes = Buffer.byteLength(content, 'utf8');

        await prisma.projectFile.create({
          data: {
            projectId: project.id,
            path: filePath,
            isFolder: false,
            version: 1,
            sha256,
            sizeBytes: bytes,
          },
        });
      }

      res.status(201).json({ project });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to create project', details: err.message });
    }
  }

  static async getById(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const project = await prisma.project.findUnique({
        where: { id },
        include: {
          members: {
            include: { user: { select: { id: true, name: true, email: true } } },
          },
        },
      });

      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      res.json({ project });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch project', details: err.message });
    }
  }

  static async delete(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const project = await prisma.project.findUnique({ where: { id } });
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      if (project.ownerId !== req.user!.id && req.user!.role !== 'admin') {
        res.status(403).json({ error: 'Only the project owner can delete this project' });
        return;
      }

      const storage = getStorageDriver(project.storageDriver);
      await storage.deleteDirectory(project.id, '');

      await prisma.project.delete({ where: { id } });

      res.json({ success: true, message: 'Project deleted successfully' });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to delete project', details: err.message });
    }
  }

  static async exportZip(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const project = await prisma.project.findUnique({
        where: { id },
        include: { files: { where: { isFolder: false } } },
      });

      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      const archive = archiver('zip', { zlib: { level: 9 } });
      res.attachment(`${project.slug || 'forgecode-project'}.zip`);
      archive.pipe(res);

      const storage = getStorageDriver(project.storageDriver);
      for (const f of project.files) {
        try {
          const content = await storage.readFile(project.id, f.path);
          archive.append(content, { name: f.path });
        } catch {
          // ignore missing
        }
      }

      await archive.finalize();
    } catch (err: any) {
      res.status(500).json({ error: 'Export failed', details: err.message });
    }
  }
}

function getTemplateFiles(template: string, projectName: string): Record<string, string> {
  if (template === 'react' || template === 'vite') {
    return {
      'package.json': JSON.stringify(
        {
          name: projectName.toLowerCase(),
          private: true,
          version: '0.0.0',
          type: 'module',
          scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
          dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' },
          devDependencies: { '@vitejs/plugin-react': '^4.3.4', vite: '^6.1.0' },
        },
        null,
        2
      ),
      'src/App.tsx': `export default function App() {\n  return (\n    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>\n      <h1>Welcome to ${projectName}</h1>\n      <p>Built with ForgeCode AI</p>\n    </div>\n  );\n}\n`,
      'src/main.tsx': `import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from './App';\n\nReactDOM.createRoot(document.getElementById('root')!).render(<App />);\n`,
      'index.html': `<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <title>${projectName}</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.tsx"></script>\n  </body>\n</html>\n`,
    };
  }

  // Default Node.js / Express template
  return {
    'package.json': JSON.stringify(
      {
        name: projectName.toLowerCase(),
        version: '1.0.0',
        type: 'module',
        main: 'src/index.js',
        scripts: { start: 'node src/index.js', test: 'echo "All tests passed!" && exit 0' },
        dependencies: { express: '^4.21.2' },
      },
      null,
      2
    ),
    'src/index.js': `import express from 'express';\n\nconst app = express();\nconst port = process.env.PORT || 4000;\n\napp.get('/', (req, res) => {\n  res.json({ message: 'Hello from ${projectName} powered by ForgeCode AI!' });\n});\n\napp.listen(port, () => {\n  console.log(\`Server listening on http://localhost:\${port}\`);\n});\n`,
    'README.md': `# ${projectName}\n\nBuilt and maintained using **ForgeCode AI**.\n`,
  };
}
