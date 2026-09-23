import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { pinoHttp } from 'pino-http';
import { logger } from '../observability/logger.js';

const SAFE_REQUEST_ID = /^[\w-]{8,64}$/;

/**
 * Assigns every request an id (re-using a well-formed incoming `x-request-id`, e.g. from
 * Render's proxy or our own client) and logs one line per request with its latency.
 * `req.id` is later echoed in error bodies so a user-reported error can be found in logs.
 */
export const httpLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const incoming = req.headers['x-request-id'];
    const id = typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
    res.setHeader('x-request-id', id);
    return id;
  },
  // Health checks from Render/UptimeRobot every few minutes would drown real logs.
  autoLogging: { ignore: (req: IncomingMessage) => req.url === '/health' },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  // Keep request logs small: method, url, id — not every header.
  serializers: {
    req: (req: { id: string; method: string; url: string }) => ({
      id: req.id,
      method: req.method,
      url: req.url,
    }),
    res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
  },
});
