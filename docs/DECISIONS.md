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

---

## ADR-005 — Serve the API through Vercel's `/api` proxy (first-party refresh cookie)

**Status:** Accepted

**Context.** The SPA lives on `*.vercel.app` and the API on `*.onrender.com`. Both are on the Public
Suffix List, so they are different _sites_. A refresh cookie set by Render would be a third-party
cookie, which Safari blocks today and Chrome increasingly restricts, so login would silently break.

**Decision.** The Angular app calls `/api/*` on its own origin, and a Vercel rewrite forwards those
calls to Render. The browser sees the cookie as first-party, so it can be `SameSite=Lax`. Socket.IO
connects straight to Render (Vercel rewrites can't proxy WebSockets) and authenticates with the
short-lived access token in the handshake, so it needs no cookie. `COOKIE_SAMESITE=none` stays
available as a config switch for anyone who deploys without the proxy.

**Consequences.** Works in every browser with no custom domain (and no cost). REST calls take one
extra hop through Vercel's edge. CORS is then only needed for local dev and the socket.

---

## ADR-006 — Refresh endpoint requires an `X-Requested-With: convodesk` header

**Status:** Accepted

**Context.** `/api/auth/refresh` and `/api/auth/logout` authenticate with a cookie, which makes them
CSRF targets in principle.

**Decision.** Require a custom header. HTML forms can't send custom headers, and a cross-site
`fetch` that sets one triggers a CORS preflight that our origin allowlist rejects. Combined with
`SameSite=Lax` this closes CSRF without a token-synchronizer scheme.

**Consequences.** One constant is shared between client and server via `@convodesk/shared`.

---

## ADR-007 — Email is globally unique (one user belongs to one tenant)

**Status:** Accepted

**Context.** Multi-tenant apps either let an email join many workspaces (with a picker at login) or
tie an email to exactly one.

**Decision.** One email, one tenant. Login is a single lookup, and there's no "which workspace?"
step to build or explain.

**Consequences.** A consultant who works for two businesses needs two email addresses (e.g. plus-
addressing). Moving to many-to-many later means adding a `Membership` collection
`{userId, tenantId, role}` and putting the chosen tenant in the JWT.

---

## ADR-008 — Tenant isolation: shared collections + `tenantId`, enforced twice

**Status:** Accepted

**Context.** Options were database-per-tenant, collection-per-tenant, or shared collections with a
`tenantId` column. Atlas M0 allows a single 512 MB cluster and limits collections/connections, so the
per-tenant options don't fit, and they complicate every migration and aggregate report.

**Decision.** Shared collections, with every tenant-owned document carrying an indexed, immutable
`tenantId`. Isolation is enforced in two layers:

1. **TenantRepository** (normal path). It is built from `req.auth.tenantId`, which comes from the
   verified JWT and never from the body or URL. It merges the tenant filter _last_, so a caller can't
   widen it, and stamps `tenantId` on create.
2. **tenantScopedPlugin** (safety net). Mongoose query middleware throws `TenantScopeError` for any
   find/update/delete/count/distinct/aggregate on a tenant-owned model whose filter doesn't pin one
   tenant (`$exists`, `$ne` and `$in` are rejected). The few legitimately cross-tenant lookups (login
   by email, refresh token by hash, invite by token) opt out with `{ skipTenantGuard: true }`, which is
   easy to grep for in code review.

Another tenant's document always returns **404, never 403**, so ids don't leak existence.

**Consequences.** A single missed filter fails loudly in tests instead of leaking silently in
production. Compound indexes start with `tenantId`. The trade-off: a noisy tenant shares resources
with the others, which is mitigated by per-tenant limits (e.g. AI replies per day).

---

## ADR-009 — Short JWT access tokens + rotating opaque refresh tokens

**Status:** Accepted

**Decision.**

- **Access token:** a 15-minute HS256 JWT, kept only in memory. `jwt.verify` pins the algorithm,
  issuer and audience.
- **Refresh token:** 256 random bits in an httpOnly cookie scoped to `/api/auth`, stored as a SHA-256
  hash. Every use rotates it. Presenting an already-rotated token means replay, so the whole token
  family is revoked. A 10-second grace window turns a benign multi-tab race into `REFRESH_RACE`
  (the client retries) instead of a forced logout.
- `authenticate` re-reads the user on every request, so disabling someone or changing their role takes
  effect immediately rather than after the token expires.

**Consequences.** One indexed DB read per request (fine at this scale). Stolen refresh tokens have a
short, detectable lifetime. Logout is real: the token is revoked server-side.
