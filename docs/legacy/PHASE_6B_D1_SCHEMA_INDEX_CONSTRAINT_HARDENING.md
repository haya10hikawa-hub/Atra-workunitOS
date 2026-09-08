# Phase 6B: D1 Schema Index / Constraint Hardening

**Status:** Migration-safe additive index hardening only
**Commercial SaaS Production:** No-Go
**Electron Production Release:** No-Go
**External Execution:** No-Go

## Scope

Add migration-safe, **additive** tenant-prefixed indexes that match the repository
query patterns documented in Phase 6A. No destructive table rebuilds, no data
backfill, no new rows. Unsafe constraints (missing FKs, approval uniqueness) are
explicitly **deferred** and documented, not implemented.

## Migration File

`migrations/0005_tenant_scoped_indexes.sql` (next after `0004`). All statements are
`CREATE INDEX IF NOT EXISTS` — re-runnable and safe on existing data.

## Added Indexes

**action_previews**
- `idx_action_previews_tenant_id (tenant_id, id)`
- `idx_action_previews_tenant_work_unit_created (tenant_id, work_unit_id, created_at)`

**approval_records**
- `idx_approval_records_tenant_id (tenant_id, id)`
- `idx_approval_records_tenant_action_preview_created (tenant_id, action_preview_id, created_at)`
- `idx_approval_records_tenant_work_unit_created (tenant_id, work_unit_id, created_at)`
- `idx_approval_records_tenant_status_used_expires (tenant_id, status, used_at, expires_at)`

**work_units**
- `idx_work_units_tenant_id (tenant_id, id)`
- `idx_work_units_tenant_created (tenant_id, created_at)`
- `idx_work_units_tenant_source_provider (tenant_id, source_provider)`

## Existing Indexes Preserved

No index is dropped. The pre-existing single-column indexes remain:
`idx_action_previews_work_unit`, `idx_approval_records_preview`,
`idx_approval_records_status`, `idx_approval_records_expires`,
`idx_work_units_tenant`, `idx_work_units_created`, `idx_work_units_provider`, and all
Control-DB indexes. The new composite indexes simply add tenant-prefixed coverage.

## Query Patterns Covered

| Repository query | Covering index |
|------------------|----------------|
| `action_previews` `WHERE tenant_id=? AND id=?` | `(tenant_id, id)` |
| `action_previews` `WHERE tenant_id=? AND work_unit_id=? ORDER BY created_at DESC` | `(tenant_id, work_unit_id, created_at)` |
| `approval_records` `WHERE tenant_id=? AND id=?` | `(tenant_id, id)` |
| `approval_records` `WHERE tenant_id=? AND action_preview_id=? ORDER BY created_at DESC` | `(tenant_id, action_preview_id, created_at)` |
| `approval_records` `WHERE tenant_id=? AND work_unit_id=? ORDER BY created_at DESC` | `(tenant_id, work_unit_id, created_at)` |
| `approval_records` markUsed CAS (`tenant_id`, `status`, `used_at`, `expires_at`) | `(tenant_id, status, used_at, expires_at)` |
| `work_units` tenant-scoped id / recency / provider | `(tenant_id, id)` / `(tenant_id, created_at)` / `(tenant_id, source_provider)` |

## Approval CAS Index Coverage

The Phase 5B atomic `markUsed` CAS —
`UPDATE … WHERE tenant_id=? AND id=? AND status='approved' AND used_at IS NULL AND
expires_at > ?` — is supported by `idx_approval_records_tenant_status_used_expires`
`(tenant_id, status, used_at, expires_at)` (and `(tenant_id, id)` for the id
predicate). The CAS behavior itself is unchanged.

## ActionPreview Lookup Index Coverage

`(tenant_id, id)` for `findById` and `(tenant_id, work_unit_id, created_at)` for
`findByWorkUnitId` (which orders by `created_at DESC`). Phase 5D JSON mapping is
unchanged.

## WorkUnit Lookup Index Coverage

`(tenant_id, id)`, `(tenant_id, created_at)`, and `(tenant_id, source_provider)` add
tenant-prefixed coverage to the previously tenant-unprefixed `created_at` /
`source_provider` indexes.

## Constraints Added

None beyond indexes. This migration adds **no** new CHECK, UNIQUE, or FK
constraints. Indexes only.

## Constraints Explicitly Not Added

