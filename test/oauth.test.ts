import { describe, it, expect } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import http from 'http';
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

  it('GET /.well-known/oauth-authorization-server returns RFC 8414 metadata with DCR, CIMD, PKCE & ISS', async () => {
    const res = await request(app).get('/.well-known/oauth-authorization-server');
    expect(res.status).toBe(200);
    expect(res.body.authorization_endpoint).toContain('/oauth/authorize');
    expect(res.body.token_endpoint).toContain('/oauth/token');
    expect(res.body.registration_endpoint).toContain('/oauth/register');
    expect(res.body.client_id_metadata_document_supported).toBe(true);
    expect(res.body.authorization_response_iss_parameter_supported).toBe(true);
    expect(res.body.code_challenge_methods_supported).toContain('S256');
    expect(res.body.scopes_supported).toContain('openid');
    expect(res.body.scopes_supported).toContain('email');
  });

  it('POST /oauth/register supports RFC 7591 Dynamic Client Registration', async () => {
    const res = await request(app)
      .post('/oauth/register')
      .send({
        client_name: 'ChatGPT Custom MCP Client',
        redirect_uris: ['https://chatgpt.com/connector_platform_oauth_redirect'],
      });

    expect(res.status).toBe(201);
    expect(res.body.client_id).toMatch(/^forgecode_client_/);
    expect(res.body.client_name).toBe('ChatGPT Custom MCP Client');
    expect(res.body.token_endpoint_auth_method).toBe('none');
  });

  it('GET /mcp?auth=required returns 401 with WWW-Authenticate resource_metadata challenge', async () => {
    const res = await request(app).get('/mcp?auth=required');
    expect(res.status).toBe(401);
    const authHeader = res.headers['www-authenticate'];
    expect(authHeader).toBeDefined();
    expect(authHeader).toContain('Bearer resource_metadata="');
    expect(authHeader).toContain('/.well-known/oauth-protected-resource"');
  });

  it('GET /mcp without bearer token connects anonymously in No-Auth mode', async () => {
    const testServer = http.createServer(app);
    await new Promise<void>((resolve) => testServer.listen(0, resolve));
    const port = (testServer.address() as any).port;

    await new Promise<void>((resolve) => {
      const clientReq = http.get(`http://127.0.0.1:${port}/mcp`, (res: http.IncomingMessage) => {
        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toContain('text/event-stream');
        clientReq.destroy();
        testServer.close(() => resolve());
      });
      clientReq.on('error', () => {
        testServer.close(() => resolve());
      });
    });
  });

  it('GET /oauth/authorize renders interactive consent UI with default forgecode-ai-client', async () => {
    const res = await request(app)
      .get('/oauth/authorize')
      .query({
        client_id: 'forgecode-ai-client',
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
    expect(res.text).toContain('forgecode-ai-client');
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
        client_id: 'forgecode-ai-client',
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
        client_id: 'forgecode-ai-client',
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

  it('POST /mcp responds to Streamable HTTP tools/list action discovery with 200 OK and tool inventory', async () => {
    const res = await request(app)
      .post('/mcp')
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json, text/event-stream')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      });

    expect(res.status).toBe(200);
    expect(res.body.result).toBeDefined();
    expect(Array.isArray(res.body.result.tools)).toBe(true);
    const toolNames = res.body.result.tools.map((t: any) => t.name);
    expect(toolNames).toContain('list_projects');
    expect(toolNames).toContain('read_file');
    expect(toolNames).toContain('propose_patch');
  });
});
