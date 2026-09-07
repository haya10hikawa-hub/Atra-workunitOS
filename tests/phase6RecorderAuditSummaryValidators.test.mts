/**
 * P6-I5L: isolated tests for the Phase 6 Recorder Audit Summary validators.
 *
 * Imports ONLY node:test, node:assert/strict, and the module public surface
 * (app/lib/phase6/recorderAuditSummary/index.ts), plus — for the Phase 7
 * static source guards only — node:fs / node:url to READ (never mutate) the
 * module source files. No app runtime modules, no app/lib/persistence, no
 * app/lib/phase6/persistenceAuditEvidence, no app/lib/phase6/
 * persistenceTargetDecision, no P6-I0..I5K tests, no fixtures, no harness, no
 * P7.1 utilities, no network, no GitHub API, no child_process, no file
 * mutation, no secrets, no ApprovalStore, no external actions, no D1, no SQL,
 * no LLM. Validators are exercised over in-memory objects only.
 *
 * Expected key/value literals below are hardcoded independently of the source
 * modules' own constant arrays (rather than imported and reflected back), so a
 * regression in the source's literal lists would be caught here instead of
 * trivially self-matching.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import {
  validateRecorderAuditSummaryRecord,
  isRecorderAuditSummaryScope,
  isRecorderAuditOperationName,
  isRecorderAuditOperationCountKey,
  isRecorderAuditStatusCountKey,
  isRecorderAuditOutcomeCountKey,
  isRecorderAuditValidationResultCountKey,
  isRecorderAuditIssueCode,
  isRecorderAuditNoGoFlag,
  isSha256Hex,
  isIsoTimestamp,
} from "../app/lib/phase6/recorderAuditSummary/index.ts"
import * as recorderAuditSummaryModule from "../app/lib/phase6/recorderAuditSummary/index.ts"

const HASH = "a".repeat(64)
const TS = "2026-07-08T12:00:00Z"
const NA =
  "This summary is descriptive: it is not approval, not execution permission, not summary runtime, not audit runtime, not audit event emission, not persistence, not durable storage, not Evidence Ledger append, not Graph Model write, and not production readiness."

const DEFERRED_TARGET_CLASSES = [
  "local_ephemeral_dev_store",
  "append_only_audit_candidate_store",
  "tenant_scoped_artifact_candidate_store",
  "future_d1_store_after_separate_d1_gate",
]
const BLOCKED_TARGET_CLASS = "blocked_target"

const ALL_NO_GO_FLAGS = [
  "p6_i5j_not_merged",
  "missing_foundation_file",
  "missing_explicit_human_go",
  "recorder_summary_runtime_implemented",
  "summary_emitter_implemented",
  "audit_runtime_implemented",
  "audit_event_emitter_implemented",
  "persistence_implementation_added",
  "durable_storage_added",
  "d1_access_added",
  "sql_execution_added",
  "evidence_ledger_append_added",
  "graph_write_added",
  "recorder_summary_treated_as_approval",
  "recorder_summary_treated_as_execution",
  "recorder_summary_treated_as_persistence",
  "recorder_summary_treated_as_durable_storage",
  "recorder_summary_treated_as_production_readiness",
  "raw_event_payload_echo_allowed",
  "secret_like_value_echo_allowed",
  "redaction_failure_allowed",
  "tenant_scope_bypassed",
  "validator_result_bypassed",
  "duplicate_conflict_treated_as_success",
  "clear_all_treated_as_production_capability",
  "validation_failed",
]

function zeroCountMap(keys: readonly string[]): Record<string, number> {
  const map: Record<string, number> = {}
  for (const k of keys) map[k] = 0
  return map
}

const FULL_NO_GO_FLAG_COUNTS = zeroCountMap(ALL_NO_GO_FLAGS)

const FULL_FIXTURE_COVERAGE_FALSE = {
  put_fixture_covered: false,
  get_fixture_covered: false,
  list_fixture_covered: false,
  count_fixture_covered: false,
  clear_tenant_fixture_covered: false,
  clear_all_fixture_covered: false,
  blocked_no_go_fixture_covered: false,
  all_required_fixtures_covered: false,
}

const FULL_FIXTURE_COVERAGE_TRUE = {
  put_fixture_covered: true,
  get_fixture_covered: true,
  list_fixture_covered: true,
  count_fixture_covered: true,
  clear_tenant_fixture_covered: true,
  clear_all_fixture_covered: true,
  blocked_no_go_fixture_covered: true,
  all_required_fixtures_covered: true,
}

function baseTenantSummary(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    summary_id: "summary_1",
    tenant_id: "tenant_1",
    recorder_target_class: "in_memory_test_only_store",
    selected_target_class: "in_memory_test_only_store",
    summary_scope: "tenant",
    summarized_operation_names: ["recordAuditEvent"],
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
    operation_counts: { record: 1, get: 0, list: 0, count: 0, clear_tenant: 0, clear_all: 0 },
    status_counts: { attempted: 1, accepted: 1, rejected: 0, not_found: 0, cleared: 0, blocked_no_go: 0 },
    outcome_counts: { pass: 1, warn: 0, fail: 0, no_go: 0 },
    validation_result_counts: {
      validator_passed: 1,
      validator_failed: 0,
      validator_not_applicable: 0,
      validator_not_run_no_go: 0,
    },
    issue_code_counts: {
      invalid_input: 0,
      invalid_event: 0,
      validation_failed: 0,
      tenant_mismatch: 0,
      duplicate_conflict: 0,
      forbidden_target_class: 0,
      recorder_exception: 0,
      blocked_no_go: 0,
    },
    no_go_flag_counts: FULL_NO_GO_FLAG_COUNTS,
    fixture_coverage: FULL_FIXTURE_COVERAGE_FALSE,
    tenant_scope_summary: "tenant_1 scoped recorder summary; not tenant authorization.",
    deterministic_ordering_summary: "Events ordered by created_at then audit_event_id.",
    defensive_snapshot_summary: "Returned events are frozen snapshots; not persistence evidence.",
    non_durability_summary:
      "Recorder is in-memory only, process-lifetime-only, test-only; durability is not claimed.",
    clear_scope_summary: "No clear operation summarized in this record.",
    failure_summary: "No failures; stable issue codes only.",
    redaction_summary: "No raw payload echo; no secret-like value echo.",
    source_loop: "P6-I5L",
    source_recorder_loop: "P6-I5J",
    source_fixture_loop: "P6-I5I",
    source_validator_loop: "P6-I5G",
    created_at: TS,
    payload_hash: HASH,
    non_authorization_statement: NA,
    no_go_flags: [],
    ...overrides,
  }
}

function allTestMemorySummary(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return baseTenantSummary({
    tenant_id: "all_tenants",
    summary_scope: "all_test_memory",
    summarized_operation_names: ["clearAllAuditEvents"],
    total_record_attempts: 0,
    accepted_record_count: 0,
    rejected_record_count: 0,
    stored_event_count: 0,
    cleared_event_count: 3,
    operation_counts: { record: 0, get: 0, list: 0, count: 0, clear_tenant: 0, clear_all: 1 },
    status_counts: { attempted: 1, accepted: 0, rejected: 0, not_found: 0, cleared: 1, blocked_no_go: 0 },
    outcome_counts: { pass: 1, warn: 0, fail: 0, no_go: 0 },
    validation_result_counts: {
      validator_passed: 0,
      validator_failed: 0,
      validator_not_applicable: 1,
      validator_not_run_no_go: 0,
    },
    clear_scope_summary: "clearAllAuditEvents cleared all_test_memory scope; test-only, non-durable.",
    ...overrides,
  })
}

function operationSubsetSummary(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return baseTenantSummary({
    summary_scope: "operation_subset",
    summarized_operation_names: ["getAuditEvent", "listAuditEvents"],
    total_record_attempts: 0,
    accepted_record_count: 0,
    rejected_record_count: 0,
    stored_event_count: 0,
    returned_event_count: 2,
    listed_event_count: 3,
    operation_counts: { record: 0, get: 2, list: 1, count: 0, clear_tenant: 0, clear_all: 0 },
    status_counts: { attempted: 3, accepted: 0, rejected: 0, not_found: 0, cleared: 0, blocked_no_go: 0 },
    outcome_counts: { pass: 3, warn: 0, fail: 0, no_go: 0 },
    validation_result_counts: {
      validator_passed: 0,
      validator_failed: 0,
      validator_not_applicable: 3,
      validator_not_run_no_go: 0,
    },
    ...overrides,
  })
}

function fixtureSuiteSummary(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return baseTenantSummary({
    summary_scope: "fixture_suite",
    summarized_operation_names: [
      "recordAuditEvent",
      "getAuditEvent",
      "listAuditEvents",
      "countAuditEvents",
      "clearTenantAuditEvents",
      "clearAllAuditEvents",
    ],
    fixture_coverage: FULL_FIXTURE_COVERAGE_TRUE,
    total_record_attempts: 1,
    accepted_record_count: 1,
    rejected_record_count: 0,
    stored_event_count: 1,
    returned_event_count: 1,
    listed_event_count: 1,
    cleared_event_count: 1,
    operation_counts: { record: 1, get: 1, list: 1, count: 1, clear_tenant: 1, clear_all: 1 },
    status_counts: { attempted: 1, accepted: 1, rejected: 0, not_found: 0, cleared: 1, blocked_no_go: 0 },
    outcome_counts: { pass: 1, warn: 0, fail: 0, no_go: 0 },
    clear_scope_summary:
      "Fixture suite exercises tenant_only and all_test_memory clear scopes; not production capability.",
    ...overrides,
  })
}

function withField(
  base: Record<string, unknown>,
  field: string,
  value: unknown,
): Record<string, unknown> {
  const r = { ...base }
  r[field] = value
  return r
}

function withoutField(base: Record<string, unknown>, field: string): Record<string, unknown> {
  const r = { ...base }
  delete r[field]
  return r
}

function hasCode(result: { issues: readonly { code: string }[] }, code: string): boolean {
  return result.issues.some((i) => i.code === code)
}

// ─── P6-FIX-004 (Issue #115): semantic ISO-8601 UTC timestamp guard ─────────
// created_at now rejects non-existent calendar values via the shared semantic
// guard, using the module's existing invalid_timestamp code. Valid leap-day /
// fractional timestamps still pass.
const RAS_PINNED_INVALID = ["2026-13-01T00:00:00Z", "2026-02-30T00:00:00Z", "2026-01-01T25:00:00Z"]

test("recorder summary created_at rejects pinned invalid calendar values", () => {
  for (const bad of RAS_PINNED_INVALID) {
    const result = validateRecorderAuditSummaryRecord(withField(baseTenantSummary(), "created_at", bad))
    const tsIssues = result.issues.filter((i) => i.code === "invalid_timestamp")
    assert.ok(tsIssues.length > 0, `expected invalid_timestamp for ${bad}`)
    assert.ok(tsIssues.some((i) => i.field === "created_at"), `issue must point at created_at`)
    for (const i of result.issues) {
      assert.equal(i.message, `${i.code}:${i.field}`)
      assert.ok(!i.message.includes(bad), `message must not echo timestamp`)
    }
  }
  for (const good of ["2024-02-29T12:34:56Z", "2026-01-01T00:00:00.123Z"]) {
    const result = validateRecorderAuditSummaryRecord(withField(baseTenantSummary(), "created_at", good))
    assert.ok(!hasCode(result, "invalid_timestamp"), `valid ${good} must pass`)
  }
})

// 1-4
test("valid tenant summary record passes", () => {
  const r = validateRecorderAuditSummaryRecord(baseTenantSummary())
  assert.equal(r.ok, true, JSON.stringify(r.issues))
})
test("valid all_test_memory summary record passes", () => {
  const r = validateRecorderAuditSummaryRecord(allTestMemorySummary())
  assert.equal(r.ok, true, JSON.stringify(r.issues))
})
test("valid operation_subset summary record passes", () => {
  const r = validateRecorderAuditSummaryRecord(operationSubsetSummary())
  assert.equal(r.ok, true, JSON.stringify(r.issues))
})
test("valid fixture_suite summary record passes", () => {
  const r = validateRecorderAuditSummaryRecord(fixtureSuiteSummary())
  assert.equal(r.ok, true, JSON.stringify(r.issues))
})

// 5-6
test("recorder_target_class must be in_memory_test_only_store", () => {
  const r = validateRecorderAuditSummaryRecord(
    withField(baseTenantSummary(), "recorder_target_class", "something_else"),
  )
  assert.equal(r.ok, false)
  assert.ok(hasCode(r, "invalid_recorder_target_class"))
})
test("selected_target_class must be in_memory_test_only_store", () => {
  const r = validateRecorderAuditSummaryRecord(
    withField(baseTenantSummary(), "selected_target_class", "something_else"),
  )
  assert.equal(r.ok, false)
  assert.ok(hasCode(r, "invalid_selected_target_class"))
})

// 7-8
test("deferred target class cannot be recorder_target_class", () => {
  for (const deferred of DEFERRED_TARGET_CLASSES) {
    const r = validateRecorderAuditSummaryRecord(
      withField(baseTenantSummary(), "recorder_target_class", deferred),
    )
    assert.equal(r.ok, false, deferred)
    assert.ok(hasCode(r, "invalid_recorder_target_class"), deferred)
  }
})
test("deferred target class cannot be selected_target_class", () => {
  for (const deferred of DEFERRED_TARGET_CLASSES) {
    const r = validateRecorderAuditSummaryRecord(
      withField(baseTenantSummary(), "selected_target_class", deferred),
    )
    assert.equal(r.ok, false, deferred)
    assert.ok(hasCode(r, "invalid_selected_target_class"), deferred)
  }
})

// 9-10
test("blocked_target cannot be recorder_target_class", () => {
  const r = validateRecorderAuditSummaryRecord(
    withField(baseTenantSummary(), "recorder_target_class", BLOCKED_TARGET_CLASS),
  )
  assert.equal(r.ok, false)
  assert.ok(hasCode(r, "invalid_recorder_target_class"))
})
test("blocked_target cannot be selected_target_class", () => {
  const r = validateRecorderAuditSummaryRecord(
    withField(baseTenantSummary(), "selected_target_class", BLOCKED_TARGET_CLASS),
  )
  assert.equal(r.ok, false)
  assert.ok(hasCode(r, "invalid_selected_target_class"))
})

// 11
test("missing required field fails", () => {
  const r = validateRecorderAuditSummaryRecord(withoutField(baseTenantSummary(), "summary_id"))
  assert.equal(r.ok, false)
  assert.ok(hasCode(r, "missing_required_field"))
})

// 12
test("null required field fails", () => {
  const r = validateRecorderAuditSummaryRecord(withField(baseTenantSummary(), "summary_id", null))
  assert.equal(r.ok, false)
  assert.ok(hasCode(r, "null_required_field"))
})

// 13
test("non-object input fails", () => {
  for (const bad of [42, "x", true, undefined, null]) {
    const r = validateRecorderAuditSummaryRecord(bad)
    assert.equal(r.ok, false, JSON.stringify(bad))
    assert.ok(hasCode(r, "invalid_summary"), JSON.stringify(bad))
  }
})

// 14
test("array input fails", () => {
  const r = validateRecorderAuditSummaryRecord([])
  assert.equal(r.ok, false)
  assert.ok(hasCode(r, "invalid_summary"))
})

// 15
test("unknown top-level field fails", () => {
  const r = validateRecorderAuditSummaryRecord(
    withField(baseTenantSummary(), "totally_unknown_field", "x"),
  )
  assert.equal(r.ok, false)
  assert.ok(hasCode(r, "unknown_field"))
})

// 16
test("invalid timestamp fails", () => {
  const r = validateRecorderAuditSummaryRecord(withField(baseTenantSummary(), "created_at", "not-a-timestamp"))
  assert.equal(r.ok, false)
  assert.ok(hasCode(r, "invalid_timestamp"))
})

// 17
test("invalid payload_hash fails", () => {
  const r = validateRecorderAuditSummaryRecord(withField(baseTenantSummary(), "payload_hash", "xyz"))
  assert.equal(r.ok, false)
  assert.ok(hasCode(r, "invalid_sha256_hex"))
})

// 18
test("invalid summary_scope fails", () => {
  const r = validateRecorderAuditSummaryRecord(withField(baseTenantSummary(), "summary_scope", "bogus_scope"))
  assert.equal(r.ok, false)
  assert.ok(hasCode(r, "invalid_summary_scope"))
})

// 19
test("invalid recorder operation name fails", () => {
  const r = validateRecorderAuditSummaryRecord(
    withField(baseTenantSummary(), "summarized_operation_names", ["bogusOperation"]),
  )
  assert.equal(r.ok, false)
  assert.ok(hasCode(r, "invalid_operation_name"))
})

// 20
test("summarized_operation_names must be array", () => {
  const r = validateRecorderAuditSummaryRecord(
    withField(baseTenantSummary(), "summarized_operation_names", "recordAuditEvent"),
  )
  assert.equal(r.ok, false)
  assert.ok(hasCode(r, "invalid_array"))
})

// 21
test("summarized_operation_names must be non-empty", () => {
  const r = validateRecorderAuditSummaryRecord(
    withField(baseTenantSummary(), "summarized_operation_names", []),
  )
  assert.equal(r.ok, false)
  assert.ok(hasCode(r, "invalid_array"))
})

// 22
test("count fields must be non-negative safe integers", () => {
  const r1 = validateRecorderAuditSummaryRecord(
    withField(baseTenantSummary(), "total_record_attempts", -1),
  )
  assert.equal(r1.ok, false)
  assert.ok(hasCode(r1, "invalid_count"))
  const r2 = validateRecorderAuditSummaryRecord(
    withField(baseTenantSummary(), "total_record_attempts", 1.5),
  )
  assert.equal(r2.ok, false)
  assert.ok(hasCode(r2, "invalid_count"))
})

// 23
test("negative count fails", () => {
  const r = validateRecorderAuditSummaryRecord(withField(baseTenantSummary(), "recorder_exception_count", -3))
  assert.equal(r.ok, false)
  assert.ok(hasCode(r, "invalid_count"))
})

// 24
test("non-integer count fails", () => {
  const r = validateRecorderAuditSummaryRecord(
    withField(baseTenantSummary(), "recorder_exception_count", 2.25),
  )
  assert.equal(r.ok, false)
  assert.ok(hasCode(r, "invalid_count"))
})

// 25
test("operation_counts must contain all required keys", () => {
  const opCounts = { record: 1, get: 0, list: 0, count: 0, clear_tenant: 0 } // missing clear_all
  const r = validateRecorderAuditSummaryRecord(withField(baseTenantSummary(), "operation_counts", opCounts))
  assert.equal(r.ok, false)
  assert.ok(hasCode(r, "missing_count_key"))
})

// 26
test("operation_counts unknown key fails", () => {
  const opCounts = {
    record: 1,
    get: 0,
    list: 0,
    count: 0,
    clear_tenant: 0,
    clear_all: 0,
    bogus_operation_key: 1,
  }
  const r = validateRecorderAuditSummaryRecord(withField(baseTenantSummary(), "operation_counts", opCounts))
  assert.equal(r.ok, false)
  assert.ok(hasCode(r, "unknown_count_key"))
  assert.ok(hasCode(r, "invalid_operation_count_key"))
})

// 27
test("status_counts must contain all required keys", () => {
  const statusCounts = { attempted: 1, accepted: 1, rejected: 0, not_found: 0, cleared: 0 } // missing blocked_no_go
  const r = validateRecorderAuditSummaryRecord(withField(baseTenantSummary(), "status_counts", statusCounts))
  assert.equal(r.ok, false)
  assert.ok(hasCode(r, "missing_count_key"))
})

// 28
test("outcome_counts must contain all required keys", () => {
  const outcomeCounts = { pass: 1, warn: 0, fail: 0 } // missing no_go
  const r = validateRecorderAuditSummaryRecord(withField(baseTenantSummary(), "outcome_counts", outcomeCounts))
  assert.equal(r.ok, false)
  assert.ok(hasCode(r, "missing_count_key"))
})

// 29
test("validation_result_counts must contain all required keys", () => {
  const validationResultCounts = { validator_passed: 1, validator_failed: 0, validator_not_applicable: 0 } // missing validator_not_run_no_go
  const r = validateRecorderAuditSummaryRecord(
    withField(baseTenantSummary(), "validation_result_counts", validationResultCounts),
  )
  assert.equal(r.ok, false)
  assert.ok(hasCode(r, "missing_count_key"))
})

// 30
test("issue_code_counts must contain stable issue keys", () => {
  const issueCodeCounts = {
    invalid_input: 0,
    invalid_event: 0,
    validation_failed: 0,
    tenant_mismatch: 0,
    duplicate_conflict: 0,
    forbidden_target_class: 0,
    recorder_exception: 0,
    // missing blocked_no_go
  }
  const r = validateRecorderAuditSummaryRecord(
    withField(baseTenantSummary(), "issue_code_counts", issueCodeCounts),
  )
  assert.equal(r.ok, false)
  assert.ok(hasCode(r, "missing_count_key"))
})

// 31
test("no_go_flag_counts must contain known no-go keys", () => {
  const incomplete = zeroCountMap(ALL_NO_GO_FLAGS.slice(1)) // missing the first flag key
  const r = validateRecorderAuditSummaryRecord(
    withField(baseTenantSummary(), "no_go_flag_counts", incomplete),
  )
  assert.equal(r.ok, false)
  assert.ok(hasCode(r, "missing_count_key"))
})

// 32
test("fixture_coverage must contain all fixture fields", () => {
  const incomplete = { ...FULL_FIXTURE_COVERAGE_TRUE } as Record<string, unknown>
  delete incomplete.blocked_no_go_fixture_covered
  const r = validateRecorderAuditSummaryRecord(
    withField(fixtureSuiteSummary(), "fixture_coverage", incomplete),
  )
  assert.equal(r.ok, false)
  assert.ok(hasCode(r, "invalid_fixture_coverage"))
})

// 33
test("fixture_suite requires all fixtures covered", () => {
  const partial = { ...FULL_FIXTURE_COVERAGE_TRUE, all_required_fixtures_covered: false }
  const r = validateRecorderAuditSummaryRecord(withField(fixtureSuiteSummary(), "fixture_coverage", partial))
  assert.equal(r.ok, false)
  assert.ok(hasCode(r, "fixture_suite_incomplete"))
})

// 34
test("no_go_flags non-empty fails unless blocked/no_go evidence exists", () => {
  const r = validateRecorderAuditSummaryRecord(
    withField(baseTenantSummary(), "no_go_flags", ["validation_failed"]),
  )
  assert.equal(r.ok, false)
  assert.ok(hasCode(r, "no_go_flags_present"))

  const withEvidence = baseTenantSummary({
    no_go_flags: ["validation_failed"],
    status_counts: { attempted: 1, accepted: 0, rejected: 1, not_found: 0, cleared: 0, blocked_no_go: 1 },
    outcome_counts: { pass: 0, warn: 0, fail: 0, no_go: 1 },
    validation_result_counts: {
      validator_passed: 0,
      validator_failed: 1,
      validator_not_applicable: 0,
      validator_not_run_no_go: 0,
    },
    accepted_record_count: 0,
    rejected_record_count: 1,
    stored_event_count: 0,
    validation_failed_count: 1,
    issue_code_counts: {
      invalid_input: 0,
      invalid_event: 0,
      validation_failed: 1,
      tenant_mismatch: 0,
      duplicate_conflict: 0,
      forbidden_target_class: 0,
      recorder_exception: 0,
      blocked_no_go: 1,
    },
  })
  const r2 = validateRecorderAuditSummaryRecord(withEvidence)
  assert.equal(r2.ok, true, JSON.stringify(r2.issues))
})

// ─── P6-FIX-007e (Issue #121): intentional one-way No-Go relationship ────────
//
// no_go_flags.length > 0  =>  status_counts.blocked_no_go > 0 OR
// outcome_counts.no_go > 0. The reverse is intentionally false: aggregate
// blocked/no-go evidence does NOT require a non-empty no_go_flags array.
// status_counts.blocked_no_go and outcome_counts.no_go are descriptive
// aggregate counts over the summarized operations; no_go_flags is the explicit
// set of No-Go reasons asserted on the summary record itself. The full
// four-state truth table is pinned here.

/** A fully count-consistent blocked/no-go summary carrying no_go_flags: []. */
function evidenceWithoutFlags(): Record<string, unknown> {
  return baseTenantSummary({
    no_go_flags: [],
    accepted_record_count: 0,
    rejected_record_count: 1,
    stored_event_count: 0,
    validation_failed_count: 1,
    status_counts: { attempted: 1, accepted: 0, rejected: 1, not_found: 0, cleared: 0, blocked_no_go: 1 },
    outcome_counts: { pass: 0, warn: 0, fail: 0, no_go: 1 },
    validation_result_counts: {
      validator_passed: 0,
      validator_failed: 1,
      validator_not_applicable: 0,
      validator_not_run_no_go: 0,
    },
    issue_code_counts: {
      invalid_input: 0,
      invalid_event: 0,
      validation_failed: 1,
      tenant_mismatch: 0,
      duplicate_conflict: 0,
      forbidden_target_class: 0,
      recorder_exception: 0,
      blocked_no_go: 1,
    },
  })
}

