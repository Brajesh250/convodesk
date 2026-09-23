import { z } from 'zod';

/** A 24-char hex MongoDB ObjectId, as it travels over JSON. */
export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
export type ObjectIdString = z.infer<typeof objectIdSchema>;

/** Standard cursor-less pagination used by list endpoints. */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
}

/**
 * Every error response from the API has this shape, so the Angular client
 * can show a consistent message without guessing.
 */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string().optional(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
