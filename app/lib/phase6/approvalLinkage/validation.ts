/**
 * P6-FIX-011: the single canonical issue-code list, result plumbing, primitive
 * predicates, the fail-closed single-read snapshot helper, and the structural
 * validator for the Phase 6 Approval Chain Linkage module (Issue #144).
 *
 * FAIL-CLOSED, NON-AUTHORIZING. Results carry only { ok, issues } (verification
 * additionally carries a `state`). Validation success is not approval, not
 * ApprovalStore approval, not runtime authorization, and not execution
 * permission. Issue messages are stable `${code}:${field}` strings — they
 * never echo IDs from malformed fields, hashes, target/payload, user or
 * session identity, roles, secrets, tokens, or any raw value.
 *
 * SNAPSHOT CONSISTENCY (P6-FIX-010 precedent). `snapshotRecordOrNull` reduces
 * an unknown value to a plain single-read snapshot; a hostile getter or
 * `ownKeys` trap fails closed here rather than escaping. Every consumer
 * validates and then derives from the SAME snapshot; the original object is
 * never re-read.
 *
 * No I/O, no network, no database, no environment reads, no clock reads, no
 * randomness. Timestamp comparison is pure over the pinned ISO-8601 UTC
 * profile.
 */

// ─── Stable issue codes (single canonical list) ─────────────────

export const APPROVAL_LINKAGE_ISSUE_CODES = [
  "invalid_approval_linkage_input",
  "approval_linkage_state_missing",
  "approval_linkage_tenant_mismatch",
  "approval_linkage_workunit_mismatch",
  "approval_linkage_human_decision_mismatch",
  "approval_linkage_review_evidence_mismatch",
  "approval_linkage_identity_mismatch",
  "approval_linkage_action_preview_mismatch",
  "approval_linkage_approval_record_mismatch",
  "approval_linkage_action_type_mismatch",
  "approval_linkage_target_hash_mismatch",
  "approval_linkage_payload_hash_mismatch",
  "approval_linkage_review_envelope_mismatch",
  "approval_linkage_approver_mismatch",
  "approval_linkage_hash_mismatch",
  "approval_linkage_stale",
  "approval_linkage_expired",
  "approval_linkage_revoked",
  "approval_linkage_used",
  "approval_linkage_replayed",
  "approval_linkage_validation_exception",
] as const

export type ApprovalLinkageIssueCode = (typeof APPROVAL_LINKAGE_ISSUE_CODES)[number]

export type ApprovalLinkageIssue = {
  readonly code: ApprovalLinkageIssueCode
  readonly field: string
  /** Always `${code}:${field}` — never contains supplied values. */
  readonly message: string
}

export function approvalLinkageIssue(
  code: ApprovalLinkageIssueCode,
  field: string,
): ApprovalLinkageIssue {
  return { code, field, message: `${code}:${field}` }
}

export type ApprovalLinkageValidationResult = {
  readonly ok: boolean
  readonly issues: readonly ApprovalLinkageIssue[]
}

export function approvalLinkageResultOf(
  issues: readonly ApprovalLinkageIssue[],
): ApprovalLinkageValidationResult {
  // Frozen result + cloned frozen issue snapshot (P6-FIX-007b precedent).
  return Object.freeze({ ok: issues.length === 0, issues: Object.freeze([...issues]) })
}

// ─── Primitive predicates ───────────────────────────────────────

const SHA256_HEX = /^[0-9a-f]{64}$/

export function isApprovalLinkageRecordObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function isApprovalLinkageNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}

/** Exactly 64 lowercase hexadecimal characters (format validation only). */
export function isApprovalLinkageHex64(value: unknown): value is string {
  return typeof value === "string" && SHA256_HEX.test(value)
}

// ─── Single-read snapshot (fail-closed) ─────────────────────────

/**
 * Pure shallow single-read snapshot of an unknown value. Returns a plain
 * object copying every own-enumerable property exactly once, or `null` when
 * the value is not a record or when reading it throws — a hostile getter or
 * `ownKeys` trap fails closed here rather than escaping. After a snapshot is
 * taken the original object is never read again.
 */
export function snapshotRecordOrNull(value: unknown): Record<string, unknown> | null {
  try {
    if (!isApprovalLinkageRecordObject(value)) return null
    const snapshot: Record<string, unknown> = {}
    for (const key of Object.keys(value)) {
      snapshot[key] = value[key]
    }
    return snapshot
  } catch {
    return null
  }
}

/**
 * Single-read snapshot of a string-array collection. Returns a frozen defensive
 * copy, or `null` when the value is not an array of strings or when reading it
 * throws. A later mutation of the caller's array cannot change the snapshot.
 */
export function snapshotStringArrayOrNull(value: unknown): readonly string[] | null {
  try {
    if (!Array.isArray(value)) return null
    const out: string[] = []
    for (const entry of value) {
      if (typeof entry !== "string") return null
      out.push(entry)
    }
    return Object.freeze(out)
  } catch {
    return null
  }
}

// ─── Pure ISO-8601 UTC comparison ───────────────────────────────

/**
 * Compare two already-validated pinned-profile ISO-8601 UTC timestamps
 * (`YYYY-MM-DDTHH:mm:ss(.fff)?Z`) without Date parsing. Returns -1, 0, or 1.
 * Callers must validate both inputs with the shared ISO guard first.
 */
