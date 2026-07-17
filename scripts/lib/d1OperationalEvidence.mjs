/**
 * D1 Operational Evidence — contract validation, recorder, and safety scanner
 * (P0-OPS-016, Issue #155)
 *
 * WHY THIS EXISTS
 * ---------------
 * Issue #155 can only close on evidence that one explicitly AUTHORIZED remote
 * environment completed the full sequence (validated config authority → migration
 * plan → remote migration apply → remote schema verification → bootstrap apply →
 * bootstrap COUNT verification → Worker preflight → Worker deploy). That evidence
 * must be reviewable without exposing anything sensitive, and verifiable offline
 * from a second clean checkout. This library defines the ONLY way such evidence is
 * assembled.
 *
 * THE RECORDER IS OBSERVATIONAL ONLY
 * ----------------------------------
 * Nothing here authorizes, gates, spawns, queries, or deploys. It never invokes
 * Wrangler, never runs SQL, never reads operator environment gates, and never sets
 * one. The existing operator commands keep their own independent execute flags and
 * confirmation phrases; the recorder merely accepts their SAFE result categories
 * and digests after the operator ran them.
 *
 * WHAT EVIDENCE MAY CONTAIN
 * -------------------------
 * Safe categories and digests only. The contract allowlists every field, and a
 * recursive sensitive-key/sensitive-value scanner REJECTS — before serialization,
 * never by post-hoc redaction — anything resembling a database UUID, database
 * name key, token, authorization header, cookie, email address, provider subject,
 * tenant/user/membership/identity key, raw environment assignment, raw deploy
 * config, raw SQL, application-row content, filesystem path, or raw stdout/stderr.
 *
 * SAFETY:
 *   - dependency-free (node: builtins only);
 *   - deterministic canonical serialization; SHA-256 over canonical bytes;
 *   - append-only operation ordering with hard prerequisites;
 *   - finalized records are recursively frozen;
 *   - evidence files are written 0600, exclusively (`wx`), with a
 *     collision-resistant, secret-free name, into the git-ignored `.d1-evidence/`.
 */

import { createHash, randomBytes, createPublicKey, verify as edVerify } from "node:crypto"
import { readFileSync, writeFileSync, mkdirSync, lstatSync } from "node:fs"
import { resolve as resolvePath } from "node:path"

/** Repository-relative path of the versioned evidence contract. */
export const EVIDENCE_CONTRACT_RELPATH = "contracts/operations/d1-operational-evidence.v1.json"
/** The ONLY directory evidence packs are written to (git-ignored). */
export const EVIDENCE_DIRNAME = ".d1-evidence"

// ─── Evidence-root permission enforcement (shared; P0-FIX-018) ────
//
// The evidence directory holds session private keys, so it must be a plain, private
// directory. `mkdirSync(path, { recursive: true, mode: 0o700 })` does NOT correct an
// existing directory: a pre-placed `.d1-evidence` at 0755 (or a symlink) was silently
// accepted. This ONE validator — used by BOTH session initialization and final pack
// writing — resolves exactly `<repo>/.d1-evidence`, creates ONLY that directory at
// 0700 when absent (never recursively), and otherwise requires an existing plain,
// non-symlink directory with NO group or other permission bits. It never chmods and
// never prints an absolute path.

/**
 * True when `mode`'s low 12 bits carry any group or other permission bit — the
 * evidence root and session directories must be private to the owner (`0o077 == 0`).
 */
export function hasGroupOrOtherPermissionBits(mode) {
  return (mode & 0o077) !== 0
}

/**
 * Ensure `<repoRoot>/.d1-evidence` is a SAFE evidence root and return its path.
 *
 * Creates it at 0700 (non-recursively) only when absent; otherwise `lstat`s it and
 * rejects a symlink, a non-directory, or any group/other permission bit. After a
 * create, the effective mode is re-checked (umask paranoia). Category-only output:
 * the single safe failure `evidence_directory_permissions_invalid`. Never chmods.
 *
 * Manual remediation for an unsafe root: `chmod 700 .d1-evidence`.
 */
export function ensureEvidenceRootSecure(repoRoot) {
  if (!repoRoot) return { ok: false, blocked: ["repo_root_missing"] }
  const root = resolvePath(repoRoot, EVIDENCE_DIRNAME)
  let stats = null
  try { stats = lstatSync(root) } catch { stats = null }
  if (stats === null) {
    // Absent: create ONLY this directory, never recursively (a recursive create would
    // silently accept an unsafe pre-existing target higher up).
    try { mkdirSync(root, { mode: 0o700 }) } catch { return { ok: false, blocked: ["evidence_directory_permissions_invalid"] } }
    let created
    try { created = lstatSync(root) } catch { return { ok: false, blocked: ["evidence_directory_permissions_invalid"] } }
    if (created.isSymbolicLink() || !created.isDirectory() || hasGroupOrOtherPermissionBits(created.mode)) {
      return { ok: false, blocked: ["evidence_directory_permissions_invalid"] }
    }
    return { ok: true, root }
  }
  // Existing: it must be a plain, private directory — never a symlink, never a file,
  // never group/other accessible. An unsafe existing root is NOT silently accepted.
  if (stats.isSymbolicLink() || !stats.isDirectory() || hasGroupOrOtherPermissionBits(stats.mode)) {
    return { ok: false, blocked: ["evidence_directory_permissions_invalid"] }
  }
  return { ok: true, root }
}