test("no_go relationship truth table — Case A: no flags, no evidence is valid", () => {
  const base = baseTenantSummary()
  assert.deepEqual(base.no_go_flags, [])
  assert.deepEqual((base.status_counts as Record<string, number>).blocked_no_go, 0)
  assert.deepEqual((base.outcome_counts as Record<string, number>).no_go, 0)
  const r = validateRecorderAuditSummaryRecord(base)
  assert.equal(r.ok, true, JSON.stringify(r.issues))
  assert.deepEqual([...r.issues], [])
})

test("no_go relationship truth table — Case B: flags, no evidence is invalid", () => {
  const r = validateRecorderAuditSummaryRecord(
    withField(baseTenantSummary(), "no_go_flags", ["validation_failed"]),
  )
  assert.equal(r.ok, false)
  const flagged = r.issues.filter(
    (i) => i.code === "no_go_flags_present" && i.field === "no_go_flags",
  )
  assert.equal(flagged.length, 1, "exactly one no_go_flags_present on no_go_flags")
})

test("no_go relationship truth table — Case C: flags and evidence is valid", () => {
  const withEvidence = evidenceWithoutFlags()
  ;(withEvidence as Record<string, unknown>).no_go_flags = ["validation_failed"]
  const r = validateRecorderAuditSummaryRecord(withEvidence)
  assert.equal(r.ok, true, JSON.stringify(r.issues))
  assert.deepEqual([...r.issues], [])
})

