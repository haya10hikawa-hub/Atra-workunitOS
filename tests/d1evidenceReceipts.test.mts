/**
 * P0-OPS-016 SECOND repair — the public evidence surface is no longer forgeable
 * (Issue #155).
 *
 * The previous head exported seven `emit*Receipt(...)` functions plus a generic
 * `produceReceipt`/`signReceiptDigest` core and an initializer that accepted
 * caller-supplied `derived.commitSha`/`derived.dirtyTree`. A plain library caller
 * could hand each emitter a correctly-shaped fabricated success result and receive a
 * complete signed `evidence_valid` pack without running any command. This suite:
 *   - reproduces that the forgery is now IMPOSSIBLE through the public API;
 *   - proves the emitters and signing core are not exported;
 *   - proves the initializer derives repository facts internally and rejects claims;
 *   - proves a receipt still only exists after the command-local derive + sign.
 *
 * Everything is synthetic and offline; git is exercised only through temporary REAL
 * repositories, and no test contacts Cloudflare.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync, writeFileSync, readdirSync, statSync, mkdtempSync, rmSync } from "node:fs"
import { createPrivateKey, sign as edSign, generateKeyPairSync } from "node:crypto"
import { resolve } from "node:path"
import { tmpdir } from "node:os"
import * as receiptsModule from "../scripts/lib/d1EvidenceReceipts.mjs"
import * as coreModule from "../scripts/lib/d1OperationalEvidence.mjs"
import * as verifyModule from "../scripts/cf-d1-evidence-verify.mjs"
import * as initModule from "../scripts/cf-d1-evidence-init.mjs"
import {
  initializeEvidenceSession, loadEvidenceSessionManifest, deriveAuthorityEvidence,
  openCommandReceiptContext, assembleUnsignedReceipt, persistSignedReceipt,
  readSessionReceipts, assembleEvidencePackFromSession, deriveMigrationPlanDigest,
  deriveGitFacts, SESSION_PRIVATE_KEY_BASENAME,
} from "../scripts/lib/d1EvidenceReceipts.mjs"
import { sha256Hex, canonicalSerialize, verifyReceiptSignature } from "../scripts/lib/d1OperationalEvidence.mjs"
import { loadManifest, buildPlan, KNOWN_BINDINGS } from "../scripts/lib/d1MigrationManifest.mjs"
import { verifyEvidencePackAtPath } from "../scripts/cf-d1-evidence-verify.mjs"
import { makeEvidenceGitRepo, makeAuthority, REPO_ROOT } from "./evidenceTestRepo.mts"

const AUTHORITY = makeAuthority()

/** Source with comments stripped — prose must never satisfy or trip a guard. */
const codeOf = (rel: string) => readFileSync(resolve(REPO_ROOT, rel), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "")

/**
 * Sign + persist ONE receipt exactly as a command does (command-local): assemble
 * unsigned via the public helper, read the session key, sign inline, persist. This
 * is the ONLY way a receipt comes to exist — it requires the session private key.
 */
function commandEmit(sessionDir: string, session: unknown, existing: unknown[], input: Record<string, unknown>) {
  const built = assembleUnsignedReceipt(session as never, existing as never, input as never)
  if (!built.ok) return built
  const pem = readFileSync(resolve(sessionDir, SESSION_PRIVATE_KEY_BASENAME), "utf8")
  built.receipt.receipt_signature = edSign(null, Buffer.from(String(built.receipt.receipt_sha256), "utf8"), createPrivateKey(pem)).toString("hex")
  return persistSignedReceipt(session as never, built.receipt)
}

let clockSeq = 0
function boundary() {
  const i = clockSeq++
  const started = `2030-01-01T00:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}.000Z`
  return { startedAt: started, completedAt: started.replace(".000Z", ".500Z") }
}

