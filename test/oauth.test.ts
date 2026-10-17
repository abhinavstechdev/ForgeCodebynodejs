import { describe, it, expect } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import app from '../server/index.js';

describe('OAuth 2.1 & OpenAI App Integration Tests', () => {
  it('GET /.well-known/openai-apps-challenge returns text/plain challenge string', async () => {
    const res = await request(app).get('/.well-known/openai-apps-challenge');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text.length).toBeGreaterThan(5);
  });

  it('GET /.well-known/oauth-protected-resource returns RFC 9728 metadata', async () => {
    const res = await request(app).get('/.well-known/oauth-protected-resource');
    expect(res.status).toBe(200);
    expect(res.body.resource).toContain('/mcp');
    expect(Array.isArray(res.body.authorization_servers)).toBe(true);
    expect(res.body.scopes_supported).toContain('files:read');
    expect(res.body.scopes_supported).toContain('files:write');
  });

  it('GET /.well-known/oauth-authorization-server returns RFC 8414 metadata with PKCE & ISS', async () => {
    const res = await request(app).get('/.well-known/oauth-authorization-server');
    expect(res.status).toBe(200);
    expect(res.body.authorization_endpoint).toContain('/oauth/authorize');
    expect(res.body.token_endpoint).toContain('/oauth/token');
    expect(res.body.authorization_response_iss_parameter_supported).toBe(true);
    expect(res.body.code_challenge_methods_supported).toContain('S256');
    expect(res.body.scopes_supported).toContain('openid');
    expect(res.body.scopes_supported).toContain('email');
  });

  it('GET /mcp without bearer token returns 401 with WWW-Authenticate resource_metadata challenge', async () => {
    const res = await request(app).get('/mcp');
    expect(res.status).toBe(401);
    const authHeader = res.headers['www-authenticate'];
    expect(authHeader).toBeDefined();
    expect(authHeader).toContain('Bearer resource_metadata="');
    expect(authHeader).toContain('/.well-known/oauth-protected-resource"');
  });

  it('GET /oauth/authorize renders interactive consent UI', async () => {
    const res = await request(app)
      .get('/oauth/authorize')
      .query({
        client_id: 'chatgpt-test-client',
        redirect_uri: 'https://chatgpt.com/connector_platform_oauth_redirect',
        response_type: 'code',
        state: 'xyz123',
        scope: 'files:read files:write',
        code_challenge: 'test-challenge',
        code_challenge_method: 'S256',
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('ForgeCode AI');
    expect(res.text).toContain('chatgpt-test-client');
    expect(res.text).toContain('Authorize Access');
  });

  it('completes end-to-end OAuth 2.1 authorization code exchange with PKCE verification', async () => {
    // 1. Generate PKCE code verifier and challenge
    const codeVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    const redirectUri = 'https://chatgpt.com/connector_platform_oauth_redirect';
    const state = 'state_abc_456';

    // 2. Submit consent form with credentials (using admin test user)
    const authRes = await request(app)
      .post('/oauth/authorize')
      .send({
        client_id: 'chatgpt-client',
        redirect_uri: redirectUri,
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        scope: 'files:read files:write terminal:execute',
        email: 'admin@forgecode.ai',
        password: 'ForgeCode2026!',
      });

    expect(authRes.status).toBe(302);
    const redirectUrl = new URL(authRes.headers.location);
    expect(redirectUrl.origin + redirectUrl.pathname).toBe(redirectUri);

    const code = redirectUrl.searchParams.get('code');
    expect(code).toBeDefined();
    expect(redirectUrl.searchParams.get('state')).toBe(state);
    expect(redirectUrl.searchParams.get('iss')).toBeDefined();

    // 3. Exchange code for access token with PKCE code_verifier
    const tokenRes = await request(app)
      .post('/oauth/token')
      .send({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: 'chatgpt-client',
        code_verifier: codeVerifier,
      });

    expect(tokenRes.status).toBe(200);
    expect(tokenRes.body.access_token).toMatch(/^mcp_live_/);
    expect(tokenRes.body.token_type).toBe('Bearer');
    expect(tokenRes.body.id_token).toBeDefined();
    expect(tokenRes.body.scope).toContain('files:read');

    // 4. Verify UserInfo endpoint with the minted access token
    const userInfoRes = await request(app)
      .get('/oauth/userinfo')
      .set('Authorization', `Bearer ${tokenRes.body.access_token}`);

    expect(userInfoRes.status).toBe(200);
    expect(userInfoRes.body.email).toBe('admin@forgecode.ai');
    expect(userInfoRes.body.email_verified).toBe(true);
  });
});
