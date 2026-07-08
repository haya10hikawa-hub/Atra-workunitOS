/**
 * P6-I5M: pure constructors for the Phase 6 Recorder Audit Summary Record
 * (docs/P6_I5M_PURE_RECORDER_AUDIT_SUMMARY_CONSTRUCTORS.md). Builds on the
 * P6-I5L RecorderAuditSummaryRecord type and validator.
 *
 * PURE, DETERMINISTIC, NON-AUTHORIZING. Each constructor:
 *   - takes a single-read snapshot of the caller input (getter-TOCTOU hardening);
 *   - uses caller-provided ids, timestamps, and payload hash; it generates none;
 *   - reads no clock and no randomness, and performs no I/O of any kind;
 *   - never mutates its input (known container fields are defensively copied);
 *   - fixes the recorder and selected target class to the single P6-I5A..L
 *     selection, so any caller override is ignored;
 *   - validates the produced record with the P6-I5L validator and returns a
 *     failure (never ok=true) when validation fails;
 *   - returns a structured result carrying no grant-like field.
 *
 * Constructor success is not truth, not approval, not execution permission, not
 * summary runtime, not summary emission, not audit runtime, not audit event
 * emission, not persistence, not durable storage, not Evidence Ledger append,
 * not Graph Model write, and not production readiness.
 */

import {
  RECORDER_AUDIT_TARGET_CLASSES,
  type RecorderAuditSummaryScope,
  type RecorderAuditOperationName,
  type RecorderAuditOperationCountKey,
  type RecorderAuditStatusCountKey,
  type RecorderAuditOutcomeCountKey,
  type RecorderAuditValidationResultCountKey,
  type RecorderAuditIssueCode,
  type RecorderAuditNoGoFlag,
  type RecorderAuditFixtureCoverage,
  type RecorderAuditCountMap,
  type RecorderAuditSummaryRecord,
  type IsoTimestamp,
  type Sha256Hex,
} from "./types.ts"
import { validateRecorderAuditSummaryRecord } from "./validators.ts"
import {
  type RecorderAuditSummaryConstructionResult,
  recorderAuditSummaryConstructorIssue,
  okRecorderAuditSummaryConstruction,
  failRecorderAuditSummaryConstruction,
} from "./construction.ts"

// ─── The one fixed recorder/selected target class ───────────────

const TARGET_CLASS = RECORDER_AUDIT_TARGET_CLASSES[0] // "in_memory_test_only_store"

// ─── Caller input shapes ────────────────────────────────────────

/** Fields the caller supplies; both target class fields are fixed by the constructor. */
export type CreateRecorderAuditSummaryRecordInput = {
  readonly summary_id: string
  readonly tenant_id: string
  readonly summary_scope: RecorderAuditSummaryScope
  readonly summarized_operation_names: readonly RecorderAuditOperationName[]
  readonly total_record_attempts: number
  readonly accepted_record_count: number
  readonly rejected_record_count: number
  readonly stored_event_count: number
  readonly returned_event_count: number
  readonly listed_event_count: number
  readonly cleared_event_count: number
  readonly not_found_count: number
  readonly validation_failed_count: number
  readonly tenant_mismatch_count: number
  readonly duplicate_conflict_count: number
  readonly idempotent_duplicate_count: number
  readonly forbidden_target_class_count: number
  readonly recorder_exception_count: number
  readonly operation_counts: RecorderAuditCountMap<RecorderAuditOperationCountKey>
  readonly status_counts: RecorderAuditCountMap<RecorderAuditStatusCountKey>
  readonly outcome_counts: RecorderAuditCountMap<RecorderAuditOutcomeCountKey>
  readonly validation_result_counts: RecorderAuditCountMap<RecorderAuditValidationResultCountKey>
  readonly issue_code_counts: RecorderAuditCountMap<RecorderAuditIssueCode>
  readonly no_go_flag_counts: RecorderAuditCountMap<RecorderAuditNoGoFlag>
  readonly fixture_coverage: RecorderAuditFixtureCoverage
  readonly tenant_scope_summary: string
  readonly deterministic_ordering_summary: string
  readonly defensive_snapshot_summary: string
  readonly non_durability_summary: string
  readonly clear_scope_summary: string
  readonly failure_summary: string
  readonly redaction_summary: string
  readonly source_loop: string
  readonly source_recorder_loop: string
  readonly source_fixture_loop: string
  readonly source_validator_loop: string
  readonly created_at: IsoTimestamp
  readonly payload_hash: Sha256Hex
  readonly non_authorization_statement: string
  readonly no_go_flags: readonly RecorderAuditNoGoFlag[]
}

