/**
 * P0-OPS-016 repair — command-bound evidence receipts (Issue #155).
 *
 * The repaired invariant: a successful operational receipt can only be emitted
 * from the actual repository command path after that command reached its existing
 * execution result boundary. Emitters take REAL result objects (no status, no
 * exit code, no caller timestamps), sign with the session's Ed25519 key, chain
 * append-only, and bind to one session, one commit, one authority.
 *
 * Everything here is synthetic and offline: git is exercised only through an
 * injected stub, and no test contacts Cloudflare.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, cpSync, copyFileSync, writeFileSync, readFileSync, rmSync, readdirSync, statSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import {
  initializeEvidenceSessionAt, loadEvidenceSession, deriveAuthorityEvidence, readSessionReceipts,
  beginEvidenceOperation, emitMigrationPlanReceipt, emitMigrationApplyReceipt,
  emitRemoteSchemaVerificationReceipt, emitBootstrapApplyReceipt, emitBootstrapCountsReceipt,
  emitWorkerPreflightReceipt, emitWorkerDeployReceipt, assembleEvidencePackFromSession,
  deriveMigrationPlanDigest, SESSION_PRIVATE_KEY_BASENAME,
} from "../scripts/lib/d1EvidenceReceipts.mjs"
import { sha256Hex, verifyReceiptSignature, EVIDENCE_CONTRACT_RELPATH } from "../scripts/lib/d1OperationalEvidence.mjs"
import { deriveGitFacts, deriveWranglerVersion } from "../scripts/cf-d1-evidence-init.mjs"
import { loadConfigFile, buildConfigWithIds, SYNTHETIC_D1_IDS } from "../scripts/lib/cfDeployConfig.mjs"
import { loadManifest, buildPlan, KNOWN_BINDINGS } from "../scripts/lib/d1MigrationManifest.mjs"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const PRODUCER_SOURCES = [
  "scripts/cf-d1-migrations-check.mjs", "scripts/cf-d1-migrations-apply.mjs",
  "scripts/cf-d1-schema-verify-remote.mjs", "scripts/cf-d1-bootstrap-apply.mjs",
  "scripts/cloudflare-deploy-preflight.mjs", "scripts/cloudflare-deploy.mjs",
]

/** A synthetic repository carrying everything the evidence layer derives from. */
function makeEvidenceRepo(): string {
  const tmp = mkdtempSync(resolve(tmpdir(), "d1-evr-"))
  mkdirSync(resolve(tmp, "contracts/operations"), { recursive: true })
  copyFileSync(resolve(REPO_ROOT, EVIDENCE_CONTRACT_RELPATH), resolve(tmp, EVIDENCE_CONTRACT_RELPATH))
  cpSync(resolve(REPO_ROOT, "migrations"), resolve(tmp, "migrations"), { recursive: true })
  copyFileSync(resolve(REPO_ROOT, "wrangler.json"), resolve(tmp, "wrangler.json"))
  mkdirSync(resolve(tmp, "scripts/lib"), { recursive: true })
  for (const rel of PRODUCER_SOURCES) copyFileSync(resolve(REPO_ROOT, rel), resolve(tmp, rel))
  mkdirSync(resolve(tmp, ".open-next"), { recursive: true })
  writeFileSync(resolve(tmp, ".open-next/worker.js"), "// synthetic worker artifact\n")
  writeFileSync(resolve(tmp, ".gitignore"), "/.d1-evidence/\n")
  return tmp
}

const SYNTHETIC_COMMIT = "0123456789abcdef0123456789abcdef01234567"
const DERIVED = { commitSha: SYNTHETIC_COMMIT, dirtyTree: false as const, nodeVersion: "v22.0.0", wranglerVersion: "4.99.0" }

function initSession(repo: string, environmentClass = "staging") {
  const initialized = initializeEvidenceSessionAt({ repoRoot: repo, environmentClass, derived: DERIVED })
  if (!initialized.ok) throw new Error(`init must succeed: ${initialized.blocked.join(",")}`)
  return initialized
}

