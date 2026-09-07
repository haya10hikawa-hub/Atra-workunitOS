# Phase 6A: D1 Schema Integrity Inventory

**Status:** Inventory / Documentation only
**Commercial SaaS Production:** No-Go
**Electron Production Release:** No-Go
**External Execution:** No-Go

## Scope

A rigorous, read-only inventory of the current D1 schema, repository invariants,
tenant boundaries, and integrity assumptions — produced **before** any index /
constraint hardening (Phase 6B) or repository invariant enforcement (Phase 6C).

This phase adds **no production schema migrations**, no indexes, no constraints, and
no Electron implementation. It only documents and tests current assumptions.

Schema source of truth: `migrations/0001_control_db.sql` …
`migrations/0004_control_auth_workspace.sql` (applied via `wrangler d1 execute`).
There are no `CREATE TABLE` statements in application code.

## Current Tables

**Control DB** (global registry + routing + auth):

| Table | Purpose |
|-------|---------|
| `tenants` | tenant registry |
| `tenant_databases` | tenant → database routing |
| `users` | global user registry |
| `tenant_memberships` | user ↔ tenant role/status |
| `auth_identities` | provider identity → user |

**Tenant DB** (per-tenant data):

| Table | Purpose |
|-------|---------|
| `action_previews` | proposed action target/payload + hashes |
| `approval_records` | server-side approval records (one-time-use) |
| `work_units` | work units |
| `workunit_feedback` | feedback events |
| `integration_connections` | integration connection state (mode defaults to `fake`) |
| `audit_logs` | audit events |
| `usage_events` | usage events |
| `usage_daily_summary` | aggregated daily usage |

**Not present:** there is **no `sessions` table**. Sessions are resolved
statelessly per request from the Control DB `auth_identities` / `users` /
`tenant_memberships` (see `sessionResolver.ts`). No LLM/signal/processing tables are
persisted in D1 (LLM pipeline is in-memory / candidate-only).

## Current Columns

(Verbatim from migrations — abbreviated to integrity-relevant columns.)

- `action_previews`: `id` PK, `tenant_id` NOT NULL, `work_unit_id` NOT NULL,
  `action_type` (CHECK enum), `target_preview` DEFAULT `'{}'`, `payload_preview`
  DEFAULT `'{}'`, `requires_approval`, `status`, `target_hash` NOT NULL,
  `payload_hash` NOT NULL, `created_at`, `expires_at`.
- `approval_records`: `id` PK, `tenant_id` NOT NULL, `work_unit_id` NOT NULL,
  `action_preview_id` NOT NULL (FK → `action_previews(id)`), `action_type`,
  `target_hash` NOT NULL, `payload_hash` NOT NULL, `status` (CHECK
  `pending|approved|rejected|expired|used`), `approved_by_user_id`, `created_at`,
  `approved_at`, `expires_at` NOT NULL, `used_at`.
- `work_units`: `id` PK, `tenant_id` NOT NULL, plus content columns, `status`,
  timestamps.
- Control: `users(id, email UNIQUE, …)`, `tenant_memberships(id, tenant_id, user_id,
  role CHECK, status CHECK, UNIQUE(tenant_id,user_id))`,
  `auth_identities(id, user_id, provider, provider_subject, UNIQUE(provider,provider_subject))`.

## Current Primary Keys

- Single-column `id` PK on: `tenants`, `users`, `tenant_memberships`,
  `auth_identities`, `action_previews`, `approval_records`, `work_units`,
  `workunit_feedback`, `integration_connections`, `audit_logs`, `usage_events`.
- `tenant_databases`: PK `tenant_id`.
- `usage_daily_summary`: composite PK `(tenant_id, date, event_type)`.

## Current Unique Constraints

- `tenants.slug`, `tenant_databases.database_name`, `users.email`.
- `tenant_memberships(tenant_id, user_id)`.
- `auth_identities(provider, provider_subject)`.

## Current Indexes

