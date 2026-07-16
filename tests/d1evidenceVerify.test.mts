/**
 * P0-OPS-016 repair — offline verification of receipt-bound evidence packs
 * (Issue #155).
 *
 * The valid pack is produced by the REAL pipeline: session initialization →
 * seven command-bound emitters → assembly from verified receipts. Negative cases
 * tamper that pack; where a tamper must be isolated from digest/signature noise,
 * the harness re-computes digests and RE-SIGNS with the session's own key —
 * proving the verifier catches the semantic violation, not merely a broken hash.
 *
 * Everything is synthetic and offline; nothing contacts Cloudflare.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { generateKeyPairSync } from "node:crypto"
import { mkdtempSync, mkdirSync, cpSync, copyFileSync, writeFileSync, readFileSync, rmSync, symlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import {
  loadEvidenceContract, computeEvidenceDigest, computeReceiptDigest, signReceiptDigest,
  canonicalSerialize, sha256Hex, EVIDENCE_CONTRACT_RELPATH,
} from "../scripts/lib/d1OperationalEvidence.mjs"
import {
  initializeEvidenceSessionAt, loadEvidenceSession, beginEvidenceOperation,
  emitMigrationPlanReceipt, emitMigrationApplyReceipt, emitRemoteSchemaVerificationReceipt,
  emitBootstrapApplyReceipt, emitBootstrapCountsReceipt, emitWorkerPreflightReceipt,
  emitWorkerDeployReceipt, assembleEvidencePackFromSession,
} from "../scripts/lib/d1EvidenceReceipts.mjs"
import { verifyEvidencePackAtPath } from "../scripts/cf-d1-evidence-verify.mjs"
import { loadConfigFile, buildConfigWithIds, SYNTHETIC_D1_IDS } from "../scripts/lib/cfDeployConfig.mjs"
import { loadManifest, buildPlan, KNOWN_BINDINGS } from "../scripts/lib/d1MigrationManifest.mjs"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const CONTRACT = (() => {
  const loaded = loadEvidenceContract(REPO_ROOT)
  if (!loaded.ok) throw new Error("contract must load")
  return loaded.contract
})()
const PRODUCER_SOURCES = [
  "scripts/cf-d1-migrations-check.mjs", "scripts/cf-d1-migrations-apply.mjs",
  "scripts/cf-d1-schema-verify-remote.mjs", "scripts/cf-d1-bootstrap-apply.mjs",
  "scripts/cloudflare-deploy-preflight.mjs", "scripts/cloudflare-deploy.mjs",
]

// ─── One real session + pack for the whole suite ──────────────────

const WORK = mkdtempSync(resolve(tmpdir(), "d1-evidence-verify-"))
mkdirSync(resolve(WORK, "contracts/operations"), { recursive: true })
copyFileSync(resolve(REPO_ROOT, EVIDENCE_CONTRACT_RELPATH), resolve(WORK, EVIDENCE_CONTRACT_RELPATH))
cpSync(resolve(REPO_ROOT, "migrations"), resolve(WORK, "migrations"), { recursive: true })
copyFileSync(resolve(REPO_ROOT, "wrangler.json"), resolve(WORK, "wrangler.json"))
mkdirSync(resolve(WORK, "scripts/lib"), { recursive: true })
for (const rel of PRODUCER_SOURCES) copyFileSync(resolve(REPO_ROOT, rel), resolve(WORK, rel))
mkdirSync(resolve(WORK, ".open-next"), { recursive: true })
writeFileSync(resolve(WORK, ".open-next/worker.js"), "// synthetic worker artifact\n")
writeFileSync(resolve(WORK, ".gitignore"), "/.d1-evidence/\n")
test.after(() => rmSync(WORK, { recursive: true, force: true }))

const SYNTHETIC_COMMIT = "0123456789abcdef0123456789abcdef01234567"
const base = (loadConfigFile(resolve(REPO_ROOT, "wrangler.json")) as { config: Record<string, unknown> }).config
const authorityBytes = JSON.stringify(buildConfigWithIds(base, SYNTHETIC_D1_IDS), null, 2)
const AUTHORITY = { bytes: authorityBytes, sha256: sha256Hex(authorityBytes), snapshot: JSON.parse(authorityBytes) }

const INIT = (() => {
  const initialized = initializeEvidenceSessionAt({
    repoRoot: WORK, environmentClass: "staging",
    derived: { commitSha: SYNTHETIC_COMMIT, dirtyTree: false, nodeVersion: "v22.0.0", wranglerVersion: "4.99.0" },
  })
  if (!initialized.ok) throw new Error(`init: ${initialized.blocked.join(",")}`)
  return initialized
})()
const SESSION_PRIVATE_PEM = (() => {
  const loaded = loadEvidenceSession(INIT.sessionDir, { repoRoot: WORK })
  if (!loaded.ok) throw new Error("session must load")
  return loaded.privateKeyPem
})()

const at = (iso: string) => () => new Date(iso)
let clockSeq = 0
function nextBoundary() {
  const i = clockSeq++
  const started = `2030-01-01T00:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}.000Z`
  return { begun: beginEvidenceOperation(at(started)), clock: at(started.replace(".000Z", ".500Z")) }
}

const VALID_RECORD: Record<string, unknown> = (() => {
  const plan = (() => {
    const loaded = loadManifest(WORK)
    if (!loaded.ok) throw new Error("manifest must load")
    return KNOWN_BINDINGS.flatMap((binding) => buildPlan(loaded.manifest, binding))
  })()
  const steps = [
    () => { const b = nextBoundary(); return emitMigrationPlanReceipt(INIT.sessionDir, { repoRoot: WORK, authority: AUTHORITY, begun: b.begun, clock: b.clock, checkResult: { ok: true, failures: [] } }) },
    () => { const b = nextBoundary(); return emitMigrationApplyReceipt(INIT.sessionDir, { repoRoot: WORK, authority: AUTHORITY, begun: b.begun, clock: b.clock, applyResult: { completed: true, appliedPlan: plan } }) },
    () => { const b = nextBoundary(); return emitRemoteSchemaVerificationReceipt(INIT.sessionDir, { repoRoot: WORK, authority: AUTHORITY, begun: b.begun, clock: b.clock, verificationResult: { ok: true, failures: [], authorityDigest: AUTHORITY.sha256 } }) },
    () => { const b = nextBoundary(); return emitBootstrapApplyReceipt(INIT.sessionDir, { repoRoot: WORK, authority: AUTHORITY, begun: b.begun, clock: b.clock, bootstrapResult: { committed: true, canonicalSqlSha256: sha256Hex("synthetic canonical sql") } }) },
    () => { const b = nextBoundary(); return emitBootstrapCountsReceipt(INIT.sessionDir, { repoRoot: WORK, authority: AUTHORITY, begun: b.begun, clock: b.clock, countsResult: { ok: true, failures: [] } }) },
    () => { const b = nextBoundary(); return emitWorkerPreflightReceipt(INIT.sessionDir, { repoRoot: WORK, authority: AUTHORITY, begun: b.begun, clock: b.clock, preflightResult: { ok: true, failures: [], checkedArtifacts: true } }) },
    () => { const b = nextBoundary(); return emitWorkerDeployReceipt(INIT.sessionDir, { repoRoot: WORK, authority: AUTHORITY, begun: b.begun, clock: b.clock, deployResult: { deployed: true } }) },
  ]
  for (const step of steps) {
    const emitted = step()
    if (!emitted.ok) throw new Error(`emit: ${emitted.blocked.join(",")}`)
  }
  const pack = assembleEvidencePackFromSession(INIT.sessionDir, { repoRoot: WORK })
  if (!pack.ok) throw new Error(`assemble: ${pack.blocked.join(",")}`)
  return JSON.parse(readFileSync(pack.path, "utf8"))
})()

type Rec = Record<string, unknown>
type Op = Record<string, unknown>

/**
 * Tamper harness. `resign: true` recomputes input/result/receipt digests, RE-SIGNS
 * every receipt with the session's real key, re-chains, and re-digests the pack —
 * isolating the SEMANTIC violation under test from hash/signature noise.
 */
