# Alpha D1 Persistence Contract

> Status: **Alpha** · Patch: **P0-FIX-D1-OPERATIONAL-CONTRACT** · Related: Issue #155
>
> This document is the single, canonical source for how WorkUnit OS persists
> data on Cloudflare D1 during Alpha. It is enforced by code and tests, not by
> convention. Where the runtime, the migration tooling, and this document could
> disagree, the code + tests win and this document must be corrected.

## 1. Alpha topology (the two-database model)

```
CONTROL_DB           = global control plane (one physical D1)
TENANT_DB_DEFAULT    = shared tenant data plane (one physical D1)
                       tenant isolation = mandatory tenant_id row predicates
```

All active Alpha tenants share the **same physical** `TENANT_DB_DEFAULT`.
Isolation is enforced by a mandatory `tenant_id` predicate on every tenant-data
read/update/delete and a server-written `tenant_id` on every insert — **not** by
a separate physical database per tenant.

Per-tenant physical D1 provisioning is **explicitly out of scope** for this
contract (see §8). This task does not, and must not, introduce dynamic physical
D1 creation per tenant.

## 2. Binding contract

Only two D1 bindings exist, and they are fixed, allowlisted names:

| Binding             | Role                                   |
| ------------------- | -------------------------------------- |
| `CONTROL_DB`        | control plane / registry validation    |
| `TENANT_DB_DEFAULT` | shared tenant-data plane               |

- No binding name is ever constructed from tenant input.
- The resolver may return **only** `TENANT_DB_DEFAULT` as the tenant-data handle
  (`TENANT_DATA_BINDING` in `app/lib/persistence/repositories.ts`).
- `CONTROL_DB` is **never** returned as a tenant-data handle and is **never** a
  fallback for tenant-scoped domain data.

## 3. Database ownership

Ownership is machine-checked against `migrations/schema-contract.json` and proven
by `tests/d1OperationalProof.test.mts`.

### CONTROL_DB (control plane)

| Table                | Notes                                             |
| -------------------- | ------------------------------------------------- |
| `tenants`            | tenant registry (id, name, slug, status)          |
| `tenant_databases`   | routing registry: tenant → data DB + schema/status |
| `users`              | global user identities                            |
| `auth_identities`    | external identity → user linkage                  |
| `tenant_memberships` | user ↔ tenant role membership                     |

Control-plane tables are the authoritative source of tenant existence,
membership, role, and the tenant→database mapping. No tenant *domain* table lives
in `CONTROL_DB`.

### TENANT_DB_DEFAULT (shared tenant-data plane)

| Table                    | Tenant scope column |
| ------------------------ | ------------------- |
| `work_units`             | `tenant_id`         |
| `action_previews`        | `tenant_id`         |
| `approval_records`       | `tenant_id`         |
| `workunit_feedback`      | `tenant_id`         |
| `integration_connections`| `tenant_id`         |
| `audit_logs`             | `tenant_id`         |
| `usage_events`           | `tenant_id`         |
| `usage_daily_summary`    | `tenant_id`         |

Every tenant-data table carries a `tenant_id` scope column. These are the tables
backing `workUnitRepository`, `actionPreviewRepository`, approval/feedback,
inbox/signal, task, execution-result, integration, audit, and usage persistence.

The migration ledger table `__atra_d1_migrations` exists in both physical
databases as **infrastructure** (created by the apply mechanism, exempt from the
schema-ownership contract).

## 4. Tenant DB resolution (fail-closed)

`D1TenantDbResolver` (`app/lib/persistence/tenantDbResolver.ts`) validates the
control plane and returns a typed result **only** when every check passes:

```
{ ok: true, ctx: { tenantId, db: <TENANT_DB_DEFAULT handle> },
  binding: "TENANT_DB_DEFAULT", schemaVersion: "<supported>" }
```

Otherwise it returns a stable, disclosure-free `reason`. No raw tenant id,
database id/name, SQL, or binding object is ever placed in a reason.

### Fail-closed categories

| Reason (contract)                     | Meaning                                            |
| ------------------------------------- | -------------------------------------------------- |
| `tenant_context_required`             | no authenticated tenant context supplied           |
| `tenant_not_found`                    | tenant absent from `CONTROL_DB`                    |
| `tenant_inactive`                     | tenant present but not `active`                    |
| `tenant_database_mapping_missing`†    | no `tenant_databases` row for the tenant           |
| `tenant_database_mapping_inactive`†   | mapping present but not `active`                   |
| `tenant_database_schema_unsupported`  | mapping `schema_version` outside the supported set |
| `tenant_database_binding_missing`     | expected `TENANT_DB_DEFAULT` binding absent (503)  |