- `action_previews`: `idx_action_previews_work_unit(work_unit_id)` — **no
  `tenant_id` prefix**.
- `approval_records`: `idx_approval_records_preview(action_preview_id)`,
  `idx_approval_records_status(status)`, `idx_approval_records_expires(expires_at)`
  — **none is `tenant_id`-prefixed**.
- `work_units`: `(tenant_id)`, `(created_at)`, `(source_provider)`.
- `workunit_feedback`: `(work_unit_id)`, `(tenant_id)`.
- `integration_connections`: `(tenant_id)`, `(tenant_id, provider)`.
- `audit_logs`: `(tenant_id)`, `(created_at)`, `(tenant_id, event_type)`.
- `usage_events`: `(tenant_id)`, `(tenant_id, event_type, created_at)`.
- `usage_daily_summary`: `(date)`.
- Control: `idx_tenants_slug`, membership `(tenant_id)/(user_id)/(role)/(status)`,
  auth identity `(user_id)/(provider, provider_subject)`.

## Current Foreign Keys

- `tenant_databases.tenant_id → tenants(id)`.
- `approval_records.action_preview_id → action_previews(id)`.
- `workunit_feedback.work_unit_id → work_units(id)`.
- `tenant_memberships.tenant_id → tenants(id)`, `.user_id → users(id)`.
- `auth_identities.user_id → users(id)`.
- **Absent:** `action_previews.work_unit_id` and `approval_records.work_unit_id`
  have no FK to `work_units(id)`. Tenant-DB `tenant_id` columns have no FK (the
  tenant registry lives in a separate Control DB — cross-database FK is not
  possible in D1).

## Tenant Boundary Model

- Every tenant-DB table carries `tenant_id NOT NULL`.
- **Tenant isolation is code-enforced, not DB-enforced.** D1 has no row-level
  security; every repository query binds `ctx.tenantId` into a `WHERE tenant_id = ?`
  clause. A query that omitted `tenant_id` would not be blocked by the database.
- Verified read paths (all tenant-scoped):
  - `approval_records`: `WHERE tenant_id = ? AND id = ?`,
    `WHERE tenant_id = ? AND action_preview_id = ? ORDER BY created_at DESC LIMIT 1`,
    `WHERE tenant_id = ? AND work_unit_id = ? ORDER BY created_at DESC`.
  - `action_previews`: `WHERE tenant_id = ? AND id = ?`,
    `WHERE tenant_id = ? AND work_unit_id = ? ORDER BY created_at DESC`.

## Repository Read Paths

| Table | Methods |
|-------|---------|
| `approval_records` | `findById`, `findByPreviewId`, `findByWorkUnitId` |
| `action_previews` | `findById`, `findByWorkUnitId` |
| `work_units` | `findById`, `findByWorkUnitId`-style list |
| `audit_logs` | `findByWorkUnitId` |
| `usage_events` | `getCurrentUsage`, `getDailySummary` |
| `integration_connections` | `findByProvider`, `listByTenant` |

All accept a `TenantDbContext` and bind `ctx.tenantId`.

## Repository Write Paths

| Table | Methods |
|-------|---------|
| `approval_records` | `create`, `updateStatus`, `markUsed` (Phase 5B atomic CAS) |
| `action_previews` | `create` (Phase 5D single-encode JSON) |
| `work_units` | `create`/upsert, status `update` |
| `usage_events` / `usage_daily_summary` | `record`, summary upsert |
| `integration_connections` | `upsert`, `updateStatus` |
| `audit_logs` / `workunit_feedback` | `create` |

No repository performs a hard `DELETE`; lifecycle is modeled via status columns.

## Approval Integrity Model

- One-time-use is enforced by the Phase 5B **atomic compare-and-set** `markUsed`:
  `UPDATE … SET status='used', used_at=? WHERE tenant_id=? AND id=? AND
  status='approved' AND used_at IS NULL AND expires_at > ?`. A claim is recognized
  via `meta.rows_written`.
