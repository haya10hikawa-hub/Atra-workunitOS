/**
 * P6-I5B: isolated tests for the Phase 6 Persistence Target Decision validators.
 *
 * Imports ONLY node:test, node:assert/strict, and the module public surface
 * (app/lib/phase6/persistenceTargetDecision/index.ts). No app runtime modules,
 * no app/lib/persistence, no P6-I0..I5A code, no P7.1 utilities, no network, no
 * GitHub API, no child_process, no file mutation, no secrets, no ApprovalStore,
 * no external actions, no D1, no SQL, no LLM. These tests exercise pure
 * validators over in-memory objects only.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import {
  validateTargetDecisionRecord,
  isPersistenceTargetClass,
  isDeferredPersistenceTargetClass,
  isRejectedPersistenceTargetClass,
  isTargetDecisionStatus,
  isTargetDecisionOutcome,
  isSafetyBoundaryResult,
  isDependencyStatus,
  isSha256Hex,
  isIsoTimestamp,
} from "../app/lib/phase6/persistenceTargetDecision/index.ts"

const HASH = "a".repeat(64) // 64-char lowercase hex
const TS = "2026-07-06T12:34:56Z"

/** A fully valid TargetDecisionRecord that must pass with ok=true. */
function validRecord(): Record<string, unknown> {
  return {
    target_decision_record_id: "tdr_1",
    tenant_id: "tenant_1",
    target_decision_status: "target_selected_for_future_types",
    target_decision_outcome: "pass",
    selected_target_class: "in_memory_test_only_store",
    deferred_target_classes: [
      "local_ephemeral_dev_store",
      "append_only_audit_candidate_store",
      "tenant_scoped_artifact_candidate_store",
      "future_d1_store_after_separate_d1_gate",
    ],
    rejected_target_classes: ["blocked_target"],
    decision_rationale: "safest first target",
    selected_target_rationale: "no persistence, deterministic to validate",
    deferred_target_rationales: ["filesystem risk", "audit semantics first"],
    rejected_target_rationales: ["blocked_target is explicit No-Go"],
    d1_deferral_rationale: "D1 gate not yet executed",
    sql_deferral_rationale: "SQL execution separately gated",
    approvalstore_deferral_rationale: "ApprovalStore remains unwired",
    external_action_deferral_rationale: "external actions blocked",
    test_only_confirmed: "confirmed",
    non_persistent_confirmed: "confirmed",
    non_authorizing_confirmed: "confirmed",
    app_runtime_untouched_confirmed: "confirmed",
    d1_deferred_confirmed: "confirmed",
    sql_deferred_confirmed: "confirmed",
    approvalstore_unwired_confirmed: "confirmed",
    external_actions_blocked_confirmed: "confirmed",
    formal_workunit_promotion_blocked_confirmed: "confirmed",
    p6_i5_merged: true,
    p6_i5_merge_commit: "48ab8d8",
    storage_gate_spec_available: "present",
    persistence_gate_spec_available: "present",
    persistence_record_contract_available: "present",
    main_safety_gate_active: true,
    human_review_required: true,
    reviewed_by_human_at: TS,
    reviewed_by_human_id: "human_1",
    reviewer_role: "maintainer",
    review_rationale: "reviewed and approved for future types",
    next_slice: "P6-I5C",
    next_slice_scope: "pure persistence target decision constructors only",
    forbidden_next_slice_capabilities: ["persistence", "d1_execution"],
    d1_gate_requirement: "separate D1 persistence gate",
    external_action_gate_requirement: "separate external action gate",
    approvalstore_gate_requirement: "separate ApprovalStore gate",
    created_at: TS,
    payload_hash: HASH,
    no_go_flags: [],
  }
}

function without(field: string): Record<string, unknown> {
  const r = validRecord()
  delete r[field]
  return r
}

function withField(field: string, value: unknown): Record<string, unknown> {
  const r = validRecord()
  r[field] = value
  return r
}

function hasCode(
  result: { issues: readonly { code: string; field: string }[] },
  code: string,
): boolean {
  return result.issues.some((i) => i.code === code)
}

// ─── P6-FIX-004 (Issue #115): semantic ISO-8601 UTC timestamp guard ─────────
// created_at and reviewed_by_human_at now reject non-existent calendar values
// via the shared semantic guard, using the module's existing invalid_timestamp
// code. Valid leap-day / fractional timestamps still pass.
const PTD_TIMESTAMP_FIELDS = ["created_at", "reviewed_by_human_at"] as const
const PTD_PINNED_INVALID = ["2026-13-01T00:00:00Z", "2026-02-30T00:00:00Z", "2026-01-01T25:00:00Z"]

