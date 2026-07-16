#!/usr/bin/env node
/**
 * cf:d1:evidence:verify (P0-OPS-016) — OFFLINE verification of one D1 operational
 * evidence pack (Issue #155).
 *
 * Reads ONE evidence pack from an explicitly supplied path and verifies it against
 * the committed contract: strict shape, the sensitive-data scanner, the recomputed
 * canonical digest, operation ordering, one authority digest across every
 * operation, and completeness of the required successful sequence.
 *
 * ENTIRELY OFFLINE: no network, no database, no Wrangler, no child process. It can
 * (and should) be run from a second clean checkout when reviewing evidence.
 *
 * Output is CATEGORY-ONLY. This command never prints evidence contents, values,
 * paths from inside the record, IDs, or names — a malformed pack must not become a
 * disclosure channel.
 */

import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { lstatSync, readFileSync } from "node:fs"
import {
  loadEvidenceContract, scanSensitiveEvidence, validateEvidenceRecord,
  validateOperationOrdering, computeEvidenceDigest, computeReceiptDigest,
  verifyReceiptSignature, canonicalSerialize, sha256Hex,
} from "./lib/d1OperationalEvidence.mjs"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")

/**
 * Verify one evidence pack. Returns `{ ok, categories }` — safe categories only.
 * `ok: true` means exactly `["evidence_valid"]`.
 *
 * When `sessionDir` is supplied, the pack is additionally anchored to that
 * initialized session's manifest: its session id, public key, and commit must
 * match the pack. This is what distinguishes "receipts came through one
 * initialized repository evidence session" from a wholesale re-implementation
 * signed with a foreign key. It is still NOT a third-party attestation.
 */