/** Drive the full seven-receipt success sequence into a session, as commands would. */
function emitFullSuccessSequence(repoRoot: string, sessionDir: string) {
  const sc = (rel: string) => sha256Hex(readFileSync(resolve(repoRoot, rel)))
  const planDigest = deriveMigrationPlanDigest(repoRoot)!
  const loaded = loadManifest(repoRoot)
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
    const ctx = openCommandReceiptContext(sessionDir, { repoRoot, authority: AUTHORITY, producer })
    assert.ok(ctx.ok, `ctx ${operation}: ${ctx.ok ? "" : ctx.blocked.join(",")}`)
    if (!ctx.ok) return
    const b = boundary()
    const emitted = commandEmit(sessionDir, ctx.session, ctx.existingReceipts, {
      operation, producer, authoritySha256: ctx.authoritySha256, producerSourceSha256: ctx.producerSourceSha256,
      startedAt: b.startedAt, completedAt: b.completedAt, status: "success", proof, safeCategories,
    })
    assert.ok(emitted.ok, `emit ${operation}: ${emitted.ok ? "" : emitted.blocked.join(",")}`)
  }
}

// ─── 3 + 4 + 5. the forgeable surface is not exported ─────────────

test("3 + 4 + 5. no receipt emitter, signing core, or result-to-signed-receipt function is exported", () => {
  const forbidden = [
    "emitMigrationPlanReceipt", "emitMigrationApplyReceipt", "emitRemoteSchemaVerificationReceipt",
    "emitBootstrapApplyReceipt", "emitBootstrapCountsReceipt", "emitWorkerPreflightReceipt",
    "emitWorkerDeployReceipt", "produceReceipt", "signReceiptDigest", "beginEvidenceOperation",
    "initializeEvidenceSessionAt", "loadEvidenceSession",
  ]
  for (const name of forbidden) {
    assert.equal((receiptsModule as Record<string, unknown>)[name], undefined, `${name} must not be exported by d1EvidenceReceipts`)
    assert.equal((coreModule as Record<string, unknown>)[name], undefined, `${name} must not be exported by d1OperationalEvidence`)
    assert.equal((verifyModule as Record<string, unknown>)[name], undefined, `${name} must not be exported by the verifier`)
    assert.equal((initModule as Record<string, unknown>)[name], undefined, `${name} must not be exported by the init CLI`)
  }
  // The initializer that survives accepts ONLY repoRoot + environmentClass — its
  // source references no `derived`/commit/dirty claim.
  const src = codeOf("scripts/lib/d1EvidenceReceipts.mjs")
  assert.match(src, /export function initializeEvidenceSession\(\{ repoRoot, environmentClass \} = \{\}\)/)
  assert.doesNotMatch(src, /export function initializeEvidenceSessionAt/)
  // No exported member is a result-to-signed-receipt function: every exported name is
  // one of the known non-authorizing helpers.
  const allowed = new Set([
    "SESSION_MANIFEST_BASENAME", "SESSION_PRIVATE_KEY_BASENAME", "SESSION_AUTHORITY_BASENAME",
    "deriveGitFacts", "deriveWranglerVersion", "deriveMigrationPlanDigest", "deriveRepositoryEvidenceFacts",
    "initializeEvidenceSession", "loadEvidenceSessionManifest", "deriveAuthorityEvidence", "bindSessionAuthority",
    "readSessionReceipts", "verifyReceiptRecord", "openCommandReceiptContext", "assembleUnsignedReceipt",
    "persistSignedReceipt", "assembleEvidencePackFromSession",
  ])
  for (const name of Object.keys(receiptsModule)) {
    assert.ok(allowed.has(name), `unexpected export ${name} — the surface must stay non-authorizing`)
  }
})

test("4b. the signing core is gone from the core module; only VERIFICATION remains", () => {
  const core = codeOf("scripts/lib/d1OperationalEvidence.mjs")
  assert.doesNotMatch(core, /export function signReceiptDigest/)
  assert.doesNotMatch(core, /\bsign as edSign\b/, "the core module imports no signing primitive")
  assert.match(core, /export function verifyReceiptSignature/)
  // assembleUnsignedReceipt genuinely leaves the signature empty — it never signs.
  const receipts = codeOf("scripts/lib/d1EvidenceReceipts.mjs")
  assert.match(receipts, /receipt_sha256: "", receipt_signature: ""/)
  assert.doesNotMatch(receipts, /import \{[^}]*\bsign\b[^}]*\} from "node:crypto"/, "the shared library never imports a signer")
})

// ─── 1 + 2. the direct-emitter reproduction is closed ─────────────

