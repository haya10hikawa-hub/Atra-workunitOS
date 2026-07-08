/**
 * P6-I5L: fail-closed, non-authorizing validators for the Phase 6 Recorder
 * Audit Summary Record (docs/P6_I5L_RECORDER_AUDIT_SUMMARY_TYPES_VALIDATORS.md,
 * grounded in docs/P6_I5K_RECORDER_AUDIT_SUMMARY_SPEC.md and
 * docs/P6_I5K_RECORDER_AUDIT_SUMMARY_CONTRACT.md).
 *
 * NON-AUTHORIZING BY CONSTRUCTION. validateRecorderAuditSummaryRecord accepts
 * unknown input, never throws for normal invalid input (a defensive catch maps
 * unexpected failures to `validation_exception`), never mutates its input,
 * performs no I/O of any kind, and returns only { ok, issues }. Validation pass
 * is not truth, not approval, not execution permission, not summary runtime,
 * not audit runtime, not audit event emission, not persistence, not durable
 * storage, not Evidence Ledger append, not Graph Model write, and not
 * production readiness.
 *
 * Issue messages are `${code}:${field}` only — they never echo input values, so
 * secret-like values cannot leak through validation output.
 *
 * Getter-TOCTOU hardening: every own enumerable top-level property is read
 * exactly once into a plain snapshot; every check reads the snapshot only. The
 * input itself is never mutated.
 *
 * This module imports only its sibling ./types.ts (inert types and value
 * lists). It imports nothing from app runtime, app/lib/persistence,
 * app/lib/phase6/persistenceAuditEvidence, app/lib/phase6/
 * persistenceTargetDecision, app/lib/phase6/artifacts, app/lib/security/
 * approvalMac, test fixtures, test harnesses, database clients,
 * query-language execution, approval-store, external action clients, or model
 * providers.
 */

import {
  RECORDER_AUDIT_TARGET_CLASSES,
  RECORDER_AUDIT_SUMMARY_SCOPES,
  RECORDER_AUDIT_OPERATION_NAMES,
  RECORDER_AUDIT_OPERATION_COUNT_KEYS,
  RECORDER_AUDIT_STATUS_COUNT_KEYS,
  RECORDER_AUDIT_OUTCOME_COUNT_KEYS,
  RECORDER_AUDIT_VALIDATION_RESULT_COUNT_KEYS,
  RECORDER_AUDIT_ISSUE_CODES,
  RECORDER_AUDIT_NO_GO_FLAGS,
  RECORDER_AUDIT_FIXTURE_COVERAGE_FIELDS,
  type RecorderAuditSummaryScope,
  type RecorderAuditOperationName,
  type RecorderAuditOperationCountKey,
  type RecorderAuditStatusCountKey,
  type RecorderAuditOutcomeCountKey,
  type RecorderAuditValidationResultCountKey,
  type RecorderAuditIssueCode,
  type RecorderAuditNoGoFlag,
} from "./types.ts"

// ─── Stable issue codes ─────────────────────────────────────────

export const RECORDER_AUDIT_SUMMARY_VALIDATION_ISSUE_CODES = [
  "invalid_summary",
  "missing_required_field",
  "null_required_field",
  "invalid_field_type",
  "invalid_array",
  "invalid_enum_value",
  "invalid_timestamp",
  "invalid_sha256_hex",
  "invalid_count",
  "invalid_count_map",
  "missing_count_key",
  "unknown_count_key",
  "unknown_field",
  "invalid_recorder_target_class",
  "invalid_selected_target_class",
  "invalid_summary_scope",
  "invalid_operation_name",
  "invalid_operation_count_key",
  "invalid_status_count_key",
  "invalid_outcome_count_key",
  "invalid_validation_result_count_key",
  "invalid_issue_code",
  "invalid_no_go_flag",
  "invalid_fixture_coverage",
  "invalid_non_authorization_statement",
  "no_go_flags_present",
  "forbidden_grant_field_present",
  "raw_event_payload_field_present",
  "secret_like_echo_field_present",
  "invalid_count_consistency",
  "duplicate_conflict_not_fail_closed",
  "clear_all_treated_as_production_capability",
  "fixture_suite_incomplete",
  "summary_runtime_claimed",
  "audit_event_emission_claimed",
  "persistence_claimed",
  "durable_storage_claimed",
  "ledger_append_claimed",
  "graph_write_claimed",
  "validation_exception",
] as const

