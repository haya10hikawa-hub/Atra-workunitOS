/**
 * P6-I5M: isolated tests for the pure Phase 6 Recorder Audit Summary
 * constructors.
 *
 * Imports ONLY node:test, node:assert/strict, and the module public surface
 * (app/lib/phase6/recorderAuditSummary/index.ts), plus — for the Phase 7
 * static source guards only — node:fs / node:url to READ (never mutate) the
 * module source files. No app runtime modules, no app/lib/persistence, no
 * app/lib/phase6/persistenceAuditEvidence, no app/lib/phase6/
 * persistenceTargetDecision, no P6-I0..I5L tests, no fixtures, no harness, no
 * P7.1 utilities, no network, no GitHub API, no child_process, no file
 * mutation, no secrets, no ApprovalStore, no external actions, no D1, no SQL,
 * no LLM. Constructors are exercised over in-memory objects only.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import {
  validateRecorderAuditSummaryRecord,
  createRecorderAuditSummaryRecord,
  createTenantRecorderAuditSummary,
  createAllTestMemoryRecorderAuditSummary,
  createOperationSubsetRecorderAuditSummary,
  createFixtureSuiteRecorderAuditSummary,
  createBlockedRecorderAuditSummary,
  okRecorderAuditSummaryConstruction,
  failRecorderAuditSummaryConstruction,
  recorderAuditSummaryConstructorIssue,
} from "../app/lib/phase6/recorderAuditSummary/index.ts"

const HASH = "b".repeat(64)
const TS = "2026-07-09T09:00:00Z"
const NA =
  "This summary is descriptive: it is not approval, not execution permission, not summary runtime, not audit runtime, not audit event emission, not persistence, not durable storage, not Evidence Ledger append, not Graph Model write, and not production readiness."

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

function baseTenantInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    summary_id: "summary_ctor_1",
    tenant_id: "tenant_1",
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
    no_go_flag_counts: zeroCountMap(ALL_NO_GO_FLAGS),
    fixture_coverage: FULL_FIXTURE_COVERAGE_FALSE,
    tenant_scope_summary: "tenant_1 scoped recorder summary; not tenant authorization.",
    deterministic_ordering_summary: "Events ordered by created_at then audit_event_id.",
    defensive_snapshot_summary: "Returned events are frozen snapshots; not persistence evidence.",
    non_durability_summary:
      "Recorder is in-memory only, process-lifetime-only, test-only; durability is not claimed.",
    clear_scope_summary: "No clear operation summarized in this record.",
    failure_summary: "No failures; stable issue codes only.",
    redaction_summary: "No raw payload echo; no secret-like value echo.",
    source_loop: "P6-I5M",
    source_recorder_loop: "P6-I5J",
    source_fixture_loop: "P6-I5I",
    source_validator_loop: "P6-I5L",
    created_at: TS,
    payload_hash: HASH,
    non_authorization_statement: NA,
    no_go_flags: [],
    ...overrides,
  }
}

function allTestMemoryInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return baseTenantInput({
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

function operationSubsetInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return baseTenantInput({
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

function fixtureSuiteInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return baseTenantInput({
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
    returned_event_count: 1,
    listed_event_count: 1,
    cleared_event_count: 1,
    operation_counts: { record: 1, get: 1, list: 1, count: 1, clear_tenant: 1, clear_all: 1 },
    status_counts: { attempted: 1, accepted: 1, rejected: 0, not_found: 0, cleared: 1, blocked_no_go: 0 },
    clear_scope_summary:
      "Fixture suite exercises tenant_only and all_test_memory clear scopes; not production capability.",
    ...overrides,
  })
}

function blockedInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return baseTenantInput({
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
    no_go_flags: ["validation_failed"],
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

type AnyInput = Parameters<typeof createRecorderAuditSummaryRecord>[0]

// 1
test("createRecorderAuditSummaryRecord returns ok for valid tenant-shaped input", () => {
  const r = createRecorderAuditSummaryRecord(baseTenantInput() as AnyInput)
  assert.equal(r.ok, true, JSON.stringify(r.issues))
})

// 2
test("created generic record validates with validateRecorderAuditSummaryRecord", () => {
  const r = createRecorderAuditSummaryRecord(baseTenantInput() as AnyInput)
  assert.equal(r.ok, true)
  if (r.ok) {
    const v = validateRecorderAuditSummaryRecord(r.record)
    assert.equal(v.ok, true, JSON.stringify(v.issues))
  }
})

// 3
test("createTenantRecorderAuditSummary returns ok for valid tenant summary", () => {
  const r = createTenantRecorderAuditSummary(withoutField(baseTenantInput(), "summary_scope") as AnyInput)
  assert.equal(r.ok, true, JSON.stringify(r.issues))
})

// 4
test("createAllTestMemoryRecorderAuditSummary returns ok for valid all_test_memory summary", () => {
  const r = createAllTestMemoryRecorderAuditSummary(
    withoutField(allTestMemoryInput(), "summary_scope") as AnyInput,
  )
  assert.equal(r.ok, true, JSON.stringify(r.issues))
})

// 5
test("createOperationSubsetRecorderAuditSummary returns ok for valid operation_subset summary", () => {
  const r = createOperationSubsetRecorderAuditSummary(
    withoutField(operationSubsetInput(), "summary_scope") as AnyInput,
  )
  assert.equal(r.ok, true, JSON.stringify(r.issues))
})

// 6
test("createFixtureSuiteRecorderAuditSummary returns ok for valid fixture_suite summary", () => {
  const r = createFixtureSuiteRecorderAuditSummary(
    withoutField(fixtureSuiteInput(), "summary_scope") as AnyInput,
  )
  assert.equal(r.ok, true, JSON.stringify(r.issues))
})

// 7
test("createBlockedRecorderAuditSummary returns ok with non-empty no_go_flags and blocked/no_go evidence", () => {
  const r = createBlockedRecorderAuditSummary(blockedInput() as AnyInput)
  assert.equal(r.ok, true, JSON.stringify(r.issues))
})

// 8
test("blocked constructor preserves no_go_flags", () => {
  const r = createBlockedRecorderAuditSummary(blockedInput() as AnyInput)
  assert.equal(r.ok, true)
  if (r.ok) assert.deepEqual([...r.record.no_go_flags], ["validation_failed"])
})

// 9
test("constructors set recorder_target_class to in_memory_test_only_store", () => {
  const results = [
    createRecorderAuditSummaryRecord(baseTenantInput() as AnyInput),
    createTenantRecorderAuditSummary(withoutField(baseTenantInput(), "summary_scope") as AnyInput),
    createAllTestMemoryRecorderAuditSummary(withoutField(allTestMemoryInput(), "summary_scope") as AnyInput),
    createOperationSubsetRecorderAuditSummary(withoutField(operationSubsetInput(), "summary_scope") as AnyInput),
    createFixtureSuiteRecorderAuditSummary(withoutField(fixtureSuiteInput(), "summary_scope") as AnyInput),
    createBlockedRecorderAuditSummary(blockedInput() as AnyInput),
  ]
  for (const r of results) {
    assert.equal(r.ok, true, JSON.stringify(r.issues))
    if (r.ok) assert.equal(r.record.recorder_target_class, "in_memory_test_only_store")
  }
})

// 10
test("constructors set selected_target_class to in_memory_test_only_store", () => {
  const results = [
    createRecorderAuditSummaryRecord(baseTenantInput() as AnyInput),
    createBlockedRecorderAuditSummary(blockedInput() as AnyInput),
  ]
  for (const r of results) {
    assert.equal(r.ok, true)
    if (r.ok) assert.equal(r.record.selected_target_class, "in_memory_test_only_store")
  }
})

// 11
test("caller-provided summary_id is preserved", () => {
  const r = createRecorderAuditSummaryRecord(
    withField(baseTenantInput(), "summary_id", "caller_chosen_summary_id_42") as AnyInput,
  )
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.record.summary_id, "caller_chosen_summary_id_42")
})

// 12
test("caller-provided tenant_id is preserved", () => {
  const r = createRecorderAuditSummaryRecord(
    withField(baseTenantInput(), "tenant_id", "caller_tenant_99") as AnyInput,
  )
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.record.tenant_id, "caller_tenant_99")
})

// 13
test("caller-provided created_at is preserved", () => {
  const ts = "2020-01-02T03:04:05Z"
  const r = createRecorderAuditSummaryRecord(withField(baseTenantInput(), "created_at", ts) as AnyInput)
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.record.created_at, ts)
})

// 14
test("caller-provided payload_hash is preserved", () => {
  const hash = "c".repeat(64)
  const r = createRecorderAuditSummaryRecord(withField(baseTenantInput(), "payload_hash", hash) as AnyInput)
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.record.payload_hash, hash)
})

// 15
test("constructor output validates through P6-I5L validators", () => {
  const inputs = [
    createTenantRecorderAuditSummary(withoutField(baseTenantInput(), "summary_scope") as AnyInput),
    createAllTestMemoryRecorderAuditSummary(withoutField(allTestMemoryInput(), "summary_scope") as AnyInput),
    createOperationSubsetRecorderAuditSummary(withoutField(operationSubsetInput(), "summary_scope") as AnyInput),
    createFixtureSuiteRecorderAuditSummary(withoutField(fixtureSuiteInput(), "summary_scope") as AnyInput),
    createBlockedRecorderAuditSummary(blockedInput() as AnyInput),
  ]
  for (const r of inputs) {
    assert.equal(r.ok, true)
    if (r.ok) assert.equal(validateRecorderAuditSummaryRecord(r.record).ok, true)
  }
})

// 16
test("invalid payload_hash returns fail result", () => {
  const r = createRecorderAuditSummaryRecord(withField(baseTenantInput(), "payload_hash", "xyz") as AnyInput)
  assert.equal(r.ok, false)
  assert.ok(hasCode(r, "validation_failed"))
})

// 17
test("invalid created_at returns fail result", () => {
  const r = createRecorderAuditSummaryRecord(
    withField(baseTenantInput(), "created_at", "not-a-timestamp") as AnyInput,
  )
  assert.equal(r.ok, false)
  assert.ok(hasCode(r, "validation_failed"))
})

// 18
test("missing required caller input returns fail result", () => {
  const r = createRecorderAuditSummaryRecord(withoutField(baseTenantInput(), "payload_hash") as AnyInput)
  assert.equal(r.ok, false)
  assert.ok(hasCode(r, "validation_failed"))
})

// 19
test("invalid summary_scope through generic returns fail result", () => {
  const r = createRecorderAuditSummaryRecord(
    withField(baseTenantInput(), "summary_scope", "bogus_scope") as AnyInput,
  )
  assert.equal(r.ok, false)
  assert.ok(hasCode(r, "validation_failed"))
})

// 20
test("tenant constructor forces summary_scope tenant", () => {
  const r = createTenantRecorderAuditSummary(
    withField(baseTenantInput(), "summary_scope", "operation_subset") as AnyInput,
  )
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.record.summary_scope, "tenant")
})

// 21
test("all_test_memory constructor forces summary_scope all_test_memory", () => {
  const r = createAllTestMemoryRecorderAuditSummary(
    withField(allTestMemoryInput(), "summary_scope", "tenant") as AnyInput,
  )
  assert.equal(r.ok, true, JSON.stringify(r.issues))
  if (r.ok) assert.equal(r.record.summary_scope, "all_test_memory")
})

// 22
test("operation_subset constructor forces summary_scope operation_subset", () => {
  const r = createOperationSubsetRecorderAuditSummary(
    withField(operationSubsetInput(), "summary_scope", "tenant") as AnyInput,
  )
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.record.summary_scope, "operation_subset")
})

// 23
test("fixture_suite constructor forces summary_scope fixture_suite", () => {
  const r = createFixtureSuiteRecorderAuditSummary(
    withField(fixtureSuiteInput(), "summary_scope", "tenant") as AnyInput,
  )
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.record.summary_scope, "fixture_suite")
})

// 24
test("fixture_suite constructor fails when fixture coverage is incomplete", () => {
  const partial = { ...FULL_FIXTURE_COVERAGE_TRUE, all_required_fixtures_covered: false }
  const r = createFixtureSuiteRecorderAuditSummary(
    withField(fixtureSuiteInput(), "fixture_coverage", partial) as AnyInput,
  )
  assert.equal(r.ok, false)
  assert.ok(hasCode(r, "validation_failed"))
})

// 25
test("blocked constructor fails when no_go_flags is empty", () => {
  const r = createBlockedRecorderAuditSummary(withField(blockedInput(), "no_go_flags", []) as AnyInput)
  assert.equal(r.ok, false)
  assert.ok(hasCode(r, "invalid_constructor_input"))
})

// 26
test("duplicate_conflict_count must be fail-closed", () => {
  const r = createRecorderAuditSummaryRecord(
    baseTenantInput({
      accepted_record_count: 0,
      rejected_record_count: 1,
      stored_event_count: 0,
      duplicate_conflict_count: 1,
      status_counts: { attempted: 1, accepted: 0, rejected: 1, not_found: 0, cleared: 0, blocked_no_go: 0 },
      // outcome_counts.fail and no_go both 0 -> not fail-closed
    }) as AnyInput,
  )
  assert.equal(r.ok, false)
  assert.ok(hasCode(r, "validation_failed"))
})

// 27
test("tenant_mismatch_count must be fail-closed", () => {
  const r = createRecorderAuditSummaryRecord(
    baseTenantInput({
      accepted_record_count: 0,
      rejected_record_count: 1,
      stored_event_count: 0,
      tenant_mismatch_count: 1,
      status_counts: { attempted: 1, accepted: 0, rejected: 1, not_found: 0, cleared: 0, blocked_no_go: 0 },
    }) as AnyInput,
  )
  assert.equal(r.ok, false)
  assert.ok(hasCode(r, "validation_failed"))
})

// 28
test("validation_failed_count must be fail-closed", () => {
  const r = createRecorderAuditSummaryRecord(
    baseTenantInput({
      accepted_record_count: 0,
      rejected_record_count: 1,
      stored_event_count: 0,
      validation_failed_count: 1,
      status_counts: { attempted: 1, accepted: 0, rejected: 1, not_found: 0, cleared: 0, blocked_no_go: 0 },
    }) as AnyInput,
  )
  assert.equal(r.ok, false)
  assert.ok(hasCode(r, "validation_failed"))
})

// 29
test("forbidden_target_class_count must be fail-closed", () => {
  const r = createRecorderAuditSummaryRecord(
    baseTenantInput({
      accepted_record_count: 0,
      rejected_record_count: 1,
      stored_event_count: 0,
      forbidden_target_class_count: 1,
      status_counts: { attempted: 1, accepted: 0, rejected: 1, not_found: 0, cleared: 0, blocked_no_go: 0 },
    }) as AnyInput,
  )
  assert.equal(r.ok, false)
  assert.ok(hasCode(r, "validation_failed"))
})

// 30
test("clear_all constructor requires all_test_memory and non-durability wording", () => {
  const r1 = createAllTestMemoryRecorderAuditSummary(
    withField(allTestMemoryInput(), "clear_scope_summary", "Cleared some events.") as AnyInput,
  )
  assert.equal(r1.ok, false)
  assert.ok(hasCode(r1, "invalid_constructor_input"))

  const r2 = createAllTestMemoryRecorderAuditSummary(
    withField(
      allTestMemoryInput(),
      "non_durability_summary",
      "Recorder keeps records forever.",
    ) as AnyInput,
  )
  assert.equal(r2.ok, false)
  assert.ok(hasCode(r2, "invalid_constructor_input"))
})

// 31
test("constructors reject recorder target override attempt", () => {
  const forbidden = [
    "local_ephemeral_dev_store",
    "append_only_audit_candidate_store",
    "tenant_scoped_artifact_candidate_store",
    "future_d1_store_after_separate_d1_gate",
    "blocked_target",
  ]
  for (const target of forbidden) {
    const r = createRecorderAuditSummaryRecord(
      withField(baseTenantInput(), "recorder_target_class", target) as AnyInput,
    )
    // The override is ignored: the record never carries the forbidden value.
    assert.equal(r.ok, true, JSON.stringify(r.issues))
    if (r.ok) assert.equal(r.record.recorder_target_class, "in_memory_test_only_store")
  }
})

// 32
test("constructors reject selected target override attempt", () => {
  const r = createRecorderAuditSummaryRecord(
    withField(baseTenantInput(), "selected_target_class", "blocked_target") as AnyInput,
  )
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.record.selected_target_class, "in_memory_test_only_store")
})

// 33
test("constructors do not mutate input", () => {
  const input = baseTenantInput()
  const before = JSON.stringify(input)
  createRecorderAuditSummaryRecord(input as AnyInput)
  createTenantRecorderAuditSummary(input as AnyInput)
  createBlockedRecorderAuditSummary(input as AnyInput)
  const after = JSON.stringify(input)
  assert.equal(after, before)
})

// 34
test("constructors are deterministic for the same input", () => {
  const r1 = createRecorderAuditSummaryRecord(baseTenantInput() as AnyInput)
  const r2 = createRecorderAuditSummaryRecord(baseTenantInput() as AnyInput)
  assert.equal(r1.ok, true)
  assert.equal(r2.ok, true)
  if (r1.ok && r2.ok) assert.deepEqual(r1.record, r2.record)
})

// 35
test("constructors produce different records only when caller-provided input differs", () => {
  const rA = createRecorderAuditSummaryRecord(baseTenantInput() as AnyInput)
  const rB = createRecorderAuditSummaryRecord(
    withField(baseTenantInput(), "summary_id", "different_summary_id") as AnyInput,
  )
  assert.equal(rA.ok, true)
  assert.equal(rB.ok, true)
  if (rA.ok && rB.ok) {
    assert.notDeepEqual(rA.record, rB.record)
    assert.equal(rA.record.summary_id === rB.record.summary_id, false)
  }
})

// 36
test("constructors do not generate current time", () => {
  const ts = "2001-01-01T00:00:00Z"
  const r = createRecorderAuditSummaryRecord(withField(baseTenantInput(), "created_at", ts) as AnyInput)
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.record.created_at, ts)
})

// 37
test("constructors do not generate random ids", () => {
  const r1 = createRecorderAuditSummaryRecord(baseTenantInput() as AnyInput)
  const r2 = createRecorderAuditSummaryRecord(baseTenantInput() as AnyInput)
  assert.equal(r1.ok, true)
  assert.equal(r2.ok, true)
  if (r1.ok && r2.ok) {
    assert.equal(r1.record.summary_id, "summary_ctor_1")
    assert.equal(r1.record.summary_id, r2.record.summary_id)
    assert.equal(r1.record.payload_hash, HASH)
  }
})

// 38
test("constructor issue messages do not echo secret-like values", () => {
  const secretValue = "super-secret-ctor-value-should-not-leak"
  const r = createRecorderAuditSummaryRecord(withField(baseTenantInput(), "token", secretValue) as AnyInput)
  assert.equal(r.ok, false)
  for (const i of r.issues) {
    assert.ok(!i.message.includes(secretValue), i.message)
  }
})

// 39
test("construction failure has no record field", () => {
  const r = createRecorderAuditSummaryRecord(
    withField(baseTenantInput(), "payload_hash", "bad") as AnyInput,
  )
  assert.equal(r.ok, false)
  assert.equal(Object.prototype.hasOwnProperty.call(r, "record"), false)
})

// 40
test("construction success has empty issues", () => {
  const r = createRecorderAuditSummaryRecord(baseTenantInput() as AnyInput)
  assert.equal(r.ok, true)
  assert.deepEqual([...r.issues], [])
})

// 41
test("result shape is non-authorizing", () => {
  const success = createRecorderAuditSummaryRecord(baseTenantInput() as AnyInput)
  assert.deepEqual(Object.keys(success).sort(), ["issues", "ok", "record"])
  const failure = createRecorderAuditSummaryRecord(null as unknown as AnyInput)
  assert.deepEqual(Object.keys(failure).sort(), ["issues", "ok"])
})

// 42
test("constructed record has no approval/execution/persistence/storage/durable-storage/ledger/graph/audit-runtime/summary-runtime/promotion grant fields", () => {
  const r = createRecorderAuditSummaryRecord(baseTenantInput() as AnyInput)
  assert.equal(r.ok, true)
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
    "summary_emission_permission",
    "audit_runtime_permission",
    "audit_emission_permission",
    "starthub_execution_permission",
  ]
  if (r.ok) {
    for (const key of forbidden) {
      assert.equal(Object.prototype.hasOwnProperty.call(r.record, key), false, key)
      assert.equal(Object.prototype.hasOwnProperty.call(r, key), false, key)
    }
  }
})

// 43
test("normal invalid input does not throw", () => {
  for (const bad of [null, undefined, 42, "x", true, []]) {
    const r = createRecorderAuditSummaryRecord(bad as unknown as AnyInput)
    assert.equal(r.ok, false, JSON.stringify(bad))
    assert.ok(hasCode(r, "invalid_constructor_input") || hasCode(r, "validation_failed"))
    const rb = createBlockedRecorderAuditSummary(bad as unknown as AnyInput)
    assert.equal(rb.ok, false)
  }
})

// 44
test("all_test_memory constructor preserves clear and non-durability evidence", () => {
  const input = allTestMemoryInput()
  const r = createAllTestMemoryRecorderAuditSummary(withoutField(input, "summary_scope") as AnyInput)
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.record.clear_scope_summary, input.clear_scope_summary)
    assert.equal(r.record.non_durability_summary, input.non_durability_summary)
  }
})

// 45
test("operation_subset constructor preserves summarized_operation_names", () => {
  const r = createOperationSubsetRecorderAuditSummary(
    withoutField(operationSubsetInput(), "summary_scope") as AnyInput,
  )
  assert.equal(r.ok, true)
  if (r.ok) assert.deepEqual([...r.record.summarized_operation_names], ["getAuditEvent", "listAuditEvents"])
})

// 46
test("fixture_suite constructor preserves all fixture coverage", () => {
  const r = createFixtureSuiteRecorderAuditSummary(
    withoutField(fixtureSuiteInput(), "summary_scope") as AnyInput,
  )
  assert.equal(r.ok, true)
  if (r.ok) assert.deepEqual({ ...r.record.fixture_coverage }, FULL_FIXTURE_COVERAGE_TRUE)
})

// 47
test("count maps are preserved", () => {
  const input = baseTenantInput()
  const r = createRecorderAuditSummaryRecord(input as AnyInput)
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.deepEqual({ ...r.record.operation_counts }, input.operation_counts)
    assert.deepEqual({ ...r.record.status_counts }, input.status_counts)
    assert.deepEqual({ ...r.record.outcome_counts }, input.outcome_counts)
    assert.deepEqual({ ...r.record.validation_result_counts }, input.validation_result_counts)
    assert.deepEqual({ ...r.record.issue_code_counts }, input.issue_code_counts)
  }
})

// 48
test("no-go flag counts are preserved", () => {
  const input = baseTenantInput()
  const r = createRecorderAuditSummaryRecord(input as AnyInput)
  assert.equal(r.ok, true)
  if (r.ok) assert.deepEqual({ ...r.record.no_go_flag_counts }, input.no_go_flag_counts)
})

// 49
test("index exports constructors and construction helpers", () => {
  assert.equal(typeof createRecorderAuditSummaryRecord, "function")
  assert.equal(typeof createTenantRecorderAuditSummary, "function")
  assert.equal(typeof createAllTestMemoryRecorderAuditSummary, "function")
  assert.equal(typeof createOperationSubsetRecorderAuditSummary, "function")
  assert.equal(typeof createFixtureSuiteRecorderAuditSummary, "function")
  assert.equal(typeof createBlockedRecorderAuditSummary, "function")
  assert.equal(typeof okRecorderAuditSummaryConstruction, "function")
  assert.equal(typeof failRecorderAuditSummaryConstruction, "function")
  assert.equal(typeof recorderAuditSummaryConstructorIssue, "function")
})

// 51 (kept adjacent; see Phase 7 block below for 50)
test("test does not rely on self-match traps", () => {
  // The fixture inputs above are hardcoded independently of the source
  // modules' own constant arrays; observable behavior is asserted both ways.
  assert.equal(createRecorderAuditSummaryRecord(baseTenantInput() as AnyInput).ok, true)
  assert.equal(createRecorderAuditSummaryRecord({} as AnyInput).ok, false)
  assert.equal(createBlockedRecorderAuditSummary(baseTenantInput() as AnyInput).ok, false)
})

// ─── P6-FIX-002 (Issue #117): single-read snapshot / getter-TOCTOU ──────────
//
// The precheck constructors must read each own enumerable top-level input
// property exactly once, and precheck and build must consume the same
// captured snapshot. A getter that shifts value after the first read must not
// be able to bypass the precheck or leak into the constructed record.

/** Replaces `field` with a counting getter returning values[min(read-1, last)]. */
function withCountingGetter(
  base: Record<string, unknown>,
  field: string,
  values: readonly unknown[],
): { input: Record<string, unknown>; reads: () => number } {
  let count = 0
  const input = { ...base }
  delete input[field]
  Object.defineProperty(input, field, {
    enumerable: true,
    configurable: true,
    get() {
      count++
      return values[Math.min(count - 1, values.length - 1)]
    },
  })
  return { input, reads: () => count }
}

