# Cloudflare D1 Setup Guide

## 1. Overview

WorkUnit OS uses Cloudflare D1 for production persistence. This document covers
how to set up local and production D1 databases, run migrations, and configure
the required bindings.

> **Deployment target:** Cloudflare **Workers** via OpenNext (single target — no
> Pages). See [CLOUDFLARE_RUNTIME_DEPLOYMENT.md](CLOUDFLARE_RUNTIME_DEPLOYMENT.md)
> for the runtime/deploy contract. The committed config is `wrangler.json`; it
> holds **placeholder** D1 IDs only. Real IDs are supplied at deploy time via
> environment variables and written to an untracked, git-ignored
> `wrangler.deploy.json`.

## 2. Prerequisites

- Cloudflare account with Workers enabled
- Wrangler CLI installed (or `npx wrangler`)
- Authenticated: `wrangler login`
- Next.js >= 16.2.6 (project: 16.2.9)
- @opennextjs/cloudflare 1.19.11 installed

## 3. Local Development

### Create local D1 databases

```bash
wrangler d1 create workunit-control-db
wrangler d1 create workunit-tenant
```

Copy the database IDs from the output — but do **not** paste them into
`wrangler.json`. The committed config keeps `REPLACE_WITH_*` placeholders; local
`wrangler dev --local` uses a local SQLite for each binding and ignores the
remote `database_id`, so placeholders are fine for local development.

### Run migrations locally

```bash
wrangler d1 execute CONTROL_DB --local --file=migrations/0001_control_db.sql
wrangler d1 execute TENANT_DB_DEFAULT --local --file=migrations/0002_tenant_core.sql
```

### Start dev server

```bash
PERSISTENCE_MODE=d1 npm run dev
```

## 4. Production Deployment

### Create production databases

```bash
wrangler d1 create workunit-control-db
wrangler d1 create workunit-tenant
```

Supply the production database IDs at deploy time via environment variables
(never commit them):

```bash
export CLOUDFLARE_CONTROL_DB_ID=<control-db-uuid>
export CLOUDFLARE_TENANT_DB_DEFAULT_ID=<tenant-db-uuid>
```

`npm run cf:deploy` assembles these into an untracked `wrangler.deploy.json` and
validates them via the deploy preflight before any upload.

### Run migrations on production

```bash
wrangler d1 execute CONTROL_DB --env production --file=migrations/0001_control_db.sql
wrangler d1 execute TENANT_DB_DEFAULT --env production --file=migrations/0002_tenant_core.sql
```

### Set environment variables

```bash
wrangler secret put DEEPSEEK_API_KEY
# Enter API key at prompt

# Production flags in wrangler.json "vars":
# EXTERNAL_ACTIONS_ENABLED = "false" (enable only after auth + RBAC)
# ALLOW_LEGACY_INGEST_FALLBACK = "false"
# PERSISTENCE_MODE = "d1"
```

## 5. Required Bindings

| Binding | Purpose | Table |
|---------|---------|-------|
| `CONTROL_DB` | Tenant registry, user registry, DB routing | `tenants`, `tenant_databases` |
| `TENANT_DB_DEFAULT` | WorkUnit data per-tenant | `action_previews`, `approval_records` |

Future: additional tenant databases for multi-tenant isolation.

## 6. Migration Files

| File | Contents |
|------|----------|
| `migrations/0001_control_db.sql` | Control DB: tenants, tenant_databases |
| `migrations/0002_tenant_core.sql` | Preview and approval tables, indexes |

Future migrations should be additive. Use `CREATE TABLE IF NOT EXISTS`
for idempotency. Never drop tables without backup.

## 7. Production Safety Checklist

Before enabling `EXTERNAL_ACTIONS_ENABLED=true` in production:

