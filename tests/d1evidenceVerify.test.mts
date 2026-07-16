/**
 * P0-OPS-016 — offline verification of D1 operational evidence packs (Issue #155).
 *
 * Every pack here is SYNTHETIC, produced by the real recorder and then (for the
 * negative cases) deliberately tampered. Tampered packs are RE-DIGESTED unless the
 * test targets the digest itself, so each failure category is isolated. The
 * verifier performs no network or database access — proven by a source guard.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync, symlinkSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import {
  loadEvidenceContract, computeEvidenceDigest, createEvidenceSession, recordEvidenceOperation,
  finalizeEvidenceSession, writeEvidencePack, sha256Hex, EVIDENCE_CONTRACT_RELPATH, EVIDENCE_DIRNAME,
} from "../scripts/lib/d1OperationalEvidence.mjs"
import { verifyEvidencePackAtPath } from "../scripts/cf-d1-evidence-verify.mjs"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const AUTHORITY = sha256Hex("synthetic-authority-bytes")
const COMMIT = "0123456789abcdef0123456789abcdef01234567"
const CONTRACT = (() => {
  const loaded = loadEvidenceContract(REPO_ROOT)
  if (!loaded.ok) throw new Error("contract must load")
  return loaded.contract
})()
const OPS = CONTRACT.required_successful_sequence

/** One temporary workspace per suite run; every file lives under it. */
const WORK = mkdtempSync(resolve(tmpdir(), "d1-evidence-verify-"))
mkdirSync(resolve(WORK, "contracts/operations"), { recursive: true })
copyFileSync(resolve(REPO_ROOT, EVIDENCE_CONTRACT_RELPATH), resolve(WORK, EVIDENCE_CONTRACT_RELPATH))
writeFileSync(resolve(WORK, ".gitignore"), `/${EVIDENCE_DIRNAME}/\n`)
test.after(() => rmSync(WORK, { recursive: true, force: true }))

/** Build ONE valid, complete, successful record via the real recorder. */
function buildValidRecord(): Record<string, unknown> {
  const created = createEvidenceSession({
    repoRoot: WORK, environmentClass: "staging", commitSha: COMMIT, dirtyTree: false,
    nodeVersion: "v22.0.0", wranglerVersion: "4.99.0",
    authoritySha256: AUTHORITY, controlTenantPhysicallyDistinct: true,
    migrationManifestSha256: sha256Hex("synthetic-manifest"),
    migrationPlanDigest: sha256Hex("synthetic-plan"),
    schemaContractSha256: sha256Hex("synthetic-schema-contract"),
    expectedSchemaVersion: "2",
  })
  if (!created.ok) throw new Error(`session: ${created.blocked.join(",")}`)
  for (let i = 0; i < OPS.length; i++) {
    const recorded = recordEvidenceOperation(created.session, {
      operation: OPS[i], status: "success",
      startedAt: `2026-07-16T02:00:0${i}.000Z`, completedAt: `2026-07-16T02:00:0${i}.500Z`,
      authoritySha256: AUTHORITY, resultDigest: sha256Hex(`result-${OPS[i]}`),
      safeCategories: ["synthetic_ok"],
    })
    if (!recorded.ok) throw new Error(`${OPS[i]}: ${recorded.blocked.join(",")}`)
  }
  const finalized = finalizeEvidenceSession(created.session)
  if (!finalized.ok) throw new Error(`finalize: ${finalized.blocked.join(",")}`)
  return JSON.parse(JSON.stringify(finalized.record))
}

let fileCounter = 0
/** Write a (possibly tampered) record to a fresh file and verify it. */
function verifyRecord(record: unknown, { redigest = true } = {}) {
  const candidate = JSON.parse(JSON.stringify(record)) as { chain?: { evidence_sha256?: string } }
  if (redigest && candidate && typeof candidate === "object" && candidate.chain) {
    candidate.chain.evidence_sha256 = computeEvidenceDigest(candidate)
  }
  const path = resolve(WORK, `pack-${fileCounter++}.json`)
  writeFileSync(path, JSON.stringify(candidate, null, 2), { mode: 0o600 })
  return verifyEvidencePackAtPath(path, { repoRoot: REPO_ROOT })
}