/** Scope-specific inputs: summary_scope is fixed by the named constructor. */
export type CreateTenantRecorderAuditSummaryInput = Omit<
  CreateRecorderAuditSummaryRecordInput,
  "summary_scope"
>
export type CreateAllTestMemoryRecorderAuditSummaryInput = Omit<
  CreateRecorderAuditSummaryRecordInput,
  "summary_scope"
>
export type CreateOperationSubsetRecorderAuditSummaryInput = Omit<
  CreateRecorderAuditSummaryRecordInput,
  "summary_scope"
>
export type CreateFixtureSuiteRecorderAuditSummaryInput = Omit<
  CreateRecorderAuditSummaryRecordInput,
  "summary_scope"
>
/** Blocked-path input: the caller must supply a non-empty no_go_flags array. */
export type CreateBlockedRecorderAuditSummaryInput = CreateRecorderAuditSummaryRecordInput

// ─── Snapshot / copy / freeze helpers ───────────────────────────

function snapshot(input: unknown): Record<string, unknown> | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null
  const source = input as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(source)) {
    out[key] = source[key]
  }
  return out
}

/**
 * Known container fields are defensively shallow-copied so the constructed
 * record never shares mutable references with caller input, and freezing the
 * record never affects caller-owned objects.
 */
const CONTAINER_FIELDS: readonly string[] = [
  "summarized_operation_names",
  "operation_counts",
  "status_counts",
  "outcome_counts",
  "validation_result_counts",
  "issue_code_counts",
  "no_go_flag_counts",
  "fixture_coverage",
  "no_go_flags",
]

function copyContainers(record: Record<string, unknown>): void {
  for (const field of CONTAINER_FIELDS) {
    const value = record[field]
    if (Array.isArray(value)) {
      record[field] = [...value]
    } else if (typeof value === "object" && value !== null) {
      record[field] = { ...(value as Record<string, unknown>) }
    }
  }
}

function freeze(record: Record<string, unknown>): RecorderAuditSummaryRecord {
  for (const key of Object.keys(record)) {
    const value = record[key]
    if (typeof value === "object" && value !== null) Object.freeze(value)
  }
  return Object.freeze(record) as unknown as RecorderAuditSummaryRecord
}

// ─── Shared build: overlay fixed fields, validate, return ────────

function buildRecord(
  input: unknown,
  overrides: Record<string, unknown>,
): RecorderAuditSummaryConstructionResult {
  try {
    const snap = snapshot(input)
    if (snap === null) {
      return failRecorderAuditSummaryConstruction([
        recorderAuditSummaryConstructorIssue("invalid_constructor_input", "(input)"),
      ])
    }
    // Start from a copy of the snapshot so genuinely-unknown caller keys (typos,
    // grant-like fields, raw payload, secret-like fields) flow through to the
    // validator and fail closed there. Scope overrides and the fixed target
    // class fields always win.
    const record: Record<string, unknown> = {
      ...snap,
      ...overrides,
      recorder_target_class: TARGET_CLASS,
      selected_target_class: TARGET_CLASS,
    }
    copyContainers(record)

    const validation = validateRecorderAuditSummaryRecord(record)
    if (!validation.ok) {
      return failRecorderAuditSummaryConstruction(
        validation.issues.map((vi) =>
          recorderAuditSummaryConstructorIssue("validation_failed", vi.field),
        ),
      )
    }
    return okRecorderAuditSummaryConstruction(freeze(record))
  } catch {
    return failRecorderAuditSummaryConstruction([
      recorderAuditSummaryConstructorIssue("constructor_exception", "(record)"),
    ])
  }
}