export type RecorderAuditSummaryValidationIssueCode =
  (typeof RECORDER_AUDIT_SUMMARY_VALIDATION_ISSUE_CODES)[number]

export type RecorderAuditSummaryValidationIssue = {
  readonly code: RecorderAuditSummaryValidationIssueCode
  readonly field: string
  /** Always `${code}:${field}` — never contains input values. */
  readonly message: string
}

export type RecorderAuditSummaryValidationResult = {
  readonly ok: boolean
  readonly issues: readonly RecorderAuditSummaryValidationIssue[]
}

function issue(
  code: RecorderAuditSummaryValidationIssueCode,
  field: string,
): RecorderAuditSummaryValidationIssue {
  return { code, field, message: `${code}:${field}` }
}

function resultOf(
  issues: readonly RecorderAuditSummaryValidationIssue[],
): RecorderAuditSummaryValidationResult {
  return { ok: issues.length === 0, issues }
}

// ─── Primitive predicates and exported type guards ──────────────

const SHA256_HEX = /^[0-9a-f]{64}$/
const ISO_8601_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}

function inSet(list: readonly string[], value: unknown): boolean {
  return typeof value === "string" && list.includes(value)
}

function isNonNegativeSafeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
}

export function isSha256Hex(value: unknown): value is string {
  return typeof value === "string" && SHA256_HEX.test(value)
}

export function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && ISO_8601_UTC.test(value)
}

export function isRecorderAuditSummaryScope(value: unknown): value is RecorderAuditSummaryScope {
  return inSet(RECORDER_AUDIT_SUMMARY_SCOPES, value)
}

export function isRecorderAuditOperationName(value: unknown): value is RecorderAuditOperationName {
  return inSet(RECORDER_AUDIT_OPERATION_NAMES, value)
}

export function isRecorderAuditOperationCountKey(
  value: unknown,
): value is RecorderAuditOperationCountKey {
  return inSet(RECORDER_AUDIT_OPERATION_COUNT_KEYS, value)
}

export function isRecorderAuditStatusCountKey(value: unknown): value is RecorderAuditStatusCountKey {
  return inSet(RECORDER_AUDIT_STATUS_COUNT_KEYS, value)
}

export function isRecorderAuditOutcomeCountKey(
  value: unknown,
): value is RecorderAuditOutcomeCountKey {
  return inSet(RECORDER_AUDIT_OUTCOME_COUNT_KEYS, value)
}

export function isRecorderAuditValidationResultCountKey(
  value: unknown,
): value is RecorderAuditValidationResultCountKey {
  return inSet(RECORDER_AUDIT_VALIDATION_RESULT_COUNT_KEYS, value)
}

export function isRecorderAuditIssueCode(value: unknown): value is RecorderAuditIssueCode {
  return inSet(RECORDER_AUDIT_ISSUE_CODES, value)
}

export function isRecorderAuditNoGoFlag(value: unknown): value is RecorderAuditNoGoFlag {
  return inSet(RECORDER_AUDIT_NO_GO_FLAGS, value)
}

// ─── Forbidden / raw-payload / secret-like field name sets ──────

const FORBIDDEN_GRANT_FIELDS: readonly string[] = [
  "approval",
  "approved",
  "authorized",
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
  "summary_runtime_permission",
  "audit_emission_permission",
  "starthub_execution_permission",
]

const RAW_EVENT_PAYLOAD_FIELDS: readonly string[] = [
  "raw_payload",
  "record_payload",
  "raw_record",
  "raw_record_payload",
  "payload",
  "record",
  "raw_event_payload",
  "raw_events",
  "event_payload",
  "raw_audit_event",
  "raw_audit_events",
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
  "not summary runtime",
  "not audit runtime",
  "not audit event emission",
  "not persistence",
  "not durable storage",
  "not Evidence Ledger append",
  "not Graph Model write",
  "not production readiness",
]

