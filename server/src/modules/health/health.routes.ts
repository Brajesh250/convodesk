import { Router } from 'express';
import type { HealthResponse } from '@convodesk/shared';
import { appVersion } from '../../config/env.js';
import { dbState } from '../../db/connect.js';

/**
 * GET /health — public, cheap, no auth.
 * Used by Render's health check and by the UptimeRobot ping that keeps the free
 * instance awake. Returns 503 when the database is down so monitors actually alert.
 */
export const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
  const db = dbState();
  const body: HealthResponse = {
    status: db === 'connected' ? 'ok' : 'degraded',
    uptimeSeconds: Math.round(process.uptime()),
    version: appVersion(),
    db,
    timestamp: new Date().toISOString(),
  };
  res.status(body.status === 'ok' ? 200 : 503).json(body);
});

// UptimeRobot's free plan sends HEAD requests; Express answers HEAD from the GET route automatically.