// 52 (Test A)
test("all_test_memory precheck getters are read exactly once and build uses the precheck value", () => {
  for (const [field, firstValue, shiftedValue] of [
    [
      "clear_scope_summary",
      "clearAllAuditEvents cleared all_test_memory scope; test-only, non-durable.",
      "Cleared some events.", // would fail the precheck on a second read
    ],
    [
      "non_durability_summary",
      "Recorder is in-memory only, process-lifetime-only, test-only; durability is not claimed.",
      "Recorder keeps records forever.", // would fail the precheck on a second read
    ],
  ] as const) {
    const base = withoutField(allTestMemoryInput(), "summary_scope")
    const { input, reads } = withCountingGetter(base, field, [firstValue, shiftedValue])
    const r = createAllTestMemoryRecorderAuditSummary(input as AnyInput)
    assert.equal(reads(), 1, `${field} must be read exactly once`)
    assert.equal(r.ok, true, JSON.stringify(r.issues))
    if (r.ok) {
      // The record carries the first captured (precheck-consistent) value.
      assert.equal((r.record as Record<string, unknown>)[field], firstValue)
    }
    // The getter is still in place: the input was not mutated or overwritten.
    const desc = Object.getOwnPropertyDescriptor(input, field)
    assert.equal(typeof desc?.get, "function")
  }
})