test("target decision timestamp fields reject pinned invalid calendar values", () => {
  for (const field of PTD_TIMESTAMP_FIELDS) {
    for (const bad of PTD_PINNED_INVALID) {
      const result = validateTargetDecisionRecord(withField(field, bad))
      const tsIssues = result.issues.filter((i) => i.code === "invalid_timestamp")
      assert.ok(tsIssues.length > 0, `${field}: expected invalid_timestamp for ${bad}`)
      assert.ok(tsIssues.some((i) => i.field === field), `${field}: issue must point at ${field}`)
      for (const i of result.issues) {
        assert.equal(i.message, `${i.code}:${i.field}`)
        assert.ok(!i.message.includes(bad), `${field}: message must not echo timestamp`)
      }
    }
    for (const good of ["2024-02-29T12:34:56Z", "2026-01-01T00:00:00.123Z"]) {
      const result = validateTargetDecisionRecord(withField(field, good))
      assert.ok(!hasCode(result, "invalid_timestamp"), `${field}: valid ${good} must pass`)
    }
  }
})

// 1
test("valid TargetDecisionRecord passes", () => {
  const result = validateTargetDecisionRecord(validRecord())
  assert.equal(result.ok, true, JSON.stringify(result.issues))
  assert.equal(result.issues.length, 0)
})

// 2
test("selected_target_class must be in_memory_test_only_store", () => {
  const result = validateTargetDecisionRecord(withField("selected_target_class", "something_else"))
  assert.equal(result.ok, false)
  assert.ok(hasCode(result, "invalid_selected_target_class"))
})

// 3-7: no deferred/rejected class may be selected
for (const bad of [
  "local_ephemeral_dev_store",
  "append_only_audit_candidate_store",
  "tenant_scoped_artifact_candidate_store",
  "future_d1_store_after_separate_d1_gate",
  "blocked_target",
]) {
  test(`${bad} cannot be selected`, () => {
    const result = validateTargetDecisionRecord(withField("selected_target_class", bad))
    assert.equal(result.ok, false)
    assert.ok(hasCode(result, "invalid_selected_target_class"))
  })
}

// 8
test("deferred_target_classes must contain all four deferred targets", () => {
  const result = validateTargetDecisionRecord(
    withField("deferred_target_classes", [
      "local_ephemeral_dev_store",
      "append_only_audit_candidate_store",
      "tenant_scoped_artifact_candidate_store",
    ]),
  )
  assert.equal(result.ok, false)
  assert.ok(hasCode(result, "missing_deferred_target_class"))
})

// 9
test("deferred_target_classes rejects unexpected target", () => {
  const result = validateTargetDecisionRecord(
    withField("deferred_target_classes", [
      "local_ephemeral_dev_store",
      "append_only_audit_candidate_store",
      "tenant_scoped_artifact_candidate_store",
      "future_d1_store_after_separate_d1_gate",
      "blocked_target",
    ]),
  )
  assert.equal(result.ok, false)
  assert.ok(hasCode(result, "unexpected_deferred_target_class"))
})

// 10
test("rejected_target_classes must contain blocked_target only", () => {
  const missing = validateTargetDecisionRecord(withField("rejected_target_classes", []))
  assert.equal(missing.ok, false)
  assert.ok(hasCode(missing, "missing_rejected_target_class"))

  const extra = validateTargetDecisionRecord(
    withField("rejected_target_classes", ["blocked_target", "local_ephemeral_dev_store"]),
  )
  assert.equal(extra.ok, false)
  assert.ok(hasCode(extra, "unexpected_rejected_target_class"))
})

// 11
test("missing required field fails", () => {
  const result = validateTargetDecisionRecord(without("tenant_id"))
  assert.equal(result.ok, false)
  assert.ok(hasCode(result, "missing_required_field"))
})

// 12
test("null required field fails", () => {
  const result = validateTargetDecisionRecord(withField("tenant_id", null))
  assert.equal(result.ok, false)
  assert.ok(hasCode(result, "null_required_field"))
})

// 13
test("non-object input fails", () => {
  for (const bad of ["string", 42, true, undefined, null]) {
    const result = validateTargetDecisionRecord(bad)
    assert.equal(result.ok, false)
    assert.ok(hasCode(result, "invalid_record"))
  }
})

