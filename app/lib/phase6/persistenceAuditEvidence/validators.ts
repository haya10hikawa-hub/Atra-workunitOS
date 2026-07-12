/**
 * P6-I5G: fail-closed, non-authorizing validators for the Phase 6 Persistence
 * Audit Event (docs/P6_I5G_PERSISTENCE_AUDIT_EVIDENCE_TYPES_VALIDATORS.md,
 * grounded in docs/P6_I5F_PERSISTENCE_AUDIT_EVENT_CONTRACT.md).
 *
 * NON-AUTHORIZING BY CONSTRUCTION. validatePersistenceAuditEvent accepts unknown
 * input, never throws for normal invalid input (a defensive catch maps
 * unexpected failures to `validation_exception`), never mutates its input,
 * performs no I/O of any kind, and returns only { ok, issues }. Validation pass
 * is not truth, not approval, not execution permission, not audit runtime, not
 * persistence, not durable storage, not Evidence Ledger append, not Graph Model
 * write, and not production readiness.
 *
 * Issue messages are `${code}:${field}` only — they never echo input values, so
 * secret-like values cannot leak through validation output.
 *
 * Getter-TOCTOU hardening: every own enumerable top-level property is read
 * exactly once into a plain snapshot; every check reads the snapshot only. The
 * input itself is never mutated.
 *
 * This module imports only its sibling ./types.ts (inert types and value
 * lists) and the pure shared Phase 6 leaf modules (../shared/*.ts).
 * It imports nothing from app runtime, app/lib/persistence,
 * app/lib/phase6/persistenceTargetDecision, app/lib/phase6/artifacts,
 * app/lib/security/approvalMac, test fixtures, test harnesses, database clients,
 * query-language execution, approval-store, external action clients, or model
 * providers.
 */

import {
  PERSISTENCE_AUDIT_TARGET_CLASSES,
  PERSISTENCE_AUDIT_OPERATIONS,
  PERSISTENCE_AUDIT_OPERATION_STATUSES,
  PERSISTENCE_AUDIT_OPERATION_OUTCOMES,
  PERSISTENCE_AUDIT_VALIDATION_RESULTS,
  PERSISTENCE_AUDIT_IDEMPOTENCY_RESULTS,
  PERSISTENCE_AUDIT_DUPLICATE_RESULTS,
  PERSISTENCE_AUDIT_TENANT_SCOPE_RESULTS,
  PERSISTENCE_AUDIT_DEFENSIVE_SNAPSHOT_RESULTS,
  PERSISTENCE_AUDIT_NON_DURABILITY_RESULTS,
  PERSISTENCE_AUDIT_CLEAR_SCOPES,
  PERSISTENCE_AUDIT_REDACTION_RESULTS,
  PERSISTENCE_AUDIT_SOURCE_LOOPS,
  PERSISTENCE_AUDIT_NO_GO_FLAGS,
  type PersistenceAuditOperation,
  type PersistenceAuditOperationStatus,
  type PersistenceAuditOperationOutcome,
  type PersistenceAuditValidationResult,
  type PersistenceAuditIdempotencyResult,
  type PersistenceAuditDuplicateResult,
  type PersistenceAuditTenantScopeResult,
  type PersistenceAuditDefensiveSnapshotResult,
  type PersistenceAuditNonDurabilityResult,
  type PersistenceAuditClearScope,
  type PersistenceAuditRedactionResult,
  type PersistenceAuditSourceLoop,
  type PersistenceAuditNoGoFlag,
} from "./types.ts"
import { isIsoUtcTimestamp } from "../shared/isoUtcTimestamp.ts"
import { isPhase6ForbiddenGrantField } from "../shared/forbiddenGrantFields.ts"

// ─── Stable issue codes ─────────────────────────────────────────

export const PERSISTENCE_AUDIT_EVENT_VALIDATION_ISSUE_CODES = [
  "invalid_event",
  "missing_required_field",
  "null_required_field",
  "invalid_field_type",
  "invalid_array",
  "invalid_enum_value",
  "invalid_timestamp",
  "invalid_sha256_hex",
  "invalid_record_count",
  "unknown_field",
  "invalid_adapter_target_class",
  "invalid_selected_target_class",
  "invalid_operation",
  "invalid_operation_status",
  "invalid_operation_outcome",
  "invalid_validation_result",
  "invalid_idempotency_result",
  "invalid_duplicate_result",
  "invalid_tenant_scope_result",
  "invalid_snapshot_result",
  "invalid_non_durability_result",
  "invalid_clear_scope",
  "invalid_redaction_result",
  "invalid_source_loop",
  "invalid_issue_code",
  "invalid_no_go_flag",
  "no_go_flags_present",
  "forbidden_grant_field_present",
  "raw_payload_field_present",
  "secret_like_echo_field_present",
  "missing_non_authorization_statement",
  "invalid_operation_specific_shape",
  "duplicate_conflict_not_fail_closed",
  "tenant_mismatch_not_fail_closed",
  "redaction_no_go_not_fail_closed",
  "validation_exception",
] as const

