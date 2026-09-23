import request from 'supertest';
import type { Express } from 'express';
import { beforeAll, describe, expect, it } from 'vitest';
import { apiErrorSchema } from '@convodesk/shared';
import { TEST_ORIGIN, buildTestApp } from './test/helpers.js';

describe('app wiring', () => {
  // Built in beforeAll (not at collection time): createApp reads config that test setup provides.
  let app: Express;
  beforeAll(() => {
    app = buildTestApp();
  });

  it('returns a structured 404 with a request id for unknown routes', async () => {
    const res = await request(app).get('/api/does-not-exist');

    expect(res.status).toBe(404);
    const body = apiErrorSchema.parse(res.body);
    expect(body.error.code).toBe('ROUTE_NOT_FOUND');
    expect(body.error.requestId).toBe(res.headers['x-request-id']);
  });

  it('re-uses a well-formed incoming x-request-id and replaces a malicious one', async () => {
    const good = await request(app).get('/health').set('x-request-id', 'abc-12345-xyz');
    expect(good.headers['x-request-id']).toBe('abc-12345-xyz');

    const bad = await request(app).get('/health').set('x-request-id', '<script>alert(1)</script>');
    expect(bad.headers['x-request-id']).not.toContain('<');
  });

  it('allows CORS (with credentials) only for allowlisted origins', async () => {
    const allowed = await request(app).get('/health').set('Origin', TEST_ORIGIN);
    expect(allowed.headers['access-control-allow-origin']).toBe(TEST_ORIGIN);
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    const blocked = await request(app).get('/health').set('Origin', 'https://evil.example');
    expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('sets security headers via helmet and hides x-powered-by', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('rejects malformed JSON with 400 INVALID_JSON instead of a 500', async () => {
    const res = await request(app)
      .post('/api/anything')
      .set('Content-Type', 'application/json')
      .send('{"broken": ');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});
