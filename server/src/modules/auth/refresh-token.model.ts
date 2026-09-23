import mongoose, { Schema } from 'mongoose';
import { tenantScopedPlugin } from '../../db/tenant-scope.js';

/**
 * One row per issued refresh token. We store only a SHA-256 HASH of the token, so a database
 * leak doesn't hand out live sessions.
 *
 * Tokens ROTATE: each use revokes the old token and issues a new one in the same `familyId`.
 * If a revoked token is presented again, someone replayed a stolen token → we revoke the whole
 * family (logging out attacker and victim alike). See auth.service.ts → refresh().
 */
export interface RefreshToken {
  tenantId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  revokedReason: 'rotated' | 'logout' | 'reuse_detected' | 'user_disabled' | null;
  userAgent: string | null;
  createdAt: Date;
}

const refreshTokenSchema = new Schema<RefreshToken>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tokenHash: { type: String, required: true, unique: true },
    familyId: { type: String, required: true, index: true },
    // TTL index: MongoDB deletes the row automatically once it expires — keeps Atlas M0 small.
    expiresAt: { type: Date, required: true, expires: 0 },
    revokedAt: { type: Date, default: null },
    revokedReason: { type: String, default: null },
    userAgent: { type: String, default: null, maxlength: 300 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

refreshTokenSchema.plugin(tenantScopedPlugin);
refreshTokenSchema.index({ tenantId: 1, userId: 1 });

export const RefreshTokenModel = mongoose.model<RefreshToken>('RefreshToken', refreshTokenSchema);
