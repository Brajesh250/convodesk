import type { RequestHandler } from 'express';
import type { z } from 'zod';

/**
 * Route-level validation with zod. Every route declares what it accepts:
 *
 *   router.post('/tickets', validate({ body: createTicketSchema }), handler)
 *
 * Parsed (typed, defaulted, coerced) values are stored on `req.valid`, because in
 * Express 5 `req.query` is a read-only getter. Handlers read from `req.valid`, never
 * from raw `req.body`, so unvalidated input cannot reach a Mongo query.
 * A ZodError is thrown to the central error handler → 400 VALIDATION_ERROR.
 */
interface Schemas {
  body?: z.ZodType;
  query?: z.ZodType;
  params?: z.ZodType;
}

export function validate(schemas: Schemas): RequestHandler {
  return (req, _res, next) => {
    req.valid = {
      body: schemas.body ? schemas.body.parse(req.body) : undefined,
      query: schemas.query ? schemas.query.parse(req.query) : undefined,
      params: schemas.params ? schemas.params.parse(req.params) : undefined,
    };
    next();
  };
}
