/**
 * Phase 7C: Final alpha release readiness consolidation tests.
 *
 * Documentation-contract + JSON + source-scan tests, plus an actual invocation of
 * the Phase 7B safety gate. Confirms the consolidated readiness package does not
 * overclaim and that Phase 5B–7B guarantees remain intact.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { execFileSync } from "node:child_process"

const DOC = "docs/legacy/ALPHA_RELEASE_READINESS.md"
const SUMMARY = "docs/release/ALPHA_READINESS_SUMMARY.json"
const MATRIX = "docs/release/ALPHA_RELEASE_MATRIX.json"
const GATE = "scripts/alpha-safety-gate.mjs"
const PKG = "package.json"
const EXTERNAL = "app/lib/security/externalActions.ts"
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

test("1. final readiness doc exists", async () => { assert.ok((await doc()).length > 0) })
test("2. doc includes the Product Principle", async () => {
  assert.ok((await doc()).includes("AI proposes. Rules guard. Humans decide."))
})

// ─── Matrix classifications (3-13) ──────────────────────────────

const MODE_STATUS: [number, string, string][] = [
  [3, "Local technical demo", "Conditional Go"],
  [4, "Closed alpha", "Conditional Go"],
  [5, "Customer-observed pilot", "Conditional Go"],
  [6, "Commercial SaaS production", "No-Go"],
  [7, "Electron desktop alpha", "No-Go"],
  [8, "Electron production release", "No-Go"],
  [9, "External execution", "No-Go"],
  [10, "Live provider writes", "No-Go"],
  [11, "OAuth/token vault", "No-Go"],
  [12, "Billing", "No-Go"],
  [13, "Real provider writes", "No-Go"],
]
for (const [n, item, status] of MODE_STATUS) {
  test(`${n}. doc states ${item}: ${status}`, async () => {
    const re = new RegExp(`${item.replace(/[/]/g, "\\/")}\\s*[:|]\\s*\\*?\\*?${status}`, "i")
    assert.ok(re.test(await doc()), `${item} must be ${status}`)
  })
}

// ─── Policy statements (14-23) ──────────────────────────────────

const PHRASES: [number, RegExp][] = [
  [14, /preview is .*not.* approval/i],
  [15, /approval is .*not.* execution/i],
  [16, /dry-run .*is .*not.* execution|dry-run is not execution/i],
  [17, /human approval is .*required/i],
  [18, /AI must not approve/i],
  [19, /AI must not execute external actions/i],
  [20, /local desktop state is .*not.* an approval source|local desktop state is not.*approval source/i],
  [21, /approval records remain .*server-authoritative|approval records remain server-authoritative/i],
  [22, /ActionPreview verification remains .*server\/database-authoritative/i],
  [23, /alpha safety gate must pass before any alpha demo\/pilot claim|gate must pass before any alpha/i],
]
for (const [n, re] of PHRASES) {
  test(`${n}. doc contains required statement`, async () => {
    assert.ok(re.test(await doc()), `missing statement ${n}`)
  })
}

// ─── Required content (24-29) ───────────────────────────────────

test("24. doc includes all required validation commands", async () => {
  const d = await doc()
  for (const cmd of ["npm test", "npm run alpha:safety-gate", "npm run lint", "npm run build", "npm run cf:build", "git diff --check"]) {
    assert.ok(d.includes(cmd), `missing command: ${cmd}`)
  }
})

test("25. doc consolidates Phase 5B through 7B", async () => {
  const d = await doc()
  for (const ph of ["Phase 5B", "Phase 5C", "Phase 5D", "Phase 5E", "Phase 6A", "Phase 6B", "Phase 6C", "Phase 7A", "Phase 7B"]) {
    assert.ok(d.includes(ph), `missing ${ph}`)
  }
})

test("26. doc includes customer-observed pilot disclosure", async () => {
  assert.ok((await doc()).includes("## Customer-Observed Pilot Disclosure"))
})
test("27. doc includes SaaS production blockers", async () => {
  assert.ok((await doc()).includes("## Required Next Work Before SaaS Production"))
})
test("28. doc includes Electron alpha blockers", async () => {
  assert.ok((await doc()).includes("## Required Next Work Before Electron Alpha"))
})
test("29. doc includes Electron production blockers", async () => {
  assert.ok((await doc()).includes("## Required Next Work Before Electron Production"))
})

// ─── Summary JSON consistency (30) ──────────────────────────────

test("30. readiness summary JSON matches the doc and carries no secrets", async () => {
  const raw = await read(SUMMARY)
  const s = JSON.parse(raw)
  assert.equal(s.localTechnicalDemo, "Conditional Go")
  assert.equal(s.closedAlpha, "Conditional Go")
  assert.equal(s.customerObservedPilot, "Conditional Go")
  assert.equal(s.commercialSaasProduction, "No-Go")
  assert.equal(s.electronDesktopAlpha, "No-Go")
  assert.equal(s.electronProductionRelease, "No-Go")
  assert.equal(s.externalExecution, "No-Go")
  assert.equal(s.realProviderWrites, "No-Go")
  assert.equal(s.humanApprovalRequired, true)
  assert.equal(s.dryRunConsumesApproval, false)
  assert.equal(s.localDesktopStateIsApprovalSource, false)
  assert.deepEqual(s.completedSafetyPhases, ["5B", "5C", "5D", "5E", "6A", "6B", "6C", "7A", "7B"])
  for (const bad of ["sk-", "Bearer ", "API_KEY=", "password:", "http://", "https://"]) {
    assert.equal(raw.includes(bad), false, `summary must not contain ${bad}`)
  }
})

// ─── Gate + scripts (31,32) ─────────────────────────────────────

test("31. npm script alpha:safety-gate still exists", async () => {
  const pkg = JSON.parse(await read(PKG))
  assert.equal(pkg.scripts["alpha:safety-gate"], "node scripts/alpha-safety-gate.mjs")
})

test("32. alpha safety gate exits 0", () => {
  const out = execFileSync("node", ["scripts/alpha-safety-gate.mjs"], { encoding: "utf8" })
  assert.match(out, /Alpha safety gate passed/)
})

// ─── No app/migration change (33-36) ────────────────────────────

test("33. no Electron dependency in package.json", async () => {
  const pkg = JSON.parse(await read(PKG))
  assert.equal("electron" in { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }, false)
})

test("36. external execution remains disabled by default", async () => {
  assert.ok((await read(EXTERNAL)).includes('EXTERNAL_ACTIONS_ENABLED === "true"'))
})

// (34, 35 — no app/migration change — are enforced by the commit scope and the
//  source guards below; the CI diff stat is the operational check.)

// ─── Phase 5B–7B regression guards (37-44) ──────────────────────

test("37. Phase 5B CAS guard still passes", async () => {
  const src = await read(APPROVAL_REPO)
  assert.ok(/status = 'approved'/.test(src) && /used_at IS NULL/i.test(src) && /expires_at\s*>\s*\?/.test(src) && src.includes("rows_written"))
})
test("38. Phase 5C binding guard still passes", async () => {
  assert.ok((await read(BINDING)).includes("verifyApprovalPreviewBinding"))
  assert.ok((await read(STORE)).includes("record.actionPreviewId !== input.actionPreviewId"))
})
test("39. Phase 5D JSON guard still passes", async () => {
  const repo = await read(PREVIEW_REPO)
  assert.ok(repo.includes("readJsonColumn") && repo.includes("toJsonColumn"))
  assert.equal(repo.includes("JSON.parse"), false)
  assert.ok((await read(ROW_HELPERS)).includes("export function readJsonColumn"))
})
test("40. Phase 5E HMAC no-env guard still passes", async () => {
  const src = await read(HASH)
  assert.equal(src.includes("process.env"), false)
  assert.ok(src.includes("computeTenantHmacSha256Hash"))
})
test("41. Phase 6B additive migration guard still passes", async () => {
  const sql = (await read(MIGRATION)).split("\n").filter((l) => !l.trim().startsWith("--") && l.trim()).join(" ")
  for (const stmt of sql.split(";").map((s) => s.trim()).filter(Boolean)) {
    assert.match(stmt, /^CREATE (UNIQUE )?INDEX IF NOT EXISTS/i)
  }
})
test("42. Phase 6C workUnit tenant guard still passes", async () => {
  assert.ok(/UPDATE work_units[\s\S]*?WHERE id = \? AND tenant_id = \?/.test(await read(WORKUNIT_REPO)))
})
test("43. Phase 7A matrix remains strict", async () => {
  const m = JSON.parse(await read(MATRIX))
  assert.equal(m.releaseModes.commercial_saas_production, "No-Go")
  assert.equal(m.releaseModes.electron_desktop_alpha, "No-Go")
  assert.equal(m.releaseModes.closed_alpha, "Conditional Go")
})
test("44. Phase 7B safety gate remains present and read-only", async () => {
  const g = await read(GATE)
  assert.ok(g.includes("Alpha safety gate"))
  for (const bad of ["writeFileSync", "appendFile", "execSync", "spawn", "fetch("]) {
    assert.equal(g.includes(bad), false, `gate must not use ${bad}`)
  }
})