// 53 (Test B)
test("blocked precheck getters are read exactly once and value shifting cannot bypass the precheck", () => {
  // no_go_flags: non-empty on first read, empty on a hypothetical second read.
  {
    const { input, reads } = withCountingGetter(blockedInput(), "no_go_flags", [
      ["validation_failed"],
      [],
    ])
    const r = createBlockedRecorderAuditSummary(input as AnyInput)
    assert.equal(reads(), 1, "no_go_flags must be read exactly once")
    for (const i of r.issues) assert.ok(!i.message.includes("validation_failed,"))
    assert.equal(r.ok, true, JSON.stringify(r.issues))
    if (r.ok) assert.deepEqual([...r.record.no_go_flags], ["validation_failed"])
  }
  // status_counts: blocked evidence on first read, none on a second read.
  {
    const blockedEvidence = {
      attempted: 1, accepted: 0, rejected: 1, not_found: 0, cleared: 0, blocked_no_go: 1,
    }
    const noEvidence = {
      attempted: 1, accepted: 0, rejected: 1, not_found: 0, cleared: 0, blocked_no_go: 0,
    }
    const { input, reads } = withCountingGetter(blockedInput(), "status_counts", [
      blockedEvidence,
      noEvidence,
    ])
    const r = createBlockedRecorderAuditSummary(input as AnyInput)
    assert.equal(reads(), 1, "status_counts must be read exactly once")
    assert.equal(r.ok, true, JSON.stringify(r.issues))
    if (r.ok) assert.equal(r.record.status_counts.blocked_no_go, 1)
  }
})