let fileCounter = 0
function verifyTampered(mutate: (record: Rec) => void, { resign = true, rechain = true, redigestPack = true, sessionDir = null as string | null } = {}) {
  const record = JSON.parse(JSON.stringify(VALID_RECORD)) as Rec & { operations: Op[]; chain: Rec }
  mutate(record)
  if (resign) {
    let previous: string | null = null
    for (const op of record.operations) {
      if (rechain) op.previous_receipt_sha256 = previous
      op.input_digest = sha256Hex(canonicalSerialize({
        authority_sha256: op.authority_sha256, operation: op.operation, producer: op.producer,
        repository_commit_sha: op.repository_commit_sha, session_id: op.session_id,
      }))
      op.result_digest = sha256Hex(canonicalSerialize({
        authority_sha256: op.authority_sha256, operation: op.operation, producer: op.producer,
        producer_source_sha256: op.producer_source_sha256, proof: op.proof,
        repository_commit_sha: op.repository_commit_sha, safe_categories: op.safe_categories,
        session_id: op.session_id, status: op.status,
      }))
      op.receipt_sha256 = computeReceiptDigest(op)
      op.receipt_signature = signReceiptDigest(SESSION_PRIVATE_PEM, op.receipt_sha256 as string)
      previous = op.receipt_sha256 as string
    }
  }
  if (redigestPack) record.chain.evidence_sha256 = computeEvidenceDigest(record)
  const path = resolve(WORK, `pack-${fileCounter++}.json`)
  writeFileSync(path, JSON.stringify(record, null, 2), { mode: 0o600 })
  return verifyEvidencePackAtPath(path, { repoRoot: REPO_ROOT, sessionDir })
}