test("no_go relationship truth table — Case D: evidence without flags is fully valid", () => {
  const record = evidenceWithoutFlags()
  // Precondition: this is genuinely the evidence-without-flags shape.
  assert.deepEqual(record.no_go_flags, [])
  assert.ok((record.status_counts as Record<string, number>).blocked_no_go > 0)
  assert.ok((record.outcome_counts as Record<string, number>).no_go > 0)
  const r = validateRecorderAuditSummaryRecord(record)
  // A completely valid result — not merely the absence of no_go_flags_present.
  assert.equal(r.ok, true, JSON.stringify(r.issues))
  assert.deepEqual([...r.issues], [])
})

test("evidence without flags: validation success is non-authorizing", () => {
  const r = validateRecorderAuditSummaryRecord(evidenceWithoutFlags()) as unknown as Record<string, unknown>
  assert.equal(r.ok, true)
  assert.deepEqual(Object.keys(r).sort(), ["issues", "ok"])
  for (const forbidden of [
    "approval",
    "approved",
    "authorized",
    "execution_permission",
    "executed",
    "persisted",
    "stored",
    "evidence_ledger_append_permission",
    "graph_write_permission",
    "formal_workunit_promotion",
    "production_ready",
  ]) {
    assert.equal(Object.prototype.hasOwnProperty.call(r, forbidden), false, forbidden)
  }
})

