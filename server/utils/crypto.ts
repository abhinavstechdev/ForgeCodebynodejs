import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const DEFAULT_KEY = '9f83a8b2d31c4f5e6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f';

function getMasterKey(): Buffer {
  const secret = process.env.APP_SECRET_KEY || DEFAULT_KEY;
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypt a string using AES-256-GCM
 */
export function encryptSecret(plainText: string): string {
  if (!plainText) return '';
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, getMasterKey(), iv);
  
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  
  // Format: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt a string using AES-256-GCM
 */
export function decryptSecret(encryptedPayload: string): string {
  if (!encryptedPayload) return '';
  try {
    const [ivHex, authTagHex, encryptedText] = encryptedPayload.split(':');
    if (!ivHex || !authTagHex || !encryptedText) return '';

    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      getMasterKey(),
      Buffer.from(ivHex, 'hex')
    );
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('Decryption failed:', err);
    return '';
  }
}

/**
 * Computes SHA-256 hash of string or Buffer
 */
export function computeSha256(content: string | Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Generate cryptographically secure MCP Token
 * Format: mcp_live_<random_hex>
 */
export function generateMcpToken(): { rawToken: string; tokenHash: string; prefix: string } {
  const randomPart = crypto.randomBytes(32).toString('hex');
  const rawToken = `mcp_live_${randomPart}`;
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const prefix = rawToken.slice(0, 16) + '...';
  return { rawToken, tokenHash, prefix };
}

/**
 * Hash any incoming token for database lookup
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
}

/**
 * Mask an API key for safe UI display (e.g. sk-****1234)
 */
export function maskKey(key: string): string {
  if (!key || key.length < 8) return '****';
  return `${key.slice(0, 3)}****${key.slice(-4)}`;
}
