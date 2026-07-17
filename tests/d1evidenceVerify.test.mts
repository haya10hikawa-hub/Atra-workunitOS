/**
 * P0-OPS-016 second repair — offline verification of receipt-bound evidence packs,
 * now BOUND TO THE LOCAL CHECKOUT (Issue #155).
 *
 * The valid pack is produced by the REAL pipeline: session initialization (deriving
 * from a temporary git repo) → command-local receipt emission → assembly from
 * verified receipts. Negative cases tamper the pack; where a tamper must be isolated
 * from digest/signature noise, the harness re-computes digests and RE-SIGNS with the
 * session's own key. Local-checkout binding (HEAD, clean tree, contract + producer
 * digests) is exercised through the injected read-only git runner and repo mutation.
 *
 * Everything is synthetic and offline; nothing contacts Cloudflare.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { generateKeyPairSync, createPrivateKey, sign as edSign } from "node:crypto"
import { readFileSync, writeFileSync, rmSync, symlinkSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import {
  loadEvidenceContract, computeEvidenceDigest, computeReceiptDigest,
  canonicalSerialize, sha256Hex,
} from "../scripts/lib/d1OperationalEvidence.mjs"
import {
  initializeEvidenceSession, openCommandReceiptContext,
  assembleUnsignedReceipt, persistSignedReceipt, assembleEvidencePackFromSession,
  deriveMigrationPlanDigest, SESSION_PRIVATE_KEY_BASENAME,
} from "../scripts/lib/d1EvidenceReceipts.mjs"
import { verifyEvidencePackAtPath } from "../scripts/cf-d1-evidence-verify.mjs"
import { loadManifest, buildPlan, KNOWN_BINDINGS } from "../scripts/lib/d1MigrationManifest.mjs"
import { makeEvidenceGitRepo, makeAuthority, fixedGitRunner, REPO_ROOT } from "./evidenceTestRepo.mts"

const CONTRACT = (() => {
  const loaded = loadEvidenceContract(REPO_ROOT)
  if (!loaded.ok) throw new Error("contract must load")
  return loaded.contract
})()

// ─── One real session + pack for the whole suite ──────────────────

const REPO = makeEvidenceGitRepo()
const AUTHORITY = makeAuthority()
// Pack files are written OUTSIDE the repo so they never dirty its worktree — the
// real-git binding must see a clean checkout at the recorded commit.
const PACK_DIR = mkdtempSync(resolve(tmpdir(), "d1-evidence-packs-"))
test.after(() => { REPO.cleanup(); rmSync(PACK_DIR, { recursive: true, force: true }) })

const INIT = (() => {
  const initialized = initializeEvidenceSession({ repoRoot: REPO.repoRoot, environmentClass: "staging" })
  if (!initialized.ok) throw new Error(`init: ${initialized.blocked.join(",")}`)
  return initialized
})()
const SESSION_PRIVATE_PEM = readFileSync(resolve(INIT.sessionDir, SESSION_PRIVATE_KEY_BASENAME), "utf8")
/** Local git runner: reports the pack's real commit + clean tree, so tamper tests isolate semantics. */
const CLEAN_LOCAL = fixedGitRunner(REPO.commitSha)

let clockSeq = 0
function boundary() {
  const i = clockSeq++
  const started = `2030-01-01T00:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}.000Z`
  return { startedAt: started, completedAt: started.replace(".000Z", ".500Z") }
}

function commandEmit(sessionDir: string, session: unknown, existing: unknown[], input: Record<string, unknown>) {
  const built = assembleUnsignedReceipt(session as never, existing as never, input as never)
  if (!built.ok) throw new Error(`assemble: ${built.blocked.join(",")}`)
  built.receipt.receipt_signature = edSign(null, Buffer.from(built.receipt.receipt_sha256, "utf8"), createPrivateKey(SESSION_PRIVATE_PEM)).toString("hex")
  const p = persistSignedReceipt(session as never, built.receipt)
  if (!p.ok) throw new Error(`persist: ${p.blocked.join(",")}`)
}