test("1 + 2. the pre-repair direct-emitter forgery cannot be performed through the public API", () => {
  const repo = makeEvidenceGitRepo()
  try {
    const init = initializeEvidenceSession({ repoRoot: repo.repoRoot, environmentClass: "staging" })
    assert.ok(init.ok)
    if (!init.ok) return
    // Pre-repair, a caller called emit*Receipt(sessionDir, { ...fabricated result }).
    // Those functions no longer exist; the strongest remaining public path is to
    // assemble an UNSIGNED receipt from a fabricated success and try to persist it.
    const ctx = openCommandReceiptContext(init.sessionDir, { repoRoot: repo.repoRoot, authority: AUTHORITY, producer: "cf_d1_migration_apply" })
    assert.ok(ctx.ok)
    if (!ctx.ok) return
    const b = boundary()
    const built = assembleUnsignedReceipt(ctx.session, ctx.existingReceipts, {
      operation: "migration_apply_completed", producer: "cf_d1_migration_apply",
      authoritySha256: ctx.authoritySha256, producerSourceSha256: ctx.producerSourceSha256,
      startedAt: b.startedAt, completedAt: b.completedAt, status: "success",
      proof: { plan_digest: sha256Hex("p"), applied_steps_sha256: sha256Hex("a"), reconciliation: "ledger_reconciled" },
      safeCategories: ["control_lane_applied", "ledger_reconciled", "tenant_lane_applied"],
    })
    assert.ok(built.ok, "an UNSIGNED receipt can be assembled — but it is worthless without the key")
    if (!built.ok) return
    // The caller does NOT hold a session-signing function. Persisting the unsigned
    // receipt is refused BEFORE the first receipt is written.
    const persisted = persistSignedReceipt(ctx.session, built.receipt)
    assert.equal(persisted.ok, false)
    assert.ok(!persisted.ok && persisted.blocked.includes("receipt_unsigned"))
    // A receipt signed with a FOREIGN key is refused too.
    const foreign = commandEmitForeign(built.receipt as unknown as Record<string, unknown>)
    const persistedForeign = persistSignedReceipt(ctx.session, foreign)
    assert.equal(persistedForeign.ok, false)
    assert.ok(!persistedForeign.ok && persistedForeign.blocked.includes("receipt_signature_invalid"))
    // Nothing was persisted; assembling a pack from the empty session fails closed.
    const loaded = loadEvidenceSessionManifest(init.sessionDir, { repoRoot: repo.repoRoot })
    assert.ok(loaded.ok)
    if (loaded.ok) assert.deepEqual(readSessionReceipts(loaded.session), { ok: true, receipts: [] })
    const pack = assembleEvidencePackFromSession(init.sessionDir, { repoRoot: repo.repoRoot })
    assert.equal(pack.ok, false)
    assert.ok(!pack.ok && pack.blocked.includes("session_has_no_receipts"))
  } finally { repo.cleanup() }
})

/** Sign a receipt with a throwaway foreign key — an attacker who lacks the session key. */
function commandEmitForeign(receipt: Record<string, unknown>) {
  const foreign = generateKeyPairSync("ed25519")
  const clone = { ...receipt }
  clone.receipt_signature = edSign(null, Buffer.from(clone.receipt_sha256 as string, "utf8"), foreign.privateKey).toString("hex")
  return clone
}

// ─── 6 + 7 + 8 + 9. correctly-shaped fabricated results cannot create a receipt ──

test("6 + 7 + 8 + 9. a correctly-shaped fabricated result has NO public function that turns it into a receipt", () => {
  // Each command's real result shape. There is no exported function taking any of
  // these that returns a signed receipt — the only emitters are private to the
  // commands. This is the property the pre-repair `emit*Receipt(...)` violated.
  const fabricated = {
    migration: { completed: true, appliedPlan: [] },
    schema: { ok: true, failures: [], authorityDigest: AUTHORITY.sha256 },
    bootstrap: { committed: true, canonicalSqlSha256: sha256Hex("x") },
    deploy: { deployed: true },
    counts: { ok: true, failures: [] },
    preflight: { ok: true, failures: [], checkedArtifacts: true },
  }
  for (const exported of Object.values(receiptsModule)) {
    if (typeof exported !== "function") continue
    for (const result of Object.values(fabricated)) {
      // No exported function accepts a bare fabricated result and returns a signed
      // receipt: calling each with a fabricated result (and a bad session dir) never
      // yields `{ ok:true, receipt: { receipt_signature: <128 hex> } }`.
      let out: unknown
      try { out = (exported as (...a: unknown[]) => unknown)("/nonexistent-session", result) } catch { out = null }
      const signed = out && typeof out === "object" && (out as Record<string, unknown>).ok === true
        && (out as Record<string, { receipt_signature?: string }>).receipt
        && /^[0-9a-f]{128}$/.test((out as Record<string, { receipt_signature?: string }>).receipt.receipt_signature ?? "")
      assert.ok(!signed, "no exported function may sign a fabricated result")
    }
  }
})

