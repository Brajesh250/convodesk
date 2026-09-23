import mongoose from 'mongoose';
import { beforeEach, describe, expect, it } from 'vitest';
import { InviteModel, type Invite } from '../modules/invites/invite.model.js';
import { TenantRepository } from './tenant-repository.js';

/**
 * Layer 2: a repository bound to tenant A must behave as if tenant B's data does not exist.
 * Invite is used as a representative tenant-owned model.
 */
describe('TenantRepository isolation', () => {
  const tenantA = new mongoose.Types.ObjectId();
  const tenantB = new mongoose.Types.ObjectId();
  const creator = new mongoose.Types.ObjectId();
  let repoA: TenantRepository<Invite>;
  let repoB: TenantRepository<Invite>;
  let inviteB: mongoose.HydratedDocument<Invite>;

  const inviteData = (hash: string) => ({
    tokenHash: hash,
    role: 'AGENT' as const,
    createdBy: creator,
    expiresAt: new Date(Date.now() + 60_000),
  });

  beforeEach(async () => {
    repoA = new TenantRepository(InviteModel, tenantA);
    repoB = new TenantRepository(InviteModel, tenantB);
    await repoA.create(inviteData('a1'));
    await repoA.create(inviteData('a2'));
    inviteB = await repoB.create(inviteData('b1'));
  });

  it('find() only returns the bound tenant’s documents', async () => {
    const docs = await repoA.find();
    expect(docs).toHaveLength(2);
    expect(docs.every((d) => d.tenantId.equals(tenantA))).toBe(true);
  });

  it('a caller-supplied tenantId in the filter cannot widen the scope', async () => {
    const docs = await repoA.find({ tenantId: tenantB } as never);
    expect(docs.map((d) => d.tokenHash).sort()).toEqual(['a1', 'a2']);
  });

  it('findById / updateById / deleteById treat another tenant’s id as not found', async () => {
    expect(await repoA.findById(inviteB.id as string)).toBeNull();
    expect(await repoA.updateById(inviteB.id as string, { $set: { role: 'OWNER' } })).toBeNull();
    expect(await repoA.deleteById(inviteB.id as string)).toBe(false);

    const untouched = await repoB.findById(inviteB.id as string);
    expect(untouched?.role).toBe('AGENT');
  });

  it('create() stamps the bound tenant even if data claims another', async () => {
    const doc = await repoA.create({ ...inviteData('sneaky'), tenantId: tenantB } as never);
    expect(doc.tenantId.equals(tenantA)).toBe(true);
  });

  it('tenantId is immutable: an update cannot move a document to another tenant', async () => {
    const [doc] = await repoA.find({ tokenHash: 'a1' });
    await repoA.updateById(doc!.id as string, { $set: { tenantId: tenantB } } as never);
    expect((await repoA.findById(doc!.id as string))?.tenantId.equals(tenantA)).toBe(true);
  });

  it('count() and aggregate() are scoped', async () => {
    expect(await repoA.count()).toBe(2);
    const [row] = await repoB.aggregate<{ n: number }>([{ $count: 'n' }]);
    expect(row?.n).toBe(1);
  });

  it('malformed ids return null instead of throwing a CastError', async () => {
    expect(await repoA.findById('not-an-id')).toBeNull();
  });
});