/** Free-text phrases that would claim a runtime capability the summary cannot have. */
const CLAIM_PHRASES: readonly (readonly [string, RecorderAuditSummaryValidationIssueCode])[] = [
  ["summary runtime implemented", "summary_runtime_claimed"],
  ["summary runtime is running", "summary_runtime_claimed"],
  ["audit event emitted", "audit_event_emission_claimed"],
  ["emitted an audit event", "audit_event_emission_claimed"],
  ["persisted to storage", "persistence_claimed"],
  ["persistence implemented", "persistence_claimed"],
  ["durably persisted", "persistence_claimed"],
  ["durable storage implemented", "durable_storage_claimed"],
  ["written to durable storage", "durable_storage_claimed"],
  ["evidence ledger appended", "ledger_append_claimed"],
  ["appended to evidence ledger", "ledger_append_claimed"],
  ["graph model written", "graph_write_claimed"],
  ["wrote to graph model", "graph_write_claimed"],
]

const CLAIM_SCAN_FIELDS: readonly string[] = [
  "tenant_scope_summary",
  "deterministic_ordering_summary",
  "defensive_snapshot_summary",
  "non_durability_summary",
  "clear_scope_summary",
  "failure_summary",
  "redaction_summary",
]

// ─── Field specs ────────────────────────────────────────────────

type FieldSpec =
  | { readonly kind: "string" }
  | { readonly kind: "timestamp" }
  | { readonly kind: "sha256" }
  | { readonly kind: "count" }
  | { readonly kind: "operationNamesArray" }
  | { readonly kind: "noGoFlagsArray" }
  | {
      readonly kind: "targetClass"
      readonly code: "invalid_recorder_target_class" | "invalid_selected_target_class"
    }
  | { readonly kind: "summaryScope" }
  | {
      readonly kind: "countMap"
      readonly keys: readonly string[]
      readonly invalidKeyCode: RecorderAuditSummaryValidationIssueCode
    }
  | { readonly kind: "fixtureCoverage" }
  | { readonly kind: "nonAuthStatement" }

const FIELD_SPECS: Readonly<Record<string, FieldSpec>> = {
  summary_id: { kind: "string" },
  tenant_id: { kind: "string" },
  recorder_target_class: { kind: "targetClass", code: "invalid_recorder_target_class" },
  selected_target_class: { kind: "targetClass", code: "invalid_selected_target_class" },
  summary_scope: { kind: "summaryScope" },
  summarized_operation_names: { kind: "operationNamesArray" },
  total_record_attempts: { kind: "count" },
  accepted_record_count: { kind: "count" },
  rejected_record_count: { kind: "count" },
  stored_event_count: { kind: "count" },
  returned_event_count: { kind: "count" },
  listed_event_count: { kind: "count" },
  cleared_event_count: { kind: "count" },
  not_found_count: { kind: "count" },
  validation_failed_count: { kind: "count" },
  tenant_mismatch_count: { kind: "count" },
  duplicate_conflict_count: { kind: "count" },
  idempotent_duplicate_count: { kind: "count" },
  forbidden_target_class_count: { kind: "count" },
  recorder_exception_count: { kind: "count" },
  operation_counts: {
    kind: "countMap",
    keys: RECORDER_AUDIT_OPERATION_COUNT_KEYS,
    invalidKeyCode: "invalid_operation_count_key",
  },
  status_counts: {
    kind: "countMap",
    keys: RECORDER_AUDIT_STATUS_COUNT_KEYS,
    invalidKeyCode: "invalid_status_count_key",
  },
  outcome_counts: {
    kind: "countMap",
    keys: RECORDER_AUDIT_OUTCOME_COUNT_KEYS,
    invalidKeyCode: "invalid_outcome_count_key",
  },
  validation_result_counts: {
    kind: "countMap",
    keys: RECORDER_AUDIT_VALIDATION_RESULT_COUNT_KEYS,
    invalidKeyCode: "invalid_validation_result_count_key",
  },
  issue_code_counts: {
    kind: "countMap",
    keys: RECORDER_AUDIT_ISSUE_CODES,
    invalidKeyCode: "invalid_issue_code",
  },
  no_go_flag_counts: {
    kind: "countMap",
    keys: RECORDER_AUDIT_NO_GO_FLAGS,
    invalidKeyCode: "invalid_no_go_flag",
  },
  fixture_coverage: { kind: "fixtureCoverage" },
  tenant_scope_summary: { kind: "string" },
  deterministic_ordering_summary: { kind: "string" },
  defensive_snapshot_summary: { kind: "string" },
  non_durability_summary: { kind: "string" },
  clear_scope_summary: { kind: "string" },
  failure_summary: { kind: "string" },
  redaction_summary: { kind: "string" },
  source_loop: { kind: "string" },
  source_recorder_loop: { kind: "string" },
  source_fixture_loop: { kind: "string" },
  source_validator_loop: { kind: "string" },
  created_at: { kind: "timestamp" },
  payload_hash: { kind: "sha256" },
  non_authorization_statement: { kind: "nonAuthStatement" },
  no_go_flags: { kind: "noGoFlagsArray" },
}