// ─── The valid pack ───────────────────────────────────────────────

test("a complete receipt-bound pack from the real pipeline verifies — alone AND anchored to its session", () => {
  const alone = verifyTampered(() => {}, { resign: false })
  assert.deepEqual(alone, { ok: true, categories: ["evidence_valid"] })
  const anchored = verifyTampered(() => {}, { resign: false, sessionDir: INIT.sessionDir })
  assert.deepEqual(anchored, { ok: true, categories: ["evidence_valid"] })
})

// ─── 1 + 13. fabrication regressions ──────────────────────────────

test("REGRESSION 1a. the pre-repair fabricated pack (no receipts) is rejected as contract-invalid", () => {
  // Exactly the shape the pre-repair reproduction produced: operations without
  // producer/proof/receipt fields, no session group.
  const record: Rec = JSON.parse(JSON.stringify(VALID_RECORD))
  delete record.session
  record.operations = (VALID_RECORD.operations as Op[]).map((op) => ({
    sequence: op.sequence, operation: op.operation, status: op.status,
    started_at: op.started_at, completed_at: op.completed_at,
    authority_sha256: op.authority_sha256, result_digest: op.result_digest,
    safe_categories: op.safe_categories,
  }))
  ;(record.chain as Rec).evidence_sha256 = computeEvidenceDigest(record)
  const path = resolve(WORK, "pre-repair-fabricated.json")
  writeFileSync(path, JSON.stringify(record, null, 2), { mode: 0o600 })
  const result = verifyEvidencePackAtPath(path, { repoRoot: REPO_ROOT })
  assert.equal(result.ok, false, "internally-consistent hashing alone is NOT execution provenance")
  assert.ok(result.categories.includes("evidence_contract_invalid"))
})