// ─── 1. the happy path ────────────────────────────────────────────

test("1. a complete valid evidence pack verifies as evidence_valid — end to end through the real writer", () => {
  const record = buildValidRecord()
  // Through the real writer too (exclusive 0600 file in the ignored directory).
  const written = writeEvidencePack(record as never, { repoRoot: WORK })
  assert.equal(written.ok, true, `pack must write: ${written.ok ? "" : written.blocked.join(",")}`)
  if (!written.ok) return
  const result = verifyEvidencePackAtPath(written.path, { repoRoot: REPO_ROOT })
  assert.deepEqual(result, { ok: true, categories: ["evidence_valid"] })
  // And via the tamper harness with no tampering at all.
  assert.deepEqual(verifyRecord(record, { redigest: false }), { ok: true, categories: ["evidence_valid"] })
})

// ─── 2–5. contract strictness ─────────────────────────────────────

test("2. unknown fields fail — top level and nested", () => {
  for (const tamper of [
    (r: Record<string, unknown>) => { r.extra_field = "x" },
    (r: Record<string, unknown>) => { (r.repository as Record<string, unknown>).branch = "main" },
    (r: Record<string, unknown>) => { ((r.operations as Record<string, unknown>[])[0]).note = "x" },
    (r: Record<string, unknown>) => { (r.chain as Record<string, unknown>).extra = "x" },
  ]) {
    const record = buildValidRecord()
    tamper(record)
    const result = verifyRecord(record)
    assert.equal(result.ok, false, "an unknown field must fail")
    assert.ok(result.categories.includes("evidence_contract_invalid"), result.categories.join(","))
  }
})

test("3. missing fields fail", () => {
  for (const field of ["toolchain", "authority", "contracts", "chain", "evidence_id"]) {
    const record = buildValidRecord()
    delete record[field]
    const result = verifyRecord(record)
    assert.equal(result.ok, false, `missing ${field} must fail`)
    assert.ok(result.categories.includes("evidence_contract_invalid"))
  }
  const record = buildValidRecord()
  delete (record.repository as Record<string, unknown>).commit_sha
  assert.ok(verifyRecord(record).categories.includes("evidence_contract_invalid"))
})

test("4. malformed timestamps fail", () => {
  for (const bad of ["2026-07-16 02:00:00", "2026-13-01T00:00:00.000Z", "2026-07-16T02:00:00Z", "not-a-time"]) {
    const record = buildValidRecord()
    ;(record.operations as Record<string, unknown>[])[0].started_at = bad
    const result = verifyRecord(record)
    assert.equal(result.ok, false, `${bad} must fail`)
    assert.ok(result.categories.includes("evidence_contract_invalid"))
  }
  const record = buildValidRecord()
  record.created_at = "yesterday"
  assert.ok(verifyRecord(record).categories.includes("evidence_contract_invalid"))
})

test("5. malformed digests fail — uppercase, short, and non-hex", () => {
  for (const tamper of [
    (r: Record<string, unknown>) => { (r.authority as Record<string, unknown>).sha256 = AUTHORITY.toUpperCase() },
    (r: Record<string, unknown>) => { (r.contracts as Record<string, unknown>).migration_manifest_sha256 = "abc" },
    (r: Record<string, unknown>) => { ((r.operations as Record<string, unknown>[])[0]).result_digest = "z".repeat(64) },
    (r: Record<string, unknown>) => { (r.repository as Record<string, unknown>).commit_sha = "main" },
  ]) {
    const record = buildValidRecord()
    tamper(record)
    const result = verifyRecord(record)
    assert.equal(result.ok, false)
    assert.ok(result.categories.includes("evidence_contract_invalid"))
  }
})

// ─── 6–12. ordering, authority, failure rules ─────────────────────