// 14
test("array input fails", () => {
  const result = validateTargetDecisionRecord([])
  assert.equal(result.ok, false)
  assert.ok(hasCode(result, "invalid_record"))
})

// 15
test("unknown top-level field fails", () => {
  const result = validateTargetDecisionRecord(withField("surprise_field", "x"))
  assert.equal(result.ok, false)
  assert.ok(hasCode(result, "unknown_field"))
})

// 16
test("invalid timestamp fails", () => {
  const result = validateTargetDecisionRecord(withField("created_at", "2026/07/06 12:00"))
  assert.equal(result.ok, false)
  assert.ok(hasCode(result, "invalid_timestamp"))
})

// 17
test("invalid payload_hash fails", () => {
  const result = validateTargetDecisionRecord(withField("payload_hash", "ABC123"))
  assert.equal(result.ok, false)
  assert.ok(hasCode(result, "invalid_sha256_hex"))
})

// 18
test("safety boundary not confirmed fails", () => {
  const result = validateTargetDecisionRecord(withField("test_only_confirmed", "not_checked"))
  assert.equal(result.ok, false)
  assert.ok(hasCode(result, "safety_boundary_not_confirmed"))
})

// 19
test("p6_i5_merged false fails", () => {
  const result = validateTargetDecisionRecord(withField("p6_i5_merged", false))
  assert.equal(result.ok, false)
  assert.ok(hasCode(result, "dependency_not_satisfied"))
})

// 20
test("main_safety_gate_active false fails", () => {
  const result = validateTargetDecisionRecord(withField("main_safety_gate_active", false))
  assert.equal(result.ok, false)
  assert.ok(hasCode(result, "dependency_not_satisfied"))
})

// 21
test("human_review_required false fails", () => {
  const result = validateTargetDecisionRecord(withField("human_review_required", false))
  assert.equal(result.ok, false)
  assert.ok(hasCode(result, "human_review_required"))
})

// 22
test("no_go_flags non-empty fails unless status is blocked_no_go", () => {
  const result = validateTargetDecisionRecord(withField("no_go_flags", ["some_flag"]))
  assert.equal(result.ok, false)
  assert.ok(hasCode(result, "no_go_flags_present"))
})

// 23
test("blocked_no_go may carry no_go_flags", () => {
  const r = validRecord()
  r.target_decision_status = "blocked_no_go"
  r.no_go_flags = ["blocked_target_selected"]
  const result = validateTargetDecisionRecord(r)
  assert.equal(hasCode(result, "no_go_flags_present"), false)
})

// 24 (P6-FIX-005, Issue #116): the canonical 20-name grant-like denylist.
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
    const result = validateTargetDecisionRecord(withField(grant, suppliedValue))
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
  const unknown = validateTargetDecisionRecord(withField("unrelated_mystery_key", "x"))
  assert.equal(unknown.ok, false)
  assert.ok(hasCode(unknown, "unknown_field"))
  assert.equal(hasCode(unknown, "forbidden_grant_field_present"), false)
})

// 25
test("validation issue messages do not echo secret-like values", () => {
  const secret = "SUPER_SECRET_TOKEN_abc123"
  const result = validateTargetDecisionRecord(withField("tenant_id", secret))
  // tenant_id becomes an invalid type only if not a string; here it's a valid
  // string, so force a failure elsewhere while carrying the secret in a field.
  const withSecretHash = validateTargetDecisionRecord(withField("payload_hash", secret))
  for (const r of [result, withSecretHash]) {
    for (const i of r.issues) {
      assert.equal(i.message, `${i.code}:${i.field}`)
      assert.ok(!i.message.includes(secret))
    }
  }
})

// 26
test("validator does not mutate input", () => {
  const r = validRecord()
  const snapshotJson = JSON.stringify(r)
  validateTargetDecisionRecord(r)
  assert.equal(JSON.stringify(r), snapshotJson)
})

// 27
test("validator uses single-read snapshot against getter-TOCTOU input", () => {
  let reads = 0
  const base = validRecord()
  // A getter that returns a valid value first, then an invalid value.
  const toctou: Record<string, unknown> = { ...base }
  delete toctou.selected_target_class
  Object.defineProperty(toctou, "selected_target_class", {
    enumerable: true,
    configurable: true,
    get() {
      reads += 1
      return reads === 1 ? "in_memory_test_only_store" : "blocked_target"
    },
  })
  const result = validateTargetDecisionRecord(toctou)
  // The getter is read exactly once into the snapshot; the first (valid) value
  // is used, so the record passes and no second read can flip it.
  assert.equal(reads, 1)
  assert.equal(result.ok, true, JSON.stringify(result.issues))
})