† **Wire-stable equivalence.** These contract names predate the resolver's
existing, widely-tested return values. The resolver returns the historical names,
which are the stable wire values:

```
tenant_database_mapping_missing   ≡  database_not_found
tenant_database_mapping_inactive  ≡  database_inactive
(malformed mapping record)        →  database_invalid
(control-plane query threw)       →  resolution_failed
```

New categories (`tenant_context_required`, `tenant_database_schema_unsupported`,
`tenant_database_binding_missing`) are returned directly.

### Resolution invariants

1. `CONTROL_DB` is never returned as a fallback.
2. A request-supplied binding name is never trusted; only the allowlisted
   `TENANT_DB_DEFAULT` may be returned.
3. The tenant id originates from the authenticated session/membership result.
4. Role and tenant remain authoritative from `CONTROL_DB`.
5. A missing binding produces a controlled 503-style application error.
6. No raw database/configuration value appears in any error.

### Supported schema versions (manifest is the authority)

There is **exactly one** supported version: the canonical version declared by the
migration manifest at `migrations/manifest.json`
(`registry.TENANT_DB_DEFAULT.schemaVersion`, currently **`"2"`**). It is not a
hand-maintained list — `SUPPORTED_TENANT_SCHEMA_VERSIONS` is derived from
`getCanonicalTenantSchemaVersion()` (a bundle-safe committed constant in
`app/lib/persistence/tenantSchemaVersion.ts`), and a test mechanically asserts the
constant cannot drift from the manifest.

- `"2"` is the **current canonical Alpha version** (includes
  `action_previews.created_by_user_id`, added by migration 0006).
- `"1"` is **migration-required and routing-incompatible**: it is the pre-0006
  schema, and `D1ActionPreviewRepository.create()` always inserts
  `created_by_user_id`, so routing a request to a v1 database would fail at
  runtime on the missing column. Version `"1"` is therefore **rejected**, not
  accepted for compatibility.

Any `schema_version` outside the supported set — including `"1"` — fails closed
with `tenant_database_schema_unsupported`, before any repository write is
attempted. A test builds a real pre-0006 SQLite database and proves both the
rejection and that the write genuinely could not have succeeded.

### Registry ↔ migration-evidence coupling

Routing may succeed only when the registry `schema_version` equals the canonical
runtime version. `verifyRegistryCoupling()` additionally checks the ledger
reconciles and the physical schema matches the contract, returning safe booleans
`registry_version_matches_manifest`, `ledger_matches_manifest`,
`physical_schema_matches_contract` (no registry value, SQL, or IDs).

## 5. Repository tenant-scope enforcement

Every tenant-data repository method takes a `TenantDbContext` and:

- **reads/updates/deletes** include a `tenant_id = ctx.tenantId` predicate;
- **inserts** write `ctx.tenantId` from server code — the request body's tenant
  label is ignored;
- cross-tenant parent references are rejected at the persistence-service boundary
  (`relationshipEnforcedRepositories.ts`).

Proven (`tests/d1OperationalProof.test.mts`, `tests/tenantIsolationRoutes.test.mts`):

```
tenant A cannot read    tenant B   (findById scoped by tenant_id)
tenant A cannot update  tenant B   (UPDATE scoped by tenant_id)
tenant A cannot delete  tenant B   (DELETE scoped by tenant_id)
tenant A cannot insert  as B       (server writes ctx.tenantId)
```

## 6. Migration model

### Manifest (`migrations/manifest.json`)

Two independent lanes, one per binding. Every committed migration appears in
exactly one lane with `sequence`, `path`, pinned `sha256`, `kind`, and `apply`
policy (`replay_safe` | `once`). Migration SQL is immutable after the manifest is
introduced; changes are append-only. Validation fails closed on: duplicate order,
missing file, path escape, checksum drift, wrong lane, or an unknown file.

### Ledger (`__atra_d1_migrations`)

An applied-once history table in each physical database recording only
`binding, sequence, path, sha256, applied_at` — never secrets or rows.