const VALID_RECORD: Record<string, unknown> = (() => {
  const sc = (rel: string) => sha256Hex(readFileSync(resolve(REPO.repoRoot, rel)))
  const planDigest = deriveMigrationPlanDigest(REPO.repoRoot)!
  const loaded = loadManifest(REPO.repoRoot)
  const plan = loaded.ok ? KNOWN_BINDINGS.flatMap((b) => buildPlan(loaded.manifest, b)) : []
  const appliedDigest = sha256Hex(canonicalSerialize(plan.map((s) =>
    ({ apply: s.apply, binding: s.binding, kind: s.kind, path: s.path, sequence: s.sequence, sha256: s.sha256 }))))
  const specs: Array<[string, string, Record<string, string>, string[]]> = [
    ["migration_plan_verified", "cf_d1_migration_plan", { manifest_sha256: sc("migrations/manifest.json"), plan_digest: planDigest }, ["manifest_valid", "plan_lanes_verified"]],
    ["migration_apply_completed", "cf_d1_migration_apply", { plan_digest: planDigest, applied_steps_sha256: appliedDigest, reconciliation: "ledger_reconciled" }, ["control_lane_applied", "ledger_reconciled", "tenant_lane_applied"]],
    ["remote_schema_verified", "cf_d1_schema_verify_remote", { schema_contract_sha256: sc("migrations/schema-contract.json"), verification_summary_sha256: sha256Hex(canonicalSerialize({ control_db_schema_ok: true, failure_count: 0, tenant_db_schema_ok: true })) }, ["control_db_schema_ok", "tenant_db_schema_ok"]],
    ["bootstrap_apply_completed", "cf_d1_bootstrap_apply", { bootstrap_artifact_sha256: sha256Hex("sql"), apply_result: "bootstrap_batch_committed" }, ["bootstrap_batch_committed"]],
    ["bootstrap_counts_verified", "cf_d1_bootstrap_counts", { assertions_sha256: sha256Hex("counts") }, ["identity_row_verified", "membership_row_verified", "registry_row_verified", "tenant_row_verified", "user_row_verified"]],
    ["worker_preflight_completed", "cf_worker_preflight", { worker_artifact_sha256: sc(".open-next/worker.js"), preflight_contract_sha256: sc("wrangler.json") }, ["artifacts_verified", "preflight_ok"]],
    ["worker_deploy_completed", "cf_worker_deploy", { worker_artifact_sha256: sc(".open-next/worker.js"), deploy_result: "worker_deployed" }, ["worker_deployed"]],
  ]
  for (const [operation, producer, proof, safeCategories] of specs) {
    const ctx = openCommandReceiptContext(INIT.sessionDir, { repoRoot: REPO.repoRoot, authority: AUTHORITY, producer })
    if (!ctx.ok) throw new Error(`ctx ${operation}: ${ctx.blocked.join(",")}`)
    const b = boundary()
    commandEmit(INIT.sessionDir, ctx.session, ctx.existingReceipts, {
      operation, producer, authoritySha256: ctx.authoritySha256, producerSourceSha256: ctx.producerSourceSha256,
      startedAt: b.startedAt, completedAt: b.completedAt, status: "success", proof, safeCategories,
    })
  }
  const pack = assembleEvidencePackFromSession(INIT.sessionDir, { repoRoot: REPO.repoRoot })
  if (!pack.ok) throw new Error(`assemble: ${pack.blocked.join(",")}`)
  return JSON.parse(readFileSync(pack.path, "utf8"))
})()

type Rec = Record<string, unknown>
type Op = Record<string, unknown>

let fileCounter = 0
function verifyTampered(mutate: (record: Rec) => void, { resign = true, rechain = true, redigestPack = true, sessionDir = null as string | null, runGit = CLEAN_LOCAL as ((r: string, a: string[]) => string | null) | undefined, repoRoot = REPO.repoRoot } = {}) {
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
      op.receipt_signature = edSign(null, Buffer.from(op.receipt_sha256 as string, "utf8"), createPrivateKey(SESSION_PRIVATE_PEM)).toString("hex")
      previous = op.receipt_sha256 as string
    }
  }
  if (redigestPack) record.chain.evidence_sha256 = computeEvidenceDigest(record)
  const path = resolve(PACK_DIR, `pack-${fileCounter++}.json`)
  writeFileSync(path, JSON.stringify(record, null, 2), { mode: 0o600 })
  return verifyEvidencePackAtPath(path, { repoRoot, sessionDir, runGit })
}

// ─── The valid pack ───────────────────────────────────────────────