export function verifyEvidencePackAtPath(path, { repoRoot = REPO_ROOT, sessionDir = null } = {}) {
  const loaded = loadEvidenceContract(repoRoot)
  if (!loaded.ok) return { ok: false, categories: loaded.blocked }
  const contract = loaded.contract

  if (typeof path !== "string" || path.length === 0) return { ok: false, categories: ["evidence_unreadable"] }

  // Plain, non-symlink file with a bounded size — checked BEFORE the read.
  let stats
  try { stats = lstatSync(path) } catch { return { ok: false, categories: ["evidence_unreadable"] } }
  if (stats.isSymbolicLink()) return { ok: false, categories: ["evidence_unreadable"] }
  if (!stats.isFile()) return { ok: false, categories: ["evidence_unreadable"] }
  if (stats.size > contract.limits.max_file_bytes) return { ok: false, categories: ["evidence_too_large"] }

  let raw
  try { raw = readFileSync(path, "utf8") } catch { return { ok: false, categories: ["evidence_unreadable"] } }
  // lstat and read are two syscalls — the file could have grown between them.
  if (Buffer.byteLength(raw) > contract.limits.max_file_bytes) return { ok: false, categories: ["evidence_too_large"] }

  let record
  try { record = JSON.parse(raw) } catch { return { ok: false, categories: ["evidence_unparseable"] } }
  if (!record || typeof record !== "object" || Array.isArray(record)) return { ok: false, categories: ["evidence_unparseable"] }

  const categories = []

  // The sensitive scan runs on the RAW parsed object, independent of shape — a
  // pack carrying a UUID, email, token, or raw SQL is reported as sensitive even
  // when it also violates the contract.
  const scan = scanSensitiveEvidence(record, contract)
  if (scan.length > 0) categories.push("evidence_sensitive_content", ...scan)

  const shape = validateEvidenceRecord(record, contract)
  if (!shape.ok) categories.push("evidence_contract_invalid", ...shape.failures)

  if (shape.ok) {
    // Recompute the canonical digest — the stored value is NEVER trusted.
    if (computeEvidenceDigest(record) !== record.chain.evidence_sha256) {
      categories.push("evidence_digest_mismatch")
    }

    const ordering = validateOperationOrdering(record.operations, contract)
    if (!ordering.ok) {
      categories.push("evidence_operation_order_invalid", ...ordering.failures)
      if (ordering.failures.includes("temporal_order_invalid")) categories.push("evidence_temporal_order_invalid")
    }

    // ONE authority digest across the session and every operation.
    if (!record.operations.every((op) => op.authority_sha256 === record.authority.sha256)) {
      categories.push("evidence_authority_mismatch")
    }

    // ── Command-bound receipt layer ──
    // Every operation is a RECEIPT: signed by the session key, chained to its
    // predecessor, bound to one session id and one repository commit, produced by
    // exactly the contract's producer for its operation, with recomputable input
    // and result digests and strictly allowlisted per-operation categories.
    // Pack-level hashing alone is NOT execution provenance — an internally
    // consistent but unsigned fabricated pack must fail here.
    let expectedPrevious = null
    for (const op of record.operations) {
      if (op.session_id !== record.session.session_id) categories.push("evidence_session_mismatch")
      if (op.repository_commit_sha !== record.repository.commit_sha) categories.push("evidence_repository_mismatch")
      if (contract.producers_by_operation[op.operation] !== op.producer) categories.push("evidence_producer_mismatch")

      // The producer-source digest must match the LOCAL repository's actual command
      // file — the verifier is documented to run from a clean checkout at the
      // evidence commit. A fabricated pack claiming an invented producer digest
      // fails here even when it is internally consistent and self-signed.
      const sourceRel = contract.producer_sources[op.producer]
      let localSource = null
      if (sourceRel) { try { localSource = sha256Hex(readFileSync(resolve(repoRoot, sourceRel))) } catch { localSource = null } }
      if (localSource === null || localSource !== op.producer_source_sha256) {
        categories.push("evidence_producer_source_mismatch")
      }

      // Receipt digest and chain — both recomputed, never trusted.
      if (computeReceiptDigest(op) !== op.receipt_sha256) categories.push("evidence_receipt_digest_mismatch")
      if ((op.previous_receipt_sha256 ?? null) !== expectedPrevious) categories.push("evidence_receipt_chain_invalid")
      expectedPrevious = op.receipt_sha256

      // Session signature — an unsigned receipt and a bad signature are distinct.
      if (typeof op.receipt_signature !== "string" || !/^[0-9a-f]{128}$/.test(op.receipt_signature)) {
        categories.push("evidence_receipt_unsigned")
      } else if (!verifyReceiptSignature(record.session.public_key, op.receipt_sha256, op.receipt_signature)) {
        categories.push("evidence_receipt_signature_invalid")
      }

      // Input and result digests are recomputable from receipt fields alone.
      const expectedInput = sha256Hex(canonicalSerialize({
        authority_sha256: op.authority_sha256, operation: op.operation, producer: op.producer,
        repository_commit_sha: op.repository_commit_sha, session_id: op.session_id,
      }))
      const expectedResult = sha256Hex(canonicalSerialize({
        authority_sha256: op.authority_sha256, operation: op.operation, producer: op.producer,
        producer_source_sha256: op.producer_source_sha256, proof: op.proof,
        repository_commit_sha: op.repository_commit_sha, safe_categories: op.safe_categories,
        session_id: op.session_id, status: op.status,
      }))
      if (op.input_digest !== expectedInput || op.result_digest !== expectedResult) {
        categories.push("evidence_receipt_digest_mismatch")
      }

      // STRICT per-operation category allowlist — arbitrary strings (a database
      // name, a normalized error message) are not categories.
      const allowlist = contract.safe_categories_by_operation[op.operation] ?? []
      if (!op.safe_categories.every((category) => allowlist.includes(category))) {
        categories.push("evidence_category_not_allowlisted")
      }
    }

    if (record.operations.some((op) => op.status === "failed")) {
      categories.push("evidence_failed_operation")
    }

    // Complete evidence = every required operation present AND successful.
    const successful = new Set(record.operations.filter((op) => op.status === "success").map((op) => op.operation))
    if (!contract.required_successful_sequence.every((operation) => successful.has(operation))) {
      categories.push("evidence_incomplete")
    }

    // Optional session anchor: the pack must belong to the SUPPLIED initialized
    // session — same id, same public key, same derived commit.
    if (sessionDir !== null) {
      let manifest = null
      try { manifest = JSON.parse(readFileSync(resolve(sessionDir, "session.json"), "utf8")) } catch { manifest = null }
      if (!manifest
        || manifest.session_id !== record.session.session_id
        || manifest.public_key !== record.session.public_key
        || manifest.commit_sha !== record.repository.commit_sha) {
        categories.push("evidence_session_mismatch")
      }
    }
  }

  const unique = [...new Set(categories)]
  if (unique.length > 0) return { ok: false, categories: unique }
  return { ok: true, categories: ["evidence_valid"] }
}

function parseFileArg(argv) {
  const index = argv.indexOf("--file")
  return index >= 0 && argv[index + 1] ? resolve(argv[index + 1]) : undefined
}

function parseSessionArg(argv) {
  const index = argv.indexOf("--session")
  return index >= 0 && argv[index + 1] ? resolve(argv[index + 1]) : null
}

function main() {
  const path = parseFileArg(process.argv.slice(2))
  if (!path) {
    console.error("cf:d1:evidence:verify: an explicit evidence path is required.")
    console.error("Usage: npm run cf:d1:evidence:verify -- --file .d1-evidence/<pack>.json [--session .d1-evidence/<session-id>]")
    process.exit(1)
  }
  const result = verifyEvidencePackAtPath(path, { repoRoot: REPO_ROOT, sessionDir: parseSessionArg(process.argv.slice(2)) })
  if (result.ok) {
    console.log("cf:d1:evidence:verify: VALID (evidence_valid)")
  } else {
    console.error(`cf:d1:evidence:verify: INVALID — ${result.categories.join(", ")}`)
  }
  process.exit(result.ok ? 0 : 1)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
