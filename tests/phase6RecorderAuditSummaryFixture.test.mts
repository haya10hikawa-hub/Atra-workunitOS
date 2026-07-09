/**
 * P6-I5N: isolated tests for the deterministic test-only Phase 6 Recorder
 * Audit Summary fixtures.
 *
 * Imports ONLY node:test, node:assert/strict, the fixture module
 * (tests/fixtures/phase6/recorderAuditSummaryFixture.mts), and the Phase 6
 * Recorder Audit Summary module surface
 * (app/lib/phase6/recorderAuditSummary/index.ts), plus — for the static source
 * guard only — node:fs / node:url to READ (never mutate) the fixture source.
 * No app runtime modules, no app/lib/persistence, no app/lib/phase6/
 * persistenceAuditEvidence, no app/lib/phase6/persistenceTargetDecision, no
 * P6-I0..I5M tests, no harness, no P7.1 utilities, no network, no GitHub API,
 * no child_process, no file mutation, no secrets, no ApprovalStore, no
 * external actions, no D1, no SQL, no LLM. Fixtures are exercised in memory
 * only.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import {
  VALID_TENANT_RECORDER_AUDIT_SUMMARY_FIXTURE_INPUT,
  VALID_ALL_TEST_MEMORY_RECORDER_AUDIT_SUMMARY_FIXTURE_INPUT,
  VALID_OPERATION_SUBSET_RECORDER_AUDIT_SUMMARY_FIXTURE_INPUT,
  VALID_FIXTURE_SUITE_RECORDER_AUDIT_SUMMARY_FIXTURE_INPUT,
  BLOCKED_NO_GO_RECORDER_AUDIT_SUMMARY_FIXTURE_INPUT,
  VALID_TENANT_RECORDER_AUDIT_SUMMARY_FIXTURE,
  VALID_ALL_TEST_MEMORY_RECORDER_AUDIT_SUMMARY_FIXTURE,
  VALID_OPERATION_SUBSET_RECORDER_AUDIT_SUMMARY_FIXTURE,
  VALID_FIXTURE_SUITE_RECORDER_AUDIT_SUMMARY_FIXTURE,
  BLOCKED_NO_GO_RECORDER_AUDIT_SUMMARY_FIXTURE,
  createValidTenantRecorderAuditSummaryFixture,
  createValidAllTestMemoryRecorderAuditSummaryFixture,
  createValidOperationSubsetRecorderAuditSummaryFixture,
  createValidFixtureSuiteRecorderAuditSummaryFixture,
  createBlockedNoGoRecorderAuditSummaryFixture,
  ALL_RECORDER_AUDIT_SUMMARY_FIXTURES,
} from "./fixtures/phase6/recorderAuditSummaryFixture.mts"
import { validateRecorderAuditSummaryRecord } from "../app/lib/phase6/recorderAuditSummary/index.ts"

const FIXTURES = [
  VALID_TENANT_RECORDER_AUDIT_SUMMARY_FIXTURE,
  VALID_ALL_TEST_MEMORY_RECORDER_AUDIT_SUMMARY_FIXTURE,
  VALID_OPERATION_SUBSET_RECORDER_AUDIT_SUMMARY_FIXTURE,
  VALID_FIXTURE_SUITE_RECORDER_AUDIT_SUMMARY_FIXTURE,
  BLOCKED_NO_GO_RECORDER_AUDIT_SUMMARY_FIXTURE,
]

const VALID_FIXTURES = FIXTURES.slice(0, 4)

// 1-5
test("tenant summary fixture exists", () => {
  assert.ok(VALID_TENANT_RECORDER_AUDIT_SUMMARY_FIXTURE)
})
test("all_test_memory summary fixture exists", () => {
  assert.ok(VALID_ALL_TEST_MEMORY_RECORDER_AUDIT_SUMMARY_FIXTURE)
})
test("operation_subset summary fixture exists", () => {
  assert.ok(VALID_OPERATION_SUBSET_RECORDER_AUDIT_SUMMARY_FIXTURE)
})
test("fixture_suite summary fixture exists", () => {
  assert.ok(VALID_FIXTURE_SUITE_RECORDER_AUDIT_SUMMARY_FIXTURE)
})
test("blocked_no_go summary fixture exists", () => {
  assert.ok(BLOCKED_NO_GO_RECORDER_AUDIT_SUMMARY_FIXTURE)
})

// 6-10
test("tenant fixture validates with validateRecorderAuditSummaryRecord", () => {
  const v = validateRecorderAuditSummaryRecord(VALID_TENANT_RECORDER_AUDIT_SUMMARY_FIXTURE)
  assert.equal(v.ok, true, JSON.stringify(v.issues))
})
test("all_test_memory fixture validates with validateRecorderAuditSummaryRecord", () => {
  const v = validateRecorderAuditSummaryRecord(VALID_ALL_TEST_MEMORY_RECORDER_AUDIT_SUMMARY_FIXTURE)
  assert.equal(v.ok, true, JSON.stringify(v.issues))
})
test("operation_subset fixture validates with validateRecorderAuditSummaryRecord", () => {
  const v = validateRecorderAuditSummaryRecord(VALID_OPERATION_SUBSET_RECORDER_AUDIT_SUMMARY_FIXTURE)
  assert.equal(v.ok, true, JSON.stringify(v.issues))
})
test("fixture_suite fixture validates with validateRecorderAuditSummaryRecord", () => {
  const v = validateRecorderAuditSummaryRecord(VALID_FIXTURE_SUITE_RECORDER_AUDIT_SUMMARY_FIXTURE)
  assert.equal(v.ok, true, JSON.stringify(v.issues))
})
test("blocked fixture validates with validateRecorderAuditSummaryRecord", () => {
  const v = validateRecorderAuditSummaryRecord(BLOCKED_NO_GO_RECORDER_AUDIT_SUMMARY_FIXTURE)
  assert.equal(v.ok, true, JSON.stringify(v.issues))
})

// 11-14
test("tenant fixture summary_scope is tenant", () => {
  assert.equal(VALID_TENANT_RECORDER_AUDIT_SUMMARY_FIXTURE.summary_scope, "tenant")
})
test("all_test_memory fixture summary_scope is all_test_memory", () => {
  assert.equal(VALID_ALL_TEST_MEMORY_RECORDER_AUDIT_SUMMARY_FIXTURE.summary_scope, "all_test_memory")
})
test("operation_subset fixture summary_scope is operation_subset", () => {
  assert.equal(VALID_OPERATION_SUBSET_RECORDER_AUDIT_SUMMARY_FIXTURE.summary_scope, "operation_subset")
})
test("fixture_suite fixture summary_scope is fixture_suite", () => {
  assert.equal(VALID_FIXTURE_SUITE_RECORDER_AUDIT_SUMMARY_FIXTURE.summary_scope, "fixture_suite")
})

// 15
test("blocked fixture has non-empty no_go_flags", () => {
  assert.ok(BLOCKED_NO_GO_RECORDER_AUDIT_SUMMARY_FIXTURE.no_go_flags.length > 0)
  assert.deepEqual([...BLOCKED_NO_GO_RECORDER_AUDIT_SUMMARY_FIXTURE.no_go_flags], ["validation_failed"])
})

// 16
test("blocked fixture has blocked_no_go or no_go evidence", () => {
  const f = BLOCKED_NO_GO_RECORDER_AUDIT_SUMMARY_FIXTURE
  assert.ok(f.status_counts.blocked_no_go > 0 || f.outcome_counts.no_go > 0)
  assert.ok(f.outcome_counts.fail > 0 || f.outcome_counts.no_go > 0)
})

// 17-18
test("every fixture recorder_target_class is in_memory_test_only_store", () => {
  for (const f of FIXTURES) {
    assert.equal(f.recorder_target_class, "in_memory_test_only_store", f.summary_id)
  }
})
test("every fixture selected_target_class is in_memory_test_only_store", () => {
  for (const f of FIXTURES) {
    assert.equal(f.selected_target_class, "in_memory_test_only_store", f.summary_id)
  }
})

// 19
test("every fixture preserves fixed caller-provided summary_id", () => {
  assert.equal(VALID_TENANT_RECORDER_AUDIT_SUMMARY_FIXTURE.summary_id, "ras_tenant_fixture_001")
  assert.equal(
    VALID_ALL_TEST_MEMORY_RECORDER_AUDIT_SUMMARY_FIXTURE.summary_id,
    "ras_all_test_memory_fixture_001",
  )
  assert.equal(
    VALID_OPERATION_SUBSET_RECORDER_AUDIT_SUMMARY_FIXTURE.summary_id,
    "ras_operation_subset_fixture_001",
  )
  assert.equal(
    VALID_FIXTURE_SUITE_RECORDER_AUDIT_SUMMARY_FIXTURE.summary_id,
    "ras_fixture_suite_fixture_001",
  )
  assert.equal(BLOCKED_NO_GO_RECORDER_AUDIT_SUMMARY_FIXTURE.summary_id, "ras_blocked_no_go_fixture_001")
})

// 20
test("every fixture preserves fixed caller-provided tenant_id", () => {
  assert.equal(VALID_TENANT_RECORDER_AUDIT_SUMMARY_FIXTURE.tenant_id, "tenant_recorder_summary_fixture")
  assert.equal(
    VALID_ALL_TEST_MEMORY_RECORDER_AUDIT_SUMMARY_FIXTURE.tenant_id,
    "all_tenants_recorder_summary_fixture",
  )
  assert.equal(
    VALID_OPERATION_SUBSET_RECORDER_AUDIT_SUMMARY_FIXTURE.tenant_id,
    "tenant_recorder_summary_fixture",
  )
  assert.equal(
    VALID_FIXTURE_SUITE_RECORDER_AUDIT_SUMMARY_FIXTURE.tenant_id,
    "tenant_recorder_summary_fixture",
  )
  assert.equal(
    BLOCKED_NO_GO_RECORDER_AUDIT_SUMMARY_FIXTURE.tenant_id,
    "tenant_recorder_summary_fixture",
  )
})

// 21
test("every fixture preserves fixed caller-provided created_at", () => {
  for (const f of FIXTURES) {
    assert.equal(f.created_at, "2026-07-09T00:00:00Z", f.summary_id)
  }
})

// 22
test("every fixture preserves fixed caller-provided payload_hash", () => {
  assert.equal(VALID_TENANT_RECORDER_AUDIT_SUMMARY_FIXTURE.payload_hash, "a".repeat(64))
  assert.equal(VALID_ALL_TEST_MEMORY_RECORDER_AUDIT_SUMMARY_FIXTURE.payload_hash, "b".repeat(64))
  assert.equal(VALID_OPERATION_SUBSET_RECORDER_AUDIT_SUMMARY_FIXTURE.payload_hash, "c".repeat(64))
  assert.equal(VALID_FIXTURE_SUITE_RECORDER_AUDIT_SUMMARY_FIXTURE.payload_hash, "d".repeat(64))
  assert.equal(BLOCKED_NO_GO_RECORDER_AUDIT_SUMMARY_FIXTURE.payload_hash, "0".repeat(64))
})

// 23
test("valid fixtures have no_go_flags []", () => {
  for (const f of VALID_FIXTURES) {
    assert.deepEqual([...f.no_go_flags], [], f.summary_id)
  }
})

// 24
test("fixture_suite has all fixture coverage booleans true", () => {
  const coverage = VALID_FIXTURE_SUITE_RECORDER_AUDIT_SUMMARY_FIXTURE.fixture_coverage
  assert.deepEqual(
    { ...coverage },
    {
      put_fixture_covered: true,
      get_fixture_covered: true,
      list_fixture_covered: true,
      count_fixture_covered: true,
      clear_tenant_fixture_covered: true,
      clear_all_fixture_covered: true,
      blocked_no_go_fixture_covered: true,
      all_required_fixtures_covered: true,
    },
  )
})

// 25
test("all_test_memory fixture has all_test_memory clear scope evidence", () => {
  const f = VALID_ALL_TEST_MEMORY_RECORDER_AUDIT_SUMMARY_FIXTURE
  assert.ok(f.clear_scope_summary.includes("all_test_memory"))
  assert.ok(f.summarized_operation_names.includes("clearAllAuditEvents"))
})

// 26
test("all_test_memory fixture has non-durability evidence", () => {
  const f = VALID_ALL_TEST_MEMORY_RECORDER_AUDIT_SUMMARY_FIXTURE
  assert.ok(
    f.non_durability_summary.includes("test-only") || f.non_durability_summary.includes("non-durable"),
  )
})

// 27
test("every fixture has non_authorization_statement", () => {
  for (const f of FIXTURES) {
    assert.equal(typeof f.non_authorization_statement, "string")
    assert.ok(f.non_authorization_statement.includes("not approval"), f.summary_id)
    assert.ok(f.non_authorization_statement.includes("not production readiness"), f.summary_id)
  }
})

// 28
test("every fixture contains no approval/execution/persistence/storage/durable-storage/ledger/graph/audit-runtime/summary-runtime/promotion grant fields", () => {
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
  for (const f of FIXTURES) {
    for (const key of forbidden) {
      assert.equal(Object.prototype.hasOwnProperty.call(f, key), false, `${f.summary_id}:${key}`)
    }
  }
})

// 29
test("fixture factory functions return deterministic deep-equal records", () => {
  assert.deepEqual(
    createValidTenantRecorderAuditSummaryFixture(),
    createValidTenantRecorderAuditSummaryFixture(),
  )
  assert.deepEqual(
    createValidTenantRecorderAuditSummaryFixture(),
    VALID_TENANT_RECORDER_AUDIT_SUMMARY_FIXTURE,
  )
  assert.deepEqual(
    createValidAllTestMemoryRecorderAuditSummaryFixture(),
    VALID_ALL_TEST_MEMORY_RECORDER_AUDIT_SUMMARY_FIXTURE,
  )
  assert.deepEqual(
    createValidOperationSubsetRecorderAuditSummaryFixture(),
    VALID_OPERATION_SUBSET_RECORDER_AUDIT_SUMMARY_FIXTURE,
  )
  assert.deepEqual(
    createValidFixtureSuiteRecorderAuditSummaryFixture(),
    VALID_FIXTURE_SUITE_RECORDER_AUDIT_SUMMARY_FIXTURE,
  )
  assert.deepEqual(
    createBlockedNoGoRecorderAuditSummaryFixture(),
    BLOCKED_NO_GO_RECORDER_AUDIT_SUMMARY_FIXTURE,
  )
})

// 30
test("fixture constants are frozen or treated as immutable where practical", () => {
  for (const f of FIXTURES) {
    assert.ok(Object.isFrozen(f), f.summary_id)
    assert.ok(Object.isFrozen(f.operation_counts), f.summary_id)
    assert.ok(Object.isFrozen(f.no_go_flags), f.summary_id)
  }
  assert.ok(Object.isFrozen(ALL_RECORDER_AUDIT_SUMMARY_FIXTURES))
  assert.ok(Object.isFrozen(VALID_TENANT_RECORDER_AUDIT_SUMMARY_FIXTURE_INPUT))
  assert.ok(Object.isFrozen(VALID_ALL_TEST_MEMORY_RECORDER_AUDIT_SUMMARY_FIXTURE_INPUT))
  assert.ok(Object.isFrozen(VALID_OPERATION_SUBSET_RECORDER_AUDIT_SUMMARY_FIXTURE_INPUT))
  assert.ok(Object.isFrozen(VALID_FIXTURE_SUITE_RECORDER_AUDIT_SUMMARY_FIXTURE_INPUT))
  assert.ok(Object.isFrozen(BLOCKED_NO_GO_RECORDER_AUDIT_SUMMARY_FIXTURE_INPUT))
})

// 31
test("mutating a returned fixture copy does not mutate exported fixture constants", () => {
  const fresh = createValidTenantRecorderAuditSummaryFixture()
  const copy: Record<string, unknown> = { ...fresh }
  copy.summary_id = "mutated_summary_id"
  copy.tenant_id = "mutated_tenant"
  assert.equal(VALID_TENANT_RECORDER_AUDIT_SUMMARY_FIXTURE.summary_id, "ras_tenant_fixture_001")
  assert.equal(VALID_TENANT_RECORDER_AUDIT_SUMMARY_FIXTURE.tenant_id, "tenant_recorder_summary_fixture")
  const countsCopy: Record<string, number> = { ...fresh.operation_counts }
  countsCopy.record = 999
  assert.equal(VALID_TENANT_RECORDER_AUDIT_SUMMARY_FIXTURE.operation_counts.record, 1)
})

// 32
test("ALL_RECORDER_AUDIT_SUMMARY_FIXTURES contains exactly five fixtures", () => {
  assert.equal(ALL_RECORDER_AUDIT_SUMMARY_FIXTURES.length, 5)
})

// 33
test("ALL_RECORDER_AUDIT_SUMMARY_FIXTURES is deterministically ordered", () => {
  assert.deepEqual(
    ALL_RECORDER_AUDIT_SUMMARY_FIXTURES.map((f) => f.summary_id),
    [
      "ras_tenant_fixture_001",
      "ras_all_test_memory_fixture_001",
      "ras_operation_subset_fixture_001",
      "ras_fixture_suite_fixture_001",
      "ras_blocked_no_go_fixture_001",
    ],
  )
})

// 34
test("fixture inputs are exported", () => {
  assert.ok(VALID_TENANT_RECORDER_AUDIT_SUMMARY_FIXTURE_INPUT)
  assert.ok(VALID_ALL_TEST_MEMORY_RECORDER_AUDIT_SUMMARY_FIXTURE_INPUT)
  assert.ok(VALID_OPERATION_SUBSET_RECORDER_AUDIT_SUMMARY_FIXTURE_INPUT)
  assert.ok(VALID_FIXTURE_SUITE_RECORDER_AUDIT_SUMMARY_FIXTURE_INPUT)
  assert.ok(BLOCKED_NO_GO_RECORDER_AUDIT_SUMMARY_FIXTURE_INPUT)
  assert.equal(VALID_TENANT_RECORDER_AUDIT_SUMMARY_FIXTURE_INPUT.summary_id, "ras_tenant_fixture_001")
})

// 35
test("fixture source_loop/source lineage fields are fixed", () => {
  for (const f of FIXTURES) {
    assert.equal(f.source_loop, "P6-I5N", f.summary_id)
    assert.equal(f.source_recorder_loop, "P6-I5J", f.summary_id)
    assert.equal(f.source_fixture_loop, "P6-I5N", f.summary_id)
    assert.equal(f.source_validator_loop, "P6-I5L", f.summary_id)
  }
})

// 36 — behavior-level proof: factory output equals the exported constant,
// validates through P6-I5L, matches the scope-specific constructor contract,
// and carries the fixed target invariants.
test("fixtures are created through P6-I5M constructors", () => {
  const pairs: readonly (readonly [() => unknown, unknown, string])[] = [
    [createValidTenantRecorderAuditSummaryFixture, VALID_TENANT_RECORDER_AUDIT_SUMMARY_FIXTURE, "tenant"],
    [
      createValidAllTestMemoryRecorderAuditSummaryFixture,
      VALID_ALL_TEST_MEMORY_RECORDER_AUDIT_SUMMARY_FIXTURE,
      "all_test_memory",
    ],
    [
      createValidOperationSubsetRecorderAuditSummaryFixture,
      VALID_OPERATION_SUBSET_RECORDER_AUDIT_SUMMARY_FIXTURE,
      "operation_subset",
    ],
    [
      createValidFixtureSuiteRecorderAuditSummaryFixture,
      VALID_FIXTURE_SUITE_RECORDER_AUDIT_SUMMARY_FIXTURE,
      "fixture_suite",
    ],
    [createBlockedNoGoRecorderAuditSummaryFixture, BLOCKED_NO_GO_RECORDER_AUDIT_SUMMARY_FIXTURE, "tenant"],
  ]
  for (const [factory, constant, scope] of pairs) {
    const produced = factory() as {
      summary_scope: string
      recorder_target_class: string
      selected_target_class: string
    }
    assert.deepEqual(produced, constant)
    assert.equal(validateRecorderAuditSummaryRecord(produced).ok, true)
    assert.equal(produced.summary_scope, scope)
    assert.equal(produced.recorder_target_class, "in_memory_test_only_store")
    assert.equal(produced.selected_target_class, "in_memory_test_only_store")
  }
})

// 37
test("fixtures validate through P6-I5L validators", () => {
  for (const f of ALL_RECORDER_AUDIT_SUMMARY_FIXTURES) {
    const v = validateRecorderAuditSummaryRecord(f)
    assert.equal(v.ok, true, `${f.summary_id}: ${JSON.stringify(v.issues)}`)
  }
})

// 38
test("fixture module exports expected constants and factory functions", () => {
  assert.equal(typeof createValidTenantRecorderAuditSummaryFixture, "function")
  assert.equal(typeof createValidAllTestMemoryRecorderAuditSummaryFixture, "function")
  assert.equal(typeof createValidOperationSubsetRecorderAuditSummaryFixture, "function")
  assert.equal(typeof createValidFixtureSuiteRecorderAuditSummaryFixture, "function")
  assert.equal(typeof createBlockedNoGoRecorderAuditSummaryFixture, "function")
  assert.equal(typeof VALID_TENANT_RECORDER_AUDIT_SUMMARY_FIXTURE, "object")
  assert.equal(typeof VALID_ALL_TEST_MEMORY_RECORDER_AUDIT_SUMMARY_FIXTURE, "object")
  assert.equal(typeof VALID_OPERATION_SUBSET_RECORDER_AUDIT_SUMMARY_FIXTURE, "object")
  assert.equal(typeof VALID_FIXTURE_SUITE_RECORDER_AUDIT_SUMMARY_FIXTURE, "object")
  assert.equal(typeof BLOCKED_NO_GO_RECORDER_AUDIT_SUMMARY_FIXTURE, "object")
  assert.ok(Array.isArray(ALL_RECORDER_AUDIT_SUMMARY_FIXTURES))
})

// 39
test("fixture construction does not rely on self-match traps", () => {
  // Observable behavior is asserted both ways: real fixtures pass the
  // validator, and a corrupted variant fails it.
  assert.equal(validateRecorderAuditSummaryRecord(VALID_TENANT_RECORDER_AUDIT_SUMMARY_FIXTURE).ok, true)
  const corrupted = {
    ...VALID_TENANT_RECORDER_AUDIT_SUMMARY_FIXTURE,
    recorder_target_class: "blocked_target",
  }
  assert.equal(validateRecorderAuditSummaryRecord(corrupted).ok, false)
  assert.equal(validateRecorderAuditSummaryRecord({}).ok, false)
})

// 41 (kept adjacent; see source-guard block below for 40)
test("fixture validity remains non-authorizing", () => {
  for (const f of FIXTURES) {
    const v = validateRecorderAuditSummaryRecord(f)
    assert.deepEqual(Object.keys(v).sort(), ["issues", "ok"])
  }
})

// ─── Static source guard (read-only) ────────────────────────────

const SRC_FIXTURE = fileURLToPath(
  new URL("./fixtures/phase6/recorderAuditSummaryFixture.mts", import.meta.url),
)

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

// 40
test("source guard confirms fixture does not contain forbidden runtime capability substrings", () => {
  const text = readFileSync(SRC_FIXTURE, "utf8")
  for (const needle of FORBIDDEN_SOURCE_SUBSTRINGS) {
    assert.ok(!text.includes(needle), `fixture source must not contain: <<<${needle}>>>`)
  }
})