export function compareApprovalLinkageIsoUtc(a: string, b: string): -1 | 0 | 1 {
  const [aBase, aFraction = ""] = a.replace("Z", "").split(".")
  const [bBase, bFraction = ""] = b.replace("Z", "").split(".")
  if (aBase !== bBase) return aBase < bBase ? -1 : 1
  const aPadded = aFraction.padEnd(3, "0")
  const bPadded = bFraction.padEnd(3, "0")
  if (aPadded === bPadded) return 0
  return aPadded < bPadded ? -1 : 1
}

// ─── Structural linkage-record validator (non-narrowing) ────────

import { isIsoUtcTimestamp } from "../shared/isoUtcTimestamp.ts"
import {
  APPROVAL_LINKAGE_HASH_ALGORITHM,
  APPROVAL_LINKAGE_CANONICALIZATION_ALGORITHM,
  APPROVAL_LINKAGE_ACTION_TYPES,
} from "./types.ts"

type LinkageFieldKind = "identifier" | "hash" | "timestamp" | "action_type" | "hash_algo" | "canon_algo"

const LINKAGE_RECORD_FIELD_SPECS: Readonly<Record<string, LinkageFieldKind>> = {
  approval_linkage_id: "identifier",
  tenant_id: "identifier",
  human_decision_id: "identifier",
  human_decision_hash: "hash",
  review_evidence_id: "identifier",
  review_evidence_hash: "hash",
  review_envelope_hash: "hash",
  first_review_attestation_id: "identifier",
  second_review_attestation_id: "identifier",
  identity_chain_hash: "hash",
  workunit_id: "identifier",
  action_preview_id: "identifier",
  approval_id: "identifier",
  action_type: "action_type",
  target_hash: "hash",
  payload_hash: "hash",
  approver_id: "identifier",
  preview_created_at: "timestamp",
  preview_expires_at: "timestamp",
  review_completed_at: "timestamp",
  review_expires_at: "timestamp",
  approval_created_at: "timestamp",
  approval_approved_at: "timestamp",
  approval_expires_at: "timestamp",
  linked_at: "timestamp",
  linkage_expires_at: "timestamp",
  hash_algorithm: "hash_algo",
  canonicalization_algorithm: "canon_algo",
  linkage_hash: "hash",
}

/**
 * Pure, fail-closed, NON-NARROWING structural validator for a linkage record.
 * Because a cast can lie about the opaque brand, every downstream consumer must
 * run this before trusting any field. It never asserts
 * `input is ApprovalLinkageRecord` — only the constructor produces the type.
 * Reads its input through a single-read snapshot; unknown top-level fields fail
 * closed.
 */
export function validateApprovalLinkageRecord(
  input: unknown,
): ApprovalLinkageValidationResult {
  try {
    const snapshot = snapshotRecordOrNull(input)
    if (snapshot === null) {
      return approvalLinkageResultOf([
        approvalLinkageIssue("invalid_approval_linkage_input", "(linkage)"),
      ])
    }
    const issues: ApprovalLinkageIssue[] = []
    for (const key of Object.keys(snapshot)) {
      if (!Object.prototype.hasOwnProperty.call(LINKAGE_RECORD_FIELD_SPECS, key)) {
        issues.push(approvalLinkageIssue("invalid_approval_linkage_input", `(linkage).${key}`))
      }
    }
    for (const [field, kind] of Object.entries(LINKAGE_RECORD_FIELD_SPECS)) {
      if (!Object.prototype.hasOwnProperty.call(snapshot, field)) {
        issues.push(approvalLinkageIssue("approval_linkage_state_missing", `(linkage).${field}`))
        continue
      }
      const value = snapshot[field]
      switch (kind) {
        case "identifier":
          if (!isApprovalLinkageNonEmptyString(value)) {
            issues.push(approvalLinkageIssue("invalid_approval_linkage_input", `(linkage).${field}`))
          }
          break
        case "hash":
          if (!isApprovalLinkageHex64(value)) {
            issues.push(approvalLinkageIssue("invalid_approval_linkage_input", `(linkage).${field}`))
          }
          break
        case "timestamp":
          if (!isIsoUtcTimestamp(value)) {
            issues.push(approvalLinkageIssue("invalid_approval_linkage_input", `(linkage).${field}`))
          }
          break
        case "action_type":
          if (!(APPROVAL_LINKAGE_ACTION_TYPES as readonly string[]).includes(value as string)) {
            issues.push(approvalLinkageIssue("invalid_approval_linkage_input", `(linkage).${field}`))
          }
          break
        case "hash_algo":
          if (value !== APPROVAL_LINKAGE_HASH_ALGORITHM) {
            issues.push(approvalLinkageIssue("invalid_approval_linkage_input", `(linkage).${field}`))
          }
          break
        case "canon_algo":
          if (value !== APPROVAL_LINKAGE_CANONICALIZATION_ALGORITHM) {
            issues.push(approvalLinkageIssue("invalid_approval_linkage_input", `(linkage).${field}`))
          }
          break
      }
    }
    return approvalLinkageResultOf(issues)
  } catch {
    return approvalLinkageResultOf([
      approvalLinkageIssue("approval_linkage_validation_exception", "(linkage)"),
    ])
  }
}