test("20. a complete receipt-bound pack from the real pipeline verifies — REAL git, injected git, and session-anchored", () => {
  // Real git binding: the fixture repo is clean at the recorded commit.
  const real = verifyEvidencePackAtPath(resolve(REPO.repoRoot, ".d1-evidence"), { repoRoot: REPO.repoRoot })
  assert.equal(real.ok, false) // that path is a directory; a sanity check that only a real file verifies
  const alone = verifyTampered(() => {}, { resign: false })
  assert.deepEqual(alone, { ok: true, categories: ["evidence_valid"] })
  const anchored = verifyTampered(() => {}, { resign: false, sessionDir: INIT.sessionDir })
  assert.deepEqual(anchored, { ok: true, categories: ["evidence_valid"] })
})

test("20-realgit. the pack verifies against the REAL local git checkout (no injected runner)", () => {
  const path = resolve(PACK_DIR, "real-git-pack.json")
  writeFileSync(path, JSON.stringify(VALID_RECORD, null, 2), { mode: 0o600 })
  const result = verifyEvidencePackAtPath(path, { repoRoot: REPO.repoRoot })
  assert.deepEqual(result, { ok: true, categories: ["evidence_valid"] })
})

// ─── 1 + 2. fabrication regressions ───────────────────────────────

test("REGRESSION 1a. the pre-repair fabricated pack (no receipts) is rejected as contract-invalid", () => {
  const record: Rec = JSON.parse(JSON.stringify(VALID_RECORD))
  delete record.session
  record.operations = (VALID_RECORD.operations as Op[]).map((op) => ({
    sequence: op.sequence, operation: op.operation, status: op.status,
    started_at: op.started_at, completed_at: op.completed_at,
    authority_sha256: op.authority_sha256, result_digest: op.result_digest,
    safe_categories: op.safe_categories,
  }))
  ;(record.chain as Rec).evidence_sha256 = computeEvidenceDigest(record)
  const path = resolve(PACK_DIR, "pre-repair-fabricated.json")
  writeFileSync(path, JSON.stringify(record, null, 2), { mode: 0o600 })
  const result = verifyEvidencePackAtPath(path, { repoRoot: REPO.repoRoot, runGit: CLEAN_LOCAL })
  assert.equal(result.ok, false, "internally-consistent hashing alone is NOT execution provenance")
  assert.ok(result.categories.includes("evidence_contract_invalid"))
})

test("REGRESSION 1b. a wholesale re-implementation signed with a FOREIGN key is rejected", () => {
  const foreign = generateKeyPairSync("ed25519")
  const foreignPem = foreign.privateKey.export({ type: "pkcs8", format: "pem" }) as string
  const foreignPub = Buffer.from(foreign.publicKey.export({ format: "jwk" }).x as string, "base64url").toString("hex")
  const record = JSON.parse(JSON.stringify(VALID_RECORD)) as Rec & { operations: Op[]; session: Rec; chain: Rec }
  record.session.public_key = foreignPub
  let previous: string | null = null
  for (const op of record.operations) {
    op.producer_source_sha256 = sha256Hex(`fake-source-${op.producer}`)
    op.previous_receipt_sha256 = previous
    op.input_digest = sha256Hex(canonicalSerialize({ authority_sha256: op.authority_sha256, operation: op.operation, producer: op.producer, repository_commit_sha: op.repository_commit_sha, session_id: op.session_id }))
    op.result_digest = sha256Hex(canonicalSerialize({ authority_sha256: op.authority_sha256, operation: op.operation, producer: op.producer, producer_source_sha256: op.producer_source_sha256, proof: op.proof, repository_commit_sha: op.repository_commit_sha, safe_categories: op.safe_categories, session_id: op.session_id, status: op.status }))
    op.receipt_sha256 = computeReceiptDigest(op)
    op.receipt_signature = edSign(null, Buffer.from(op.receipt_sha256 as string, "utf8"), createPrivateKey(foreignPem)).toString("hex")
    previous = op.receipt_sha256 as string
  }
  record.chain.evidence_sha256 = computeEvidenceDigest(record)
  const path = resolve(PACK_DIR, "foreign-key-fabricated.json")
  writeFileSync(path, JSON.stringify(record, null, 2), { mode: 0o600 })
  const standalone = verifyEvidencePackAtPath(path, { repoRoot: REPO.repoRoot, runGit: CLEAN_LOCAL })
  assert.equal(standalone.ok, false)
  assert.ok(standalone.categories.includes("evidence_producer_source_mismatch"))
  const anchored = verifyEvidencePackAtPath(path, { repoRoot: REPO.repoRoot, sessionDir: INIT.sessionDir, runGit: CLEAN_LOCAL })
  assert.equal(anchored.ok, false)
  assert.ok(anchored.categories.includes("evidence_session_mismatch"))
})