test("REGRESSION 1b. a wholesale re-implementation signed with a FOREIGN key is rejected", () => {
  // The strongest ordinary-caller fabrication: full new shape, self-consistent,
  // signed with the attacker's own keypair and their own public key embedded.
  const foreign = generateKeyPairSync("ed25519")
  const foreignPem = foreign.privateKey.export({ type: "pkcs8", format: "pem" }) as string
  const foreignPub = Buffer.from(foreign.publicKey.export({ format: "jwk" }).x as string, "base64url").toString("hex")
  const record = JSON.parse(JSON.stringify(VALID_RECORD)) as Rec & { operations: Op[]; session: Rec; chain: Rec }
  record.session.public_key = foreignPub
  // The forger does NOT know the real producer-source digests' significance and
  // invents them (the pre-repair reproduction used sha256("fake-source")).
  let previous: string | null = null
  for (const op of record.operations) {
    op.producer_source_sha256 = sha256Hex(`fake-source-${op.producer}`)
    op.previous_receipt_sha256 = previous
    op.input_digest = sha256Hex(canonicalSerialize({ authority_sha256: op.authority_sha256, operation: op.operation, producer: op.producer, repository_commit_sha: op.repository_commit_sha, session_id: op.session_id }))
    op.result_digest = sha256Hex(canonicalSerialize({ authority_sha256: op.authority_sha256, operation: op.operation, producer: op.producer, producer_source_sha256: op.producer_source_sha256, proof: op.proof, repository_commit_sha: op.repository_commit_sha, safe_categories: op.safe_categories, session_id: op.session_id, status: op.status }))
    op.receipt_sha256 = computeReceiptDigest(op)
    op.receipt_signature = signReceiptDigest(foreignPem, op.receipt_sha256 as string)
    previous = op.receipt_sha256 as string
  }
  record.chain.evidence_sha256 = computeEvidenceDigest(record)
  const path = resolve(WORK, "foreign-key-fabricated.json")
  writeFileSync(path, JSON.stringify(record, null, 2), { mode: 0o600 })
  // Standalone: the invented producer-source digests do not match the repository.
  const standalone = verifyEvidencePackAtPath(path, { repoRoot: REPO_ROOT })
  assert.equal(standalone.ok, false)
  assert.ok(standalone.categories.includes("evidence_producer_source_mismatch"))
  // Anchored to the REAL session: the foreign key is not the session's key.
  const anchored = verifyEvidencePackAtPath(path, { repoRoot: REPO_ROOT, sessionDir: INIT.sessionDir })
  assert.equal(anchored.ok, false)
  assert.ok(anchored.categories.includes("evidence_session_mismatch"))
})

test("8 + 9 + 13. unsigned receipts, forged signatures, and digest-trust tampering all fail", () => {
  const unsigned = verifyTampered((record) => {
    for (const op of (record.operations as Op[])) op.receipt_signature = "zz"
  }, { resign: false })
  assert.ok(unsigned.categories.includes("evidence_receipt_unsigned"))

  const forged = verifyTampered((record) => {
    for (const op of (record.operations as Op[])) op.receipt_signature = "0".repeat(128)
  }, { resign: false })
  assert.ok(forged.categories.includes("evidence_receipt_signature_invalid"))

  // Tamper WITHOUT recomputing anything: the stored digests are never trusted —
  // both the pack digest and the receipt digest are recomputed and both fail.
  const trusted = verifyTampered((record) => {
    ;((record.operations as Op[])[1]).status = "failed"
  }, { resign: false, redigestPack: false })
  assert.ok(trusted.categories.includes("evidence_receipt_digest_mismatch"))
  assert.ok(trusted.categories.includes("evidence_digest_mismatch"))
})

// ─── 10 + 11 + 12 + 14 + 15 + 16. receipt-binding violations ──────

test("10. a session-id change fails even when fully re-signed", () => {
  const result = verifyTampered((record) => {
    ;((record.operations as Op[])[3]).session_id = `evs-${"99".repeat(16)}`
  })
  assert.equal(result.ok, false)
  assert.ok(result.categories.includes("evidence_session_mismatch"))
})