const ALLOWED_FIELDS: readonly string[] = Object.keys(FIELD_SPECS)

// ─── Presence helper ────────────────────────────────────────────

type Presence = { readonly present: false } | { readonly present: true; readonly value: unknown }

function presenceOf(record: Record<string, unknown>, field: string): Presence {
  if (!Object.prototype.hasOwnProperty.call(record, field)) return { present: false }
  return { present: true, value: record[field] }
}

// ─── Count-map / fixture-coverage sub-validators ────────────────

function validateCountMap(
  topField: string,
  value: unknown,
  keys: readonly string[],
  invalidKeyCode: RecorderAuditSummaryValidationIssueCode,
): RecorderAuditSummaryValidationIssue[] {
  if (!isRecordObject(value)) return [issue("invalid_count_map", topField)]
  const issues: RecorderAuditSummaryValidationIssue[] = []
  const keySet = new Set(keys)
  for (const k of keys) {
    if (!Object.prototype.hasOwnProperty.call(value, k)) {
      issues.push(issue("missing_count_key", `${topField}.${k}`))
    }
  }
  for (const k of Object.keys(value)) {
    if (!keySet.has(k)) {
      issues.push(issue("unknown_count_key", `${topField}.${k}`))
      issues.push(issue(invalidKeyCode, `${topField}.${k}`))
      continue
    }
    if (!isNonNegativeSafeInt(value[k])) {
      issues.push(issue("invalid_count", `${topField}.${k}`))
    }
  }
  return issues
}

function validateFixtureCoverage(value: unknown): RecorderAuditSummaryValidationIssue[] {
  if (!isRecordObject(value)) return [issue("invalid_fixture_coverage", "fixture_coverage")]
  const issues: RecorderAuditSummaryValidationIssue[] = []
  const keySet = new Set(RECORDER_AUDIT_FIXTURE_COVERAGE_FIELDS as readonly string[])
  for (const k of RECORDER_AUDIT_FIXTURE_COVERAGE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(value, k)) {
      issues.push(issue("invalid_fixture_coverage", `fixture_coverage.${k}`))
    }
  }
  for (const k of Object.keys(value)) {
    if (!keySet.has(k)) {
      issues.push(issue("invalid_fixture_coverage", `fixture_coverage.${k}`))
      continue
    }
    if (typeof value[k] !== "boolean") {
      issues.push(issue("invalid_fixture_coverage", `fixture_coverage.${k}`))
    }
  }
  return issues
}

// ─── Per-field validation ────────────────────────────────────────

