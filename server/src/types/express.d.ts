// Augments Express's Request with the fields our middleware attaches.
import 'express-serve-static-core';
import type { Role } from '@convodesk/shared';

declare module 'express-serve-static-core' {
  interface Request {
    /** Set by the `validate()` middleware — the zod-parsed request parts. */
    valid: {
      body: unknown;
      query: unknown;
      params: unknown;
    };
    /** Set by the `authenticate` middleware. Undefined on public routes. */
    auth?: {
      userId: string;
      tenantId: string;
      role: Role;
    };
  }
}

export {};
