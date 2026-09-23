import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from '@convodesk/shared';
import { buildTestApp } from '../../test/helpers.js';

describe('GET /health', () => {
  it('returns 200 and a valid body when the database is connected', async () => {
    const res = await request(buildTestApp()).get('/health');

    expect(res.status).toBe(200);
    const body = healthResponseSchema.parse(res.body); // contract check against the shared schema
    expect(body.status).toBe('ok');
    expect(body.db).toBe('connected');
  });

  it('answers HEAD requests (UptimeRobot free plan uses HEAD)', async () => {
    const res = await request(buildTestApp()).head('/health');
    expect(res.status).toBe(200);
  });
});
