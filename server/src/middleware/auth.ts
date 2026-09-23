import type { Request, RequestHandler } from 'express';
import type { Role } from '@convodesk/shared';
import { CSRF_HEADER, CSRF_HEADER_VALUE } from '@convodesk/shared';
import { AppError, forbidden, unauthorized } from '../errors/app-error.js';
import { verifyAccessToken } from '../modules/auth/tokens.js';
import { UserModel } from '../modules/users/user.model.js';

/**
 * `authenticate` is the ONE place where a request gets a tenant.
 *
 *  1. Verify the Bearer JWT (signature, expiry, issuer, audience).
 *  2. Re-load the user, scoped to the tenant in the token, to confirm they still exist and are active,
 *     and to pick up their CURRENT role. So demoting or disabling someone takes effect on their very
 *     next request, not 15 minutes later. Cost: one indexed read per request — fine at this scale.
 *  3. Attach `req.auth = { userId, tenantId, role }`. Everything downstream uses req.auth.tenantId.
 */
export const authenticate: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw unauthorized();

  let claims;
  try {
    claims = verifyAccessToken(header.slice('Bearer '.length).trim());
  } catch {
    // Distinct code so the SPA knows to try a silent refresh rather than show a login screen.
    throw new AppError(401, 'TOKEN_INVALID', 'Your session has expired, please sign in again');
  }

  const user = await UserModel.findOne({ _id: claims.userId, tenantId: claims.tenantId }).lean();
  if (!user || user.status !== 'active') throw unauthorized('Account not found or disabled');

  req.auth = { userId: claims.userId, tenantId: claims.tenantId, role: user.role };
  // Every log line for this request now carries the tenant and user.
  req.log = req.log.child({ tenantId: claims.tenantId, userId: claims.userId });
  next();
};

/** Typed accessor for handlers mounted behind `authenticate`. */
export function authOf(req: Request): NonNullable<Request['auth']> {
  if (!req.auth) throw unauthorized();
  return req.auth;
}

/**
 * RBAC gate. Usage: `router.patch('/:id', requireRole('OWNER'), handler)`.
 * Must run after `authenticate`. The Angular app mirrors these rules to hide buttons,
 * but THIS is the check that matters — UI hiding is only a convenience.
 */
export function requireRole(...allowed: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) throw unauthorized();
    if (!allowed.includes(req.auth.role)) throw forbidden();
    next();
  };
}

/**
 * CSRF defence for the endpoints that authenticate with the refresh COOKIE (refresh, logout).
 * A plain cross-site form post can't set custom headers, and a cross-site fetch() with one
 * triggers a CORS preflight that our allowlist rejects. So requiring this header means the
 * request came from our own SPA. (SameSite=Lax already blocks most cases; this is belt-and-braces.)
 */
export const requireCsrfHeader: RequestHandler = (req, _res, next) => {
  if (req.get(CSRF_HEADER) !== CSRF_HEADER_VALUE) {
    throw new AppError(403, 'CSRF_HEADER_MISSING', 'Missing anti-CSRF header');
  }
  next();
};
