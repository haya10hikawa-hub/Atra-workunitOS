/**
 * D1 Evidence Sessions + safe receipt helpers (P0-OPS-016 second repair, Issue #155).
 *
 * WHAT CHANGED IN THIS REPAIR
 * ---------------------------
 * The previous head exported seven `emit*Receipt(...)` functions plus a generic
 * `produceReceipt(...)`/`signReceiptDigest(...)` core and an initializer that
 * accepted caller-supplied `derived.commitSha`/`derived.dirtyTree`. That surface
 * was FORGEABLE: an ordinary imported caller could initialize a session, hand each
 * emitter a correctly-shaped fabricated success result (`{ completed:true,
 * appliedPlan }`, `{ deployed:true }`, …), let the library read the session key and
 * sign, and assemble a pack that passed every check — without running any command.
 *
 * The repaired boundary:
 *
 *   A caller that did not execute the actual repository command path must not have
 *   a production API that can create or sign a successful receipt from a
 *   caller-supplied result object.
 *
 * So there is NO result-to-signed-receipt function here. Receipt CREATION and
 * SIGNING are command-local: each operator command derives its own status and proof
 * from its real result, reads the session private key itself, and signs inline.
 * This module exports only NON-authorizing helpers a command may compose:
 *   - `initializeEvidenceSession` — derives repository facts internally (git HEAD,
 *     clean tree, versions, contract digests); accepts NO commit/dirty-tree claim;
 *   - `loadEvidenceSessionManifest` — loads + validates a session manifest WITHOUT
 *     ever returning the private key;
 *   - `deriveAuthorityEvidence`, `bindSessionAuthority` — authority derivation +
 *     first-writer-wins binding (no signing);
 *   - `assembleUnsignedReceipt` — pure canonical assembly of an UNSIGNED receipt
 *     (its output is useless until a holder of the session key signs it);
 *   - `persistSignedReceipt` — VERIFIES an already-signed receipt (digest + session
 *     signature + chain + categories + scan) and writes it 0600/exclusive; it
 *     refuses anything not already validly signed by the session key, so it is not
 *     a signer;
 *   - `readSessionReceipts`, `verifyReceiptRecord`, `assembleEvidencePackFromSession`
 *     — verification + pack assembly from already-verified receipts.
 *
 * TRUST MODEL (state it honestly)
 * -------------------------------
 * The session key protects receipt integrity after a command writes the receipt. It
 * does NOT cryptographically attest which JavaScript call site invoked the signing
 * code, and does NOT protect against a machine owner who reads the local private key
 * or modifies source. Ed25519 alone does not prove command execution. Actual remote
 * execution proof still requires the documented Cloudflare-side cross-check and human
 * review (see docs/operations/D1_OPERATIONAL_EVIDENCE.md).
 */

import { generateKeyPairSync, randomBytes } from "node:crypto"
import { spawnSync } from "node:child_process"
import { readFileSync, writeFileSync, mkdirSync, readdirSync, lstatSync } from "node:fs"
import { resolve as resolvePath } from "node:path"
import {
  loadEvidenceContract, scanSensitiveEvidence, canonicalSerialize, sha256Hex,
  isStrictUtcIso, deepFreezeEvidence, computeReceiptDigest,
  verifyReceiptSignature, createEvidenceSession, recordEvidenceOperation,
  finalizeEvidenceSession, writeEvidencePack, EVIDENCE_DIRNAME, EVIDENCE_FORMATS,
} from "./d1OperationalEvidence.mjs"
import { loadManifest, buildPlan, tenantRegistrySchemaVersion, KNOWN_BINDINGS } from "./d1MigrationManifest.mjs"
import { validateD1Id } from "./cfDeployConfig.mjs"

const RE = EVIDENCE_FORMATS
export const SESSION_MANIFEST_BASENAME = "session.json"
export const SESSION_PRIVATE_KEY_BASENAME = "session-key.pem"
export const SESSION_AUTHORITY_BASENAME = "authority-binding.json"

const SESSION_MANIFEST_FIELDS = ["session_version", "session_id", "environment_class", "created_at", "public_key",
  "commit_sha", "node_version", "wrangler_version",
  "migration_manifest_sha256", "migration_plan_digest", "schema_contract_sha256", "expected_schema_version"]

