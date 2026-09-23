import mongoose, {
  type HydratedDocument,
  type Model,
  type PipelineStage,
  type QueryFilter,
  type UpdateQuery,
} from 'mongoose';

/**
 * ─────────────────────────────  TENANT ISOLATION, LAYER 2 (the normal path)  ─────────────────────────────
 *
 * Every route that touches tenant data goes through a repository bound to ONE tenant:
 *
 *     const contacts = new TenantRepository(Contact, req.auth.tenantId);
 *     await contacts.findById(id);          // → { _id: id, tenantId } — never another tenant's doc
 *
 * The tenantId comes from the verified JWT (set by the `authenticate` middleware), never from the
 * request body or URL. Callers cannot widen the scope: the tenant filter is merged LAST, so even a
 * filter containing `tenantId: <other>` is overwritten.
 *
 * A document from another tenant simply "doesn't exist" → 404, which also avoids leaking that
 * the id is valid somewhere else.
 */
export class TenantRepository<T extends { tenantId: mongoose.Types.ObjectId }> {
  private readonly tenantId: mongoose.Types.ObjectId;

  constructor(
    private readonly model: Model<T>,
    tenantId: string | mongoose.Types.ObjectId,
  ) {
    this.tenantId = typeof tenantId === 'string' ? new mongoose.Types.ObjectId(tenantId) : tenantId;
  }

  /** Merge the caller's filter with the tenant filter. Tenant wins. */
  private scope(filter: QueryFilter<T> = {}): QueryFilter<T> {
    return { ...filter, tenantId: this.tenantId } as QueryFilter<T>;
  }

  private static isValidId(id: string): boolean {
    return mongoose.isValidObjectId(id);
  }

  find(filter: QueryFilter<T> = {}) {
    return this.model.find(this.scope(filter));
  }

  findOne(filter: QueryFilter<T>) {
    return this.model.findOne(this.scope(filter));
  }

  /** Returns null for malformed ids too, so callers answer 404 rather than 500. */
  async findById(id: string): Promise<HydratedDocument<T> | null> {
    if (!TenantRepository.isValidId(id)) return null;
    return this.model.findOne(this.scope({ _id: id } as QueryFilter<T>));
  }

  count(filter: QueryFilter<T> = {}) {
    return this.model.countDocuments(this.scope(filter));
  }

  /** tenantId is stamped server-side; a tenantId in `data` is ignored. */
  create(data: Omit<Partial<T>, 'tenantId'>): Promise<HydratedDocument<T>> {
    return this.model.create({ ...data, tenantId: this.tenantId } as unknown as T);
  }

  async updateById(id: string, update: UpdateQuery<T>): Promise<HydratedDocument<T> | null> {
    if (!TenantRepository.isValidId(id)) return null;
    return this.model.findOneAndUpdate(this.scope({ _id: id } as QueryFilter<T>), update, {
      returnDocument: 'after',
      runValidators: true,
    });
  }

  updateMany(filter: QueryFilter<T>, update: UpdateQuery<T>) {
    return this.model.updateMany(this.scope(filter), update, { runValidators: true });
  }

  async deleteById(id: string): Promise<boolean> {
    if (!TenantRepository.isValidId(id)) return false;
    const result = await this.model.deleteOne(this.scope({ _id: id } as QueryFilter<T>));
    return result.deletedCount === 1;
  }

  /** Aggregations always start with the tenant $match, so indexes on {tenantId, ...} are used. */
  aggregate<R = unknown>(pipeline: PipelineStage[]) {
    return this.model.aggregate<R>([{ $match: { tenantId: this.tenantId } }, ...pipeline]);
  }
}