function validateField(
  snapshot: Record<string, unknown>,
  field: string,
  spec: FieldSpec,
): RecorderAuditSummaryValidationIssue[] {
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
    case "count":
      if (!isNonNegativeSafeInt(value)) return [issue("invalid_count", field)]
      return []
    case "operationNamesArray": {
      if (!Array.isArray(value) || value.length === 0) return [issue("invalid_array", field)]
      if (!value.every((el) => isRecorderAuditOperationName(el))) {
        return [issue("invalid_operation_name", field)]
      }
      return []
    }
    case "noGoFlagsArray": {
      if (!Array.isArray(value)) return [issue("invalid_array", field)]
      if (!value.every((el) => isRecorderAuditNoGoFlag(el))) {
        return [issue("invalid_no_go_flag", field)]
      }
      return []
    }
    case "targetClass":
      if (
        typeof value !== "string" ||
        !(RECORDER_AUDIT_TARGET_CLASSES as readonly string[]).includes(value)
      ) {
        return [issue(spec.code, field)]
      }
      return []
    case "summaryScope":
      if (!isRecorderAuditSummaryScope(value)) return [issue("invalid_summary_scope", field)]
      return []
    case "countMap":
      return validateCountMap(field, value, spec.keys, spec.invalidKeyCode)
    case "fixtureCoverage":
      return validateFixtureCoverage(value)
    case "nonAuthStatement": {
      if (!isNonEmptyString(value)) return [issue("invalid_field_type", field)]
      for (const phrase of NON_AUTHORIZATION_REQUIRED_PHRASES) {
        if (!value.includes(phrase)) return [issue("invalid_non_authorization_statement", field)]
      }
      return []
    }
  }
}

// ─── Cross-field / scope-specific / consistency rules ───────────

function validateSummaryScopeSpecific(
  snapshot: Record<string, unknown>,
): RecorderAuditSummaryValidationIssue[] {
  const issues: RecorderAuditSummaryValidationIssue[] = []
  const scope = snapshot.summary_scope
  const opNames = Array.isArray(snapshot.summarized_operation_names)
    ? snapshot.summarized_operation_names
    : []

  if (scope === "tenant") {
    const clearScopeSummary = snapshot.clear_scope_summary
    if (
      typeof clearScopeSummary === "string" &&
      clearScopeSummary.includes("all_test_memory") &&
      !opNames.includes("clearAllAuditEvents")
    ) {
      issues.push(issue("invalid_count_consistency", "clear_scope_summary"))
    }
  }

  if (scope === "fixture_suite") {
    const fc = snapshot.fixture_coverage
    const allCovered =
      isRecordObject(fc) &&
      RECORDER_AUDIT_FIXTURE_COVERAGE_FIELDS.every((k) => fc[k] === true)
    if (!allCovered) issues.push(issue("fixture_suite_incomplete", "fixture_coverage"))
  }

  return issues
}

function validateClearAllRule(
  snapshot: Record<string, unknown>,
): RecorderAuditSummaryValidationIssue[] {
  const opCounts = snapshot.operation_counts
  const clearAllCount = isRecordObject(opCounts) ? opCounts.clear_all : undefined
  if (typeof clearAllCount !== "number" || clearAllCount <= 0) return []

  const clearScopeSummary = snapshot.clear_scope_summary
  const nonDurabilitySummary = snapshot.non_durability_summary
  const mentionsAllTestMemory =
    typeof clearScopeSummary === "string" && clearScopeSummary.includes("all_test_memory")
  const mentionsNonDurable =
    typeof nonDurabilitySummary === "string" &&
    (nonDurabilitySummary.includes("test-only") || nonDurabilitySummary.includes("non-durable"))

  if (!mentionsAllTestMemory || !mentionsNonDurable) {
    return [issue("clear_all_treated_as_production_capability", "clear_scope_summary")]
  }
  return []
}

