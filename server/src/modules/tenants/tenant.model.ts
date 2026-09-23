import mongoose, { Schema, type HydratedDocument } from 'mongoose';
import type { TenantDto } from '@convodesk/shared';

/**
 * A Tenant is one business using ConvoDesk. It is the ROOT of isolation, so it is the one
 * model that is NOT tenant-scoped — it is only ever loaded by the id in the caller's JWT.
 */
export interface Tenant {
  name: string;
  slug: string;
  /** Public key embedded in the widget <script> tag. Identifies the tenant; grants nothing else. */
  widgetKey: string;
  timezone: string;
  /** Websites allowed to load the widget (checked against the socket handshake Origin in Phase 5). */
  allowedOrigins: string[];
  limits: {
    /** Protects the shared free LLM quota from a single noisy tenant. */
    aiRepliesPerDay: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const tenantSchema = new Schema<Tenant>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, unique: true, lowercase: true },
    widgetKey: { type: String, required: true, unique: true },
    timezone: { type: String, required: true, default: 'Asia/Kolkata' },
    allowedOrigins: { type: [String], default: [] },
    limits: {
      aiRepliesPerDay: { type: Number, default: 200, min: 0 },
    },
  },
  { timestamps: true },
);

export const TenantModel = mongoose.model<Tenant>('Tenant', tenantSchema);

export function toTenantDto(t: HydratedDocument<Tenant>): TenantDto {
  return {
    id: t.id as string,
    name: t.name,
    slug: t.slug,
    widgetKey: t.widgetKey,
    timezone: t.timezone,
    allowedOrigins: t.allowedOrigins,
    createdAt: t.createdAt.toISOString(),
  };
}
