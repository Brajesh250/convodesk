import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { ROLES, type Role } from '@convodesk/shared';
import { z } from 'zod';
import { env } from '../../config/env.js';

/**
 * Two kinds of credentials:
 *
 * 1. ACCESS TOKEN — a short-lived (15 min) JWT sent as `Authorization: Bearer …`.
 *    Stateless to verify, kept only in the SPA's memory (never localStorage → not stealable by XSS
 *    that reads storage, and gone when the tab closes).
 *
 * 2. REFRESH TOKEN — a long random string in an httpOnly cookie. JavaScript can't read it.
 *    It's opaque (not a JWT) because it must be revocable: we look it up in the DB on every use.
 */

const ISSUER = 'convodesk';
const AUDIENCE = 'convodesk-api';

export interface AccessClaims {
  userId: string;
  tenantId: string;
  role: Role;
}

const claimsSchema = z.object({
  sub: z.string(),
  tid: z.string(),
  role: z.enum(ROLES),
});

export function signAccessToken(claims: AccessClaims): string {
  return jwt.sign({ tid: claims.tenantId, role: claims.role }, env().JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    subject: claims.userId,
    issuer: ISSUER,
    audience: AUDIENCE,
    expiresIn: env().ACCESS_TOKEN_TTL_SECONDS,
  });
}

/** Throws if the token is invalid, expired, or signed with anything other than HS256 + our secret. */
export function verifyAccessToken(token: string): AccessClaims {
  const payload = jwt.verify(token, env().JWT_ACCESS_SECRET, {
    algorithms: ['HS256'], // pinned: blocks "alg: none" and algorithm-confusion attacks
    issuer: ISSUER,
    audience: AUDIENCE,
  });
  const claims = claimsSchema.parse(payload);
  return { userId: claims.sub, tenantId: claims.tid, role: claims.role };
}

/** 256 bits of randomness, URL-safe. Used for refresh tokens and invite links. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/**
 * Tokens are stored as SHA-256 hashes. A fast hash is fine here (unlike passwords) because the
 * input is 256 random bits — there's nothing to brute-force.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
