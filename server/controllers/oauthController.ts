import { Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../db/prisma.js';
import { verifyJwtToken } from '../middleware/auth.js';
import { generateMcpToken, hashToken } from '../utils/crypto.js';

const JWT_SECRET = process.env.APP_SECRET_KEY || 'forgecode_development_secret_key_12345';

interface AuthCodeEntry {
  code: string;
  userId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scopes: string[];
  resource?: string;
  expiresAt: number;
}

// In-memory code store with 5-minute TTL
const authCodeStore = new Map<string, AuthCodeEntry>();

// Clean up expired codes every 60s
setInterval(() => {
  const now = Date.now();
  for (const [code, entry] of authCodeStore.entries()) {
    if (entry.expiresAt < now) {
      authCodeStore.delete(code);
    }
  }
}, 60000);

function getBaseUrl(req: Request): string {
  const forwardedProto = req.get('x-forwarded-proto');
  const protocol = forwardedProto ? forwardedProto.split(',')[0].trim() : req.protocol;
  const host = req.get('host') || 'forgecode-ai.getvoroa.com';
  return `${protocol}://${host}`;
}

export class OAuthController {
  // -------------------------------------------------------------
  // 1. OpenAI App Domain Verification Challenge
  // -------------------------------------------------------------
  static getOpenAiChallenge(req: Request, res: Response): void {
    const challengeToken =
      process.env.OPENAI_APPS_CHALLENGE ||
      'forgecode-ai-openai-verification-challenge-2026';
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(challengeToken);
  }

  // -------------------------------------------------------------
  // 2. RFC 9728 Protected Resource Metadata
  // -------------------------------------------------------------
  static getProtectedResourceMetadata(req: Request, res: Response): void {
    const baseUrl = getBaseUrl(req);
    res.setHeader('Content-Type', 'application/json');
    res.json({
      resource: `${baseUrl}/mcp`,
      authorization_servers: [baseUrl],
      scopes_supported: [
        'files:read',
        'files:write',
        'terminal:execute',
        'git:commit',
        'ai:propose',
        'ai:apply',
      ],
      bearer_methods_supported: ['header'],
      resource_documentation: `${baseUrl}/docs/mcp`,
    });
  }

  // -------------------------------------------------------------
  // 3. RFC 8414 & OIDC Authorization Server Metadata
  // -------------------------------------------------------------
  static getAuthorizationServerMetadata(req: Request, res: Response): void {
    const baseUrl = getBaseUrl(req);
    res.setHeader('Content-Type', 'application/json');
    res.json({
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/oauth/authorize`,
      token_endpoint: `${baseUrl}/oauth/token`,
      userinfo_endpoint: `${baseUrl}/oauth/userinfo`,
      registration_endpoint: `${baseUrl}/oauth/register`,
      jwks_uri: `${baseUrl}/oauth/jwks.json`,
      client_id_metadata_document_supported: true,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code'],
      token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
      authorization_response_iss_parameter_supported: true,
      code_challenge_methods_supported: ['S256'],
      scopes_supported: [
        'openid',
        'email',
        'profile',
        'files:read',
        'files:write',
        'terminal:execute',
        'git:commit',
        'ai:propose',
        'ai:apply',
      ],
    });
  }

  // -------------------------------------------------------------
  // 3b. RFC 7591 Dynamic Client Registration (/oauth/register)
  // -------------------------------------------------------------
  static registerClient(req: Request, res: Response): void {
    const {
      client_name = 'ChatGPT Client',
      redirect_uris = ['https://chatgpt.com/connector_platform_oauth_redirect'],
      grant_types = ['authorization_code'],
      response_types = ['code'],
      token_endpoint_auth_method = 'none',
    } = req.body || {};

    const clientId = `forgecode_client_${crypto.randomBytes(12).toString('hex')}`;
    const issuedAt = Math.floor(Date.now() / 1000);

    res.status(201).json({
      client_id: clientId,
      client_id_issued_at: issuedAt,
      client_name,
      redirect_uris: Array.isArray(redirect_uris) ? redirect_uris : [redirect_uris],
      grant_types,
      response_types,
      token_endpoint_auth_method,
    });
  }

  // -------------------------------------------------------------
  // 4. Interactive Consent & Authorization (/oauth/authorize)
  // -------------------------------------------------------------
  static async renderAuthorizePage(req: Request, res: Response): Promise<void> {
    const {
      client_id,
      redirect_uri,
      response_type,
      state,
      code_challenge,
      code_challenge_method = 'S256',
      scope,
      resource,
    } = req.query as Record<string, string>;

    if (!redirect_uri) {
      res.status(400).send('Missing redirect_uri query parameter');
      return;
    }

    if (response_type !== 'code') {
      res.status(400).send('Unsupported response_type. Only "code" is supported.');
      return;
    }

    // Determine if the user is already authenticated via cookie or authorization header
    let authenticatedUser = null;
    const cookieToken = req.cookies?.forgecode_token;
    if (cookieToken) {
      authenticatedUser = verifyJwtToken(cookieToken);
    }

    const requestedScopes = scope ? scope.split(' ') : ['files:read', 'files:write'];
    const clientName = client_id || 'ChatGPT / Codex';

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Authorize ${clientName} - ForgeCode AI</title>
  <style>
    :root {
      --bg: #090d16;
      --card-bg: #111827;
      --border: #1f2937;
      --accent: #3b82f6;
      --accent-hover: #2563eb;
      --text: #f9fafb;
      --text-muted: #9ca3af;
      --success: #10b981;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      max-width: 480px;
      width: 100%;
      padding: 2rem;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.4);
    }
    .header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 1.5rem;
      border-bottom: 1px solid var(--border);
      padding-bottom: 1.25rem;
    }
    .logo-badge {
      width: 40px;
      height: 40px;
      background: linear-gradient(135deg, #3b82f6, #8b5cf6);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 1.2rem;
      color: #fff;
    }
    .title { font-size: 1.25rem; font-weight: 600; }
    .subtitle { font-size: 0.875rem; color: var(--text-muted); margin-top: 2px; }
    .scopes-list {
      background: #1e293b;
      border-radius: 8px;
      padding: 1rem;
      margin: 1.25rem 0;
      font-size: 0.875rem;
    }
    .scope-item {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 0.5rem;
    }
    .scope-item:last-child { margin-bottom: 0; }
    .check-icon { color: var(--success); font-weight: bold; }
    .form-group {
      margin-bottom: 1rem;
    }
    label {
      display: block;
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--text-muted);
      margin-bottom: 0.25rem;
    }
    input[type="email"], input[type="password"] {
      width: 100%;
      padding: 0.625rem 0.75rem;
      background: #0b0f19;
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--text);
      font-size: 0.875rem;
    }
    input[type="email"]:focus, input[type="password"]:focus {
      outline: none;
      border-color: var(--accent);
    }
    .actions {
      display: flex;
      gap: 12px;
      margin-top: 1.5rem;
    }
    .btn {
      flex: 1;
      padding: 0.75rem 1rem;
      border-radius: 6px;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      border: none;
      text-align: center;
      text-decoration: none;
      transition: background-color 0.15s ease;
    }
    .btn-primary {
      background-color: var(--accent);
      color: white;
    }
    .btn-primary:hover {
      background-color: var(--accent-hover);
    }
    .btn-secondary {
      background-color: #374151;
      color: var(--text);
    }
    .btn-secondary:hover {
      background-color: #4b5563;
    }
    .user-pill {
      background: #1e293b;
      padding: 0.5rem 0.75rem;
      border-radius: 6px;
      font-size: 0.875rem;
      display: inline-block;
      margin-bottom: 1rem;
    }
    .footer-note {
      font-size: 0.75rem;
      color: var(--text-muted);
      text-align: center;
      margin-top: 1rem;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="logo-badge">⚡</div>
      <div>
        <div class="title">ForgeCode AI</div>
        <div class="subtitle">OAuth 2.1 Authorization</div>
      </div>
    </div>

    <p style="font-size: 0.95rem; margin-bottom: 0.75rem;">
      <strong>${clientName}</strong> is requesting access to your ForgeCode AI projects.
    </p>

    <div class="scopes-list">
      <div style="font-weight: 600; margin-bottom: 0.5rem; color: #e2e8f0;">Requested Permissions:</div>
      ${requestedScopes
        .map(
          s => `<div class="scope-item"><span class="check-icon">✓</span> <code>${s}</code></div>`
        )
        .join('')}
    </div>

    <form method="POST" action="/oauth/authorize">
      <input type="hidden" name="client_id" value="${client_id || ''}" />
      <input type="hidden" name="redirect_uri" value="${redirect_uri}" />
      <input type="hidden" name="state" value="${state || ''}" />
      <input type="hidden" name="code_challenge" value="${code_challenge || ''}" />
      <input type="hidden" name="code_challenge_method" value="${code_challenge_method}" />
      <input type="hidden" name="scope" value="${scope || ''}" />
      <input type="hidden" name="resource" value="${resource || ''}" />

      ${
        authenticatedUser
          ? `
        <div class="user-pill">
          Logged in as: <strong>${authenticatedUser.email}</strong>
        </div>
        <input type="hidden" name="existing_user_id" value="${authenticatedUser.id}" />
      `
          : `
        <div class="form-group">
          <label>ForgeCode Account Email</label>
          <input type="email" name="email" placeholder="admin@forgecode.ai" required />
        </div>
        <div class="form-group">
          <label>Password</label>
          <input type="password" name="password" placeholder="••••••••" required />
        </div>
      `
      }

      <div class="actions">
        <a href="${redirect_uri}?error=access_denied&state=${encodeURIComponent(state || '')}" class="btn btn-secondary">Deny</a>
        <button type="submit" class="btn btn-primary">Authorize Access</button>
      </div>
    </form>

    <div class="footer-note">
      This connection uses OAuth 2.1 PKCE (RFC 9728 & RFC 8414) with end-to-end security.
    </div>
  </div>
</body>
</html>
    `;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }

  // -------------------------------------------------------------
  // 5. Handle Consent POST (/oauth/authorize)
  // -------------------------------------------------------------
  static async handleAuthorizeSubmit(req: Request, res: Response): Promise<void> {
    const {
      client_id,
      redirect_uri,
      state,
      code_challenge,
      code_challenge_method = 'S256',
      scope,
      resource,
      existing_user_id,
      email,
      password,
    } = req.body;

    if (!redirect_uri) {
      res.status(400).send('Missing redirect_uri');
      return;
    }

    let targetUserId = existing_user_id;

    if (!targetUserId) {
      if (!email || !password) {
        res.status(400).send('Email and password required to authorize');
        return;
      }

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        res.status(401).send('Invalid credentials');
        return;
      }

      const match = await bcrypt.compare(password, user.passwordHash);
      if (!match) {
        res.status(401).send('Invalid credentials');
        return;
      }

      targetUserId = user.id;
    }

    // Generate cryptographic authorization code
    const code = crypto.randomBytes(32).toString('hex');
    const scopes = scope ? scope.split(' ') : ['files:read', 'files:write'];
    const effectiveClientId = client_id || 'forgecode-ai-client';

    authCodeStore.set(code, {
      code,
      userId: targetUserId,
      clientId: effectiveClientId,
      redirectUri: redirect_uri,
      codeChallenge: code_challenge || '',
      codeChallengeMethod: code_challenge_method,
      scopes,
      resource,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 min TTL
    });

    const baseUrl = getBaseUrl(req);
    const redirectUrl = new URL(redirect_uri);
    redirectUrl.searchParams.set('code', code);
    if (state) {
      redirectUrl.searchParams.set('state', state);
    }
    // Mandated by RFC 9207 & MCP spec when authorization_response_iss_parameter_supported is true
    redirectUrl.searchParams.set('iss', baseUrl);

    res.redirect(redirectUrl.toString());
  }

  // -------------------------------------------------------------
  // 6. Token Exchange (/oauth/token)
  // -------------------------------------------------------------
  static async exchangeToken(req: Request, res: Response): Promise<void> {
    const {
      grant_type,
      code,
      redirect_uri,
      client_id,
      code_verifier,
      resource,
    } = req.body;

    if (grant_type !== 'authorization_code') {
      res.status(400).json({ error: 'unsupported_grant_type', error_description: 'Only authorization_code is supported' });
      return;
    }

    if (!code) {
      res.status(400).json({ error: 'invalid_request', error_description: 'Missing code parameter' });
      return;
    }

    const entry = authCodeStore.get(code);
    if (!entry) {
      res.status(400).json({ error: 'invalid_grant', error_description: 'Code is invalid or expired' });
      return;
    }

    // Consume code immediately (single use)
    authCodeStore.delete(code);

    if (Date.now() > entry.expiresAt) {
      res.status(400).json({ error: 'invalid_grant', error_description: 'Authorization code has expired' });
      return;
    }

    // PKCE verification (RFC 7636)
    if (entry.codeChallenge) {
      if (!code_verifier) {
        res.status(400).json({ error: 'invalid_grant', error_description: 'Missing code_verifier for PKCE validation' });
        return;
      }

      const calculatedChallenge = crypto
        .createHash('sha256')
        .update(code_verifier)
        .digest('base64url');

      if (calculatedChallenge !== entry.codeChallenge) {
        res.status(400).json({ error: 'invalid_grant', error_description: 'PKCE challenge verification failed' });
        return;
      }
    }

    const user = await prisma.user.findUnique({ where: { id: entry.userId } });
    if (!user) {
      res.status(400).json({ error: 'invalid_grant', error_description: 'User not found' });
      return;
    }

    // Mint genuine MCP live bearer token
    const { rawToken, tokenHash } = generateMcpToken();

    await prisma.mcpToken.create({
      data: {
        tokenHash,
        name: `ChatGPT OAuth Token (${new Date().toISOString().split('T')[0]})`,
        userId: user.id,
        scopes: entry.scopes,
      },
    });

    const baseUrl = getBaseUrl(req);

    // Generate OIDC compliant ID Token
    const idToken = jwt.sign(
      {
        iss: baseUrl,
        sub: user.id,
        aud: client_id || 'chatgpt',
        email: user.email,
        email_verified: true,
        name: user.name || user.email.split('@')[0],
      },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    res.json({
      access_token: rawToken,
      token_type: 'Bearer',
      expires_in: 30 * 24 * 3600, // 30 days
      scope: entry.scopes.join(' '),
      id_token: idToken,
    });
  }

  // -------------------------------------------------------------
  // 7. OIDC UserInfo Endpoint (/oauth/userinfo)
  // -------------------------------------------------------------
  static async getUserInfo(req: Request, res: Response): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'unauthorized', error_description: 'Missing Bearer token' });
      return;
    }

    const token = authHeader.substring(7).trim();

    // Check if token is an MCP token
    if (token.startsWith('mcp_live_')) {
      const tokenHash = hashToken(token);
      const mcpRecord = await prisma.mcpToken.findUnique({
        where: { tokenHash },
        include: { user: true },
      });

      if (!mcpRecord || (mcpRecord.expiresAt && mcpRecord.expiresAt < new Date())) {
        res.status(401).json({ error: 'invalid_token' });
        return;
      }

      res.json({
        sub: mcpRecord.user.id,
        email: mcpRecord.user.email,
        email_verified: true,
        name: mcpRecord.user.name || mcpRecord.user.email.split('@')[0],
      });
      return;
    }

    // Try JWT verification
    const user = verifyJwtToken(token);
    if (!user) {
      res.status(401).json({ error: 'invalid_token' });
      return;
    }

    res.json({
      sub: user.id,
      email: user.email,
      email_verified: true,
      name: user.name || user.email.split('@')[0],
    });
  }

  // -------------------------------------------------------------
  // 8. JWKS Endpoint (/oauth/jwks.json)
  // -------------------------------------------------------------
  static getJwks(req: Request, res: Response): void {
    res.json({ keys: [] });
  }
}
