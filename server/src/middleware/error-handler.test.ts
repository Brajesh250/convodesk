import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { conflict } from '../errors/app-error.js';
import { errorHandler } from './error-handler.js';
import { validate } from './validate.js';

/** A tiny app with routes that fail in each way the handler must understand. */
function appWithFailingRoutes() {
  const app = express();
  app.use(express.json());
  app.get('/app-error', () => {
    throw conflict('Slot already booked');
  });
  app.post('/validated', validate({ body: z.object({ email: z.email() }) }), (req, res) => {
    res.json(req.valid.body);
  });
  app.get('/bug', () => {
    throw new Error('secret internal detail');
  });
  app.get('/async-bug', async () => {
    // Express 5 forwards rejected promises to the error handler automatically.
    await Promise.reject(new Error('async failure'));
  });
  app.use(errorHandler);
  return app;
}

describe('errorHandler', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('maps AppError to its status and code', async () => {
    const res = await request(appWithFailingRoutes()).get('/app-error');
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'CONFLICT', message: 'Slot already booked' });
  });

  it('maps zod validation failures to 400 with details', async () => {
    const res = await request(appWithFailingRoutes()).post('/validated').send({ email: 'nope' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(res.body.error.details)).toBe(true);
  });

  it('passes validated, typed input through to the handler', async () => {
    const res = await request(appWithFailingRoutes()).post('/validated').send({ email: 'a@b.co', extra: 1 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ email: 'a@b.co' }); // unknown keys stripped
  });

  it('hides internal error messages in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const res = await request(appWithFailingRoutes()).get('/bug');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(res.body.error.message).not.toContain('secret');
  });

  it('catches rejected promises from async handlers', async () => {
    const res = await request(appWithFailingRoutes()).get('/async-bug');
    expect(res.status).toBe(500);
  });
});
