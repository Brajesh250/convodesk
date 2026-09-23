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

  /** Render injects the deployed commit SHA automatically; shown on /health. */
  RENDER_GIT_COMMIT: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: NodeJS.ProcessEnv): Env {
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