export type PersistenceAuditEventValidationIssueCode =
  (typeof PERSISTENCE_AUDIT_EVENT_VALIDATION_ISSUE_CODES)[number]

export type PersistenceAuditEventValidationIssue = {
  readonly code: PersistenceAuditEventValidationIssueCode
  readonly field: string
  /** Always `${code}:${field}` — never contains input values. */
  readonly message: string
}

export type PersistenceAuditEventValidationResult = {
  readonly ok: boolean
  readonly issues: readonly PersistenceAuditEventValidationIssue[]
}

function issue(
  code: PersistenceAuditEventValidationIssueCode,
  field: string,
): PersistenceAuditEventValidationIssue {
  return { code, field, message: `${code}:${field}` }
}

function resultOf(
  issues: readonly PersistenceAuditEventValidationIssue[],
): PersistenceAuditEventValidationResult {
  // P6-FIX-007b (Issue #121): completed, immutable runtime snapshot — clone and
  // freeze the issues array, then freeze the result object. Freezing grants
  // nothing.
  return Object.freeze({ ok: issues.length === 0, issues: Object.freeze([...issues]) })
}

// ─── Primitive predicates and exported type guards ──────────────

const SHA256_HEX = /^[0-9a-f]{64}$/

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}

function inSet(list: readonly string[], value: unknown): boolean {
  return typeof value === "string" && list.includes(value)
}

export function isSha256Hex(value: unknown): value is string {
  return typeof value === "string" && SHA256_HEX.test(value)
}

export function isIsoTimestamp(value: unknown): value is string {
  return isIsoUtcTimestamp(value)
}

export function isPersistenceAuditOperation(value: unknown): value is PersistenceAuditOperation {
  return inSet(PERSISTENCE_AUDIT_OPERATIONS, value)
}

export function isPersistenceAuditOperationStatus(
  value: unknown,
): value is PersistenceAuditOperationStatus {
  return inSet(PERSISTENCE_AUDIT_OPERATION_STATUSES, value)
}

export function isPersistenceAuditOperationOutcome(
  value: unknown,
): value is PersistenceAuditOperationOutcome {
  return inSet(PERSISTENCE_AUDIT_OPERATION_OUTCOMES, value)
}

export function isPersistenceAuditValidationResult(
  value: unknown,
): value is PersistenceAuditValidationResult {
  return inSet(PERSISTENCE_AUDIT_VALIDATION_RESULTS, value)
}

export function isPersistenceAuditIdempotencyResult(
  value: unknown,
): value is PersistenceAuditIdempotencyResult {
  return inSet(PERSISTENCE_AUDIT_IDEMPOTENCY_RESULTS, value)
}

export function isPersistenceAuditDuplicateResult(
  value: unknown,
): value is PersistenceAuditDuplicateResult {
  return inSet(PERSISTENCE_AUDIT_DUPLICATE_RESULTS, value)
}

export function isPersistenceAuditTenantScopeResult(
  value: unknown,
): value is PersistenceAuditTenantScopeResult {
  return inSet(PERSISTENCE_AUDIT_TENANT_SCOPE_RESULTS, value)
}

export function isPersistenceAuditDefensiveSnapshotResult(
  value: unknown,
): value is PersistenceAuditDefensiveSnapshotResult {
  return inSet(PERSISTENCE_AUDIT_DEFENSIVE_SNAPSHOT_RESULTS, value)
}

export function isPersistenceAuditNonDurabilityResult(
  value: unknown,
): value is PersistenceAuditNonDurabilityResult {
  return inSet(PERSISTENCE_AUDIT_NON_DURABILITY_RESULTS, value)
}

export function isPersistenceAuditClearScope(value: unknown): value is PersistenceAuditClearScope {
  return inSet(PERSISTENCE_AUDIT_CLEAR_SCOPES, value)
}