function validateCountConsistency(
  snapshot: Record<string, unknown>,
): RecorderAuditSummaryValidationIssue[] {
  const issues: RecorderAuditSummaryValidationIssue[] = []

  const totalAttempts = snapshot.total_record_attempts
  const accepted = snapshot.accepted_record_count
  const rejected = snapshot.rejected_record_count
  const stored = snapshot.stored_event_count
  const returned = snapshot.returned_event_count
  const notFound = snapshot.not_found_count
  const dup = snapshot.duplicate_conflict_count
  const tenantMismatch = snapshot.tenant_mismatch_count
  const validationFailed = snapshot.validation_failed_count
  const forbiddenTargetClass = snapshot.forbidden_target_class_count
  const idempotentDup = snapshot.idempotent_duplicate_count
  const opCounts = snapshot.operation_counts
  const statusCounts = snapshot.status_counts
  const outcomeCounts = snapshot.outcome_counts
  const scope = snapshot.summary_scope

  const scalars = [
    totalAttempts,
    accepted,
    rejected,
    stored,
    returned,
    notFound,
    dup,
    tenantMismatch,
    validationFailed,
    forbiddenTargetClass,
    idempotentDup,
  ]
  const scalarsValid = scalars.every((n) => isNonNegativeSafeInt(n))
  if (!scalarsValid || !isRecordObject(opCounts) || !isRecordObject(statusCounts) || !isRecordObject(outcomeCounts)) {
    // Per-field checks already reported the underlying shape problem.
    return issues
  }

  if ((totalAttempts as number) < (accepted as number) + (rejected as number)) {
    issues.push(issue("invalid_count_consistency", "total_record_attempts"))
  }
  if ((scope === "tenant" || scope === "fixture_suite") && (accepted as number) < (stored as number)) {
    issues.push(issue("invalid_count_consistency", "stored_event_count"))
  }
  if ((dup as number) > (rejected as number)) {
    issues.push(issue("invalid_count_consistency", "duplicate_conflict_count"))
  }
  if ((tenantMismatch as number) > (rejected as number)) {
    issues.push(issue("invalid_count_consistency", "tenant_mismatch_count"))
  }
  if ((validationFailed as number) > (rejected as number)) {
    issues.push(issue("invalid_count_consistency", "validation_failed_count"))
  }
  if ((forbiddenTargetClass as number) > (rejected as number)) {
    issues.push(issue("invalid_count_consistency", "forbidden_target_class_count"))
  }
  if ((idempotentDup as number) > (totalAttempts as number)) {
    issues.push(issue("invalid_count_consistency", "idempotent_duplicate_count"))
  }

  const recordCount = opCounts.record
  if (isNonNegativeSafeInt(recordCount) && recordCount < (totalAttempts as number)) {
    issues.push(issue("invalid_count_consistency", "operation_counts.record"))
  }

  const statusAccepted = statusCounts.accepted
  if (isNonNegativeSafeInt(statusAccepted) && statusAccepted < (accepted as number)) {
    issues.push(issue("invalid_count_consistency", "status_counts.accepted"))
  }
  const statusRejected = statusCounts.rejected
  if (isNonNegativeSafeInt(statusRejected) && statusRejected < (rejected as number)) {
    issues.push(issue("invalid_count_consistency", "status_counts.rejected"))
  }
  const statusNotFound = statusCounts.not_found
  if (isNonNegativeSafeInt(statusNotFound)) {
    if (statusNotFound < (notFound as number)) {
      issues.push(issue("invalid_count_consistency", "status_counts.not_found"))
    }
    if ((notFound as number) > (returned as number) + statusNotFound) {
      issues.push(issue("invalid_count_consistency", "not_found_count"))
    }
  }

  const outcomeFail = outcomeCounts.fail
  const outcomeNoGo = outcomeCounts.no_go
  const hasFailEvidence =
    (isNonNegativeSafeInt(outcomeFail) && outcomeFail > 0) ||
    (isNonNegativeSafeInt(outcomeNoGo) && outcomeNoGo > 0)

  if ((dup as number) > 0 && !hasFailEvidence) {
    issues.push(issue("duplicate_conflict_not_fail_closed", "outcome_counts"))
  }
  if ((tenantMismatch as number) > 0 && !hasFailEvidence) {
    issues.push(issue("invalid_count_consistency", "outcome_counts"))
  }
  if ((validationFailed as number) > 0 && !hasFailEvidence) {
    issues.push(issue("invalid_count_consistency", "outcome_counts"))
  }
  if ((forbiddenTargetClass as number) > 0 && !hasFailEvidence) {
    issues.push(issue("invalid_count_consistency", "outcome_counts"))
  }

  return issues
}