- Verification binds the approval to a specific `action_preview` (Phase 5C):
  `approval.actionPreviewId === actionPreviewId`, hashes compared server-side
  against the stored preview, tenant/workUnit scoped. No latest/workUnit-only
  approval lookup is used for verification.
- `expires_at` is `NOT NULL`; status enum is CHECK-constrained.

## ActionPreview Integrity Model

- `target_preview` / `payload_preview` are JSON-string columns (DEFAULT `'{}'`).
- Phase 5D mapRow: serialize once (`toJsonColumn`), read verbatim only when it
  parses (`readJsonColumn`); a malformed row is treated as absent (`findById` →
  null, `findByWorkUnitId` skips), never fabricated.
- `target_hash` / `payload_hash` are `NOT NULL` and preserved exactly.

## WorkUnit Integrity Model

- `work_units.tenant_id NOT NULL`, indexed by `tenant_id`.
- `action_previews` / `approval_records` reference `work_unit_id` but **without** a
  DB-level FK (code-level coupling only). See Phase 6B recommendations.

## Audit / Session / Auth-Related Tables

- `audit_logs` is append-only (no update/delete path); tenant-scoped.
- **No `sessions` table.** Auth/session state is derived per request from
  `auth_identities` + `users` + `tenant_memberships` (Control DB). Role is
  normalized fail-closed (`normalizeRoleInput`).
- Membership `role` and `status`, tenant `status`, and identity uniqueness are
  CHECK/UNIQUE constrained at the DB level.

## Code-Enforced Invariants

(Enforced by application code / SQL predicates, **not** by table constraints.)

1. Tenant isolation (`WHERE tenant_id = ?` on every query).
2. Phase 5B one-time-use CAS (`status='approved' AND used_at IS NULL AND expires_at > now`).
3. Phase 5C explicit approval ↔ action-preview binding + server-side hash match.
4. Phase 5D safe JSON mapping / malformed-row-as-absent.
5. Phase 5E HMAC helper + explicit legacy SHA-256 verifier (helper-only; not wired to records).
6. Fail-closed role normalization; client-owned tenant/user/role/`approvedByPm` untrusted.

## DB-Enforced Invariants

1. Primary-key uniqueness (`id`, composite usage PK).
2. CHECK enums: `action_type`, approval `status`, membership `role`/`status`, tenant `status`, tenant_db `status`.
3. UNIQUE: `slug`, `email`, `database_name`, `(tenant_id,user_id)`, `(provider,provider_subject)`.
4. Declared FKs (see above).
5. NOT NULL: all `tenant_id`, hashes, `approval_records.expires_at`, etc.

## Missing DB Constraints

- No uniqueness preventing **multiple `approval_records` per `action_preview_id`**
  (Phase 5C resolves by most-recent `findByPreviewId`; a DB uniqueness rule would
  need explicit re-approval design — flagged as **needs-design**, possibly unsafe to
  add blindly).
- No DB enforcement of tenant isolation (by design — code-enforced).
- No CHECK that `used_at` is non-null iff `status='used'` (code-enforced via CAS).

## Missing Indexes

Every approval/preview query is `tenant_id`-prefixed, but the indexes are not:

- `action_previews`: missing `(tenant_id, id)` and `(tenant_id, work_unit_id)`.
- `approval_records`: missing `(tenant_id, id)`, `(tenant_id, action_preview_id)`,
  `(tenant_id, work_unit_id)`, `(tenant_id, status, used_at)` (markUsed CAS path),
  `(tenant_id, expires_at)`.

## Missing Foreign Keys

- `action_previews.work_unit_id → work_units(id)`.
- `approval_records.work_unit_id → work_units(id)`.
- (Cross-DB tenant FK is not possible; documented, not a defect.)

## Phase 6B Recommendations

Additive, migration-safe only (do **not** implement here):

1. Add tenant-prefixed composite indexes listed above (additive `CREATE INDEX IF NOT EXISTS`).
2. Consider `action_previews.work_unit_id` / `approval_records.work_unit_id` FKs —
   only if existing data guarantees referential integrity; otherwise document as
   future.
