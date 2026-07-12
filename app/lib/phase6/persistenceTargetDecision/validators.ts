/**
 * P6-I5B: fail-closed, non-authorizing validators for the Phase 6 Persistence
 * Target Decision Record (docs/P6_I5B_PERSISTENCE_TARGET_TYPES_VALIDATORS.md,
 * grounded in docs/P6_I5A_TARGET_DECISION_RECORD_CONTRACT.md).
 *
 * NON-AUTHORIZING BY CONSTRUCTION. validateTargetDecisionRecord accepts unknown
 * input, never throws for normal invalid input (a defensive catch maps
 * unexpected failures to `validation_exception`), never mutates its input,
 * performs no I/O of any kind, and returns only { ok, issues }. Validation pass
 * is not persistence, not storage, not approval, not execution permission, not
 * promotion, and not production readiness.
 *
 * Issue messages are `${code}:${field}` only — they never echo input values, so
 * secret-like values cannot leak through validation output.
 *
 * Getter-TOCTOU hardening: every own enumerable top-level property is read
 * exactly once into a plain snapshot object; every check reads the snapshot, so
 * a getter-bearing input cannot show one value to one check and another value to
 * another. The input itself is never mutated.
 *
 * This module imports NOTHING from app runtime, app/lib/persistence,
 * app/lib/phase6/artifacts, app/lib/security/approvalMac, D1, SQL, ApprovalStore,
 * external action clients, or LLM providers. It imports only its sibling
 * ./types.ts (inert types and value lists) and the pure shared Phase 6 leaf
 * modules (../shared/*.ts).
 */

import {
  PERSISTENCE_TARGET_CLASSES,
  DEFERRED_PERSISTENCE_TARGET_CLASSES,
  REJECTED_PERSISTENCE_TARGET_CLASSES,
  TARGET_DECISION_STATUSES,
  TARGET_DECISION_OUTCOMES,
  DEPENDENCY_STATUSES,
  SAFETY_BOUNDARY_RESULTS,
  type PersistenceTargetClass,
  type DeferredPersistenceTargetClass,
  type RejectedPersistenceTargetClass,
  type TargetDecisionStatus,
  type TargetDecisionOutcome,
  type DependencyStatus,
  type SafetyBoundaryResult,
} from "./types.ts"
import { isIsoUtcTimestamp } from "../shared/isoUtcTimestamp.ts"
import { isPhase6ForbiddenGrantField } from "../shared/forbiddenGrantFields.ts"

// ─── Stable issue codes ─────────────────────────────────────────

export const TARGET_DECISION_VALIDATION_ISSUE_CODES = [
  "invalid_record",
  "missing_required_field",
  "null_required_field",
  "invalid_field_type",
  "invalid_array",
  "invalid_enum_value",
  "invalid_timestamp",
  "invalid_sha256_hex",
  "unknown_field",
  "invalid_selected_target_class",
  "multiple_selected_targets_not_allowed",
  "missing_deferred_target_class",
  "unexpected_deferred_target_class",
  "missing_rejected_target_class",
  "unexpected_rejected_target_class",
  "safety_boundary_not_confirmed",
  "dependency_not_satisfied",
  "human_review_required",
  "no_go_flags_present",
  "forbidden_grant_field_present",
  "validation_exception",
] as const

export type TargetDecisionValidationIssueCode =
  (typeof TARGET_DECISION_VALIDATION_ISSUE_CODES)[number]

export type TargetDecisionValidationIssue = {
  readonly code: TargetDecisionValidationIssueCode
  readonly field: string
  /** Always `${code}:${field}` — never contains input values. */
  readonly message: string
}

export type TargetDecisionValidationResult = {
  readonly ok: boolean
  readonly issues: readonly TargetDecisionValidationIssue[]
}

function issue(
  code: TargetDecisionValidationIssueCode,
  field: string,
): TargetDecisionValidationIssue {
  return { code, field, message: `${code}:${field}` }
}

function resultOf(
  issues: readonly TargetDecisionValidationIssue[],
): TargetDecisionValidationResult {
  return { ok: issues.length === 0, issues }
}

// ─── Primitive predicates and exported type guards ──────────────