test("6. a non-contiguous sequence fails", () => {
  const record = buildValidRecord()
  ;(record.operations as Record<string, unknown>[])[2].sequence = 5
  const result = verifyRecord(record)
  assert.equal(result.ok, false)
  assert.ok(result.categories.includes("evidence_operation_order_invalid"), result.categories.join(","))
})

test("7. operation reordering fails even with contiguous renumbered sequences", () => {
  const record = buildValidRecord()
  const operations = record.operations as Record<string, unknown>[]
  // Swap bootstrap_apply and worker_preflight, then renumber contiguously.
  ;[operations[3], operations[5]] = [operations[5], operations[3]]
  operations.forEach((op, index) => { op.sequence = index + 1 })
  const result = verifyRecord(record)
  assert.equal(result.ok, false, "canonical relative order must hold")
  assert.ok(result.categories.includes("evidence_operation_order_invalid"))
})

test("8. deployment recorded before schema verification fails", () => {
  const record = buildValidRecord()
  const operations = record.operations as Record<string, unknown>[]
  const deploy = operations.pop()!
  operations.splice(1, 0, deploy) // deploy right after the plan, before migration apply + verify
  operations.forEach((op, index) => { op.sequence = index + 1 })
  const result = verifyRecord(record)
  assert.equal(result.ok, false)
  assert.ok(result.categories.includes("evidence_operation_order_invalid"))
})

test("9. bootstrap verification recorded before bootstrap apply fails", () => {
  const record = buildValidRecord()
  const operations = record.operations as Record<string, unknown>[]
  ;[operations[3], operations[4]] = [operations[4], operations[3]] // counts before apply
  operations.forEach((op, index) => { op.sequence = index + 1 })
  const result = verifyRecord(record)
  assert.equal(result.ok, false)
  assert.ok(result.categories.includes("evidence_operation_order_invalid"))
})

test("10. an authority digest change between operations fails", () => {
  const record = buildValidRecord()
  ;(record.operations as Record<string, unknown>[])[4].authority_sha256 = sha256Hex("a-different-authority")
  const result = verifyRecord(record)
  assert.equal(result.ok, false, "every operation must use ONE retained authority")
  assert.ok(result.categories.includes("evidence_authority_mismatch"), result.categories.join(","))
})

test("11. duplicate operations fail", () => {
  const record = buildValidRecord()
  const operations = record.operations as Record<string, unknown>[]
  operations[6] = { ...operations[2], sequence: 7 } // a second remote_schema_verified
  const result = verifyRecord(record)
  assert.equal(result.ok, false)
  assert.ok(result.categories.includes("evidence_operation_order_invalid"))
  assert.ok(result.categories.includes("evidence_incomplete"), "the duplicated pack also lost its deploy record")
})

test("12. a failed operation followed by a success fails, and any failed operation is reported", () => {
  const record = buildValidRecord()
  ;(record.operations as Record<string, unknown>[])[1].status = "failed"
  const result = verifyRecord(record)
  assert.equal(result.ok, false)
  assert.ok(result.categories.includes("evidence_failed_operation"))
  assert.ok(result.categories.includes("evidence_operation_order_invalid"), "success after failure violates append-only ordering")
  // A pack whose LAST operation failed (nothing after it) is failed but order-clean.
  const tail = buildValidRecord()
  const operations = tail.operations as Record<string, unknown>[]
  operations[6].status = "failed"
  const tailResult = verifyRecord(tail)
  assert.equal(tailResult.ok, false)
  assert.ok(tailResult.categories.includes("evidence_failed_operation"))
  assert.ok(tailResult.categories.includes("evidence_incomplete"), "a failed required operation leaves the pack incomplete")
})

test("an incomplete pack (a required operation missing entirely) fails as evidence_incomplete", () => {
  const record = buildValidRecord()
  ;(record.operations as Record<string, unknown>[]).pop() // drop worker_deploy_completed
  const result = verifyRecord(record)
  assert.equal(result.ok, false)
  assert.ok(result.categories.includes("evidence_incomplete"))
})

// ─── 13. digest integrity ─────────────────────────────────────────

