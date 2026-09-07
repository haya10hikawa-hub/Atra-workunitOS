# Phase 6C: D1 Repository Invariant Enforcement

**Status:** Repository invariant enforcement + tenant-boundary regression
**Commercial SaaS Production:** No-Go
**Electron Production Release:** No-Go
**External Execution:** No-Go

## Scope

Verify and harden that every D1 repository operation on tenant-owned data is
tenant-scoped and fails closed on the wrong tenant, and that the Phase 5B–6B safety
invariants hold at the repository boundary. One minimal code fix was required
(`workUnitRepository.updateStatus`); everything else was already fail-closed and is
now covered by behavioral regression tests.

## Repository Invariants

- Reads return only the caller's tenant rows (`null` / `[]` for other tenants).
- Writes/updates affect only the caller's tenant rows; a wrong-tenant write mutates
  nothing.
- Approval one-time-use stays atomic (Phase 5B CAS).
- Approval verification stays bound to a specific ActionPreview (Phase 5C).
- ActionPreview malformed JSON stays fail-safe (Phase 5D).

## Tenant Boundary Rules

| Repository | Read scoping | Write scoping |
|------------|--------------|---------------|
| `approval_records` | SQL `WHERE tenant_id = ?` (findById / findByPreviewId / findByWorkUnitId) | SQL `tenant_id = ?` (updateStatus, markUsed CAS) |
| `action_previews` | SQL `WHERE tenant_id = ?` (findById / findByWorkUnitId) | INSERT carries `tenant_id` |
| `work_units` | code post-filter `row.tenantId === ctx.tenantId` (findById / listRecent) | **updateStatus now `WHERE id = ? AND tenant_id = ?` (Phase 6C fix)** |
| `workunit_feedback` | code post-filter | INSERT carries `tenant_id` |
| `audit_logs` | code post-filter (listRecent / findByWorkUnitId) | append carries `tenant_id` |
| `usage_events` / `usage_daily_summary` | code post-filter / SQL `tenant_id = ?` | INSERT/upsert carry `tenant_id` |
| `integration_connections` | SQL `WHERE tenant_id = ?` | upsert carries `tenant_id` |

### Phase 6C fix

`D1WorkUnitRepository.updateStatus` previously issued
`UPDATE work_units SET status = ?, updated_at = ? WHERE id = ?` — **without a tenant
guard**. A wrong-tenant caller therefore mutated another tenant's row (the
post-filtered `findById` only masked the result, after the row had already changed).
It is now `WHERE id = ? AND tenant_id = ?`, so a wrong-tenant update affects zero
rows. No other repository write had this gap.

## ApprovalRecord Invariants

- `findById` / `findByPreviewId` / `findByWorkUnitId`: tenant-scoped; wrong tenant →
  `null` / `[]`.
- `updateStatus`: tenant-scoped; wrong tenant does not mutate.
- `markUsed`: Phase 5B atomic CAS — claims only an `approved`, `used_at IS NULL`,
  unexpired, tenant-matched row; returns `null` (no claim) otherwise; concurrent
  callers yield exactly one success.

## ActionPreview Invariants

- `findById` / `findByWorkUnitId`: tenant-scoped; wrong tenant → `null` / `[]`.
- Malformed stored JSON → row treated as absent (`null` / skipped), never
  fabricated (Phase 5D).

## WorkUnit Invariants

- `findById` / `listRecent`: fail-closed per-row tenant filter.
- `updateStatus`: tenant-scoped UPDATE (Phase 6C fix above).

## Audit / Usage / Integration Invariants

- `audit_logs` reads (`listRecent`, `findByWorkUnitId`) post-filter by tenant;
  append carries `tenant_id`. Audit is append-only (no update/delete path).
- `usage` reads post-filter / are tenant-bound; writes carry `tenant_id`.
- `integration_connections` reads are SQL tenant-scoped.

## FakeD1 Limitations

`FakeD1Database` is a simplified map-backed double. It does **not** enforce FK /
CHECK / UNIQUE constraints and does not use indexes, but it does model conditional
`UPDATE` semantics and `rows_written` (added in Phase 5B), which is sufficient to
test tenant-scoped UPDATE/CAS behavior. DB-level constraint enforcement (FK/CHECK/
UNIQUE) is therefore validated by migration-text contract tests (Phase 6B), not by
FakeD1.

