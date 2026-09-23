import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { InviteModel } from '../modules/invites/invite.model.js';
import { UserModel } from '../modules/users/user.model.js';
import { TenantScopeError } from './tenant-scope.js';

/**
 * Layer 1: the guard must make it IMPOSSIBLE to accidentally run an unscoped query
 * against a tenant-owned collection.
 */
describe('tenantScopedPlugin guard', () => {
  const tenantId = new mongoose.Types.ObjectId();

  it.each([
    ['find', () => UserModel.find({ role: 'OWNER' })],
    ['findOne', () => UserModel.findOne({ email: 'a@b.co' })],
    ['findById', () => UserModel.findById(new mongoose.Types.ObjectId())],
    ['countDocuments', () => UserModel.countDocuments({})],
    ['updateOne', () => UserModel.updateOne({}, { name: 'x' })],
    ['updateMany', () => UserModel.updateMany({}, { name: 'x' })],
    ['findOneAndUpdate', () => UserModel.findOneAndUpdate({}, { name: 'x' })],
    ['deleteOne', () => UserModel.deleteOne({})],
    ['deleteMany', () => InviteModel.deleteMany({})],
    ['distinct', () => UserModel.distinct('email')],
  ])('%s without tenantId throws TenantScopeError', async (_name, run) => {
    await expect(run()).rejects.toBeInstanceOf(TenantScopeError);
  });

  it('rejects filters that match MANY tenants ($exists / $ne / $in)', async () => {
    await expect(UserModel.find({ tenantId: { $exists: true } })).rejects.toBeInstanceOf(TenantScopeError);
    await expect(UserModel.find({ tenantId: { $ne: tenantId } })).rejects.toBeInstanceOf(TenantScopeError);
    await expect(UserModel.find({ tenantId: { $in: [tenantId] } })).rejects.toBeInstanceOf(TenantScopeError);
  });

  it('allows queries scoped to one tenant (plain id or $eq)', async () => {
    await expect(UserModel.find({ tenantId })).resolves.toEqual([]);
    await expect(UserModel.find({ tenantId: { $eq: tenantId } })).resolves.toEqual([]);
  });

  it('guards aggregations that do not START with a tenant $match', async () => {
    await expect(UserModel.aggregate([{ $match: { role: 'OWNER' } }])).rejects.toBeInstanceOf(
      TenantScopeError,
    );
    await expect(UserModel.aggregate([{ $match: { tenantId } }, { $count: 'n' }])).resolves.toEqual([]);
  });

  it('allows an explicit, grep-able opt-out for intentional cross-tenant lookups', async () => {
    await expect(
      UserModel.findOne({ email: 'nobody@example.com' }).setOptions({ skipTenantGuard: true }),
    ).resolves.toBeNull();
  });

  it('refuses to save a tenant-owned document without a tenantId', async () => {
    await expect(
      UserModel.create({ email: 'x@y.co', name: 'X', role: 'AGENT', passwordHash: 'h' }),
    ).rejects.toThrow(/tenantId/);
  });
});
