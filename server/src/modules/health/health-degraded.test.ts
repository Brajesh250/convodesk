import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { buildTestApp } from '../../test/helpers.js';

// Simulate a lost database connection without actually killing the test DB.
vi.mock('../../db/connect.js', () => ({ dbState: () => 'disconnected' }));

describe('GET /health when the database is down', () => {
  it('returns 503 so uptime monitors raise an alert', async () => {
    const res = await request(buildTestApp()).get('/health');

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: 'degraded', db: 'disconnected' });
  });
});
