/**
 * D1 Evidence Receipts — command-bound operation receipts for one initialized
 * evidence session (P0-OPS-016 repair, Issue #155).
 *
 * WHY RECEIPTS
 * ------------
 * Pack-level hashing alone is NOT execution provenance: at the previous head an
 * ordinary caller could fabricate a complete `evidence_valid` pack by feeding
 * invented exit codes and strings into a generic recorder API. The repaired
 * invariant:
 *
 *   A successful operational receipt can only be emitted from the actual
 *   repository command path after that command reached its existing execution
 *   result boundary.
 *
 * Each existing operator command calls its ONE matching emitter from inside its
 * real result path. There is deliberately NO emitter parameter for a status or an
 * exit code: every emitter derives status from the command's real result object,
 * cross-checks command-specific proof facts (many recomputed from the repository
 * itself), captures timestamps at the execution boundary, chains the receipt to
 * its predecessor, and signs it with the session's Ed25519 key.
 *
 * TRUST MODEL (state it honestly)
 * -------------------------------
 * Session signatures prove that receipts came through ONE initialized repository
 * evidence session. They are NOT a third-party Cloudflare attestation and do not
 * protect against a malicious machine owner who modifies repository source or
 * reads the session key. They DO stop an ordinary caller from manufacturing a
 * valid success pack out of arbitrary exit codes and strings.
 *
 * This library never authorizes anything: it never spawns a process, never runs
 * SQL, never touches the network, never reads process.env, and never reads or
 * sets an operator execution gate.
 */

