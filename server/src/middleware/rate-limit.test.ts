import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler } from './error-handler.js';
import { createRateLimiter } from './rate-limit.js';

describe('createRateLimiter', () => {
  it('returns 429 RATE_LIMITED with RateLimit headers once the budget is spent', async () => {
    const app = express();
    app.post('/login', createRateLimiter({ windowMs: 60_000, limit: 2, enabled: true }), (_req, res) => {
      res.json({ ok: true });
    });
    app.use(errorHandler);

    await request(app).post('/login').expect(200);
    const second = await request(app).post('/login').expect(200);
    expect(second.headers['ratelimit']).toBeDefined();

    const third = await request(app).post('/login');
    expect(third.status).toBe(429);
    expect(third.body.error.code).toBe('RATE_LIMITED');
  });

  it('is a no-op when disabled', async () => {
    const app = express();
    app.get('/x', createRateLimiter({ windowMs: 60_000, limit: 1, enabled: false }), (_req, res) => {
      res.json({ ok: true });
    });
    await request(app).get('/x').expect(200);
    await request(app).get('/x').expect(200);
  });
});