/**
 * Create a fresh private session directory `<root>/<sessionId>` at 0700, then re-check
 * that its effective mode has no group/other bits. Non-recursive: the root must
 * already be validated. Category-only output.
 */
export function createSecureSessionDir(root, sessionId) {
  const sessionDir = resolvePath(root, sessionId)
  try { mkdirSync(sessionDir, { mode: 0o700 }) } catch { return { ok: false, blocked: ["session_directory_unwritable"] } }
  let stats
  try { stats = lstatSync(sessionDir) } catch { return { ok: false, blocked: ["session_directory_unwritable"] } }
  if (stats.isSymbolicLink() || !stats.isDirectory() || hasGroupOrOtherPermissionBits(stats.mode)) {
    return { ok: false, blocked: ["evidence_directory_permissions_invalid"] }
  }
  return { ok: true, sessionDir }
}

/** SHA-256 hex over exact bytes. */
export function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex")
}

/** Recursively freeze (freeze-first, so Object.isFrozen is the cycle guard). */
export function deepFreezeEvidence(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const key of Object.getOwnPropertyNames(value)) deepFreezeEvidence(value[key])
  return value
}

// ─── Session signature VERIFICATION (Ed25519) ─────────────────────
//
// Receipts are signed with a session-scoped Ed25519 key by the emitting command
// itself (command-local: the command reads the 0600 private-key PEM and signs
// inline). This module deliberately exposes NO signing function — a generic
// `signReceiptDigest(...)` that turned any digest into a signature was part of the
// forgeable surface and is gone. Only VERIFICATION lives here.
//
// A verified signature proves a receipt came through one initialized repository
// evidence session; it is NOT a third-party Cloudflare attestation, does not attest
// which call site invoked the signing code, and does not protect against a machine
// owner who reads the private key or edits source. The public key travels as the raw
// 32-byte key in lowercase hex; the private key exists only as a 0600 PEM inside the
// git-ignored session directory and never enters a record or a log.

/** KeyObject for a raw 32-byte Ed25519 public key given as 64-hex. */
function publicKeyFromHex(publicKeyHex) {
  return createPublicKey({
    format: "jwk",
    key: { kty: "OKP", crv: "Ed25519", x: Buffer.from(publicKeyHex, "hex").toString("base64url") },
  })
}

/** Verify a receipt signature against the session public key (64-hex raw key). */
export function verifyReceiptSignature(publicKeyHex, receiptSha256, signatureHex) {
  if (typeof publicKeyHex !== "string" || !/^[0-9a-f]{64}$/.test(publicKeyHex)) return false
  if (typeof receiptSha256 !== "string" || typeof signatureHex !== "string" || !/^[0-9a-f]{128}$/.test(signatureHex)) return false
  try {
    return edVerify(null, Buffer.from(receiptSha256, "utf8"), publicKeyFromHex(publicKeyHex), Buffer.from(signatureHex, "hex"))
  } catch {
    return false
  }
}

// ─── Strict formats ───────────────────────────────────────────────

const RE = Object.freeze({
  evidenceId: /^evd-[0-9a-f]{32}$/,
  sessionId: /^evs-[0-9a-f]{32}$/,
  sha256: /^[0-9a-f]{64}$/,
  /** Ed25519 signature (64 bytes) as lowercase hex. */
  signature: /^[0-9a-f]{128}$/,
  commitSha: /^[0-9a-f]{40}$/,
  isoUtc: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
  nodeVersion: /^v\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  wranglerVersion: /^\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  schemaVersion: /^\d{1,4}$/,
  safeCategory: /^[a-z][a-z0-9_]{0,47}$/,
  producer: /^cf_[a-z0-9_]{1,40}$/,
})

/** Shared strict formats, exported for the receipts layer and the verifier. */
export const EVIDENCE_FORMATS = RE

/** Strict UTC ISO-8601 with milliseconds — regex AND round-trip (rejects month 13). */
export function isStrictUtcIso(value) {
  if (typeof value !== "string" || !RE.isoUtc.test(value)) return false
  const parsed = new Date(value)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value
}

// ─── Contract ─────────────────────────────────────────────────────

/**
 * Load and minimally self-validate the versioned evidence contract. Returns safe
 * categories on failure; the frozen contract on success.
 */