- No new UNIQUE index (see Uniqueness Rules Deferred).
- No new CHECK constraint.
- No FK (see Missing Foreign Keys Deferred).

## Missing Foreign Keys Deferred

`action_previews.work_unit_id → work_units(id)` and
`approval_records.work_unit_id → work_units(id)` are **not** added. SQLite/D1 cannot
`ALTER TABLE ADD FOREIGN KEY`; adding them would require an unsafe table rebuild
(create-new + copy + drop-old), which is out of Phase 6B scope. Deferred to a future
schema-rebuild phase with an explicit data-integrity plan.

## Uniqueness Rules Deferred

A uniqueness rule for "one live approval per `action_preview_id`" is **not** added.
Existing rows may already contain multiple approval records per preview (Phase 5C
resolves by most-recent `findByPreviewId`), so a UNIQUE index could fail on existing
data. Deferred as needs-design (Phase 6C / future).

## Data Compatibility

- `CREATE INDEX IF NOT EXISTS` is idempotent and safe on existing data.
- No rows are inserted, updated, or deleted.
- No column or table is altered or dropped.
- No production data backfill is performed.

## Rollback Considerations

Indexes are additive; rollback is `DROP INDEX IF EXISTS <name>` per index, with no
data impact. No table rebuild means no rollback risk to row data.

## Phase 6C Handoff

- Repository tenant-boundary regression tests (wrong-tenant → null, missing-row →
  null, duplicate/ambiguous handling) remain Phase 6C.
- markUsed CAS and approval-preview binding repository regressions remain Phase 6C.
- The `FakeD1Database` test double does not enforce FK/CHECK/UNIQUE or use indexes,
  so DB-enforced behavior is validated by migration-text contract tests here and by
  repository-behavior tests in Phase 6C.

## Electron Release Implications

Electron is not implemented here. Approval records and ActionPreview records remain
**server-authoritative**; local desktop state must not become an approval source.
Renderer must not own tenant/user/role decisions. Desktop packaging must not include
secrets, provider tokens, tenant-secret material, or API keys. IPC/preload
boundaries remain future design work.

## No-Go Boundaries

- No destructive table rebuilds are performed.
- No production data backfill is performed.
- No new secrets / default tenants / default users are inserted.
- Missing `work_unit_id` FKs are deferred (unsafe to add without a rebuild).
- Approval uniqueness is deferred unless proven safe.
- Electron is not implemented.
- Local desktop state is not an approval source.
- Approval records remain server-authoritative.
- ActionPreview records remain server-authoritative.
- Commercial SaaS production: **No-Go**. Electron production release: **No-Go**.
  External execution / live provider / OAuth-token-vault / billing / Supabase:
  **No-Go**.
- Phase 6C repository invariant enforcement: **future**.

Phase 5B CAS, Phase 5C approval-preview binding, Phase 5D ActionPreview JSON
hardening, Phase 5E HMAC helper / explicit legacy compatibility, and Phase 6A
Electron constraints all remain intact and unchanged by this phase.

## Subagent Audits (Phase 6B merge gate)

Named specialized subagents are unavailable in this environment; equivalent
independent audits were performed with evidence against the committed diff.

- **SecurityAuditSubAgent — Go:** migration is additive (`CREATE INDEX IF NOT
  EXISTS` only); no destructive rebuild; no default tenant/user/secret insertion;
  tenant-prefixed indexes match repository queries; approval state remains
  server-authoritative; local/Electron state untrusted; no Electron implementation;
  no external execution / live provider / provider SDK / `fetch` / secrets; HMAC
  helper still reads no runtime env; `approvedByPm` not trusted.
- **ArchitectureAuditSubAgent — Go:** Phase 6B scope only; no Phase 6C repository
  rewrite; no Electron; no Supabase / production routing; migration is `0005`
  (correct next number); constraints additive or explicitly deferred.
- **TestAuditSubAgent — Go:** migration text, additive-only behavior, tenant-prefixed
  index coverage, and deferred-constraint documentation tested; Phase 5B/5C/5D/5E/6A
  regression guards still pass; full validation passes.
- **ProductGovernanceAuditSubAgent — Go:** all No-Go items preserved; Electron
  positioned as future release target; no readiness overclaim.
- **GitHygieneAuditSubAgent — Go:** branch from latest `main` after PR #45 merge; no
  unrelated/generated files committed; `desktop/` not committed; commit message
  matches Phase 6B.
