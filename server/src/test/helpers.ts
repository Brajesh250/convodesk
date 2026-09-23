import bcrypt from 'bcrypt';
import type { Express } from 'express';
import request from 'supertest';
import type { AuthResponse, Role } from '@convodesk/shared';
import { CSRF_HEADER, CSRF_HEADER_VALUE } from '@convodesk/shared';
import { createApp } from '../app.js';
import { UserModel } from '../modules/users/user.model.js';

export const TEST_ORIGIN = 'http://localhost:4200';
export const PASSWORD = 'correct-horse-battery';

/** A fresh Express app configured the way tests expect. */
export function buildTestApp(): Express {
  return createApp({ corsOrigins: [TEST_ORIGIN] });
}

let counter = 0;
const uniqueEmail = (prefix: string) => `${prefix}.${Date.now()}.${++counter}@example.com`;

export interface TestSession extends AuthResponse {
  /** The raw `cd_rt=…` cookie pair, ready for `.set('Cookie', …)`. */
  cookie: string;
}

export function extractRefreshCookie(res: request.Response): string {
  const setCookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const cookie = setCookie.find((c) => c.startsWith('cd_rt='));
  if (!cookie) throw new Error('No refresh cookie in response');
  return cookie.split(';')[0]!;
}

/** Signs up a brand-new tenant and returns its OWNER session. */
export async function signupTenant(app: Express, businessName = 'Acme Dental'): Promise<TestSession> {
  const res = await request(app)
    .post('/api/auth/signup')
    .send({ businessName, name: 'Olivia Owner', email: uniqueEmail('owner'), password: PASSWORD })
    .expect(201);
  return { ...(res.body as AuthResponse), cookie: extractRefreshCookie(res) };
}

/** Creates a user with the given role directly in a tenant, then logs them in. */
export async function addUser(app: Express, tenantId: string, role: Role): Promise<TestSession> {
  const email = uniqueEmail(role.toLowerCase());
  await UserModel.create({
    tenantId,
    email,
    name: `${role} person`,
    role,
    passwordHash: await bcrypt.hash(PASSWORD, 4),
  });
  const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD }).expect(200);
  return { ...(res.body as AuthResponse), cookie: extractRefreshCookie(res) };
}

export const bearer = (session: { accessToken: string }) => `Bearer ${session.accessToken}`;
export const csrf = { [CSRF_HEADER]: CSRF_HEADER_VALUE };
