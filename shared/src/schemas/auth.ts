import { z } from 'zod';
import { ROLES } from '../constants.js';

/**
 * bcrypt only looks at the first 72 BYTES of a password; anything longer is silently ignored.
 * We cap the length instead of letting two different long passwords hash the same.
 */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .refine((value) => new TextEncoder().encode(value).length <= 72, 'Password is too long (max 72 bytes)');

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email address').max(254));

const personNameSchema = z.string().trim().min(1, 'Name is required').max(80);

export const signupSchema = z.object({
  businessName: z.string().trim().min(2, 'Business name is too short').max(80),
  name: personNameSchema,
  email: emailSchema,
  password: passwordSchema,
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  // Don't enforce the password policy on login: it only needs to be non-empty.
  password: z.string().min(1, 'Password is required').max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const acceptInviteSchema = z.object({
  token: z.string().min(20).max(200),
  name: personNameSchema,
  email: emailSchema,
  password: passwordSchema,
});
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

export const roleSchema = z.enum(ROLES);

export const createInviteSchema = z.object({
  role: roleSchema,
  /** Optional: lock the invite to one email address. */
  email: emailSchema.optional(),
  expiresInDays: z.number().int().min(1).max(30).default(7),
});
export type CreateInviteInput = z.infer<typeof createInviteSchema>;

export const updateUserSchema = z
  .object({
    role: roleSchema.optional(),
    status: z.enum(['active', 'disabled']).optional(),
  })
  .refine((v) => v.role !== undefined || v.status !== undefined, 'Nothing to update');
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const updateTenantSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    timezone: z.string().trim().min(1).max(64).optional(),
    allowedOrigins: z.array(z.url().max(200)).max(20).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;

// ── Response DTOs (what the API returns; the client codes against these) ──

export interface UserDto {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: (typeof ROLES)[number];
  status: 'active' | 'disabled';
  lastLoginAt: string | null;
  createdAt: string;
}

export interface TenantDto {
  id: string;
  name: string;
  slug: string;
  widgetKey: string;
  timezone: string;
  allowedOrigins: string[];
  createdAt: string;
}

export interface AuthResponse {
  accessToken: string;
  /** Seconds until the access token expires, so the client can refresh proactively. */
  expiresIn: number;
  user: UserDto;
  tenant: TenantDto;
}

export interface InviteDto {
  id: string;
  role: (typeof ROLES)[number];
  email: string | null;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
  /** Only present right after creation — the raw token is never stored, so it can't be shown again. */
  url?: string;
}

export interface InvitePreviewDto {
  tenantName: string;
  role: (typeof ROLES)[number];
  email: string | null;
  expiresAt: string;
}

/** Header the SPA must send on cookie-authenticated endpoints (refresh/logout) — see ADR-006. */
export const CSRF_HEADER = 'x-requested-with';
export const CSRF_HEADER_VALUE = 'convodesk';
