/**
 * Phase 6B: D1 schema index / constraint hardening.
 *
 * Static migration-text contract tests + source guards. The migration is applied
 * via wrangler (not in tests), so these assert the migration is additive, adds the
 * tenant-prefixed indexes that match repository query patterns, defers unsafe
 * constraints, and that Phase 5B/5C/5D/5E/6A guarantees remain intact.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const MIGRATION = "migrations/0005_tenant_scoped_indexes.sql"
const DOC = "docs/legacy/PHASE_6B_D1_SCHEMA_INDEX_CONSTRAINT_HARDENING.md"
const APPROVAL_REPO = "app/lib/persistence/d1/approvalRecordRepository.ts"
const PREVIEW_REPO = "app/lib/persistence/d1/actionPreviewRepository.ts"
const BINDING = "app/lib/security/approvalPreviewBinding.ts"
const STORE = "app/lib/security/approvalStore.ts"
const ROW_HELPERS = "app/lib/persistence/d1/rowHelpers.ts"
const HASH = "app/lib/security/hash.ts"
const DRY_RUN = "app/api/workunit/[id]/execution/dry-run/route.ts"

async function read(p: string): Promise<string> {
  return readFile(p, "utf8")
}

// ─── Migration existence / additive safety (1-7) ────────────────

test("1. new migration file exists", async () => {
  const src = await read(MIGRATION)
  assert.ok(src.length > 0)
})

test("2 & 3. migration is additive — only CREATE INDEX IF NOT EXISTS statements", async () => {
  const src = await read(MIGRATION)
  const statements = src
    .split("\n")
    .filter((l) => !l.trim().startsWith("--") && l.trim().length > 0)
    .join(" ")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  assert.ok(statements.length > 0)
  for (const s of statements) {
    assert.match(s, /^CREATE (UNIQUE )?INDEX IF NOT EXISTS/i, `non-additive statement: ${s}`)
  }
})

test("4 & 5 & 6. migration has no DROP TABLE / ALTER TABLE / table rebuild", async () => {
  const src = await read(MIGRATION).then((s) => s.toUpperCase())
  assert.equal(src.includes("DROP TABLE"), false)
  assert.equal(src.includes("ALTER TABLE"), false)
  assert.equal(src.includes("DROP COLUMN"), false)
  assert.equal(src.includes("RENAME"), false)
})

test("7. migration inserts no rows / secrets / default tenants / users", async () => {
  // Scan only executable SQL (strip `--` comment lines) so doc comments that
  // mention "secrets" do not false-positive.
  const sql = (await read(MIGRATION))
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .toUpperCase()
  assert.equal(sql.includes("INSERT INTO"), false)
  for (const bad of ["SECRET", "API_KEY", "TOKEN", "BEARER", "SK-"]) {
    assert.equal(sql.includes(bad), false, `migration SQL must not contain ${bad}`)
  }
})

// ─── Tenant-prefixed index coverage (8-15) ──────────────────────

function idxOn(src: string, table: string, cols: string): boolean {
  // Matches: CREATE INDEX IF NOT EXISTS <name> ON <table> (<cols...>)
  const re = new RegExp(`ON\\s+${table}\\s*\\(\\s*${cols}`, "i")
  return re.test(src)
}

test("8. action_previews tenant-prefixed id index", async () => {
  assert.ok(idxOn(await read(MIGRATION), "action_previews", "tenant_id,\\s*id"))
})

test("9. action_previews tenant-prefixed work_unit index", async () => {
  assert.ok(idxOn(await read(MIGRATION), "action_previews", "tenant_id,\\s*work_unit_id"))
})

test("10. approval_records tenant-prefixed id index", async () => {
  assert.ok(idxOn(await read(MIGRATION), "approval_records", "tenant_id,\\s*id"))
})

test("11. approval_records tenant-prefixed action_preview_id index", async () => {
  assert.ok(idxOn(await read(MIGRATION), "approval_records", "tenant_id,\\s*action_preview_id"))
})

test("12. approval_records tenant-prefixed work_unit index", async () => {
  assert.ok(idxOn(await read(MIGRATION), "approval_records", "tenant_id,\\s*work_unit_id"))
})

test("13. approval_records CAS-supporting status/used/expires index", async () => {
  assert.ok(idxOn(await read(MIGRATION), "approval_records", "tenant_id,\\s*status,\\s*used_at,\\s*expires_at"))
})

test("14. work_units tenant-prefixed id index", async () => {
  assert.ok(idxOn(await read(MIGRATION), "work_units", "tenant_id,\\s*id"))
})

test("15. work_units tenant-created_at index", async () => {
  assert.ok(idxOn(await read(MIGRATION), "work_units", "tenant_id,\\s*created_at"))
})

// ─── Deferred constraints documented (16-18) ────────────────────

test("16. no unsafe UNIQUE index introduced without explicit docs", async () => {
  const mig = await read(MIGRATION)
  const doc = await read(DOC)
  if (/CREATE UNIQUE INDEX/i.test(mig)) {
    // If any unique index exists, the docs must justify its safety.
    assert.ok(/uniqueness/i.test(doc))
  } else {
    assert.ok(true) // none added — acceptable
  }
})

test("17. docs explain deferred / missing FK constraints", async () => {
  const doc = await read(DOC)
  assert.ok(doc.includes("## Missing Foreign Keys Deferred"))
  assert.ok(/work_unit_id/i.test(doc) && /ALTER TABLE ADD FOREIGN KEY|table rebuild/i.test(doc))
})

test("18. docs explain deferred / rejected uniqueness rules", async () => {
  const doc = await read(DOC)
  assert.ok(doc.includes("## Uniqueness Rules Deferred"))
})

// ─── Phase 5B/5C/5D/5E regression guards (19-22) ────────────────

test("19. Phase 5B CAS source guard still passes", async () => {
  const src = await read(APPROVAL_REPO)
  assert.ok(/status = 'approved'/.test(src) && /used_at IS NULL/i.test(src) && /expires_at\s*>\s*\?/.test(src) && src.includes("rows_written"))
})

test("20. Phase 5C binding source guard still passes", async () => {
  assert.ok((await read(BINDING)).includes("verifyApprovalPreviewBinding"))
  assert.ok((await read(STORE)).includes("record.actionPreviewId !== input.actionPreviewId"))
})

test("21. Phase 5D JSON helper source guard still passes", async () => {
  const repo = await read(PREVIEW_REPO)
  assert.ok(repo.includes("readJsonColumn") && repo.includes("toJsonColumn"))
  assert.equal(repo.includes("JSON.parse"), false)
  assert.ok((await read(ROW_HELPERS)).includes("export function readJsonColumn"))
})

test("22. Phase 5E HMAC no-env guard still passes", async () => {
  const src = await read(HASH)
  assert.equal(src.includes("process.env"), false)
  assert.ok(src.includes("computeTenantHmacSha256Hash") && src.includes("verifyHashBinding"))
})

// ─── Electron / external execution boundaries (23-25) ───────────

test("23. Electron is not implemented and package.json has no Electron dependency", async () => {
  const pkg = await read("package.json")
  assert.equal(/"electron"\s*:/.test(pkg), false)
  // migration is pure SQL — no electron/ipc/preload tokens.
  const mig = await read(MIGRATION)
  for (const bad of ["electron", "ipc", "preload", "nodeIntegration", "contextIsolation"]) {
    assert.equal(mig.toLowerCase().includes(bad.toLowerCase()), false)
  }
})

test("24. docs preserve Electron local-state-not-approval-source rule", async () => {
  const doc = await read(DOC)
  assert.ok(/local desktop state must not become an approval source|local desktop state is not an approval source/i.test(doc))
  assert.ok(/server-authoritative/i.test(doc))
})

test("25. external execution remains disabled (dry-run still non-consuming, kill switch intact)", async () => {
  const dry = await read(DRY_RUN)
  assert.equal(dry.includes("markApprovalUsed"), false)
  assert.ok(dry.includes("areExternalActionsEnabled"))
})