// 35
test("duplicate_conflict_count must fail closed", () => {
  const r = validateRecorderAuditSummaryRecord(
    baseTenantSummary({
      accepted_record_count: 0,
      rejected_record_count: 1,
      duplicate_conflict_count: 1,
      status_counts: { attempted: 1, accepted: 0, rejected: 1, not_found: 0, cleared: 0, blocked_no_go: 0 },
      // outcome_counts.fail and no_go both 0 -> not fail-closed
    }),
  )
  assert.equal(r.ok, false)
  assert.ok(hasCode(r, "duplicate_conflict_not_fail_closed"))
})

// 36
test("tenant_mismatch_count must fail closed", () => {
  const r = validateRecorderAuditSummaryRecord(
    baseTenantSummary({
      accepted_record_count: 0,
      rejected_record_count: 1,
      tenant_mismatch_count: 1,
      status_counts: { attempted: 1, accepted: 0, rejected: 1, not_found: 0, cleared: 0, blocked_no_go: 0 },
    }),
  )
  assert.equal(r.ok, false)
  assert.ok(hasCode(r, "invalid_count_consistency"))
})

// 37
test("validation_failed_count must fail closed", () => {
  const r = validateRecorderAuditSummaryRecord(
    baseTenantSummary({
      accepted_record_count: 0,
      rejected_record_count: 1,
      validation_failed_count: 1,
      status_counts: { attempted: 1, accepted: 0, rejected: 1, not_found: 0, cleared: 0, blocked_no_go: 0 },
    }),
  )
  assert.equal(r.ok, false)
  assert.ok(hasCode(r, "invalid_count_consistency"))
})

