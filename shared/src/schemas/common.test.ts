import { describe, expect, it } from 'vitest';
import { objectIdSchema, paginationQuerySchema } from './common.js';

describe('objectIdSchema', () => {
  it('accepts a valid ObjectId', () => {
    expect(objectIdSchema.safeParse('64b7f0c2a1b2c3d4e5f60718').success).toBe(true);
  });
  it('rejects junk', () => {
    expect(objectIdSchema.safeParse('not-an-id').success).toBe(false);
  });
});

describe('paginationQuerySchema', () => {
  it('applies defaults and coerces strings from the query string', () => {
    expect(paginationQuerySchema.parse({ page: '2' })).toEqual({ page: 2, limit: 20 });
  });
  it('caps limit at 100', () => {
    expect(paginationQuerySchema.safeParse({ limit: '500' }).success).toBe(false);
  });
});
