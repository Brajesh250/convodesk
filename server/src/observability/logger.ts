import { pino } from 'pino';

/**
 * One structured JSON logger for the whole process.
 * - In development we pretty-print for humans.
 * - In production Render collects stdout, so plain JSON lines are what we want.
 * Secrets that might appear in request logs are redacted.
 */
const isDev = process.env.NODE_ENV === 'development';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.passwordHash',
      '*.token',
      '*.accessToken',
      '*.refreshToken',
    ],
    censor: '[redacted]',
  },
  ...(isDev ? { transport: { target: 'pino-pretty', options: { colorize: true, singleLine: true } } } : {}),
});

export type Logger = typeof logger;
