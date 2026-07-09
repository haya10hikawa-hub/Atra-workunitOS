/**
 * P6-I5N: deterministic, TEST-ONLY Phase 6 Recorder Audit Summary fixtures.
 *
 * This file builds five fixed RecorderAuditSummaryRecord objects — one per
 * summary scope (tenant, all_test_memory, operation_subset, fixture_suite)
 * plus one blocked no-go summary — through the P6-I5M pure constructors and
 * (transitively) the P6-I5L validator, from fully caller-provided, fixed
 * fixture data.
 *
 * It is NOT a summary runtime, NOT an emitter, NOT storage, and NOT a
 * recorder: it is a fixture. It reads no clock and no randomness, performs no
 * I/O of any kind, mutates no global state, and authorizes nothing. Fixture
 * validity is not truth, not approval, not execution permission, not audit
 * runtime, not persistence, not durable storage, and not production readiness.
 *
 * The only import is the Phase 6 Recorder Audit Summary module surface. The
 * capability and purity boundaries are described in
 * docs/P6_I5N_TEST_ONLY_RECORDER_AUDIT_SUMMARY_FIXTURE.md, not inside this
 * source.
 */

import {
  createTenantRecorderAuditSummary,
  createAllTestMemoryRecorderAuditSummary,
  createOperationSubsetRecorderAuditSummary,
  createFixtureSuiteRecorderAuditSummary,
  createBlockedRecorderAuditSummary,
  RECORDER_AUDIT_NO_GO_FLAGS,
  type CreateTenantRecorderAuditSummaryInput,
  type CreateAllTestMemoryRecorderAuditSummaryInput,
  type CreateOperationSubsetRecorderAuditSummaryInput,
  type CreateFixtureSuiteRecorderAuditSummaryInput,
  type CreateBlockedRecorderAuditSummaryInput,
  type RecorderAuditSummaryRecord,
  type RecorderAuditSummaryConstructionResult,
  type RecorderAuditNoGoFlag,
} from "../../../app/lib/phase6/recorderAuditSummary/index.ts"

// ─── Shared fixed fixture values ────────────────────────────────

const FIXED_TENANT_ID = "tenant_recorder_summary_fixture"
const FIXED_CREATED_AT = "2026-07-09T00:00:00Z"
const FIXED_NON_AUTH =
  "This summary is descriptive: it is not approval, not execution permission, not summary runtime, not audit runtime, not audit event emission, not persistence, not durable storage, not Evidence Ledger append, not Graph Model write, and not production readiness."

function zeroNoGoFlagCounts(): Readonly<Record<RecorderAuditNoGoFlag, number>> {
  const map = {} as Record<RecorderAuditNoGoFlag, number>
  for (const flag of RECORDER_AUDIT_NO_GO_FLAGS) map[flag] = 0
  return Object.freeze(map)
}

const ZERO_NO_GO_FLAG_COUNTS = zeroNoGoFlagCounts()

const ZERO_ISSUE_CODE_COUNTS = Object.freeze({
  invalid_input: 0,
  invalid_event: 0,
  validation_failed: 0,
  tenant_mismatch: 0,
  duplicate_conflict: 0,
  forbidden_target_class: 0,
  recorder_exception: 0,
  blocked_no_go: 0,
})

const ALL_FALSE_FIXTURE_COVERAGE = Object.freeze({
  put_fixture_covered: false,
  get_fixture_covered: false,
  list_fixture_covered: false,
  count_fixture_covered: false,
  clear_tenant_fixture_covered: false,
  clear_all_fixture_covered: false,
  blocked_no_go_fixture_covered: false,
  all_required_fixtures_covered: false,
})

const ALL_TRUE_FIXTURE_COVERAGE = Object.freeze({
  put_fixture_covered: true,
  get_fixture_covered: true,
  list_fixture_covered: true,
  count_fixture_covered: true,
  clear_tenant_fixture_covered: true,
  clear_all_fixture_covered: true,
  blocked_no_go_fixture_covered: true,
  all_required_fixtures_covered: true,
})

