import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { addUser, bearer, buildTestApp, csrf, signupTenant, type TestSession } from '../test/helpers.js';

/**
 * End-to-end proof over HTTP that tenant A can never read or write tenant B's data,
 * and that RBAC is enforced server-side. (Socket isolation tests arrive with Socket.IO in Phase 4.)
 */
let app: Express;
let ownerA: TestSession;
let ownerB: TestSession;

beforeEach(async () => {
  app = buildTestApp();
  ownerA = await signupTenant(app, 'Tenant A');
  ownerB = await signupTenant(app, 'Tenant B');
});

describe('cross-tenant isolation (REST)', () => {
  it('GET /api/users lists only the caller’s tenant', async () => {
    await addUser(app, ownerB.tenant.id, 'AGENT');
    const res = await request(app).get('/api/users').set('Authorization', bearer(ownerA)).expect(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].tenantId).toBe(ownerA.tenant.id);
  });

  it('tenant A’s OWNER cannot modify a user of tenant B (404, not 403 — no existence leak)', async () => {
    const agentB = await addUser(app, ownerB.tenant.id, 'AGENT');
    const res = await request(app)
      .patch(`/api/users/${agentB.user.id}`)
      .set('Authorization', bearer(ownerA))
      .send({ status: 'disabled' });
    expect(res.status).toBe(404);

    // B's agent is still active and can still call the API.
    await request(app).get('/api/auth/me').set('Authorization', bearer(agentB)).expect(200);
  });

  it('tenant A cannot revoke tenant B’s invite', async () => {
    const created = await request(app)
      .post('/api/invites')
      .set('Authorization', bearer(ownerB))
      .send({ role: 'AGENT' })
      .expect(201);
    await request(app)
      .delete(`/api/invites/${created.body.id}`)
      .set('Authorization', bearer(ownerA))
      .expect(404);

    const listB = await request(app).get('/api/invites').set('Authorization', bearer(ownerB)).expect(200);
    expect(listB.body.items).toHaveLength(1);
  });

  it('GET/PATCH /api/tenant only ever touch the tenant in the token', async () => {
    await request(app)
      .patch('/api/tenant')
      .set('Authorization', bearer(ownerA))
      .send({ name: 'Renamed A' })
      .expect(200);
    const b = await request(app).get('/api/tenant').set('Authorization', bearer(ownerB)).expect(200);
    expect(b.body.name).toBe('Tenant B');
  });

  it('a user’s refresh cookie cannot yield a session in another tenant', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .set(csrf)
      .set('Cookie', ownerA.cookie)
      .expect(200);
    expect(res.body.tenant.id).toBe(ownerA.tenant.id);
  });
});

describe('RBAC (server-side)', () => {
  it('AGENT and VIEWER cannot change roles or workspace settings', async () => {
    const agent = await addUser(app, ownerA.tenant.id, 'AGENT');
    const viewer = await addUser(app, ownerA.tenant.id, 'VIEWER');

    await request(app)
      .patch(`/api/users/${viewer.user.id}`)
      .set('Authorization', bearer(agent))
      .send({ role: 'OWNER' })
      .expect(403);
    await request(app)
      .patch('/api/tenant')
      .set('Authorization', bearer(viewer))
      .send({ name: 'x' })
      .expect(403);
  });

  it('a role change takes effect on the very next request (not after token expiry)', async () => {
    const promoted = await addUser(app, ownerA.tenant.id, 'AGENT');
    await request(app).get('/api/invites').set('Authorization', bearer(promoted)).expect(403);

    await request(app)
      .patch(`/api/users/${promoted.user.id}`)
      .set('Authorization', bearer(ownerA))
      .send({ role: 'OWNER' })
      .expect(200);

    // Same (old) access token — but authenticate() reads the current role from the DB.
    await request(app).get('/api/invites').set('Authorization', bearer(promoted)).expect(200);
  });

  it('disabling a user locks them out immediately and kills their refresh session', async () => {
    const agent = await addUser(app, ownerA.tenant.id, 'AGENT');
    await request(app)
      .patch(`/api/users/${agent.user.id}`)
      .set('Authorization', bearer(ownerA))
      .send({ status: 'disabled' })
      .expect(200);

    await request(app).get('/api/auth/me').set('Authorization', bearer(agent)).expect(401);
    await request(app).post('/api/auth/refresh').set(csrf).set('Cookie', agent.cookie).expect(401);
  });

  it('the last active OWNER cannot be demoted or disabled', async () => {
    const res = await request(app)
      .patch(`/api/users/${ownerA.user.id}`)
      .set('Authorization', bearer(ownerA))
      .send({ role: 'AGENT' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('LAST_OWNER');

    // With a second owner it is allowed.
    await addUser(app, ownerA.tenant.id, 'OWNER');
    await request(app)
      .patch(`/api/users/${ownerA.user.id}`)
      .set('Authorization', bearer(ownerA))
      .send({ role: 'AGENT' })
      .expect(200);
  });
});