test("unsigned receipts, forged signatures, and digest-trust tampering all fail", () => {
  const unsigned = verifyTampered((record) => { for (const op of (record.operations as Op[])) op.receipt_signature = "zz" }, { resign: false })
  assert.ok(unsigned.categories.includes("evidence_receipt_unsigned"))
  const forged = verifyTampered((record) => { for (const op of (record.operations as Op[])) op.receipt_signature = "0".repeat(128) }, { resign: false })
  assert.ok(forged.categories.includes("evidence_receipt_signature_invalid"))
  const trusted = verifyTampered((record) => { ((record.operations as Op[])[1]).status = "failed" }, { resign: false, redigestPack: false })
  assert.ok(trusted.categories.includes("evidence_receipt_digest_mismatch"))
  assert.ok(trusted.categories.includes("evidence_digest_mismatch"))
})

// ─── receipt-binding violations (session/commit/producer/authority/chain) ──

test("a session-id, commit, producer, or authority change fails even when fully re-signed", () => {
  assert.ok(verifyTampered((r) => { ((r.operations as Op[])[3]).session_id = `evs-${"99".repeat(16)}` }).categories.includes("evidence_session_mismatch"))
  assert.ok(verifyTampered((r) => { ((r.operations as Op[])[2]).repository_commit_sha = "f".repeat(40) }).categories.includes("evidence_repository_mismatch"))
  assert.ok(verifyTampered((r) => { ((r.operations as Op[])[0]).producer = "cf_worker_deploy" }).categories.includes("evidence_producer_mismatch"))
  assert.ok(verifyTampered((r) => { ((r.operations as Op[])[4]).authority_sha256 = sha256Hex("another") }).categories.includes("evidence_authority_mismatch"))
})

test("a receipt-chain break, producer-source tamper, and result-digest tamper all fail", () => {
  const chain = verifyTampered((r) => { ((r.operations as Op[])[5]).previous_receipt_sha256 = sha256Hex("severed") }, { resign: false })
  assert.ok(chain.categories.includes("evidence_receipt_chain_invalid"))
  const source = verifyTampered((r) => { ((r.operations as Op[])[0]).producer_source_sha256 = sha256Hex("tampered-source") })
  assert.ok(source.categories.includes("evidence_producer_source_mismatch"))
  const result = verifyTampered((r) => {
    const op = (r.operations as Op[])[1]
    op.result_digest = sha256Hex("forged-result")
    op.receipt_sha256 = computeReceiptDigest(op)
    op.receipt_signature = edSign(null, Buffer.from(op.receipt_sha256 as string, "utf8"), createPrivateKey(SESSION_PRIVATE_PEM)).toString("hex")
    let previous: string | null = null
    for (const each of r.operations as Op[]) { each.previous_receipt_sha256 = previous; each.receipt_sha256 = computeReceiptDigest(each); each.receipt_signature = edSign(null, Buffer.from(each.receipt_sha256 as string, "utf8"), createPrivateKey(SESSION_PRIVATE_PEM)).toString("hex"); previous = each.receipt_sha256 as string }
  }, { resign: false })
  assert.ok(result.categories.includes("evidence_receipt_digest_mismatch"))
})

// ─── strict categories + temporal ─────────────────────────────────

test("an arbitrary database-name string and unknown categories fail the per-operation allowlist", () => {
  const dbName = verifyTampered((r) => { ((r.operations as Op[])[2]).safe_categories = ["atra_control_prod", "control_db_schema_ok", "tenant_db_schema_ok"].sort() })
  assert.ok(dbName.categories.includes("evidence_category_not_allowlisted"))
  const unknown = verifyTampered((r) => { ((r.operations as Op[])[0]).safe_categories = ["made_up_category"] })
  assert.ok(unknown.categories.includes("evidence_category_not_allowlisted"))
})

test("a deploy timestamped before its predecessor fails even when fully re-signed", () => {
  const result = verifyTampered((r) => {
    const deploy = (r.operations as Op[])[6]
    deploy.started_at = "2029-12-31T11:00:00.000Z"; deploy.completed_at = "2029-12-31T11:05:00.000Z"
  })
  assert.equal(result.ok, false)
  assert.ok(result.categories.includes("evidence_temporal_order_invalid"))
})