test("13. evidence digest tampering fails — the stored digest is never trusted", () => {
  // Tamper WITHOUT re-digesting: any byte change breaks the canonical digest.
  const record = buildValidRecord()
  record.environment_class = "production"
  const result = verifyRecord(record, { redigest: false })
  assert.equal(result.ok, false)
  assert.ok(result.categories.includes("evidence_digest_mismatch"), result.categories.join(","))
  // Tampering the digest itself fails the same way.
  const record2 = buildValidRecord()
  ;(record2.chain as Record<string, unknown>).evidence_sha256 = sha256Hex("forged")
  const result2 = verifyRecord(record2, { redigest: false })
  assert.ok(result2.categories.includes("evidence_digest_mismatch"))
})

// ─── 14–20. sensitive content ─────────────────────────────────────

test("14–18. raw database UUID, database name key, email, provider subject, and token-like values all fail as sensitive content", () => {
  for (const [label, tamper] of [
    ["uuid", (r: Record<string, unknown>) => { r.leaked = "3f2504e0-4f89-41d3-9a0c-0305e82c3300" }],
    ["database name key", (r: Record<string, unknown>) => { r.database_name = "workunit_tenant" }],
    ["email", (r: Record<string, unknown>) => { r.leaked = "ops@example.com" }],
    ["provider subject", (r: Record<string, unknown>) => { r.leaked = "auth0|abc123" }],
    ["token", (r: Record<string, unknown>) => { r.leaked = "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345" }],
    ["bearer header", (r: Record<string, unknown>) => { r.leaked = "Bearer abcdef123456" }],
  ] as const) {
    const record = buildValidRecord()
    tamper(record)
    const result = verifyRecord(record)
    assert.equal(result.ok, false, `${label} must fail`)
    assert.ok(result.categories.includes("evidence_sensitive_content"), `${label}: got ${result.categories.join(",")}`)
  }
})

test("19 + 20. a raw deploy config and raw SQL with bootstrap values fail as sensitive content", () => {
  const config = buildValidRecord()
  config.leaked = '{"d1_databases":[{"binding":"CONTROL_DB"}]}'
  const configResult = verifyRecord(config)
  assert.equal(configResult.ok, false)
  assert.ok(configResult.categories.includes("evidence_sensitive_content"))

  const sql = buildValidRecord()
  sql.leaked = "INSERT INTO tenants (id) VALUES ('acme')"
  const sqlResult = verifyRecord(sql)
  assert.equal(sqlResult.ok, false)
  assert.ok(sqlResult.categories.includes("evidence_sensitive_content"))
})

// ─── 21 + 22. file-level protections ──────────────────────────────

test("21. a symlinked evidence pack is refused", () => {
  const record = buildValidRecord()
  const target = resolve(WORK, "real-pack.json")
  writeFileSync(target, JSON.stringify(record), { mode: 0o600 })
  const link = resolve(WORK, "linked-pack.json")
  symlinkSync(target, link)
  const result = verifyEvidencePackAtPath(link, { repoRoot: REPO_ROOT })
  assert.equal(result.ok, false)
  assert.deepEqual(result.categories, ["evidence_unreadable"])
})

test("22. an oversized evidence pack is refused BEFORE parsing, and a missing path is unreadable", () => {
  const path = resolve(WORK, "huge-pack.json")
  writeFileSync(path, `{"padding":"${"x".repeat(CONTRACT.limits.max_file_bytes)}"}`, { mode: 0o600 })
  const result = verifyEvidencePackAtPath(path, { repoRoot: REPO_ROOT })
  assert.equal(result.ok, false)
  assert.deepEqual(result.categories, ["evidence_too_large"])
  assert.deepEqual(verifyEvidencePackAtPath(resolve(WORK, "does-not-exist.json"), { repoRoot: REPO_ROOT }).categories, ["evidence_unreadable"])
  const garbled = resolve(WORK, "garbled-pack.json")
  writeFileSync(garbled, "{ not json", { mode: 0o600 })
  assert.deepEqual(verifyEvidencePackAtPath(garbled, { repoRoot: REPO_ROOT }).categories, ["evidence_unparseable"])
})