// 54 (Test C)
test("every own enumerable top-level input field is read exactly once by every constructor", () => {
  const cases: readonly [string, (i: AnyInput) => { ok: boolean }, Record<string, unknown>][] = [
    ["createRecorderAuditSummaryRecord", createRecorderAuditSummaryRecord, baseTenantInput()],
    ["createTenantRecorderAuditSummary", createTenantRecorderAuditSummary, withoutField(baseTenantInput(), "summary_scope")],
    ["createAllTestMemoryRecorderAuditSummary", createAllTestMemoryRecorderAuditSummary, withoutField(allTestMemoryInput(), "summary_scope")],
    ["createOperationSubsetRecorderAuditSummary", createOperationSubsetRecorderAuditSummary, withoutField(operationSubsetInput(), "summary_scope")],
    ["createFixtureSuiteRecorderAuditSummary", createFixtureSuiteRecorderAuditSummary, withoutField(fixtureSuiteInput(), "summary_scope")],
    ["createBlockedRecorderAuditSummary", createBlockedRecorderAuditSummary, blockedInput()],
  ]
  for (const [name, ctor, valid] of cases) {
    const counts: Record<string, number> = {}
    const wrapped: Record<string, unknown> = {}
    for (const key of Object.keys(valid)) {
      counts[key] = 0
      const value = valid[key]
      Object.defineProperty(wrapped, key, {
        enumerable: true,
        configurable: true,
        get() {
          counts[key]++
          return value
        },
      })
    }
    const r = ctor(wrapped as AnyInput)
    assert.equal(r.ok, true, `${name}: ${JSON.stringify((r as { issues?: unknown }).issues)}`)
    for (const key of Object.keys(counts)) {
      assert.equal(counts[key], 1, `${name}: field ${key} read ${counts[key]} times, expected exactly 1`)
    }
  }
})

