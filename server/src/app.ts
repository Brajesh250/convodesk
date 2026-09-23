import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { httpLogger } from './middleware/http-logger.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { healthRouter } from './modules/health/health.routes.js';
import { invitesRouter } from './modules/invites/invites.routes.js';
import { tenantRouter } from './modules/tenants/tenant.routes.js';
import { usersRouter } from './modules/users/users.routes.js';

export interface AppOptions {
  corsOrigins: string[];
}

/**
 * Builds the Express app WITHOUT starting a server.
 * Keeping `createApp` separate from `listen()` lets supertest drive the app in tests
 * and lets server.ts attach Socket.IO to the same HTTP server later.
 *
 * Middleware order matters and reads top to bottom:
 *   security headers → CORS → body parsing → request logging → routes → 404 → errors
 */
export function createApp({ corsOrigins }: AppOptions): Express {
  const app = express();

  // Render (and Vercel's proxy) sit in front of us; trust the first hop so req.ip and
  // `secure` cookies reflect the real client/HTTPS rather than the proxy.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(
    cors({
      // Explicit allowlist — never `*` — because we send credentials (the refresh cookie).
      origin: (origin, callback) => {
        // Requests without an Origin (curl, server-to-server webhooks, health checks) are allowed;
        // CORS only restricts browsers anyway.
        if (!origin || corsOrigins.includes(origin)) return callback(null, true);
        return callback(null, false);
      },
      credentials: true,
      exposedHeaders: ['x-request-id'],
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(httpLogger);

  app.use(healthRouter);
  app.use('/api/auth', authRouter());
  app.use('/api/tenant', tenantRouter());
  app.use('/api/users', usersRouter());
  app.use('/api/invites', invitesRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
