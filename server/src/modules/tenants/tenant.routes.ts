import { Router } from 'express';
import { updateTenantSchema, type UpdateTenantInput } from '@convodesk/shared';
import { notFound } from '../../errors/app-error.js';
import { authenticate, authOf, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { TenantModel, toTenantDto } from './tenant.model.js';

/**
 * /api/tenant (singular): "my workspace". There is deliberately no /api/tenants/:id —
 * the tenant is always the one in the caller's token, so there's no id to tamper with.
 */
export function tenantRouter(): Router {
  const router = Router();
  router.use(authenticate);

  router.get('/', async (req, res) => {
    const tenant = await TenantModel.findById(authOf(req).tenantId);
    if (!tenant) throw notFound('Workspace');
    res.json(toTenantDto(tenant));
  });

  router.patch('/', requireRole('OWNER'), validate({ body: updateTenantSchema }), async (req, res) => {
    const changes = req.valid.body as UpdateTenantInput;
    const tenant = await TenantModel.findByIdAndUpdate(
      authOf(req).tenantId,
      { $set: changes },
      { returnDocument: 'after', runValidators: true },
    );
    if (!tenant) throw notFound('Workspace');
    res.json(toTenantDto(tenant));
  });

  return router;
}
