import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  uptimeSeconds: z.number(),
  version: z.string(),
  db: z.enum(['connected', 'disconnected', 'connecting', 'disconnecting']),
  timestamp: z.string(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
