import bcrypt from 'bcryptjs';
import { prisma } from '../server/db/prisma.js';

async function seed() {
  const email = 'admin@forgecode.ai';
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log('User already exists: ' + email);
    return;
  }
  const passwordHash = await bcrypt.hash('ForgeCode2026!', 12);
  const user = await prisma.user.create({
    data: {
      email,
      name: 'Abhinav',
      passwordHash,
      role: 'admin',
    },
  });

  const project = await prisma.project.create({
    data: {
      ownerId: user.id,
      name: 'Default Workspace',
      slug: 'default-workspace',
      description: 'Production starter project on Voroa',
      storageDriver: 'postgres',
      storagePrefix: `user_${user.id}/default`,
    },
  });

  await prisma.projectFile.create({
    data: {
      projectId: project.id,
      path: 'src/index.ts',
      isFolder: false,
      version: 1,
      sha256: 'initial_hash',
      sizeBytes: 120,
    },
  });

  await prisma.fileContent.create({
    data: {
      projectId: project.id,
      filePath: 'src/index.ts',
      sha256: 'initial_hash',
      content: '// Welcome to ForgeCode AI on Voroa!\nconsole.log("ForgeCode AI is running live!");\n',
    },
  });

  console.log('User created successfully: ' + user.email);
}

seed()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
