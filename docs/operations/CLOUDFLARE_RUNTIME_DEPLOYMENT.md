# Cloudflare Runtime & Deployment Contract

Patch: `P0-RUNTIME-013` · Issue: #129

This document records the Cloudflare deployment target decision and the
request-scoped runtime/D1 wiring contract for WorkUnit OS.

## 1. Selected target: Cloudflare Workers (OpenNext)

**Decision: Cloudflare Workers, built with `@opennextjs/cloudflare`. This is the
single deployment target. Cloudflare Pages configuration has been removed.**

### Why Pages configuration was removed

The repository already builds through OpenNext Cloudflare (`opennextjs-cloudflare
build`), which emits a **Worker** bundle (`.open-next/worker.js` + a static
assets directory), not a Pages `.next` output. The previous `wrangler.toml`
declared `pages_build_output_dir = ".next"` (a **Pages-only** directive) while
`cf:deploy` ran `wrangler deploy` (a **Workers** command). That mismatch made the
deploy fail with *"Missing entry-point to Worker script or to assets directory"*
and left operators believing the deploy path was ready when it was not
(Issue #129).

Mixing Pages and Workers directives is not supported. We align everything on the
artifact OpenNext actually generates: a Worker.

## 2. Generated Worker entrypoint and assets

`npm run cf:build` (`opennextjs-cloudflare build`) generates:

| Artifact | Path |
|----------|------|
| Worker entrypoint | `.open-next/worker.js` |
| Static assets      | `.open-next/assets/` |

`.open-next/` is git-ignored and must never be committed.

## 3. Committed config: `wrangler.json`

The single committed Cloudflare config is `wrangler.json` (strict JSON — no
ambiguous parsing). Key fields:

```jsonc
{
  "main": ".open-next/worker.js",
  "compatibility_date": "2025-03-25",
  "compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],
  "assets": { "directory": ".open-next/assets", "binding": "ASSETS" },
  "vars": {
    "EXTERNAL_ACTIONS_ENABLED": "false",
    "ALLOW_LEGACY_INGEST_FALLBACK": "false",
    "PERSISTENCE_MODE": "d1"
  },
  "d1_databases": [
    { "binding": "CONTROL_DB",        "database_id": "REPLACE_WITH_CONTROL_DB_ID" },
    { "binding": "TENANT_DB_DEFAULT", "database_id": "REPLACE_WITH_TENANT_DB_ID" }
  ]
}
```

- `nodejs_compat` + `global_fetch_strictly_public` are required by the installed
  OpenNext adapter (they mirror the adapter's official `wrangler.jsonc` template).
- D1 IDs are **placeholders** in the committed config. They are never real.
- The committed config is safe to publish: no account IDs, tokens, or real
  database IDs.

## 4. Safe deployment configuration (no committed secrets)

Real database IDs are supplied outside Git via environment variables and
assembled into an **untracked** config:

| Deploy env var | Injected into |
|----------------|---------------|
| `CLOUDFLARE_CONTROL_DB_ID`        | `CONTROL_DB.database_id` |
| `CLOUDFLARE_TENANT_DB_DEFAULT_ID` | `TENANT_DB_DEFAULT.database_id` |

`npm run cf:deploy:prepare` validates each ID (bounded, non-placeholder UUID) and
writes `wrangler.deploy.json` (0600, git-ignored via `/wrangler.deploy*.json`).
IDs are never printed; failures are category-level only. A failed preparation
deletes any stale generated config first, so a later deploy cannot silently reuse
one.

## 5. Deploy preflight

`scripts/cloudflare-deploy-preflight.mjs` is deterministic, does no network I/O,
and fails closed when any of the following hold:

- the target is not Workers/OpenNext (missing `main`, or a Pages-only directive);
- the Worker entrypoint / asset directory is absent after build (`--check-artifacts`);
- a required D1 binding (`CONTROL_DB`, `TENANT_DB_DEFAULT`) is missing or duplicated;
- a D1 database ID is empty, a placeholder (`REPLACE`/`PLACEHOLDER`/`TODO`/…), or malformed;
- `EXTERNAL_ACTIONS_ENABLED` is not exactly `"false"`, or a safe default is missing;
- a config carrying real IDs is not the approved git-ignored generated file;
- the config is unparseable/ambiguous.

It prints only safe field names and category-level failures — never a database ID.

## 6. Deploy commands

| Script | Behavior |
|--------|----------|
| `cf:build` | OpenNext Worker build → `.open-next/worker.js` |
| `cf:deploy:prepare` | Assemble untracked `wrangler.deploy.json` from deploy env vars |
| `cf:deploy:preflight` | Self-check the committed target + a synthetic deploy config |
| `cf:deploy:dry-run` | Synthetic config → `wrangler deploy --dry-run` (bundles, **no upload**) |
| `cf:deploy` | Orchestrator: prepare → preflight → build → verify artifacts → deploy |

`cf:deploy` performs the real upload only when `CF_DEPLOY_EXECUTE=1`; otherwise it
stops after artifact verification. The upload step can never run before prepare
and preflight succeed.

## 7. Request-scoped runtime environment

There is **no** `globalThis.__CLOUDFLARE_RUNTIME_ENV__` bridge and no mutable
module/process-global runtime env. Per request:

1. `.open-next/worker.js` installs the Cloudflare context for the request.
2. `getRequestRuntimeEnv()` reads it via `getCloudflareContext().env`
   (`@opennextjs/cloudflare`, request-scoped, synchronous inside handlers).
3. `validateCloudflareRuntimeEnv()` copies only an allowlisted set of bindings +
   vars into a **frozen** snapshot (`ValidatedCloudflareRuntimeEnv`).
4. `resolveRepositories({ runtimeEnv })` derives **both** the persistence mode and
   the D1 bindings from that single snapshot.

Guarantees:

- one request cannot observe another request's bindings (proven by
  `tests/cloudflareRuntimeContextIsolation.test.mts`);
- a missing/malformed context fails closed (`integration_missing` / 503);
- `process.env` cannot override the active request's persistence mode;
- production never returns in-memory repositories;
- test injection (`runWithTestRuntimeEnv`) is separate from production code and a
  genuine Cloudflare context always takes precedence over any test override;
- no raw runtime env or binding is returned to clients or written to logs.

## 8. Local development

- `npm run dev` — plain Next.js; no Cloudflare context. `getRequestRuntimeEnv()`
  returns `null`; persistence is in-memory (only when
  `ALLOW_IN_MEMORY_PERSISTENCE=true`) or `integration_missing`.
- `npm run cf:dev` — OpenNext build + `wrangler dev` (local Worker + local D1).
  Placeholder D1 IDs are fine locally (`wrangler dev --local` uses local SQLite).

## 9. Production deployment procedure

```bash
export CLOUDFLARE_CONTROL_DB_ID=<uuid>
export CLOUDFLARE_TENANT_DB_DEFAULT_ID=<uuid>
wrangler login
# migrations: see CLOUDFLARE_D1_SETUP.md
CF_DEPLOY_EXECUTE=1 npm run cf:deploy
```

A successful **dry-run alone does not imply production readiness** — see the
open-issue limitations below.

## 10. Rollback procedure

- Roll back the Worker to the previous version:
  `wrangler rollback` (or `wrangler deployments list` → `wrangler rollback <id>`).
- D1 is not rolled back by a Worker rollback; migrations are additive
  (`CREATE TABLE IF NOT EXISTS`). Restore data from a D1 backup if required.
- Remove any generated `wrangler.deploy.json` after an aborted deploy.

## 11. Security boundaries (unchanged by this patch)

`EXTERNAL_ACTIONS_ENABLED` stays `"false"` in every committed config. Runtime
Authorization remains authorization-only with a default-deny Evidence Resolver;
no external provider execution, `ExecutionResult`, Formal WorkUnit promotion, or
P7.1 MAC wiring is introduced.

## 12. Remaining dependencies

- **Issue #130** still owns the tenant DB resolver and per-tenant repository
  isolation (control-DB tenant registry lookup, per-tenant DB resolution,
  shared-vs-per-tenant architecture, in-memory/D1 tenant-isolation parity). This
  patch preserves the current `TENANT_DB_DEFAULT` behavior and only ensures the
  request-scoped binding is genuine and validated.
- **Issue #155** still owns the broader reproducible production
  persistence/migration proof. This patch does not claim production readiness
  from a passing dry-run.