// 38
test("forbidden_target_class_count must fail closed", () => {
  const r = validateRecorderAuditSummaryRecord(
    baseTenantSummary({
      accepted_record_count: 0,
      rejected_record_count: 1,
      forbidden_target_class_count: 1,
      status_counts: { attempted: 1, accepted: 0, rejected: 1, not_found: 0, cleared: 0, blocked_no_go: 0 },
    }),
  )
  assert.equal(r.ok, false)
  assert.ok(hasCode(r, "invalid_count_consistency"))
})

// 39
test("duplicate_conflict_count cannot count as accepted", () => {
  const r = validateRecorderAuditSummaryRecord(
    baseTenantSummary({
      total_record_attempts: 1,
      accepted_record_count: 1,
      rejected_record_count: 0,
      duplicate_conflict_count: 1, // exceeds rejected_record_count (0) -> not truly rejected
      outcome_counts: { pass: 1, warn: 0, fail: 0, no_go: 0 },
    }),
  )
  assert.equal(r.ok, false)
  assert.ok(hasCode(r, "invalid_count_consistency"))
})

// 40
test("clear_all requires all_test_memory wording and non-durability wording", () => {
  const r = validateRecorderAuditSummaryRecord(
    allTestMemorySummary({ clear_scope_summary: "Cleared some events." }),
  )
  assert.equal(r.ok, false)
  assert.ok(hasCode(r, "clear_all_treated_as_production_capability"))
})

// 41
test("redaction summary must not allow raw event payload echo", () => {
  const r = validateRecorderAuditSummaryRecord(
    withField(baseTenantSummary(), "redaction_summary", "raw payload echo allowed for debugging"),
  )
  assert.equal(r.ok, false)
  assert.ok(hasCode(r, "raw_event_payload_field_present"))
})

// 42
test("redaction summary must not allow secret-like value echo", () => {
  const r = validateRecorderAuditSummaryRecord(
    withField(baseTenantSummary(), "redaction_summary", "secret-like value echo allowed for debugging"),
  )
  assert.equal(r.ok, false)
  assert.ok(hasCode(r, "secret_like_echo_field_present"))
})

