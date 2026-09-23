import mongoose, { type Schema } from 'mongoose';

/**
 * ─────────────────────────────  TENANT ISOLATION, LAYER 1 (safety net)  ─────────────────────────────
 *
 * `tenantScopedPlugin` is applied to every tenant-owned schema (User, Contact, Conversation, ...).
 * It does two things:
 *   1. Adds an indexed, required, immutable `tenantId` field.
 *   2. Installs query middleware that THROWS if any query runs without `tenantId` in its filter.
 *
 * So a developer who forgets the tenant filter gets a loud 500 in tests/dev instead of silently
 * leaking another tenant's data in production. Layer 2 (TenantRepository) is what routes actually use;
 * it always adds the filter, so this guard should never fire in correct code.
 *
 * A few legitimate lookups are cross-tenant by nature (login by email, refresh token by hash,
 * invite by token, WhatsApp webhook routing by phone id). Those opt out explicitly with
 * `{ skipTenantGuard: true }` in the query options — grep-able and easy to review.
 */

export class TenantScopeError extends Error {
  constructor(operation: string, modelName: string) {
    super(
      `Tenant isolation violation: ${modelName}.${operation}() ran without a tenantId filter. ` +
        'Use TenantRepository, or pass { skipTenantGuard: true } for an intentional cross-tenant lookup.',
    );
    this.name = 'TenantScopeError';
  }
}

const GUARDED_QUERY_OPS = [
  'countDocuments',
  'deleteMany',
  'deleteOne',
  'distinct',
  'find',
  'findOne',
  'findOneAndDelete',
  'findOneAndReplace',
  'findOneAndUpdate',
  'replaceOne',
  'updateMany',
  'updateOne',
] as const;

/** Anything a caller may put in the filter to scope by tenant: an id, or `{ $eq: id }`. */
function hasTenantFilter(filter: Record<string, unknown>): boolean {
  const value = filter['tenantId'];
  if (value === undefined || value === null) return false;
  if (typeof value === 'object' && !(value instanceof mongoose.Types.ObjectId)) {
    // Allow { $eq: id } but NOT { $exists: true } / { $ne: x } / { $in: [...] } — those don't scope to one tenant.
    const keys = Object.keys(value);
    return keys.length === 1 && keys[0] === '$eq';
  }
  return true;
}

export function tenantScopedPlugin(schema: Schema): void {
  schema.add({
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
      immutable: true, // a document can never be moved to another tenant
    },
  });

  for (const op of GUARDED_QUERY_OPS) {
    schema.pre(op, { document: false, query: true }, function (this: mongoose.Query<unknown, unknown>) {
      if (this.getOptions().skipTenantGuard === true) return;
      if (!hasTenantFilter(this.getFilter() as Record<string, unknown>)) {
        throw new TenantScopeError(op, this.model.modelName);
      }
    });
  }

  schema.pre('aggregate', function (this: mongoose.Aggregate<unknown>) {
    if (this.options.skipTenantGuard === true) return;
    const first = this.pipeline()[0] as { $match?: Record<string, unknown> } | undefined;
    if (!first?.$match || !hasTenantFilter(first.$match)) {
      throw new TenantScopeError('aggregate', this.model().modelName);
    }
  });
}

declare module 'mongoose' {
  interface QueryOptions {
    /** Opt out of the tenant guard for an intentional cross-tenant lookup. Use sparingly. */
    skipTenantGuard?: boolean;
  }
  interface AggregateOptions {
    skipTenantGuard?: boolean;
  }
}