// ─── Read-only repository derivation (git + versions + digests) ───
//
// Every repository fact the session records is DERIVED here — never accepted as a
// caller claim. The ONLY process spawned is read-only `git` (`rev-parse`/`status`),
// allowlisted below; there is no network, D1, Wrangler, or write path.

/** Run ONE allowlisted read-only git command in `repoRoot`; null on failure. */
function readOnlyGit(repoRoot, args) {
  const allowed = new Set([
    "rev-parse\0--verify\0HEAD",
    "status\0--porcelain=v1\0--untracked-files=all\0--ignore-submodules=none",
  ])
  if (!allowed.has(args.join("\0"))) throw new Error("git_command_not_allowlisted")
  // A fixed child environment prevents GIT_DIR/GIT_WORK_TREE/GIT_CONFIG_* (and
  // PATH) from redirecting authority. Optional locks and repo-configured filesystem
  // monitors/caches are disabled so status cannot write the index or invoke a hook.
  const gitArgs = ["-c", "core.fsmonitor=false", "-c", "core.untrackedCache=false", ...args]
  const result = spawnSync("git", gitArgs, {
    cwd: repoRoot, encoding: "utf8", env: { LANG: "C", LC_ALL: "C", GIT_OPTIONAL_LOCKS: "0" },
  })
  if (result.status !== 0) return null
  return result.stdout
}

/**
 * Derive the HEAD commit and worktree cleanliness from the private allowlisted git
 * runner. A dirty tree or an unresolvable HEAD fails closed. Callers cannot replace
 * the repository authority; tests exercise this only through temporary real repos.
 */
export function deriveGitFacts(repoRoot) {
  const head = readOnlyGit(repoRoot, ["rev-parse", "--verify", "HEAD"])
  const commitSha = head ? head.trim() : null
  if (!commitSha || !RE.commitSha.test(commitSha)) return { ok: false, blocked: ["head_unresolvable"] }
  const status = readOnlyGit(repoRoot, ["status", "--porcelain=v1", "--untracked-files=all", "--ignore-submodules=none"])
  if (status === null) return { ok: false, blocked: ["worktree_state_unresolvable"] }
  if (status.trim().length > 0) return { ok: false, blocked: ["repository_dirty"] }
  return { ok: true, commitSha, dirtyTree: false }
}

/** The pinned Wrangler version, derived from the installed package — not claimed. */
export function deriveWranglerVersion(repoRoot) {
  try {
    const pkg = JSON.parse(readFileSync(resolvePath(repoRoot, "node_modules/wrangler/package.json"), "utf8"))
    return typeof pkg.version === "string" ? pkg.version : null
  } catch {
    return null
  }
}

/** SHA-256 of a repository file's exact bytes; null when unreadable. */
function fileDigest(repoRoot, relPath) {
  try { return sha256Hex(readFileSync(resolvePath(repoRoot, relPath))) } catch { return null }
}

/** The 64-hex digest of the full committed migration plan (both lanes, in order). */
export function deriveMigrationPlanDigest(repoRoot) {
  const loaded = loadManifest(repoRoot)
  if (!loaded.ok) return null
  const steps = KNOWN_BINDINGS.flatMap((binding) => buildPlan(loaded.manifest, binding).map((step) => ({
    apply: step.apply, binding, kind: step.kind, path: step.path, sequence: step.sequence, sha256: step.sha256,
  })))
  return sha256Hex(canonicalSerialize(steps))
}

/** Repository facts every evidence session must derive — never accept as claims. */
export function deriveRepositoryEvidenceFacts(repoRoot) {
  const blocked = []
  const manifestSha256 = fileDigest(repoRoot, "migrations/manifest.json")
  if (!manifestSha256) blocked.push("migration_manifest_unreadable")
  const schemaContractSha256 = fileDigest(repoRoot, "migrations/schema-contract.json")
  if (!schemaContractSha256) blocked.push("schema_contract_unreadable")
  const planDigest = deriveMigrationPlanDigest(repoRoot)
  if (!planDigest) blocked.push("migration_plan_underivable")
  const loaded = loadManifest(repoRoot)
  const expectedSchemaVersion = loaded.ok ? tenantRegistrySchemaVersion(loaded.manifest) : null
  if (!expectedSchemaVersion) blocked.push("schema_version_underivable")
  if (blocked.length > 0) return { ok: false, blocked }
  return { ok: true, facts: { manifestSha256, schemaContractSha256, planDigest, expectedSchemaVersion } }
}

