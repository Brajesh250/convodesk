import { rateLimit, type Options } from 'express-rate-limit';
import type { RequestHandler } from 'express';
import { env } from '../config/env.js';
import { tooManyRequests } from '../errors/app-error.js';

/**
 * In-memory rate limiting, keyed by client IP (req.ip is correct because of `trust proxy`).
 * In-memory is fine for ONE Render instance; with several instances we'd need a shared store
 * (e.g. Redis) — a documented scaling limit, not something the free tier needs.
 */
export function createRateLimiter(options: {
  windowMs: number;
  limit: number;
  /** Force on/off (tests); defaults to RATE_LIMIT_ENABLED. */
  enabled?: boolean;
  keyGenerator?: Options['keyGenerator'];
}): RequestHandler {
  const enabled = options.enabled ?? env().RATE_LIMIT_ENABLED;
  if (!enabled) return (_req, _res, next) => next();

  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    standardHeaders: 'draft-8', // RateLimit / RateLimit-Policy headers so clients can back off
    legacyHeaders: false,
    ...(options.keyGenerator ? { keyGenerator: options.keyGenerator } : {}),
    // Route through our error handler so the body has the standard { error: { code… } } shape.
    handler: (_req, _res, next) => next(tooManyRequests()),
  });
}

const FIFTEEN_MINUTES = 15 * 60 * 1000;

/** Login/signup/accept-invite: slows password guessing and signup spam. */
export const authLimiter = () => createRateLimiter({ windowMs: FIFTEEN_MINUTES, limit: 20 });
/** Refresh is called on every page load and every 15 min, so it gets a looser budget. */
export const refreshLimiter = () => createRateLimiter({ windowMs: FIFTEEN_MINUTES, limit: 120 });