/** A REAL retained-authority object (synthetic ids, consistent bytes + digest). */
function makeAuthority(ids: Record<string, string> = SYNTHETIC_D1_IDS) {
  const base = (loadConfigFile(resolve(REPO_ROOT, "wrangler.json")) as { config: Record<string, unknown> }).config
  const bytes = JSON.stringify(buildConfigWithIds(base, ids), null, 2)
  return { bytes, sha256: sha256Hex(bytes), snapshot: JSON.parse(bytes) }
}
const AUTHORITY = makeAuthority()

/** Deterministic future clocks (after any real session created_at). */
const at = (iso: string) => () => new Date(iso)
let clockSeq = 0
function nextBoundary() {
  const i = clockSeq++
  const started = `2030-01-01T00:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}.000Z`
  return { begun: beginEvidenceOperation(at(started)), clock: at(started.replace(".000Z", ".500Z")) }
}

function repoPlan(repo: string) {
  const loaded = loadManifest(repo)
  if (!loaded.ok) throw new Error("manifest must load")
  return KNOWN_BINDINGS.flatMap((binding) => buildPlan(loaded.manifest, binding))
}

/** Emit the full 7-receipt successful sequence into a session. */
function emitAll(repo: string, sessionDir: string) {
  const plan = repoPlan(repo)
  const seq: Array<() => { ok: boolean; blocked?: string[] }> = [
    () => { const b = nextBoundary(); return emitMigrationPlanReceipt(sessionDir, { repoRoot: repo, authority: AUTHORITY, begun: b.begun, clock: b.clock, checkResult: { ok: true, failures: [] } }) },
    () => { const b = nextBoundary(); return emitMigrationApplyReceipt(sessionDir, { repoRoot: repo, authority: AUTHORITY, begun: b.begun, clock: b.clock, applyResult: { completed: true, appliedPlan: plan } }) },
    () => { const b = nextBoundary(); return emitRemoteSchemaVerificationReceipt(sessionDir, { repoRoot: repo, authority: AUTHORITY, begun: b.begun, clock: b.clock, verificationResult: { ok: true, failures: [], authorityDigest: AUTHORITY.sha256 } }) },
    () => { const b = nextBoundary(); return emitBootstrapApplyReceipt(sessionDir, { repoRoot: repo, authority: AUTHORITY, begun: b.begun, clock: b.clock, bootstrapResult: { committed: true, canonicalSqlSha256: sha256Hex("synthetic canonical sql") } }) },
    () => { const b = nextBoundary(); return emitBootstrapCountsReceipt(sessionDir, { repoRoot: repo, authority: AUTHORITY, begun: b.begun, clock: b.clock, countsResult: { ok: true, failures: [] } }) },
    () => { const b = nextBoundary(); return emitWorkerPreflightReceipt(sessionDir, { repoRoot: repo, authority: AUTHORITY, begun: b.begun, clock: b.clock, preflightResult: { ok: true, failures: [], checkedArtifacts: true } }) },
    () => { const b = nextBoundary(); return emitWorkerDeployReceipt(sessionDir, { repoRoot: repo, authority: AUTHORITY, begun: b.begun, clock: b.clock, deployResult: { deployed: true } }) },
  ]
  for (const step of seq) {
    const emitted = step()
    if (!emitted.ok) throw new Error(`emit must succeed: ${emitted.blocked?.join(",")}`)
  }
}

// ─── 22 + 23. initialization derives, never accepts ───────────────

test("22. a dirty worktree fails initialization — at the git layer and at the session layer", () => {
  const dirty = deriveGitFacts((args) => args[0] === "rev-parse" ? `${SYNTHETIC_COMMIT}\n` : " M scripts/x.mjs\n")
  assert.deepEqual(dirty, { ok: false, blocked: ["repository_dirty"] })
  const repo = makeEvidenceRepo()
  try {
    const refused = initializeEvidenceSessionAt({ repoRoot: repo, environmentClass: "staging", derived: { ...DERIVED, dirtyTree: true as never } })
    assert.equal(refused.ok, false)
    assert.ok(!refused.ok && refused.blocked.includes("repository_dirty"))
  } finally { rmSync(repo, { recursive: true, force: true }) }
})