export function isPersistenceAuditRedactionResult(
  value: unknown,
): value is PersistenceAuditRedactionResult {
  return inSet(PERSISTENCE_AUDIT_REDACTION_RESULTS, value)
}

export function isPersistenceAuditSourceLoop(value: unknown): value is PersistenceAuditSourceLoop {
  return inSet(PERSISTENCE_AUDIT_SOURCE_LOOPS, value)
}

export function isPersistenceAuditNoGoFlag(value: unknown): value is PersistenceAuditNoGoFlag {
  return inSet(PERSISTENCE_AUDIT_NO_GO_FLAGS, value)
}

// ─── Forbidden / raw-payload / secret-like field name sets ──────

// Forbidden grant-like fields: the canonical shared Phase 6 denylist
// (P6-FIX-005, Issue #116) replaces this module's former 17-name local copy.

const RAW_PAYLOAD_FIELDS: readonly string[] = [
  "raw_payload",
  "record_payload",
  "raw_record",
  "raw_record_payload",
  "payload",
  "record",
]

const SECRET_LIKE_FIELDS: readonly string[] = [
  "secret",
  "secrets",
  "token",
  "api_key",
  "apikey",
  "password",
  "authorization_header",
  "raw_secret",
]

const NON_AUTHORIZATION_REQUIRED_PHRASES: readonly string[] = [
  "not approval",
  "not execution permission",
  "not persistence",
  "not durable storage",
  "not production readiness",
]

// ─── Field specs ────────────────────────────────────────────────

type FieldSpec =
  | { readonly kind: "string" }
  | { readonly kind: "timestamp" }
  | { readonly kind: "sha256" }
  | { readonly kind: "recordCount" }
  | { readonly kind: "stringArray" }
  | { readonly kind: "noGoFlags" }
  | { readonly kind: "targetClass"; readonly code: PersistenceAuditEventValidationIssueCode }
  | {
      readonly kind: "enum"
      readonly values: readonly string[]
      readonly code: PersistenceAuditEventValidationIssueCode
    }
  | { readonly kind: "nonAuthStatement" }

const FIELD_SPECS: Readonly<Record<string, FieldSpec>> = {
  audit_event_id: { kind: "string" },
  tenant_id: { kind: "string" },
  target_decision_record_id: { kind: "string" },
  operation: { kind: "enum", values: PERSISTENCE_AUDIT_OPERATIONS, code: "invalid_operation" },
  operation_status: {
    kind: "enum",
    values: PERSISTENCE_AUDIT_OPERATION_STATUSES,
    code: "invalid_operation_status",
  },
  operation_outcome: {
    kind: "enum",
    values: PERSISTENCE_AUDIT_OPERATION_OUTCOMES,
    code: "invalid_operation_outcome",
  },
  adapter_target_class: { kind: "targetClass", code: "invalid_adapter_target_class" },
  selected_target_class: { kind: "targetClass", code: "invalid_selected_target_class" },
  validation_result: {
    kind: "enum",
    values: PERSISTENCE_AUDIT_VALIDATION_RESULTS,
    code: "invalid_validation_result",
  },
  validator_issue_codes: { kind: "stringArray" },
  adapter_issue_codes: { kind: "stringArray" },
  idempotency_result: {
    kind: "enum",
    values: PERSISTENCE_AUDIT_IDEMPOTENCY_RESULTS,
    code: "invalid_idempotency_result",
  },
  duplicate_result: {
    kind: "enum",
    values: PERSISTENCE_AUDIT_DUPLICATE_RESULTS,
    code: "invalid_duplicate_result",
  },
  tenant_scope_result: {
    kind: "enum",
    values: PERSISTENCE_AUDIT_TENANT_SCOPE_RESULTS,
    code: "invalid_tenant_scope_result",
  },
  defensive_snapshot_result: {
    kind: "enum",
    values: PERSISTENCE_AUDIT_DEFENSIVE_SNAPSHOT_RESULTS,
    code: "invalid_snapshot_result",
  },
  non_durability_result: {
    kind: "enum",
    values: PERSISTENCE_AUDIT_NON_DURABILITY_RESULTS,
    code: "invalid_non_durability_result",
  },
  clear_scope: { kind: "enum", values: PERSISTENCE_AUDIT_CLEAR_SCOPES, code: "invalid_clear_scope" },
  record_count: { kind: "recordCount" },
  failure_reasons: { kind: "stringArray" },
  redaction_result: {
    kind: "enum",
    values: PERSISTENCE_AUDIT_REDACTION_RESULTS,
    code: "invalid_redaction_result",
  },
  source_loop: { kind: "enum", values: PERSISTENCE_AUDIT_SOURCE_LOOPS, code: "invalid_source_loop" },
  source_adapter_loop: { kind: "string" },
  source_fixture_loop: { kind: "string" },
  source_validator_loop: { kind: "string" },
  source_constructor_loop: { kind: "string" },
  source_target_decision_record_id: { kind: "string" },
  created_at: { kind: "timestamp" },
  payload_hash: { kind: "sha256" },
  non_authorization_statement: { kind: "nonAuthStatement" },
  no_go_flags: { kind: "noGoFlags" },
}