// 43
test("non_authorization_statement is required", () => {
  const r1 = validateRecorderAuditSummaryRecord(
    withoutField(baseTenantSummary(), "non_authorization_statement"),
  )
  assert.equal(r1.ok, false)
  assert.ok(hasCode(r1, "missing_required_field"))

  const r2 = validateRecorderAuditSummaryRecord(
    withField(baseTenantSummary(), "non_authorization_statement", "This summary is fine."),
  )
  assert.equal(r2.ok, false)
  assert.ok(hasCode(r2, "invalid_non_authorization_statement"))
})

// 44 (P6-FIX-005, Issue #116): the canonical 20-name grant-like denylist.
// Expected names are hardcoded independently of the shared production constant
// (rather than imported and reflected back), so a production-list regression —
// a dropped, renamed, or misspelled name — is detectable here.
const CANONICAL_FORBIDDEN_GRANT_FIELDS = [
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
] as const

test("all 20 canonical forbidden grant-like fields fail with the dedicated code", () => {
  assert.equal(CANONICAL_FORBIDDEN_GRANT_FIELDS.length, 20)
  const suppliedValue = "grant-value-must-not-echo"
  for (const grant of CANONICAL_FORBIDDEN_GRANT_FIELDS) {
    const result = validateRecorderAuditSummaryRecord(
      withField(baseTenantSummary(), grant, suppliedValue),
    )
    assert.equal(result.ok, false, grant)
    const dedicated = result.issues.filter(
      (i) => i.code === "forbidden_grant_field_present" && i.field === grant,
    )
    assert.equal(dedicated.length, 1, `${grant}: exactly one dedicated grant issue`)
    assert.ok(
      !result.issues.some((i) => i.code === "unknown_field" && i.field === grant),
      `${grant}: must not also be reported as unknown_field`,
    )
    for (const i of result.issues) {
      assert.equal(i.message, `${i.code}:${i.field}`)
      assert.ok(!i.message.includes(suppliedValue), `${grant}: message must not echo the value`)
    }
  }
  // An ordinary unrelated unknown key keeps the generic classification.
  const unknown = validateRecorderAuditSummaryRecord(
    withField(baseTenantSummary(), "unrelated_mystery_key", "x"),
  )
  assert.equal(unknown.ok, false)
  assert.ok(hasCode(unknown, "unknown_field"))
  assert.equal(hasCode(unknown, "forbidden_grant_field_present"), false)
})

// 45
test("raw event payload field fails", () => {
  const r = validateRecorderAuditSummaryRecord(
    withField(baseTenantSummary(), "raw_payload", { anything: 1 }),
  )
  assert.equal(r.ok, false)
  assert.ok(hasCode(r, "raw_event_payload_field_present"))
})

// 46
test("secret-like echo field fails", () => {
  const r = validateRecorderAuditSummaryRecord(withField(baseTenantSummary(), "token", "abc123"))
  assert.equal(r.ok, false)
  assert.ok(hasCode(r, "secret_like_echo_field_present"))
})

// 47
test("validation issue messages do not echo secret-like values", () => {
  const secretValue = "super-secret-value-should-not-leak"
  const r = validateRecorderAuditSummaryRecord(withField(baseTenantSummary(), "token", secretValue))
  assert.equal(r.ok, false)
  for (const i of r.issues) {
    assert.ok(!i.message.includes(secretValue), i.message)
  }
})

// 48
test("validator does not mutate input", () => {
  const input = baseTenantSummary()
  const before = JSON.stringify(input)
  validateRecorderAuditSummaryRecord(input)
  const after = JSON.stringify(input)
  assert.equal(after, before)
})

// 49
test("validator uses single-read snapshot against getter-TOCTOU input", () => {
  const input = baseTenantSummary()
  delete (input as Record<string, unknown>).summary_scope
  let reads = 0
  Object.defineProperty(input, "summary_scope", {
    enumerable: true,
    configurable: true,
    get() {
      reads += 1
      return reads === 1 ? "tenant" : "blocked_no_go_bogus_scope"
    },
  })
  const r = validateRecorderAuditSummaryRecord(input)
  assert.equal(r.ok, true, JSON.stringify(r.issues))
  assert.equal(reads, 1)
})

// 49b (P6-FIX-001, Issue #119): the single-field getter regression above is
// expanded to complete contract coverage. No canonical field-name list is
// exported by the implementation (FIELD_SPECS is internal), so the field set
// is derived from this file's own valid fixture, whose keys are exactly the
// required top-level contract fields. Every field must be read exactly once —
// not zero times (ignored) and not multiple times (getter-TOCTOU window).
test("every top-level contract field getter is read exactly once", () => {
  const fields = Object.keys(baseTenantSummary())
  assert.ok(fields.length >= 40, `expected the full contract surface, got ${fields.length}`)
  for (const field of fields) {
    const input = baseTenantSummary()
    const original = (input as Record<string, unknown>)[field]
    delete (input as Record<string, unknown>)[field]
    let reads = 0
    Object.defineProperty(input, field, {
      enumerable: true,
      configurable: true,
      get() {
        reads += 1
        return original
      },
    })
    const r = validateRecorderAuditSummaryRecord(input)
    assert.equal(reads, 1, `${field} must be read exactly once (got ${reads})`)
    assert.equal(r.ok, true, `${field}: ${JSON.stringify(r.issues)}`)
  }
})

// 50
test("exported type guard functions accept allowed values", () => {
  assert.equal(isRecorderAuditSummaryScope("tenant"), true)
  assert.equal(isRecorderAuditSummaryScope("all_test_memory"), true)
  assert.equal(isRecorderAuditSummaryScope("operation_subset"), true)
  assert.equal(isRecorderAuditSummaryScope("fixture_suite"), true)
  assert.equal(isRecorderAuditOperationName("recordAuditEvent"), true)
  assert.equal(isRecorderAuditOperationName("clearAllAuditEvents"), true)
  assert.equal(isRecorderAuditOperationCountKey("record"), true)
  assert.equal(isRecorderAuditOperationCountKey("clear_all"), true)
  assert.equal(isRecorderAuditStatusCountKey("attempted"), true)
  assert.equal(isRecorderAuditStatusCountKey("blocked_no_go"), true)
  assert.equal(isRecorderAuditOutcomeCountKey("pass"), true)
  assert.equal(isRecorderAuditOutcomeCountKey("no_go"), true)
  assert.equal(isRecorderAuditValidationResultCountKey("validator_passed"), true)
  assert.equal(isRecorderAuditValidationResultCountKey("validator_not_run_no_go"), true)
  assert.equal(isRecorderAuditIssueCode("invalid_input"), true)
  assert.equal(isRecorderAuditIssueCode("blocked_no_go"), true)
  assert.equal(isRecorderAuditNoGoFlag("p6_i5j_not_merged"), true)
  assert.equal(isRecorderAuditNoGoFlag("validation_failed"), true)
  assert.equal(isSha256Hex(HASH), true)
  assert.equal(isIsoTimestamp(TS), true)
})