test("23. initialization DERIVES HEAD and repository digests — they are not caller claims", () => {
  // HEAD comes from git; an unresolvable HEAD fails closed.
  const derived = deriveGitFacts((args) => args[0] === "rev-parse" ? `${SYNTHETIC_COMMIT}\n` : "")
  assert.deepEqual(derived, { ok: true, commitSha: SYNTHETIC_COMMIT, dirtyTree: false })
  assert.deepEqual(deriveGitFacts(() => null), { ok: false, blocked: ["head_unresolvable"] })
  assert.deepEqual(deriveGitFacts(() => "not-a-sha\n"), { ok: false, blocked: ["head_unresolvable"] })
  // The wrangler version is derived from the installed package.
  assert.match(deriveWranglerVersion(REPO_ROOT) ?? "", /^\d+\.\d+\.\d+$/)
  // The session manifest's contract digests are derived from the repository files.
  const repo = makeEvidenceRepo()
  try {
    const init = initSession(repo)
    const manifest = JSON.parse(readFileSync(resolve(init.sessionDir, "session.json"), "utf8"))
    assert.equal(manifest.migration_manifest_sha256, sha256Hex(readFileSync(resolve(repo, "migrations/manifest.json"))))
    assert.equal(manifest.schema_contract_sha256, sha256Hex(readFileSync(resolve(repo, "migrations/schema-contract.json"))))
    assert.equal(manifest.migration_plan_digest, deriveMigrationPlanDigest(repo))
    assert.equal(manifest.commit_sha, SYNTHETIC_COMMIT)
    // The private key is 0600, exclusive, and confined to the session directory.
    const keyPath = resolve(init.sessionDir, SESSION_PRIVATE_KEY_BASENAME)
    assert.equal(statSync(keyPath).mode & 0o777, 0o600)
    assert.equal(statSync(resolve(init.sessionDir, "session.json")).mode & 0o777, 0o600)
    // A missing required file fails closed.
    rmSync(resolve(repo, "migrations/manifest.json"))
    const refused = initializeEvidenceSessionAt({ repoRoot: repo, environmentClass: "staging", derived: DERIVED })
    assert.equal(refused.ok, false)
  } finally { rmSync(repo, { recursive: true, force: true }) }
})

// ─── 24. physical separation is DERIVED from the validated authority ──

