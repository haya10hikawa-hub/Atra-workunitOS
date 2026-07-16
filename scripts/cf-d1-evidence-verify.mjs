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
  validateOperationOrdering, computeEvidenceDigest,
} from "./lib/d1OperationalEvidence.mjs"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")

/**
 * Verify one evidence pack. Returns `{ ok, categories }` — safe categories only.
 * `ok: true` means exactly `["evidence_valid"]`.
 */
export function verifyEvidencePackAtPath(path, { repoRoot = REPO_ROOT } = {}) {
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
    if (!ordering.ok) categories.push("evidence_operation_order_invalid", ...ordering.failures)

    // ONE authority digest across the session and every operation.
    if (!record.operations.every((op) => op.authority_sha256 === record.authority.sha256)) {
      categories.push("evidence_authority_mismatch")
    }

    if (record.operations.some((op) => op.status === "failed")) {
      categories.push("evidence_failed_operation")
    }

    // Complete evidence = every required operation present AND successful.
    const successful = new Set(record.operations.filter((op) => op.status === "success").map((op) => op.operation))
    if (!contract.required_successful_sequence.every((operation) => successful.has(operation))) {
      categories.push("evidence_incomplete")
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

function main() {
  const path = parseFileArg(process.argv.slice(2))
  if (!path) {
    console.error("cf:d1:evidence:verify: an explicit evidence path is required.")
    console.error("Usage: npm run cf:d1:evidence:verify -- --file .d1-evidence/<pack>.json")
    process.exit(1)
  }
  const result = verifyEvidencePackAtPath(path, { repoRoot: REPO_ROOT })
  if (result.ok) {
    console.log("cf:d1:evidence:verify: VALID (evidence_valid)")
  } else {
    console.error(`cf:d1:evidence:verify: INVALID — ${result.categories.join(", ")}`)
  }
  process.exit(result.ok ? 0 : 1)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