// ─── Session initialization (offline; derives everything) ─────────

/**
 * Create one evidence session under the git-ignored evidence directory.
 *
 * The initializer accepts ONLY `{ repoRoot, environmentClass }`. It DERIVES — and
 * never accepts as claims — the HEAD commit, worktree cleanliness, Node version,
 * Wrangler version, and the migration-manifest/migration-plan/schema-contract
 * digests. A dirty tree, an unresolvable HEAD, or an underivable digest fails
 * closed. There is deliberately no `derived` parameter and no test-injection point:
 * tests drive it with a temporary REAL git repository.
 *
 * Produces `<repo>/.d1-evidence/<session-id>/session.json` (0600, exclusive) and the
 * session's Ed25519 private key PEM (0600, exclusive). The private key never leaves
 * this directory and is never logged or embedded in any record.
 */
export function initializeEvidenceSession({ repoRoot, environmentClass } = {}) {
  if (!repoRoot) return { ok: false, blocked: ["repo_root_missing"] }
  const loaded = loadEvidenceContract(repoRoot)
  if (!loaded.ok) return { ok: false, blocked: loaded.blocked }
  const contract = loaded.contract
  const blocked = []
  if (!contract.environment_classes.includes(environmentClass)) blocked.push("environment_class_invalid")

  // Repository identity is DERIVED here, from git and the installed toolchain.
  const git = deriveGitFacts(repoRoot)
  if (!git.ok) blocked.push(...git.blocked)
  const wranglerVersion = deriveWranglerVersion(repoRoot)
  if (typeof wranglerVersion !== "string" || !RE.wranglerVersion.test(wranglerVersion)) blocked.push("wrangler_version_underivable")
  const nodeVersion = process.version
  if (typeof nodeVersion !== "string" || !RE.nodeVersion.test(nodeVersion)) blocked.push("node_version_underivable")

  // Contract digests are DERIVED from the repository files — not accepted.
  const facts = deriveRepositoryEvidenceFacts(repoRoot)
  if (!facts.ok) blocked.push(...facts.blocked)

  // The evidence directory must be git-ignored before anything is written.
  let gitignore
  try { gitignore = readFileSync(resolvePath(repoRoot, ".gitignore"), "utf8") } catch { gitignore = "" }
  if (!new RegExp(`^/${EVIDENCE_DIRNAME.replace(".", "\\.")}/$`, "m").test(gitignore)) blocked.push("evidence_directory_not_ignored")
  if (blocked.length > 0) return { ok: false, blocked: [...new Set(blocked)] }

  const sessionId = `evs-${randomBytes(16).toString("hex")}`
  const { publicKey, privateKey } = generateKeyPairSync("ed25519")
  const publicKeyHex = Buffer.from(publicKey.export({ format: "jwk" }).x, "base64url").toString("hex")
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" })

  const manifest = {
    session_version: "1",
    session_id: sessionId,
    environment_class: environmentClass,
    created_at: new Date().toISOString(),
    public_key: publicKeyHex,
    commit_sha: git.commitSha,
    node_version: nodeVersion,
    wrangler_version: wranglerVersion,
    migration_manifest_sha256: facts.facts.manifestSha256,
    migration_plan_digest: facts.facts.planDigest,
    schema_contract_sha256: facts.facts.schemaContractSha256,
    expected_schema_version: facts.facts.expectedSchemaVersion,
  }

  const sessionDir = resolvePath(repoRoot, EVIDENCE_DIRNAME, sessionId)
  try {
    mkdirSync(sessionDir, { recursive: true, mode: 0o700 })
    writeFileSync(resolvePath(sessionDir, SESSION_MANIFEST_BASENAME), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600, flag: "wx" })
    writeFileSync(resolvePath(sessionDir, SESSION_PRIVATE_KEY_BASENAME), privateKeyPem, { mode: 0o600, flag: "wx" })
  } catch {
    return { ok: false, blocked: ["session_directory_unwritable"] }
  }
  return { ok: true, sessionDir, sessionId, publicKey: publicKeyHex }
}

