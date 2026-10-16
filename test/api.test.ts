import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../server/index.js';
import { sanitizePath, normalizeRelativePath } from '../server/utils/sanitizePath.js';
import { encryptSecret, decryptSecret, computeSha256, generateMcpToken } from '../server/utils/crypto.js';
import { scrubSecrets, scrubEnvFileContent } from '../server/utils/secretScrubber.js';

describe('ForgeCode AI System & Security Test Suite', () => {
  it('GET /healthz returns 200 with database health status', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.database).toBe('connected');
  });

  it('rejects path traversal attacks with Error', () => {
    const projectRoot = 'C:/projects/workspace1';
    
    // Normal safe path
    const safe = sanitizePath(projectRoot, 'src/index.ts');
    expect(safe).toContain('src');

    // Attack attempts
    expect(() => sanitizePath(projectRoot, '../../etc/passwd')).toThrow(/traversal detected/i);
    expect(() => sanitizePath(projectRoot, '..\\..\\windows\\system32')).toThrow(/traversal detected/i);
    expect(() => normalizeRelativePath('../secret.env')).toThrow(/traversal detected/i);
  });

  it('encrypts and decrypts API secrets using AES-256-GCM', () => {
    const originalSecret = 'sk-proj-super-secret-api-key-12345';
    const encrypted = encryptSecret(originalSecret);

    expect(encrypted).not.toBe(originalSecret);
    expect(encrypted).toContain(':'); // iv:tag:data

    const decrypted = decryptSecret(encrypted);
    expect(decrypted).toBe(originalSecret);
  });

  it('scrubs sensitive API keys and tokens from logs and AI prompts', () => {
    const sensitiveLog = 'Request sent with key sk-1234567890abcdef1234567890 to endpoint';
    const scrubbed = scrubSecrets(sensitiveLog);

    expect(scrubbed).not.toContain('sk-1234567890');
    expect(scrubbed).toContain('[REDACTED_SECRET]');
  });

  it('scrubs .env values while preserving variable keys', () => {
    const envFile = `DATABASE_URL=postgresql://user:pass@host:5432/db\nAPI_KEY=secret_1234\nPORT=3000`;
    const scrubbed = scrubEnvFileContent(envFile);

    expect(scrubbed).toContain('DATABASE_URL=[REDACTED_ENV_VALUE]');
    expect(scrubbed).toContain('API_KEY=[REDACTED_ENV_VALUE]');
    expect(scrubbed).not.toContain('pass@host');
  });

  it('generates secure MCP bearer tokens starting with mcp_live_', () => {
    const tokenData = generateMcpToken();

    expect(tokenData.rawToken).toMatch(/^mcp_live_[a-f0-9]{64}$/);
    expect(tokenData.tokenHash).toHaveLength(64);
    expect(tokenData.prefix).toMatch(/^mcp_live_/);
  });

  it('rejects unauthorized requests to protected project routes', async () => {
    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(401);
  });
});
