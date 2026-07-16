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

## 7. Request-scoped runtime configuration (auth / security / llm / persistence)

There is **no** `globalThis.__CLOUDFLARE_RUNTIME_ENV__` bridge, no
`setRequestRuntimeEnvInProd`, and no mutable module/process-global runtime env or
config. The raw Cloudflare env is read **once per request** and projected into one
authoritative, frozen configuration. Per request:

1. `.open-next/worker.js` installs the Cloudflare context for the request.
2. `getRequestRuntimeEnv()` (`app/lib/runtime/cloudflareRuntimeEnv.ts`) reads it via
   `getCloudflareContext().env` (`@opennextjs/cloudflare`, request-scoped, sync in
   handlers). It is **pure**: no state, no setters, no process/global fallback.
3. `resolveValidatedRequestRuntimeConfig()`
   (`app/lib/runtime/requestRuntimeConfig.ts`) validates + copies only allowlisted
   fields into a frozen `ValidatedRequestRuntimeConfig` with narrow capability
   projections:
   - `persistence` — `PERSISTENCE_MODE` + `CONTROL_DB` / `TENANT_DB_DEFAULT`;
   - `auth` — adapter (`none` | `jwt`; `dev` is impossible in production) + injected
     JWT `{ secret, issuer, audience }`;
   - `security` — kill switch (`externalActionsEnabled`), legacy fallback, and all
     `allowDev*` flags (forced `false` in production; `"true"` is rejected);
   - `llm` — provider / api key / mock / legacy-fallback.
4. Each API route resolves the config **once** and threads the projections into
   `requireSession(request, runtime)` (auth + control DB), repository resolution
   (`runtime.persistence`), the kill switch (`projectRuntimeAuthorizationEnv`), the
   Runtime Authorization gate (`env:` projection), and LLM resolution
   (`projectLlmEnv`).

Guarantees (proven by `tests/requestRuntimeConfig.test.mts`,
`tests/cloudflareRuntimeContextIsolation.test.mts`,
`tests/cloudflareRuntimeEnvArchitecture.test.mts`):

- one request cannot observe another request's bindings, auth, security, or LLM config;
- a missing/malformed context or config fails closed (`integration_missing` / 503,
  or an unauthorized session);
- `process.env` can never override the active Cloudflare request's config;
- **a genuine OpenNext Cloudflare context ALWAYS outranks test injection** — the
  resolver checks the genuine context first; the injector is only ever entered by a
  test and is consulted only when no genuine context exists;
- **every production development/fallback capability is rejected fail-closed** —
  `ALLOW_LEGACY_INGEST_FALLBACK`, `ALLOW_MOCK_LLM`, `ALLOW_IN_MEMORY_PERSISTENCE`,
  `ALLOW_IN_MEMORY_APPROVAL_STORE`, `ALLOW_DEV_SESSION`,
  `ALLOW_DEV_WORKSPACE_BOOTSTRAP`, `ALLOW_DEV_CONTROLLESS_SESSION`. An explicit
  `"true"` returns a runtime-config error (never normalized to false); a malformed
  literal also fails closed; Cloudflare always projects them all as `false`;
- `AUTH_ADAPTER=jwt` selects the JWT adapter with an injected secret; missing/weak
  JWT config fails closed; tenant + role always come from the control DB membership,
  never JWT claims; dev adapters are impossible in production;
- production never returns in-memory repositories;
- test injection lives in a structurally separate seam
  (`requestRuntimeEnvInjection.ts`, AsyncLocalStorage) that the production accessor
  cannot reach and that no route imports;
- no secret (JWT secret, LLM API key) or raw binding is returned to clients, placed
  in audit metadata, or written to logs.

## 8. Local development

- `npm run dev` — plain Next.js; no Cloudflare context. `getRequestRuntimeEnv()`
  returns `null`; the config resolver uses an **explicit, separate `process.env`
  path** (dev adapters allowed only when `NODE_ENV !== production`). Persistence is
  in-memory (only when `ALLOW_IN_MEMORY_PERSISTENCE=true`) or `integration_missing`.
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

### 9.1 Production authentication variables

The committed `wrangler.json` deliberately contains **no secrets** and no auth
config, so deploying only the base config leaves authentication **fail-closed**
(`AUTH_ADAPTER` absent → adapter `none` → every request is unauthorized). To
enable JWT auth in production, supply these OUT of the repository:

| Variable | Kind | How to provision |
|----------|------|------------------|
| `AUTH_ADAPTER=jwt` | non-secret Worker var | `wrangler.json` "vars", or `wrangler deploy --var AUTH_ADAPTER:jwt` |
| `JWT_AUTH_SECRET` | **secret** | `wrangler secret put JWT_AUTH_SECRET` (never committed; ≥ 32 bytes required in production) |
| `JWT_AUTH_ISSUER` | non-secret var (or secret) | `wrangler.json` "vars" or `wrangler secret put JWT_AUTH_ISSUER` |
| `JWT_AUTH_AUDIENCE` | non-secret var (or secret) | `wrangler.json` "vars" or `wrangler secret put JWT_AUTH_AUDIENCE` |

Notes:

- `JWT_AUTH_SECRET` must be provisioned via `wrangler secret put` — do NOT place it
  in `wrangler.json` and do NOT commit it. Issuer and audience may be plain vars or
  secrets depending on your policy; in production the JWT config is only accepted
  when the secret is ≥ 32 bytes AND issuer AND audience are all present (otherwise
  auth fails closed).
- The request-scoped config reads these from the Cloudflare env only — never from
  ambient `process.env`.
- **A JWT alone does not create a session.** The control DB must already contain a
  matching `auth_identities` row (provider `jwt`, the token's `sub`) linked to a
  `users` row with an **active** `memberships` row for an **active** tenant. Tenant
  and role are taken from that membership, never from JWT claims. Seed these records
  (see `CLOUDFLARE_D1_SETUP.md`) before JWT authentication can produce a session.

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

- **Issue #130** (tenant DB resolver + tenant-isolated repository parity) is
  addressed by **P0-PERSIST-014**. Persistence authority is now **structural**:
  - a production D1 bundle is producible only through
    `resolveProductionRepositories`, whose `resolver` is **required** — the
    complete `tenant_databases` record (tenant_id / database_name / database_id /
    schema_version / status) is validated before any repository is returned;
  - direct binding lives only behind the explicitly named
    `resolveLocalRepositories`; presence of `CONTROL_DB` / `TENANT_DB_DEFAULT`
    alone never yields a direct production bundle;
  - `TENANT_DB_DEFAULT` is returned via the resolver (never the control DB), and
    in-memory / D1 repositories enforce the same row-level tenant scoping;
  - a persistence failure returns fallback data **only** in explicit non-production
    local development (central `canUseLocalPersistenceFallback` helper); both
    Cloudflare **and** Node production return safe `503`s, never keyed on
    `runtime.source` alone or `process.env.NODE_ENV`;
  - the legacy `resolveRepositories({ runtimeEnv })` direct path is **closed** — a
    validated Cloudflare D1 env requires a resolver and fails closed without one;
  - the legacy `env`/`process.env` seam is **local/test-only**: a `config.isProduction`
    check fails closed **before** any mode dispatch, so **Node production can never use
    the legacy env/direct-binding seam** (`options.d1Binding`, `process.env`, an omitted
    resolver, `resolveLocalRepositories`, or an inferred authority). Node production D1
    requires an explicit production persistence projection + tenant resolver via
    `resolveProductionRepositories` / `resolveRepositoriesForAuthority({ kind:
    "cloudflare_production" })`. **Every production-capable repository path requires
    registry validation; no production path can infer local authority.** Cloudflare
    production uses request-scoped production authority (one frozen snapshot per request);
  - tenant-scoped children (Action Preview / Approval / WorkUnit Feedback) may
    reference only **same-tenant** parents; a foreign-tenant or missing parent fails
    closed IDENTICALLY as an opaque `parent_boundary_violation`. Object IDs are
    globally unique, but child→parent edges are tenant-local. Constraint failures are
    classified precisely: only UNIQUE/PRIMARY KEY → `object_id_conflict`; FK/CHECK/
    NOT NULL/unknown → `write_failed`.
  See [CLOUDFLARE_D1_SETUP.md §9a](CLOUDFLARE_D1_SETUP.md). The chosen architecture
  is a single **shared** tenant D1 (row-level isolation) with a **global** object-ID
  namespace enforced by the D1 PRIMARY KEY; physical per-tenant D1 routing is
  deferred.
- **Issue #155** still owns the broader reproducible production
  persistence/migration proof (migration ordering, idempotence, seeding,
  operational setup) and remains **out of scope for remote migration execution**
  in this PR. This patch does not claim production readiness from passing FakeD1
  tests or a dry-run; FakeD1 does not enforce PRIMARY KEY constraints, so the
  global-ID contract is proven by a real SQLite-backed test, not by FakeD1.

## 13. D1 migration operations & deploy ordering (P0-PERSIST-015, Issue #155)

Migration execution is an **operator action**, never an implicit application-runtime
action. **Worker deploy never silently applies database migrations** — there is
deliberately no migration step in the `cf:deploy` pipeline.

### Migration lanes (canonical: `migrations/manifest.json`)

```text
CONTROL_DB
  0001_control_db.sql                     replay_safe
  0004_control_auth_workspace.sql         replay_safe

TENANT_DB_DEFAULT
  0002_tenant_core.sql                    replay_safe
  0003_tenant_persistence_foundation.sql  replay_safe
  0005_tenant_scoped_indexes.sql          replay_safe
  0006_action_preview_creator.sql         once
```

Existing migration SQL is immutable (SHA-256 pinned); changes are append-only. Every
committed migration is in exactly one lane — there is no `deferred` escape hatch,
because an operationally invisible migration produces a bootstrap schema the
application cannot use.

- **`replay_safe`** — every statement is `IF NOT EXISTS`-guarded; re-executed on
  every run.
- **`once`** — the raw SQL is not re-runnable (SQLite has no
  `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`). Applied exactly once, recorded in the
  `__atra_d1_migrations` ledger, and skipped afterwards.

`0006_action_preview_creator.sql` is **required and active**:
`D1ActionPreviewRepository.create()` always inserts `created_by_user_id`, so a
database without it cannot serve Action Preview creation. Worker deploy **fails**
when that column is absent, because the read-only remote schema verification checks
the contract that requires it. Full detail:
[CLOUDFLARE_D1_SETUP.md §6 + §10](CLOUDFLARE_D1_SETUP.md).

### Deploy ordering (`CF_DEPLOY_EXECUTE=1`)

```text
prepare generated config
  → load + validate ONE config authority (retain its exact bytes)
  → create ONE private execution config from it
  → preflight            (that private config)
  → build Worker
  → verify Worker artifacts   (that private config)
  → verify remote D1 schemas  (READ-ONLY, same retained authority)
  → deploy Worker             (that same private config)
  → unconditional cleanup of BOTH the private and the original generated config
```

**The deploy config is authority-bearing** — it selects the physical databases and
the Worker deployment configuration. Previously every step re-read
`wrangler.deploy.json` independently, so the config verified remotely and the config
deployed were two separate reads of a mutable file and could differ. The orchestrator
now loads it **once** through the shared authority library
(`scripts/lib/cfDeployConfigAuthority.mjs`), writes the exact retained bytes to a
single private `0600`, exclusively-created `wrangler.deploy.deploy-exec-<random>.json`,
and gives **every** step that one file. Remote verification runs **in-process against
the same retained authority** rather than spawning a child that would snapshot the
file a second time. Editing, replacing, or deleting the original after the snapshot
cannot redirect verification or the upload, and deleting it does not break the
pipeline. Wrangler never receives the original generated config.

- **`CONTROL_DB` and `TENANT_DB_DEFAULT` must reference DIFFERENT physical D1
  databases.** The shared deploy-config validator compares the two `database_id`s and
  refuses a collision (`d1_database_id_collision:CONTROL_DB:TENANT_DB_DEFAULT`)
  **before any database access** — before the first Wrangler call, before the
  migration ledger is created, and before either lane applies anything. `CONTROL_DB
  is never tenant-data storage` is an architecture guarantee: one physical database
  serving both bindings would put tenant rows in the control registry and let the
  tenant lane rewrite the control schema. Every command inherits the rule (prepare,
  preflight, dry-run, deploy, migration apply, bootstrap apply, remote verification).
  Database names are validated and must also be distinct. No failure contains an id.
- A remote schema-verification **failure prevents the deploy**.
- The remote verification is read-only: `SELECT` on `sqlite_master` + read-only
  `PRAGMA` only; it never mutates, seeds, runs migrations, prints database IDs, or
  reads application row data.
- Without `CF_DEPLOY_EXECUTE=1` the pipeline stops **before** the first remote step —
  preflight and dry-run remain fully offline and never contact Cloudflare.
- No step can be skipped or reordered. `EXTERNAL_ACTIONS_ENABLED` remains `false`.
- **Worker deploy never applies migrations and never writes bootstrap records.**
  Both are separate, operator-gated commands. Deploy only *verifies* the remote
  schema, read-only.

### Production migration apply gates

`cf:d1:migrations:apply` stops before Wrangler unless **all** hold: `--remote`, a
validated generated `wrangler.deploy.json` (real, non-placeholder IDs; exactly the
approved bindings), `CF_D1_MIGRATE_EXECUTE=1`,
`CF_D1_MIGRATE_CONFIRM=APPLY_PRODUCTION_D1_MIGRATIONS`, and a fully valid manifest.
It reconciles the remote ledger first and refuses on any disagreement; a `once`
migration is applied exactly once and skipped on re-runs.

### Production bootstrap apply gates

`cf:d1:bootstrap:apply` is the **only** supported way to apply the generated
`bootstrap.control.sql`. The documented workflow is:

```text
prepare bootstrap → inspect safe plan → gated apply → read-only verification → cleanup
```

It stops before Wrangler unless **all** hold: `--remote`; a validated generated
deploy config with real, non-placeholder IDs; the target binding is exactly
`CONTROL_DB`; the generated SQL exists, is a plain file (never a symlink), sits at the
approved repository-root location, and is no broader than `0600`;
`CF_D1_BOOTSTRAP_EXECUTE=1`; `CF_D1_BOOTSTRAP_CONFIRM=APPLY_PRODUCTION_CONTROL_BOOTSTRAP`;
and a valid manifest + Control DB schema contract.

**The prepared artifact is a reviewable plan, not execution authority.** Apply
independently reconstructs the canonical SQL from the operator environment at apply
time and compares the **entire file** byte-for-byte, so a stale or tampered artifact
— appended `DELETE`, a sixth `INSERT`, a changed email or database ID, reordered
statements — fails closed before Wrangler. Failures are safe categories that never
echo a value.

**Registry metadata must match the actual binding**: `CF_D1_BOOTSTRAP_DATABASE_ID` /
`_NAME` must equal the deploy config's real `TENANT_DB_DEFAULT` `database_id` /
`database_name`; the Control DB's own ID is never accepted as tenant metadata.
**Schema version is canonical**, not arbitrary: it must equal the manifest's
`registry.TENANT_DB_DEFAULT.schemaVersion`, which is pinned to the tenant lane it
describes.

**Wrangler receives private temporary files, never the mutable preparation files.**
Both authority-bearing inputs are snapshotted: the canonical SQL bytes and the
validated deploy config. The config is read once, validated as a snapshot, and
written to a fresh exclusive `0600` `wrangler.deploy.bootstrap-exec-<random>.json`;
only that config is passed to Wrangler, and the **same** one is used for the apply
and for every verification query, so the database written and the database verified
cannot diverge. Mutating, replacing, or deleting the original config after gate
evaluation cannot redirect the write. The five records are applied as **one atomic D1
batch** (all-or-nothing), then verified read-only at category level with COUNT-only
queries over **all** supplied fields (no IDs, email, subject, or row contents
printed). The temporary SQL file, the private execution config, and the
repository-root artifact are all removed on **every** exit path.

Because verification runs **after** the batch commits, a verification failure is an
operator-action state (`bootstrap_verification_failed_after_commit`) — **not** a
rollback. The records exist; the command exits non-zero, prints no values, requires
operator investigation, and issues no compensating `DELETE`.

Never run a raw `wrangler d1 execute` against the generated file: it bypasses every
gate, the canonical binding, the verification, and the cleanup.

### Rollback limitations

**D1 data rollback is separate from Worker rollback.** Rolling the Worker back does
**not** roll back applied migrations or data; there are no down-migrations. D1
recovery is an independent operator procedure (Cloudflare Time Travel or an export
restore) with its own retention window. Roll forward to a Worker compatible with the
already-applied schema rather than assuming the schema moves backwards.

### Proof status

FakeD1 and `cf:deploy:dry-run` are **not production-readiness proof**. The local
bootstrap proves reproducibility against real SQLite (`node:sqlite`) only.
**Issue #155 remains open** until an authorized remote execution is performed and its
evidence (`npm run cf:d1:evidence`) is reviewed.