const SHA256_HEX = /^[0-9a-f]{64}$/

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}

export function isSha256Hex(value: unknown): value is string {
  return typeof value === "string" && SHA256_HEX.test(value)
}

export function isIsoTimestamp(value: unknown): value is string {
  return isIsoUtcTimestamp(value)
}

export function isPersistenceTargetClass(value: unknown): value is PersistenceTargetClass {
  return (
    typeof value === "string" &&
    (PERSISTENCE_TARGET_CLASSES as readonly string[]).includes(value)
  )
}

export function isDeferredPersistenceTargetClass(
  value: unknown,
): value is DeferredPersistenceTargetClass {
  return (
    typeof value === "string" &&
    (DEFERRED_PERSISTENCE_TARGET_CLASSES as readonly string[]).includes(value)
  )
}

export function isRejectedPersistenceTargetClass(
  value: unknown,
): value is RejectedPersistenceTargetClass {
  return (
    typeof value === "string" &&
    (REJECTED_PERSISTENCE_TARGET_CLASSES as readonly string[]).includes(value)
  )
}

export function isTargetDecisionStatus(value: unknown): value is TargetDecisionStatus {
  return (
    typeof value === "string" &&
    (TARGET_DECISION_STATUSES as readonly string[]).includes(value)
  )
}

export function isTargetDecisionOutcome(value: unknown): value is TargetDecisionOutcome {
  return (
    typeof value === "string" &&
    (TARGET_DECISION_OUTCOMES as readonly string[]).includes(value)
  )
}

export function isSafetyBoundaryResult(value: unknown): value is SafetyBoundaryResult {
  return (
    typeof value === "string" &&
    (SAFETY_BOUNDARY_RESULTS as readonly string[]).includes(value)
  )
}

export function isDependencyStatus(value: unknown): value is DependencyStatus {
  return (
    typeof value === "string" &&
    (DEPENDENCY_STATUSES as readonly string[]).includes(value)
  )
}

// Forbidden grant-like fields: the canonical shared Phase 6 denylist
// (P6-FIX-005, Issue #116) replaces this module's former 13-name local copy.

// ─── Declarative field specs for the plain fields ───────────────

type FieldSpec =
  | { readonly kind: "string" }
  | { readonly kind: "boolean" }
  | { readonly kind: "timestamp" }
  | { readonly kind: "sha256" }
  | { readonly kind: "stringArray" }
  | { readonly kind: "enum"; readonly values: readonly string[] }
  | { readonly kind: "safety" }
  | { readonly kind: "dependencyStatus" }
  /** boolean that must be true; failure reports dependency_not_satisfied. */
  | { readonly kind: "requiredTrueDependency" }
  /** boolean that must be true; failure reports human_review_required. */
  | { readonly kind: "humanReviewFlag" }

/** Ordered field spec (excludes the four specially-handled fields). */
const FIELD_SPECS: Readonly<Record<string, FieldSpec>> = {
  target_decision_record_id: { kind: "string" },
  tenant_id: { kind: "string" },
  target_decision_status: { kind: "enum", values: TARGET_DECISION_STATUSES },
  target_decision_outcome: { kind: "enum", values: TARGET_DECISION_OUTCOMES },
  // selected_target_class — special
  // deferred_target_classes — special
  // rejected_target_classes — special
  decision_rationale: { kind: "string" },
  selected_target_rationale: { kind: "string" },
  deferred_target_rationales: { kind: "stringArray" },
  rejected_target_rationales: { kind: "stringArray" },
  d1_deferral_rationale: { kind: "string" },
  sql_deferral_rationale: { kind: "string" },
  approvalstore_deferral_rationale: { kind: "string" },
  external_action_deferral_rationale: { kind: "string" },
  test_only_confirmed: { kind: "safety" },
  non_persistent_confirmed: { kind: "safety" },
  non_authorizing_confirmed: { kind: "safety" },
  app_runtime_untouched_confirmed: { kind: "safety" },
  d1_deferred_confirmed: { kind: "safety" },
  sql_deferred_confirmed: { kind: "safety" },
  approvalstore_unwired_confirmed: { kind: "safety" },
  external_actions_blocked_confirmed: { kind: "safety" },
  formal_workunit_promotion_blocked_confirmed: { kind: "safety" },
  p6_i5_merged: { kind: "requiredTrueDependency" },
  p6_i5_merge_commit: { kind: "string" },
  storage_gate_spec_available: { kind: "dependencyStatus" },
  persistence_gate_spec_available: { kind: "dependencyStatus" },
  persistence_record_contract_available: { kind: "dependencyStatus" },
  main_safety_gate_active: { kind: "requiredTrueDependency" },
  human_review_required: { kind: "humanReviewFlag" },
  reviewed_by_human_at: { kind: "timestamp" },
  reviewed_by_human_id: { kind: "string" },
  reviewer_role: { kind: "string" },
  review_rationale: { kind: "string" },
  next_slice: { kind: "string" },
  next_slice_scope: { kind: "string" },
  forbidden_next_slice_capabilities: { kind: "stringArray" },
  d1_gate_requirement: { kind: "string" },
  external_action_gate_requirement: { kind: "string" },
  approvalstore_gate_requirement: { kind: "string" },
  created_at: { kind: "timestamp" },
  payload_hash: { kind: "sha256" },
  // no_go_flags — special
}