function validateNoGoFlagsPolicy(
  snapshot: Record<string, unknown>,
): RecorderAuditSummaryValidationIssue[] {
  const flags = snapshot.no_go_flags
  if (!Array.isArray(flags) || flags.length === 0) return []
  const statusCounts = snapshot.status_counts
  const outcomeCounts = snapshot.outcome_counts
  const blockedNoGo = isRecordObject(statusCounts) ? statusCounts.blocked_no_go : undefined
  const noGo = isRecordObject(outcomeCounts) ? outcomeCounts.no_go : undefined
  if (
    (isNonNegativeSafeInt(blockedNoGo) && blockedNoGo > 0) ||
    (isNonNegativeSafeInt(noGo) && noGo > 0)
  ) {
    return []
  }
  return [issue("no_go_flags_present", "no_go_flags")]
}

function validateRedactionRule(
  snapshot: Record<string, unknown>,
): RecorderAuditSummaryValidationIssue[] {
  const redactionSummary = snapshot.redaction_summary
  if (typeof redactionSummary !== "string") return []
  const issues: RecorderAuditSummaryValidationIssue[] = []
  const lower = redactionSummary.toLowerCase()
  if (
    lower.includes("raw payload echo allowed") ||
    lower.includes("raw event payload allowed") ||
    lower.includes("raw events allowed")
  ) {
    issues.push(issue("raw_event_payload_field_present", "redaction_summary"))
  }
  if (
    lower.includes("secret-like value echo allowed") ||
    lower.includes("secret echo allowed") ||
    lower.includes("secret value allowed")
  ) {
    issues.push(issue("secret_like_echo_field_present", "redaction_summary"))
  }
  return issues
}

function validateClaimPhrases(
  snapshot: Record<string, unknown>,
): RecorderAuditSummaryValidationIssue[] {
  const issues: RecorderAuditSummaryValidationIssue[] = []
  for (const field of CLAIM_SCAN_FIELDS) {
    const value = snapshot[field]
    if (typeof value !== "string") continue
    const lower = value.toLowerCase()
    for (const [phrase, code] of CLAIM_PHRASES) {
      if (lower.includes(phrase)) issues.push(issue(code, field))
    }
  }
  return issues
}

// ─── Public validator ───────────────────────────────────────────

export function validateRecorderAuditSummaryRecord(
  input: unknown,
): RecorderAuditSummaryValidationResult {
  try {
    if (!isRecordObject(input)) {
      return resultOf([issue("invalid_summary", "(summary)")])
    }
    // Single-read snapshot (getter-TOCTOU hardening): read every own enumerable
    // top-level property exactly once. All checks below read the snapshot only.
    const snapshot: Record<string, unknown> = {}
    for (const key of Object.keys(input)) {
      snapshot[key] = (input as Record<string, unknown>)[key]
    }

    const issues: RecorderAuditSummaryValidationIssue[] = []

    // Unknown / forbidden / raw-payload / secret-like top-level fields.
    for (const key of Object.keys(snapshot)) {
      if (ALLOWED_FIELDS.includes(key)) continue
      if (FORBIDDEN_GRANT_FIELDS.includes(key)) {
        issues.push(issue("forbidden_grant_field_present", key))
      } else if (RAW_EVENT_PAYLOAD_FIELDS.includes(key)) {
        issues.push(issue("raw_event_payload_field_present", key))
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

    // Cross-field, scope-specific, and consistency checks.
    issues.push(...validateSummaryScopeSpecific(snapshot))
    issues.push(...validateClearAllRule(snapshot))
    issues.push(...validateCountConsistency(snapshot))
    issues.push(...validateNoGoFlagsPolicy(snapshot))
    issues.push(...validateRedactionRule(snapshot))
    issues.push(...validateClaimPhrases(snapshot))

    return resultOf(issues)
  } catch {
    return resultOf([issue("validation_exception", "(summary)")])
  }
}