- [ ] Real authentication configured (OAuth/OIDC)
- [ ] D1 databases created and migrations run
- [ ] Wrangler secrets set (DEEPSEEK_API_KEY)
- [ ] RBAC enforced on all API endpoints
- [ ] In-memory flags ALL set to false
- [ ] Audit logging wired to D1
- [ ] Rate limiting configured

## 9. Runtime Env Wiring

The OpenNext Cloudflare worker provides the Cloudflare runtime env (D1 bindings +
vars) to the application on a **per-request** basis. There is no mutable global
runtime-env bridge.

### Request-scoped chain

```
Cloudflare Workers request
  → .open-next/worker.js installs the per-request Cloudflare context
  → getRequestRuntimeEnv()  [app/lib/runtime/cloudflareRuntimeEnv.ts]
      → getCloudflareContext().env   (@opennextjs/cloudflare, request-scoped)
  → validateCloudflareRuntimeEnv()   [app/lib/runtime/validatedRuntimeEnv.ts]
      → frozen, allowlisted snapshot (D1 bindings + PERSISTENCE_MODE + flags)
  → resolveRouteRepositories() / resolveRepositories({ runtimeEnv })
  → D1 repositories (mode + bindings from the SAME validated snapshot)
```

One request can never observe another request's bindings; a missing/malformed
context fails closed (`integration_missing` / 503). `process.env` can never
override the active request's persistence mode.

## 9a. Tenant DB resolution & isolation (P0-PERSIST-014, Issue #130)

### Architecture: explicit SHARED tenant D1

The current production architecture uses **one shared physical tenant D1**:

```
CONTROL_DB
  → validate ACTIVE tenant (tenants.status = 'active')
  → validate ACTIVE registry row (tenant_databases.status = 'active')
  → return the static TENANT_DB_DEFAULT binding   (NEVER the control DB)
  → repositories scoped by ctx.tenantId (row-level, mandatory)
```

- `CONTROL_DB` is the global tenant / user / membership / database registry.
- `TENANT_DB_DEFAULT` is the single statically bound physical tenant-data D1.
- **Multiple tenants currently share `TENANT_DB_DEFAULT`.** Isolation is
  **row-level and mandatory**: every repository operation derives the tenant from
  `TenantDbContext.tenantId` (never a caller-supplied `row.tenantId`) and applies a
  `tenant_id` predicate on every read, list, and update.
- The control database is **never** returned or used as the tenant-data database.
- `tenant_databases.database_id` is **operational metadata only** in this phase. It
  is **not** dynamically converted into a Worker binding, and a database ID string
  is never treated as a `D1Database` object. There is no D1 REST lookup and no
  network fetch of a database.