const ALLOWED_FIELDS: readonly string[] = Object.keys(FIELD_SPECS)

// ─── Presence helper ────────────────────────────────────────────

type Presence =
  | { readonly present: false }
  | { readonly present: true; readonly value: unknown }

function presenceOf(record: Record<string, unknown>, field: string): Presence {
  if (!Object.prototype.hasOwnProperty.call(record, field)) return { present: false }
  return { present: true, value: record[field] }
}

function isNonNegativeSafeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
}

function validateField(
  snapshot: Record<string, unknown>,
  field: string,
  spec: FieldSpec,
): PersistenceAuditEventValidationIssue[] {
  const presence = presenceOf(snapshot, field)
  if (!presence.present) return [issue("missing_required_field", field)]
  if (presence.value === null) return [issue("null_required_field", field)]
  const value = presence.value

  switch (spec.kind) {
    case "string":
      if (Array.isArray(value) || !isNonEmptyString(value)) {
        return [issue("invalid_field_type", field)]
      }
      return []
    case "timestamp":
      if (!isIsoTimestamp(value)) return [issue("invalid_timestamp", field)]
      return []
    case "sha256":
      if (!isSha256Hex(value)) return [issue("invalid_sha256_hex", field)]
      return []
    case "recordCount":
      if (!isNonNegativeSafeInt(value)) return [issue("invalid_record_count", field)]
      return []
    case "stringArray": {
      if (!Array.isArray(value)) return [issue("invalid_array", field)]
      if (!value.every((el) => typeof el === "string")) return [issue("invalid_issue_code", field)]
      return []
    }
    case "noGoFlags": {
      if (!Array.isArray(value)) return [issue("invalid_array", field)]
      if (!value.every((el) => isPersistenceAuditNoGoFlag(el))) {
        return [issue("invalid_no_go_flag", field)]
      }
      return []
    }
    case "targetClass":
      if (
        typeof value !== "string" ||
        !(PERSISTENCE_AUDIT_TARGET_CLASSES as readonly string[]).includes(value)
      ) {
        return [issue(spec.code, field)]
      }
      return []
    case "enum":
      if (typeof value !== "string" || !spec.values.includes(value)) {
        return [issue(spec.code, field)]
      }
      return []
    case "nonAuthStatement": {
      if (!isNonEmptyString(value)) return [issue("invalid_field_type", field)]
      for (const phrase of NON_AUTHORIZATION_REQUIRED_PHRASES) {
        if (!value.includes(phrase)) return [issue("missing_non_authorization_statement", field)]
      }
      return []
    }
  }
}

// ─── Cross-field / operation-specific rules ─────────────────────

function validateOperationSpecific(
  snapshot: Record<string, unknown>,
): PersistenceAuditEventValidationIssue[] {
  const issues: PersistenceAuditEventValidationIssue[] = []
  const operation = snapshot.operation
  const clearScope = snapshot.clear_scope
  const validationResult = snapshot.validation_result
  const recordCount = snapshot.record_count
  const outcome = snapshot.operation_outcome
  const nonDurability = snapshot.non_durability_result

  const zeroOrOne = recordCount === 0 || recordCount === 1

  switch (operation) {
    case "put":
      if (validationResult === "validator_not_applicable") {
        issues.push(issue("invalid_operation_specific_shape", "validation_result"))
      }
      if (clearScope !== "none") issues.push(issue("invalid_operation_specific_shape", "clear_scope"))
      if (!zeroOrOne) issues.push(issue("invalid_operation_specific_shape", "record_count"))
      break
    case "get":
      if (clearScope !== "none") issues.push(issue("invalid_operation_specific_shape", "clear_scope"))
      if (!zeroOrOne) issues.push(issue("invalid_operation_specific_shape", "record_count"))
      break
    case "list":
    case "count":
      if (clearScope !== "none") issues.push(issue("invalid_operation_specific_shape", "clear_scope"))
      break
    case "clear_tenant":
      if (clearScope !== "tenant_only") {
        issues.push(issue("invalid_operation_specific_shape", "clear_scope"))
      }
      break
    case "clear_all":
      if (clearScope !== "all_test_memory") {
        issues.push(issue("invalid_operation_specific_shape", "clear_scope"))
      }
      // A passing clear_all must positively confirm test-only non-durability.
      if (
        outcome === "pass" &&
        nonDurability !== "in_memory_only" &&
        nonDurability !== "not_durable" &&
        nonDurability !== "process_lifetime_only"
      ) {
        issues.push(issue("invalid_operation_specific_shape", "non_durability_result"))
      }
      break
  }
  return issues
}