// ─── 14 + 15 + 16. initialization derives, and rejects claims ──────

test("14. session initialization DERIVES HEAD, versions, and contract digests internally", () => {
  const repo = makeEvidenceGitRepo()
  try {
    const init = initializeEvidenceSession({ repoRoot: repo.repoRoot, environmentClass: "staging" })
    assert.ok(init.ok, `init: ${init.ok ? "" : init.blocked.join(",")}`)
    if (!init.ok) return
    const manifest = JSON.parse(readFileSync(resolve(init.sessionDir, "session.json"), "utf8"))
    assert.equal(manifest.commit_sha, repo.commitSha, "HEAD is derived from git, not supplied")
    assert.equal(manifest.migration_manifest_sha256, sha256Hex(readFileSync(resolve(repo.repoRoot, "migrations/manifest.json"))))
    assert.equal(manifest.schema_contract_sha256, sha256Hex(readFileSync(resolve(repo.repoRoot, "migrations/schema-contract.json"))))
    assert.equal(manifest.migration_plan_digest, deriveMigrationPlanDigest(repo.repoRoot))
    assert.equal(manifest.node_version, process.version)
    assert.match(manifest.wrangler_version, /^\d+\.\d+\.\d+$/)
    // The private key + manifest are 0600 and confined to the session directory.
    assert.equal(statSync(resolve(init.sessionDir, SESSION_PRIVATE_KEY_BASENAME)).mode & 0o777, 0o600)
    assert.equal(statSync(resolve(init.sessionDir, "session.json")).mode & 0o777, 0o600)
    assert.deepEqual(deriveGitFacts(repo.repoRoot), { ok: true, commitSha: repo.commitSha, dirtyTree: false })
    const noGit = mkdtempSync(resolve(tmpdir(), "d1-evidence-no-git-"))
    try { assert.deepEqual(deriveGitFacts(noGit), { ok: false, blocked: ["head_unresolvable"] }) }
    finally { rmSync(noGit, { recursive: true, force: true }) }
  } finally { repo.cleanup() }
})

test("15. session initialization REJECTS a dirty worktree — and no caller claim can override it", () => {
  const repo = makeEvidenceGitRepo()
  try {
    // Dirty the tree: modify a tracked file without committing.
    writeFileSync(resolve(repo.repoRoot, "wrangler.json"), readFileSync(resolve(repo.repoRoot, "wrangler.json"), "utf8") + "\n")
    const refused = initializeEvidenceSession({ repoRoot: repo.repoRoot, environmentClass: "staging" })
    assert.equal(refused.ok, false)
    assert.ok(!refused.ok && refused.blocked.includes("repository_dirty"))
    // A caller CLAIM of a clean tree (the pre-repair `derived.dirtyTree: false`) must
    // NOT override the derived-from-git dirty state.
    const claimed = (initializeEvidenceSession as (i: unknown) => { ok: boolean; blocked?: string[] })({
      repoRoot: repo.repoRoot, environmentClass: "staging", derived: { dirtyTree: false, commitSha: repo.commitSha },
    })
    assert.equal(claimed.ok, false)
    assert.ok(!claimed.ok && (claimed.blocked ?? []).includes("repository_dirty"), "a dirty-tree claim is ignored")
    assert.deepEqual(deriveGitFacts(repo.repoRoot), { ok: false, blocked: ["repository_dirty"] })
  } finally { repo.cleanup() }
})