// 55 (Test D)
test("a throwing top-level getter fails closed without echoing the thrown value", () => {
  const secret = "thrown-secret-value-must-not-leak"
  const ctors: readonly [(i: AnyInput) => ReturnType<typeof createRecorderAuditSummaryRecord>, Record<string, unknown>, string][] = [
    [createRecorderAuditSummaryRecord, baseTenantInput(), "tenant_id"],
    [createAllTestMemoryRecorderAuditSummary, withoutField(allTestMemoryInput(), "summary_scope"), "clear_scope_summary"],
    [createBlockedRecorderAuditSummary, blockedInput(), "no_go_flags"],
  ]
  for (const [ctor, base, field] of ctors) {
    const input = { ...base }
    delete input[field]
    Object.defineProperty(input, field, {
      enumerable: true,
      configurable: true,
      get(): never {
        throw new Error(secret)
      },
    })
    let r: ReturnType<typeof createRecorderAuditSummaryRecord>
    assert.doesNotThrow(() => {
      r = ctor(input as AnyInput)
    })
    assert.equal(r!.ok, false)
    assert.equal(Object.prototype.hasOwnProperty.call(r!, "record"), false)
    assert.ok(hasCode(r!, "constructor_exception"))
    for (const i of r!.issues) {
      assert.ok(!i.message.includes(secret), i.message)
      assert.ok(!i.field.includes(secret), i.field)
    }
  }
})