import { generateKeyPairSync, randomBytes } from "node:crypto"
import { readFileSync, writeFileSync, mkdirSync, readdirSync, lstatSync } from "node:fs"
import { resolve as resolvePath } from "node:path"
import {
  loadEvidenceContract, scanSensitiveEvidence, canonicalSerialize, sha256Hex,
  isStrictUtcIso, deepFreezeEvidence, computeReceiptDigest, signReceiptDigest,
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

// ─── Derived repository facts (offline, no spawn) ─────────────────

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

// ─── Session initialization (offline) ─────────────────────────────

/**
 * Create one evidence session under the git-ignored evidence directory. The
 * caller (the init CLI) supplies the DERIVED repository facts — a dirty tree or
 * an unresolvable HEAD must already have failed closed there; this function
 * re-validates every value and refuses `dirtyTree !== false`.
 *
 * Produces: `<repo>/.d1-evidence/<session-id>/session.json` (0600, exclusive) and
 * the session's Ed25519 private key PEM (0600, exclusive). The private key never
 * leaves this directory and is never logged or embedded in any record.
 */
export function initializeEvidenceSessionAt({ repoRoot, environmentClass, derived } = {}) {
  if (!repoRoot) return { ok: false, blocked: ["repo_root_missing"] }
  const loaded = loadEvidenceContract(repoRoot)
  if (!loaded.ok) return { ok: false, blocked: loaded.blocked }
  const contract = loaded.contract
  const blocked = []
  const d = derived ?? {}
  if (!contract.environment_classes.includes(environmentClass)) blocked.push("environment_class_invalid")
  if (typeof d.commitSha !== "string" || !RE.commitSha.test(d.commitSha)) blocked.push("commit_sha_invalid")
  if (d.dirtyTree !== false) blocked.push("repository_dirty")
  if (typeof d.nodeVersion !== "string" || !RE.nodeVersion.test(d.nodeVersion)) blocked.push("node_version_invalid")
  if (typeof d.wranglerVersion !== "string" || !RE.wranglerVersion.test(d.wranglerVersion)) blocked.push("wrangler_version_invalid")

  // Contract digests are DERIVED from the repository right here — not accepted.
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
    commit_sha: d.commitSha,
    node_version: d.nodeVersion,
    wrangler_version: d.wranglerVersion,
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

/** Load + strictly validate a session directory (manifest and private key). */
export function loadEvidenceSession(sessionDir, { repoRoot } = {}) {
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
  let privateKeyPem
  try { privateKeyPem = readFileSync(resolvePath(sessionDir, SESSION_PRIVATE_KEY_BASENAME), "utf8") } catch {
    return { ok: false, blocked: ["session_key_unreadable"] }
  }
  return { ok: true, session: deepFreezeEvidence({ sessionDir, manifest, contract: loaded.contract }), privateKeyPem }
}

// ─── Authority derivation (never recorded, never trusted as a claim) ──

/**
 * Derive the authority digest AND the Control/Tenant physical-separation fact
 * from a REAL retained deploy-config authority (`{ bytes, sha256, snapshot }`
 * from the shared loader). The digest is recomputed from the exact bytes, the
 * bindings are re-derived by PARSING those bytes (the supplied snapshot is not
 * trusted), and only the digest + a boolean ever leave this function — no
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

// ─── Receipt storage ──────────────────────────────────────────────

const receiptBasename = (sequence) => `receipt-${String(sequence).padStart(4, "0")}.json`

/**
 * Read and FULLY verify the session's existing receipts (digests recomputed,
 * signatures verified against the session public key, chain + session + commit +
 * producer + proof + category allowlists checked). Returns them in order.
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

// ─── The command-bound producer core ──────────────────────────────

/** Capture the execution-boundary start instant (called by commands, pre-operation). */
export function beginEvidenceOperation(clock = () => new Date()) {
  return { startedAt: clock().toISOString() }
}

/**
 * Produce, sign, and persist ONE receipt. INTERNAL core shared by the seven
 * command-bound emitters below — it takes `derive`, a per-command closure that
 * turns the command's REAL result objects into `{ status, proof, safeCategories }`.
 * There is no status or exit-code parameter anywhere on this path.
 */
function produceReceipt(sessionDir, { repoRoot, producer, operation, authority, begun, clock = () => new Date(), derive }) {
  const loadedSession = loadEvidenceSession(sessionDir, { repoRoot })
  if (!loadedSession.ok) return { ok: false, blocked: loadedSession.blocked }
  const { session, privateKeyPem } = loadedSession
  const { manifest, contract } = session

  if (contract.producers_by_operation[operation] !== producer) return { ok: false, blocked: ["producer_mismatch"] }
  if (!begun || !isStrictUtcIso(begun.startedAt)) return { ok: false, blocked: ["execution_boundary_missing"] }

  // The authority digest AND the physical-separation fact are DERIVED from the
  // real retained authority — never accepted as a bare boolean or digest string.
  const derivedAuthority = deriveAuthorityEvidence(authority)
  if (!derivedAuthority.ok) return { ok: false, blocked: derivedAuthority.blocked }

  // Bind the session to ONE authority at the first authority-bearing command;
  // exclusive creation makes the binding first-writer-wins and immutable.
  const bindingPath = resolvePath(sessionDir, SESSION_AUTHORITY_BASENAME)
  let bound
  try { bound = JSON.parse(readFileSync(bindingPath, "utf8")) } catch { bound = null }
  if (bound === null) {
    try {
      writeFileSync(bindingPath, `${JSON.stringify({ authority_sha256: derivedAuthority.authoritySha256 }, null, 2)}\n`, { mode: 0o600, flag: "wx" })
    } catch { return { ok: false, blocked: ["session_authority_unwritable"] } }
  } else if (bound.authority_sha256 !== derivedAuthority.authoritySha256) {
    return { ok: false, blocked: ["authority_mismatch"] }
  }

  const existing = readSessionReceipts(session)
  if (!existing.ok) return { ok: false, blocked: existing.blocked }
  const receipts = existing.receipts
  if (receipts.some((prior) => prior.operation === operation)) return { ok: false, blocked: ["operation_duplicate"] }

  const outcome = derive(derivedAuthority)
  if (!outcome.ok) return { ok: false, blocked: outcome.blocked }
  const { status, proof, safeCategories } = outcome
  if (!contract.statuses.includes(status)) return { ok: false, blocked: ["status_underivable"] }
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

  // Timestamps come from the execution boundary: `begun` was captured immediately
  // before the operation began; completion is stamped HERE, when the result is
  // known. Historical caller-supplied instants have no path in: a receipt can
  // never start before its session was initialized or before its predecessor
  // completed, and can never complete before it started.
  const previous = receipts[receipts.length - 1] ?? null
  if (begun.startedAt < manifest.created_at) return { ok: false, blocked: ["temporal_order_invalid"] }
  if (previous && begun.startedAt < previous.completed_at) return { ok: false, blocked: ["temporal_order_invalid"] }
  const completedAt = clock().toISOString()
  if (completedAt < begun.startedAt) return { ok: false, blocked: ["temporal_order_invalid"] }

  // The producer source digest binds the receipt to the emitting command's bytes.
  const sourceRel = contract.producer_sources[producer]
  let producerSourceSha256
  try { producerSourceSha256 = sha256Hex(readFileSync(resolvePath(repoRoot, sourceRel))) } catch {
    return { ok: false, blocked: ["producer_source_unreadable"] }
  }

  const categories = [...new Set(safeCategories)].sort()
  const inputDigest = sha256Hex(canonicalSerialize({
    authority_sha256: derivedAuthority.authoritySha256, operation, producer,
    repository_commit_sha: manifest.commit_sha, session_id: manifest.session_id,
  }))
  const resultDigest = sha256Hex(canonicalSerialize({
    authority_sha256: derivedAuthority.authoritySha256, operation, producer,
    producer_source_sha256: producerSourceSha256, proof,
    repository_commit_sha: manifest.commit_sha, safe_categories: categories,
    session_id: manifest.session_id, status,
  }))

  const receipt = {
    sequence: receipts.length + 1,
    operation, status,
    started_at: begun.startedAt, completed_at: completedAt,
    authority_sha256: derivedAuthority.authoritySha256,
    session_id: manifest.session_id,
    repository_commit_sha: manifest.commit_sha,
    producer, producer_source_sha256: producerSourceSha256,
    input_digest: inputDigest, result_digest: resultDigest,
    proof, safe_categories: categories,
    previous_receipt_sha256: previous ? previous.receipt_sha256 : null,
    receipt_sha256: "", receipt_signature: "",
  }
  receipt.receipt_sha256 = computeReceiptDigest(receipt)
  receipt.receipt_signature = signReceiptDigest(privateKeyPem, receipt.receipt_sha256)

  const scan = scanSensitiveEvidence(receipt, contract)
  if (scan.length > 0) return { ok: false, blocked: scan }
  const check = verifyReceiptRecord(receipt, {
    contract, expectedSequence: receipt.sequence,
    expectedPrevious: receipt.previous_receipt_sha256,
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

// ─── The seven command-bound emitters ─────────────────────────────
// Each is called ONLY from its command's real result path (guarded by tests).
// None accepts a status, an exit code, or caller-supplied timestamps.

/** cf:d1:migrations:check — offline plan verification (`runCheck` result). */
export function emitMigrationPlanReceipt(sessionDir, { repoRoot, authority, begun, checkResult, clock } = {}) {
  return produceReceipt(sessionDir, {
    repoRoot, producer: "cf_d1_migration_plan", operation: "migration_plan_verified", authority, begun, clock,
    derive: () => {
      if (!checkResult || typeof checkResult.ok !== "boolean" || !Array.isArray(checkResult.failures)) {
        return { ok: false, blocked: ["result_shape_invalid"] }
      }
      // Proof facts are recomputed from the repository — not accepted from callers.
      const manifestSha256 = fileDigest(repoRoot, "migrations/manifest.json")
      const planDigest = deriveMigrationPlanDigest(repoRoot)
      if (!manifestSha256 || !planDigest) return { ok: false, blocked: ["proof_underivable"] }
      const succeeded = checkResult.ok === true && checkResult.failures.length === 0
      return {
        ok: true, status: succeeded ? "success" : "failed",
        proof: { manifest_sha256: manifestSha256, plan_digest: planDigest },
        safeCategories: succeeded ? ["manifest_valid", "plan_lanes_verified"] : ["plan_verification_failed"],
      }
    },
  })
}

/** cf:d1:migrations:apply — the gated remote apply (its real applied plan). */
export function emitMigrationApplyReceipt(sessionDir, { repoRoot, authority, begun, applyResult, clock } = {}) {
  return produceReceipt(sessionDir, {
    repoRoot, producer: "cf_d1_migration_apply", operation: "migration_apply_completed", authority, begun, clock,
    derive: () => {
      if (!applyResult || typeof applyResult.completed !== "boolean" || !Array.isArray(applyResult.appliedPlan)) {
        return { ok: false, blocked: ["result_shape_invalid"] }
      }
      const planDigest = deriveMigrationPlanDigest(repoRoot)
      if (!planDigest) return { ok: false, blocked: ["proof_underivable"] }
      const applied = applyResult.appliedPlan.map((step) => ({
        apply: step.apply, binding: step.binding, kind: step.kind, path: step.path, sequence: step.sequence, sha256: step.sha256,
      }))
      const appliedDigest = sha256Hex(canonicalSerialize(applied))
      // A SUCCESSFUL apply must have executed exactly the committed plan — the
      // emitter recomputes it from the repository and requires byte equality.
      if (applyResult.completed && appliedDigest !== planDigest) {
        return { ok: false, blocked: ["applied_plan_mismatch"] }
      }
      return {
        ok: true, status: applyResult.completed ? "success" : "failed",
        proof: {
          plan_digest: planDigest, applied_steps_sha256: appliedDigest,
          reconciliation: applyResult.completed ? "ledger_reconciled" : "not_applicable",
        },
        safeCategories: applyResult.completed
          ? ["control_lane_applied", "ledger_reconciled", "tenant_lane_applied"]
          : ["migration_apply_failed"],
      }
    },
  })
}

/** cf:d1:schema:verify:remote — its real `{ ok, failures, authorityDigest }`. */
export function emitRemoteSchemaVerificationReceipt(sessionDir, { repoRoot, authority, begun, verificationResult, clock } = {}) {
  return produceReceipt(sessionDir, {
    repoRoot, producer: "cf_d1_schema_verify_remote", operation: "remote_schema_verified", authority, begun, clock,
    derive: (derivedAuthority) => {
      const result = verificationResult
      if (!result || typeof result.ok !== "boolean" || !Array.isArray(result.failures) || typeof result.authorityDigest !== "string") {
        return { ok: false, blocked: ["result_shape_invalid"] }
      }
      // The verification must have run against THIS session's authority — the
      // real verifier reports the digest it used; a mismatch is not evidence.
      if (result.authorityDigest !== derivedAuthority.authoritySha256) {
        return { ok: false, blocked: ["authority_mismatch"] }
      }
      const schemaContractSha256 = fileDigest(repoRoot, "migrations/schema-contract.json")
      if (!schemaContractSha256) return { ok: false, blocked: ["proof_underivable"] }
      const summary = sha256Hex(canonicalSerialize({
        control_db_schema_ok: result.ok, failure_count: result.failures.length, tenant_db_schema_ok: result.ok,
      }))
      return {
        ok: true, status: result.ok ? "success" : "failed",
        proof: { schema_contract_sha256: schemaContractSha256, verification_summary_sha256: summary },
        safeCategories: result.ok ? ["control_db_schema_ok", "tenant_db_schema_ok"] : ["schema_verification_failed"],
      }
    },
  })
}

/** cf:d1:bootstrap:apply — the atomic batch outcome + the canonical artifact digest. */
export function emitBootstrapApplyReceipt(sessionDir, { repoRoot, authority, begun, bootstrapResult, clock } = {}) {
  return produceReceipt(sessionDir, {
    repoRoot, producer: "cf_d1_bootstrap_apply", operation: "bootstrap_apply_completed", authority, begun, clock,
    derive: () => {
      if (!bootstrapResult || typeof bootstrapResult.committed !== "boolean"
        || typeof bootstrapResult.canonicalSqlSha256 !== "string" || !RE.sha256.test(bootstrapResult.canonicalSqlSha256)) {
        return { ok: false, blocked: ["result_shape_invalid"] }
      }
      return {
        ok: true, status: bootstrapResult.committed ? "success" : "failed",
        proof: {
          bootstrap_artifact_sha256: bootstrapResult.canonicalSqlSha256,
          apply_result: bootstrapResult.committed ? "bootstrap_batch_committed" : "bootstrap_apply_failed",
        },
        safeCategories: bootstrapResult.committed ? ["bootstrap_batch_committed"] : ["bootstrap_apply_failed"],
      }
    },
  })
}

/** Post-bootstrap COUNT verification — its real `{ ok, failures }`. */
export function emitBootstrapCountsReceipt(sessionDir, { repoRoot, authority, begun, countsResult, clock } = {}) {
  return produceReceipt(sessionDir, {
    repoRoot, producer: "cf_d1_bootstrap_counts", operation: "bootstrap_counts_verified", authority, begun, clock,
    derive: () => {
      if (!countsResult || typeof countsResult.ok !== "boolean" || !Array.isArray(countsResult.failures)) {
        return { ok: false, blocked: ["result_shape_invalid"] }
      }
      const succeeded = countsResult.ok === true && countsResult.failures.length === 0
      // Allowlisted BOOLEAN assertions only — never a raw row value.
      const assertions = sha256Hex(canonicalSerialize({
        failure_count: countsResult.failures.length,
        identity_row_verified: succeeded, membership_row_verified: succeeded,
        registry_row_verified: succeeded, tenant_row_verified: succeeded, user_row_verified: succeeded,
      }))
      return {
        ok: true, status: succeeded ? "success" : "failed",
        proof: { assertions_sha256: assertions },
        safeCategories: succeeded
          ? ["identity_row_verified", "membership_row_verified", "registry_row_verified", "tenant_row_verified", "user_row_verified"]
          : ["counts_verification_failed"],
      }
    },
  })
}

/** cf:deploy:preflight — artifact-checked preflight over the validated config. */
export function emitWorkerPreflightReceipt(sessionDir, { repoRoot, authority, begun, preflightResult, clock } = {}) {
  return produceReceipt(sessionDir, {
    repoRoot, producer: "cf_worker_preflight", operation: "worker_preflight_completed", authority, begun, clock,
    derive: () => {
      const result = preflightResult
      if (!result || typeof result.ok !== "boolean" || !Array.isArray(result.failures) || typeof result.checkedArtifacts !== "boolean") {
        return { ok: false, blocked: ["result_shape_invalid"] }
      }
      const succeeded = result.ok === true && result.failures.length === 0
      // A successful preflight receipt requires the REAL Worker artifact digest.
      const workerDigest = fileDigest(repoRoot, ".open-next/worker.js")
      if (succeeded && (!result.checkedArtifacts || !workerDigest)) return { ok: false, blocked: ["worker_artifact_missing"] }
      const preflightContract = fileDigest(repoRoot, "wrangler.json")
      if (!preflightContract) return { ok: false, blocked: ["proof_underivable"] }
      return {
        ok: true, status: succeeded ? "success" : "failed",
        proof: {
          worker_artifact_sha256: workerDigest ?? sha256Hex("worker_artifact_absent"),
          preflight_contract_sha256: preflightContract,
        },
        safeCategories: succeeded ? ["artifacts_verified", "preflight_ok"] : ["preflight_failed"],
      }
    },
  })
}

/** cf:deploy — the gated Worker deploy outcome, bound to the real artifact bytes. */
export function emitWorkerDeployReceipt(sessionDir, { repoRoot, authority, begun, deployResult, clock } = {}) {
  return produceReceipt(sessionDir, {
    repoRoot, producer: "cf_worker_deploy", operation: "worker_deploy_completed", authority, begun, clock,
    derive: () => {
      if (!deployResult || typeof deployResult.deployed !== "boolean") {
        return { ok: false, blocked: ["result_shape_invalid"] }
      }
      const workerDigest = fileDigest(repoRoot, ".open-next/worker.js")
      // A successful deploy receipt requires the real built Worker artifact.
      if (deployResult.deployed && !workerDigest) return { ok: false, blocked: ["worker_artifact_missing"] }
      return {
        ok: true, status: deployResult.deployed ? "success" : "failed",
        proof: {
          worker_artifact_sha256: workerDigest ?? sha256Hex("worker_artifact_absent"),
          deploy_result: deployResult.deployed ? "worker_deployed" : "worker_deploy_failed",
        },
        safeCategories: deployResult.deployed ? ["worker_deployed"] : ["worker_deploy_failed"],
      }
    },
  })
}

// ─── Pack assembly (from verified receipts only) ──────────────────

/**
 * Assemble the final evidence pack from the session's VERIFIED receipts — never
 * from arbitrary operation objects. Every receipt is re-verified (digest,
 * signature, chain, session, commit, producer, categories, temporal order), the
 * pack header comes from the session manifest's DERIVED facts, and the authority
 * facts come from the session's first-command binding.
 */
export function assembleEvidencePackFromSession(sessionDir, { repoRoot, previousRecordSha256 = null } = {}) {
  const loadedSession = loadEvidenceSession(sessionDir, { repoRoot })
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