/**
 * Load + strictly validate a session's MANIFEST (never the private key). Commands
 * that need to sign read the private key themselves, inline — this shared helper
 * deliberately never hands the signing capability to a caller.
 */
export function loadEvidenceSessionManifest(sessionDir, { repoRoot } = {}) {
  if (!sessionDir || !repoRoot) return { ok: false, blocked: ["session_unreadable"] }
  const loaded = loadEvidenceContract(repoRoot)
  if (!loaded.ok) return { ok: false, blocked: loaded.blocked }
  let manifest
  try { manifest = JSON.parse(readFileSync(resolvePath(sessionDir, SESSION_MANIFEST_BASENAME), "utf8")) } catch {
    return { ok: false, blocked: ["session_unreadable"] }
  }
  const keys = manifest && typeof manifest === "object" && !Array.isArray(manifest) ? Object.keys(manifest) : null
  const shapeOk = keys !== null
    && keys.length === SESSION_MANIFEST_FIELDS.length
    && SESSION_MANIFEST_FIELDS.every((field) => keys.includes(field))
    && manifest.session_version === "1"
    && RE.sessionId.test(manifest.session_id ?? "")
    && loaded.contract.environment_classes.includes(manifest.environment_class)
    && RE.sha256.test(manifest.public_key ?? "")
    && RE.commitSha.test(manifest.commit_sha ?? "")
    && RE.nodeVersion.test(manifest.node_version ?? "")
    && RE.wranglerVersion.test(manifest.wrangler_version ?? "")
    && RE.sha256.test(manifest.migration_manifest_sha256 ?? "")
    && RE.sha256.test(manifest.migration_plan_digest ?? "")
    && RE.sha256.test(manifest.schema_contract_sha256 ?? "")
    && RE.schemaVersion.test(manifest.expected_schema_version ?? "")
  if (!shapeOk) return { ok: false, blocked: ["session_manifest_invalid"] }
  return { ok: true, session: deepFreezeEvidence({ sessionDir, manifest, contract: loaded.contract }) }
}

// ─── Authority derivation (never recorded, never trusted as a claim) ──

/**
 * Derive the authority digest AND the Control/Tenant physical-separation fact from a
 * REAL retained deploy-config authority (`{ bytes, sha256, snapshot }`). The digest
 * is recomputed from the exact bytes, the bindings are re-derived by PARSING those
 * bytes (the snapshot is not trusted), and only the digest + a boolean leave — no
 * database ID or name is returned or recorded.
 */
export function deriveAuthorityEvidence(authority) {
  if (!authority || typeof authority.bytes !== "string" || authority.bytes.length === 0) {
    return { ok: false, blocked: ["authority_invalid"] }
  }
  if (sha256Hex(authority.bytes) !== authority.sha256) return { ok: false, blocked: ["authority_digest_mismatch"] }
  let parsed
  try { parsed = JSON.parse(authority.bytes) } catch { return { ok: false, blocked: ["authority_invalid"] } }
  const bindings = Array.isArray(parsed?.d1_databases) ? parsed.d1_databases : []
  const control = bindings.filter((db) => db && db.binding === "CONTROL_DB")
  const tenant = bindings.filter((db) => db && db.binding === "TENANT_DB_DEFAULT")
  if (control.length !== 1 || tenant.length !== 1) return { ok: false, blocked: ["authority_bindings_invalid"] }
  const controlOk = validateD1Id(control[0].database_id).ok
  const tenantOk = validateD1Id(tenant[0].database_id).ok
  const distinct = controlOk && tenantOk
    && control[0].database_id !== tenant[0].database_id
    && control[0].database_name !== tenant[0].database_name
  if (!distinct) return { ok: false, blocked: ["authority_not_physically_distinct"] }
  return { ok: true, authoritySha256: authority.sha256, physicallyDistinct: true }
}

/**
 * Bind the session to ONE authority digest at the first authority-bearing command.
 * Exclusive creation makes it first-writer-wins and immutable; a later different
 * digest is refused. This never signs and never reads the private key.
 */