/** Common fixed lineage, summaries, and boundary fields shared by every fixture input. */
const COMMON = Object.freeze({
  tenant_id: FIXED_TENANT_ID,
  no_go_flag_counts: ZERO_NO_GO_FLAG_COUNTS,
  issue_code_counts: ZERO_ISSUE_CODE_COUNTS,
  fixture_coverage: ALL_FALSE_FIXTURE_COVERAGE,
  tenant_scope_summary:
    "tenant_recorder_summary_fixture scoped recorder summary; not tenant authorization.",
  deterministic_ordering_summary: "Events ordered by created_at then audit_event_id.",
  defensive_snapshot_summary: "Returned events are frozen snapshots; not persistence evidence.",
  non_durability_summary:
    "Recorder is in-memory only, process-lifetime-only, test-only; durability is not claimed.",
  clear_scope_summary: "No clear operation summarized in this record.",
  failure_summary: "No failures; stable issue codes only.",
  redaction_summary: "No raw payload echo; no secret-like value echo.",
  source_loop: "P6-I5N",
  source_recorder_loop: "P6-I5J",
  source_fixture_loop: "P6-I5N",
  source_validator_loop: "P6-I5L",
  created_at: FIXED_CREATED_AT,
  non_authorization_statement: FIXED_NON_AUTH,
  no_go_flags: Object.freeze([]) as readonly RecorderAuditNoGoFlag[],
})

// ─── Fixed deterministic fixture inputs ─────────────────────────

export const VALID_TENANT_RECORDER_AUDIT_SUMMARY_FIXTURE_INPUT: CreateTenantRecorderAuditSummaryInput =
  Object.freeze({
    ...COMMON,
    summary_id: "ras_tenant_fixture_001",
    summarized_operation_names: Object.freeze(["recordAuditEvent"]),
    total_record_attempts: 1,
    accepted_record_count: 1,
    rejected_record_count: 0,
    stored_event_count: 1,
    returned_event_count: 0,
    listed_event_count: 0,
    cleared_event_count: 0,
    not_found_count: 0,
    validation_failed_count: 0,
    tenant_mismatch_count: 0,
    duplicate_conflict_count: 0,
    idempotent_duplicate_count: 0,
    forbidden_target_class_count: 0,
    recorder_exception_count: 0,
    operation_counts: Object.freeze({ record: 1, get: 0, list: 0, count: 0, clear_tenant: 0, clear_all: 0 }),
    status_counts: Object.freeze({
      attempted: 1,
      accepted: 1,
      rejected: 0,
      not_found: 0,
      cleared: 0,
      blocked_no_go: 0,
    }),
    outcome_counts: Object.freeze({ pass: 1, warn: 0, fail: 0, no_go: 0 }),
    validation_result_counts: Object.freeze({
      validator_passed: 1,
      validator_failed: 0,
      validator_not_applicable: 0,
      validator_not_run_no_go: 0,
    }),
    payload_hash: "a".repeat(64),
  }) as CreateTenantRecorderAuditSummaryInput

export const VALID_ALL_TEST_MEMORY_RECORDER_AUDIT_SUMMARY_FIXTURE_INPUT: CreateAllTestMemoryRecorderAuditSummaryInput =
  Object.freeze({
    ...COMMON,
    summary_id: "ras_all_test_memory_fixture_001",
    tenant_id: "all_tenants_recorder_summary_fixture",
    summarized_operation_names: Object.freeze(["clearAllAuditEvents"]),
    total_record_attempts: 0,
    accepted_record_count: 0,
    rejected_record_count: 0,
    stored_event_count: 0,
    returned_event_count: 0,
    listed_event_count: 0,
    cleared_event_count: 3,
    not_found_count: 0,
    validation_failed_count: 0,
    tenant_mismatch_count: 0,
    duplicate_conflict_count: 0,
    idempotent_duplicate_count: 0,
    forbidden_target_class_count: 0,
    recorder_exception_count: 0,
    operation_counts: Object.freeze({ record: 0, get: 0, list: 0, count: 0, clear_tenant: 0, clear_all: 1 }),
    status_counts: Object.freeze({
      attempted: 1,
      accepted: 0,
      rejected: 0,
      not_found: 0,
      cleared: 1,
      blocked_no_go: 0,
    }),
    outcome_counts: Object.freeze({ pass: 1, warn: 0, fail: 0, no_go: 0 }),
    validation_result_counts: Object.freeze({
      validator_passed: 0,
      validator_failed: 0,
      validator_not_applicable: 1,
      validator_not_run_no_go: 0,
    }),
    clear_scope_summary:
      "clearAllAuditEvents cleared all_test_memory scope; test-only, non-durable.",
    payload_hash: "b".repeat(64),
  }) as CreateAllTestMemoryRecorderAuditSummaryInput