const SPECIAL_FIELDS: readonly string[] = [
  "selected_target_class",
  "deferred_target_classes",
  "rejected_target_classes",
  "no_go_flags",
]

/** All allowed top-level field names (spec fields + special fields). */
const ALLOWED_FIELDS: readonly string[] = [...Object.keys(FIELD_SPECS), ...SPECIAL_FIELDS]

// ─── Presence helper (missing vs null vs value) ─────────────────

type Presence =
  | { readonly present: false }
  | { readonly present: true; readonly value: unknown }

function presenceOf(record: Record<string, unknown>, field: string): Presence {
  if (!Object.prototype.hasOwnProperty.call(record, field)) return { present: false }
  return { present: true, value: record[field] }
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((el) => typeof el === "string")
}

function validatePlainField(
  record: Record<string, unknown>,
  field: string,
  spec: FieldSpec,
): TargetDecisionValidationIssue[] {
  const presence = presenceOf(record, field)
  if (!presence.present) return [issue("missing_required_field", field)]
  if (presence.value === null) return [issue("null_required_field", field)]
  const value = presence.value

  switch (spec.kind) {
    case "string":
      if (Array.isArray(value) || typeof value !== "string") {
        return [issue("invalid_field_type", field)]
      }
      if (!isNonEmptyString(value)) return [issue("invalid_field_type", field)]
      return []
    case "boolean":
      if (typeof value !== "boolean") return [issue("invalid_field_type", field)]
      return []
    case "timestamp":
      if (!isIsoTimestamp(value)) return [issue("invalid_timestamp", field)]
      return []
    case "sha256":
      if (!isSha256Hex(value)) return [issue("invalid_sha256_hex", field)]
      return []
    case "stringArray":
      if (!Array.isArray(value)) return [issue("invalid_array", field)]
      if (!isStringArray(value)) return [issue("invalid_field_type", field)]
      return []
    case "enum":
      if (typeof value !== "string" || !spec.values.includes(value)) {
        return [issue("invalid_enum_value", field)]
      }
      return []
    case "safety": {
      if (!isSafetyBoundaryResult(value)) return [issue("invalid_enum_value", field)]
      if (value !== "confirmed") return [issue("safety_boundary_not_confirmed", field)]
      return []
    }
    case "dependencyStatus": {
      if (!isDependencyStatus(value)) return [issue("invalid_enum_value", field)]
      if (value !== "present") return [issue("dependency_not_satisfied", field)]
      return []
    }
    case "requiredTrueDependency":
      if (typeof value !== "boolean") return [issue("invalid_field_type", field)]
      if (value !== true) return [issue("dependency_not_satisfied", field)]
      return []
    case "humanReviewFlag":
      if (typeof value !== "boolean") return [issue("invalid_field_type", field)]
      if (value !== true) return [issue("human_review_required", field)]
      return []
  }
}

// ─── Special-field validators ───────────────────────────────────