test("a failed receipt is reported, and an incomplete pack fails", () => {
  const failed = verifyTampered((r) => {
    const op = (r.operations as Op[])[1]
    op.status = "failed"; op.safe_categories = ["migration_apply_failed"]; (op.proof as Rec).reconciliation = "not_applicable"
  })
  assert.ok(failed.categories.includes("evidence_failed_operation"))
  const incomplete = verifyTampered((r) => { (r.operations as Op[]).pop() })
  assert.ok(incomplete.categories.includes("evidence_incomplete"))
})

// ─── 17 + 18 + 19. local-checkout binding ─────────────────────────

test("17. the verifier rejects a pack whose recorded commit is not the local HEAD", () => {
  const result = verifyTampered(() => {}, { resign: false, runGit: fixedGitRunner("a".repeat(40)) })
  assert.equal(result.ok, false)
  assert.ok(result.categories.includes("evidence_local_head_mismatch"))
})

test("18. the verifier rejects a dirty local checkout", () => {
  const result = verifyTampered(() => {}, { resign: false, runGit: fixedGitRunner(REPO.commitSha, { dirty: true }) })
  assert.equal(result.ok, false)
  assert.ok(result.categories.includes("evidence_local_tree_dirty"))
})

test("19. the verifier rejects local manifest / plan / schema-contract drift — each digest independently", () => {
  // Real local-file drift: the recomputed manifest digest (and thus the plan) no
  // longer matches the pack.
  const manifestPath = resolve(REPO.repoRoot, "migrations/manifest.json")
  const originalManifest = readFileSync(manifestPath, "utf8")
  try {
    writeFileSync(manifestPath, originalManifest.replace(/}\s*$/, ', "drift": true }'))
    const drift = verifyTampered(() => {}, { resign: false })
    assert.equal(drift.ok, false)
    assert.ok(drift.categories.includes("evidence_local_contract_mismatch"), `got: ${drift.categories.join(",")}`)
  } finally { writeFileSync(manifestPath, originalManifest) }

  // Each recorded contract digest is compared to the local files INDEPENDENTLY:
  // tampering exactly one recorded digest (local files intact) must be caught, which
  // isolates the manifest, plan, and schema-contract comparisons from one another.
  const manifestOnly = verifyTampered((r) => { (r.contracts as Rec).migration_manifest_sha256 = sha256Hex("wrong-manifest") })
  assert.ok(manifestOnly.categories.includes("evidence_local_contract_mismatch"), "manifest digest compared on its own")
  const planOnly = verifyTampered((r) => { (r.contracts as Rec).migration_plan_digest = sha256Hex("wrong-plan") })
  assert.ok(planOnly.categories.includes("evidence_local_contract_mismatch"), "plan digest compared on its own")
  const schemaOnly = verifyTampered((r) => { (r.contracts as Rec).schema_contract_sha256 = sha256Hex("wrong-schema") })
  assert.ok(schemaOnly.categories.includes("evidence_local_contract_mismatch"), "schema-contract digest compared on its own")

  // Producer-source drift: a local command file changed after the pack was signed.
  const producerPath = resolve(REPO.repoRoot, "scripts/cf-d1-migrations-check.mjs")
  const originalProducer = readFileSync(producerPath, "utf8")
  try {
    writeFileSync(producerPath, originalProducer + "\n// drift\n")
    const drift = verifyTampered(() => {}, { resign: false })
    assert.ok(drift.categories.includes("evidence_producer_source_mismatch"))
  } finally { writeFileSync(producerPath, originalProducer) }
})

// ─── File-level protections (retained) ────────────────────────────

test("symlinked, oversized, and unparseable packs are refused at the file layer", () => {
  const target = resolve(PACK_DIR, "real-pack.json")
  writeFileSync(target, JSON.stringify(VALID_RECORD), { mode: 0o600 })
  const link = resolve(PACK_DIR, "linked-pack.json")
  symlinkSync(target, link)
  assert.deepEqual(verifyEvidencePackAtPath(link, { repoRoot: REPO.repoRoot }).categories, ["evidence_unreadable"])
  const huge = resolve(PACK_DIR, "huge-pack.json")
  writeFileSync(huge, `{"padding":"${"x".repeat((CONTRACT.limits as { max_file_bytes: number }).max_file_bytes)}"}`, { mode: 0o600 })
  assert.deepEqual(verifyEvidencePackAtPath(huge, { repoRoot: REPO.repoRoot }).categories, ["evidence_too_large"])
  const garbled = resolve(PACK_DIR, "garbled-pack.json")
  writeFileSync(garbled, "{ not json", { mode: 0o600 })
  assert.deepEqual(verifyEvidencePackAtPath(garbled, { repoRoot: REPO.repoRoot }).categories, ["evidence_unparseable"])
  assert.deepEqual(verifyEvidencePackAtPath(resolve(PACK_DIR, "missing.json"), { repoRoot: REPO.repoRoot }).categories, ["evidence_unreadable"])
})

