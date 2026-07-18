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

> **Do not hand-run individual migration files.** The canonical, machine-readable
> lanes live in `migrations/manifest.json` (P0-PERSIST-015). Use the reproducible
> commands — they apply **every** migration in the correct lane order:

```bash
npm run cf:d1:migrations:check       # validate manifest, paths, digests, lanes, SQL safety (no DB access)
npm run cf:d1:migrations:plan        # print the ordered plan (no database IDs, no SQL)
npm run cf:d1:bootstrap:local        # fresh isolated bootstrap + idempotence + local fixture
npm run cf:d1:schema:verify:local    # verify both schemas against migrations/schema-contract.json
```

`cf:d1:bootstrap:local` creates **isolated temporary** SQLite databases (a private
OS temp dir — never your normal local D1/Wrangler state), applies both lanes from
an empty state, verifies the schema contract, proves idempotence by re-applying
each lane, seeds the local-only fixture, and deletes the temporary state. It
performs **no remote access**.

To drive your own Wrangler-local state instead, apply the lanes in the exact
manifest order (see [§6 Migration lanes](#6-migration-lanes)):

```bash
wrangler d1 execute CONTROL_DB --local --file=migrations/0001_control_db.sql
wrangler d1 execute CONTROL_DB --local --file=migrations/0004_control_auth_workspace.sql
wrangler d1 execute TENANT_DB_DEFAULT --local --file=migrations/0002_tenant_core.sql
wrangler d1 execute TENANT_DB_DEFAULT --local --file=migrations/0003_tenant_persistence_foundation.sql
wrangler d1 execute TENANT_DB_DEFAULT --local --file=migrations/0005_tenant_scoped_indexes.sql
wrangler d1 execute TENANT_DB_DEFAULT --local --file=migrations/0006_action_preview_creator.sql
```

`0006` is **required** — without it `action_previews` has no `created_by_user_id` and
every Action Preview create fails. It is `once`-only: run it **exactly once** against
a given local database (re-running raises `duplicate column name`). Because this
hand-driven path has no ledger, prefer `cf:d1:bootstrap:local`, which applies the
complete lane through the ledger and is safely repeatable.

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

### Run migrations on production (OPERATOR-GATED)

Migration execution is an **operator action**, never an implicit application-runtime
action, and **never part of `cf:deploy`**. It is impossible to run accidentally —
`cf:d1:migrations:apply` stops before Wrangler unless **all** of the following hold:

| Gate | Requirement |
|------|-------------|
| Explicit remote mode | `--remote` |
| Validated generated config | `--config wrangler.deploy.json` (real, non-placeholder D1 IDs; exactly the approved bindings) |
| Execution flag | `CF_D1_MIGRATE_EXECUTE=1` |
| Acknowledgement phrase | `CF_D1_MIGRATE_CONFIRM=APPLY_PRODUCTION_D1_MIGRATIONS` |
| Manifest validation | `migrations/manifest.json` fully valid (paths, digests, lanes, SQL safety) |

```bash
npm run cf:deploy:prepare            # assemble the untracked wrangler.deploy.json (0600)
npm run cf:d1:migrations:check       # must pass first

CF_D1_MIGRATE_EXECUTE=1 \
CF_D1_MIGRATE_CONFIRM=APPLY_PRODUCTION_D1_MIGRATIONS \
npm run cf:d1:migrations:apply -- --remote --config wrangler.deploy.json
```

The apply walks each lane in manifest order and aborts on the first failure. It does
**not** pass `--yes`: Wrangler's own confirmation stays visible to the operator.

**Every** active migration is applied, `0006` included. Before touching a lane the
command reconciles the remote ledger and refuses if anything disagrees. A `once`
migration is applied exactly once — its DDL and its ledger row go in a **single**
`d1 execute --file` invocation, which D1 runs as one implicit atomic batch — so
re-running this command skips `0006` rather than failing on it (see
[§6](#6-migration-lanes)).

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

## 6. Migration lanes

The **complete** lanes. `migrations/manifest.json` is the canonical, machine-readable
source of truth — logical sequence, target binding, relative path, pinned SHA-256
digest, kind, and idempotence. Nothing applies a migration outside the manifest.

```text
CONTROL_DB
  0001_control_db.sql
  0004_control_auth_workspace.sql

TENANT_DB_DEFAULT
  0002_tenant_core.sql
  0003_tenant_persistence_foundation.sql
  0005_tenant_scoped_indexes.sql
```

| Lane | Seq | File | Kind | Idempotent | Contents |
|------|-----|------|------|-----------|----------|
| `CONTROL_DB` | 1 | `0001_control_db.sql` | schema | yes | `tenants`, `tenant_databases` |
| `CONTROL_DB` | 2 | `0004_control_auth_workspace.sql` | schema | yes | `users`, `tenant_memberships`, `auth_identities`, auth/workspace indexes |
| `TENANT_DB_DEFAULT` | 1 | `0002_tenant_core.sql` | schema | yes | `action_previews`, `approval_records` |
| `TENANT_DB_DEFAULT` | 2 | `0003_tenant_persistence_foundation.sql` | schema | yes | `work_units`, `workunit_feedback`, `integration_connections`, `audit_logs`, `usage_events`, `usage_daily_summary` |
| `TENANT_DB_DEFAULT` | 3 | `0005_tenant_scoped_indexes.sql` | index | yes | tenant-prefixed composite indexes |

**Immutability + append-only.** Once pinned, an existing migration's bytes may never
change — a changed digest fails `cf:d1:migrations:check`. New work is appended as a
new migration + a new manifest entry; existing entries are never rewritten or
renumbered.

### The deploy config is authority-bearing — retained bytes + digest, a scoped config per call

The generated `wrangler.deploy*.json` selects the **physical databases** and the
Worker deployment configuration. Validating one read and then handing Wrangler the
original path leaves a validate-then-execute window: the file can change in between.
Reproduced against an earlier head — a post-validation edit **redirected a
schema-verification query to a different database mid-run**, and the deploy
orchestrator's `verify-remote-schema` and `deploy` steps each re-read
`wrangler.deploy.json` independently, so the config verified and the config deployed
could differ.

**Authority is the retained exact bytes and their SHA-256 — a filesystem path is
not itself immutable authority.** An earlier repair wrote **one** private execution
config per command and reused its *path* for every Wrangler invocation. That is still
a mutable filesystem file: it can be altered between the Control and Tenant migration
operations, between verification queries, or after remote verification but before the
upload. Path equality across two calls proves nothing.

One shared library (`scripts/lib/cfDeployConfigAuthority.mjs`) is the only
implementation. Every remote command — `cf:d1:migrations:apply`,
`cf:d1:schema:verify:remote`, `cf:d1:bootstrap:apply`, and `cf:deploy` — uses it:

```text
load authority ONCE (retain exact bytes + sha256)
  → for each Wrangler call: fresh scoped config from those bytes
  → one invocation → remove it → next call gets its own fresh config
```

`loadValidatedDeployConfigAuthority` requires an approved repository-root
`wrangler.deploy*.json`, rejects a symlink, requires a plain file with permissions no
broader than `0600`, bounds the size **before** reading, reads the bytes **exactly
once**, re-checks the size, strictly parses the retained bytes, runs the shared
validator (including physical separation and database-name rules), and returns the
**exact validated bytes**, their **SHA-256** (`authority.sha256`), and a
**recursively immutable** snapshot — a shallow freeze would leave
`d1_databases[0].database_id` writable, which is the one field that decides which
database is hit. `authority.sha256` is safe evidence (no database ID or config
content) and is **never written into the config file**. Authority bytes are returned
**only** when every check passes. Failures are safe categories that never contain a
database ID, name, config content, path, or secret.

`withPrivateExecutionConfig(authority, { repoRoot, purpose }, operation)` is the
**only** way execution bytes reach Wrangler. For each single invocation it writes the
authority's exact bytes — never a re-serialization of the parsed object, never a
rebuild from environment variables — to a collision-resistant
`wrangler.deploy.<purpose>-exec-<random>.json` at the repository root (so Wrangler
resolves it as a normal generated config, and `/wrangler.deploy*.json` already
ignores it), created **exclusively** (`wx`, so a pre-placed file is never overwritten
or followed), then tightened to **read-only `0400`** (never broader than `0600`).
Before the callback it re-confirms the file is a plain, private, correctly-located
file whose bytes hash to `authority.sha256`. The callback receives **only** the path,
which is removed in `finally` on success or throw. **The path never escapes the
callback and is never reused by the next invocation.**

**Wrangler never receives the original config path, and no reusable file serves as
authority between calls.** Mutating, replacing, or deleting the original after gate
evaluation cannot redirect any operation, and modifying a *prior* call's (already
removed) scoped file cannot redirect the *next* call — the next call mints its own
fresh file from the retained bytes.

Per command, every Wrangler call derives from the **same retained authority**:

| Command | Every scoped call derives from one authority |
| --- | --- |
| `cf:d1:migrations:apply` | ledger initialization, migration-history queries, effect probes, and **every** Control and Tenant migration (replay-safe and once-only batches) |
| `cf:d1:schema:verify:remote` | **every** Control and Tenant introspection query; the result reports only `{ ok, failures, authorityDigest }` |
| `cf:deploy` | preflight, artifact verification, remote schema verification, **and** the upload — verification runs in-process against the same retained authority and returns its digest; before `wrangler deploy` the orchestrator asserts that digest **equals** its own retained digest. Verification and upload may use different ephemeral paths, but they execute **byte-for-byte identical** authority bytes — the guarantee is byte identity, not a same-path claim |
| `cf:d1:bootstrap:apply` | the atomic bootstrap batch and every post-bootstrap COUNT query, each a fresh scoped config from the same authority |

Migration apply and the deploy orchestrator return an exit code from their protected
regions rather than calling `process.exit` inside them: a nested exit would terminate
inside a scoped config's callback, before its `finally` removed the file. The scoped
leases remove themselves as each call returns; the orchestrator additionally removes
the **original** generated `wrangler.deploy.json` the moment its bytes are retained,
and again on every exit, since it owns it and it carries real IDs.

> **`cf:d1:schema:verify:remote` is ENTRYPOINT-ONLY (P0-FIX-018).** Read-only provider
> access is still remote execution, so it must be operator-gated at the command
> entrypoint. The Wrangler-backed runner and multi-binding verifier are **private** to
> the command — there is no exported `makeWranglerReadOnlyRunner` or
> `verifyRemoteSchemasWithAuthority`, so an **imported** function cannot issue a remote
> introspection query. Only `main()` validates `--remote` and the deploy-config
> authority, then opens a **module-private schema-verification latch**; every
> remote-capable leaf calls `requireSchemaVerificationAuthorized()` before creating a
> scoped config or spawning Wrangler (a non-read-only SQL is rejected before any file
> is created), and the latch is closed in `finally`. The deploy command does **not**
> import this command's remote path — it re-implements its own private introspection,
> protected by its own deploy latch, and reuses only pure schema helpers (contract
> loading, read-only SQL classification, validation through a caller-provided pure row
> source). This is not remote proof; a Cloudflare-side cross-check and human review
> remain mandatory and **Issue #155 stays open**.

### CONTROL_DB and TENANT_DB_DEFAULT must be DIFFERENT physical databases

`CONTROL_DB is never tenant-data storage` is an **architecture guarantee**, not a
naming convention. The control registry holds tenants, users, identities, and the
`tenant_databases` rows that decide *which* database a tenant's data lives in.
Assigning one physical D1 database to both approved bindings would put tenant rows
inside the control registry and let the tenant migration lane rewrite the control
schema.

Validating each `database_id` on its own cannot see that, so the **shared** deploy-
config validator compares them:

```text
CONTROL_DB.database_id !== TENANT_DB_DEFAULT.database_id
  → else d1_database_id_collision:CONTROL_DB:TENANT_DB_DEFAULT
```

Every command inherits it — `cf:deploy:prepare`, `cf:deploy:preflight`,
`cf:deploy:dry-run`, `cf:deploy`, `cf:d1:migrations:apply`, `cf:d1:bootstrap:apply`,
and `cf:d1:schema:verify:remote` — because they all validate through that one
library. A collided config is refused **before any database access**: before the
first Wrangler call, before the `__atra_d1_migrations` ledger is created, and before
either lane applies anything. The ledger's `foreign_binding` reconciliation is a
backstop, never the first defence — by the time it runs the Control lane would
already have written.

The rule is about **concrete** ids, so it applies regardless of
`allowPlaceholderIds`; the committed base (two different placeholders) is unaffected.

Every required `database_name` is validated too — non-empty, bounded, approved
charset, no placeholder marker (`d1_name_empty` / `d1_name_malformed` /
`d1_name_placeholder`) — and the two approved bindings must have **distinct names**
(`d1_database_name_collision:CONTROL_DB:TENANT_DB_DEFAULT`). Wrangler resolves a
binding by id, so an alias would not by itself misroute; the requirement is that
every operator-facing artifact (plan output, Wrangler prompts, the bootstrap registry
row that must match `TENANT_DB_DEFAULT`) is unambiguous about which database is
meant. No failure ever contains an id or a name.

### Apply modes: `replay_safe` vs `once`

Every migration declares **how** it may be applied. There is deliberately no
"deferred"/"skip" mode: a required migration is never hidden from operations.

| Mode | Meaning | Applied |
| --- | --- | --- |
| `replay_safe` | Every statement is `IF NOT EXISTS`-guarded, so the raw SQL can be re-executed against an already-migrated database. | Every run |
| `once` | The raw SQL is **not** re-runnable (SQLite has no `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`). | Exactly once, tracked in the ledger |

A `once` migration must declare an **effect probe** (`{ type: "column_exists",
table, column }`) — the deterministic schema question "did this change land?". It is
what lets the ledger and the real schema be reconciled after a crash or a manual
apply. `cf:d1:migrations:check` rejects a `once` migration without one.

The probe is **part of the operational plan**, not documentation: the ledger consults
it to decide `pending` / `satisfied` / `schema_without_history` /
`history_without_schema`. A probe pointed at a column that always exists would make
0006 look permanently satisfied and silently skip it. It is therefore covered by the
canonical registry plan digest, which spans **binding, sequence, path, kind, apply
mode, pinned SQL SHA-256, and a canonical effect representation** (`type|table|column`
— a normalized allowlisted shape with explicit field order, never a bare
`JSON.stringify` whose output would depend on key order and would silently absorb
unknown fields). Changing any of them fails `registry_plan_digest_mismatch` until the
plan is reviewed and the digest repinned.

### The migration ledger (`__atra_d1_migrations`)

Applied migrations are recorded per database:

```text
__atra_d1_migrations(binding, sequence, path, sha256, applied_at)
  PRIMARY KEY (binding, sequence)
  UNIQUE      (binding, path)
```

It holds **only** migration metadata — never application data and never a database
ID. It guarantees:

- an empty database applies **every** required migration, `0006` included;
- an already-applied `once` migration is **skipped**, never raw-replayed;
- replaying `cf:d1:migrations:apply` does **not** attempt `0006` again;
- a history entry with the wrong **digest**, **path**, or **sequence** fails closed;
- SQL is **never** marked applied before it succeeds, and a failed migration is
  never recorded as successful (the SQL and its ledger row commit together);
- order is deterministic, and a later migration cannot be satisfied before its
  predecessors;
- Control DB and Tenant DB histories cannot mix (a foreign binding fails closed).

**Why a custom ledger, not `wrangler d1 migrations apply`?** Verified against this
repository's pinned Wrangler (4.99.0): `wrangler d1 migrations apply <database>`
applies **every** file in the migrations directory to **one** database. This
repository interleaves two independent lanes in a single `migrations/` directory
(0001/0004 → `CONTROL_DB`; 0002/0003/0005/0006 → `TENANT_DB_DEFAULT`), so the
built-in mechanism would apply control migrations to the tenant database and vice
versa. It also performs no digest pinning and cannot fail closed on a tampered
migration.

#### Recovery states

Reconciliation (`reconcileLane`) resolves every ledger/schema disagreement
deterministically. Anything other than `pending`/`satisfied` **stops the lane before
anything is applied** and is an operator action category:

| State | Meaning |
| --- | --- |
| `pending` | Not recorded, effect absent → apply |
| `satisfied` | Recorded and effect present → skip |
| `schema_without_history` | Column exists but no ledger row (crash after DDL, or a manual apply) |
| `history_without_schema` | Ledger row exists but the column does not (interrupted execution) |
| `digest_mismatch` | Recorded digest ≠ pinned manifest digest |
| `path_mismatch` | Recorded path ≠ manifest path for that sequence |
| `foreign_binding` | A row from the other database's lane |

### `0006_action_preview_creator.sql` is ACTIVE and `once`

`0006` (`ALTER TABLE action_previews ADD COLUMN created_by_user_id`) is an **active,
ordered member of the tenant lane** (sequence 4) marked `once`.

It is **required**: `D1ActionPreviewRepository.create()` always inserts
`created_by_user_id`. A database without that column cannot serve Action Preview
creation at all — so a bootstrap that omits it is not "clean", it is broken. The
schema contract therefore **requires** the column, and both the local and remote
verifiers **fail** when it is missing.

Migrations are pure DDL: `cf:d1:migrations:check` fails if any migration contains
`INSERT`/`UPDATE`/`DELETE`/`REPLACE`/`ATTACH`, so **no migration ever seeds a default
tenant, user, identity, membership, API key, or provider credential**.

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

3. Run migrations (OPERATOR-GATED — see [§4](#run-migrations-on-production-operator-gated)):
   ```bash
   npm run cf:d1:migrations:check
   CF_D1_MIGRATE_EXECUTE=1 \
   CF_D1_MIGRATE_CONFIRM=APPLY_PRODUCTION_D1_MIGRATIONS \
   npm run cf:d1:migrations:apply -- --remote --config wrangler.deploy.json
   ```
   This applies the **complete** lanes (§6), never just `0001`/`0002`.

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

## 10. Reproducible D1 bootstrap & migration operations (P0-PERSIST-015, Issue #155)

Everything below is **reproducible from this document**. The canonical sources are
`migrations/manifest.json` (which migration runs, in which lane, in which order,
with which pinned digest) and `migrations/schema-contract.json` (what the resulting
schema must contain).

### Command surface — inspection vs mutation

| Command | Network | Mutates | Purpose |
|---------|---------|---------|---------|
| `cf:d1:migrations:check` | none | no | Validate manifest, paths, digests, lanes, SQL safety |
| `cf:d1:migrations:plan` | none | no | Print the ordered plan (binding, filename, sequence, kind, apply mode) |
| `cf:d1:bootstrap:local` | none | isolated temp only | Fresh bootstrap + schema verify + idempotence + local fixture |
| `cf:d1:schema:verify:local` | none | no | Verify both schemas against the contract |
| `cf:d1:evidence` | none | writes `.d1-evidence/` (untracked) | Safe operational evidence artifact |
| `cf:d1:bootstrap:prepare` | none | writes `bootstrap.control.sql` (untracked, 0600) | Prepare operator bootstrap SQL — **does not apply** |
| `cf:d1:bootstrap:apply` | **remote** | **yes** | Operator-gated, atomic production Control DB bootstrap |
| `cf:d1:migrations:apply` | **remote** | **yes** | Operator-gated production migration apply |
| `cf:d1:schema:verify:remote` | **remote** | no (read-only) | Verify production schema without writing |

Neither `plan` nor any verification prints a database ID, a secret, a seed value, or
SQL contents. Validation failures are safe categories keyed by binding + migration
basename.

### Fresh local bootstrap

```bash
npm run cf:d1:bootstrap:local
```

Creates isolated temporary SQLite databases in a private OS temp dir (**never** your
normal local D1/Wrangler state), applies both lanes from empty, verifies the schema
contract, re-applies each lane to prove idempotence, seeds the local-only fixture,
then deletes the temporary state. No remote access.

### Idempotence verification

The bootstrap applies each complete lane **twice** and compares a canonical schema
*signature* (tables, columns, NOT NULL, primary keys, indexes, foreign keys) before
and after. The signature must be identical.

Idempotence comes from the **ledger**, not from every migration being replay-safe:
the `replay_safe` migrations are re-executed harmlessly, and the `once` migration
`0006` is **skipped** on the second run because it is already recorded (§6). The
clean bootstrap therefore contains `action_previews.created_by_user_id`, and
supports **Action Preview and Approval**, not just WorkUnit.

### Local bootstrap fixture (LOCAL/TEST ONLY)

`cf:d1:bootstrap:local` seeds one active tenant, one **complete active**
`tenant_databases` registry row, one user, one active membership, and one JWT auth
identity — **only after schema verification**, and idempotently (repeat seeding
cannot corrupt). Every value is unmistakably local/test-only (`local-` prefixes, the
reserved `.invalid` TLD, a synthetic all-zero-prefixed database id) and is **refused**
if it ever looks production-shaped. These values are never used automatically in
production. No production email, subject, tenant, database ID, or credential is
committed, and no JWT secret exists in the repository.

An integration test (`tests/d1schemaSessionBootstrap.test.mts`) proves a
request-scoped **JWT session** resolves against the freshly bootstrapped Control DB
and reaches the freshly migrated **tenant repository bundle** through the mandatory
tenant-registry resolver.

`tests/d1bootstrapLifecycle.test.mts` proves the **complete lifecycle** on a clean
bootstrap, using real `node:sqlite` (never FakeD1, which enforces no schema and
therefore cannot prove schema compatibility): JWT session → production repository
resolution → WorkUnit create/read → **Action Preview create with a server-set
`creatorUserId`** → creator read-back → **Approval by a different approver (201)** →
**self-approval rejected (403)** → exact approval hashes and WorkUnit/Preview
relationships → wrong-tenant Preview lookup returns `null`. It also proves a schema
missing `created_by_user_id` **fails verification before any repository use**, and
carries a direct regression test: on the old `0002/0003/0005`-only lane
`D1ActionPreviewRepository.create()` fails, and on the complete lane it passes.

### Production bootstrap (operator-gated, repository-controlled)

The **only** supported production bootstrap workflow:

```text
prepare bootstrap → inspect safe plan → gated apply → read-only verification → cleanup
```

Do **not** hand the generated SQL to a raw `wrangler d1 execute`. That bypasses every
gate, the atomic-batch guarantee, the post-apply verification, and the guaranteed
cleanup. Use `cf:d1:bootstrap:apply`.

#### 1. Prepare

```bash
CF_D1_BOOTSTRAP_TENANT_ID=... CF_D1_BOOTSTRAP_TENANT_NAME=... CF_D1_BOOTSTRAP_TENANT_SLUG=... \
CF_D1_BOOTSTRAP_TENANT_STATUS=active \
CF_D1_BOOTSTRAP_DATABASE_NAME=... CF_D1_BOOTSTRAP_DATABASE_ID=... CF_D1_BOOTSTRAP_SCHEMA_VERSION=2 \
CF_D1_BOOTSTRAP_USER_ID=... CF_D1_BOOTSTRAP_USER_EMAIL=... \
CF_D1_BOOTSTRAP_MEMBERSHIP_ID=... CF_D1_BOOTSTRAP_MEMBERSHIP_ROLE=owner CF_D1_BOOTSTRAP_MEMBERSHIP_STATUS=active \
CF_D1_BOOTSTRAP_IDENTITY_ID=... CF_D1_BOOTSTRAP_IDENTITY_PROVIDER=jwt CF_D1_BOOTSTRAP_IDENTITY_SUBJECT=... \
npm run cf:d1:bootstrap:prepare
```

Every value is **operator-provided with no implicit defaults**; a single missing
variable fails closed. The role is allowlisted (`owner|manager|editor|viewer`),
tenant and membership status must be **explicitly** `active`, and the database ID
uses the **same UUID validation as the deployment config** (placeholders rejected).

`CF_D1_BOOTSTRAP_SCHEMA_VERSION` is **canonical, not arbitrary**. It names *which*
tenant schema the registry row claims the database has, so a bounded digit-format
check (what the tenant resolver does — necessary, but not sufficient) cannot tell a
correct version from a plausible one. It must equal the manifest's single canonical
source (`registry.TENANT_DB_DEFAULT.schemaVersion`, currently **2** — the schema
*including* `0006`/`created_by_user_id`). That version is pinned to a digest of the
tenant lane it describes, so changing the active plan fails
`cf:d1:migrations:check` with `registry_plan_digest_mismatch` until the version and
digest are updated together.

**The prepared artifact is a reviewable plan, not execution authority.** Preparing
grants nothing: `cf:d1:bootstrap:apply` independently reconstructs the canonical SQL
from the operator environment *at apply time* and refuses any difference (below).
Output is written to the untracked repository-root `bootstrap.control.sql` with
`0600` permissions. **No value is ever logged** (failures name only the field).
Generated bootstrap SQL is git-ignored and must never be committed.

#### 2. Inspect the safe plan

```bash
npm run cf:d1:migrations:plan        # ordered lanes, no IDs, no SQL
npm run cf:d1:migrations:check       # manifest, digests, lanes, SQL safety
```

#### 3. Gated apply

```bash
CF_D1_BOOTSTRAP_EXECUTE=1 \
CF_D1_BOOTSTRAP_CONFIRM=APPLY_PRODUCTION_CONTROL_BOOTSTRAP \
CF_D1_BOOTSTRAP_TENANT_ID=... (the same operator variables as above) \
npm run cf:d1:bootstrap:apply -- --remote --config wrangler.deploy.json
```

The apply **stops before Wrangler** unless *every* gate passes: explicit `--remote`;
a validated generated deploy config with real, non-placeholder D1 IDs; the target
binding is exactly `CONTROL_DB`; the generated SQL exists, is a **plain file** (never
a symlink), is at the **approved repository-root location**, and has permissions no
broader than `0600`; `CF_D1_BOOTSTRAP_EXECUTE=1`; the exact confirmation phrase; and
a valid manifest + Control DB schema contract. Operator input is **re-validated** at
apply time — the command does not trust `prepare`.

**Canonical artifact binding.** Those gates describe the *file*; this one describes
the *bytes*. Apply reads the artifact (only after the path/type/mode checks pass,
and only after a hard size cap), parses its bounded non-sensitive header (format
version + one `generated_at` instant — no operator value), re-runs
`buildBootstrapSql` against the **currently validated operator input** plus that
timestamp, and compares the **entire file** byte-for-byte. Any difference fails
closed:

| Category | Meaning |
| --- | --- |
| `bootstrap_sql_unreadable` | the artifact could not be read |
| `bootstrap_sql_too_large` | over the size cap — rejected **before** parsing |
| `bootstrap_sql_format_invalid` | missing/unknown format version, or a non-canonical `generated_at` |
| `bootstrap_sql_values_mismatch` | the bytes encode different values (stale or tampered) |
| `bootstrap_sql_noncanonical` | content appended to, or removed from, the canonical bytes |

No category ever contains the differing value, SQL, email, subject, database ID, or
file contents. This is a **reconstruct-and-compare**, not a forbidden-keyword scan:
it covers changed values, a replaced table name, an appended `DELETE`/`UPDATE`/sixth
`INSERT`, a removed statement, reordered statements, and a stale artifact prepared
from environment variables the operator has since changed — with no allow/deny list
to outgrow. The header is not trusted as a digest; it supplies only the timestamp,
and the executable bytes are independently regenerated from the environment.

**Registry binding.** The registry row tells the runtime resolver which D1 database a
tenant's data lives in, so the operator's metadata must describe the **actual**
binding: `CF_D1_BOOTSTRAP_DATABASE_ID` must equal the validated deploy config's
`TENANT_DB_DEFAULT.database_id`, and `CF_D1_BOOTSTRAP_DATABASE_NAME` its
`database_name`. Compared in memory; failures are `tenant_database_id_mismatch` /
`tenant_database_name_mismatch` and neither value is printed. Two individually valid
UUIDs that differ are refused — and the **Control DB's own ID can never be stored as
the tenant registry database ID**, which would point tenant data at the control
registry itself (`control_tenant_database_collision`). A missing or duplicated
approved binding is unresolvable and fails closed.

**Immutable deploy-config snapshot.** The config decides *which database* the bytes
hit, so it is authority-bearing and gets the same treatment as the SQL. During gate
evaluation apply inspects the config's path, type, location, and permissions, bounds
its size, reads the bytes **once**, parses **those** bytes, validates the parsed
snapshot, performs the registry comparisons against that same snapshot, and returns
an immutable (frozen) snapshot only when every gate passes. The original path is
never re-read afterwards.

Before the first Wrangler invocation the snapshot is written to a **fresh private
execution config** — `wrangler.deploy.bootstrap-exec-<random>.json`, created
exclusively (`wx`, so an existing file can never be overwritten or followed) with
mode `0600`, at the repository root so Wrangler resolves it exactly as a normal
generated config, and git-ignored by `/wrangler.deploy*.json`. **Only that file is
passed to Wrangler**, for the apply *and* for every post-bootstrap verification
query — so the database that is written and the database that is verified can never
diverge. Mutating, replacing, or deleting the original config after gate evaluation
cannot redirect the write. It is removed unconditionally, alongside the preparation
artifact.

**No validate-then-execute window (TOCTOU).** Wrangler never receives
`bootstrap.control.sql`. Validating the repository-root artifact and then handing
Wrangler that same mutable path would leave a window in which the reviewed bytes and
the executed bytes differ. Instead the canonical bytes **retained in memory from
validation** are written to a fresh random private (`0600`) temporary file, and only
that file is executed; the bytes are never re-read from the original path. The
temporary directory is removed unconditionally.

**Atomicity.** The five records are applied by **one** `wrangler d1 execute --file`
invocation, which D1 runs as a **single implicit atomic batch**: all five commit, or
none do. Verified against this repository's pinned Wrangler (4.99.0): D1 **rejects**
explicit `BEGIN IMMEDIATE`/`COMMIT`/`SAVEPOINT`, so the generated file deliberately
contains no transaction control — the single-file batch *is* the atomic boundary. D1
enforces foreign keys (`PRAGMA foreign_keys` → 1). The SQL uses plain `INSERT`s
(never `INSERT OR IGNORE`, never `REPLACE`) ordered tenant → registry → user →
membership → identity, so a duplicate tenant, slug, email, membership, or
provider/subject — and any missing parent — fails closed with **zero new rows**.

#### 4. Read-only verification (automatic)

After a successful write the command verifies the Control DB **read-only** and
**category-level**. Every query is a bare `SELECT COUNT(*) AS c`; the supplied values
appear **only as escaped predicates**, never in a select list — so the only thing
that can come back is an integer. **No ID, email, subject, database ID, or row
content is read or printed.**

Each check requires exactly one row matching **all** supplied fields — counting by id
alone would confirm almost nothing ("a tenant with this id exists" is true even if
the bootstrap wrote the wrong database id or a stale schema version):

| Category | Requires exactly one row matching |
| --- | --- |
| `tenant_row` | id, name, slug, status `active` |
| `registry_row` | tenant_id, database_name, database_id, the **canonical** schema_version, status `active`, tenant FK resolves |
| `user_row` | id, email |
| `membership_row` | id, tenant_id, user_id, exact allowlisted role, status `active`, tenant + user FKs resolve |
| `identity_row` | id, user_id, provider, provider_subject, email, user FK resolves |

Failure output is category names only.

#### 5. If verification fails — an operator-action state, not a rollback

The five INSERTs are **committed** by the atomic batch *before* this read-only
verification runs. A verification failure is therefore **not** a rollback: the
records exist. The command reports `bootstrap_verification_failed_after_commit`,
exits non-zero, removes all generated files, prints no record values, and states that
**operator investigation is required**. It deliberately issues **no compensating
`DELETE`** — automatic destructive repair of a state we do not understand is how a
bad bootstrap becomes data loss. The canonical artifact binding makes this state
exceptional rather than a routine stale-input path.

#### 6. Cleanup (guaranteed)

Both the temporary execution file and the repository-root preparation artifact are
removed on **every** exit path — success, Wrangler failure, verification failure,
refused gates, or an unexpected throw — and never before Wrangler has read the
temporary file.

### Read-only remote schema verification

```bash
npm run cf:d1:schema:verify:remote -- --remote --config wrangler.deploy.json
```

Requires the validated generated deploy config (real, non-placeholder IDs; exactly
the approved bindings) **and** an explicit `--remote` flag. It issues **only**
read-only introspection (`SELECT` on `sqlite_master`; read-only `PRAGMA`) — a
non-read-only query is blocked before it can reach Wrangler. It never mutates,
never seeds, never runs migrations, never prints database IDs, and never reads
application row data. It reports safe object names and category-level failures:
missing/incompatible table, column, index, constraint, unexpected object, or query
failure.

### Worker deploy ordering

```text
prepare deploy config
  → validate deploy config
  → build Worker
  → verify Worker artifacts
  → verify remote D1 schemas (READ-ONLY)     ← requires CF_DEPLOY_EXECUTE=1
  → deploy Worker                            ← requires CF_DEPLOY_EXECUTE=1
```

`cf:deploy` **never applies migrations** — there is deliberately no migration step in
the pipeline. A remote schema-verification failure **prevents** the deploy. Without
`CF_DEPLOY_EXECUTE=1` the run stops before the first remote step, so preflight and
dry-run stay fully **offline**. No step can be skipped or reordered.

### Rollback limitations

- **D1 data rollback is SEPARATE from Worker rollback.** Rolling the Worker back to a
  previous version does **not** roll back applied migrations or data.
- Migrations here are additive (`replay_safe` `CREATE ... IF NOT EXISTS`, plus the
  `once` `0006 ADD COLUMN`); there are **no down-migrations**. A schema change cannot
  be undone by re-deploying an older Worker.
- Recovering D1 data requires Cloudflare **Time Travel** (`wrangler d1 time-travel`)
  or a restore from an export — an operator action outside this pipeline, with its own
  retention window.
- Plan a Worker rollback and a D1 recovery as **two independent** procedures: deploy a
  Worker that is compatible with the *already-applied* schema, rather than assuming the
  schema will move backwards.

### What is NOT proof

FakeD1 tests and `cf:deploy:dry-run` are **not production-readiness proof**. FakeD1
does not enforce PRIMARY KEY/UNIQUE/FK/CHECK constraints, and a dry-run never contacts
Cloudflare. The local bootstrap proves reproducibility against **real SQLite**
(`node:sqlite`) only.

**Issue #155 remains open.** This patch delivers the reproducible tooling and the
operator-gated workflow. Closing #155 additionally requires an **authorized remote
execution** and a review of the resulting evidence (`npm run cf:d1:evidence` produces
an artifact carrying the patch id, commit SHA, tool versions, manifest + schema-contract
digests, migration filenames/versions, bootstrap + idempotence results, test counts, and
a timestamp — and **no** database IDs, identities, secrets, SQL, or row data).

### Operational evidence packs (P0-OPS-016)

The future authorized run is recorded as a **D1 operational evidence pack** whose
every operation is a **command-bound receipt** — emitted from inside the real
operator command's result path, never fabricated by a caller. **Pack-level hashing
alone is not execution provenance:** each receipt is Ed25519-signed by a
per-repository evidence session (`npm run cf:d1:evidence:init`, offline, read-only
`git` only), bound to one session id + repository commit + deploy-config
**authority digest**, chained to the previous receipt, and carries proof facts
recomputed from the repository (the committed migration plan, the built Worker
artifact bytes, the manifest/schema-contract digests). Safe categories are exact
**per-operation allowlists** (no arbitrary string — e.g. a database name — can
become a category), deduplicated and sorted; a recursive sensitive-data scanner
remains as defence in depth. The offline verifier
(`npm run cf:d1:evidence:verify -- --file <pack> [--session <dir>]`) recomputes
every receipt digest, checks every signature, enforces the chain, one-authority,
per-operation categories, and cross-operation timestamp monotonicity — a complete
but unsigned fabricated pack fails. CLI and imported verification share
`verifyEvidencePackAtPath(path, { repoRoot, sessionDir })`; actual HEAD and tree
cleanliness come only from private allowlisted read-only Git, with no production
runner injection or override. The evidence layer authorizes nothing: every
operator gate stays independent and operator-supplied, and it never reads the
environment. Session signatures prove **one local evidence-session origin only** —
they are **not** a third-party Cloudflare attestation and do not protect against a
malicious machine owner. See
[D1_OPERATIONAL_EVIDENCE.md](D1_OPERATIONAL_EVIDENCE.md) for the receipt design,
trust model, workflow, and acceptance policy — the framework itself is **not**
remote proof, and Issue #155 stays open until an authorized run, second-checkout
verification, a Cloudflare-side cross-check, and human review.

## 11. Alpha persistence contract & reproducible migrate CLI (P0-FIX-D1-OPERATIONAL-CONTRACT, Issue #155)

The authoritative model is documented in
[../architecture/PERSISTENCE_CONTRACT.md](../architecture/PERSISTENCE_CONTRACT.md).
Summary: **two physical databases** — `CONTROL_DB` (control plane) and
`TENANT_DB_DEFAULT` (shared tenant-data plane) — with tenant isolation enforced by
mandatory `tenant_id` row predicates. There is **no** per-tenant physical D1 and
**no** `CONTROL_DB` fallback for tenant data.

### 11.1 Alpha topology

```
CONTROL_DB          tenants, tenant_databases, users, auth_identities, tenant_memberships
TENANT_DB_DEFAULT   work_units, action_previews, approval_records, workunit_feedback,
                    integration_connections, audit_logs, usage_events, usage_daily_summary
```

### 11.2 Local plan / apply / verify (hermetic, no retained state)

The unified runner (`scripts/cf-d1-migrate.mjs`, over the canonical manifest +
`__atra_d1_migrations` ledger) exposes three verbs with an explicit
local/staging separation. The **local** commands run against invocation-owned,
in-memory/temp SQLite databases and leave **no** local D1 state:

```bash
npm run cf:d1:migrate:plan-local      # deterministic per-binding plan (no IDs, no SQL)
npm run cf:d1:migrate:apply-local     # fresh apply + replay no-op + verify, then cleanup
npm run cf:d1:migrate:verify-local    # fresh apply + read-only schema/ledger verify
```

`apply-local` emits safe booleans: `fresh_apply`, `replay_noop`, `verify_ok`,
`cleanup`. It exits non-zero if any is false.

**Schema-version authority.** The runtime accepts exactly one
`tenant_databases.schema_version`: the **canonical** version declared by
`migrations/manifest.json` (`registry.TENANT_DB_DEFAULT.schemaVersion`, currently
`2`). Version `1` is the **pre-0006 schema and is routing-incompatible** — a v1
database is missing `action_previews.created_by_user_id`, which every
`ActionPreview` insert requires. The resolver rejects a v1 registry row with
`tenant_database_schema_unsupported` *before* any write; moving a v1 database
forward is a **migration requirement**, not a supported runtime state (run
`cf:d1:migrate:apply-*` to reach the canonical schema).

### 11.3 Staging plan / verify

```bash
npm run cf:d1:migrate:plan-staging    # offline plan (no network)
npm run cf:d1:migrate:verify-staging  # requires --remote (read-only remote schema)
```

`plan-staging` is fully offline. `verify-staging` is a remote read and requires
`--remote` (already wired into the script).

### 11.4 Explicit remote-apply authorization boundary

Remote mutation is a **separate, explicitly authorized** command:

```bash
npm run cf:d1:migrate:apply-staging   # apply --environment staging --remote --confirm-staging
```

The environment gate rejects: missing staging confirmation, `production`/unknown
environments, `--remote` on a local command, a staging command without `--remote`,
`--account`/`--project` supplied to an offline `plan`
(`context_assertion_not_allowed_for_plan`), an unconfigured trusted context
(`staging_context_unconfigured`), and a caller-asserted `--account`/`--project`
that disagrees with the trusted context (`unexpected_cloudflare_context`).

**Trusted staging context.** `--account` and `--project` are caller *assertions*,
not authority. The authoritative staging context is read from operator-provided,
staging-only environment variables **`CF_STAGING_ACCOUNT_ID`** and
**`CF_STAGING_PROJECT`** (never committed, never printed). A staging `apply` or
`verify` fails closed with `staging_context_unconfigured` when they are unset, and
with `unexpected_cloudflare_context` when a caller assertion disagrees. These
checks run in the **real** CLI path and are covered by CLI subprocess tests
(`tests/d1MigrationCli.test.mts`).

```bash
# Operator sets the trusted context for a staging run (values are examples):
export CF_STAGING_ACCOUNT_ID=...     # your staging Cloudflare account id
export CF_STAGING_PROJECT=...        # your staging Worker/project name
```

**Even with every flag valid and the trusted context matching, this command
performs no remote operation unless the operator ALSO sets the execution latch
`CF_D1_STAGING_EXECUTE=1`.** Without the latch it prints that the authorization
gate passed and exits **without touching the network**. This is deliberate: no PR
or CI run mutates a remote D1.

### 11.5 Migration rollback policy

Migrations are forward-only and append-only. `once` migrations are not reversible
in place (SQLite has no transactional `DROP COLUMN` guard). Rollback is a
forward-fix migration plus, if needed, a restore from a pre-apply D1 export.
Never edit a committed migration file — its `sha256` is pinned and a changed
checksum fails closed (see §11.6).

### 11.6 Checksum-drift response

If verification reports `digest_mismatch`, a committed migration's bytes no longer
match the manifest `sha256`. Do **not** force-apply. Restore the original bytes
(git), or, if the change is intentional, add a **new** append-only migration —
never mutate an applied one.

### 11.7 Failure recovery

- `apply` failing mid-lane: the ledger records a migration only after its DDL
  commits, so a failed migration is never recorded as applied. Re-run `apply`;
  the reconciler skips satisfied migrations and resumes at the first pending one.
- Unknown/inconsistent state (`schema_without_history`, `history_without_schema`,
  `foreign_binding`): verification fails closed and **no** destructive repair is
  attempted. Investigate with `verify` output (safe categories only).

### 11.8 Required evidence before deployment

1. `npm run cf:d1:migrate:plan-local` — plan reviewed.
2. `npm run cf:d1:migrate:apply-local` — `fresh_apply/replay_noop/verify_ok/cleanup` all true.
3. `node --test tests/d1MigrationRunner.test.mts tests/d1OperationalProof.test.mts
   tests/tenantDbResolver.test.mts tests/tenantIsolationRoutes.test.mts` — green.
4. An **authorized** `apply-staging` run (latch set by the operator) with its
   evidence pack (§10) independently reviewed.

### 11.9 Issue #155 closure criteria

Issue #155 stays **open** until an authorized staging plan → apply → verify has
been executed against a real staging D1 and its evidence independently reviewed.
The repository/local implementation criteria (contract documented + enforced, no
`CONTROL_DB` fallback, mandatory tenant scope, reproducible manifest + ledger,
fresh/replay/partial/checksum-drift proofs, cross-tenant isolation, hermetic local
proof) are met by this change; the staging-evidence criterion is the remaining
blocker. See
[../architecture/PERSISTENCE_CONTRACT.md](../architecture/PERSISTENCE_CONTRACT.md)
§9.