// 51
test("exported type guard functions reject disallowed values", () => {
  assert.equal(isRecorderAuditSummaryScope("bogus_scope"), false)
  assert.equal(isRecorderAuditSummaryScope(42), false)
  assert.equal(isRecorderAuditOperationName("bogusOp"), false)
  assert.equal(isRecorderAuditOperationCountKey("bogus_key"), false)
  assert.equal(isRecorderAuditStatusCountKey("bogus_key"), false)
  assert.equal(isRecorderAuditOutcomeCountKey("bogus_key"), false)
  assert.equal(isRecorderAuditValidationResultCountKey("bogus_key"), false)
  assert.equal(isRecorderAuditIssueCode("bogus_code"), false)
  assert.equal(isRecorderAuditNoGoFlag("bogus_flag"), false)
  assert.equal(isSha256Hex("not-a-hash"), false)
  assert.equal(isSha256Hex("A".repeat(64)), false)
  assert.equal(isIsoTimestamp("2026/07/08"), false)
})

// 52
test("validation pass does not add approval/execution/persistence/storage/durable-storage/ledger/graph/audit-runtime/summary-runtime/promotion fields", () => {
  const r = validateRecorderAuditSummaryRecord(baseTenantSummary())
  assert.deepEqual(Object.keys(r).sort(), ["issues", "ok"])
  const forbidden = [
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
  for (const key of forbidden) {
    assert.equal(Object.prototype.hasOwnProperty.call(r, key), false, key)
  }
})

// 53
test("index exports validators and type guards", () => {
  assert.equal(typeof validateRecorderAuditSummaryRecord, "function")
  assert.equal(typeof isRecorderAuditSummaryScope, "function")
  assert.equal(typeof isRecorderAuditOperationName, "function")
  assert.equal(typeof isRecorderAuditOperationCountKey, "function")
  assert.equal(typeof isRecorderAuditStatusCountKey, "function")
  assert.equal(typeof isRecorderAuditOutcomeCountKey, "function")
  assert.equal(typeof isRecorderAuditValidationResultCountKey, "function")
  assert.equal(typeof isRecorderAuditIssueCode, "function")
  assert.equal(typeof isRecorderAuditNoGoFlag, "function")
  assert.equal(typeof isSha256Hex, "function")
  assert.equal(typeof isIsoTimestamp, "function")
})

// 55 (kept adjacent to 53/54 intentionally; see Phase 7 block below for 54)
test("test does not rely on self-match traps for no-go flag literals", () => {
  // ALL_NO_GO_FLAGS above is hardcoded independently of the source module's own
  // RECORDER_AUDIT_NO_GO_FLAGS array — a regression there would surface as a
  // missing_count_key / invalid_no_go_flag mismatch in the tests above, not as
  // a trivial self-comparison here.
  assert.equal(ALL_NO_GO_FLAGS.length, 26)
  assert.ok(ALL_NO_GO_FLAGS.includes("validation_failed"))
  assert.ok(!ALL_NO_GO_FLAGS.includes("not_a_real_flag"))
  assert.equal(validateRecorderAuditSummaryRecord(baseTenantSummary()).ok, true)
  assert.equal(validateRecorderAuditSummaryRecord({}).ok, false)
})

// ─── P6-FIX-007b (Issue #121): frozen ValidationResult runtime snapshot ──────
// The result object and its issues array are both frozen, and a caller cannot
// flip ok or add/remove/reorder issues. Freezing grants nothing.

test("valid and invalid results are frozen with frozen issues arrays", () => {
  const valid = validateRecorderAuditSummaryRecord(baseTenantSummary())
  assert.equal(valid.ok, true, JSON.stringify(valid.issues))
  assert.ok(Object.isFrozen(valid), "valid result must be frozen")
  assert.ok(Object.isFrozen(valid.issues), "valid issues must be frozen")

  const invalid = validateRecorderAuditSummaryRecord({})
  assert.equal(invalid.ok, false)
  assert.ok(Object.isFrozen(invalid), "invalid result must be frozen")
  assert.ok(Object.isFrozen(invalid.issues), "invalid issues must be frozen")
})

test("result mutation attempts cannot change ok, issues length, entries, or order", () => {
  const result = validateRecorderAuditSummaryRecord({})
  assert.equal(result.ok, false)
  const before = {
    ok: result.ok,
    entries: result.issues.map((entry) => ({ ...entry })),
    order: result.issues.map((i) => `${i.code}:${i.field}:${i.message}`),
  }
  try {
    ;(result as { ok: boolean }).ok = true
  } catch {
    /* expected: frozen object in strict mode */
  }
  for (const op of [
    () => Reflect.apply(Array.prototype.push, result.issues, [{ code: "x", field: "y", message: "x:y" }]),
    () => Reflect.apply(Array.prototype.pop, result.issues, []),
    () => Reflect.apply(Array.prototype.splice, result.issues, [0, 1]),
  ]) {
    try {
      op()
    } catch {
      /* expected */
    }
  }
  assert.equal(result.ok, before.ok)
  assert.equal(result.issues.length, before.entries.length)
  assert.deepEqual(result.issues.map((entry) => ({ ...entry })), before.entries)
  assert.deepEqual(result.issues.map((i) => `${i.code}:${i.field}:${i.message}`), before.order)
})

// ─── Phase 7: static source guards (read-only) ──────────────────

const SRC_TYPES = fileURLToPath(new URL("../app/lib/phase6/recorderAuditSummary/types.ts", import.meta.url))
const SRC_VALIDATORS = fileURLToPath(
  new URL("../app/lib/phase6/recorderAuditSummary/validators.ts", import.meta.url),
)
const SRC_INDEX = fileURLToPath(new URL("../app/lib/phase6/recorderAuditSummary/index.ts", import.meta.url))

const FORBIDDEN_SOURCE_SUBSTRINGS = [
  "fetch(",
  "child_process",
  "process.env",
  'from "fs"',
  "from 'fs'",
  "D1",
  "SQL",
  "ApprovalStore",
  "externalAction",
  "executeExternal",
  "sendEmail",
  "slack_post",
  "appendEvidenceLedger",
  "writeGraph",
  "emitAudit",
  "auditEmitter",
  "summaryEmitter",
  "recorderSummaryRuntime",
  "StartHubRuntime",
  "starthubExecute",
  // P6-FIX-001 (Issue #119): bypass forms the original list missed. Each maps
  // to a concrete evasion of an already-forbidden capability:
  'from "node:fs"', // node:-prefixed filesystem import evades the bare "fs" needle
  "from 'node:fs'", // single-quoted variant of the same evasion
  "import(", // dynamic import can load any forbidden capability at runtime
  "require(", // CommonJS require can load any forbidden capability at runtime
  "globalThis[", // computed global access can reach fetch/process via bracket lookup
]

/** Pure helper: returns which forbidden forms appear in the given source text. */
function findForbiddenSubstrings(sourceText: string): string[] {
  return FORBIDDEN_SOURCE_SUBSTRINGS.filter((needle) => sourceText.includes(needle))
}

// 54
test("source guard confirms new source files do not contain forbidden runtime capability substrings", () => {
  for (const src of [SRC_TYPES, SRC_VALIDATORS, SRC_INDEX]) {
    const text = readFileSync(src, "utf8")
    assert.deepEqual(
      findForbiddenSubstrings(text),
      [],
      `${src} must contain no forbidden capability form`,
    )
  }
})

// 54b (P6-FIX-001): guard sensitivity proven synthetically — every forbidden
// form embedded in a harmless in-memory source string is detected, and a clean
// string is not flagged. No repository file is mutated for this proof.
test("source guard is non-vacuous: each forbidden form is detected in synthetic source", () => {
  for (const needle of FORBIDDEN_SOURCE_SUBSTRINGS) {
    const synthetic = `// harmless synthetic module\nconst inert = true\n${needle}\nexport {}\n`
    assert.ok(
      findForbiddenSubstrings(synthetic).includes(needle),
      `guard must detect synthetic occurrence of: <<<${needle}>>>`,
    )
  }
  const clean = `// harmless synthetic module\nconst inert = true\nexport {}\n`
  assert.deepEqual(findForbiddenSubstrings(clean), [], "clean synthetic source must not be flagged")
})

// ─── P6-FIX-007c (Issue #121): dead deferred/rejected target-class exports ────
//
// The unused RECORDER_AUDIT_DEFERRED/REJECTED_TARGET_CLASSES constants are
// removed from the public module surface. The one allowed runtime target class
// remains, and every deferred/rejected value stays fail-closed invalid for both
// recorder_target_class and selected_target_class with the existing stable
// codes. The deferred/rejected literals below are hardcoded independently of
// the production module (never imported) so this test does not mirror source.

const REMOVED_TARGET_CLASS_EXPORTS = [
  "RECORDER_AUDIT_DEFERRED_TARGET_CLASSES",
  "RECORDER_AUDIT_REJECTED_TARGET_CLASSES",
] as const

const INDEPENDENT_NON_ALLOWED_TARGET_CLASSES = [
  "local_ephemeral_dev_store",
  "append_only_audit_candidate_store",
  "tenant_scoped_artifact_candidate_store",
  "future_d1_store_after_separate_d1_gate",
  "blocked_target",
] as const

test("public surface no longer exposes deferred/rejected target-class constants", () => {
  const keys = Object.keys(recorderAuditSummaryModule)
  for (const removed of REMOVED_TARGET_CLASS_EXPORTS) {
    assert.equal(keys.includes(removed), false, `${removed} must not be exported`)
    assert.equal(
      (recorderAuditSummaryModule as Record<string, unknown>)[removed],
      undefined,
      `${removed} must be undefined on the public surface`,
    )
  }
  // The one allowed runtime target class remains, exactly.
  assert.ok(keys.includes("RECORDER_AUDIT_TARGET_CLASSES"))
  assert.deepEqual(
    [...(recorderAuditSummaryModule as { RECORDER_AUDIT_TARGET_CLASSES: readonly string[] }).RECORDER_AUDIT_TARGET_CLASSES],
    ["in_memory_test_only_store"],
  )
})

test("every non-allowed target class stays rejected for recorder and selected fields", () => {
  for (const bad of INDEPENDENT_NON_ALLOWED_TARGET_CLASSES) {
    const recorder = validateRecorderAuditSummaryRecord(withField(baseTenantSummary(), "recorder_target_class", bad))
    assert.equal(recorder.ok, false, `recorder_target_class=${bad}`)
    assert.ok(
      recorder.issues.some((i) => i.code === "invalid_recorder_target_class" && i.field === "recorder_target_class"),
      `recorder_target_class=${bad} must yield invalid_recorder_target_class`,
    )

    const selected = validateRecorderAuditSummaryRecord(withField(baseTenantSummary(), "selected_target_class", bad))
    assert.equal(selected.ok, false, `selected_target_class=${bad}`)
    assert.ok(
      selected.issues.some((i) => i.code === "invalid_selected_target_class" && i.field === "selected_target_class"),
      `selected_target_class=${bad} must yield invalid_selected_target_class`,
    )
  }
  // The one allowed class still passes at both fields.
  assert.equal(validateRecorderAuditSummaryRecord(baseTenantSummary()).ok, true)
})

test("types source removed the dead exports and introduced no replacement array", () => {
  const typesText = readFileSync(SRC_TYPES, "utf8")
  for (const removed of REMOVED_TARGET_CLASS_EXPORTS) {
    assert.ok(!typesText.includes(removed), `${removed} must be gone from types.ts`)
  }
  assert.ok(
    !typesText.includes("append_only_audit_candidate_store"),
    "types.ts must not reintroduce the deferred list literals",
  )
  assert.ok(!/DEFERRED_TARGET_CLASSES/.test(typesText), "no deferred target-class array may remain")
  assert.ok(!/REJECTED_TARGET_CLASSES/.test(typesText), "no rejected target-class array may remain")
  assert.ok(typesText.includes('RECORDER_AUDIT_TARGET_CLASSES = ["in_memory_test_only_store"]'))
  const indexText = readFileSync(SRC_INDEX, "utf8")
  const validatorsText = readFileSync(SRC_VALIDATORS, "utf8")
  for (const removed of REMOVED_TARGET_CLASS_EXPORTS) {
    assert.ok(!indexText.includes(removed), `index.ts must not name ${removed}`)
    assert.ok(!validatorsText.includes(removed), `validators.ts must not name ${removed}`)
  }
})