// ─── Category-only reporting ──────────────────────────────────────

test("no verification failure ever echoes a value from the pack", () => {
  const secrets = ["3f2504e0-4f89-41d3-9a0c-0305e82c3300", "ops@example.com", "auth0|abc123", "workunit_tenant", AUTHORITY, COMMIT]
  const record = buildValidRecord()
  record.leaked = "ops@example.com"
  ;(record.operations as Record<string, unknown>[])[0].authority_sha256 = sha256Hex("other")
  const result = verifyRecord(record)
  const serialized = JSON.stringify(result)
  for (const secret of secrets) assert.equal(serialized.includes(secret), false, `must never echo ${secret}`)
  for (const category of result.categories) assert.match(category, /^[a-z0-9_]+$/, `category-only output: ${category}`)
})

// ─── 25. offline guarantee + wiring guards ────────────────────────

/** Source with comments stripped — prose must never satisfy or trip a guard. */
const codeOf = (rel: string) => readFileSync(resolve(REPO_ROOT, rel), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "")

test("25. the verifier performs no network or database access and spawns nothing", () => {
  const src = codeOf("scripts/cf-d1-evidence-verify.mjs")
  assert.doesNotMatch(src, /child_process|spawnSync|execSync|\bfetch\s*\(|node:net|node:http|node:https|wrangler|DatabaseSync|node:sqlite/i,
    "the verifier must be entirely offline")
  // It reads exactly two things: the committed contract and the supplied pack.
  assert.match(src, /lstatSync\(path\)/, "the pack is lstat'ed (symlink-aware) before reading")
  assert.match(src, /isSymbolicLink\(\)/, "symlinks are refused")
  assert.match(src, /max_file_bytes/, "the size bound is enforced")
  assert.match(src, /computeEvidenceDigest\(record\) !== record\.chain\.evidence_sha256/, "the stored digest is never trusted")
})

test("GUARD: the npm command cf:d1:evidence:verify exists and requires an explicit path", () => {
  const pkg = JSON.parse(readFileSync(resolve(REPO_ROOT, "package.json"), "utf8"))
  assert.equal(pkg.scripts["cf:d1:evidence:verify"], "node scripts/cf-d1-evidence-verify.mjs")
  const src = codeOf("scripts/cf-d1-evidence-verify.mjs")
  assert.match(src, /an explicit evidence path is required/, "no default path is ever scanned")
})

test("GUARD: this patch adds no execution wrapper — no evidence file sets a gate, and Worker deploy still never migrates or bootstraps", () => {
  for (const file of ["scripts/lib/d1OperationalEvidence.mjs", "scripts/lib/d1EvidenceAdapters.mjs", "scripts/cf-d1-evidence-verify.mjs"]) {
    assert.doesNotMatch(codeOf(file), /CF_D1_MIGRATE_EXECUTE|CF_D1_BOOTSTRAP_EXECUTE|CF_DEPLOY_EXECUTE|APPLY_PRODUCTION/,
      `${file} must not name, set, or satisfy an operator gate`)
  }
  const deploy = codeOf("scripts/cloudflare-deploy.mjs")
  assert.doesNotMatch(deploy, /cf-d1-migrations-apply|cf-d1-bootstrap-apply/, "Worker deploy never invokes migration or bootstrap apply")
  assert.doesNotMatch(deploy, /d1OperationalEvidence|d1EvidenceAdapters/, "the deploy orchestrator is not wired to the recorder — evidence is operator-composed")
})

test("GUARD: EXTERNAL_ACTIONS_ENABLED stays false", () => {
  const wrangler = JSON.parse(readFileSync(resolve(REPO_ROOT, "wrangler.json"), "utf8"))
  assert.equal(wrangler.vars.EXTERNAL_ACTIONS_ENABLED, "false")
  assert.equal(wrangler.vars.ALLOW_LEGACY_INGEST_FALLBACK, "false")
})