test("11. a repository-commit change fails even when fully re-signed", () => {
  const result = verifyTampered((record) => {
    ;((record.operations as Op[])[2]).repository_commit_sha = "f".repeat(40)
  })
  assert.equal(result.ok, false)
  assert.ok(result.categories.includes("evidence_repository_mismatch"))
})

test("12. a producer/operation mismatch fails even when fully re-signed", () => {
  const result = verifyTampered((record) => {
    ;((record.operations as Op[])[0]).producer = "cf_worker_deploy"
  })
  assert.equal(result.ok, false)
  assert.ok(result.categories.includes("evidence_producer_mismatch"))
})

test("13. producer-source-digest tampering fails against the real repository sources", () => {
  const result = verifyTampered((record) => {
    ;((record.operations as Op[])[0]).producer_source_sha256 = sha256Hex("tampered-source")
  })
  assert.equal(result.ok, false)
  assert.ok(result.categories.includes("evidence_producer_source_mismatch"))
})

test("14. an authority change on one receipt fails even when fully re-signed", () => {
  const result = verifyTampered((record) => {
    ;((record.operations as Op[])[4]).authority_sha256 = sha256Hex("another-authority")
  })
  assert.equal(result.ok, false)
  assert.ok(result.categories.includes("evidence_authority_mismatch"))
})

test("15. a receipt-chain break fails", () => {
  const result = verifyTampered((record) => {
    ;((record.operations as Op[])[5]).previous_receipt_sha256 = sha256Hex("severed-link")
  }, { resign: false })
  assert.ok(result.categories.includes("evidence_receipt_chain_invalid"))
  // And with everything ELSE re-signed but the chain deliberately not re-linked:
  const resigned = verifyTampered((record) => {
    ;((record.operations as Op[])[5]).proof = { ...((record.operations as Op[])[5]).proof as Rec }
    ;(((record.operations as Op[])[5]).proof as Rec).worker_artifact_sha256 = sha256Hex("different-artifact")
  }, { resign: true, rechain: false })
  assert.ok(resigned.categories.includes("evidence_receipt_chain_invalid"), "a mid-chain digest change severs the chain")
})

test("16. result-digest tampering fails (recomputed from receipt fields)", () => {
  const result = verifyTampered((record) => {
    const op = (record.operations as Op[])[1]
    op.result_digest = sha256Hex("forged-result")
    // Keep the receipt digest + signature consistent with the forged value, so the
    // ONLY failure is the recomputation of the result digest itself.
    op.receipt_sha256 = computeReceiptDigest(op)
    op.receipt_signature = signReceiptDigest(SESSION_PRIVATE_PEM, op.receipt_sha256 as string)
    let previous: string | null = null
    for (const each of record.operations as Op[]) { each.previous_receipt_sha256 = previous; each.receipt_sha256 = computeReceiptDigest(each); each.receipt_signature = signReceiptDigest(SESSION_PRIVATE_PEM, each.receipt_sha256 as string); previous = each.receipt_sha256 as string }
  }, { resign: false })
  assert.equal(result.ok, false)
  assert.ok(result.categories.includes("evidence_receipt_digest_mismatch"))
})

// ─── 17 + 18 + 19. strict categories ──────────────────────────────

test("17 + 18. an arbitrary database-name string and unknown categories fail the per-operation allowlist", () => {
  const databaseName = verifyTampered((record) => {
    const op = (record.operations as Op[])[2]
    op.safe_categories = ["atra_control_prod", "control_db_schema_ok", "tenant_db_schema_ok"].sort()
  })
  assert.equal(databaseName.ok, false, "a normalized database name is NOT a category")
  assert.ok(databaseName.categories.includes("evidence_category_not_allowlisted"))

  const unknown = verifyTampered((record) => {
    const op = (record.operations as Op[])[0]
    op.safe_categories = ["made_up_category"]
  })
  assert.ok(unknown.categories.includes("evidence_category_not_allowlisted"))
})