| Scenario         | Behavior                                                       |
| ---------------- | -------------------------------------------------------------- |
| Fresh database   | all lane migrations apply in canonical order                   |
| Replay           | second apply is a no-op (ledger-skipped; schema unchanged)     |
| Partial upgrade  | already-applied prefix skipped; only missing migrations apply  |
| Checksum drift   | a changed checksum on an applied migration **fails closed**    |
| Unknown state    | verification fails closed; **no** destructive repair attempted |

Idempotence is **not** achieved by ignoring SQL errors — it is achieved by the
ledger reconciling the manifest against the recorded history and the real schema.

## 7. Runtime routing

- Production authority is chosen structurally from the frozen request runtime
  config (`routeRepositories.ts` → `resolveProductionRepositories`, resolver
  mandatory). The raw Cloudflare env is read once per request; `process.env`
  never overrides the active request env.
- A Cloudflare D1 runtime env can never be converted directly into a repository
  bundle — registry validation via the resolver is mandatory.
- Local/test direct binding lives only behind the explicitly named
  `resolveLocalRepositories` API and is never reachable in production.

### Trusted staging context (migration CLI)

Repository/local migration implementation is complete. Staging is exposed as a
`preflight` command only; **remote staging verify/apply is NOT implemented in this
PR** (`apply`/`verify --environment staging` fail closed with
`staging_remote_execution_not_available`). A later, independently audited PR adds
the authorized remote executor.

The `cf:d1:migrate` CLI treats `--account` / `--project` as **caller assertions,
not authority**. The trusted Cloudflare staging context comes from
operator-provided, staging-only environment variables **`CF_STAGING_ACCOUNT_ID`**
and **`CF_STAGING_PROJECT`** — BOTH are authoritative and required, never
committed, never printed. `preflight --environment staging` classifies them:

| Condition                                          | Result                                 |
| -------------------------------------------------- | -------------------------------------- |
| neither configured                                 | `staging_context_unconfigured`         |
| exactly one configured                             | `staging_context_incomplete`           |
| both configured but malformed (format/bounds)      | `staging_context_invalid`              |
| both valid; caller asserts a disagreeing value     | `unexpected_cloudflare_context`        |
| both valid; caller asserts only one of account/project | `staging_context_assertion_incomplete` |
| both valid; caller assertions match (or absent)    | preflight passes (offline, no network) |

Validation is bounded and disclosure-free: trimmed, non-empty, length-capped, no
control characters; the account id matches Cloudflare's 32-hex form and the
project name a conservative allowlist. `plan` is offline and context-free
(supplying `--account`/`--project`/`--remote` fails closed). Local commands never
require staging context. This is proven by real CLI **subprocess** tests
(`tests/d1MigrationCli.test.mts`), not only by unit tests.

## 8. Future boundary (out of scope here)

Per-tenant **physical** D1 provisioning is a separate migration plan. It would
introduce dynamic tenant→physical-database routing, per-database bootstrap, and a
provisioning lifecycle. None of that is implemented in this contract; the shared
`TENANT_DB_DEFAULT` with mandatory `tenant_id` isolation is the whole Alpha model.

## 9. Issue #155 closure criteria

Issue #155 ("Tenant/D1 runtime setup is not operationally integrated or
reproducible from docs") may be closed only when **all** of the following hold:

1. This contract is documented (here) and enforced by code + tests.
2. `CONTROL_DB` is never a tenant-data fallback (resolver + repository proofs).
3. Every tenant-data path requires tenant context.
4. The migration manifest + ledger are reproducible: fresh / replay /
   partial-upgrade / checksum-drift proofs pass locally.
5. Cross-tenant read/write/update/delete isolation passes.
6. The registry row is coupled to migration evidence: the operational proof reads
   the ACTUAL `tenant_databases.schema_version` and requires it to agree with the
   manifest, the routed tenant DB's ledger, and its physical schema contract.
7. The local operational proof passes hermetically with no retained state, and an
   offline staging **preflight** validates the staging authority contract.
8. A later, **independently audited** PR implements the remote executor, and an
   **authorized remote staging** plan → apply → verify is executed against a real
   staging D1 with its evidence independently reviewed.

Items 1–7 are satisfied by this change and its tests. **Item 8 requires a
separate, explicitly authorized remote executor + staging execution** (NOT
implemented in this PR; `apply`/`verify --environment staging` fail closed) and is
the remaining blocker; Issue #155 stays **open** until that evidence exists.
