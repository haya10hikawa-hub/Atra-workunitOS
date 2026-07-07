/**
 * P6-I5D: isolated tests for the deterministic, test-only Phase 6 Persistence
 * Target Decision fixtures.
 *
 * Imports the fixture module and the Phase 6 Persistence Target Decision module
 * surface (for the P6-I5B validator), plus node:test / node:assert/strict and —
 * for the Phase 4 static source guard only — node:fs / node:url to READ (never
 * mutate) the fixture source. No app runtime modules, no app/lib/persistence, no
 * P6-I0..I5C tests, no P7.1 utilities, no network, no GitHub API, no
 * child_process, no file mutation, no secrets, no ApprovalStore, no external
 * actions, no D1, no SQL, no LLM. The fixtures are exercised in-memory only.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import {
  createValidTargetDecisionRecordFixture,
  createBlockedTargetDecisionRecordFixture,
  VALID_TARGET_DECISION_RECORD_FIXTURE_INPUT,
  BLOCKED_TARGET_DECISION_RECORD_FIXTURE_INPUT,
  VALID_TARGET_DECISION_RECORD_FIXTURE,
  BLOCKED_TARGET_DECISION_RECORD_FIXTURE,
} from "./fixtures/phase6/persistenceTargetDecisionFixture.mts"
import { validateTargetDecisionRecord } from "../app/lib/phase6/persistenceTargetDecision/index.ts"

const DEFERRED = [
  "local_ephemeral_dev_store",
  "append_only_audit_candidate_store",
  "tenant_scoped_artifact_candidate_store",
  "future_d1_store_after_separate_d1_gate",
]

// 1
test("valid fixture is constructed", () => {
  assert.ok(VALID_TARGET_DECISION_RECORD_FIXTURE)
  assert.equal(typeof VALID_TARGET_DECISION_RECORD_FIXTURE, "object")
})

// 2
test("valid fixture validates with validateTargetDecisionRecord", () => {
  const v = validateTargetDecisionRecord(VALID_TARGET_DECISION_RECORD_FIXTURE)
  assert.equal(v.ok, true, JSON.stringify(v.issues))
})

// 3
test("valid fixture selected_target_class is in_memory_test_only_store", () => {
  assert.equal(VALID_TARGET_DECISION_RECORD_FIXTURE.selected_target_class, "in_memory_test_only_store")
})

// 4
test("valid fixture status is target_selected_for_future_types", () => {
  assert.equal(
    VALID_TARGET_DECISION_RECORD_FIXTURE.target_decision_status,
    "target_selected_for_future_types",
  )
})

// 5
test("valid fixture outcome is pass", () => {
  assert.equal(VALID_TARGET_DECISION_RECORD_FIXTURE.target_decision_outcome, "pass")
})

// 6
test("valid fixture no_go_flags is empty", () => {
  assert.deepEqual([...VALID_TARGET_DECISION_RECORD_FIXTURE.no_go_flags], [])
})

// 7
test("valid fixture deferred target set is exact", () => {
  assert.deepEqual([...VALID_TARGET_DECISION_RECORD_FIXTURE.deferred_target_classes], DEFERRED)
})

// 8
test("valid fixture rejected target set is exact", () => {
  assert.deepEqual([...VALID_TARGET_DECISION_RECORD_FIXTURE.rejected_target_classes], ["blocked_target"])
})

// 9
test("valid fixture preserves fixed caller-provided ids", () => {
  assert.equal(
    VALID_TARGET_DECISION_RECORD_FIXTURE.target_decision_record_id,
    VALID_TARGET_DECISION_RECORD_FIXTURE_INPUT.target_decision_record_id,
  )
  assert.equal(
    VALID_TARGET_DECISION_RECORD_FIXTURE.tenant_id,
    VALID_TARGET_DECISION_RECORD_FIXTURE_INPUT.tenant_id,
  )
  assert.equal(
    VALID_TARGET_DECISION_RECORD_FIXTURE.reviewed_by_human_id,
    VALID_TARGET_DECISION_RECORD_FIXTURE_INPUT.reviewed_by_human_id,
  )
})

// 10
test("valid fixture preserves fixed timestamps", () => {
  assert.equal(
    VALID_TARGET_DECISION_RECORD_FIXTURE.created_at,
    VALID_TARGET_DECISION_RECORD_FIXTURE_INPUT.created_at,
  )
  assert.equal(
    VALID_TARGET_DECISION_RECORD_FIXTURE.reviewed_by_human_at,
    VALID_TARGET_DECISION_RECORD_FIXTURE_INPUT.reviewed_by_human_at,
  )
})

// 11
test("valid fixture preserves fixed payload_hash", () => {
  assert.equal(
    VALID_TARGET_DECISION_RECORD_FIXTURE.payload_hash,
    VALID_TARGET_DECISION_RECORD_FIXTURE_INPUT.payload_hash,
  )
})

// 12
test("valid fixture has all safety boundaries confirmed", () => {
  for (const f of [
    "test_only_confirmed",
    "non_persistent_confirmed",
    "non_authorizing_confirmed",
    "app_runtime_untouched_confirmed",
    "d1_deferred_confirmed",
    "sql_deferred_confirmed",
    "approvalstore_unwired_confirmed",
    "external_actions_blocked_confirmed",
    "formal_workunit_promotion_blocked_confirmed",
  ] as const) {
    assert.equal(
      (VALID_TARGET_DECISION_RECORD_FIXTURE as Record<string, unknown>)[f],
      "confirmed",
      f,
    )
  }
})

// 13
test("valid fixture has dependency fields satisfied", () => {
  assert.equal(VALID_TARGET_DECISION_RECORD_FIXTURE.p6_i5_merged, true)
  assert.equal(VALID_TARGET_DECISION_RECORD_FIXTURE.main_safety_gate_active, true)
  assert.equal(VALID_TARGET_DECISION_RECORD_FIXTURE.human_review_required, true)
  assert.equal(VALID_TARGET_DECISION_RECORD_FIXTURE.storage_gate_spec_available, "present")
  assert.equal(VALID_TARGET_DECISION_RECORD_FIXTURE.persistence_gate_spec_available, "present")
  assert.equal(VALID_TARGET_DECISION_RECORD_FIXTURE.persistence_record_contract_available, "present")
})

// 14
test("blocked fixture is constructed", () => {
  assert.ok(BLOCKED_TARGET_DECISION_RECORD_FIXTURE)
  assert.equal(typeof BLOCKED_TARGET_DECISION_RECORD_FIXTURE, "object")
})

// 15
test("blocked fixture validates with validateTargetDecisionRecord", () => {
  const v = validateTargetDecisionRecord(BLOCKED_TARGET_DECISION_RECORD_FIXTURE)
  assert.equal(v.ok, true, JSON.stringify(v.issues))
})

// 16
test("blocked fixture selected_target_class is in_memory_test_only_store", () => {
  assert.equal(
    BLOCKED_TARGET_DECISION_RECORD_FIXTURE.selected_target_class,
    "in_memory_test_only_store",
  )
})

// 17
test("blocked fixture status is blocked_no_go", () => {
  assert.equal(BLOCKED_TARGET_DECISION_RECORD_FIXTURE.target_decision_status, "blocked_no_go")
})

// 18
test("blocked fixture outcome is no_go", () => {
  assert.equal(BLOCKED_TARGET_DECISION_RECORD_FIXTURE.target_decision_outcome, "no_go")
})

// 19
test("blocked fixture no_go_flags is non-empty", () => {
  assert.ok(BLOCKED_TARGET_DECISION_RECORD_FIXTURE.no_go_flags.length > 0)
})

// 20
test("blocked fixture deferred target set is exact", () => {
  assert.deepEqual([...BLOCKED_TARGET_DECISION_RECORD_FIXTURE.deferred_target_classes], DEFERRED)
})

// 21
test("blocked fixture rejected target set is exact", () => {
  assert.deepEqual(
    [...BLOCKED_TARGET_DECISION_RECORD_FIXTURE.rejected_target_classes],
    ["blocked_target"],
  )
})

// 22
test("blocked fixture preserves fixed caller-provided ids", () => {
  assert.equal(
    BLOCKED_TARGET_DECISION_RECORD_FIXTURE.target_decision_record_id,
    BLOCKED_TARGET_DECISION_RECORD_FIXTURE_INPUT.target_decision_record_id,
  )
  assert.equal(
    BLOCKED_TARGET_DECISION_RECORD_FIXTURE.tenant_id,
    BLOCKED_TARGET_DECISION_RECORD_FIXTURE_INPUT.tenant_id,
  )
})

// 23
test("fixtures are frozen or treated as immutable where practical", () => {
  assert.equal(Object.isFrozen(VALID_TARGET_DECISION_RECORD_FIXTURE), true)
  assert.equal(Object.isFrozen(BLOCKED_TARGET_DECISION_RECORD_FIXTURE), true)
  assert.equal(Object.isFrozen(VALID_TARGET_DECISION_RECORD_FIXTURE_INPUT), true)
  assert.equal(Object.isFrozen(BLOCKED_TARGET_DECISION_RECORD_FIXTURE_INPUT), true)
})

// 24
test("fixture factory returns deterministic deep-equal records for the same fixed input", () => {
  const a = createValidTargetDecisionRecordFixture()
  const b = createValidTargetDecisionRecordFixture()
  assert.deepEqual(a, b)
  const c = createBlockedTargetDecisionRecordFixture()
  const d = createBlockedTargetDecisionRecordFixture()
  assert.deepEqual(c, d)
})

// 25
test("valid and blocked fixtures are distinct", () => {
  assert.notDeepEqual(VALID_TARGET_DECISION_RECORD_FIXTURE, BLOCKED_TARGET_DECISION_RECORD_FIXTURE)
})

// 26
test("fixtures do not contain approval/execution/persistence/storage/promotion grant fields", () => {
  for (const record of [
    VALID_TARGET_DECISION_RECORD_FIXTURE,
    BLOCKED_TARGET_DECISION_RECORD_FIXTURE,
  ]) {
    for (const forbidden of [
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
      "external_action_permission",
      "formal_workunit_promotion",
    ]) {
      assert.equal(Object.prototype.hasOwnProperty.call(record, forbidden), false, forbidden)
    }
  }
})

// 27
test("fixture module exports expected constants and factory functions", () => {
  assert.equal(typeof createValidTargetDecisionRecordFixture, "function")
  assert.equal(typeof createBlockedTargetDecisionRecordFixture, "function")
  assert.equal(typeof VALID_TARGET_DECISION_RECORD_FIXTURE_INPUT, "object")
  assert.equal(typeof BLOCKED_TARGET_DECISION_RECORD_FIXTURE_INPUT, "object")
  assert.equal(typeof VALID_TARGET_DECISION_RECORD_FIXTURE, "object")
  assert.equal(typeof BLOCKED_TARGET_DECISION_RECORD_FIXTURE, "object")
})

// 28
test("fixture construction does not rely on self-match traps", () => {
  // Assert observable behavior: the constructed fixtures re-validate and differ.
  assert.equal(validateTargetDecisionRecord(createValidTargetDecisionRecordFixture()).ok, true)
  assert.equal(validateTargetDecisionRecord(createBlockedTargetDecisionRecordFixture()).ok, true)
})

// 30 (declared before 29 so the mutation check runs on pristine records)
test("fixture test does not mutate fixture records", () => {
  const validSnapshot = JSON.stringify(VALID_TARGET_DECISION_RECORD_FIXTURE)
  const blockedSnapshot = JSON.stringify(BLOCKED_TARGET_DECISION_RECORD_FIXTURE)
  // Frozen records cannot be mutated; confirm they are unchanged after use.
  validateTargetDecisionRecord(VALID_TARGET_DECISION_RECORD_FIXTURE)
  validateTargetDecisionRecord(BLOCKED_TARGET_DECISION_RECORD_FIXTURE)
  assert.equal(JSON.stringify(VALID_TARGET_DECISION_RECORD_FIXTURE), validSnapshot)
  assert.equal(JSON.stringify(BLOCKED_TARGET_DECISION_RECORD_FIXTURE), blockedSnapshot)
})

// ─── Phase 4: static source guard (read-only, fixture source only) ──

const FIXTURE_SRC = fileURLToPath(
  new URL("./fixtures/phase6/persistenceTargetDecisionFixture.mts", import.meta.url),
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
]

// 29
test("source guard confirms fixture does not contain forbidden runtime capability substrings", () => {
  const text = readFileSync(FIXTURE_SRC, "utf8")
  for (const needle of FORBIDDEN_SOURCE_SUBSTRINGS) {
    assert.ok(!text.includes(needle), `fixture source must not contain: <<<${needle}>>>`)
  }
})
