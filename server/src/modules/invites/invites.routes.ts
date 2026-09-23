import { Router } from 'express';
import { z } from 'zod';
import { createInviteSchema, objectIdSchema, type CreateInviteInput } from '@convodesk/shared';
import mongoose from 'mongoose';
import { env } from '../../config/env.js';
import { TenantRepository } from '../../db/tenant-repository.js';
import { notFound } from '../../errors/app-error.js';
import { authenticate, authOf, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { hashToken, randomToken } from '../auth/tokens.js';
import { InviteModel, toInviteDto } from './invite.model.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Invite management — OWNER only. */
export function invitesRouter(): Router {
  const router = Router();
  router.use(authenticate, requireRole('OWNER'));

  router.get('/', async (req, res) => {
    const invites = new TenantRepository(InviteModel, authOf(req).tenantId);
    const list = await invites.find({ revokedAt: null }).sort({ createdAt: -1 }).limit(100);
    res.json({ items: list.map((i) => toInviteDto(i)) });
  });

  router.post('/', validate({ body: createInviteSchema }), async (req, res) => {
    const auth = authOf(req);
    const input = req.valid.body as CreateInviteInput;
    const invites = new TenantRepository(InviteModel, auth.tenantId);

    const token = randomToken();
    const invite = await invites.create({
      tokenHash: hashToken(token),
      role: input.role,
      email: input.email ?? null,
      createdBy: new mongoose.Types.ObjectId(auth.userId),
      expiresAt: new Date(Date.now() + input.expiresInDays * DAY_MS),
    });

    // The token goes in the URL #fragment: browsers never send fragments to servers,
    // so it can't end up in Vercel/Render access logs or Referer headers.
    const url = `${env().APP_URL}/accept-invite#token=${token}`;
    res.status(201).json(toInviteDto(invite, url));
  });

  router.delete('/:id', validate({ params: z.object({ id: objectIdSchema }) }), async (req, res) => {
    const { id } = req.valid.params as { id: string };
    const invites = new TenantRepository(InviteModel, authOf(req).tenantId);
    const revoked = await invites.updateById(id, { $set: { revokedAt: new Date() } });
    if (!revoked) throw notFound('Invite');
    res.status(204).end();
  });

  return router;
}
