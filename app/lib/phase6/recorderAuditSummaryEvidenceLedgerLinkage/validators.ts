/**
 * P6-I5S: pure, fail-closed, non-authorizing no-append validator for a future
 * Recorder Audit Summary to Evidence Ledger linkage candidate, implementing the
 * P6-I5R contract (docs/P6_I5S_NO_APPEND_LINKAGE_CONTRACT_TYPES_AND_PURE_VALIDATOR.md).
 *
 * NON-AUTHORIZING, NO-APPEND BY CONSTRUCTION. validateLinkageCandidate accepts
 * unknown input, never throws for normal invalid input (a defensive catch maps
 * unexpected failures to `validator_exception`), never mutates its input, never
 * returns the raw input, performs no I/O of any kind, reads no clock and no
 * randomness, and returns only { ok, issues }. It appends nothing, writes no
 * graph, and persists nothing. Validation success means a candidate is
 * well-formed with the no-append / no-graph-write / human-review flags set
 * correctly — it does not mean a reference was recorded, and it is not approval,
 * not execution permission, and not production readiness.
 *
 * Issue messages are `${code}:${field}` only — they never echo input values, so
 * secret-like values cannot leak through validation output.
 *
 * Getter-TOCTOU hardening: every own enumerable top-level property is read
 * exactly once into a plain snapshot; every check reads the snapshot only. The
 * input itself is never mutated, and the returned result and its issue array are
 * frozen.
 *
 * This module imports only inert sibling helpers: the Recorder Audit Summary
 * scope guard and scalar guards from the P6-I5L validator, and the inert
 * contract types from ./types.ts. It imports nothing from app runtime, no
 * persistence, no database access, no query-language execution, no
 * approval-store, no external clients, and no model providers.
 */

import {
  isRecorderAuditSummaryScope,
  isSha256Hex,
  isIsoTimestamp,
} from "../recorderAuditSummary/validators.ts"
import {
  LINKAGE_CANDIDATE_REQUIRED_FIELDS,
  LINKAGE_CANDIDATE_LINEAGE_VARIANT_FIELDS,
  LINKAGE_CANDIDATE_ALLOWED_FIELDS,
  LINKAGE_CANDIDATE_FORBIDDEN_GRANT_FIELDS,
  LINKAGE_CANDIDATE_FORBIDDEN_SECRET_FIELDS,
  LINKAGE_CANDIDATE_FORBIDDEN_RAW_PAYLOAD_FIELDS,
  type LinkageValidationIssue,
  type LinkageValidationIssueCode,
  type LinkageValidationResult,
} from "./types.ts"

// ─── Issue / result helpers ─────────────────────────────────────

function issue(code: LinkageValidationIssueCode, field: string): LinkageValidationIssue {
  return { code, field, message: `${code}:${field}` }
}

function resultOf(issues: readonly LinkageValidationIssue[]): LinkageValidationResult {
  return Object.freeze({ ok: issues.length === 0, issues: Object.freeze([...issues]) })
}

// ─── Primitive predicates ───────────────────────────────────────

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}

// ─── Defense-in-depth forbidden name variants (beyond the exact P6-I5R list) ──

/**
 * Grant-like name variants rejected as `forbidden_field_present`, beyond the
 * exact P6-I5R §9 grant fields (which are rejected as `grant_like_field_present`).
 */
const EXTRA_GRANT_LIKE_FIELDS: readonly string[] = [
  "approval",
  "approved",
  "authorized",
  "authorization",
  "execution_permission",
  "executed",
  "promotion_permission",
  "promoted",
  "persistence_permission",
  "persisted",
  "storage_permission",
  "stored",
  "durable_storage_permission",
  "evidence_ledger_append_permission",
  "graph_write_permission",
  "external_action_permission",
  "formal_workunit_promotion",
  "approvalstore_approval",
  "starthub_execution_permission",
]

/** Secret-like name variants beyond the exact P6-I5R §9 secret fields. */
const EXTRA_SECRET_LIKE_FIELDS: readonly string[] = [
  "secrets",
  "api_key",
  "apikey",
  "password",
  "authorization_header",
  "raw_secret",
  "access_token",
  "refresh_token",
]

/** Raw-payload name variants beyond the exact P6-I5R §9 raw-payload field. */
const EXTRA_RAW_PAYLOAD_FIELDS: readonly string[] = [
  "raw_payload",
  "record_payload",
  "raw_record",
  "payload",
  "record",
  "raw_events",
  "event_payload",
  "raw_audit_event",
  "raw_audit_events",
]

// ─── Field-name classification (deterministic, first match wins) ─

