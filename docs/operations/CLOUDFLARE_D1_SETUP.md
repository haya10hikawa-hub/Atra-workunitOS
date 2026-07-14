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