## Behavioral Regression Coverage

`tests/d1RepositoryInvariantEnforcement.test.mts` exercises (against FakeD1):
correct-vs-wrong-tenant `findById` / `findByPreviewId` / `findByWorkUnitId` for
approvals and previews; `updateStatus` wrong-tenant no-mutation for approvals and
work units; markUsed CAS success/wrong-tenant/already-used/pending/rejected/expired/
concurrent; ActionPreview malformed-JSON fail-safe.

## Source-Scan Regression Coverage

Pins: tenant-scoped approval/workUnit update SQL; no latest/workUnit-only approval
verification; Phase 5C binding; Phase 5D JSON helpers (no raw `JSON.parse` in the
repo); Phase 5E HMAC no-env; Phase 6B migration additive-only; no Electron
dependency; dry-run non-consuming.

## Phase 6B Migration Preservation

`migrations/0005_tenant_scoped_indexes.sql` is unchanged. Phase 6B indexes are
preserved; no migration is added in Phase 6C.

## Electron Release Implications

- Approval records remain **server-authoritative**.
- ActionPreview records remain **server-authoritative for verification**.
- Local desktop state is **not** an approval source.
- Renderer must not own tenant/user/role decisions.
- Electron is **not** implemented.

## Remaining Risks

- Tenant isolation for several read paths is **code-enforced** (post-filter), not
  SQL-scoped; a future repository refactor should prefer SQL `WHERE tenant_id = ?`
  for index use and defense-in-depth.
- Missing `work_unit_id` FKs and approval uniqueness remain **future work** (not
  addressed here).
- FakeD1 cannot prove DB-level FK/CHECK/UNIQUE behavior.

## Phase 7 Handoff

Repository invariants and tenant-boundary regressions are now covered; Phase 7A can
build the alpha release safety checklist / Go-No-Go matrix on top of this.

## No-Go Boundaries

- Phase 6B indexes are preserved.
- Missing FK / uniqueness constraints remain future work unless intentionally
  addressed.
- External execution: **No-Go**. Live provider / OAuth-token-vault / billing /
  Supabase: **No-Go**.
- Commercial SaaS production: **No-Go**. Electron production release: **No-Go**.

Phase 5B CAS, Phase 5C approval-preview binding, Phase 5D ActionPreview JSON
hardening, Phase 5E HMAC helper / explicit legacy compatibility, Phase 6A Electron
constraints, and Phase 6B migration/index contract all remain intact.

## Subagent Audits (Phase 6C merge gate)

Named specialized subagents are unavailable in this environment; equivalent
independent audits were performed with evidence against the committed diff.

- **SecurityAuditSubAgent — Go:** wrong-tenant reads fail closed (null/[]);
  wrong-tenant updates fail closed (workUnit updateStatus now tenant-scoped, no
  mutation); markUsed CAS tenant-scoped/one-time; approval-preview binding intact;
  ActionPreview malformed JSON fail-safe; HMAC helper reads no runtime env; no
  Electron; local/Electron state untrusted; no external execution / live provider /
  provider SDK / `fetch` / secrets; `approvedByPm` not trusted.
- **ArchitectureAuditSubAgent — Go:** Phase 6C scope only (one minimal repo fix +
  tests + docs); no Phase 7; no Electron; no new migration; Phase 6B indexes
  preserved; no Supabase / production routing; repository/domain boundaries intact.
- **TestAuditSubAgent — Go:** behavioral wrong-tenant read/write tests and markUsed
  CAS regressions exist (not source-scan only); Phase 5B/5C/5D/5E/6A/6B guards still
  pass; full validation passes.
- **ProductGovernanceAuditSubAgent — Go:** all No-Go items preserved; Electron
  positioned as future target; no readiness overclaim.
- **GitHygieneAuditSubAgent — Go:** branch from latest `main` after PR #46 merge; no
  unrelated/generated files committed; `desktop/` not committed; commit message
  matches Phase 6C.