test("19. unsorted or duplicated categories fail structurally", () => {
  const unsorted = verifyTampered((record) => {
    const op = (record.operations as Op[])[2]
    op.safe_categories = ["tenant_db_schema_ok", "control_db_schema_ok"]
  })
  assert.equal(unsorted.ok, false)
  assert.ok(unsorted.categories.includes("evidence_contract_invalid"))
  const duplicated = verifyTampered((record) => {
    const op = (record.operations as Op[])[2]
    op.safe_categories = ["control_db_schema_ok", "control_db_schema_ok", "tenant_db_schema_ok"]
  })
  assert.ok(duplicated.categories.includes("evidence_contract_invalid"))
})

// ─── 20. temporal consistency (Finding 3 regression) ──────────────

test("REGRESSION 3 / 20. a deploy timestamped before its predecessor fails even when fully re-signed", () => {
  const result = verifyTampered((record) => {
    const deploy = (record.operations as Op[])[6]
    deploy.started_at = "2029-12-31T11:00:00.000Z"
    deploy.completed_at = "2029-12-31T11:05:00.000Z"
  })
  assert.equal(result.ok, false, "sequence order must agree with the clock")
  assert.ok(result.categories.includes("evidence_temporal_order_invalid"))
  // completed_at before started_at on one receipt also fails.
  const inverted = verifyTampered((record) => {
    const op = (record.operations as Op[])[3]
    const started = op.started_at
    op.started_at = op.completed_at
    op.completed_at = started
  })
  assert.equal(inverted.ok, false)
})

// ─── Failed operations + incompleteness (retained) ────────────────

test("a failed receipt is reported, and success-after-failure violates ordering", () => {
  const failed = verifyTampered((record) => {
    const op = (record.operations as Op[])[1]
    op.status = "failed"
    op.safe_categories = ["migration_apply_failed"]
    ;(op.proof as Rec).reconciliation = "not_applicable"
  })
  assert.equal(failed.ok, false)
  assert.ok(failed.categories.includes("evidence_failed_operation"))
  assert.ok(failed.categories.includes("evidence_operation_order_invalid"))
})

test("an incomplete pack (missing required receipt) fails as evidence_incomplete", () => {
  const result = verifyTampered((record) => {
    ;(record.operations as Op[]).pop()
  })
  assert.equal(result.ok, false)
  assert.ok(result.categories.includes("evidence_incomplete"))
})

// ─── File-level protections (retained) ────────────────────────────

test("symlinked, oversized, and unparseable packs are refused at the file layer", () => {
  const target = resolve(WORK, "real-pack.json")
  writeFileSync(target, JSON.stringify(VALID_RECORD), { mode: 0o600 })
  const link = resolve(WORK, "linked-pack.json")
  symlinkSync(target, link)
  assert.deepEqual(verifyEvidencePackAtPath(link, { repoRoot: REPO_ROOT }).categories, ["evidence_unreadable"])

  const huge = resolve(WORK, "huge-pack.json")
  writeFileSync(huge, `{"padding":"${"x".repeat((CONTRACT.limits as { max_file_bytes: number }).max_file_bytes)}"}`, { mode: 0o600 })
  assert.deepEqual(verifyEvidencePackAtPath(huge, { repoRoot: REPO_ROOT }).categories, ["evidence_too_large"])

  const garbled = resolve(WORK, "garbled-pack.json")
  writeFileSync(garbled, "{ not json", { mode: 0o600 })
  assert.deepEqual(verifyEvidencePackAtPath(garbled, { repoRoot: REPO_ROOT }).categories, ["evidence_unparseable"])
  assert.deepEqual(verifyEvidencePackAtPath(resolve(WORK, "missing.json"), { repoRoot: REPO_ROOT }).categories, ["evidence_unreadable"])
})

// ─── Category-only output ─────────────────────────────────────────

