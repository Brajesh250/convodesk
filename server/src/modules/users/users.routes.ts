import { Router } from 'express';
import { z } from 'zod';
import { objectIdSchema, updateUserSchema, type UpdateUserInput } from '@convodesk/shared';
import { TenantRepository } from '../../db/tenant-repository.js';
import { AppError, notFound } from '../../errors/app-error.js';
import { authenticate, authOf, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { revokeAllSessions } from '../auth/auth.service.js';
import { UserModel, toUserDto } from './user.model.js';

const idParams = z.object({ id: objectIdSchema });

export function usersRouter(): Router {
  const router = Router();
  router.use(authenticate);

  /** Everyone in the tenant can see the team (agents need it to assign conversations). */
  router.get('/', async (req, res) => {
    const users = new TenantRepository(UserModel, authOf(req).tenantId);
    const list = await users.find().sort({ createdAt: 1 });
    res.json({ items: list.map(toUserDto) });
  });

  /** Change someone's role or disable them. OWNER only. */
  router.patch(
    '/:id',
    requireRole('OWNER'),
    validate({ params: idParams, body: updateUserSchema }),
    async (req, res) => {
      const auth = authOf(req);
      const { id } = req.valid.params as { id: string };
      const changes = req.valid.body as UpdateUserInput;
      const users = new TenantRepository(UserModel, auth.tenantId);

      const target = await users.findById(id);
      if (!target) throw notFound('User'); // includes "exists, but in another tenant"

      // Never leave a tenant without an active owner (that would lock everyone out of settings).
      const losesOwnership =
        target.role === 'OWNER' &&
        target.status === 'active' &&
        ((changes.role && changes.role !== 'OWNER') || changes.status === 'disabled');
      if (losesOwnership) {
        const activeOwners = await users.count({ role: 'OWNER', status: 'active' });
        if (activeOwners <= 1) {
          throw new AppError(409, 'LAST_OWNER', 'A workspace needs at least one active owner');
        }
      }

      const updated = await users.updateById(id, { $set: changes });
      if (!updated) throw notFound('User');

      if (changes.status === 'disabled') await revokeAllSessions(auth.tenantId, id);
      res.json(toUserDto(updated));
    },
  );

  return router;
}
