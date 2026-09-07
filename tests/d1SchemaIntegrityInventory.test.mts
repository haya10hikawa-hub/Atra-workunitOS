/**
 * Phase 6A: D1 schema integrity inventory.
 *
 * This is an inventory/documentation phase, so these are source-scan and
 * documentation-contract tests: they pin the current tenant-scoped repository
 * shape, confirm the Phase 5B/5C/5D/5E guards still exist, and assert the
 * inventory doc records the required boundaries (including Electron constraints).
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const APPROVAL_REPO = "app/lib/persistence/d1/approvalRecordRepository.ts"
const PREVIEW_REPO = "app/lib/persistence/d1/actionPreviewRepository.ts"
const WORKUNIT_REPO = "app/lib/persistence/d1/workUnitRepository.ts"
const ROW_HELPERS = "app/lib/persistence/d1/rowHelpers.ts"
const HASH = "app/lib/security/hash.ts"
const TENANT_SECRET = "app/lib/security/tenantSecret.ts"
const BINDING = "app/lib/security/approvalPreviewBinding.ts"
const DRY_RUN = "app/api/workunit/[id]/execution/dry-run/route.ts"
const DOC = "docs/legacy/PHASE_6A_D1_SCHEMA_INTEGRITY_INVENTORY.md"

async function read(path: string): Promise<string> {
  return readFile(path, "utf8")
}

// ─── Tenant-scoped repository read paths (1-4) ──────────────────

test("2. approval_records reads are tenant-scoped", async () => {
  const src = await read(APPROVAL_REPO)
  // Every SELECT/UPDATE binds tenant_id.
  const selects = src.match(/SELECT \* FROM approval_records[\s\S]*?(?=`)/g) ?? []
  assert.ok(selects.length > 0)
  for (const s of selects) assert.ok(s.includes("tenant_id = ?"), `query not tenant-scoped: ${s}`)
})

test("3. action_previews reads are tenant-scoped", async () => {
  const src = await read(PREVIEW_REPO)
  const selects = src.match(/SELECT \* FROM action_previews[\s\S]*?(?=`)/g) ?? []
  assert.ok(selects.length > 0)
  for (const s of selects) assert.ok(s.includes("tenant_id = ?"), `query not tenant-scoped: ${s}`)
})

test("1 & 4. work_units repository binds tenant_id", async () => {
  const src = await read(WORKUNIT_REPO)
  assert.ok(src.includes("tenant_id"), "work_units repo must reference tenant_id")
})

// ─── No latest/workUnit-only approval verification (5) ──────────

test("5. dry-run verification uses explicit binding, not latest/workUnit-only approval", async () => {
  const src = await read(DRY_RUN)
  assert.equal(src.includes("findByWorkUnitId"), false)
  assert.equal(/latest\s*approval/i.test(src), false)
  assert.ok(src.includes("verifyApprovalPreviewBinding"))
  assert.ok(src.includes("findByPreviewId"))
})

// ─── Phase 5B/5C/5D/5E guards still present (6-10) ──────────────

test("6. approval markUsed CAS path still exists", async () => {
  const src = await read(APPROVAL_REPO)
  assert.ok(/status = 'approved'/.test(src))
  assert.ok(/used_at IS NULL/i.test(src))
  assert.ok(/expires_at\s*>\s*\?/.test(src))
  assert.ok(src.includes("rows_written"))
})

test("7. approval-preview binding path still exists", async () => {
  const binding = await read(BINDING)
  assert.ok(binding.includes("verifyApprovalPreviewBinding"))
  const store = await read("app/lib/security/approvalStore.ts")
  assert.ok(store.includes("record.actionPreviewId !== input.actionPreviewId"))
})

test("8. ActionPreview mapRow safe JSON helpers still exist", async () => {
  const repo = await read(PREVIEW_REPO)
  assert.ok(repo.includes("readJsonColumn") && repo.includes("toJsonColumn"))
  assert.equal(repo.includes("JSON.parse"), false)
  const helpers = await read(ROW_HELPERS)
  assert.ok(helpers.includes("export function readJsonColumn") && helpers.includes("export function toJsonColumn"))
})

test("9. HMAC helper does not read runtime env", async () => {
  const src = await read(HASH)
  assert.equal(src.includes("process.env"), false)
  assert.ok(src.includes("computeTenantHmacSha256Hash") && src.includes("verifyHashBinding"))
})

test("10. TenantSecretProvider remains interface-only / non-production", async () => {
  const src = await read(TENANT_SECRET)
  assert.ok(src.includes("interface TenantSecretProvider"))
  assert.equal(src.includes("class "), false)
  assert.equal(src.includes("process.env"), false)
})

// ─── No external execution / SDK / network added (11,12) ────────

test("11 & 12. inventory adds no external execution / provider SDK / fetch", async () => {
  for (const f of [DOC]) {
    const src = await read(f)
    // Doc may mention these as No-Go words but must not contain code-like calls.
    assert.equal(src.includes("fetch("), false)
    assert.equal(src.includes("import "), false)
  }
})

// ─── Documentation contract (13-18) ─────────────────────────────

test("13. docs include Electron release implications", async () => {
  const doc = await read(DOC)
  assert.ok(doc.includes("## Electron Release Implications"))
})

test("14. docs say local desktop state must not be an approval source", async () => {
  const doc = await read(DOC)
  assert.ok(/local storage must not be an approval source/i.test(doc))
  assert.ok(/server-authoritative/i.test(doc))
})

test("15. docs include Phase 6B recommendations", async () => {
  const doc = await read(DOC)
  assert.ok(doc.includes("## Phase 6B Recommendations"))
  assert.ok(/tenant.*prefixed composite index|composite index/i.test(doc))
})

test("16. docs include Phase 6C recommendations", async () => {
  const doc = await read(DOC)
  assert.ok(doc.includes("## Phase 6C Recommendations"))
  assert.ok(/tenant-boundary regression/i.test(doc))
})

test("17. docs keep commercial SaaS production No-Go", async () => {
  const doc = await read(DOC)
  assert.ok(/Commercial SaaS Production:\*\* No-Go|Commercial SaaS production: \*\*No-Go\*\*/i.test(doc))
})

test("18. docs keep Electron production release No-Go", async () => {
  const doc = await read(DOC)
  assert.ok(/Electron Production Release:\*\* No-Go|Electron production release: \*\*No-Go\*\*/i.test(doc))
})

// ─── Inventory accuracy: tables documented match migrations ─────

test("inventory documents the core tenant-DB tables", async () => {
  const doc = await read(DOC)
  for (const table of ["action_previews", "approval_records", "work_units", "audit_logs", "usage_events"]) {
    assert.ok(doc.includes(table), `doc must inventory ${table}`)
  }
  // No sessions table — doc must state this explicitly.
  assert.ok(/no\s+`?sessions`?\s+table/i.test(doc))
})

test("inventory separates code-enforced vs DB-enforced invariants", async () => {
  const doc = await read(DOC)
  assert.ok(doc.includes("## Code-Enforced Invariants"))
  assert.ok(doc.includes("## DB-Enforced Invariants"))
  assert.ok(/tenant isolation is code-enforced/i.test(doc))
})