function validateFailClosedRules(
  snapshot: Record<string, unknown>,
): PersistenceAuditEventValidationIssue[] {
  const issues: PersistenceAuditEventValidationIssue[] = []
  const outcome = snapshot.operation_outcome
  const failClosed = outcome === "fail" || outcome === "no_go"

  if (
    (snapshot.duplicate_result === "duplicate_conflict" ||
      snapshot.idempotency_result === "duplicate_conflict") &&
    !failClosed
  ) {
    issues.push(issue("duplicate_conflict_not_fail_closed", "operation_outcome"))
  }

  if (
    (snapshot.tenant_scope_result === "tenant_mismatch" ||
      snapshot.tenant_scope_result === "cross_tenant_blocked") &&
    !failClosed
  ) {
    issues.push(issue("tenant_mismatch_not_fail_closed", "operation_outcome"))
  }

  // redaction_no_go is itself a No-Go: it can never validate to ok=true, and the
  // only fail-closed shape is operation_outcome === no_go.
  if (snapshot.redaction_result === "redaction_no_go") {
    issues.push(issue("redaction_no_go_not_fail_closed", "redaction_result"))
  }

  return issues
}

function validateNoGoFlagsPolicy(
  snapshot: Record<string, unknown>,
): PersistenceAuditEventValidationIssue[] {
  const flags = snapshot.no_go_flags
  if (!Array.isArray(flags) || flags.length === 0) return []
  const status = snapshot.operation_status
  const outcome = snapshot.operation_outcome
  if (status === "blocked_no_go" || outcome === "no_go") return []
  return [issue("no_go_flags_present", "no_go_flags")]
}

// ─── Public validator ───────────────────────────────────────────

export function validatePersistenceAuditEvent(
  input: unknown,
): PersistenceAuditEventValidationResult {
  try {
    if (!isRecordObject(input)) {
      return resultOf([issue("invalid_event", "(event)")])
    }
    // Single-read snapshot (getter-TOCTOU hardening): read every own enumerable
    // top-level property exactly once. All checks below read the snapshot only.
    const snapshot: Record<string, unknown> = {}
    for (const key of Object.keys(input)) {
      snapshot[key] = (input as Record<string, unknown>)[key]
    }

    const issues: PersistenceAuditEventValidationIssue[] = []

    // Unknown / forbidden / raw-payload / secret-like top-level fields.
    for (const key of Object.keys(snapshot)) {
      if (ALLOWED_FIELDS.includes(key)) continue
      if (isPhase6ForbiddenGrantField(key)) {
        issues.push(issue("forbidden_grant_field_present", key))
      } else if (RAW_PAYLOAD_FIELDS.includes(key)) {
        issues.push(issue("raw_payload_field_present", key))
      } else if (SECRET_LIKE_FIELDS.includes(key)) {
        issues.push(issue("secret_like_echo_field_present", key))
      } else {
        issues.push(issue("unknown_field", key))
      }
    }

    // Per-field checks.
    for (const [field, spec] of Object.entries(FIELD_SPECS)) {
      issues.push(...validateField(snapshot, field, spec))
    }

    // Cross-field and operation-specific checks.
    issues.push(...validateOperationSpecific(snapshot))
    issues.push(...validateFailClosedRules(snapshot))
    issues.push(...validateNoGoFlagsPolicy(snapshot))

    return resultOf(issues)
  } catch {
    return resultOf([issue("validation_exception", "(event)")])
  }
}