export const VALID_OPERATION_SUBSET_RECORDER_AUDIT_SUMMARY_FIXTURE_INPUT: CreateOperationSubsetRecorderAuditSummaryInput =
  Object.freeze({
    ...COMMON,
    summary_id: "ras_operation_subset_fixture_001",
    summarized_operation_names: Object.freeze(["getAuditEvent", "listAuditEvents"]),
    total_record_attempts: 0,
    accepted_record_count: 0,
    rejected_record_count: 0,
    stored_event_count: 0,
    returned_event_count: 2,
    listed_event_count: 3,
    cleared_event_count: 0,
    not_found_count: 0,
    validation_failed_count: 0,
    tenant_mismatch_count: 0,
    duplicate_conflict_count: 0,
    idempotent_duplicate_count: 0,
    forbidden_target_class_count: 0,
    recorder_exception_count: 0,
    operation_counts: Object.freeze({ record: 0, get: 2, list: 1, count: 0, clear_tenant: 0, clear_all: 0 }),
    status_counts: Object.freeze({
      attempted: 3,
      accepted: 0,
      rejected: 0,
      not_found: 0,
      cleared: 0,
      blocked_no_go: 0,
    }),
    outcome_counts: Object.freeze({ pass: 3, warn: 0, fail: 0, no_go: 0 }),
    validation_result_counts: Object.freeze({
      validator_passed: 0,
      validator_failed: 0,
      validator_not_applicable: 3,
      validator_not_run_no_go: 0,
    }),
    payload_hash: "c".repeat(64),
  }) as CreateOperationSubsetRecorderAuditSummaryInput

export const VALID_FIXTURE_SUITE_RECORDER_AUDIT_SUMMARY_FIXTURE_INPUT: CreateFixtureSuiteRecorderAuditSummaryInput =
  Object.freeze({
    ...COMMON,
    summary_id: "ras_fixture_suite_fixture_001",
    summarized_operation_names: Object.freeze([
      "recordAuditEvent",
      "getAuditEvent",
      "listAuditEvents",
      "countAuditEvents",
      "clearTenantAuditEvents",
      "clearAllAuditEvents",
    ]),
    total_record_attempts: 1,
    accepted_record_count: 1,
    rejected_record_count: 0,
    stored_event_count: 1,
    returned_event_count: 1,
    listed_event_count: 1,
    cleared_event_count: 1,
    not_found_count: 0,
    validation_failed_count: 0,
    tenant_mismatch_count: 0,
    duplicate_conflict_count: 0,
    idempotent_duplicate_count: 0,
    forbidden_target_class_count: 0,
    recorder_exception_count: 0,
    operation_counts: Object.freeze({ record: 1, get: 1, list: 1, count: 1, clear_tenant: 1, clear_all: 1 }),
    status_counts: Object.freeze({
      attempted: 1,
      accepted: 1,
      rejected: 0,
      not_found: 0,
      cleared: 1,
      blocked_no_go: 0,
    }),
    outcome_counts: Object.freeze({ pass: 1, warn: 0, fail: 0, no_go: 0 }),
    validation_result_counts: Object.freeze({
      validator_passed: 1,
      validator_failed: 0,
      validator_not_applicable: 0,
      validator_not_run_no_go: 0,
    }),
    fixture_coverage: ALL_TRUE_FIXTURE_COVERAGE,
    clear_scope_summary:
      "Fixture suite exercises tenant_only and all_test_memory clear scopes; not production capability.",
    non_durability_summary:
      "Recorder is in-memory only, process-lifetime-only, test-only; durability is not claimed.",
    payload_hash: "d".repeat(64),
  }) as CreateFixtureSuiteRecorderAuditSummaryInput

export const BLOCKED_NO_GO_RECORDER_AUDIT_SUMMARY_FIXTURE_INPUT: CreateBlockedRecorderAuditSummaryInput =
  Object.freeze({
    ...COMMON,
    summary_id: "ras_blocked_no_go_fixture_001",
    summary_scope: "tenant",
    summarized_operation_names: Object.freeze(["recordAuditEvent"]),
    total_record_attempts: 1,
    accepted_record_count: 0,
    rejected_record_count: 1,
    stored_event_count: 0,
    returned_event_count: 0,
    listed_event_count: 0,
    cleared_event_count: 0,
    not_found_count: 0,
    validation_failed_count: 1,
    tenant_mismatch_count: 0,
    duplicate_conflict_count: 0,
    idempotent_duplicate_count: 0,
    forbidden_target_class_count: 0,
    recorder_exception_count: 0,
    operation_counts: Object.freeze({ record: 1, get: 0, list: 0, count: 0, clear_tenant: 0, clear_all: 0 }),
    status_counts: Object.freeze({
      attempted: 1,
      accepted: 0,
      rejected: 1,
      not_found: 0,
      cleared: 0,
      blocked_no_go: 1,
    }),
    outcome_counts: Object.freeze({ pass: 0, warn: 0, fail: 0, no_go: 1 }),
    validation_result_counts: Object.freeze({
      validator_passed: 0,
      validator_failed: 1,
      validator_not_applicable: 0,
      validator_not_run_no_go: 0,
    }),
    issue_code_counts: Object.freeze({
      invalid_input: 0,
      invalid_event: 0,
      validation_failed: 1,
      tenant_mismatch: 0,
      duplicate_conflict: 0,
      forbidden_target_class: 0,
      recorder_exception: 0,
      blocked_no_go: 1,
    }),
    failure_summary: "One record attempt was rejected with stable issue codes only.",
    no_go_flags: Object.freeze(["validation_failed"]) as readonly RecorderAuditNoGoFlag[],
    payload_hash: "0".repeat(64),
  }) as CreateBlockedRecorderAuditSummaryInput