export function loadEvidenceContract(repoRoot) {
  if (!repoRoot) return { ok: false, blocked: ["evidence_contract_unreadable"] }
  let raw
  try { raw = readFileSync(resolvePath(repoRoot, EVIDENCE_CONTRACT_RELPATH), "utf8") } catch {
    return { ok: false, blocked: ["evidence_contract_unreadable"] }
  }
  let parsed
  try { parsed = JSON.parse(raw) } catch { return { ok: false, blocked: ["evidence_contract_unparseable"] } }
  const shapeOk = parsed && typeof parsed === "object" && !Array.isArray(parsed)
    && parsed.contract === "d1-operational-evidence"
    && parsed.contract_version === "1"
    && Array.isArray(parsed.environment_classes) && parsed.environment_classes.length >= 1
    && Array.isArray(parsed.statuses) && parsed.statuses.length === 2
    && Array.isArray(parsed.operations) && parsed.operations.length >= 7
    && Array.isArray(parsed.required_successful_sequence) && parsed.required_successful_sequence.length >= 7
    && parsed.hard_prerequisites && typeof parsed.hard_prerequisites === "object"
    && Array.isArray(parsed.producers) && parsed.producers.length >= 7
    && parsed.producers_by_operation && typeof parsed.producers_by_operation === "object"
    && parsed.operations.every((op) => typeof parsed.producers_by_operation[op] === "string")
    && parsed.producer_sources && typeof parsed.producer_sources === "object"
    && parsed.producers.every((producer) => typeof parsed.producer_sources[producer] === "string")
    && parsed.safe_categories_by_operation && typeof parsed.safe_categories_by_operation === "object"
    && parsed.operations.every((op) => Array.isArray(parsed.safe_categories_by_operation[op]) && parsed.safe_categories_by_operation[op].length >= 1)
    && parsed.proof_fields_by_operation && typeof parsed.proof_fields_by_operation === "object"
    && parsed.operations.every((op) => Array.isArray(parsed.proof_fields_by_operation[op]) && parsed.proof_fields_by_operation[op].length >= 1)
    && parsed.proof_category_values && typeof parsed.proof_category_values === "object"
    && parsed.fields && typeof parsed.fields === "object"
    && ["top", "session", "repository", "toolchain", "authority", "contracts", "operation", "chain"].every((k) => Array.isArray(parsed.fields[k]))
    && parsed.limits && typeof parsed.limits === "object"
    && ["max_file_bytes", "max_operations", "max_safe_categories_per_operation", "max_safe_category_length", "max_string_length"].every((k) => Number.isInteger(parsed.limits[k]) && parsed.limits[k] > 0)
  if (!shapeOk) return { ok: false, blocked: ["evidence_contract_invalid"] }
  return { ok: true, contract: deepFreezeEvidence(parsed) }
}

/** Every key the contract allows anywhere in a record (field groups + proof fields). */
export function allowedEvidenceKeys(contract) {
  const keys = new Set()
  for (const group of Object.values(contract.fields)) for (const key of group) keys.add(key)
  for (const group of Object.values(contract.proof_fields_by_operation ?? {})) for (const key of group) keys.add(key)
  return keys
}

// ─── Sensitive-data scanner ───────────────────────────────────────
//
// Defence in depth UNDER the allowlist: even a value that fits a field's shape is
// rejected if it resembles sensitive material. Evidence must be refused BEFORE
// serialization — never redacted after the fact.

const SENSITIVE_KEY_TOKENS = new Set([
  "token", "secret", "password", "authorization", "auth", "cookie", "email",
  "database", "tenant", "user", "membership", "identity", "subject", "stdout",
  "stderr", "sql", "env", "path", "config", "header", "bearer", "credential",
  "apikey", "uuid",
])

