import { z } from 'zod';

/**
 * All configuration comes from environment variables and is validated ONCE at boot.
 * If something is missing or malformed the process refuses to start with a clear
 * message — much better than a confusing crash on the first request in production.
 *
 * New variables are added here phase by phase, and mirrored in /.env.example.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  MONGODB_URI: z
    .string()
    .regex(/^mongodb(\+srv)?:\/\//, 'MONGODB_URI must start with mongodb:// or mongodb+srv://'),

  /** Comma-separated list of browser origins allowed to call the API (the Angular app). */
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:4200')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),

  /** Public URL of the Angular app — used to build invite links. */
  APP_URL: z.url().default('http://localhost:4200'),

  // ── Auth ──
  /** HMAC secret for access-token JWTs. Generate with: openssl rand -base64 48 */
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900), // 15 min
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(60).default(14),
  /** bcrypt cost factor. 10 ≈ 100 ms on a normal core; Render's free CPU is slower, so don't go higher. */
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(14).default(10),
  /**
   * `lax` works because the SPA reaches the API through Vercel's /api proxy (same site — ADR-005).
   * Use `none` (+ secure) only if the browser talks to Render directly from another site.
   */
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  /** Defaults to true in production. Browsers reject SameSite=None cookies that aren't Secure. */
  COOKIE_SECURE: z.stringbool().optional(),

  RATE_LIMIT_ENABLED: z.stringbool().default(true),

  /** Render injects the deployed commit SHA automatically; shown on /health. */
  RENDER_GIT_COMMIT: z.string().optional(),
});

type RawEnv = z.infer<typeof envSchema>;
export type Env = Omit<RawEnv, 'COOKIE_SECURE'> & { COOKIE_SECURE: boolean };

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const parsed = parseRaw(source);
  const cookieSecure = parsed.COOKIE_SECURE ?? parsed.NODE_ENV === 'production';
  if (parsed.COOKIE_SAMESITE === 'none' && !cookieSecure) {
    throw new Error(
      'Invalid environment configuration:\n  - COOKIE_SAMESITE=none requires COOKIE_SECURE=true',
    );
  }
  return { ...parsed, COOKIE_SECURE: cookieSecure };
}

function parseRaw(source: NodeJS.ProcessEnv): RawEnv {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid environment configuration:\n${problems.join('\n')}`);
  }
  return result.data;
}

let cached: Env | undefined;

/** Lazily parsed, process-wide config. Tests can call parseEnv() directly instead. */
export function env(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

export function appVersion(): string {
  return env().RENDER_GIT_COMMIT?.slice(0, 7) ?? '0.1.0-dev';
}