3. Evaluate (do not assume) a uniqueness/partial-index strategy for live approvals
   per preview; treat as needs-design.
4. No destructive migration, no column/table removal, no tenant-boundary weakening.

## Phase 6C Recommendations

1. The `FakeD1Database` test double does **not** enforce FK/CHECK/UNIQUE, so
   DB-enforced invariants are currently unverified by tests. Add repository-level
   tenant-boundary regression tests (wrong-tenant → null, missing-row → null,
   ambiguous/duplicate handling).
2. Prove `markUsed` CAS regression (already-used / expired / wrong-tenant fail).
3. Prove approval ↔ preview binding rejects mismatched pairs at the repository
   boundary.
4. Confirm dry-run remains non-consuming under repository-level tests.

## Electron Release Implications

The final release target is an Electron desktop app. This phase does **not**
implement Electron; it records the constraints so D1 integrity assumptions can later
be mapped to desktop/local/remote storage boundaries.

- Electron **renderer must not** directly own `tenantId` / `userId` / `role`
  decisions; these remain server/Control-DB authoritative.
- Electron **local storage must not be an approval source**.
- `ApprovalStore` / `approval_records` remain **server-authoritative** until a
  formally designed offline model exists.
- `ActionPreview` records may be **displayed** locally, but verification must use
  trusted server/database state (stored hashes, CAS, binding).
- Preload / IPC must expose **narrow commands only**.
- Node integration should stay **disabled** in the renderer in the future Electron
  app.
- Context isolation should be **required** in the future Electron app.
- External actions must still pass the **same server-side approval gates**.
- Desktop packaging must **not** include secrets, tenant-secret material, provider
  tokens, or API keys.
- If desktop local state is stale, approval state must still be re-verified against
  server/database truth (stale local state can never authorize an action).
- Offline mode, sync, and local encrypted storage are **future design topics**, not
  Phase 6A implementation.

## No-Go Boundaries

- Commercial SaaS production: **No-Go**.
- Electron production release: **No-Go**.
- External execution: **No-Go**.
- Live Real LLM integration / live provider adapter: **No-Go**.
- OAuth / token vault, real tenant-secret storage: **No-Go**.
- Billing, Supabase, local-first sync: **No-Go**.
- Phase 6B schema/index hardening: **future**.
- Phase 6C repository invariant enforcement: **future**.

Phase 5B CAS, Phase 5C approval-preview binding, Phase 5D ActionPreview JSON
hardening, and Phase 5E HMAC helper / explicit legacy compatibility all remain
intact and unchanged by this phase.

## Subagent Audits (Phase 6A merge gate)

Named specialized subagents are unavailable in this environment; equivalent
independent audits were performed with evidence against the committed diff.

- **SecurityAuditSubAgent — Go:** tenant boundary documented as code-enforced;
  approval/ActionPreview documented as server-authoritative; local/Electron state
  documented as untrusted; no Electron implementation; no external execution / live
  provider / provider SDK / `fetch` / secrets added; HMAC helper still reads no
  runtime env; `approvedByPm` not trusted; docs-only change.
- **ArchitectureAuditSubAgent — Go:** Phase 6A scope only (docs + tests); no Phase
  6B migration/index, no Phase 6C repository rewrite, no Electron; no Supabase /
  production routing; code-enforced vs DB-enforced invariants separated accurately.
- **TestAuditSubAgent — Go:** inventory + Electron constraints + No-Go positioning
  asserted; Phase 5B/5C/5D/5E regression guards re-asserted and still pass; full
  validation passes.
- **ProductGovernanceAuditSubAgent — Go:** all No-Go items preserved; Electron
  positioned as future target, not current implementation; no readiness overclaim.
- **GitHygieneAuditSubAgent — Go:** branch from latest `main` after PR #44 merge; no
  unrelated/generated files committed; the unrelated `desktop/` directory is not
  committed; changed files expected; commit message matches Phase 6A.
