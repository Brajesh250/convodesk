import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import mongoose, { type HydratedDocument } from 'mongoose';
import type {
  AcceptInviteInput,
  AuthResponse,
  InvitePreviewDto,
  LoginInput,
  SignupInput,
} from '@convodesk/shared';
import { env } from '../../config/env.js';
import { AppError, conflict, unauthorized } from '../../errors/app-error.js';
import { logger } from '../../observability/logger.js';
import { InviteModel } from '../invites/invite.model.js';
import { TenantModel, toTenantDto, type Tenant } from '../tenants/tenant.model.js';
import { UserModel, toUserDto, type User } from '../users/user.model.js';
import { RefreshTokenModel } from './refresh-token.model.js';
import { hashToken, randomToken, signAccessToken } from './tokens.js';

/**
 * Two tabs of the same browser can refresh at the same moment with the same cookie. The loser
 * would look like a replayed (stolen) token and nuke the session. Within this grace window we
 * treat it as a benign race instead: return 401 REFRESH_RACE, and the client retries once
 * (by then the winner's Set-Cookie has updated the shared cookie).
 */
const ROTATION_GRACE_MS = 10_000;

export interface Session {
  response: AuthResponse;
  refreshToken: string;
  refreshExpiresAt: Date;
}

interface RequestMeta {
  userAgent?: string | undefined;
}

// ── Signup ──────────────────────────────────────────────────────────────────────────────

/**
 * Creates the Tenant and its first OWNER atomically (a MongoDB transaction), so a failure
 * halfway can never leave a tenant without an owner or a user without a tenant.
 */
export async function signup(input: SignupInput, meta: RequestMeta): Promise<Session> {
  await assertEmailAvailable(input.email);
  const passwordHash = await bcrypt.hash(input.password, env().BCRYPT_ROUNDS);

  let tenant!: HydratedDocument<Tenant>;
  let user!: HydratedDocument<User>;

  await mongoose.connection.transaction(async (session) => {
    [tenant] = (await TenantModel.create(
      [{ name: input.businessName, slug: makeSlug(input.businessName), widgetKey: `wk_${randomToken(18)}` }],
      { session },
    )) as [HydratedDocument<Tenant>];
    [user] = (await UserModel.create(
      [{ tenantId: tenant._id, email: input.email, passwordHash, name: input.name, role: 'OWNER' }],
      { session },
    )) as [HydratedDocument<User>];
  });

  logger.info({ tenantId: tenant.id, userId: user.id }, 'Tenant signed up');
  return issueSession(user, tenant, meta);
}

// ── Login ───────────────────────────────────────────────────────────────────────────────

let dummyHash: string | undefined;

/**
 * Same error for "no such email" and "wrong password", and we run bcrypt even when the user
 * doesn't exist — otherwise response TIMING would reveal which emails are registered.
 */
export async function login(input: LoginInput, meta: RequestMeta): Promise<Session> {
  // Login is inherently cross-tenant: we don't know the tenant until we find the user by email.
  const user = await UserModel.findOne({ email: input.email })
    .select('+passwordHash')
    .setOptions({ skipTenantGuard: true });

  dummyHash ??= await bcrypt.hash('timing-equaliser', env().BCRYPT_ROUNDS);
  const ok = await bcrypt.compare(input.password, user?.passwordHash ?? dummyHash);
  if (!user || !ok) throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  if (user.status !== 'active') throw new AppError(403, 'ACCOUNT_DISABLED', 'This account has been disabled');

  const tenant = await TenantModel.findById(user.tenantId);
  if (!tenant) throw unauthorized();

  user.lastLoginAt = new Date();
  await user.save();

  return issueSession(user, tenant, meta);
}

// ── Refresh (rotation + reuse detection) ────────────────────────────────────────────────

export async function refresh(rawToken: string | undefined, meta: RequestMeta): Promise<Session> {
  if (!rawToken) throw new AppError(401, 'NO_SESSION', 'Please sign in');

  // Cross-tenant lookup by hash: the token itself tells us which tenant it belongs to.
  const existing = await RefreshTokenModel.findOne({ tokenHash: hashToken(rawToken) }).setOptions({
    skipTenantGuard: true,
  });
  if (!existing || existing.expiresAt.getTime() <= Date.now()) {
    throw new AppError(401, 'NO_SESSION', 'Your session has expired, please sign in again');
  }

  if (existing.revokedAt) {
    const recentlyRotated =
      existing.revokedReason === 'rotated' && Date.now() - existing.revokedAt.getTime() < ROTATION_GRACE_MS;
    if (recentlyRotated) {
      throw new AppError(401, 'REFRESH_RACE', 'Session refreshed in another tab, retry');
    }
    // A revoked token came back: it was stolen and replayed (or leaked). Kill the whole family.
    await RefreshTokenModel.updateMany(
      { tenantId: existing.tenantId, familyId: existing.familyId, revokedAt: null },
      { revokedAt: new Date(), revokedReason: 'reuse_detected' },
    );
    logger.warn(
      {
        tenantId: existing.tenantId.toString(),
        userId: existing.userId.toString(),
        familyId: existing.familyId,
      },
      'Refresh token reuse detected — session family revoked',
    );
    throw new AppError(401, 'NO_SESSION', 'Your session has expired, please sign in again');
  }

  // Atomically claim the token. If two requests race, only one gets a document back.
  const claimed = await RefreshTokenModel.findOneAndUpdate(
    { _id: existing._id, tenantId: existing.tenantId, revokedAt: null },
    { revokedAt: new Date(), revokedReason: 'rotated' },
  );
  if (!claimed) throw new AppError(401, 'REFRESH_RACE', 'Session refreshed in another tab, retry');

  const user = await UserModel.findOne({ _id: existing.userId, tenantId: existing.tenantId });
  const tenant = await TenantModel.findById(existing.tenantId);
  if (!user || user.status !== 'active' || !tenant) {
    throw new AppError(401, 'NO_SESSION', 'Please sign in');
  }

  return issueSession(user, tenant, meta, existing.familyId);
}

