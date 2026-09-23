import mongoose, { Schema, type HydratedDocument } from 'mongoose';
import { ROLES, type Role, type UserDto } from '@convodesk/shared';
import { tenantScopedPlugin } from '../../db/tenant-scope.js';

export interface User {
  tenantId: mongoose.Types.ObjectId;
  email: string;
  /** Never selected by default — must be requested explicitly with .select('+passwordHash'). */
  passwordHash: string;
  name: string;
  role: Role;
  status: 'active' | 'disabled';
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<User>(
  {
    // Globally unique: an email belongs to exactly one tenant. Keeps login a single lookup
    // (no "pick your workspace" step). Trade-off recorded in ADR-007.
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    role: { type: String, enum: ROLES, required: true },
    status: { type: String, enum: ['active', 'disabled'], default: 'active' },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true },
);

userSchema.plugin(tenantScopedPlugin);
// Team list screen: users of a tenant, by role.
userSchema.index({ tenantId: 1, role: 1 });

export const UserModel = mongoose.model<User>('User', userSchema);

export function toUserDto(u: HydratedDocument<User>): UserDto {
  return {
    id: u.id as string,
    tenantId: u.tenantId.toString(),
    email: u.email,
    name: u.name,
    role: u.role,
    status: u.status,
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    createdAt: u.createdAt.toISOString(),
  };
}