// ─── Category-only output ─────────────────────────────────────────

test("no verification failure ever echoes a value from the pack", () => {
  const secrets = [AUTHORITY.sha256, REPO.commitSha, INIT.publicKey, INIT.sessionId, "atra_control_prod"]
  const result = verifyTampered((r) => {
    const op = (r.operations as Op[])[2]
    op.safe_categories = ["atra_control_prod"]; op.session_id = `evs-${"77".repeat(16)}`
  })
  const serialized = JSON.stringify(result)
  for (const secret of secrets) assert.equal(serialized.includes(secret), false, `must never echo ${secret}`)
  for (const category of result.categories) assert.match(category, /^[a-z0-9_]+$/)
})

// ─── 25 + guards. read-only git only; wiring intact ───────────────

const codeOf = (rel: string) => readFileSync(resolve(REPO_ROOT, rel), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "")

test("25. the verifier does NO network, database, or provider access — only read-only git via the shared library", () => {
  const src = codeOf("scripts/cf-d1-evidence-verify.mjs")
  assert.doesNotMatch(src, /\bfetch\s*\(|node:net|node:http|node:https|DatabaseSync|node:sqlite/i, "no network or database")
  assert.doesNotMatch(src, /spawnSync|execSync|child_process/, "the verifier spawns nothing directly")
  assert.doesNotMatch(src, /process\.env\b/, "the verifier reads no environment")
  assert.match(src, /deriveGitFacts\(repoRoot, runGit\)/, "local git binding via the allowlisted read-only runner")
  assert.match(src, /evidence_local_head_mismatch/)
  assert.match(src, /evidence_local_tree_dirty/)
  assert.match(src, /evidence_local_contract_mismatch/)
  assert.match(src, /computeReceiptDigest\(op\) !== op\.receipt_sha256/)
  assert.match(src, /verifyReceiptSignature\(record\.session\.public_key/)
})

test("GUARD: the npm commands exist, the fabrication surface is gone, and no command calls the low-level assembler", () => {
  const pkg = JSON.parse(readFileSync(resolve(REPO_ROOT, "package.json"), "utf8"))
  assert.equal(pkg.scripts["cf:d1:evidence:verify"], "node scripts/cf-d1-evidence-verify.mjs")
  assert.equal(pkg.scripts["cf:d1:evidence:init"], "node scripts/cf-d1-evidence-init.mjs")
  assert.equal(readFileSync(resolve(REPO_ROOT, "package.json"), "utf8").includes("d1EvidenceAdapters"), false)
  let adaptersGone = false
  try { readFileSync(resolve(REPO_ROOT, "scripts/lib/d1EvidenceAdapters.mjs")) } catch { adaptersGone = true }
  assert.equal(adaptersGone, true)
  for (const rel of [
    "scripts/cf-d1-migrations-check.mjs", "scripts/cf-d1-migrations-apply.mjs",
    "scripts/cf-d1-schema-verify-remote.mjs", "scripts/cf-d1-bootstrap-apply.mjs",
    "scripts/cloudflare-deploy-preflight.mjs", "scripts/cloudflare-deploy.mjs",
  ]) {
    assert.doesNotMatch(codeOf(rel), /recordEvidenceOperation\(|createEvidenceSession\(|buildOperationEvidence\(/,
      `${rel} must emit receipts only through its command-local, private emitter`)
  }
})

test("21 + 23. Worker deploy never invokes migration or bootstrap, and EXTERNAL_ACTIONS_ENABLED stays false", () => {
  const deploy = codeOf("scripts/cloudflare-deploy.mjs")
  assert.doesNotMatch(deploy, /cf-d1-migrations-apply|cf-d1-bootstrap-apply/)
  assert.doesNotMatch(deploy, /CF_D1_MIGRATE_EXECUTE|CF_D1_BOOTSTRAP_EXECUTE/)
  const wrangler = JSON.parse(readFileSync(resolve(REPO_ROOT, "wrangler.json"), "utf8"))
  assert.equal(wrangler.vars.EXTERNAL_ACTIONS_ENABLED, "false")
  assert.equal(wrangler.vars.ALLOW_LEGACY_INGEST_FALLBACK, "false")
})