export function bindSessionAuthority(sessionDir, authoritySha256) {
  if (typeof authoritySha256 !== "string" || !RE.sha256.test(authoritySha256)) return { ok: false, blocked: ["authority_invalid"] }
  const bindingPath = resolvePath(sessionDir, SESSION_AUTHORITY_BASENAME)
  let bound
  try { bound = JSON.parse(readFileSync(bindingPath, "utf8")) } catch { bound = null }
  if (bound === null) {
    try {
      writeFileSync(bindingPath, `${JSON.stringify({ authority_sha256: authoritySha256 }, null, 2)}\n`, { mode: 0o600, flag: "wx" })
    } catch { return { ok: false, blocked: ["session_authority_unwritable"] } }
    return { ok: true, authoritySha256 }
  }
  if (bound.authority_sha256 !== authoritySha256) return { ok: false, blocked: ["authority_mismatch"] }
  return { ok: true, authoritySha256 }
}

// ─── Receipt storage + verification ───────────────────────────────

const receiptBasename = (sequence) => `receipt-${String(sequence).padStart(4, "0")}.json`

/**
 * Read and FULLY verify the session's existing receipts (digests recomputed,
 * signatures verified against the session public key, chain + session + commit +
 * producer + categories + temporal order checked). Returns them in order.
 */
export function readSessionReceipts(session) {
  const { sessionDir, manifest, contract } = session
  let names
  try {
    names = readdirSync(sessionDir).filter((name) => /^receipt-\d{4}\.json$/.test(name)).sort()
  } catch { return { ok: false, blocked: ["session_unreadable"] } }
  const receipts = []
  for (let i = 0; i < names.length; i++) {
    const path = resolvePath(sessionDir, names[i])
    let receipt
    try {
      const stats = lstatSync(path)
      if (stats.isSymbolicLink() || !stats.isFile()) return { ok: false, blocked: ["receipt_unreadable"] }
      receipt = JSON.parse(readFileSync(path, "utf8"))
    } catch { return { ok: false, blocked: ["receipt_unreadable"] } }
    const check = verifyReceiptRecord(receipt, {
      contract, expectedSequence: i + 1,
      expectedPrevious: i === 0 ? null : receipts[i - 1].receipt_sha256,
      sessionId: manifest.session_id, publicKey: manifest.public_key, commitSha: manifest.commit_sha,
      previousCompletedAt: i === 0 ? null : receipts[i - 1].completed_at,
    })
    if (!check.ok) return { ok: false, blocked: check.blocked }
    receipts.push(receipt)
  }
  return { ok: true, receipts }
}

/** Verify ONE receipt record against its session context. Category-only failures. */
export function verifyReceiptRecord(receipt, { contract, expectedSequence, expectedPrevious, sessionId, publicKey, commitSha, previousCompletedAt }) {
  const blocked = []
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) return { ok: false, blocked: ["receipt_invalid"] }
  const fields = contract.fields.operation
  const keys = Object.keys(receipt)
  if (keys.length !== fields.length || !fields.every((field) => keys.includes(field))) blocked.push("receipt_invalid")
  if (receipt.sequence !== expectedSequence) blocked.push("receipt_chain_invalid")
  if (!contract.operations.includes(receipt.operation)) blocked.push("receipt_invalid")
  if (!contract.statuses.includes(receipt.status)) blocked.push("receipt_invalid")
  if (!isStrictUtcIso(receipt.started_at) || !isStrictUtcIso(receipt.completed_at)) blocked.push("receipt_invalid")
  else {
    if (receipt.completed_at < receipt.started_at) blocked.push("temporal_order_invalid")
    if (previousCompletedAt && receipt.started_at < previousCompletedAt) blocked.push("temporal_order_invalid")
  }
  if (receipt.session_id !== sessionId) blocked.push("session_mismatch")
  if (receipt.repository_commit_sha !== commitSha) blocked.push("repository_mismatch")
  if (contract.producers_by_operation[receipt.operation] !== receipt.producer) blocked.push("producer_mismatch")
  if (typeof receipt.producer_source_sha256 !== "string" || !RE.sha256.test(receipt.producer_source_sha256)) blocked.push("receipt_invalid")
  if ((receipt.previous_receipt_sha256 ?? null) !== expectedPrevious) blocked.push("receipt_chain_invalid")
  if (typeof receipt.receipt_sha256 !== "string" || computeReceiptDigest(receipt) !== receipt.receipt_sha256) blocked.push("receipt_digest_mismatch")
  if (typeof receipt.receipt_signature !== "string" || !RE.signature.test(receipt.receipt_signature)) blocked.push("receipt_unsigned")
  else if (RE.sha256.test(receipt.receipt_sha256 ?? "") && !verifyReceiptSignature(publicKey, receipt.receipt_sha256, receipt.receipt_signature)) {
    blocked.push("receipt_signature_invalid")
  }
  const allowlist = contract.safe_categories_by_operation[receipt.operation] ?? []
  if (!Array.isArray(receipt.safe_categories) || !receipt.safe_categories.every((category) => allowlist.includes(category))) {
    blocked.push("category_not_allowlisted")
  }
  return { ok: blocked.length === 0, blocked: [...new Set(blocked)] }
}

