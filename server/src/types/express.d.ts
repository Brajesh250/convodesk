// Augments Express's Request with the fields our middleware attaches.
import 'express-serve-static-core';

declare module 'express-serve-static-core' {
  interface Request {
    /** Set by the `validate()` middleware — the zod-parsed request parts. */
    valid: {
      body: unknown;
      query: unknown;
      params: unknown;
    };
  }
}

export {};