export async function logout(rawToken: string | undefined): Promise<void> {
  if (!rawToken) return;
  await RefreshTokenModel.updateOne(
    { tokenHash: hashToken(rawToken), revokedAt: null },
    { revokedAt: new Date(), revokedReason: 'logout' },
  ).setOptions({ skipTenantGuard: true });
}

export async function me(auth: { userId: string; tenantId: string }) {
  const user = await UserModel.findOne({ _id: auth.userId, tenantId: auth.tenantId });
  const tenant = await TenantModel.findById(auth.tenantId);
  if (!user || !tenant) throw unauthorized();
  return { user: toUserDto(user), tenant: toTenantDto(tenant) };
}

/** Revoke every live session of a user (used when they are disabled). */
export async function revokeAllSessions(tenantId: string, userId: string): Promise<void> {
  await RefreshTokenModel.updateMany(
    { tenantId, userId, revokedAt: null },
    { revokedAt: new Date(), revokedReason: 'user_disabled' },
  );
}

// ── Invites ─────────────────────────────────────────────────────────────────────────────

async function findUsableInvite(rawToken: string) {
  // Cross-tenant by nature: the invitee isn't logged in, the token identifies the tenant.
  const invite = await InviteModel.findOne({ tokenHash: hashToken(rawToken) }).setOptions({
    skipTenantGuard: true,
  });
  if (!invite || invite.revokedAt) throw new AppError(404, 'INVITE_INVALID', 'This invite link is not valid');
  if (invite.usedAt) throw new AppError(410, 'INVITE_USED', 'This invite has already been used');
  if (invite.expiresAt.getTime() <= Date.now()) {
    throw new AppError(410, 'INVITE_EXPIRED', 'This invite has expired, ask for a new one');
  }
  return invite;
}

export async function previewInvite(rawToken: string): Promise<InvitePreviewDto> {
  const invite = await findUsableInvite(rawToken);
  const tenant = await TenantModel.findById(invite.tenantId);
  if (!tenant) throw new AppError(404, 'INVITE_INVALID', 'This invite link is not valid');
  return {
    tenantName: tenant.name,
    role: invite.role,
    email: invite.email,
    expiresAt: invite.expiresAt.toISOString(),
  };
}

export async function acceptInvite(input: AcceptInviteInput, meta: RequestMeta): Promise<Session> {
  const invite = await findUsableInvite(input.token);
  if (invite.email && invite.email !== input.email) {
    throw new AppError(403, 'INVITE_EMAIL_MISMATCH', 'This invite was issued for a different email address');
  }
  await assertEmailAvailable(input.email);
  const passwordHash = await bcrypt.hash(input.password, env().BCRYPT_ROUNDS);

  let user!: HydratedDocument<User>;
  await mongoose.connection.transaction(async (session) => {
    // Claim the invite first; if someone else used it a millisecond ago, this returns null.
    const claimed = await InviteModel.findOneAndUpdate(
      { _id: invite._id, tenantId: invite.tenantId, usedAt: null },
      { usedAt: new Date() },
      { session },
    );
    if (!claimed) throw new AppError(410, 'INVITE_USED', 'This invite has already been used');

    [user] = (await UserModel.create(
      [{ tenantId: invite.tenantId, email: input.email, passwordHash, name: input.name, role: invite.role }],
      { session },
    )) as [HydratedDocument<User>];

    await InviteModel.updateOne(
      { _id: invite._id, tenantId: invite.tenantId },
      { usedBy: user._id },
      { session },
    );
  });

  const tenant = await TenantModel.findById(invite.tenantId);
  if (!tenant) throw unauthorized();
  return issueSession(user, tenant, meta);
}

// ── Helpers ─────────────────────────────────────────────────────────────────────────────

async function assertEmailAvailable(email: string): Promise<void> {
  // Friendly early check; the unique index on User.email is the real guarantee under races.
  const taken = await UserModel.exists({ email }).setOptions({ skipTenantGuard: true });
  if (taken) throw conflict('An account with this email already exists');
}

async function issueSession(
  user: HydratedDocument<User>,
  tenant: HydratedDocument<Tenant>,
  meta: RequestMeta,
  familyId: string = randomUUID(),
): Promise<Session> {
  const refreshToken = randomToken();
  const refreshExpiresAt = new Date(Date.now() + env().REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  await RefreshTokenModel.create({
    tenantId: user.tenantId,
    userId: user._id,
    tokenHash: hashToken(refreshToken),
    familyId,
    expiresAt: refreshExpiresAt,
    userAgent: meta.userAgent?.slice(0, 300) ?? null,
  });

  const accessToken = signAccessToken({
    userId: user.id as string,
    tenantId: tenant.id as string,
    role: user.role,
  });

  return {
    refreshToken,
    refreshExpiresAt,
    response: {
      accessToken,
      expiresIn: env().ACCESS_TOKEN_TTL_SECONDS,
      user: toUserDto(user),
      tenant: toTenantDto(tenant),
    },
  };
}

function makeSlug(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .slice(0, 40);
  // A short random suffix avoids collisions without a "check then retry" loop.
  return `${base || 'workspace'}-${randomToken(3)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, 'x')}`;
}
