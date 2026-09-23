import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  acceptInviteSchema,
  loginSchema,
  signupSchema,
  type AcceptInviteInput,
  type LoginInput,
  type SignupInput,
} from '@convodesk/shared';
import { env } from '../../config/env.js';
import { authenticate, authOf, requireCsrfHeader } from '../../middleware/auth.js';
import { authLimiter, refreshLimiter } from '../../middleware/rate-limit.js';
import { validate } from '../../middleware/validate.js';
import * as authService from './auth.service.js';

/**
 * The refresh cookie is scoped to /api/auth so the browser only sends it to the endpoints
 * that need it — not on every API call.
 */
export const REFRESH_COOKIE = 'cd_rt';
const REFRESH_COOKIE_PATH = '/api/auth';

function setRefreshCookie(res: Response, session: authService.Session): void {
  res.cookie(REFRESH_COOKIE, session.refreshToken, {
    httpOnly: true,
    secure: env().COOKIE_SECURE,
    sameSite: env().COOKIE_SAMESITE,
    path: REFRESH_COOKIE_PATH,
    expires: session.refreshExpiresAt,
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: env().COOKIE_SECURE,
    sameSite: env().COOKIE_SAMESITE,
    path: REFRESH_COOKIE_PATH,
  });
}

const meta = (req: Request) => ({ userAgent: req.get('user-agent') });
const refreshCookieOf = (req: Request): string | undefined => {
  const value: unknown = req.cookies?.[REFRESH_COOKIE];
  return typeof value === 'string' ? value : undefined;
};

export function authRouter(): Router {
  const router = Router();
  const limitAuth = authLimiter();

  router.post('/signup', limitAuth, validate({ body: signupSchema }), async (req, res) => {
    const session = await authService.signup(req.valid.body as SignupInput, meta(req));
    setRefreshCookie(res, session);
    res.status(201).json(session.response);
  });

  router.post('/login', limitAuth, validate({ body: loginSchema }), async (req, res) => {
    const session = await authService.login(req.valid.body as LoginInput, meta(req));
    setRefreshCookie(res, session);
    res.json(session.response);
  });

  router.post('/refresh', refreshLimiter(), requireCsrfHeader, async (req, res) => {
    try {
      const session = await authService.refresh(refreshCookieOf(req), meta(req));
      setRefreshCookie(res, session);
      res.json(session.response);
    } catch (err) {
      // On a hard failure, drop the dead cookie so the browser stops sending it.
      // (Not on a race — the cookie was just replaced by the other tab.)
      if (!(err instanceof Error && 'code' in err && err.code === 'REFRESH_RACE')) clearRefreshCookie(res);
      throw err;
    }
  });

  router.post('/logout', requireCsrfHeader, async (req, res) => {
    await authService.logout(refreshCookieOf(req));
    clearRefreshCookie(res);
    res.status(204).end();
  });

  router.get('/me', authenticate, async (req, res) => {
    res.json(await authService.me(authOf(req)));
  });

  // POST (not GET /invites/:token) so the secret token never lands in URLs, logs or Referer headers.
  router.post(
    '/invites/preview',
    limitAuth,
    validate({ body: z.object({ token: z.string().min(20).max(200) }) }),
    async (req, res) => {
      const { token } = req.valid.body as { token: string };
      res.json(await authService.previewInvite(token));
    },
  );

  router.post('/accept-invite', limitAuth, validate({ body: acceptInviteSchema }), async (req, res) => {
    const session = await authService.acceptInvite(req.valid.body as AcceptInviteInput, meta(req));
    setRefreshCookie(res, session);
    res.status(201).json(session.response);
  });

  return router;
}
