import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import {
  PASSWORD,
  addUser,
  bearer,
  buildTestApp,
  signupTenant,
  type TestSession,
} from '../../test/helpers.js';
import { InviteModel } from './invite.model.js';

let app: Express;
let owner: TestSession;

beforeEach(async () => {
  app = buildTestApp();
  owner = await signupTenant(app);
});

async function createInvite(body: Record<string, unknown> = { role: 'AGENT' }) {
  const res = await request(app)
    .post('/api/invites')
    .set('Authorization', bearer(owner))
    .send(body)
    .expect(201);
  const token = new URL(res.body.url as string).hash.replace('#token=', '');
  return { invite: res.body, token };
}

describe('invite links', () => {
  it('OWNER creates a link with the token in the URL fragment (never sent to servers)', async () => {
    const { invite, token } = await createInvite();
    expect(invite.url).toMatch(/^http:\/\/localhost:4200\/accept-invite#token=/);
    expect(token.length).toBeGreaterThan(30);
    // Only the hash is stored.
    const stored = await InviteModel.findById(invite.id).setOptions({ skipTenantGuard: true });
    expect(stored?.tokenHash).not.toBe(token);
  });

  it('preview shows tenant name and role without authentication', async () => {
    const { token } = await createInvite({ role: 'VIEWER' });
    const res = await request(app).post('/api/auth/invites/preview').send({ token }).expect(200);
    expect(res.body).toMatchObject({ tenantName: owner.tenant.name, role: 'VIEWER' });
  });

  it('accepting creates a user in the INVITING tenant with the invited role', async () => {
    const { token } = await createInvite({ role: 'AGENT' });
    const res = await request(app)
      .post('/api/auth/accept-invite')
      .send({ token, name: 'Ada Agent', email: 'ada@example.com', password: PASSWORD })
      .expect(201);
    expect(res.body.user).toMatchObject({ role: 'AGENT', tenantId: owner.tenant.id });
    expect(res.body.tenant.id).toBe(owner.tenant.id);
  });

  it('an invite can only be used once', async () => {
    const { token } = await createInvite();
    await request(app)
      .post('/api/auth/accept-invite')
      .send({ token, name: 'A', email: 'first@example.com', password: PASSWORD })
      .expect(201);
    const second = await request(app)
      .post('/api/auth/accept-invite')
      .send({ token, name: 'B', email: 'second@example.com', password: PASSWORD });
    expect(second.status).toBe(410);
    expect(second.body.error.code).toBe('INVITE_USED');
  });

  it('expired, revoked and email-locked invites are refused', async () => {
    const expired = await createInvite();
    await InviteModel.updateOne(
      { _id: expired.invite.id, tenantId: owner.tenant.id },
      { expiresAt: new Date(Date.now() - 1000) },
    );
    const exp = await request(app).post('/api/auth/invites/preview').send({ token: expired.token });
    expect(exp.body.error.code).toBe('INVITE_EXPIRED');

    const revoked = await createInvite();
    await request(app)
      .delete(`/api/invites/${revoked.invite.id}`)
      .set('Authorization', bearer(owner))
      .expect(204);
    const rev = await request(app).post('/api/auth/invites/preview').send({ token: revoked.token });
    expect(rev.body.error.code).toBe('INVITE_INVALID');

    const locked = await createInvite({ role: 'AGENT', email: 'only@example.com' });
    const wrong = await request(app)
      .post('/api/auth/accept-invite')
      .send({ token: locked.token, name: 'X', email: 'other@example.com', password: PASSWORD });
    expect(wrong.status).toBe(403);
  });

  it('only OWNER can manage invites (AGENT and VIEWER get 403)', async () => {
    const agent = await addUser(app, owner.tenant.id, 'AGENT');
    const viewer = await addUser(app, owner.tenant.id, 'VIEWER');
    await request(app)
      .post('/api/invites')
      .set('Authorization', bearer(agent))
      .send({ role: 'OWNER' })
      .expect(403);
    await request(app).get('/api/invites').set('Authorization', bearer(viewer)).expect(403);
  });
});