function validateSelectedTargetClass(
  record: Record<string, unknown>,
): TargetDecisionValidationIssue[] {
  const field = "selected_target_class"
  const presence = presenceOf(record, field)
  if (!presence.present) return [issue("missing_required_field", field)]
  if (presence.value === null) return [issue("null_required_field", field)]
  const value = presence.value
  if (Array.isArray(value)) return [issue("multiple_selected_targets_not_allowed", field)]
  if (typeof value !== "string") return [issue("invalid_field_type", field)]
  // The one and only selectable class (P6-I5A). Any deferred/rejected class or
  // any other string is an invalid selected target.
  if (!isPersistenceTargetClass(value)) return [issue("invalid_selected_target_class", field)]
  return []
}

function validateExactSet(
  record: Record<string, unknown>,
  field: string,
  allowed: readonly string[],
  missingCode: TargetDecisionValidationIssueCode,
  unexpectedCode: TargetDecisionValidationIssueCode,
): TargetDecisionValidationIssue[] {
  const presence = presenceOf(record, field)
  if (!presence.present) return [issue("missing_required_field", field)]
  if (presence.value === null) return [issue("null_required_field", field)]
  const value = presence.value
  if (!Array.isArray(value)) return [issue("invalid_array", field)]
  const issues: TargetDecisionValidationIssue[] = []
  // Every element must be an allowed member of the set.
  for (const el of value) {
    if (typeof el !== "string" || !allowed.includes(el)) {
      issues.push(issue(unexpectedCode, field))
    }
  }
  // Every allowed member must appear exactly once.
  for (const member of allowed) {
    const count = value.filter((el) => el === member).length
    if (count !== 1) issues.push(issue(missingCode, field))
  }
  return issues
}

function validateNoGoFlags(
  record: Record<string, unknown>,
  statusValue: unknown,
): TargetDecisionValidationIssue[] {
  const field = "no_go_flags"
  const presence = presenceOf(record, field)
  if (!presence.present) return [issue("missing_required_field", field)]
  if (presence.value === null) return [issue("null_required_field", field)]
  const value = presence.value
  if (!Array.isArray(value)) return [issue("invalid_array", field)]
  if (value.length > 0 && statusValue !== "blocked_no_go") {
    return [issue("no_go_flags_present", field)]
  }
  return []
}

// ─── Public validator ───────────────────────────────────────────

export function validateTargetDecisionRecord(
  input: unknown,
): TargetDecisionValidationResult {
  try {
    if (!isRecordObject(input)) {
      return resultOf([issue("invalid_record", "(record)")])
    }
    // Single-read snapshot (getter-TOCTOU hardening): read every own enumerable
    // top-level property exactly once. All checks below read the snapshot only.
    const snapshot: Record<string, unknown> = {}
    for (const key of Object.keys(input)) {
      snapshot[key] = (input as Record<string, unknown>)[key]
    }

    const issues: TargetDecisionValidationIssue[] = []

    // Unknown / forbidden top-level fields.
    for (const key of Object.keys(snapshot)) {
      if (ALLOWED_FIELDS.includes(key)) continue
      if (isPhase6ForbiddenGrantField(key)) {
        issues.push(issue("forbidden_grant_field_present", key))
      } else {
        issues.push(issue("unknown_field", key))
      }
    }

    // Plain fields.
    for (const [field, spec] of Object.entries(FIELD_SPECS)) {
      issues.push(...validatePlainField(snapshot, field, spec))
    }

    // Special fields.
    issues.push(...validateSelectedTargetClass(snapshot))
    issues.push(
      ...validateExactSet(
        snapshot,
        "deferred_target_classes",
        DEFERRED_PERSISTENCE_TARGET_CLASSES,
        "missing_deferred_target_class",
        "unexpected_deferred_target_class",
      ),
    )
    issues.push(
      ...validateExactSet(
        snapshot,
        "rejected_target_classes",
        REJECTED_PERSISTENCE_TARGET_CLASSES,
        "missing_rejected_target_class",
        "unexpected_rejected_target_class",
      ),
    )
    issues.push(...validateNoGoFlags(snapshot, snapshot.target_decision_status))

    return resultOf(issues)
  } catch {
    return resultOf([issue("validation_exception", "(record)")])
  }
}
