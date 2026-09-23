import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import {
  PASSWORD,
  bearer,
  buildTestApp,
  csrf,
  extractRefreshCookie,
  signupTenant,
  addUser,
} from '../../test/helpers.js';
import { TenantModel } from '../tenants/tenant.model.js';
import { UserModel } from '../users/user.model.js';
import { RefreshTokenModel } from './refresh-token.model.js';
import { hashToken } from './tokens.js';

let app: Express;
beforeEach(() => {
  app = buildTestApp();
});

describe('POST /api/auth/signup', () => {
  it('creates a tenant and its OWNER, returns an access token and sets an httpOnly refresh cookie', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ businessName: 'Sunrise Bakery', name: 'Sam', email: 'Sam@Example.com ', password: PASSWORD })
      .expect(201);

    expect(res.body.user).toMatchObject({ email: 'sam@example.com', role: 'OWNER', status: 'active' });
    expect(res.body.tenant.name).toBe('Sunrise Bakery');
    expect(res.body.tenant.widgetKey).toMatch(/^wk_/);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user).not.toHaveProperty('passwordHash');

    const cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []).join(';');
    expect(cookie).toMatch(/cd_rt=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\/api\/auth/);
    expect(cookie).toMatch(/SameSite=Lax/i);

    // Stored password is a bcrypt hash, never the plain text.
    const stored = await UserModel.findOne({ email: 'sam@example.com' })
      .select('+passwordHash')
      .setOptions({ skipTenantGuard: true });
    expect(stored?.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  it('rejects a duplicate email with 409 and creates no extra tenant', async () => {
    const body = { businessName: 'One', name: 'A', email: 'dup@example.com', password: PASSWORD };
    await request(app).post('/api/auth/signup').send(body).expect(201);
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ ...body, businessName: 'Two' });
    expect(res.status).toBe(409);
    expect(await TenantModel.countDocuments()).toBe(1);
  });

  it('validates input (weak password, bad email)', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ businessName: 'X Co', name: 'A', email: 'nope', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with correct credentials', async () => {
    const owner = await signupTenant(app);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: owner.user.email, password: PASSWORD })
      .expect(200);
    expect(res.body.user.id).toBe(owner.user.id);
  });

  it('returns the SAME error for unknown email and wrong password (no account enumeration)', async () => {
    const owner = await signupTenant(app);
    const wrongPw = await request(app)
      .post('/api/auth/login')
      .send({ email: owner.user.email, password: 'nope-nope' });
    const noUser = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ghost@example.com', password: 'x' });
    expect(wrongPw.status).toBe(401);
    expect(noUser.status).toBe(401);
    expect(wrongPw.body.error.message).toBe(noUser.body.error.message);
  });

  it('refuses disabled accounts', async () => {
    const owner = await signupTenant(app);
    const agent = await addUser(app, owner.tenant.id, 'AGENT');
    await UserModel.updateOne({ _id: agent.user.id, tenantId: owner.tenant.id }, { status: 'disabled' });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: agent.user.email, password: PASSWORD });
    expect(res.status).toBe(403);
  });
});

describe('access token verification (GET /api/auth/me)', () => {
  it('returns the current user and tenant', async () => {
    const owner = await signupTenant(app);
    const res = await request(app).get('/api/auth/me').set('Authorization', bearer(owner)).expect(200);
    expect(res.body.user.id).toBe(owner.user.id);
    expect(res.body.tenant.id).toBe(owner.tenant.id);
  });

  it('401 without a token', async () => {
    await request(app).get('/api/auth/me').expect(401);
  });

  it('401 TOKEN_INVALID for a token signed with another secret (forged tenant claim)', async () => {
    const owner = await signupTenant(app);
    const forged = jwt.sign({ tid: owner.tenant.id, role: 'OWNER' }, 'attacker-secret-attacker-secret-!!', {
      subject: owner.user.id,
      issuer: 'convodesk',
      audience: 'convodesk-api',
    });
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_INVALID');
  });

  it('401 for an unsigned "alg: none" token', async () => {
    const owner = await signupTenant(app);
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        sub: owner.user.id,
        tid: owner.tenant.id,
        role: 'OWNER',
        iss: 'convodesk',
        aud: 'convodesk-api',
      }),
    ).toString('base64url');
    await request(app).get('/api/auth/me').set('Authorization', `Bearer ${header}.${payload}.`).expect(401);
  });
});

describe('POST /api/auth/refresh (rotation + reuse detection)', () => {
  it('requires the anti-CSRF header', async () => {
    const owner = await signupTenant(app);
    const res = await request(app).post('/api/auth/refresh').set('Cookie', owner.cookie);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_HEADER_MISSING');
  });

  it('401 NO_SESSION without a cookie', async () => {
    const res = await request(app).post('/api/auth/refresh').set(csrf);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('NO_SESSION');
  });

  it('issues a new access token AND a new refresh cookie (rotation)', async () => {
    const owner = await signupTenant(app);
    const res = await request(app)
      .post('/api/auth/refresh')
      .set(csrf)
      .set('Cookie', owner.cookie)
      .expect(200);
    const newCookie = extractRefreshCookie(res);
    expect(newCookie).not.toBe(owner.cookie);
    expect(res.body.accessToken).toEqual(expect.any(String));

    // And the new cookie works.
    await request(app).post('/api/auth/refresh').set(csrf).set('Cookie', newCookie).expect(200);
  });

  it('treats an immediate second use as a benign multi-tab race (REFRESH_RACE), not theft', async () => {
    const owner = await signupTenant(app);
    await request(app).post('/api/auth/refresh').set(csrf).set('Cookie', owner.cookie).expect(200);
    const again = await request(app).post('/api/auth/refresh').set(csrf).set('Cookie', owner.cookie);
    expect(again.status).toBe(401);
    expect(again.body.error.code).toBe('REFRESH_RACE');
  });

  it('replaying an OLD rotated token revokes the whole session family', async () => {
    const owner = await signupTenant(app);
    const rotated = await request(app)
      .post('/api/auth/refresh')
      .set(csrf)
      .set('Cookie', owner.cookie)
      .expect(200);
    const currentCookie = extractRefreshCookie(rotated);

    // Simulate time passing beyond the race grace window.
    const oldHash = hashToken(owner.cookie.replace('cd_rt=', ''));
    await RefreshTokenModel.updateOne(
      { tokenHash: oldHash },
      { revokedAt: new Date(Date.now() - 60_000) },
    ).setOptions({ skipTenantGuard: true });

    // Attacker replays the stolen old token…
    const replay = await request(app).post('/api/auth/refresh').set(csrf).set('Cookie', owner.cookie);
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('NO_SESSION');

    // …which also kills the legitimate user's current token (they must sign in again).
    const victim = await request(app).post('/api/auth/refresh').set(csrf).set('Cookie', currentCookie);
    expect(victim.status).toBe(401);
  });

  it('logout revokes the refresh token and clears the cookie', async () => {
    const owner = await signupTenant(app);
    const res = await request(app).post('/api/auth/logout').set(csrf).set('Cookie', owner.cookie).expect(204);
    expect(([] as string[]).concat(res.headers['set-cookie'] ?? []).join(';')).toMatch(/cd_rt=;/);
    await request(app).post('/api/auth/refresh').set(csrf).set('Cookie', owner.cookie).expect(401);
  });
});