// ─── Command-composed helpers: assemble (unsigned) + persist (verify) ──
//
// These two split the old `produceReceipt` so that NEITHER is a result-to-signed-
// receipt service:
//   - `assembleUnsignedReceipt` runs every append rule and produces an UNSIGNED
//     receipt (canonical assembly only). Its output cannot be used as evidence
//     until a holder of the session private key signs it — this module never does.
//   - `persistSignedReceipt` VERIFIES an already-signed receipt (recomputed digest,
//     signature against the session public key, chain, categories, sensitive scan)
//     and writes it exclusively. It refuses anything not already validly signed by
//     the session key, so it cannot mint evidence either.
// Deriving status/proof, reading the key, and signing are all COMMAND-LOCAL.

/**
 * Assemble an UNSIGNED receipt for `operation`, after enforcing every append rule
 * (authority binding present, no duplicate operation, no success after failure,
 * hard prerequisites, canonical success order, and temporal monotonicity relative
 * to the session's creation and the previous receipt). Returns `{ ok, receipt }`
 * with `receipt_sha256` computed and `receipt_signature: ""`, or `{ ok:false,
 * blocked }`. It signs nothing.
 */
export function assembleUnsignedReceipt(session, existingReceipts, input = {}) {
  const { manifest, contract } = session
  const {
    operation, producer, authoritySha256, producerSourceSha256,
    startedAt, completedAt, status, proof, safeCategories,
  } = input
  const receipts = Array.isArray(existingReceipts) ? existingReceipts : null
  if (receipts === null) return { ok: false, blocked: ["session_unreadable"] }

  if (!contract.operations.includes(operation)) return { ok: false, blocked: ["operation_unknown"] }
  if (contract.producers_by_operation[operation] !== producer) return { ok: false, blocked: ["producer_mismatch"] }
  if (typeof authoritySha256 !== "string" || !RE.sha256.test(authoritySha256)) return { ok: false, blocked: ["authority_invalid"] }
  if (typeof producerSourceSha256 !== "string" || !RE.sha256.test(producerSourceSha256)) return { ok: false, blocked: ["producer_source_unreadable"] }
  if (!isStrictUtcIso(startedAt) || !isStrictUtcIso(completedAt)) return { ok: false, blocked: ["execution_boundary_missing"] }
  if (!contract.statuses.includes(status)) return { ok: false, blocked: ["status_underivable"] }
  if (!proof || typeof proof !== "object" || Array.isArray(proof)) return { ok: false, blocked: ["proof_invalid"] }
  if (!Array.isArray(safeCategories)) return { ok: false, blocked: ["safe_categories_invalid"] }

  if (receipts.some((prior) => prior.operation === operation)) return { ok: false, blocked: ["operation_duplicate"] }
  if (receipts.some((prior) => prior.status === "failed") && status === "success") {
    return { ok: false, blocked: ["operation_after_failure"] }
  }
  if (status === "success") {
    for (const prerequisite of (contract.hard_prerequisites[operation] ?? [])) {
      if (!receipts.some((prior) => prior.operation === prerequisite && prior.status === "success")) {
        return { ok: false, blocked: ["operation_prerequisite_missing"] }
      }
    }
    const canonical = contract.required_successful_sequence
    const lastSuccessIndex = Math.max(-1, ...receipts.filter((prior) => prior.status === "success").map((prior) => canonical.indexOf(prior.operation)))
    if (canonical.indexOf(operation) <= lastSuccessIndex) return { ok: false, blocked: ["operation_order_invalid"] }
  }

  // Timestamps come from the execution boundary: a receipt can never start before
  // its session was initialized or before its predecessor completed, nor complete
  // before it started.
  const previous = receipts[receipts.length - 1] ?? null
  if (startedAt < manifest.created_at) return { ok: false, blocked: ["temporal_order_invalid"] }
  if (previous && startedAt < previous.completed_at) return { ok: false, blocked: ["temporal_order_invalid"] }
  if (completedAt < startedAt) return { ok: false, blocked: ["temporal_order_invalid"] }

  const categories = [...new Set(safeCategories)].sort()
  const inputDigest = sha256Hex(canonicalSerialize({
    authority_sha256: authoritySha256, operation, producer,
    repository_commit_sha: manifest.commit_sha, session_id: manifest.session_id,
  }))
  const resultDigest = sha256Hex(canonicalSerialize({
    authority_sha256: authoritySha256, operation, producer,
    producer_source_sha256: producerSourceSha256, proof,
    repository_commit_sha: manifest.commit_sha, safe_categories: categories,
    session_id: manifest.session_id, status,
  }))

  const receipt = {
    sequence: receipts.length + 1,
    operation, status,
    started_at: startedAt, completed_at: completedAt,
    authority_sha256: authoritySha256,
    session_id: manifest.session_id,
    repository_commit_sha: manifest.commit_sha,
    producer, producer_source_sha256: producerSourceSha256,
    input_digest: inputDigest, result_digest: resultDigest,
    proof, safe_categories: categories,
    previous_receipt_sha256: previous ? previous.receipt_sha256 : null,
    receipt_sha256: "", receipt_signature: "",
  }
  receipt.receipt_sha256 = computeReceiptDigest(receipt)
  return { ok: true, receipt }
}

