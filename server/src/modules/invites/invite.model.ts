import mongoose, { Schema, type HydratedDocument } from 'mongoose';
import { ROLES, type InviteDto, type Role } from '@convodesk/shared';
import { tenantScopedPlugin } from '../../db/tenant-scope.js';

/**
 * Invite links replace an email service (none on the free tier): the owner copies the link
 * and sends it however they like. Like refresh tokens, only a hash of the token is stored.
 */
export interface Invite {
  tenantId: mongoose.Types.ObjectId;
  tokenHash: string;
  role: Role;
  /** If set, only this email can accept. */
  email: string | null;
  createdBy: mongoose.Types.ObjectId;
  expiresAt: Date;
  usedAt: Date | null;
  usedBy: mongoose.Types.ObjectId | null;
  revokedAt: Date | null;
  createdAt: Date;
}

const inviteSchema = new Schema<Invite>(
  {
    tokenHash: { type: String, required: true, unique: true },
    role: { type: String, enum: ROLES, required: true },
    email: { type: String, default: null, lowercase: true, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // Expired invites are purged a day later (the grace day lets us show "expired" instead of "invalid").
    expiresAt: { type: Date, required: true, expires: 60 * 60 * 24 },
    usedAt: { type: Date, default: null },
    usedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

inviteSchema.plugin(tenantScopedPlugin);
inviteSchema.index({ tenantId: 1, createdAt: -1 });

export const InviteModel = mongoose.model<Invite>('Invite', inviteSchema);

export function toInviteDto(i: HydratedDocument<Invite>, url?: string): InviteDto {
  return {
    id: i.id as string,
    role: i.role,
    email: i.email,
    expiresAt: i.expiresAt.toISOString(),
    usedAt: i.usedAt ? i.usedAt.toISOString() : null,
    createdAt: i.createdAt.toISOString(),
    ...(url ? { url } : {}),
  };
}