/** Split a key into comparable lowercase tokens (snake_case + camelCase). */
function tokenizeKey(key) {
  return String(key)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

const SENSITIVE_VALUE_PATTERNS = [
  ["uuid", /[0-9a-f]{8}[-_][0-9a-f]{4}[-_][0-9a-f]{4}[-_][0-9a-f]{4}[-_][0-9a-f]{12}/i],
  ["hex_blob", /[0-9a-f]{32,}/i],
  ["email", /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i],
  ["jwt", /\beyJ[A-Za-z0-9_-]{6,}\./],
  ["bearer", /\bbearer\s+\S{6,}/i],
  ["token", /(gh[pousr]_[A-Za-z0-9]{16,}|sk-[A-Za-z0-9_-]{16,}|xox[baprs]-[A-Za-z0-9-]{6,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/],
  ["authorization_header", /\bauthorization\s*[:=]/i],
  ["cookie", /\b(set-)?cookie\s*[:=]/i],
  ["env_assignment", /\b[A-Z][A-Z0-9_]{2,}=\S/],
  ["sql", /\b(insert\s+into|select\s[\s\S]{0,120}?\bfrom\b|drop\s+table|delete\s+from|update\s+\S+\s+set|create\s+table|alter\s+table|pragma\s+\w)/i],
  ["provider_subject", /[a-z0-9_-]{2,}\|[^\s|]/i],
  ["filesystem_path", /(?:^|[\s"'`=(:])(?:\/[\w.-]+){2,}|[A-Za-z]:\\\\?[\w.-]/],
  ["raw_output", /[\r\n\t\x00-\x08\x0b\x0c\x0e-\x1f]/],
  ["structured_blob", /[{}[\]]/],
]

/**
 * Digest-shaped full-string values are the ONLY exemption from the embedded-hex
 * rule: a 40/64-hex string IS a commit/digest by contract, a 128-hex string is an
 * Ed25519 receipt signature, and the evidence/session ids are `evd-`/`evs-` + 32
 * hex. Everything else with ≥32 contiguous hex chars is treated as a smuggled
 * identifier.
 */
function isDigestShaped(value) {
  return RE.sha256.test(value) || RE.commitSha.test(value) || RE.signature.test(value)
    || RE.evidenceId.test(value) || RE.sessionId.test(value)
}

function scanStringValue(value, limits, found) {
  if (value.length > limits.max_string_length) { found.add("sensitive_value_oversized"); return }
  const digestShaped = isDigestShaped(value)
  for (const [name, pattern] of SENSITIVE_VALUE_PATTERNS) {
    if (name === "hex_blob" && digestShaped) continue
    if (pattern.test(value)) found.add(`sensitive_value_${name}`)
  }
}

/**
 * Recursively scan keys and string values. Returns safe categories only — never
 * the offending value. `contract` supplies the key allowlist (allowlisted keys
 * such as `control_tenant_physically_distinct` are exempt from KEY-token checks;
 * their VALUES are always scanned).
 */
export function scanSensitiveEvidence(value, contract) {
  const allowed = allowedEvidenceKeys(contract)
  const limits = contract.limits
  const found = new Set()
  const visit = (node) => {
    if (node === null) return
    const kind = typeof node
    if (kind === "string") return scanStringValue(node, limits, found)
    if (kind === "number" || kind === "boolean") return
    if (kind !== "object") { found.add("sensitive_unsupported_type"); return }
    if (Array.isArray(node)) { for (const item of node) visit(item); return }
    for (const key of Object.keys(node)) {
      if (!allowed.has(key)) {
        for (const token of tokenizeKey(key)) {
          if (SENSITIVE_KEY_TOKENS.has(token)) found.add(`sensitive_key_${token}`)
        }
      }
      visit(node[key])
    }
  }
  visit(value)
  return [...found]
}

// ─── Canonical serialization + digest ─────────────────────────────

/**
 * Deterministic canonical JSON: object keys sorted recursively, arrays in order,
 * no insignificant whitespace. The digest is over these exact bytes, so the file's
 * on-disk formatting never matters.
 */
export function canonicalSerialize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((item) => canonicalSerialize(item)).join(",")}]`
  const keys = Object.keys(value).sort()
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalSerialize(value[key])}`).join(",")}}`
}

/** The evidence digest: canonical bytes of the record WITHOUT chain.evidence_sha256. */
export function computeEvidenceDigest(record) {
  const chain = record && typeof record === "object" ? record.chain ?? {} : {}
  const forDigest = { ...record, chain: { previous_record_sha256: chain.previous_record_sha256 ?? null } }
  return sha256Hex(canonicalSerialize(forDigest))
}

// ─── Record validation (shared by recorder and verifier) ──────────

function exactKeys(node, allowed, where, failures) {
  if (!node || typeof node !== "object" || Array.isArray(node)) { failures.push(`${where}_invalid`); return false }
  const keys = Object.keys(node)
  for (const key of keys) if (!allowed.includes(key)) failures.push(`${where}_unknown_field`)
  for (const key of allowed) if (!keys.includes(key)) failures.push(`${where}_missing_field`)
  return true
}

/**
 * Strict structural validation of a full evidence record against the contract:
 * exact allowlisted fields at every level (unknown OR missing fields fail), strict
 * formats for every value. Ordering rules live in `validateOperationOrdering`.
 */
export function validateEvidenceRecord(record, contract) {
  const failures = []
  const f = contract.fields
  if (!exactKeys(record, f.top, "record", failures)) return { ok: false, failures: [...new Set(failures)] }

  if (record.evidence_version !== contract.contract_version) failures.push("evidence_version_invalid")
  if (typeof record.evidence_id !== "string" || !RE.evidenceId.test(record.evidence_id)) failures.push("evidence_id_invalid")
  if (!contract.environment_classes.includes(record.environment_class)) failures.push("environment_class_invalid")
  if (!isStrictUtcIso(record.created_at)) failures.push("created_at_invalid")

  if (exactKeys(record.session, f.session, "session", failures)) {
    if (typeof record.session.session_id !== "string" || !RE.sessionId.test(record.session.session_id)) failures.push("session_id_invalid")
    if (typeof record.session.public_key !== "string" || !RE.sha256.test(record.session.public_key)) failures.push("session_public_key_invalid")
  }

  if (exactKeys(record.repository, f.repository, "repository", failures)) {
    if (typeof record.repository.commit_sha !== "string" || !RE.commitSha.test(record.repository.commit_sha)) failures.push("commit_sha_invalid")
    if (record.repository.dirty_tree !== false) failures.push("dirty_tree_invalid")
  }
  if (exactKeys(record.toolchain, f.toolchain, "toolchain", failures)) {
    if (typeof record.toolchain.node_version !== "string" || !RE.nodeVersion.test(record.toolchain.node_version)) failures.push("node_version_invalid")
    if (typeof record.toolchain.wrangler_version !== "string" || !RE.wranglerVersion.test(record.toolchain.wrangler_version)) failures.push("wrangler_version_invalid")
  }
  if (exactKeys(record.authority, f.authority, "authority", failures)) {
    if (typeof record.authority.sha256 !== "string" || !RE.sha256.test(record.authority.sha256)) failures.push("authority_sha256_invalid")
    if (record.authority.control_tenant_physically_distinct !== true) failures.push("authority_not_physically_distinct")
  }
  if (exactKeys(record.contracts, f.contracts, "contracts", failures)) {
    for (const key of ["migration_manifest_sha256", "migration_plan_digest", "schema_contract_sha256"]) {
      if (typeof record.contracts[key] !== "string" || !RE.sha256.test(record.contracts[key])) failures.push(`${key}_invalid`)
    }
    if (typeof record.contracts.expected_schema_version !== "string" || !RE.schemaVersion.test(record.contracts.expected_schema_version)) failures.push("expected_schema_version_invalid")
  }

  if (!Array.isArray(record.operations) || record.operations.length > contract.limits.max_operations) {
    failures.push("operations_invalid")
  } else {
    for (const op of record.operations) {
      if (!exactKeys(op, f.operation, "operation", failures)) continue
      if (!Number.isInteger(op.sequence) || op.sequence < 1) failures.push("operation_sequence_invalid")
      if (!contract.operations.includes(op.operation)) failures.push("operation_unknown")
      if (!contract.statuses.includes(op.status)) failures.push("operation_status_invalid")
      if (!isStrictUtcIso(op.started_at)) failures.push("operation_started_at_invalid")
      if (!isStrictUtcIso(op.completed_at)) failures.push("operation_completed_at_invalid")
      if (isStrictUtcIso(op.started_at) && isStrictUtcIso(op.completed_at) && op.completed_at < op.started_at) failures.push("operation_completed_before_started")
      if (typeof op.authority_sha256 !== "string" || !RE.sha256.test(op.authority_sha256)) failures.push("operation_authority_sha256_invalid")
      if (typeof op.session_id !== "string" || !RE.sessionId.test(op.session_id)) failures.push("operation_session_id_invalid")
      if (typeof op.repository_commit_sha !== "string" || !RE.commitSha.test(op.repository_commit_sha)) failures.push("operation_commit_sha_invalid")
      if (typeof op.producer !== "string" || !RE.producer.test(op.producer) || !contract.producers.includes(op.producer)) failures.push("operation_producer_invalid")
      if (typeof op.producer_source_sha256 !== "string" || !RE.sha256.test(op.producer_source_sha256)) failures.push("operation_producer_source_invalid")
      if (typeof op.input_digest !== "string" || !RE.sha256.test(op.input_digest)) failures.push("operation_input_digest_invalid")
      if (typeof op.result_digest !== "string" || !RE.sha256.test(op.result_digest)) failures.push("operation_result_digest_invalid")
      const previous = op.previous_receipt_sha256
      if (previous !== null && (typeof previous !== "string" || !RE.sha256.test(previous))) failures.push("operation_previous_receipt_invalid")
      if (typeof op.receipt_sha256 !== "string" || !RE.sha256.test(op.receipt_sha256)) failures.push("operation_receipt_sha256_invalid")
      if (typeof op.receipt_signature !== "string") failures.push("operation_receipt_signature_invalid")

      // Operation-specific proof facts: EXACT per-operation field allowlist; every
      // value is a 64-hex digest or a per-field allowlisted category — nothing else.
      const proofFields = contract.proof_fields_by_operation[op.operation] ?? []
      if (contract.operations.includes(op.operation) && exactKeys(op.proof, proofFields, "proof", failures)) {
        for (const field of proofFields) {
          const value = op.proof[field]
          const categoryValues = contract.proof_category_values[field]
          if (categoryValues) {
            if (!categoryValues.includes(value)) failures.push("proof_category_invalid")
          } else if (typeof value !== "string" || !RE.sha256.test(value)) {
            failures.push("proof_digest_invalid")
          }
        }
      }

      if (!Array.isArray(op.safe_categories) || op.safe_categories.length > contract.limits.max_safe_categories_per_operation) {
        failures.push("operation_safe_categories_invalid")
      } else {
        for (const category of op.safe_categories) {
          if (typeof category !== "string" || !RE.safeCategory.test(category) || category.length > contract.limits.max_safe_category_length) {
            failures.push("operation_safe_categories_invalid")
            break
          }
        }
        // Canonically sorted, deduplicated — the digestable form.
        const canonicalCategories = [...new Set(op.safe_categories)].sort()
        if (JSON.stringify(canonicalCategories) !== JSON.stringify(op.safe_categories)) failures.push("operation_safe_categories_unsorted")
      }
    }
  }

  if (exactKeys(record.chain, f.chain, "chain", failures)) {
    const previous = record.chain.previous_record_sha256
    if (previous !== null && (typeof previous !== "string" || !RE.sha256.test(previous))) failures.push("previous_record_sha256_invalid")
    if (typeof record.chain.evidence_sha256 !== "string" || !RE.sha256.test(record.chain.evidence_sha256)) failures.push("evidence_sha256_invalid")
  }

  return { ok: failures.length === 0, failures: [...new Set(failures)] }
}

/**
 * Ordering rules over the operations array: contiguous 1-based sequences,
 * no duplicate operation, canonical relative order for successful operations,
 * hard prerequisites satisfied by an EARLIER successful operation, and no success
 * after any failure.
 */
export function validateOperationOrdering(operations, contract) {
  const failures = []
  if (!Array.isArray(operations)) return { ok: false, failures: ["operations_invalid"] }
  const canonical = contract.required_successful_sequence
  const seen = new Set()
  const successfulSoFar = new Set()
  let lastSuccessCanonicalIndex = -1
  let failureSeen = false
  for (let i = 0; i < operations.length; i++) {
    const op = operations[i]
    if (!op || typeof op !== "object") { failures.push("operations_invalid"); break }
    if (op.sequence !== i + 1) failures.push("operation_sequence_not_contiguous")
    if (seen.has(op.operation)) failures.push("operation_duplicate")
    seen.add(op.operation)
    // TEMPORAL CONSISTENCY: the sequence order must agree with the clock. An
    // operation may not start before its predecessor completed — a deploy
    // timestamped before its schema verification is a contradiction, not evidence.
    if (isStrictUtcIso(op.started_at) && isStrictUtcIso(op.completed_at)) {
      if (op.completed_at < op.started_at) failures.push("temporal_order_invalid")
      const previousOp = operations[i - 1]
      if (previousOp && isStrictUtcIso(previousOp.completed_at) && op.started_at < previousOp.completed_at) {
        failures.push("temporal_order_invalid")
      }
    }
    if (failureSeen && op.status === "success") failures.push("success_after_failure")
    if (op.status === "success") {
      for (const prerequisite of (contract.hard_prerequisites[op.operation] ?? [])) {
        if (!successfulSoFar.has(prerequisite)) failures.push("operation_prerequisite_missing")
      }
      const canonicalIndex = canonical.indexOf(op.operation)
      if (canonicalIndex >= 0) {
        if (canonicalIndex <= lastSuccessCanonicalIndex) failures.push("operation_order_invalid")
        lastSuccessCanonicalIndex = Math.max(lastSuccessCanonicalIndex, canonicalIndex)
      }
      successfulSoFar.add(op.operation)
    } else if (op.status === "failed") {
      failureSeen = true
    }
  }
  return { ok: failures.length === 0, failures: [...new Set(failures)] }
}

// ─── Recorder sessions ────────────────────────────────────────────

/**
 * Open an evidence session for ONE operator-run sequence. Every input is strictly
 * validated; a dirty tree or non-distinct Control/Tenant attestation is refused
 * outright — such evidence must never exist. Returns safe categories on refusal.
 */
export function createEvidenceSession(input = {}) {
  const { repoRoot } = input
  const loaded = loadEvidenceContract(repoRoot)
  if (!loaded.ok) return { ok: false, blocked: loaded.blocked }
  const contract = loaded.contract
  const blocked = []
  if (!contract.environment_classes.includes(input.environmentClass)) blocked.push("environment_class_invalid")
  if (typeof input.commitSha !== "string" || !RE.commitSha.test(input.commitSha)) blocked.push("commit_sha_invalid")
  if (input.dirtyTree !== false) blocked.push("repository_dirty")
  if (typeof input.nodeVersion !== "string" || !RE.nodeVersion.test(input.nodeVersion)) blocked.push("node_version_invalid")
  if (typeof input.wranglerVersion !== "string" || !RE.wranglerVersion.test(input.wranglerVersion)) blocked.push("wrangler_version_invalid")
  if (typeof input.authoritySha256 !== "string" || !RE.sha256.test(input.authoritySha256)) blocked.push("authority_sha256_invalid")
  if (input.controlTenantPhysicallyDistinct !== true) blocked.push("authority_not_physically_distinct")
  if (typeof input.migrationManifestSha256 !== "string" || !RE.sha256.test(input.migrationManifestSha256)) blocked.push("migration_manifest_sha256_invalid")
  if (typeof input.migrationPlanDigest !== "string" || !RE.sha256.test(input.migrationPlanDigest)) blocked.push("migration_plan_digest_invalid")
  if (typeof input.schemaContractSha256 !== "string" || !RE.sha256.test(input.schemaContractSha256)) blocked.push("schema_contract_sha256_invalid")
  if (typeof input.expectedSchemaVersion !== "string" || !RE.schemaVersion.test(input.expectedSchemaVersion)) blocked.push("expected_schema_version_invalid")
  const previous = input.previousRecordSha256 ?? null
  if (previous !== null && (typeof previous !== "string" || !RE.sha256.test(previous))) blocked.push("previous_record_sha256_invalid")
  if (typeof input.sessionId !== "string" || !RE.sessionId.test(input.sessionId)) blocked.push("session_id_invalid")
  if (typeof input.sessionPublicKey !== "string" || !RE.sha256.test(input.sessionPublicKey)) blocked.push("session_public_key_invalid")
  if (blocked.length > 0) return { ok: false, blocked: [...new Set(blocked)] }

  const session = {
    contract,
    header: {
      evidence_version: contract.contract_version,
      evidence_id: `evd-${randomBytes(16).toString("hex")}`,
      environment_class: input.environmentClass,
      created_at: (input.now ? input.now() : new Date()).toISOString(),
      session: { session_id: input.sessionId, public_key: input.sessionPublicKey },
      repository: { commit_sha: input.commitSha, dirty_tree: false },
      toolchain: { node_version: input.nodeVersion, wrangler_version: input.wranglerVersion },
      authority: { sha256: input.authoritySha256, control_tenant_physically_distinct: true },
      contracts: {
        migration_manifest_sha256: input.migrationManifestSha256,
        migration_plan_digest: input.migrationPlanDigest,
        schema_contract_sha256: input.schemaContractSha256,
        expected_schema_version: input.expectedSchemaVersion,
      },
    },
    previousRecordSha256: previous,
    operations: [],
    hasFailure: false,
    finalized: false,
  }
  return { ok: true, session }
}

/** Receipt digest: canonical bytes of the receipt WITHOUT its own digest + signature. */
export function computeReceiptDigest(receipt) {
  const forDigest = { ...receipt }
  delete forDigest.receipt_sha256
  delete forDigest.receipt_signature
  return sha256Hex(canonicalSerialize(forDigest))
}

/**
 * Append ONE command-issued RECEIPT to an open session. This is a LOW-LEVEL
 * assembler API (kept exported for the assembler and tests): it does not create
 * receipts — only the command-bound producers in `d1EvidenceReceipts.mjs` do —
 * and it verifies, before anything is stored:
 *   - the session is not finalized;
 *   - the receipt's authority digest, session id, and repository commit EQUAL the
 *     session's — evidence can never mix authorities, sessions, or commits;
 *   - the producer is exactly the contract's producer for the operation;
 *   - the receipt chains to the previous receipt digest (append-only chain);
 *   - the recomputed receipt digest matches, and the Ed25519 signature over it
 *     verifies against the SESSION public key — an unsigned or foreign-key receipt
 *     is unappendable even through this low-level path;
 *   - safe categories are allowlisted for the operation, sorted, deduplicated;
 *   - operation-specific proof facts match the contract's exact field allowlist;
 *   - no duplicate operation, no success after any recorded failure, hard
 *     prerequisites, canonical success order, and TEMPORAL consistency (a receipt
 *     may not start before its predecessor completed);
 *   - strict formats, and a sensitive scan of the whole candidate.
 * Sequences are append-only and contiguous from 1.
 */
export function recordEvidenceOperation(session, input = {}) {
  if (!session || typeof session !== "object" || session.finalized !== false) {
    return { ok: false, blocked: ["session_finalized"] }
  }
  const contract = session.contract
  const blocked = []
  const {
    operation, status, startedAt, completedAt, authoritySha256, resultDigest,
    producer, producerSourceSha256, inputDigest, proof,
    previousReceiptSha256, receiptSha256, receiptSignature,
  } = input
  const safeCategories = Array.isArray(input.safeCategories) ? [...input.safeCategories] : input.safeCategories === undefined ? [] : null

  if (!contract.operations.includes(operation)) blocked.push("operation_unknown")
  if (!contract.statuses.includes(status)) blocked.push("status_invalid")
  if (!isStrictUtcIso(startedAt)) blocked.push("started_at_invalid")
  if (!isStrictUtcIso(completedAt)) blocked.push("completed_at_invalid")
  if (isStrictUtcIso(startedAt) && isStrictUtcIso(completedAt) && completedAt < startedAt) blocked.push("completed_before_started")
  if (typeof authoritySha256 !== "string" || !RE.sha256.test(authoritySha256)) blocked.push("authority_sha256_invalid")
  else if (authoritySha256 !== session.header.authority.sha256) blocked.push("authority_mismatch")
  if (typeof resultDigest !== "string" || !RE.sha256.test(resultDigest)) blocked.push("result_digest_invalid")
  if (typeof inputDigest !== "string" || !RE.sha256.test(inputDigest)) blocked.push("input_digest_invalid")
  if (typeof producerSourceSha256 !== "string" || !RE.sha256.test(producerSourceSha256)) blocked.push("producer_source_invalid")
  if (typeof producer !== "string" || contract.producers_by_operation[operation] !== producer) blocked.push("producer_mismatch")

  // Per-operation category allowlist — arbitrary strings are NOT categories.
  const allowlist = contract.safe_categories_by_operation[operation] ?? []
  if (safeCategories === null || safeCategories.length > contract.limits.max_safe_categories_per_operation) {
    blocked.push("safe_categories_invalid")
  } else {
    for (const category of safeCategories) {
      if (typeof category !== "string" || !RE.safeCategory.test(category)) { blocked.push("safe_categories_invalid"); break }
      if (!allowlist.includes(category)) { blocked.push("category_not_allowlisted"); break }
    }
    const canonicalCategories = [...new Set(safeCategories)].sort()
    if (JSON.stringify(canonicalCategories) !== JSON.stringify(safeCategories)) blocked.push("safe_categories_unsorted")
  }

  // Operation-specific proof facts: exact fields, digest or allowlisted category values.
  const proofFields = contract.proof_fields_by_operation[operation] ?? []
  if (!proof || typeof proof !== "object" || Array.isArray(proof)) {
    blocked.push("proof_invalid")
  } else {
    const keys = Object.keys(proof)
    if (keys.length !== proofFields.length || !proofFields.every((field) => keys.includes(field))) blocked.push("proof_invalid")
    else {
      for (const field of proofFields) {
        const categoryValues = contract.proof_category_values[field]
        if (categoryValues) { if (!categoryValues.includes(proof[field])) blocked.push("proof_category_invalid") }
        else if (typeof proof[field] !== "string" || !RE.sha256.test(proof[field])) blocked.push("proof_digest_invalid")
      }
    }
  }

  if (session.operations.length >= contract.limits.max_operations) blocked.push("operations_limit_reached")
  if (session.operations.some((existing) => existing.operation === operation)) blocked.push("operation_duplicate")
  if (session.hasFailure && status === "success") blocked.push("operation_after_failure")

  const previousOp = session.operations[session.operations.length - 1] ?? null
  // Receipt chain: first receipt chains to null, every later one to its predecessor.
  const expectedPrevious = previousOp ? previousOp.receipt_sha256 : null
  if ((previousReceiptSha256 ?? null) !== expectedPrevious) blocked.push("receipt_chain_invalid")
  // Temporal consistency at append time — the clock must agree with the sequence.
  if (previousOp && isStrictUtcIso(startedAt) && startedAt < previousOp.completed_at) blocked.push("temporal_order_invalid")

  if (status === "success") {
    for (const prerequisite of (contract.hard_prerequisites[operation] ?? [])) {
      if (!session.operations.some((existing) => existing.operation === prerequisite && existing.status === "success")) {
        blocked.push("operation_prerequisite_missing")
      }
    }
    const canonical = contract.required_successful_sequence
    const canonicalIndex = canonical.indexOf(operation)
    const lastSuccessIndex = Math.max(-1, ...session.operations
      .filter((existing) => existing.status === "success")
      .map((existing) => canonical.indexOf(existing.operation)))
    if (canonicalIndex >= 0 && canonicalIndex <= lastSuccessIndex) blocked.push("operation_order_invalid")
  }

  const candidate = {
    sequence: session.operations.length + 1,
    operation, status,
    started_at: startedAt, completed_at: completedAt,
    authority_sha256: authoritySha256,
    session_id: session.header.session.session_id,
    repository_commit_sha: session.header.repository.commit_sha,
    producer, producer_source_sha256: producerSourceSha256,
    input_digest: inputDigest, result_digest: resultDigest,
    proof: proof && typeof proof === "object" && !Array.isArray(proof) ? { ...proof } : {},
    safe_categories: safeCategories === null ? [] : safeCategories,
    previous_receipt_sha256: previousReceiptSha256 ?? null,
    receipt_sha256: receiptSha256, receipt_signature: receiptSignature,
  }

  // The receipt digest is RECOMPUTED — a stored digest is never trusted — and the
  // signature over it must verify against the SESSION public key.
  if (typeof receiptSha256 !== "string" || !RE.sha256.test(receiptSha256)) blocked.push("receipt_sha256_invalid")
  else if (computeReceiptDigest(candidate) !== receiptSha256) blocked.push("receipt_digest_mismatch")
  if (typeof receiptSignature !== "string" || !RE.signature.test(receiptSignature)) blocked.push("receipt_unsigned")
  else if (RE.sha256.test(receiptSha256 ?? "") && !verifyReceiptSignature(session.header.session.public_key, receiptSha256, receiptSignature)) {
    blocked.push("receipt_signature_invalid")
  }

  for (const category of scanSensitiveEvidence(candidate, contract)) blocked.push(category)

  if (blocked.length > 0) return { ok: false, blocked: [...new Set(blocked)] }
  session.operations.push(deepFreezeEvidence(candidate))
  if (status === "failed") session.hasFailure = true
  return { ok: true, sequence: candidate.sequence }
}

/**
 * Seal the session into an immutable record: full contract validation, a final
 * sensitive scan (unsafe evidence is refused BEFORE it can be serialized), the
 * canonical digest, and a recursive freeze. The session accepts nothing afterwards.
 */
export function finalizeEvidenceSession(session) {
  if (!session || typeof session !== "object" || session.finalized !== false) {
    return { ok: false, blocked: ["session_finalized"] }
  }
  const record = {
    ...session.header,
    operations: session.operations.map((op) => ({ ...op, safe_categories: [...op.safe_categories] })),
    chain: { previous_record_sha256: session.previousRecordSha256, evidence_sha256: "" },
  }
  record.chain.evidence_sha256 = computeEvidenceDigest(record)

  const scan = scanSensitiveEvidence(record, session.contract)
  if (scan.length > 0) return { ok: false, blocked: scan }
  const validation = validateEvidenceRecord(record, session.contract)
  if (!validation.ok) return { ok: false, blocked: validation.failures }
  const ordering = validateOperationOrdering(record.operations, session.contract)
  if (!ordering.ok) return { ok: false, blocked: ordering.failures }

  session.finalized = true
  return { ok: true, record: deepFreezeEvidence(record) }
}

/**
 * Write a FINALIZED record into the git-ignored `.d1-evidence/` directory.
 * The record is re-validated (contract, scan, digest) before a byte is written;
 * the target repository must actually git-ignore the evidence directory; the file
 * is created EXCLUSIVELY (`wx`, a pre-placed file is never overwritten) with mode
 * 0600 and a collision-resistant, secret-free name.
 */
export function writeEvidencePack(record, { repoRoot } = {}) {
  if (!repoRoot) return { ok: false, blocked: ["repo_root_missing"] }
  const loaded = loadEvidenceContract(repoRoot)
  if (!loaded.ok) return { ok: false, blocked: loaded.blocked }
  const contract = loaded.contract

  const scan = scanSensitiveEvidence(record, contract)
  if (scan.length > 0) return { ok: false, blocked: scan }
  const validation = validateEvidenceRecord(record, contract)
  if (!validation.ok) return { ok: false, blocked: validation.failures }
  const ordering = validateOperationOrdering(record.operations, contract)
  if (!ordering.ok) return { ok: false, blocked: ordering.failures }
  if (computeEvidenceDigest(record) !== record.chain.evidence_sha256) {
    return { ok: false, blocked: ["evidence_digest_mismatch"] }
  }

  // The evidence directory must be git-ignored — a pack must never be committable.
  let gitignore
  try { gitignore = readFileSync(resolvePath(repoRoot, ".gitignore"), "utf8") } catch {
    return { ok: false, blocked: ["evidence_directory_not_ignored"] }
  }
  if (!new RegExp(`^/${EVIDENCE_DIRNAME.replace(".", "\\.")}/$`, "m").test(gitignore)) {
    return { ok: false, blocked: ["evidence_directory_not_ignored"] }
  }

  // The evidence root must be a plain, private 0700 directory — an existing unsafe
  // root (0755, a symlink, a file) is rejected, not silently accepted. Shared with
  // session initialization; independently enforced here so pack writing never trusts
  // a root some other path created.
  const secured = ensureEvidenceRootSecure(repoRoot)
  if (!secured.ok) return { ok: false, blocked: secured.blocked }
  const directory = secured.root
  const path = resolvePath(directory, `d1-operational-evidence-${record.evidence_id}.json`)
  try {
    writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600, flag: "wx" })
  } catch (error) {
    return { ok: false, blocked: [error && error.code === "EEXIST" ? "evidence_file_exists" : "evidence_file_unwritable"] }
  }
  return { ok: true, path }
}
