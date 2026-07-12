/**
 * P6-I0: shared validation result types and primitive validators for Phase 6
 * artifacts (docs/PHASE6_IMPLEMENTATION_DECISION_RECORD.md §11).
 *
 * FAIL-CLOSED, NON-AUTHORIZING. A ValidationResult carries only { ok, issues }:
 * validation pass is not approval and not execution permission. Issue messages
 * are `code:field` only — they never echo input values, so secret-like values
 * cannot leak through validation output.
 *
 * Style follows app/lib/security/approvalMac/canonicalApprovalPayload.ts
 * (structured stable codes, allowlist-based unknown-field rejection,
 * missing ≠ null, pinned hex64 / ISO-8601-UTC formats) WITHOUT importing it.
 * No I/O, no network, no database, no environment reads.
 *
 * The ISO-8601 UTC timestamp predicate is the single shared, semantic guard
 * (P6-FIX-004, Issue #115); this module no longer defines its own regex.
 *
 * Grant-like top-level fields are classified against the single canonical
 * shared Phase 6 denylist (P6-FIX-005, Issue #116) with the dedicated
 * forbidden_grant_field_present code instead of the generic unknown_field.
 * Both classifications were and remain fail-closed rejections.
 *
 * safety_boundary_not_confirmed (P6-FIX-006, Issue #120) reports a phase-wide
 * required-true safety literal (e.g. four_eyes_required) that is present and
 * boolean but false. Reporting it grants nothing: validation pass remains
 * non-authorizing.
 */

import { isIsoUtcTimestamp } from "../shared/isoUtcTimestamp.ts"
import { isPhase6ForbiddenGrantField } from "../shared/forbiddenGrantFields.ts"

export const VALIDATION_ISSUE_CODES = [
  "invalid_record",
  "missing_required_field",
  "null_required_field",
  "invalid_field_type",
  "invalid_enum_value",
  "invalid_timestamp",
  "invalid_sha256_hex",
  "invalid_content_integrity_reference",
  "invalid_array",
  "invalid_object",
  "unknown_field",
  "forbidden_grant_field_present",
  "missing_tenant_id",
  "invalid_tenant_id",
  "missing_lineage_id",
  "invalid_lineage_id",
  "safety_boundary_not_confirmed",
  "no_go_flags_present",
  "cross_tenant_lineage_not_checked",
  "validation_exception",
] as const

export type ValidationIssueCode = (typeof VALIDATION_ISSUE_CODES)[number]

export type ValidationIssue = {
  readonly code: ValidationIssueCode
  readonly field: string
  /** Always `${code}:${field}` — never contains input values. */
  readonly message: string
}

export type ValidationResult = {
  readonly ok: boolean
  readonly issues: readonly ValidationIssue[]
}

export function issue(code: ValidationIssueCode, field: string): ValidationIssue {
  return { code, field, message: `${code}:${field}` }
}

export function resultOf(issues: readonly ValidationIssue[]): ValidationResult {
  return { ok: issues.length === 0, issues }
}

// ─── Primitive predicates ───────────────────────────────────────

const SHA256_HEX = /^[0-9a-f]{64}$/
const CONTENT_INTEGRITY_REFERENCE = /^sha256:[0-9a-f]{64}$/

/** Plain record object: not null, not an array, typeof object. */
export function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}

export function isIsoTimestampString(value: unknown): value is string {
  return isIsoUtcTimestamp(value)
}

export function isSha256Hex(value: unknown): value is string {
  return typeof value === "string" && SHA256_HEX.test(value)
}

export function isContentIntegrityReference(value: unknown): value is string {
  return typeof value === "string" && CONTENT_INTEGRITY_REFERENCE.test(value)
}

export function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
}

// ─── Field-level validators (return issues; never throw) ────────

/**
 * Allowlist-based unknown-field check: every own key of `record` must be in
 * `allowedFields`. Unknown top-level fields are rejected by default for all
 * eight Phase 6 artifact records (fail closed). A key on the canonical shared
 * grant-like denylist is rejected with the dedicated
 * forbidden_grant_field_present code (exactly one issue per key — never also
 * unknown_field); every other unknown key keeps the generic unknown_field.
 */
export function collectUnknownFieldIssues(
  record: Record<string, unknown>,
  allowedFields: readonly string[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  for (const key of Object.keys(record)) {
    if (allowedFields.includes(key)) continue
    if (isPhase6ForbiddenGrantField(key)) {
      issues.push(issue("forbidden_grant_field_present", key))
    } else {
      issues.push(issue("unknown_field", key))
    }
  }
  return issues
}

type PresenceCheck =
  | { readonly present: true; readonly value: unknown }
  | { readonly present: false; readonly value?: never }

/** Missing (absent key or undefined) is distinguished from explicit null. */
export function checkPresence(
  record: Record<string, unknown>,
  field: string,
): PresenceCheck {
  if (!Object.prototype.hasOwnProperty.call(record, field)) return { present: false }
  const value = record[field]
  if (value === undefined) return { present: false }
  return { present: true, value }
}

export function validateRequiredString(
  record: Record<string, unknown>,
  field: string,
): ValidationIssue[] {
  const presence = checkPresence(record, field)
  if (!presence.present) return [issue("missing_required_field", field)]
  if (presence.value === null) return [issue("null_required_field", field)]
  if (!isNonEmptyString(presence.value)) return [issue("invalid_field_type", field)]
  return []
}

export function validateRequiredBoolean(
  record: Record<string, unknown>,
  field: string,
): ValidationIssue[] {
  const presence = checkPresence(record, field)
  if (!presence.present) return [issue("missing_required_field", field)]
  if (presence.value === null) return [issue("null_required_field", field)]
  if (typeof presence.value !== "boolean") return [issue("invalid_field_type", field)]
  return []
}

/** Required array of strings; objects where arrays are expected fail closed. */
export function validateRequiredArray(
  record: Record<string, unknown>,
  field: string,
): ValidationIssue[] {
  const presence = checkPresence(record, field)
  if (!presence.present) return [issue("missing_required_field", field)]
  if (presence.value === null) return [issue("null_required_field", field)]
  if (!Array.isArray(presence.value)) return [issue("invalid_array", field)]
  if (!isStringArray(presence.value)) return [issue("invalid_field_type", field)]
  return []
}

export function validateEnumValue(
  record: Record<string, unknown>,
  field: string,
  allowed: readonly string[],
): ValidationIssue[] {
  const presence = checkPresence(record, field)
  if (!presence.present) return [issue("missing_required_field", field)]
  if (presence.value === null) return [issue("null_required_field", field)]
  if (typeof presence.value !== "string") return [issue("invalid_field_type", field)]
  if (!allowed.includes(presence.value)) return [issue("invalid_enum_value", field)]
  return []
}
