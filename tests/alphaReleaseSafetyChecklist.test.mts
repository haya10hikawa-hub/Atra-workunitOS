/**
 * Phase 7A: Alpha release safety checklist + Go/No-Go matrix.
 *
 * Documentation-contract and source-scan governance tests. They pin the release
 * matrix, prevent overclaiming readiness, and confirm Phase 5B–6C guards still hold.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const DOC = "docs/legacy/PHASE_7A_ALPHA_RELEASE_SAFETY_CHECKLIST.md"
const MATRIX = "docs/release/ALPHA_RELEASE_MATRIX.json"
const APPROVAL_REPO = "app/lib/persistence/d1/approvalRecordRepository.ts"
const WORKUNIT_REPO = "app/lib/persistence/d1/workUnitRepository.ts"
const PREVIEW_REPO = "app/lib/persistence/d1/actionPreviewRepository.ts"
const BINDING = "app/lib/security/approvalPreviewBinding.ts"
const STORE = "app/lib/security/approvalStore.ts"
const HASH = "app/lib/security/hash.ts"
const ROW_HELPERS = "app/lib/persistence/d1/rowHelpers.ts"
const MIGRATION = "migrations/0005_tenant_scoped_indexes.sql"

async function read(p: string): Promise<string> { return readFile(p, "utf8") }
let docCache: string | null = null
async function doc(): Promise<string> { return (docCache ??= await read(DOC)) }

// ─── Doc existence + principle (1,2) ────────────────────────────

test("1. Phase 7A doc exists", async () => {
  assert.ok((await doc()).length > 0)
})

test("2. doc contains the product principle", async () => {
  assert.ok((await doc()).includes("AI proposes. Rules guard. Humans decide."))
})

// ─── Go/No-Go matrix classifications (3-8) ──────────────────────

for (const [n, mode] of [
  [3, "Local technical demo"],
  [4, "Closed alpha"],
  [5, "Customer-observed pilot"],
] as const) {
  test(`${n}. doc classifies ${mode} as Conditional Go`, async () => {
    const re = new RegExp(`${mode}\\s*\\|\\s*\\*\\*Conditional Go\\*\\*`, "i")
    assert.ok(re.test(await doc()), `${mode} must be Conditional Go in the matrix`)
  })
}

for (const [n, mode] of [
  [6, "Commercial SaaS production"],
  [7, "Electron desktop alpha"],
  [8, "Electron production release"],
] as const) {
  test(`${n}. doc classifies ${mode} as No-Go`, async () => {
    const re = new RegExp(`${mode}\\s*\\|\\s*\\*\\*No-Go\\*\\*`, "i")
    assert.ok(re.test(await doc()), `${mode} must be No-Go in the matrix`)
  })
}

// ─── Policy statements (9-22) ───────────────────────────────────

const PHRASES: [number, RegExp][] = [
  [9, /external execution is \*\*disabled\*\*|external execution is disabled|external execution.*remains.*disabled/i],
  [10, /real provider writes remain \*\*disabled\*\*|real provider writes remain disabled/i],
  [11, /dry-run is \*\*not execution\*\*|dry-run is not execution/i],
  [12, /preview is \*\*not approval\*\*|preview is not approval/i],
  [13, /approval is \*\*not execution\*\*|approval is not execution/i],
  [14, /human approval is \*\*required\*\*|human approval is required/i],
  [15, /local desktop state is \*\*not\*\* an approval source|local desktop state is not.*approval source/i],
  [16, /approval records (are|remain) \*\*server-authoritative\*\*|approval records (are|remain) server-authoritative|approval records.*server-authoritative/i],
  [17, /ActionPreview verification remains \*\*server\/database-authoritative\*\*|ActionPreview verification remains server\/database-authoritative/i],
  [18, /OAuth ?\/ ?token vault/i],
  [19, /\bbilling\b/i],
  [20, /tenant-secret storage/i],
  [21, /IPC allowlist|preload/i],
  [22, /Packaged secrets forbidden|packaged secrets/i],
]
for (const [n, re] of PHRASES) {
  test(`${n}. doc contains required policy statement`, async () => {
    assert.ok(re.test(await doc()), `missing policy phrase for assertion ${n}`)
  })
}

// ─── Handoffs (23,24) ───────────────────────────────────────────

test("23. doc includes Phase 7B handoff", async () => {
  assert.ok((await doc()).includes("## Phase 7B Handoff"))
})

test("24. doc includes Phase 7C handoff", async () => {
  assert.ok((await doc()).includes("## Phase 7C Handoff"))
})

// ─── No Electron / no execution change (25,26) ──────────────────

test("25. no Electron dependency in package.json", async () => {
  assert.equal(/"electron"\s*:/.test(await read("package.json")), false)
})

test("26. no external execution enablement change (kill switch contract intact)", async () => {
  const ext = await read("app/lib/security/externalActions.ts")
  assert.ok(ext.includes('EXTERNAL_ACTIONS_ENABLED === "true"'))
})

// ─── Phase 5B–6C regression guards (27-32) ──────────────────────

test("27. Phase 5B CAS guard still passes", async () => {
  const src = await read(APPROVAL_REPO)
  assert.ok(/status = 'approved'/.test(src) && /used_at IS NULL/i.test(src) && /expires_at\s*>\s*\?/.test(src) && src.includes("rows_written"))
})

test("28. Phase 5C binding guard still passes", async () => {
  assert.ok((await read(BINDING)).includes("verifyApprovalPreviewBinding"))
  assert.ok((await read(STORE)).includes("record.actionPreviewId !== input.actionPreviewId"))
})

test("29. Phase 5D JSON guard still passes", async () => {
  const repo = await read(PREVIEW_REPO)
  assert.ok(repo.includes("readJsonColumn") && repo.includes("toJsonColumn"))
  assert.equal(repo.includes("JSON.parse"), false)
  assert.ok((await read(ROW_HELPERS)).includes("export function readJsonColumn"))
})

test("30. Phase 5E HMAC no-env guard still passes", async () => {
  const src = await read(HASH)
  assert.equal(src.includes("process.env"), false)
  assert.ok(src.includes("computeTenantHmacSha256Hash"))
})

test("31. Phase 6B migration additive guard still passes", async () => {
  const sql = (await read(MIGRATION)).split("\n").filter((l) => !l.trim().startsWith("--") && l.trim()).join(" ")
  for (const stmt of sql.split(";").map((s) => s.trim()).filter(Boolean)) {
    assert.match(stmt, /^CREATE (UNIQUE )?INDEX IF NOT EXISTS/i)
  }
})

test("32. Phase 6C workUnit updateStatus tenant guard still passes", async () => {
  const src = await read(WORKUNIT_REPO)
  assert.ok(/UPDATE work_units[\s\S]*?WHERE id = \? AND tenant_id = \?/.test(src))
})

// ─── Machine-readable matrix consistency ────────────────────────

test("ALPHA_RELEASE_MATRIX.json matches the documented matrix and carries no secrets", async () => {
  const raw = await read(MATRIX)
  const m = JSON.parse(raw)
  assert.equal(m.releaseModes.local_technical_demo, "Conditional Go")
  assert.equal(m.releaseModes.closed_alpha, "Conditional Go")
  assert.equal(m.releaseModes.customer_observed_pilot, "Conditional Go")
  assert.equal(m.releaseModes.commercial_saas_production, "No-Go")
  assert.equal(m.releaseModes.electron_desktop_alpha, "No-Go")
  assert.equal(m.releaseModes.electron_production_release, "No-Go")
  assert.equal(m.externalExecution, "disabled")
  assert.equal(m.humanApprovalRequired, true)
  assert.equal(m.dryRunConsumesApproval, false)
  assert.equal(m.localDesktopStateIsApprovalSource, false)
  // No secret/token/credential material in the static governance data.
  for (const bad of ["sk-", "Bearer", "API_KEY", "password", "token:"]) {
    assert.equal(raw.includes(bad), false, `matrix must not contain ${bad}`)
  }
})
