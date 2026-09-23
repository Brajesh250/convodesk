# Architecture Decision Records

Short ADRs: the context, what we decided, and what it costs us. New entries go at the bottom.
Status is one of: Accepted · Superseded · Proposed.

---

## ADR-001 — Monorepo with npm workspaces

**Status:** Accepted

**Context.** Four deployables (API, Angular app, widget) share types and validation rules. If the server
and the client each define "what a Message looks like", they drift and bugs appear at the boundary.

**Decision.** One repo with npm workspaces: `shared`, `server`, `client`, `widget`. `shared` holds
zod schemas and enums; TypeScript types are derived with `z.infer`, so one definition gives us runtime
validation on the server AND compile-time types everywhere.

**Consequences.** One `npm install`, one CI pipeline, atomic cross-package changes. `shared` must be
built before the others (done by a root `postinstall`). No Nx/Turborepo — not needed at this size and
one less tool to explain.

---

## ADR-002 — zod as the single source of truth for input validation

**Status:** Accepted

**Context.** Every route needs validation; Mongoose schemas validate too late (after we've built a query).

**Decision.** A `validate({ body, query, params })` middleware parses with zod and stores results on
`req.valid`. Handlers never read raw `req.body`. Unknown keys are stripped.

**Consequences.** Blocks NoSQL operator injection (`{"email": {"$gt": ""}}` fails a `z.email()`), gives
typed handler input, and the same schemas power Angular form validation. Mongoose validation remains as
a second line of defence.

---

## ADR-003 — Express 5 + a single central error handler

**Status:** Accepted

**Context.** Consistent error responses matter for the client and for debugging production.

**Decision.** Express 5 (forwards rejected promises to error middleware natively — no `asyncHandler`
wrappers). Code throws `AppError(status, code, message)`; one `errorHandler` maps AppError, ZodError,
Mongoose errors, duplicate keys and bad JSON to `{ error: { code, message, requestId } }`. Unknown
errors become 500 with internals hidden in production.

**Consequences.** Every error a user sees carries a `requestId` that matches a log line.

---

## ADR-004 — Node 24 LTS, TypeScript 6, Angular 22

**Status:** Accepted

**Context.** The brief said Node 20+, but Node 20 reached end-of-life in April 2026. Angular 22 requires
Node ≥ 22.22.3 and TypeScript 6.0.x (it does not support TypeScript 7 yet).

**Decision.** Pin Node 24 (active LTS) via `.nvmrc`, and TypeScript `~6.0` across all workspaces so
there's exactly one compiler version.

**Consequences.** We skip TypeScript 7's faster native compiler until Angular supports it.