test("no verification failure ever echoes a value from the pack", () => {
  const secrets = [AUTHORITY.sha256, SYNTHETIC_COMMIT, INIT.publicKey, INIT.sessionId, "atra_control_prod"]
  const result = verifyTampered((record) => {
    const op = (record.operations as Op[])[2]
    op.safe_categories = ["atra_control_prod"]
    op.session_id = `evs-${"77".repeat(16)}`
  })
  const serialized = JSON.stringify(result)
  for (const secret of secrets) assert.equal(serialized.includes(secret), false, `must never echo ${secret}`)
  for (const category of result.categories) assert.match(category, /^[a-z0-9_]+$/)
})

// ─── 25 + guards. offline guarantee + wiring ──────────────────────

/** Source with comments stripped — prose must never satisfy or trip a guard. */
const codeOf = (rel: string) => readFileSync(resolve(REPO_ROOT, rel), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "")

test("25. the verifier performs no network, database, or process access", () => {
  const src = codeOf("scripts/cf-d1-evidence-verify.mjs")
  assert.doesNotMatch(src, /child_process|spawnSync|execSync|\bfetch\s*\(|node:net|node:http|node:https|DatabaseSync|node:sqlite/i)
  assert.doesNotMatch(src, /process\.env\b/, "the verifier reads no environment")
  assert.match(src, /lstatSync\(path\)/)
  assert.match(src, /isSymbolicLink\(\)/)
  assert.match(src, /max_file_bytes/)
  assert.match(src, /computeEvidenceDigest\(record\) !== record\.chain\.evidence_sha256/)
  assert.match(src, /computeReceiptDigest\(op\) !== op\.receipt_sha256/, "receipt digests are recomputed, never trusted")
  assert.match(src, /verifyReceiptSignature\(record\.session\.public_key/, "every signature is verified against the session key")
})

test("GUARD: the npm commands exist, and the generic fabrication surface is gone", () => {
  const pkg = JSON.parse(readFileSync(resolve(REPO_ROOT, "package.json"), "utf8"))
  assert.equal(pkg.scripts["cf:d1:evidence:verify"], "node scripts/cf-d1-evidence-verify.mjs")
  assert.equal(pkg.scripts["cf:d1:evidence:init"], "node scripts/cf-d1-evidence-init.mjs")
  // The caller-trusted adapter layer was the fabrication vector — it is deleted.
  assert.equal(readFileSync(resolve(REPO_ROOT, "package.json"), "utf8").includes("d1EvidenceAdapters"), false)
  let adaptersGone = false
  try { readFileSync(resolve(REPO_ROOT, "scripts/lib/d1EvidenceAdapters.mjs")) } catch { adaptersGone = true }
  assert.equal(adaptersGone, true, "scripts/lib/d1EvidenceAdapters.mjs must not exist")
  // No production script calls the low-level assembler API directly — only the
  // receipts library (assembly from VERIFIED receipts) and tests may.
  for (const rel of PRODUCER_SOURCES) {
    assert.doesNotMatch(codeOf(rel), /recordEvidenceOperation\(|createEvidenceSession\(|buildOperationEvidence\(/,
      `${rel} must emit receipts only through its command-bound emitter`)
  }
})

test("GUARD: Worker deploy never invokes migration or bootstrap, and EXTERNAL_ACTIONS_ENABLED stays false", () => {
  const deploy = codeOf("scripts/cloudflare-deploy.mjs")
  assert.doesNotMatch(deploy, /cf-d1-migrations-apply|cf-d1-bootstrap-apply/)
  assert.doesNotMatch(deploy, /CF_D1_MIGRATE_EXECUTE|CF_D1_BOOTSTRAP_EXECUTE/)
  const wrangler = JSON.parse(readFileSync(resolve(REPO_ROOT, "wrangler.json"), "utf8"))
  assert.equal(wrangler.vars.EXTERNAL_ACTIONS_ENABLED, "false")
  assert.equal(wrangler.vars.ALLOW_LEGACY_INGEST_FALLBACK, "false")
})