// ─── Deterministic fixture factories ────────────────────────────

function unwrap(
  result: RecorderAuditSummaryConstructionResult,
  label: string,
): RecorderAuditSummaryRecord {
  if (!result.ok) {
    throw new Error(`P6-I5N ${label} recorder audit summary fixture failed to construct`)
  }
  return result.record
}

export function createValidTenantRecorderAuditSummaryFixture(): RecorderAuditSummaryRecord {
  return unwrap(
    createTenantRecorderAuditSummary(VALID_TENANT_RECORDER_AUDIT_SUMMARY_FIXTURE_INPUT),
    "tenant",
  )
}
export function createValidAllTestMemoryRecorderAuditSummaryFixture(): RecorderAuditSummaryRecord {
  return unwrap(
    createAllTestMemoryRecorderAuditSummary(
      VALID_ALL_TEST_MEMORY_RECORDER_AUDIT_SUMMARY_FIXTURE_INPUT,
    ),
    "all_test_memory",
  )
}
export function createValidOperationSubsetRecorderAuditSummaryFixture(): RecorderAuditSummaryRecord {
  return unwrap(
    createOperationSubsetRecorderAuditSummary(
      VALID_OPERATION_SUBSET_RECORDER_AUDIT_SUMMARY_FIXTURE_INPUT,
    ),
    "operation_subset",
  )
}
export function createValidFixtureSuiteRecorderAuditSummaryFixture(): RecorderAuditSummaryRecord {
  return unwrap(
    createFixtureSuiteRecorderAuditSummary(VALID_FIXTURE_SUITE_RECORDER_AUDIT_SUMMARY_FIXTURE_INPUT),
    "fixture_suite",
  )
}
export function createBlockedNoGoRecorderAuditSummaryFixture(): RecorderAuditSummaryRecord {
  return unwrap(
    createBlockedRecorderAuditSummary(BLOCKED_NO_GO_RECORDER_AUDIT_SUMMARY_FIXTURE_INPUT),
    "blocked_no_go",
  )
}

// ─── Constructed fixture records (frozen by the constructor) ────

export const VALID_TENANT_RECORDER_AUDIT_SUMMARY_FIXTURE: RecorderAuditSummaryRecord =
  createValidTenantRecorderAuditSummaryFixture()
export const VALID_ALL_TEST_MEMORY_RECORDER_AUDIT_SUMMARY_FIXTURE: RecorderAuditSummaryRecord =
  createValidAllTestMemoryRecorderAuditSummaryFixture()
export const VALID_OPERATION_SUBSET_RECORDER_AUDIT_SUMMARY_FIXTURE: RecorderAuditSummaryRecord =
  createValidOperationSubsetRecorderAuditSummaryFixture()
export const VALID_FIXTURE_SUITE_RECORDER_AUDIT_SUMMARY_FIXTURE: RecorderAuditSummaryRecord =
  createValidFixtureSuiteRecorderAuditSummaryFixture()
export const BLOCKED_NO_GO_RECORDER_AUDIT_SUMMARY_FIXTURE: RecorderAuditSummaryRecord =
  createBlockedNoGoRecorderAuditSummaryFixture()

/** Deterministically ordered: tenant, all_test_memory, operation_subset, fixture_suite, blocked. */
export const ALL_RECORDER_AUDIT_SUMMARY_FIXTURES: readonly RecorderAuditSummaryRecord[] = Object.freeze([
  VALID_TENANT_RECORDER_AUDIT_SUMMARY_FIXTURE,
  VALID_ALL_TEST_MEMORY_RECORDER_AUDIT_SUMMARY_FIXTURE,
  VALID_OPERATION_SUBSET_RECORDER_AUDIT_SUMMARY_FIXTURE,
  VALID_FIXTURE_SUITE_RECORDER_AUDIT_SUMMARY_FIXTURE,
  BLOCKED_NO_GO_RECORDER_AUDIT_SUMMARY_FIXTURE,
])
