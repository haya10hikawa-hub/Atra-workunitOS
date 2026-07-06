/**
 * P6-I5C: isolated tests for the pure Phase 6 Persistence Target Decision
 * constructors.
 *
 * Imports the module public surface (app/lib/phase6/persistenceTargetDecision/
 * index.ts) plus node:test / node:assert/strict, and — for the Phase 7 static
 * source guards only — node:fs / node:url to READ (never mutate) the two
 * constructor source files. No app runtime modules, no app/lib/persistence, no
 * P6-I0..I5B code, no P7.1 utilities, no network, no GitHub API, no
 * child_process, no file mutation, no secrets, no ApprovalStore, no external
 * actions, no D1, no SQL, no LLM. Constructors are exercised over in-memory
 * objects only.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import {
  createTargetDecisionRecord,
  createBlockedTargetDecisionRecord,
  validateTargetDecisionRecord,
  type CreateTargetDecisionRecordInput,
  type CreateBlockedTargetDecisionRecordInput,
} from "../app/lib/phase6/persistenceTargetDecision/index.ts"

const HASH = "b".repeat(64)
const TS = "2026-07-06T15:00:00Z"

function validInput(): CreateTargetDecisionRecordInput {
  return {
    target_decision_record_id: "tdr_1",
    tenant_id: "tenant_1",
    decision_rationale: "safest first target",
    selected_target_rationale: "no persistence, deterministic",
    deferred_target_rationales: ["filesystem risk"],
    rejected_target_rationales: ["blocked_target is explicit No-Go"],
    d1_deferral_rationale: "d1 gate not yet executed",
    sql_deferral_rationale: "query-language execution separately gated",
    approvalstore_deferral_rationale: "approval-store remains unwired",
    external_action_deferral_rationale: "external actions blocked",
    p6_i5_merge_commit: "56394e7",
    reviewed_by_human_at: TS,
    reviewed_by_human_id: "human_1",
    reviewer_role: "maintainer",
    review_rationale: "reviewed for future fixture work",
    next_slice_scope: "test-only persistence target decision fixture",
    forbidden_next_slice_capabilities: ["persistence", "d1_execution"],
    d1_gate_requirement: "separate d1 persistence gate",
    external_action_gate_requirement: "separate external action gate",
    approvalstore_gate_requirement: "separate approval-store gate",
    created_at: TS,
    payload_hash: HASH,
  }
}

function validBlockedInput(): CreateBlockedTargetDecisionRecordInput {
  return { ...validInput(), no_go_flags: ["blocked_target_selected"] }
}

function asInput(o: object): CreateTargetDecisionRecordInput {
  return o as unknown as CreateTargetDecisionRecordInput
}

const DEFERRED = [
  "local_ephemeral_dev_store",
  "append_only_audit_candidate_store",
  "tenant_scoped_artifact_candidate_store",
  "future_d1_store_after_separate_d1_gate",
]

// 1
test("createTargetDecisionRecord returns ok for valid input", () => {
  const r = createTargetDecisionRecord(validInput())
  assert.equal(r.ok, true, JSON.stringify(r))
})

// 2
test("created record validates with validateTargetDecisionRecord", () => {
  const r = createTargetDecisionRecord(validInput())
  assert.equal(r.ok, true)
  if (r.ok) {
    const v = validateTargetDecisionRecord(r.record)
    assert.equal(v.ok, true, JSON.stringify(v.issues))
  }
})

// 3
test("createTargetDecisionRecord selects in_memory_test_only_store", () => {
  const r = createTargetDecisionRecord(validInput())
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.record.selected_target_class, "in_memory_test_only_store")
})

// 4
test("deferred target set is exact", () => {
  const r = createTargetDecisionRecord(validInput())
  assert.equal(r.ok, true)
  if (r.ok) assert.deepEqual([...r.record.deferred_target_classes], DEFERRED)
})

// 5
test("rejected target set is exact", () => {
  const r = createTargetDecisionRecord(validInput())
  assert.equal(r.ok, true)
  if (r.ok) assert.deepEqual([...r.record.rejected_target_classes], ["blocked_target"])
})

// 6
test("createTargetDecisionRecord sets all safety boundaries to confirmed", () => {
  const r = createTargetDecisionRecord(validInput())
  assert.equal(r.ok, true)
  if (r.ok) {
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
      assert.equal((r.record as Record<string, unknown>)[f], "confirmed", f)
    }
  }
})

// 7
test("createTargetDecisionRecord sets p6_i5_merged true", () => {
  const r = createTargetDecisionRecord(validInput())
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.record.p6_i5_merged, true)
})

// 8
test("createTargetDecisionRecord sets main_safety_gate_active true", () => {
  const r = createTargetDecisionRecord(validInput())
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.record.main_safety_gate_active, true)
})

// 9
test("createTargetDecisionRecord sets human_review_required true", () => {
  const r = createTargetDecisionRecord(validInput())
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.record.human_review_required, true)
})

// 10
test("caller-provided ids are preserved", () => {
  const r = createTargetDecisionRecord(validInput())
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.record.target_decision_record_id, "tdr_1")
    assert.equal(r.record.tenant_id, "tenant_1")
    assert.equal(r.record.reviewed_by_human_id, "human_1")
  }
})

// 11
test("caller-provided timestamps are preserved", () => {
  const r = createTargetDecisionRecord(validInput())
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.record.created_at, TS)
    assert.equal(r.record.reviewed_by_human_at, TS)
  }
})

// 12
test("caller-provided payload_hash is preserved", () => {
  const r = createTargetDecisionRecord(validInput())
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.record.payload_hash, HASH)
})

// 13
test("constructor does not generate current time", () => {
  // created_at / reviewed_by_human_at equal the caller values exactly; a clock
  // read would produce a different string.
  const input = validInput()
  const r = createTargetDecisionRecord(input)
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.record.created_at, input.created_at)
    assert.equal(r.record.reviewed_by_human_at, input.reviewed_by_human_at)
  }
})

// 14
test("constructor does not generate random ids", () => {
  const input = validInput()
  const r = createTargetDecisionRecord(input)
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.record.target_decision_record_id, input.target_decision_record_id)
    assert.equal(r.record.payload_hash, input.payload_hash)
  }
})

// 15
test("constructor does not mutate input", () => {
  const input = validInput()
  const before = JSON.stringify(input)
  createTargetDecisionRecord(input)
  assert.equal(JSON.stringify(input), before)
})

// 16
test("invalid payload_hash returns fail result", () => {
  const r = createTargetDecisionRecord(asInput({ ...validInput(), payload_hash: "not-a-hash" }))
  assert.equal(r.ok, false)
  if (!r.ok) assert.ok(r.issues.some((i) => i.code === "validation_failed"))
})

// 17
test("missing required caller input returns fail result", () => {
  const partial = { ...validInput() } as Record<string, unknown>
  delete partial.tenant_id
  const r = createTargetDecisionRecord(asInput(partial))
  assert.equal(r.ok, false)
})

// 18
test("constructor issue messages do not echo secret-like values", () => {
  const secret = "SUPER_SECRET_abc123"
  const r = createTargetDecisionRecord(asInput({ ...validInput(), payload_hash: secret }))
  assert.equal(r.ok, false)
  if (!r.ok) {
    for (const i of r.issues) {
      assert.equal(i.message, `${i.code}:${i.field}`)
      assert.ok(!i.message.includes(secret))
    }
  }
})

// 19
test("createBlockedTargetDecisionRecord returns ok with non-empty no_go_flags", () => {
  const r = createBlockedTargetDecisionRecord(validBlockedInput())
  assert.equal(r.ok, true, JSON.stringify(r))
  if (r.ok) assert.ok(r.record.no_go_flags.length > 0)
})

// 20
test("blocked constructor sets status blocked_no_go", () => {
  const r = createBlockedTargetDecisionRecord(validBlockedInput())
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.record.target_decision_status, "blocked_no_go")
})

// 21
test("blocked constructor sets outcome no_go", () => {
  const r = createBlockedTargetDecisionRecord(validBlockedInput())
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.record.target_decision_outcome, "no_go")
})

// 22
test("blocked constructor fails when no_go_flags is empty", () => {
  const r = createBlockedTargetDecisionRecord({ ...validInput(), no_go_flags: [] })
  assert.equal(r.ok, false)
  if (!r.ok) assert.ok(r.issues.some((i) => i.code === "invalid_constructor_input"))
})

// 23
test("constructors reject invalid selected target override if attempted", () => {
  // Attempting to override selected_target_class is not honored: the fixed
  // selection always wins, so no deferred/rejected class can be selected.
  const r = createTargetDecisionRecord(
    asInput({ ...validInput(), selected_target_class: "blocked_target" }),
  )
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.record.selected_target_class, "in_memory_test_only_store")
})

// 24
test("constructors do not create approval/execution/persistence/storage/promotion fields", () => {
  const r = createTargetDecisionRecord(validInput())
  assert.equal(r.ok, true)
  if (r.ok) {
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
      assert.equal(Object.prototype.hasOwnProperty.call(r.record, forbidden), false, forbidden)
      assert.equal(Object.prototype.hasOwnProperty.call(r, forbidden), false, forbidden)
    }
  }
})

// 25
test("construction result failure has no record field", () => {
  const r = createTargetDecisionRecord(asInput({ ...validInput(), payload_hash: "bad" }))
  assert.equal(r.ok, false)
  assert.equal(Object.prototype.hasOwnProperty.call(r, "record"), false)
})

// 26
test("construction result success has empty issues", () => {
  const r = createTargetDecisionRecord(validInput())
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.issues.length, 0)
})

// 27
test("index exports constructors and construction helpers", () => {
  assert.equal(typeof createTargetDecisionRecord, "function")
  assert.equal(typeof createBlockedTargetDecisionRecord, "function")
})

// 28
test("constructors do not rely on self-match traps", () => {
  // Assert observable behavior: valid input constructs; broken input fails.
  assert.equal(createTargetDecisionRecord(validInput()).ok, true)
  assert.equal(createTargetDecisionRecord(asInput({})).ok, false)
})

// 29
test("constructors are deterministic for same input", () => {
  const a = createTargetDecisionRecord(validInput())
  const b = createTargetDecisionRecord(validInput())
  assert.equal(a.ok, true)
  assert.equal(b.ok, true)
  if (a.ok && b.ok) assert.deepEqual(a.record, b.record)
})

// 30
test("constructors produce different records only when caller input differs", () => {
  const a = createTargetDecisionRecord(validInput())
  const b = createTargetDecisionRecord({ ...validInput(), tenant_id: "tenant_2" })
  assert.equal(a.ok, true)
  assert.equal(b.ok, true)
  if (a.ok && b.ok) {
    assert.notDeepEqual(a.record, b.record)
    assert.equal(b.record.tenant_id, "tenant_2")
  }
})

// 31
test("normal invalid input does not throw", () => {
  for (const bad of [null, undefined, 42, "x", [], {}]) {
    const r = createTargetDecisionRecord(asInput(bad as object))
    assert.equal(r.ok, false)
  }
})

// 32
test("forbidden grant-like input fails via validator", () => {
  const r = createTargetDecisionRecord(asInput({ ...validInput(), approval: true }))
  assert.equal(r.ok, false)
  if (!r.ok) assert.ok(r.issues.some((i) => i.code === "validation_failed"))
})

// ─── Phase 7: static source guards (read-only) ──────────────────

const SRC_CONSTRUCTION = fileURLToPath(
  new URL("../app/lib/phase6/persistenceTargetDecision/construction.ts", import.meta.url),
)
const SRC_CONSTRUCTORS = fileURLToPath(
  new URL("../app/lib/phase6/persistenceTargetDecision/constructors.ts", import.meta.url),
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

test("constructor sources contain no forbidden impurity or capability tokens", () => {
  for (const src of [SRC_CONSTRUCTION, SRC_CONSTRUCTORS]) {
    const text = readFileSync(src, "utf8")
    for (const needle of FORBIDDEN_SOURCE_SUBSTRINGS) {
      assert.ok(!text.includes(needle), `${src} must not contain: <<<${needle}>>>`)
    }
  }
})
