import type { ErrorRequestHandler, RequestHandler } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import type { ApiError } from '@convodesk/shared';
import { AppError } from '../errors/app-error.js';

/** 404 for any route nobody matched. Mounted after all routers. */
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError(404, 'ROUTE_NOT_FOUND', `No route for ${req.method} ${req.path}`));
};

/**
 * The single place where errors become HTTP responses.
 * Known error types map to 4xx with a stable `code`; everything else is a 500 whose
 * internals are hidden from clients in production (but fully logged).
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const requestId = String(req.id ?? '');
  const { status, body } = toResponse(err, requestId);

  if (status >= 500) {
    req.log?.error({ err }, 'Unhandled error');
  }

  res.status(status).json(body);
};

function toResponse(err: unknown, requestId: string): { status: number; body: ApiError } {
  const make = (status: number, code: string, message: string, details?: unknown) => ({
    status,
    body: { error: { code, message, requestId, ...(details === undefined ? {} : { details }) } },
  });

  if (err instanceof AppError) {
    return make(err.status, err.code, err.message, err.details);
  }
  if (err instanceof ZodError) {
    return make(400, 'VALIDATION_ERROR', 'Request validation failed', err.issues);
  }
  if (err instanceof mongoose.Error.ValidationError) {
    return make(400, 'VALIDATION_ERROR', err.message);
  }
  if (err instanceof mongoose.Error.CastError) {
    return make(400, 'INVALID_ID', `Invalid value for ${err.path}`);
  }
  if (isDuplicateKeyError(err)) {
    return make(409, 'DUPLICATE', 'A record with the same unique value already exists');
  }
  // express.json() throws this for malformed JSON bodies / oversized payloads.
  if (isBodyParserError(err)) {
    return make(err.status, err.status === 413 ? 'PAYLOAD_TOO_LARGE' : 'INVALID_JSON', err.message);
  }

  const isProd = process.env.NODE_ENV === 'production';
  const message = !isProd && err instanceof Error ? err.message : 'Something went wrong on our side';
  return make(500, 'INTERNAL_ERROR', message);
}

function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === 11000
  );
}

/** body-parser errors carry a `type` (e.g. 'entity.parse.failed') and a 4xx `status`. */
function isBodyParserError(err: unknown): err is { status: number; message: string } {
  if (typeof err !== 'object' || err === null || !('type' in err) || !('status' in err)) return false;
  const { status } = err as { status: unknown };
  return typeof status === 'number' && status < 500;
}