- Physical per-tenant D1 routing is **deferred** (Issue #155).

### Structural production / local authority (Blocker 1)

Production and local repository resolution are separated **structurally**, not by
comment or call convention:

- `resolveProductionRepositories({ persistence, resolver })` — the `resolver`
  parameter is **required** at the type level, so a production D1 bundle cannot
  compile or succeed without registry validation. It accepts **no** `d1Binding`;
  `ctx.db` is authoritative.
- `resolveLocalRepositories({ persistence, allowDirectBinding: true, … })` — the
  only explicitly named API permitting a direct binding. Authority is never
  inferred from an omitted resolver.

`resolveRouteRepositories` chooses the authority from the frozen `runtime.source`:
Cloudflare → production (mandatory resolver, built from the same snapshot, never
`process.env`); local → the named local API. The presence of `CONTROL_DB` /
`TENANT_DB_DEFAULT` alone can never create a direct production bundle.

**Legacy `runtimeEnv` direct path CLOSED.** The legacy public `resolveRepositories()`
no longer converts a validated Cloudflare runtime env directly into a bundle: a
validated Cloudflare D1 `runtimeEnv` now REQUIRES a resolver and routes through
`resolveProductionRepositories` (registry validation mandatory). Without a
resolver it fails closed — no direct `TENANT_DB_DEFAULT` bundle and no `d1Binding`
override. An architecture guard fails if the `runtimeEnv` branch ever calls
`d1Bundle(...)` directly or passes `validated.env.TENANT_DB_DEFAULT` to `d1Bundle`
without a preceding resolver.

**Legacy `env` / `process.env` seam is LOCAL/TEST ONLY (Node production fails
closed).** In `resolveRepositories()`, a `config.isProduction` fail-closed check
runs **before** any mode dispatch, so a Node production config
(`NODE_ENV=production`) can **never** reach `resolveLocalRepositories`, consume
`options.d1Binding`, or infer authority from a supplied/omitted resolver — it
returns `d1_not_configured` (D1) or `persistence_disabled` (otherwise). A supplied
resolver does **not** promote the legacy env seam to production authority.
**Every production-capable repository path requires registry validation.** Node
production that needs D1 must use the explicit production API —
`resolveProductionRepositories(tenantId, { persistence, resolver })` (or
`resolveRepositoriesForAuthority(tenantId, { kind: "cloudflare_production", … })`)
with a request-scoped persistence projection and tenant resolver. **No production
path can infer local authority.** Architecture guards fail if the production
fail-closed check does not precede the switch, if a production config can consume
`d1Binding`, if the legacy env block calls `d1Bundle` directly, or if any non-test
app file other than `routeRepositories.ts` imports `resolveLocalRepositories`.

### Tenant-local parent relationships (global IDs, tenant-scoped edges)

Object IDs are **globally unique** across the shared tenant D1, but a tenant-scoped
child may reference ONLY parents owned by the same `ctx.tenantId`. Enforcement lives
at the persistence-SERVICE boundary (the repository bundle every route consumes),
for BOTH the D1 and in-memory implementations — **not** only in API routes:

- **Action Preview create** verifies the referenced WorkUnit is owned by the tenant.
- **Approval create** verifies the Preview and WorkUnit are owned by the tenant, that
  the Preview's stored `work_unit_id` matches the supplied WorkUnit id, and that the
  Preview's action type / target hash / payload hash match the approval input (a
  substituted Preview↔WorkUnit relationship fails closed). The final runtime
  exact-binding claim is unchanged.
- **WorkUnit Feedback create** verifies the referenced WorkUnit is owned by the tenant.

A violation fails closed with ONE opaque `parent_boundary_violation`
(`D1RepositoryError`). A **foreign-tenant parent and a missing parent are
indistinguishable** — the error discloses neither whether the parent exists, which
tenant owns it, the parent row, its title/payload, raw SQL, nor any binding.

### Mandatory full-record registry validation (Blocker 3)

The resolver validates the **complete** `tenant_databases` record, not just status:

- `tenant_id` must equal the requested tenant;
- `database_name` — non-empty, bounded string;
- `database_id` — non-empty, bounded, UUID-shaped D1 id;
- `schema_version` — non-empty, bounded, supported form;
- `status` must be exactly `active`.

A malformed/incomplete record maps to `database_invalid`. Typed, client-safe
failure reasons (no tenantId / database id / name / schema / SQL / binding leaks)
map to safe HTTP errors:

| Resolver reason | Route response |
|-----------------|----------------|
| `tenant_not_found`, `tenant_inactive` | `403 forbidden` (does not disclose whether another tenant exists) |
| `database_not_found`, `database_inactive`, `database_invalid`, `resolution_failed` | `503 integration_missing` |

### Explicit local-development fallback authority (Blocker 2)

A persistence failure returns generated / empty / default data **only** in
explicit, non-production local development, decided by one central helper —
`canUseLocalPersistenceFallback(runtime)` — used by the Inbox, Audit Recent, and
Integration Status routes. It requires **all** of: `source === "local"`,
`auth.isProduction === false`, the dev auth adapter, an explicit dev capability
(`allowDevSession`), and no active Cloudflare context. **Both** Cloudflare
production **and** Node production (`source: "local"` with `auth.isProduction`)
return safe `503`s — no route decides from `runtime.source` alone, and no route
reads `process.env.NODE_ENV`. No new `ALLOW_*` capability is introduced; any such
flag is rejected in Cloudflare production by the request runtime validator.