/**
 * VERIFY an already command-signed receipt and persist it 0600/exclusive. The digest
 * is recomputed, the signature is verified against the SESSION public key, the whole
 * candidate is sensitive-scanned, and every field is re-checked against its session
 * context — so a receipt that is unsigned, foreign-key-signed, or tampered is refused
 * here even though this helper never signs anything.
 */
export function persistSignedReceipt(session, receipt) {
  const { sessionDir, manifest, contract } = session
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) return { ok: false, blocked: ["receipt_invalid"] }
  if (typeof receipt.receipt_signature !== "string" || !RE.signature.test(receipt.receipt_signature)) {
    return { ok: false, blocked: ["receipt_unsigned"] }
  }
  const existing = readSessionReceipts(session)
  if (!existing.ok) return { ok: false, blocked: existing.blocked }
  if (receipt.sequence !== existing.receipts.length + 1) return { ok: false, blocked: ["receipt_chain_invalid"] }

  const previous = existing.receipts[existing.receipts.length - 1] ?? null
  const scan = scanSensitiveEvidence(receipt, contract)
  if (scan.length > 0) return { ok: false, blocked: scan }
  const check = verifyReceiptRecord(receipt, {
    contract, expectedSequence: receipt.sequence,
    expectedPrevious: previous ? previous.receipt_sha256 : null,
    sessionId: manifest.session_id, publicKey: manifest.public_key, commitSha: manifest.commit_sha,
    previousCompletedAt: previous ? previous.completed_at : null,
  })
  if (!check.ok) return { ok: false, blocked: check.blocked }

  try {
    writeFileSync(resolvePath(sessionDir, receiptBasename(receipt.sequence)), `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600, flag: "wx" })
  } catch (error) {
    return { ok: false, blocked: [error && error.code === "EEXIST" ? "receipt_file_exists" : "receipt_unwritable"] }
  }
  return { ok: true, receipt: deepFreezeEvidence(receipt) }
}

/**
 * Open the shared, NON-signing context a command needs before it assembles its own
 * receipt: the validated session manifest, the derived authority digest (bound to
 * the session first-writer-wins), the verified existing receipts, and the emitting
 * command's own producer-source digest. It signs nothing, reads no private key, and
 * accepts no status/result — the command derives status/proof and signs itself.
 * Returns `{ ok, session, existingReceipts, authoritySha256, producerSourceSha256 }`.
 */
export function openCommandReceiptContext(sessionDir, { repoRoot, authority, producer } = {}) {
  const loaded = loadEvidenceSessionManifest(sessionDir, { repoRoot })
  if (!loaded.ok) return { ok: false, blocked: loaded.blocked }
  const { session } = loaded
  if (session.contract.producers_by_operation && producer && !session.contract.producers.includes(producer)) {
    return { ok: false, blocked: ["producer_mismatch"] }
  }
  const derivedAuthority = deriveAuthorityEvidence(authority)
  if (!derivedAuthority.ok) return { ok: false, blocked: derivedAuthority.blocked }
  const bound = bindSessionAuthority(sessionDir, derivedAuthority.authoritySha256)
  if (!bound.ok) return { ok: false, blocked: bound.blocked }
  const existing = readSessionReceipts(session)
  if (!existing.ok) return { ok: false, blocked: existing.blocked }
  const sourceRel = session.contract.producer_sources[producer]
  const producerSourceSha256 = sourceRel ? fileDigest(repoRoot, sourceRel) : null
  if (!producerSourceSha256) return { ok: false, blocked: ["producer_source_unreadable"] }
  return {
    ok: true, session, existingReceipts: existing.receipts,
    authoritySha256: derivedAuthority.authoritySha256, producerSourceSha256,
  }
}

// ─── Pack assembly (from verified receipts only) ──────────────────

/**
 * Assemble the final evidence pack from the session's VERIFIED receipts — never from
 * arbitrary operation objects. Every receipt is re-verified (digest, signature,
 * chain, session, commit, producer, categories, temporal order), the pack header
 * comes from the session manifest's DERIVED facts, and the authority facts come from
 * the session's first-command binding.
 */
export function assembleEvidencePackFromSession(sessionDir, { repoRoot, previousRecordSha256 = null } = {}) {
  const loadedSession = loadEvidenceSessionManifest(sessionDir, { repoRoot })
  if (!loadedSession.ok) return { ok: false, blocked: loadedSession.blocked }
  const { session } = loadedSession
  const { manifest } = session

  const read = readSessionReceipts(session)
  if (!read.ok) return { ok: false, blocked: read.blocked }
  if (read.receipts.length === 0) return { ok: false, blocked: ["session_has_no_receipts"] }

  let binding
  try { binding = JSON.parse(readFileSync(resolvePath(sessionDir, SESSION_AUTHORITY_BASENAME), "utf8")) } catch {
    return { ok: false, blocked: ["session_authority_missing"] }
  }
  if (!binding || !RE.sha256.test(binding.authority_sha256 ?? "")) return { ok: false, blocked: ["session_authority_missing"] }

  const created = createEvidenceSession({
    repoRoot,
    environmentClass: manifest.environment_class,
    commitSha: manifest.commit_sha,
    dirtyTree: false,
    nodeVersion: manifest.node_version,
    wranglerVersion: manifest.wrangler_version,
    authoritySha256: binding.authority_sha256,
    controlTenantPhysicallyDistinct: true,
    migrationManifestSha256: manifest.migration_manifest_sha256,
    migrationPlanDigest: manifest.migration_plan_digest,
    schemaContractSha256: manifest.schema_contract_sha256,
    expectedSchemaVersion: manifest.expected_schema_version,
    previousRecordSha256,
    sessionId: manifest.session_id,
    sessionPublicKey: manifest.public_key,
  })
  if (!created.ok) return { ok: false, blocked: created.blocked }

  for (const receipt of read.receipts) {
    const appended = recordEvidenceOperation(created.session, {
      operation: receipt.operation, status: receipt.status,
      startedAt: receipt.started_at, completedAt: receipt.completed_at,
      authoritySha256: receipt.authority_sha256, resultDigest: receipt.result_digest,
      safeCategories: [...receipt.safe_categories],
      producer: receipt.producer, producerSourceSha256: receipt.producer_source_sha256,
      inputDigest: receipt.input_digest, proof: { ...receipt.proof },
      previousReceiptSha256: receipt.previous_receipt_sha256,
      receiptSha256: receipt.receipt_sha256, receiptSignature: receipt.receipt_signature,
    })
    if (!appended.ok) return { ok: false, blocked: appended.blocked }
  }

  const finalized = finalizeEvidenceSession(created.session)
  if (!finalized.ok) return { ok: false, blocked: finalized.blocked }
  const written = writeEvidencePack(finalized.record, { repoRoot })
  if (!written.ok) return { ok: false, blocked: written.blocked }
  return { ok: true, path: written.path, record: finalized.record }
}
