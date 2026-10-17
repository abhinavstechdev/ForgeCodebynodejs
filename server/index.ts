import express from 'express';
import http from 'http';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { WebSocketServer } from 'ws';

import apiRouter from './routes/api.js';
import { handleMcpSse, handleMcpMessage } from './mcp/mcpServer.js';
import { OAuthController } from './controllers/oauthController.js';
import { setupTerminalWebSocket } from './services/terminalService.js';
import { prisma, checkDatabaseConnection } from './db/prisma.js';

dotenv.config();

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const HOST = process.env.HOST || '0.0.0.0';

// -------------------------------------------------------------
// Security Middleware & HTTP Headers
// -------------------------------------------------------------
app.use(
  helmet({
    contentSecurityPolicy: false, // disabled for Monaco Editor web workers and inline styles
    crossOriginEmbedderPolicy: false,
  })
);

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(cookieParser());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Rate limiting on sensitive auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many login attempts, please try again later' },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// -------------------------------------------------------------
// OpenAI & ChatGPT OAuth 2.1 & Verification Endpoints
// -------------------------------------------------------------
app.get('/.well-known/openai-apps-challenge', OAuthController.getOpenAiChallenge);
app.get('/.well-known/oauth-protected-resource', OAuthController.getProtectedResourceMetadata);
app.get('/.well-known/oauth-authorization-server', OAuthController.getAuthorizationServerMetadata);
app.get('/.well-known/openid-configuration', OAuthController.getAuthorizationServerMetadata);

app.get('/oauth/authorize', OAuthController.renderAuthorizePage);
app.post('/oauth/authorize', OAuthController.handleAuthorizeSubmit);
app.post('/oauth/token', OAuthController.exchangeToken);
app.get('/oauth/userinfo', OAuthController.getUserInfo);
app.get('/oauth/jwks.json', OAuthController.getJwks);

// -------------------------------------------------------------
// Healthcheck Route (Voroa Web Service & Deployment Target)
// -------------------------------------------------------------
app.get('/healthz', async (req, res) => {
  const dbHealth = await checkDatabaseConnection();
  if (dbHealth.ok) {
    res.json({
      status: 'healthy',
      database: 'connected',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '1.0.0',
    });
  } else {
    res.status(503).json({
      status: 'unhealthy',
      database: 'unreachable',
      error: dbHealth.error,
      timestamp: new Date().toISOString(),
    });
  }
});

// -------------------------------------------------------------
// Official Model Context Protocol (MCP) Server Endpoint
// -------------------------------------------------------------
app.get('/mcp', handleMcpSse);
app.post('/mcp/messages', handleMcpMessage);

// -------------------------------------------------------------
// REST API Routes
// -------------------------------------------------------------
app.use('/api', apiRouter);

// -------------------------------------------------------------
// Production Static Client Serving
// -------------------------------------------------------------
const clientDistPath = path.resolve(process.cwd(), 'dist/client');
app.use(express.static(clientDistPath));

app.get('*', (req, res, next) => {
  if (
    req.path.startsWith('/api') ||
    req.path.startsWith('/mcp') ||
    req.path.startsWith('/healthz') ||
    req.path.startsWith('/oauth') ||
    req.path.startsWith('/.well-known')
  ) {
    return next();
  }
  res.sendFile(path.join(clientDistPath, 'index.html'), err => {
    if (err) {
      // In dev mode when client is served by Vite, show helpful fallback
      res.send(`
        <!DOCTYPE html>
        <html>
          <head><title>ForgeCode AI Backend</title></head>
          <body style="background:#18181b;color:#d4d4d8;font-family:sans-serif;padding:2rem;">
            <h2>ForgeCode AI Backend Server is Running</h2>
            <p>API Endpoint: <a style="color:#3b82f6" href="/healthz">/healthz</a></p>
            <p>MCP Server: <code>/mcp</code></p>
            <p>Vite Dev Client runs on <a style="color:#3b82f6" href="http://localhost:5173">http://localhost:5173</a></p>
          </body>
        </html>
      `);
    }
  });
});

// -------------------------------------------------------------
// WebSocket Terminal Server
// -------------------------------------------------------------
const wss = new WebSocketServer({ server, path: '/ws/terminal' });
setupTerminalWebSocket(wss);

// -------------------------------------------------------------
// Start Server & Graceful Shutdown
// -------------------------------------------------------------
if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, HOST, () => {
    console.log(`=======================================================`);
    console.log(`🚀 ForgeCode AI running on http://${HOST}:${PORT}`);
    console.log(`🩺 Health check route: http://${HOST}:${PORT}/healthz`);
    console.log(`🤖 MCP Server route:   http://${HOST}:${PORT}/mcp`);
    console.log(`=======================================================`);
  });
}

const gracefulShutdown = async (signal: string) => {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  server.close(async () => {
    console.log('HTTP and WebSocket servers closed.');
    await prisma.$disconnect();
    console.log('Database connection pool released.');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('Forced shutdown after timeout.');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;