### Shared-D1 global object-ID namespace (Blocker 4)

The current schema uses **global** single-column `id … PRIMARY KEY` columns while
multiple tenants share one physical D1. Under this schema:

- persisted object IDs are **globally unique** across all tenants in the shared D1;
- tenant isolation is enforced by `tenant_id` predicates **in addition to** global
  uniqueness;
- IDs entering active-route writes are server-generated / server-authoritative;
- a cross-tenant global-ID collision **fails closed** with a typed repository
  failure — it never overwrites, updates, reveals, or deletes the existing
  tenant's row, and never discloses which tenant owns the ID.

**Precise constraint classification.** Only a genuine UNIQUE / PRIMARY KEY
collision maps to `object_id_conflict`. FOREIGN KEY, CHECK, NOT NULL, and unknown
driver errors map to the generic `write_failed`; the bare "constraint failed"
phrase is never treated as a global-ID collision. No typed error carries the raw
driver message, table/column names, SQL, tenant id, or row content.

**FakeD1 limitation.** `FakeD1Database` is a Map-per-table simulation that does
**not** enforce PRIMARY KEY / UNIQUE constraints (a duplicate id silently
overwrites). It therefore **cannot** be used to make any claim about primary-key
behavior. The global-ID contract above is proven only by a **real** SQLite-backed
test (`tests/tenantSharedD1SchemaContract.test.mts`, via `node:sqlite`) that loads
the committed migration schema and exercises the actual constraint. The in-memory
dev store keys by the composite `(tenantId, id)` and thus **diverges** from the
shared-D1 global namespace — this divergence is intentional, dev-only, and never
used in production.

> **Issue #155** still owns the schema rebuild, migration ordering, idempotence,
> seeding, and operational production execution proof. It remains **out of scope**
> for remote migration execution in this PR. Successful FakeD1 tests are **not** a
> production-readiness claim, and the parity matrix does **not** prove primary-key
> behavior.

### Local Dev

When running locally (`npm run dev`), no Cloudflare runtime exists.
`getRequestRuntimeEnv()` returns `null`. The repository resolver
falls back to in-memory (if `ALLOW_IN_MEMORY_PERSISTENCE=true`)
or returns `integration_missing`.

### Required for Production

1. Install dependencies (already done):
   ```bash
   npm install
   ```
   Next.js 16.2.9, @opennextjs/cloudflare 1.19.11, wrangler ^4.99.0 are installed.

2. Create real D1 databases:
   ```bash
   wrangler d1 create workunit-control-db
   wrangler d1 create workunit-tenant
   ```
   Export the IDs as deploy env vars (never commit them):
   ```bash
   export CLOUDFLARE_CONTROL_DB_ID=<control-db-uuid>
   export CLOUDFLARE_TENANT_DB_DEFAULT_ID=<tenant-db-uuid>
   ```

3. Run migrations:
   ```bash
   wrangler d1 execute CONTROL_DB --file=migrations/0001_control_db.sql
   wrangler d1 execute TENANT_DB_DEFAULT --file=migrations/0002_tenant_core.sql
   ```

4. Set secrets:
   ```bash
   wrangler secret put DEEPSEEK_API_KEY
   ```

5. Deploy (assembles untracked config → preflight → build → verify → upload):
   ```bash
   CF_DEPLOY_EXECUTE=1 npm run cf:deploy
   ```

Local tests use `FakeD1Database` and do NOT require real D1.
Set `PERSISTENCE_MODE=d1` only for manual integration testing.

In-memory persistence (`ALLOW_IN_MEMORY_PERSISTENCE=true`) is sufficient
for all automated tests and local development.