// ─── Generic constructor ────────────────────────────────────────

export function createRecorderAuditSummaryRecord(
  input: CreateRecorderAuditSummaryRecordInput,
): RecorderAuditSummaryConstructionResult {
  return buildRecord(input, {})
}

// ─── Scope-specific constructors ────────────────────────────────

export function createTenantRecorderAuditSummary(
  input: CreateTenantRecorderAuditSummaryInput,
): RecorderAuditSummaryConstructionResult {
  return buildRecord(input, { summary_scope: "tenant" })
}

export function createAllTestMemoryRecorderAuditSummary(
  input: CreateAllTestMemoryRecorderAuditSummaryInput,
): RecorderAuditSummaryConstructionResult {
  const snap = snapshot(input)
  if (snap === null) {
    return failRecorderAuditSummaryConstruction([
      recorderAuditSummaryConstructorIssue("invalid_constructor_input", "(input)"),
    ])
  }
  const clearScopeSummary = snap.clear_scope_summary
  if (typeof clearScopeSummary !== "string" || !clearScopeSummary.includes("all_test_memory")) {
    return failRecorderAuditSummaryConstruction([
      recorderAuditSummaryConstructorIssue("invalid_constructor_input", "clear_scope_summary"),
    ])
  }
  const nonDurabilitySummary = snap.non_durability_summary
  if (
    typeof nonDurabilitySummary !== "string" ||
    (!nonDurabilitySummary.includes("test-only") && !nonDurabilitySummary.includes("non-durable"))
  ) {
    return failRecorderAuditSummaryConstruction([
      recorderAuditSummaryConstructorIssue("invalid_constructor_input", "non_durability_summary"),
    ])
  }
  return buildRecord(input, { summary_scope: "all_test_memory" })
}

export function createOperationSubsetRecorderAuditSummary(
  input: CreateOperationSubsetRecorderAuditSummaryInput,
): RecorderAuditSummaryConstructionResult {
  return buildRecord(input, { summary_scope: "operation_subset" })
}

export function createFixtureSuiteRecorderAuditSummary(
  input: CreateFixtureSuiteRecorderAuditSummaryInput,
): RecorderAuditSummaryConstructionResult {
  return buildRecord(input, { summary_scope: "fixture_suite" })
}

// ─── Blocked constructor ────────────────────────────────────────

export function createBlockedRecorderAuditSummary(
  input: CreateBlockedRecorderAuditSummaryInput,
): RecorderAuditSummaryConstructionResult {
  const snap = snapshot(input)
  if (snap === null) {
    return failRecorderAuditSummaryConstruction([
      recorderAuditSummaryConstructorIssue("invalid_constructor_input", "(input)"),
    ])
  }
  const flags = snap.no_go_flags
  if (!Array.isArray(flags) || flags.length === 0) {
    return failRecorderAuditSummaryConstruction([
      recorderAuditSummaryConstructorIssue("invalid_constructor_input", "no_go_flags"),
    ])
  }
  const statusCounts = snap.status_counts as Record<string, unknown> | null | undefined
  const outcomeCounts = snap.outcome_counts as Record<string, unknown> | null | undefined
  const blockedNoGo =
    statusCounts !== null && typeof statusCounts === "object" ? statusCounts.blocked_no_go : undefined
  const noGo =
    outcomeCounts !== null && typeof outcomeCounts === "object" ? outcomeCounts.no_go : undefined
  const hasBlockedEvidence =
    (typeof blockedNoGo === "number" && blockedNoGo > 0) || (typeof noGo === "number" && noGo > 0)
  if (!hasBlockedEvidence) {
    return failRecorderAuditSummaryConstruction([
      recorderAuditSummaryConstructorIssue("invalid_constructor_input", "status_counts"),
    ])
  }
  // Preserves caller-provided failure and issue counts; validation still runs.
  return buildRecord(input, {})
}