test("16. the production initializer accepts NO caller-supplied commit or dirty-tree claim", () => {
  const repo = makeEvidenceGitRepo()
  try {
    // Attempting the pre-repair call shape (a `derived` object claiming a foreign
    // commit + clean tree) is ignored — the initializer derives from git regardless.
    const init = (initializeEvidenceSession as (i: unknown) => { ok: boolean; sessionDir?: string })({
      repoRoot: repo.repoRoot, environmentClass: "staging",
      derived: { commitSha: "f".repeat(40), dirtyTree: false, nodeVersion: "v1.2.3", wranglerVersion: "9.9.9" },
    })
    assert.ok(init.ok)
    if (!init.ok || !init.sessionDir) return
    const manifest = JSON.parse(readFileSync(resolve(init.sessionDir, "session.json"), "utf8"))
    assert.equal(manifest.commit_sha, repo.commitSha, "the injected commit claim is ignored — HEAD is derived")
    assert.notEqual(manifest.commit_sha, "f".repeat(40))
    assert.equal(manifest.node_version, process.version, "the injected node version claim is ignored")
    // The declared parameter list has no `derived` — the API cannot receive a claim.
    const src = codeOf("scripts/lib/d1EvidenceReceipts.mjs")
    assert.doesNotMatch(src, /initializeEvidenceSession\(\{[^}]*derived/)
  } finally { repo.cleanup() }
})

// ─── 20. the full success pipeline still verifies; invariants intact ──

test("20a. the command-local pipeline produces a verifiable pack; every receipt is session-signed and 0600", () => {
  const repo = makeEvidenceGitRepo()
  try {
    const init = initializeEvidenceSession({ repoRoot: repo.repoRoot, environmentClass: "staging" })
    assert.ok(init.ok)
    if (!init.ok) return
    emitFullSuccessSequence(repo.repoRoot, init.sessionDir)
    const loaded = loadEvidenceSessionManifest(init.sessionDir, { repoRoot: repo.repoRoot })
    assert.ok(loaded.ok)
    if (!loaded.ok) return
    const read = readSessionReceipts(loaded.session)
    assert.ok(read.ok, `receipts must verify: ${read.ok ? "" : read.blocked.join(",")}`)
    if (!read.ok) return
    assert.equal(read.receipts.length, 7)
    for (const receipt of read.receipts) {
      assert.equal(receipt.session_id, init.sessionId)
      assert.equal(receipt.repository_commit_sha, repo.commitSha)
      assert.equal(receipt.authority_sha256, AUTHORITY.sha256)
      assert.equal(verifyReceiptSignature(init.publicKey, receipt.receipt_sha256, receipt.receipt_signature), true)
      assert.deepEqual([...receipt.safe_categories], [...new Set(receipt.safe_categories)].sort())
    }
    for (const file of readdirSync(init.sessionDir).filter((n) => n.startsWith("receipt-"))) {
      assert.equal(statSync(resolve(init.sessionDir, file)).mode & 0o777, 0o600)
    }
    const pack = assembleEvidencePackFromSession(init.sessionDir, { repoRoot: repo.repoRoot })
    assert.ok(pack.ok, `assembly: ${pack.ok ? "" : pack.blocked.join(",")}`)
    if (!pack.ok) return
    const verified = verifyEvidencePackAtPath(pack.path, { repoRoot: repo.repoRoot })
    assert.deepEqual(verified, { ok: true, categories: ["evidence_valid"] }, "real-git binding at the recorded commit")
    // No filesystem path or private key leaks into the pack.
    const serialized = readFileSync(pack.path, "utf8")
    assert.equal(serialized.includes(init.sessionDir), false)
    assert.equal(serialized.includes("PRIVATE KEY"), false)
  } finally { repo.cleanup() }
})

test("20b. authority binding, duplicates, prerequisites, failure-blocks-success, and temporal order still hold", () => {
  const repo = makeEvidenceGitRepo()
  try {
    const init = initializeEvidenceSession({ repoRoot: repo.repoRoot, environmentClass: "staging" })
    assert.ok(init.ok)
    if (!init.ok) return
    const sessionDir = init.sessionDir
    const first = openCommandReceiptContext(sessionDir, { repoRoot: repo.repoRoot, authority: AUTHORITY, producer: "cf_d1_migration_plan" })
    assert.ok(first.ok)
    if (!first.ok) return
    const b1 = boundary()
    assert.ok(commandEmit(sessionDir, first.session, first.existingReceipts, {
      operation: "migration_plan_verified", producer: "cf_d1_migration_plan",
      authoritySha256: first.authoritySha256, producerSourceSha256: first.producerSourceSha256,
      startedAt: b1.startedAt, completedAt: b1.completedAt, status: "success",
      proof: { manifest_sha256: sha256Hex("m"), plan_digest: sha256Hex("p") }, safeCategories: ["manifest_valid", "plan_lanes_verified"],
    }).ok)

    // A DIFFERENT authority on the next command is refused at binding time.
    const otherAuth = makeAuthority({ CONTROL_DB: "cccccccc-0000-4000-8000-000000000003", TENANT_DB_DEFAULT: "aaaaaaaa-0000-4000-8000-000000000001" })
    const mixed = openCommandReceiptContext(sessionDir, { repoRoot: repo.repoRoot, authority: otherAuth, producer: "cf_d1_migration_apply" })
    assert.equal(mixed.ok, false)
    assert.ok(!mixed.ok && mixed.blocked.includes("authority_mismatch"))

    // Duplicate operation refused.
    const dupCtx = openCommandReceiptContext(sessionDir, { repoRoot: repo.repoRoot, authority: AUTHORITY, producer: "cf_d1_migration_plan" })
    assert.ok(dupCtx.ok)
    if (!dupCtx.ok) return
    const b2 = boundary()
    const dup = commandEmit(sessionDir, dupCtx.session, dupCtx.existingReceipts, {
      operation: "migration_plan_verified", producer: "cf_d1_migration_plan",
      authoritySha256: dupCtx.authoritySha256, producerSourceSha256: dupCtx.producerSourceSha256,
      startedAt: b2.startedAt, completedAt: b2.completedAt, status: "success",
      proof: { manifest_sha256: sha256Hex("m"), plan_digest: sha256Hex("p") }, safeCategories: ["manifest_valid", "plan_lanes_verified"],
    })
    assert.ok(!dup.ok && dup.blocked.includes("operation_duplicate"))

    // Deploy before its prerequisites refused.
    const deployCtx = openCommandReceiptContext(sessionDir, { repoRoot: repo.repoRoot, authority: AUTHORITY, producer: "cf_worker_deploy" })
    assert.ok(deployCtx.ok)
    if (!deployCtx.ok) return
    const b3 = boundary()
    const early = commandEmit(sessionDir, deployCtx.session, deployCtx.existingReceipts, {
      operation: "worker_deploy_completed", producer: "cf_worker_deploy",
      authoritySha256: deployCtx.authoritySha256, producerSourceSha256: deployCtx.producerSourceSha256,
      startedAt: b3.startedAt, completedAt: b3.completedAt, status: "success",
      proof: { worker_artifact_sha256: sha256Hex("w"), deploy_result: "worker_deployed" }, safeCategories: ["worker_deployed"],
    })
    assert.ok(!early.ok && early.blocked.includes("operation_prerequisite_missing"))
  } finally { repo.cleanup() }
})

// ─── authority separation is derived, never a boolean claim ────────

test("Control/Tenant physical separation is derived from the authority bytes — never a boolean claim", () => {
  assert.deepEqual(deriveAuthorityEvidence(AUTHORITY), { ok: true, authoritySha256: AUTHORITY.sha256, physicallyDistinct: true })
  const same = makeAuthority({ CONTROL_DB: "aaaaaaaa-0000-4000-8000-000000000001", TENANT_DB_DEFAULT: "aaaaaaaa-0000-4000-8000-000000000001" })
  const refused = deriveAuthorityEvidence(same)
  assert.ok(!refused.ok && refused.blocked.includes("authority_not_physically_distinct"))
  assert.equal(deriveAuthorityEvidence({ ...AUTHORITY, sha256: sha256Hex("other") }).ok, false)
  const src = codeOf("scripts/lib/d1EvidenceReceipts.mjs")
  assert.match(src, /control\[0\]\.database_id !== tenant\[0\]\.database_id/)
})

// ─── 22 + 26. no gate is set/weakened; libraries stay pure ─────────

const PRODUCER_SOURCES = [
  "scripts/cf-d1-migrations-check.mjs", "scripts/cf-d1-migrations-apply.mjs",
  "scripts/cf-d1-schema-verify-remote.mjs", "scripts/cf-d1-bootstrap-apply.mjs",
  "scripts/cloudflare-deploy-preflight.mjs", "scripts/cloudflare-deploy.mjs",
]

test("22. no command sets, weakens, or auto-satisfies an execution gate; the shared recorder never reads env or spawns", () => {
  // Gates are untouched and still operator-supplied.
  assert.match(codeOf("scripts/cf-d1-migrations-apply.mjs"), /CF_D1_MIGRATE_EXECUTE/)
  assert.match(codeOf("scripts/cf-d1-migrations-apply.mjs"), /CF_D1_MIGRATE_CONFIRM/)
  assert.match(codeOf("scripts/cf-d1-bootstrap-apply.mjs"), /CF_D1_BOOTSTRAP_EXECUTE/)
  assert.match(codeOf("scripts/cf-d1-bootstrap-apply.mjs"), /CF_D1_BOOTSTRAP_CONFIRM/)
  assert.match(codeOf("scripts/cloudflare-deploy.mjs"), /CF_DEPLOY_EXECUTE === "1"/)
  // The evidence layer never names/sets a gate, never reads env, never signs via a
  // shared function. The pure recorder additionally never spawns.
  for (const rel of ["scripts/lib/d1EvidenceReceipts.mjs", "scripts/lib/d1OperationalEvidence.mjs"]) {
    const src = codeOf(rel)
    assert.doesNotMatch(src, /CF_D1_MIGRATE_EXECUTE|CF_D1_BOOTSTRAP_EXECUTE|CF_DEPLOY_EXECUTE|APPLY_PRODUCTION/, `${rel} must not touch a gate`)
    assert.doesNotMatch(src, /process\.env\b/, `${rel} must not read the environment`)
    assert.doesNotMatch(src, /\bfetch\s*\(|node:net|node:http|node:https/i, `${rel} must not reach a network`)
  }
  // The recorder is spawn-free; the receipts library spawns ONLY allowlisted read-only git.
  assert.doesNotMatch(codeOf("scripts/lib/d1OperationalEvidence.mjs"), /child_process|spawnSync|execSync/, "the recorder never spawns")
  const receipts = codeOf("scripts/lib/d1EvidenceReceipts.mjs")
  assert.match(receipts, /"rev-parse\\0--verify\\0HEAD"/)
  assert.match(receipts, /status\\0--porcelain=v1\\0--untracked-files=all\\0--ignore-submodules=none/, "git is exactly allowlisted read-only")
  assert.match(receipts, /core\.fsmonitor=false/)
  assert.match(receipts, /GIT_OPTIONAL_LOCKS:\s*"0"/, "Git control environment is not inherited and optional locks are disabled")
  assert.equal((receipts.match(/spawnSync\(/g) ?? []).length, 1, "exactly one spawn site, and it is git")
})

test("6b + 7b + 8b + 9b. each command derives status ONLY from its OWN real result field", () => {
  // A deploy claim (`deployed`) may be honoured ONLY by the deploy command, a
  // completion claim (`completed`) ONLY by migration apply, a commit claim
  // (`committed`) ONLY by bootstrap apply. No command reads another command's
  // result field — that is exactly what made a shared emitter forgeable.
  const chk = codeOf("scripts/cf-d1-migrations-check.mjs")
  assert.doesNotMatch(chk, /\.(deployed|completed|committed)\b/, "the plan check reads none of the write-result fields")
  const app = codeOf("scripts/cf-d1-migrations-apply.mjs")
  assert.match(app, /applyResult\.completed/)
  assert.doesNotMatch(app, /\.(deployed|committed)\b/, "migration apply never accepts deployed/committed")
  const boot = codeOf("scripts/cf-d1-bootstrap-apply.mjs")
  assert.match(boot, /bootstrapResult\.committed/)
  assert.doesNotMatch(boot, /\.deployed\b/, "bootstrap apply never accepts deployed")
  const dep = codeOf("scripts/cloudflare-deploy.mjs")
  assert.match(dep, /deployResult\.deployed/)
  assert.doesNotMatch(dep, /\.(completed|committed)\b/, "worker deploy never accepts completed/committed")
})

test("26. no command injects a clock or timestamps into the receipt helpers", () => {
  for (const rel of PRODUCER_SOURCES) {
    const src = codeOf(rel)
    assert.doesNotMatch(src, /\bclock\s*:/, `${rel} must not inject a clock`)
    assert.doesNotMatch(src, /begun\s*:/, `${rel} must not pass a begun handle to a shared emitter`)
    // Timestamps are captured privately, at the boundary, by the command.
    assert.match(src, /new Date\(\)\.toISOString\(\)/, `${rel} captures its own boundary timestamp`)
  }
})