// 28
test("exported type guard functions accept allowed values", () => {
  assert.equal(isPersistenceTargetClass("in_memory_test_only_store"), true)
  assert.equal(isDeferredPersistenceTargetClass("local_ephemeral_dev_store"), true)
  assert.equal(isRejectedPersistenceTargetClass("blocked_target"), true)
  assert.equal(isTargetDecisionStatus("target_selected_for_future_types"), true)
  assert.equal(isTargetDecisionOutcome("pass"), true)
  assert.equal(isSafetyBoundaryResult("confirmed"), true)
  assert.equal(isDependencyStatus("present"), true)
  assert.equal(isSha256Hex(HASH), true)
  assert.equal(isIsoTimestamp(TS), true)
})

// 29
test("exported type guard functions reject disallowed values", () => {
  assert.equal(isPersistenceTargetClass("local_ephemeral_dev_store"), false)
  assert.equal(isPersistenceTargetClass("blocked_target"), false)
  assert.equal(isDeferredPersistenceTargetClass("in_memory_test_only_store"), false)
  assert.equal(isRejectedPersistenceTargetClass("in_memory_test_only_store"), false)
  assert.equal(isTargetDecisionStatus("not_a_status"), false)
  assert.equal(isTargetDecisionOutcome("maybe"), false)
  assert.equal(isSafetyBoundaryResult("unconfirmed"), false)
  assert.equal(isDependencyStatus("perhaps"), false)
  assert.equal(isSha256Hex("ABC"), false)
  assert.equal(isSha256Hex("A".repeat(64)), false) // uppercase not allowed
  assert.equal(isIsoTimestamp("2026/07/06"), false)
})

// 30
test("validation pass does not add approval/execution/persistence/storage/promotion fields", () => {
  const result = validateTargetDecisionRecord(validRecord())
  // Result is only { ok, issues }; it grants nothing.
  assert.deepEqual(Object.keys(result).sort(), ["issues", "ok"])
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
    assert.equal(Object.prototype.hasOwnProperty.call(result, forbidden), false)
  }
})

// 31
test("index exports validators and type guards", () => {
  assert.equal(typeof validateTargetDecisionRecord, "function")
  assert.equal(typeof isPersistenceTargetClass, "function")
  assert.equal(typeof isDeferredPersistenceTargetClass, "function")
  assert.equal(typeof isRejectedPersistenceTargetClass, "function")
  assert.equal(typeof isTargetDecisionStatus, "function")
  assert.equal(typeof isTargetDecisionOutcome, "function")
  assert.equal(typeof isSafetyBoundaryResult, "function")
  assert.equal(typeof isDependencyStatus, "function")
  assert.equal(typeof isSha256Hex, "function")
  assert.equal(typeof isIsoTimestamp, "function")
})

// 32
test("tests assert observable validator behavior, not self-source", () => {
  // This suite asserts validator outputs over in-memory objects; it never reads
  // its own source text to prove properties. Sanity-check that a distinct
  // invalid input and a valid input diverge in ok.
  assert.equal(validateTargetDecisionRecord(validRecord()).ok, true)
  assert.equal(validateTargetDecisionRecord({}).ok, false)
})

// ─── P6-FIX-007b (Issue #121): frozen ValidationResult runtime snapshot ──────
// The result object and its issues array are both frozen, and a caller cannot
// flip ok or add/remove/reorder issues. Freezing grants nothing.

test("valid and invalid results are frozen with frozen issues arrays", () => {
  const valid = validateTargetDecisionRecord(validRecord())
  assert.equal(valid.ok, true, JSON.stringify(valid.issues))
  assert.ok(Object.isFrozen(valid), "valid result must be frozen")
  assert.ok(Object.isFrozen(valid.issues), "valid issues must be frozen")

  const invalid = validateTargetDecisionRecord({})
  assert.equal(invalid.ok, false)
  assert.ok(Object.isFrozen(invalid), "invalid result must be frozen")
  assert.ok(Object.isFrozen(invalid.issues), "invalid issues must be frozen")
})

test("result mutation attempts cannot change ok, issues length, entries, or order", () => {
  const result = validateTargetDecisionRecord({})
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
  const mutable = result.issues as { push: (x: unknown) => void; pop: () => void; splice: (a: number, b: number) => void }
  for (const op of [
    () => mutable.push({ code: "x", field: "y", message: "x:y" }),
    () => mutable.pop(),
    () => mutable.splice(0, 1),
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