test("24. Control/Tenant physical separation is derived from the authority bytes — never accepted as a boolean", () => {
  const derived = deriveAuthorityEvidence(AUTHORITY)
  assert.deepEqual(derived, { ok: true, authoritySha256: AUTHORITY.sha256, physicallyDistinct: true })
  // Same physical database on both bindings → refused.
  const same = makeAuthority({ CONTROL_DB: SYNTHETIC_D1_IDS.CONTROL_DB, TENANT_DB_DEFAULT: SYNTHETIC_D1_IDS.CONTROL_DB })
  const refused = deriveAuthorityEvidence(same)
  assert.equal(refused.ok, false)
  assert.ok(!refused.ok && refused.blocked.includes("authority_not_physically_distinct"))
  // Inconsistent bytes/digest → refused (a digest claim without matching bytes).
  const inconsistent = { ...AUTHORITY, sha256: sha256Hex("something else") }
  assert.equal(deriveAuthorityEvidence(inconsistent).ok, false)
  // No emitter accepts a physical-separation boolean from its input: the ONLY
  // sources of that fact are deriveAuthorityEvidence (emitters) and the verified
  // authority binding (assembly) — never `input.controlTenantPhysicallyDistinct`.
  const src = readFileSync(resolve(REPO_ROOT, "scripts/lib/d1EvidenceReceipts.mjs"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "")
  assert.doesNotMatch(src, /controlTenantPhysicallyDistinct\s*:\s*(input|derived\b|d)\./, "the separation fact must never be a caller passthrough")
  assert.match(src, /const derivedAuthority = deriveAuthorityEvidence\(authority\)/, "every receipt derives the authority facts")
  assert.match(src, /control\[0\]\.database_id !== tenant\[0\]\.database_id/, "distinctness is computed from the parsed authority bytes")
})

// ─── 2. no exit-code fabrication path ─────────────────────────────

test("2. a plain caller cannot mint a successful receipt from an exit code or invented facts", () => {
  const repo = makeEvidenceRepo()
  try {
    const { sessionDir } = initSession(repo)
    // (a) There is no exitCode parameter: passing one is result_shape_invalid.
    const b1 = nextBoundary()
    const viaExitCode = emitMigrationApplyReceipt(sessionDir, {
      repoRoot: repo, authority: AUTHORITY, begun: b1.begun, clock: b1.clock,
      applyResult: { exitCode: 0 } as never,
    })
    assert.equal(viaExitCode.ok, false)
    assert.ok(!viaExitCode.ok && viaExitCode.blocked.includes("result_shape_invalid"))
    // (b) Claiming completion with a plan that is NOT the committed plan fails —
    // the emitter recomputes the plan from the repository.
    const b2 = nextBoundary()
    const fakePlan = emitMigrationApplyReceipt(sessionDir, {
      repoRoot: repo, authority: AUTHORITY, begun: b2.begun, clock: b2.clock,
      applyResult: { completed: true, appliedPlan: [] },
    })
    assert.equal(fakePlan.ok, false)
    assert.ok(!fakePlan.ok && fakePlan.blocked.includes("applied_plan_mismatch"))
    // (c) A schema-verification claim whose authority digest does not match the
    // session authority fails — the REAL verifier result carries that digest.
    const b3 = nextBoundary()
    const fakeVerify = emitRemoteSchemaVerificationReceipt(sessionDir, {
      repoRoot: repo, authority: AUTHORITY, begun: b3.begun, clock: b3.clock,
      verificationResult: { ok: true, failures: [], authorityDigest: sha256Hex("other") },
    })
    assert.equal(fakeVerify.ok, false)
    assert.ok(!fakeVerify.ok && fakeVerify.blocked.includes("authority_mismatch"))
    // (d) A deploy claim without a real built Worker artifact fails.
    rmSync(resolve(repo, ".open-next/worker.js"))
    const b4 = nextBoundary()
    const fakeDeploy = emitWorkerDeployReceipt(sessionDir, {
      repoRoot: repo, authority: AUTHORITY, begun: b4.begun, clock: b4.clock, deployResult: { deployed: true },
    })
    assert.equal(fakeDeploy.ok, false)
    assert.ok(!fakeDeploy.ok && fakeDeploy.blocked.includes("worker_artifact_missing"))
    // Nothing above appended a receipt.
    const session = loadEvidenceSession(sessionDir, { repoRoot: repo })
    assert.ok(session.ok)
    if (session.ok) assert.deepEqual(readSessionReceipts(session.session), { ok: true, receipts: [] })
  } finally { rmSync(repo, { recursive: true, force: true }) }
})

// ─── 3 + 6 + 7 + 19. real result paths emit signed, ordered receipts ──

test("3 + 6 + 7 + 19. the seven emitters produce session-signed receipts with sorted allowlisted categories, for success AND failure", () => {
  const repo = makeEvidenceRepo()
  try {
    const init = initSession(repo)
    emitAll(repo, init.sessionDir)
    const session = loadEvidenceSession(init.sessionDir, { repoRoot: repo })
    assert.ok(session.ok)
    if (!session.ok) return
    const read = readSessionReceipts(session.session)
    assert.ok(read.ok, `receipts must verify: ${read.ok ? "" : read.blocked.join(",")}`)
    if (!read.ok) return
    assert.equal(read.receipts.length, 7)
    for (const receipt of read.receipts) {
      assert.equal(receipt.session_id, init.sessionId)
      assert.equal(receipt.repository_commit_sha, SYNTHETIC_COMMIT)
      assert.equal(receipt.authority_sha256, AUTHORITY.sha256)
      assert.equal(verifyReceiptSignature(init.publicKey, receipt.receipt_sha256, receipt.receipt_signature), true, "every receipt is signed by the session key")
      assert.deepEqual([...receipt.safe_categories], [...new Set(receipt.safe_categories)].sort(), "categories are sorted and deduplicated")
      // The producer source digest is the REAL command file digest.
      const sourceRel: string = session.session.contract.producer_sources[receipt.producer]
      assert.equal(receipt.producer_source_sha256, sha256Hex(readFileSync(resolve(repo, sourceRel))))
    }
    // Receipt files are 0600 and exclusive.
    const files = readdirSync(init.sessionDir).filter((name) => name.startsWith("receipt-"))
    assert.equal(files.length, 7)
    for (const file of files) assert.equal(statSync(resolve(init.sessionDir, file)).mode & 0o777, 0o600)

    // A FAILED result also emits (in a fresh session), with failure categories.
    const repo2 = makeEvidenceRepo()
    try {
      const init2 = initSession(repo2)
      const b = nextBoundary()
      const failed = emitMigrationPlanReceipt(init2.sessionDir, {
        repoRoot: repo2, authority: AUTHORITY, begun: b.begun, clock: b.clock,
        checkResult: { ok: false, failures: ["manifest_unreadable"] },
      })
      assert.ok(failed.ok, `a failure receipt is still a receipt: ${failed.ok ? "" : failed.blocked.join(",")}`)
      if (failed.ok) {
        assert.equal(failed.receipt.status, "failed")
        assert.deepEqual([...failed.receipt.safe_categories], ["plan_verification_failed"])
      }
    } finally { rmSync(repo2, { recursive: true, force: true }) }
  } finally { rmSync(repo, { recursive: true, force: true }) }
})

test("append-only chain, duplicates, prerequisites, and failure-blocks-success at the receipt layer", () => {
  const repo = makeEvidenceRepo()
  try {
    const { sessionDir } = initSession(repo)
    const b1 = nextBoundary()
    const plan = emitMigrationPlanReceipt(sessionDir, { repoRoot: repo, authority: AUTHORITY, begun: b1.begun, clock: b1.clock, checkResult: { ok: true, failures: [] } })
    assert.ok(plan.ok)
    // Duplicate operation refused.
    const b2 = nextBoundary()
    const dup = emitMigrationPlanReceipt(sessionDir, { repoRoot: repo, authority: AUTHORITY, begun: b2.begun, clock: b2.clock, checkResult: { ok: true, failures: [] } })
    assert.ok(!dup.ok && dup.blocked.includes("operation_duplicate"))
    // Deploy before schema verification refused (hard prerequisite).
    const b3 = nextBoundary()
    const early = emitWorkerDeployReceipt(sessionDir, { repoRoot: repo, authority: AUTHORITY, begun: b3.begun, clock: b3.clock, deployResult: { deployed: true } })
    assert.ok(!early.ok && early.blocked.includes("operation_prerequisite_missing"))
    // A failed apply blocks every later success.
    const b4 = nextBoundary()
    const failedApply = emitMigrationApplyReceipt(sessionDir, { repoRoot: repo, authority: AUTHORITY, begun: b4.begun, clock: b4.clock, applyResult: { completed: false, appliedPlan: [] } })
    assert.ok(failedApply.ok && failedApply.receipt.status === "failed")
    const b5 = nextBoundary()
    const afterFailure = emitRemoteSchemaVerificationReceipt(sessionDir, { repoRoot: repo, authority: AUTHORITY, begun: b5.begun, clock: b5.clock, verificationResult: { ok: true, failures: [], authorityDigest: AUTHORITY.sha256 } })
    assert.ok(!afterFailure.ok && afterFailure.blocked.includes("operation_after_failure"))
  } finally { rmSync(repo, { recursive: true, force: true }) }
})

// ─── 14. authority binding across the session ─────────────────────

test("14. the session binds to ONE authority at the first command — a different authority is refused", () => {
  const repo = makeEvidenceRepo()
  try {
    const { sessionDir } = initSession(repo)
    const b1 = nextBoundary()
    assert.ok(emitMigrationPlanReceipt(sessionDir, { repoRoot: repo, authority: AUTHORITY, begun: b1.begun, clock: b1.clock, checkResult: { ok: true, failures: [] } }).ok)
    const other = makeAuthority({ CONTROL_DB: "cccccccc-0000-4000-8000-000000000003", TENANT_DB_DEFAULT: "aaaaaaaa-0000-4000-8000-000000000001" })
    const b2 = nextBoundary()
    const mixed = emitMigrationApplyReceipt(sessionDir, { repoRoot: repo, authority: other, begun: b2.begun, clock: b2.clock, applyResult: { completed: true, appliedPlan: repoPlan(repo) } })
    assert.equal(mixed.ok, false)
    assert.ok(!mixed.ok && mixed.blocked.includes("authority_mismatch"))
  } finally { rmSync(repo, { recursive: true, force: true }) }
})

// ─── 10. receipts cannot move between sessions ────────────────────

test("10. a receipt copied into another session fails — foreign session id, key, and chain", () => {
  const repoA = makeEvidenceRepo()
  const repoB = makeEvidenceRepo()
  try {
    const a = initSession(repoA)
    const b = initSession(repoB)
    const bd = nextBoundary()
    assert.ok(emitMigrationPlanReceipt(a.sessionDir, { repoRoot: repoA, authority: AUTHORITY, begun: bd.begun, clock: bd.clock, checkResult: { ok: true, failures: [] } }).ok)
    // Move the signed receipt file into session B.
    copyFileSync(resolve(a.sessionDir, "receipt-0001.json"), resolve(b.sessionDir, "receipt-0001.json"))
    const loadedB = loadEvidenceSession(b.sessionDir, { repoRoot: repoB })
    assert.ok(loadedB.ok)
    if (!loadedB.ok) return
    const read = readSessionReceipts(loadedB.session)
    assert.equal(read.ok, false)
    assert.ok(!read.ok && (read.blocked.includes("session_mismatch") || read.blocked.includes("receipt_signature_invalid")),
      `a foreign receipt must be refused: ${read.ok ? "" : read.blocked.join(",")}`)
    // Assembly of session B therefore fails too.
    assert.equal(assembleEvidencePackFromSession(b.sessionDir, { repoRoot: repoB }).ok, false)
  } finally {
    rmSync(repoA, { recursive: true, force: true })
    rmSync(repoB, { recursive: true, force: true })
  }
})

// ─── 21. timestamps come from the execution boundary ──────────────

test("21. receipt timestamps are captured at the boundary — historical caller instants are refused", () => {
  const repo = makeEvidenceRepo()
  try {
    const { sessionDir } = initSession(repo)
    // A `begun` predating the session itself is refused.
    const historical = emitMigrationPlanReceipt(sessionDir, {
      repoRoot: repo, authority: AUTHORITY,
      begun: { startedAt: "2020-01-01T00:00:00.000Z" }, clock: at("2030-01-01T02:00:00.000Z"),
      checkResult: { ok: true, failures: [] },
    })
    assert.equal(historical.ok, false)
    assert.ok(!historical.ok && historical.blocked.includes("temporal_order_invalid"))
    // startedAt/completedAt fields smuggled inside result objects are ignored: the
    // receipt's instants come from the boundary handle and the emit-time clock.
    const b = nextBoundary()
    const emitted = emitMigrationPlanReceipt(sessionDir, {
      repoRoot: repo, authority: AUTHORITY, begun: b.begun, clock: b.clock,
      checkResult: { ok: true, failures: [], startedAt: "1999-01-01T00:00:00.000Z", completedAt: "1999-01-01T00:00:01.000Z" } as never,
    })
    assert.ok(emitted.ok)
    if (emitted.ok) {
      assert.equal(emitted.receipt.started_at, b.begun.startedAt)
      assert.notEqual(emitted.receipt.started_at, "1999-01-01T00:00:00.000Z")
    }
    // A second receipt starting before the first completed is refused.
    const backdated = emitMigrationApplyReceipt(sessionDir, {
      repoRoot: repo, authority: AUTHORITY,
      begun: { startedAt: emitted.ok ? emitted.receipt.started_at : "2030-01-01T00:00:00.000Z" },
      clock: at("2030-01-01T03:00:00.000Z"),
      applyResult: { completed: true, appliedPlan: repoPlan(repo) },
    })
    assert.equal(backdated.ok, false)
    assert.ok(!backdated.ok && backdated.blocked.includes("temporal_order_invalid"))
  } finally { rmSync(repo, { recursive: true, force: true }) }
})

// ─── 4 + 5 + 6 + 26 + 27. command wiring guards ───────────────────

/** Source with comments stripped — prose must never satisfy or trip a guard. */
const codeOf = (rel: string) => readFileSync(resolve(REPO_ROOT, rel), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "")

test("4 + 6. every emitter call sits INSIDE its command's post-gate result path", () => {
  // migrations:apply — boundary opens AFTER the latch; emission after exitCode.
  const apply = codeOf("scripts/cf-d1-migrations-apply.mjs")
  assert.ok(apply.indexOf("executionAuthorized = true") < apply.indexOf("beginEvidenceOperation()"), "the boundary opens only after every gate")
  assert.ok(apply.indexOf("exitCode = applyAllLanes") < apply.indexOf("emitMigrationApplyReceipt("), "the receipt is emitted only once the outcome is known")
  assert.match(apply, /applyResult: \{ completed: exitCode === 0, appliedPlan \}/)
  // bootstrap:apply — boundary after the latch; both receipts after the result.
  const bootstrap = codeOf("scripts/cf-d1-bootstrap-apply.mjs")
  assert.ok(bootstrap.indexOf("executionAuthorized = true") < bootstrap.indexOf("beginEvidenceOperation()"))
  assert.ok(bootstrap.indexOf("applyBootstrapFile(authority, gates.canonicalSql)") < bootstrap.indexOf("emitBootstrapApplyReceipt("))
  assert.ok(bootstrap.indexOf("verifyBootstrapVia(") < bootstrap.indexOf("emitBootstrapCountsReceipt("))
  // schema:verify:remote — emission after the verification result.
  const verify = codeOf("scripts/cf-d1-schema-verify-remote.mjs")
  assert.ok(verify.indexOf("verifyRemoteSchemasWithAuthority(gates.configAuthority") < verify.indexOf("emitRemoteSchemaVerificationReceipt("))
  assert.match(verify, /verificationResult: result/)
  // migrations:check — emission after runCheck's result.
  const check = codeOf("scripts/cf-d1-migrations-check.mjs")
  assert.ok(check.indexOf("const result = runCheck()") < check.indexOf("emitMigrationPlanReceipt("))
  // preflight — emission after the failures are computed.
  const preflight = codeOf("scripts/cloudflare-deploy-preflight.mjs")
  assert.ok(preflight.indexOf("const failures = []") < preflight.indexOf("emitWorkerPreflightReceipt("))
  assert.match(preflight, /preflightResult: \{ ok: failures\.length === 0, failures, checkedArtifacts: args\.checkArtifacts \}/)
})

test("5. Worker deploy emits ONLY for a real gated deploy attempt — never for an offline run", () => {
  const deploy = codeOf("scripts/cloudflare-deploy.mjs")
  assert.match(deploy, /evidenceSessionDir && execute && retainedAuthority !== null && evidenceBegun !== null/,
    "no deploy receipt without CF_DEPLOY_EXECUTE=1 and a retained authority")
  assert.match(deploy, /evidenceBegun = evidenceSessionDir && execute \? beginEvidenceOperation\(\) : null/,
    "the boundary opens only when a gated deploy will actually run")
  assert.ok(deploy.indexOf("exitCode = runPipeline") < deploy.indexOf("emitWorkerDeployReceipt("), "emission follows the pipeline outcome")
  assert.match(deploy, /deployResult: \{ deployed: exitCode === 0 \}/)
})

test("26. no command passes a clock or timestamps to an emitter, and no gate is weakened or auto-set", () => {
  for (const rel of PRODUCER_SOURCES) {
    const src = codeOf(rel)
    assert.doesNotMatch(src, /clock\s*:/, `${rel} must not inject a clock — timestamps come from the boundary`)
    assert.doesNotMatch(src, /startedAt\s*:|completedAt\s*:/, `${rel} must not supply timestamps`)
  }
  // The gates are untouched and still operator-supplied.
  assert.match(codeOf("scripts/cf-d1-migrations-apply.mjs"), /CF_D1_MIGRATE_EXECUTE/)
  assert.match(codeOf("scripts/cf-d1-migrations-apply.mjs"), /CF_D1_MIGRATE_CONFIRM/)
  assert.match(codeOf("scripts/cf-d1-bootstrap-apply.mjs"), /CF_D1_BOOTSTRAP_EXECUTE/)
  assert.match(codeOf("scripts/cf-d1-bootstrap-apply.mjs"), /CF_D1_BOOTSTRAP_CONFIRM/)
  assert.match(codeOf("scripts/cloudflare-deploy.mjs"), /CF_DEPLOY_EXECUTE === "1"/)
  // The evidence layer itself never names or sets a gate and never spawns.
  for (const rel of ["scripts/lib/d1EvidenceReceipts.mjs", "scripts/lib/d1OperationalEvidence.mjs"]) {
    const src = codeOf(rel)
    assert.doesNotMatch(src, /CF_D1_MIGRATE_EXECUTE|CF_D1_BOOTSTRAP_EXECUTE|CF_DEPLOY_EXECUTE|APPLY_PRODUCTION/, `${rel} must not touch a gate`)
    assert.doesNotMatch(src, /process\.env\b/, `${rel} must not read the environment`)
    assert.doesNotMatch(src, /child_process|spawnSync|execSync|\bfetch\s*\(/i, `${rel} must not spawn or reach a network`)
  }
  // The init CLI spawns ONLY allowlisted read-only git.
  const init = codeOf("scripts/cf-d1-evidence-init.mjs")
  assert.match(init, /const allowed = new Set\(\["rev-parse", "status"\]\)/)
  assert.match(init, /spawnSync\("git", args/)
  assert.equal((init.match(/spawnSync\(/g) ?? []).length, 1, "exactly one spawn site, and it is git")
})

test("27 + 28. Worker deploy still never runs migration or bootstrap, and EXTERNAL_ACTIONS_ENABLED stays false", () => {
  const deploy = codeOf("scripts/cloudflare-deploy.mjs")
  assert.doesNotMatch(deploy, /cf-d1-migrations-apply|cf-d1-bootstrap-apply/)
  assert.doesNotMatch(deploy, /CF_D1_MIGRATE_EXECUTE|CF_D1_BOOTSTRAP_EXECUTE/)
  const wrangler = JSON.parse(readFileSync(resolve(REPO_ROOT, "wrangler.json"), "utf8"))
  assert.equal(wrangler.vars.EXTERNAL_ACTIONS_ENABLED, "false")
  assert.equal(wrangler.vars.ALLOW_LEGACY_INGEST_FALLBACK, "false")
})

test("the assembled pack from a real session verifies, and the session dir never leaks into it", () => {
  const repo = makeEvidenceRepo()
  try {
    const init = initSession(repo)
    emitAll(repo, init.sessionDir)
    const pack = assembleEvidencePackFromSession(init.sessionDir, { repoRoot: repo })
    assert.ok(pack.ok, `assembly must succeed: ${pack.ok ? "" : pack.blocked.join(",")}`)
    if (!pack.ok) return
    assert.equal(existsSync(pack.path), true)
    const serialized = readFileSync(pack.path, "utf8")
    assert.equal(serialized.includes(init.sessionDir), false, "no filesystem path enters the pack")
    assert.equal(serialized.includes("PRIVATE KEY"), false, "the private key never enters the pack")
    assert.equal(JSON.parse(serialized).session.public_key, init.publicKey)
  } finally { rmSync(repo, { recursive: true, force: true }) }
})