function classifyForbiddenField(field: string): LinkageValidationIssueCode | null {
  if (LINKAGE_CANDIDATE_FORBIDDEN_GRANT_FIELDS.includes(field as never)) {
    return "grant_like_field_present"
  }
  if (LINKAGE_CANDIDATE_FORBIDDEN_SECRET_FIELDS.includes(field as never)) {
    return "secret_like_value_present"
  }
  if (LINKAGE_CANDIDATE_FORBIDDEN_RAW_PAYLOAD_FIELDS.includes(field as never)) {
    return "raw_event_payload_present"
  }
  if (EXTRA_GRANT_LIKE_FIELDS.includes(field)) return "forbidden_field_present"
  if (EXTRA_SECRET_LIKE_FIELDS.includes(field)) return "forbidden_field_present"
  if (EXTRA_RAW_PAYLOAD_FIELDS.includes(field)) return "forbidden_field_present"
  return null
}

// ─── Required-field presence classification ─────────────────────

type Presence = "absent" | "null" | "present"

function presenceOf(snapshot: Record<string, unknown>, field: string): Presence {
  if (!Object.prototype.hasOwnProperty.call(snapshot, field)) return "absent"
  if (snapshot[field] === null) return "null"
  return "present"
}

// ─── Public validator ───────────────────────────────────────────

export function validateLinkageCandidate(input: unknown): LinkageValidationResult {
  try {
    if (input === null || typeof input !== "object") {
      return resultOf([issue("invalid_input", "(candidate)")])
    }
    if (Array.isArray(input)) {
      return resultOf([issue("not_object", "(candidate)")])
    }
    if (!isRecordObject(input)) {
      return resultOf([issue("not_object", "(candidate)")])
    }

    // Single-read snapshot (getter-TOCTOU hardening): read every own enumerable
    // top-level property exactly once. All checks below read the snapshot only.
    const snapshot: Record<string, unknown> = {}
    for (const key of Object.keys(input)) {
      snapshot[key] = (input as Record<string, unknown>)[key]
    }

    const issues: LinkageValidationIssue[] = []

    // 1. Forbidden / unknown top-level fields.
    for (const key of Object.keys(snapshot)) {
      if (LINKAGE_CANDIDATE_ALLOWED_FIELDS.includes(key as never)) continue
      const forbidden = classifyForbiddenField(key)
      issues.push(issue(forbidden ?? "unknown_field", key))
    }

    // 2. Required scalar / typed fields, in a fixed canonical order.
    for (const field of LINKAGE_CANDIDATE_REQUIRED_FIELDS) {
      const presence = presenceOf(snapshot, field)
      if (presence === "absent") {
        issues.push(issue("missing_required_field", field))
        continue
      }
      if (presence === "null") {
        issues.push(issue("null_required_field", field))
        continue
      }
      const value = snapshot[field]
      switch (field) {
        case "payload_hash":
          if (!isSha256Hex(value)) issues.push(issue("invalid_payload_hash", field))
          break
        case "summary_scope":
          if (!isRecorderAuditSummaryScope(value)) issues.push(issue("invalid_summary_scope", field))
          break
        case "created_at":
          if (!isIsoTimestamp(value)) issues.push(issue("invalid_field_type", field))
          break
        case "tenant_id":
          if (!isNonEmptyString(value)) issues.push(issue("invalid_tenant", field))
          break
        case "non_authorization_statement":
          if (!isNonEmptyString(value)) {
            issues.push(issue("invalid_non_authorization_statement", field))
          }
          break
        case "human_review_required":
          if (value !== true) issues.push(issue("human_review_required_must_be_true", field))
          break
        case "append_allowed":
          if (value !== false) issues.push(issue("append_allowed_must_be_false", field))
          break
        case "graph_write_allowed":
          if (value !== false) issues.push(issue("graph_write_allowed_must_be_false", field))
          break
        default:
          // summary_id, source_loop, source_recorder_loop, source_validator_loop,
          // evidence_ledger_reference_purpose.
          if (!isNonEmptyString(value)) {
            if (field === "source_loop" || field === "source_recorder_loop" || field === "source_validator_loop") {
              issues.push(issue("invalid_source_lineage", field))
            } else {
              issues.push(issue("invalid_field_type", field))
            }
          }
          break
      }
    }

    // 3. Source lineage variant: at least one of source_fixture_loop /
    //    source_harness_loop present as a non-empty string; any present one must
    //    be a non-empty string.
    let anyLineageVariant = false
    for (const field of LINKAGE_CANDIDATE_LINEAGE_VARIANT_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(snapshot, field)) continue
      const value = snapshot[field]
      if (isNonEmptyString(value)) {
        anyLineageVariant = true
      } else {
        issues.push(issue("invalid_source_lineage", field))
      }
    }
    if (!anyLineageVariant) {
      issues.push(issue("invalid_source_lineage", "(source_fixture_loop|source_harness_loop)"))
    }

    return resultOf(issues)
  } catch {
    return resultOf([issue("validator_exception", "(candidate)")])
  }
}