// 56 (non-vacuity): the read-count oracle above detects the original
// double-read flow. This emulates the pre-fix shape (precheck reads its own
// snapshot, then the raw input is handed to the builder, which reads again)
// without mutating production source.
test("read-count oracle is non-vacuous: it detects a double-read flow", () => {
  // Faithful test-local emulation of the pre-fix flow: the precheck read its
  // own snapshot of the field, then buildRecord re-snapshotted the raw input.
  function emulateOldDoubleReadBlocked(input: Record<string, unknown>) {
    const precheckFlags = input.no_go_flags // read 1: precheck snapshot
    if (!Array.isArray(precheckFlags) || precheckFlags.length === 0) {
      return { ok: false as const, no_go_flags: undefined }
    }
    const builtFlags = input.no_go_flags // read 2: buildRecord re-snapshot
    return { ok: true as const, no_go_flags: builtFlags }
  }
  const { input, reads } = withCountingGetter(blockedInput(), "no_go_flags", [
    ["validation_failed"],
    [],
  ])
  const r = emulateOldDoubleReadBlocked(input)
  // The exactly-once oracle fires against the old flow: reads > 1...
  assert.notEqual(reads(), 1)
  assert.equal(reads(), 2)
  // ...and the value-shift oracle fires: the emulated precheck passed on a
  // non-empty value, but the built record carries the shifted (empty) value.
  assert.equal(r.ok, true)
  assert.deepEqual(r.no_go_flags, [])
  // A zero-read flow is also detected by the same oracle.
  const untouched = withCountingGetter(blockedInput(), "no_go_flags", [["validation_failed"]])
  assert.notEqual(untouched.reads(), 1)
  assert.equal(untouched.reads(), 0)
})

// ─── Phase 7: static source guards (read-only) ──────────────────

const SRC_CONSTRUCTION = fileURLToPath(
  new URL("../app/lib/phase6/recorderAuditSummary/construction.ts", import.meta.url),
)
const SRC_CONSTRUCTORS = fileURLToPath(
  new URL("../app/lib/phase6/recorderAuditSummary/constructors.ts", import.meta.url),
)
const SRC_INDEX = fileURLToPath(new URL("../app/lib/phase6/recorderAuditSummary/index.ts", import.meta.url))

const FORBIDDEN_SOURCE_SUBSTRINGS = [
  "Date.now",
  "new Date",
  "randomUUID",
  "Math.random",
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
]

// 50
test("source guard confirms new source files do not contain forbidden runtime capability substrings", () => {
  for (const src of [SRC_CONSTRUCTION, SRC_CONSTRUCTORS, SRC_INDEX]) {
    const text = readFileSync(src, "utf8")
    for (const needle of FORBIDDEN_SOURCE_SUBSTRINGS) {
      assert.ok(!text.includes(needle), `${src} must not contain: <<<${needle}>>>`)
    }
  }
})
