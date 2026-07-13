/**
 * P6-I5G: isolated tests for the Phase 6 Persistence Audit Evidence validators.
 *
 * Imports ONLY node:test, node:assert/strict, and the module public surface
 * (app/lib/phase6/persistenceAuditEvidence/index.ts), plus — for the Phase 7
 * static source guards only — node:fs / node:url to READ (never mutate) the
 * module source files. No app runtime modules, no app/lib/persistence, no
 * app/lib/phase6/persistenceTargetDecision, no P6-I0..I5F tests, no fixtures, no
 * harness, no P7.1 utilities, no network, no GitHub API, no child_process, no
 * file mutation, no secrets, no ApprovalStore, no external actions, no D1, no
 * SQL, no LLM. Validators are exercised over in-memory objects only.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import {
  validatePersistenceAuditEvent,
  isPersistenceAuditOperation,
  isPersistenceAuditOperationStatus,
  isPersistenceAuditOperationOutcome,
  isPersistenceAuditValidationResult,
  isPersistenceAuditIdempotencyResult,
  isPersistenceAuditDuplicateResult,
  isPersistenceAuditTenantScopeResult,
  isPersistenceAuditDefensiveSnapshotResult,
  isPersistenceAuditNonDurabilityResult,
  isPersistenceAuditClearScope,
  isPersistenceAuditRedactionResult,
  isPersistenceAuditSourceLoop,
  isPersistenceAuditNoGoFlag,
  isSha256Hex,
  isIsoTimestamp,
} from "../app/lib/phase6/persistenceAuditEvidence/index.ts"
import * as persistenceAuditEvidenceModule from "../app/lib/phase6/persistenceAuditEvidence/index.ts"

const HASH = "a".repeat(64)
const TS = "2026-07-07T15:00:00Z"
const NA =
  "This event is descriptive: it is not approval, not execution permission, not persistence, not durable storage, and not production readiness."

const DEFERRED = [
  "local_ephemeral_dev_store",
  "append_only_audit_candidate_store",
  "tenant_scoped_artifact_candidate_store",
  "future_d1_store_after_separate_d1_gate",
]

function validPut(): Record<string, unknown> {
  return {
    audit_event_id: "ae_put_1",
    tenant_id: "tenant_1",
    target_decision_record_id: "tdr_1",
    operation: "put",
    operation_status: "accepted",
    operation_outcome: "pass",
    adapter_target_class: "in_memory_test_only_store",
    selected_target_class: "in_memory_test_only_store",
    validation_result: "validator_passed",
    validator_issue_codes: [],
    adapter_issue_codes: [],
    idempotency_result: "first_write",
    duplicate_result: "first_write",
    tenant_scope_result: "tenant_scoped",
    defensive_snapshot_result: "frozen_snapshot_returned",
    non_durability_result: "in_memory_only",
    clear_scope: "none",
    record_count: 1,
    failure_reasons: [],
    redaction_result: "no_raw_payload",
    source_loop: "P6-I5E",
    source_adapter_loop: "P6-I5E",
    source_fixture_loop: "P6-I5D",
    source_validator_loop: "P6-I5B",
    source_constructor_loop: "P6-I5C",
    source_target_decision_record_id: "tdr_1",
    created_at: TS,
    payload_hash: HASH,
    non_authorization_statement: NA,
    no_go_flags: [],
  }
}

function validGet(): Record<string, unknown> {
  return { ...validPut(), operation: "get", operation_status: "not_found", validation_result: "validator_not_applicable", record_count: 0 }
}
function validList(): Record<string, unknown> {
  return { ...validPut(), operation: "list", operation_status: "accepted", validation_result: "validator_not_applicable", record_count: 3 }
}
function validCount(): Record<string, unknown> {
  return { ...validPut(), operation: "count", operation_status: "accepted", validation_result: "validator_not_applicable", record_count: 2 }
}
function validClearTenant(): Record<string, unknown> {
  return { ...validPut(), operation: "clear_tenant", operation_status: "cleared", validation_result: "validator_not_applicable", clear_scope: "tenant_only", record_count: 2 }
}
function validClearAll(): Record<string, unknown> {
  return { ...validPut(), operation: "clear_all", operation_status: "cleared", validation_result: "validator_not_applicable", clear_scope: "all_test_memory", record_count: 0 }
}

function withField(base: Record<string, unknown>, field: string, value: unknown): Record<string, unknown> {
  const r = { ...base }
  r[field] = value
  return r
}
function hasCode(result: { issues: readonly { code: string }[] }, code: string): boolean {
  return result.issues.some((i) => i.code === code)
}

// ─── P6-FIX-004 (Issue #115): semantic ISO-8601 UTC timestamp guard ─────────
// created_at now rejects non-existent calendar values via the shared semantic
// guard, using the module's existing invalid_timestamp code. Valid leap-day /
// fractional timestamps still pass.
const PAE_PINNED_INVALID = ["2026-13-01T00:00:00Z", "2026-02-30T00:00:00Z", "2026-01-01T25:00:00Z"]

test("audit event created_at rejects pinned invalid calendar values", () => {
  for (const bad of PAE_PINNED_INVALID) {
    const result = validatePersistenceAuditEvent(withField(validPut(), "created_at", bad))
    const tsIssues = result.issues.filter((i) => i.code === "invalid_timestamp")
    assert.ok(tsIssues.length > 0, `expected invalid_timestamp for ${bad}`)
    assert.ok(tsIssues.some((i) => i.field === "created_at"), `issue must point at created_at`)
    for (const i of result.issues) {
      assert.equal(i.message, `${i.code}:${i.field}`)
      assert.ok(!i.message.includes(bad), `message must not echo timestamp`)
    }
  }
  for (const good of ["2024-02-29T12:34:56Z", "2026-01-01T00:00:00.123Z"]) {
    const result = validatePersistenceAuditEvent(withField(validPut(), "created_at", good))
    assert.ok(!hasCode(result, "invalid_timestamp"), `valid ${good} must pass`)
  }
})

// 1-6
test("valid put audit event passes", () => assert.equal(validatePersistenceAuditEvent(validPut()).ok, true, JSON.stringify(validatePersistenceAuditEvent(validPut()).issues)))
test("valid get audit event passes", () => assert.equal(validatePersistenceAuditEvent(validGet()).ok, true))
test("valid list audit event passes", () => assert.equal(validatePersistenceAuditEvent(validList()).ok, true))
test("valid count audit event passes", () => assert.equal(validatePersistenceAuditEvent(validCount()).ok, true))
test("valid clear_tenant audit event passes", () => assert.equal(validatePersistenceAuditEvent(validClearTenant()).ok, true))
test("valid clear_all audit event passes", () => assert.equal(validatePersistenceAuditEvent(validClearAll()).ok, true))

// 7
test("blocked_no_go audit event with no_go_flags passes", () => {
  const e = { ...validPut(), operation_status: "blocked_no_go", operation_outcome: "no_go", validation_result: "validator_failed", no_go_flags: ["validation_failed"] }
  assert.equal(validatePersistenceAuditEvent(e).ok, true, JSON.stringify(validatePersistenceAuditEvent(e).issues))
})

// 8-9
test("adapter_target_class must be in_memory_test_only_store", () => {
  const r = validatePersistenceAuditEvent(withField(validPut(), "adapter_target_class", "something_else"))
  assert.ok(hasCode(r, "invalid_adapter_target_class"))
})
test("selected_target_class must be in_memory_test_only_store", () => {
  const r = validatePersistenceAuditEvent(withField(validPut(), "selected_target_class", "something_else"))
  assert.ok(hasCode(r, "invalid_selected_target_class"))
})

// 10-13
for (const d of DEFERRED) {
  test(`deferred target class ${d} cannot be adapter_target_class`, () => {
    assert.ok(hasCode(validatePersistenceAuditEvent(withField(validPut(), "adapter_target_class", d)), "invalid_adapter_target_class"))
  })
}
test("deferred target class cannot be selected_target_class", () => {
  assert.ok(hasCode(validatePersistenceAuditEvent(withField(validPut(), "selected_target_class", DEFERRED[0])), "invalid_selected_target_class"))
})
test("blocked_target cannot be adapter_target_class", () => {
  assert.ok(hasCode(validatePersistenceAuditEvent(withField(validPut(), "adapter_target_class", "blocked_target")), "invalid_adapter_target_class"))
})
test("blocked_target cannot be selected_target_class", () => {
  assert.ok(hasCode(validatePersistenceAuditEvent(withField(validPut(), "selected_target_class", "blocked_target")), "invalid_selected_target_class"))
})

// 14-18
test("missing required field fails", () => {
  const e = { ...validPut() }; delete e.tenant_id
  const r = validatePersistenceAuditEvent(e); assert.equal(r.ok, false); assert.ok(hasCode(r, "missing_required_field"))
})
test("null required field fails", () => {
  const r = validatePersistenceAuditEvent(withField(validPut(), "tenant_id", null)); assert.ok(hasCode(r, "null_required_field"))
})
test("non-object input fails", () => {
  for (const bad of ["s", 42, true, undefined, null]) assert.ok(hasCode(validatePersistenceAuditEvent(bad), "invalid_event"))
})
test("array input fails", () => assert.ok(hasCode(validatePersistenceAuditEvent([]), "invalid_event")))
test("unknown top-level field fails", () => assert.ok(hasCode(validatePersistenceAuditEvent(withField(validPut(), "surprise", 1)), "unknown_field")))

// 19-20
test("invalid timestamp fails", () => assert.ok(hasCode(validatePersistenceAuditEvent(withField(validPut(), "created_at", "2026/07/07")), "invalid_timestamp")))
test("invalid payload_hash fails", () => assert.ok(hasCode(validatePersistenceAuditEvent(withField(validPut(), "payload_hash", "ABC")), "invalid_sha256_hex")))

// 21-32 enum fields
test("invalid operation fails", () => assert.ok(hasCode(validatePersistenceAuditEvent(withField(validPut(), "operation", "delete")), "invalid_operation")))
test("invalid operation_status fails", () => assert.ok(hasCode(validatePersistenceAuditEvent(withField(validPut(), "operation_status", "queued")), "invalid_operation_status")))
test("invalid operation_outcome fails", () => assert.ok(hasCode(validatePersistenceAuditEvent(withField(validPut(), "operation_outcome", "maybe")), "invalid_operation_outcome")))
test("invalid validation_result fails", () => assert.ok(hasCode(validatePersistenceAuditEvent(withField(validPut(), "validation_result", "ok")), "invalid_validation_result")))
test("invalid idempotency_result fails", () => assert.ok(hasCode(validatePersistenceAuditEvent(withField(validPut(), "idempotency_result", "x")), "invalid_idempotency_result")))
test("invalid duplicate_result fails", () => assert.ok(hasCode(validatePersistenceAuditEvent(withField(validPut(), "duplicate_result", "x")), "invalid_duplicate_result")))
test("invalid tenant_scope_result fails", () => assert.ok(hasCode(validatePersistenceAuditEvent(withField(validPut(), "tenant_scope_result", "x")), "invalid_tenant_scope_result")))
test("invalid defensive_snapshot_result fails", () => assert.ok(hasCode(validatePersistenceAuditEvent(withField(validPut(), "defensive_snapshot_result", "x")), "invalid_snapshot_result")))
test("invalid non_durability_result fails", () => assert.ok(hasCode(validatePersistenceAuditEvent(withField(validPut(), "non_durability_result", "x")), "invalid_non_durability_result")))
test("invalid clear_scope fails", () => assert.ok(hasCode(validatePersistenceAuditEvent(withField(validPut(), "clear_scope", "x")), "invalid_clear_scope")))
test("invalid redaction_result fails", () => assert.ok(hasCode(validatePersistenceAuditEvent(withField(validPut(), "redaction_result", "x")), "invalid_redaction_result")))
test("invalid source_loop fails", () => assert.ok(hasCode(validatePersistenceAuditEvent(withField(validPut(), "source_loop", "P6-I9Z")), "invalid_source_loop")))

// 33
test("invalid record_count fails", () => {
  assert.ok(hasCode(validatePersistenceAuditEvent(withField(validList(), "record_count", -1)), "invalid_record_count"))
  assert.ok(hasCode(validatePersistenceAuditEvent(withField(validList(), "record_count", 1.5)), "invalid_record_count"))
})

// 34-36 arrays
test("validator_issue_codes must be array", () => assert.ok(hasCode(validatePersistenceAuditEvent(withField(validPut(), "validator_issue_codes", "x")), "invalid_array")))
test("adapter_issue_codes must be array", () => assert.ok(hasCode(validatePersistenceAuditEvent(withField(validPut(), "adapter_issue_codes", "x")), "invalid_array")))
test("failure_reasons must be array", () => assert.ok(hasCode(validatePersistenceAuditEvent(withField(validPut(), "failure_reasons", "x")), "invalid_array")))

// 37
test("no_go_flags non-empty fails unless blocked/no_go", () => {
  assert.ok(hasCode(validatePersistenceAuditEvent(withField(validPut(), "no_go_flags", ["validation_failed"])), "no_go_flags_present"))
})

// 38-40 fail-closed
test("duplicate_conflict must fail closed", () => {
  assert.ok(hasCode(validatePersistenceAuditEvent(withField(validPut(), "duplicate_result", "duplicate_conflict")), "duplicate_conflict_not_fail_closed"))
  assert.ok(hasCode(validatePersistenceAuditEvent(withField(validPut(), "idempotency_result", "duplicate_conflict")), "duplicate_conflict_not_fail_closed"))
})
test("tenant_mismatch must fail closed", () => {
  assert.ok(hasCode(validatePersistenceAuditEvent(withField(validPut(), "tenant_scope_result", "tenant_mismatch")), "tenant_mismatch_not_fail_closed"))
  assert.ok(hasCode(validatePersistenceAuditEvent(withField(validPut(), "tenant_scope_result", "cross_tenant_blocked")), "tenant_mismatch_not_fail_closed"))
})
test("redaction_no_go must fail closed", () => {
  // Even with no_go outcome, redaction_no_go can never validate to ok=true.
  assert.ok(hasCode(validatePersistenceAuditEvent(withField(validPut(), "redaction_result", "redaction_no_go")), "redaction_no_go_not_fail_closed"))
  assert.equal(validatePersistenceAuditEvent({ ...validPut(), redaction_result: "redaction_no_go", operation_outcome: "no_go" }).ok, false)
})

// 41-43 operation-specific
test("put operation requires applicable validator result", () => {
  assert.ok(hasCode(validatePersistenceAuditEvent(withField(validPut(), "validation_result", "validator_not_applicable")), "invalid_operation_specific_shape"))
})
test("clear_tenant requires tenant_only clear_scope", () => {
  assert.ok(hasCode(validatePersistenceAuditEvent(withField(validClearTenant(), "clear_scope", "none")), "invalid_operation_specific_shape"))
})
test("clear_all requires all_test_memory clear_scope", () => {
  assert.ok(hasCode(validatePersistenceAuditEvent(withField(validClearAll(), "clear_scope", "tenant_only")), "invalid_operation_specific_shape"))
})

// 44
test("non_authorization_statement is required", () => {
  assert.ok(hasCode(validatePersistenceAuditEvent(withField(validPut(), "non_authorization_statement", "incomplete text")), "missing_non_authorization_statement"))
})

// 45-47 forbidden fields
// P6-FIX-005 (Issue #116): the canonical 20-name grant-like denylist. Expected
// names are hardcoded independently of the shared production constant (rather
// than imported and reflected back), so a production-list regression — a
// dropped, renamed, or misspelled name — is detectable here.
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
    const result = validatePersistenceAuditEvent(withField(validPut(), grant, suppliedValue))
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
  const unknown = validatePersistenceAuditEvent(withField(validPut(), "unrelated_mystery_key", "x"))
  assert.equal(unknown.ok, false)
  assert.ok(hasCode(unknown, "unknown_field"))
  assert.equal(hasCode(unknown, "forbidden_grant_field_present"), false)
})
test("raw payload field fails", () => {
  for (const p of ["raw_payload", "record_payload", "raw_record", "payload", "record"]) {
    assert.ok(hasCode(validatePersistenceAuditEvent(withField(validPut(), p, "x")), "raw_payload_field_present"), p)
  }
})
test("secret-like echo field fails", () => {
  for (const s of ["secret", "token", "api_key", "password", "authorization_header"]) {
    assert.ok(hasCode(validatePersistenceAuditEvent(withField(validPut(), s, "x")), "secret_like_echo_field_present"), s)
  }
})

// 48
test("validation issue messages do not echo secret-like values", () => {
  const secret = "SUPER_SECRET_abc123"
  const r = validatePersistenceAuditEvent(withField(validPut(), "payload_hash", secret))
  for (const i of r.issues) {
    assert.equal(i.message, `${i.code}:${i.field}`)
    assert.ok(!i.message.includes(secret))
  }
})

// 49
test("validator does not mutate input", () => {
  const e = validPut(); const before = JSON.stringify(e); validatePersistenceAuditEvent(e); assert.equal(JSON.stringify(e), before)
})

// 50 getter-TOCTOU
test("validator uses single-read snapshot against getter-TOCTOU input", () => {
  let reads = 0
  const toctou: Record<string, unknown> = { ...validPut() }
  delete toctou.adapter_target_class
  Object.defineProperty(toctou, "adapter_target_class", {
    enumerable: true,
    configurable: true,
    get() {
      reads += 1
      return reads === 1 ? "in_memory_test_only_store" : "blocked_target"
    },
  })
  const r = validatePersistenceAuditEvent(toctou)
  assert.equal(reads, 1)
  assert.equal(r.ok, true, JSON.stringify(r.issues))
})

// 51-52 type guards
test("exported type guard functions accept allowed values", () => {
  assert.equal(isPersistenceAuditOperation("put"), true)
  assert.equal(isPersistenceAuditOperationStatus("blocked_no_go"), true)
  assert.equal(isPersistenceAuditOperationOutcome("no_go"), true)
  assert.equal(isPersistenceAuditValidationResult("validator_passed"), true)
  assert.equal(isPersistenceAuditIdempotencyResult("first_write"), true)
  assert.equal(isPersistenceAuditDuplicateResult("duplicate_conflict"), true)
  assert.equal(isPersistenceAuditTenantScopeResult("tenant_scoped"), true)
  assert.equal(isPersistenceAuditDefensiveSnapshotResult("frozen_snapshot_returned"), true)
  assert.equal(isPersistenceAuditNonDurabilityResult("in_memory_only"), true)
  assert.equal(isPersistenceAuditClearScope("all_test_memory"), true)
  assert.equal(isPersistenceAuditRedactionResult("no_raw_payload"), true)
  assert.equal(isPersistenceAuditSourceLoop("P6-I5E"), true)
  assert.equal(isPersistenceAuditNoGoFlag("validation_failed"), true)
  assert.equal(isSha256Hex(HASH), true)
  assert.equal(isIsoTimestamp(TS), true)
})
test("exported type guard functions reject disallowed values", () => {
  assert.equal(isPersistenceAuditOperation("delete"), false)
  assert.equal(isPersistenceAuditOperationStatus("queued"), false)
  assert.equal(isPersistenceAuditOperationOutcome("maybe"), false)
  assert.equal(isPersistenceAuditValidationResult("ok"), false)
  assert.equal(isPersistenceAuditIdempotencyResult("x"), false)
  assert.equal(isPersistenceAuditDuplicateResult("x"), false)
  assert.equal(isPersistenceAuditTenantScopeResult("x"), false)
  assert.equal(isPersistenceAuditDefensiveSnapshotResult("x"), false)
  assert.equal(isPersistenceAuditNonDurabilityResult("x"), false)
  assert.equal(isPersistenceAuditClearScope("x"), false)
  assert.equal(isPersistenceAuditRedactionResult("x"), false)
  assert.equal(isPersistenceAuditSourceLoop("P6-I9Z"), false)
  assert.equal(isPersistenceAuditNoGoFlag("not_a_flag"), false)
  assert.equal(isSha256Hex("A".repeat(64)), false)
  assert.equal(isIsoTimestamp("2026/07/07"), false)
})

// 53
test("validation pass does not add approval/execution/persistence/storage/durable-storage/ledger/graph/promotion fields", () => {
  const r = validatePersistenceAuditEvent(validPut())
  assert.deepEqual(Object.keys(r).sort(), ["issues", "ok"])
  for (const f of ["approval", "approved", "authorized", "executed", "persisted", "stored", "durable_storage_permission", "evidence_ledger_append_permission", "graph_write_permission", "formal_workunit_promotion"]) {
    assert.equal(Object.prototype.hasOwnProperty.call(r, f), false, f)
  }
})

// 54
test("index exports validators and type guards", () => {
  assert.equal(typeof validatePersistenceAuditEvent, "function")
  assert.equal(typeof isPersistenceAuditOperation, "function")
  assert.equal(typeof isSha256Hex, "function")
})

// 55
test("test asserts observable validator behavior, not self-source", () => {
  assert.equal(validatePersistenceAuditEvent(validPut()).ok, true)
  assert.equal(validatePersistenceAuditEvent({}).ok, false)
})

// ─── P6-FIX-007b (Issue #121): frozen ValidationResult runtime snapshot ──────
// The result object and its issues array are both frozen, and a caller cannot
// flip ok or add/remove/reorder issues. Freezing grants nothing.

test("valid and invalid results are frozen with frozen issues arrays", () => {
  const valid = validatePersistenceAuditEvent(validPut())
  assert.equal(valid.ok, true, JSON.stringify(valid.issues))
  assert.ok(Object.isFrozen(valid), "valid result must be frozen")
  assert.ok(Object.isFrozen(valid.issues), "valid issues must be frozen")

  const invalid = validatePersistenceAuditEvent({})
  assert.equal(invalid.ok, false)
  assert.ok(Object.isFrozen(invalid), "invalid result must be frozen")
  assert.ok(Object.isFrozen(invalid.issues), "invalid issues must be frozen")
})

test("result mutation attempts cannot change ok, issues length, entries, or order", () => {
  const result = validatePersistenceAuditEvent({})
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

// ─── Phase 7: static source guards (read-only) ──────────────────

const SRC_TYPES = fileURLToPath(new URL("../app/lib/phase6/persistenceAuditEvidence/types.ts", import.meta.url))
const SRC_VALIDATORS = fileURLToPath(new URL("../app/lib/phase6/persistenceAuditEvidence/validators.ts", import.meta.url))
const SRC_INDEX = fileURLToPath(new URL("../app/lib/phase6/persistenceAuditEvidence/index.ts", import.meta.url))

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
]

test("module sources contain no forbidden runtime capability substrings", () => {
  for (const src of [SRC_TYPES, SRC_VALIDATORS, SRC_INDEX]) {
    const text = readFileSync(src, "utf8")
    for (const needle of FORBIDDEN_SOURCE_SUBSTRINGS) {
      assert.ok(!text.includes(needle), `${src} must not contain: <<<${needle}>>>`)
    }
  }
})

// ─── P6-FIX-007c (Issue #121): dead deferred/rejected target-class exports ────
//
// The unused PERSISTENCE_AUDIT_DEFERRED/REJECTED_TARGET_CLASSES constants are
// removed from the public module surface. The one allowed runtime target class
// remains, and every deferred/rejected value stays fail-closed invalid for both
// adapter_target_class and selected_target_class with the existing stable codes.
// The deferred/rejected literals below are hardcoded independently of the
// production module (never imported) so this test does not merely mirror source.

const REMOVED_TARGET_CLASS_EXPORTS = [
  "PERSISTENCE_AUDIT_DEFERRED_TARGET_CLASSES",
  "PERSISTENCE_AUDIT_REJECTED_TARGET_CLASSES",
] as const

const INDEPENDENT_NON_ALLOWED_TARGET_CLASSES = [
  "local_ephemeral_dev_store",
  "append_only_audit_candidate_store",
  "tenant_scoped_artifact_candidate_store",
  "future_d1_store_after_separate_d1_gate",
  "blocked_target",
] as const

test("public surface no longer exposes deferred/rejected target-class constants", () => {
  const keys = Object.keys(persistenceAuditEvidenceModule)
  for (const removed of REMOVED_TARGET_CLASS_EXPORTS) {
    assert.equal(keys.includes(removed), false, `${removed} must not be exported`)
    assert.equal(
      (persistenceAuditEvidenceModule as Record<string, unknown>)[removed],
      undefined,
      `${removed} must be undefined on the public surface`,
    )
  }
  // The one allowed runtime target class remains, exactly.
  assert.ok(keys.includes("PERSISTENCE_AUDIT_TARGET_CLASSES"))
  assert.deepEqual(
    [...(persistenceAuditEvidenceModule as { PERSISTENCE_AUDIT_TARGET_CLASSES: readonly string[] }).PERSISTENCE_AUDIT_TARGET_CLASSES],
    ["in_memory_test_only_store"],
  )
})

test("every non-allowed target class stays rejected for adapter and selected fields", () => {
  for (const bad of INDEPENDENT_NON_ALLOWED_TARGET_CLASSES) {
    const adapter = validatePersistenceAuditEvent(withField(validPut(), "adapter_target_class", bad))
    assert.equal(adapter.ok, false, `adapter_target_class=${bad}`)
    assert.ok(
      adapter.issues.some((i) => i.code === "invalid_adapter_target_class" && i.field === "adapter_target_class"),
      `adapter_target_class=${bad} must yield invalid_adapter_target_class`,
    )

    const selected = validatePersistenceAuditEvent(withField(validPut(), "selected_target_class", bad))
    assert.equal(selected.ok, false, `selected_target_class=${bad}`)
    assert.ok(
      selected.issues.some((i) => i.code === "invalid_selected_target_class" && i.field === "selected_target_class"),
      `selected_target_class=${bad} must yield invalid_selected_target_class`,
    )
  }
  // The one allowed class still passes at both fields.
  assert.equal(validatePersistenceAuditEvent(validPut()).ok, true)
})

test("types source removed the dead exports and introduced no replacement array", () => {
  const typesText = readFileSync(SRC_TYPES, "utf8")
  for (const removed of REMOVED_TARGET_CLASS_EXPORTS) {
    assert.ok(!typesText.includes(removed), `${removed} must be gone from types.ts`)
  }
  // No replacement deferred/rejected runtime array under any name: the removed
  // multi-value deferred list's members must not reappear as a runtime array.
  assert.ok(
    !typesText.includes("append_only_audit_candidate_store"),
    "types.ts must not reintroduce the deferred list literals",
  )
  assert.ok(!/DEFERRED_TARGET_CLASSES/.test(typesText), "no deferred target-class array may remain")
  assert.ok(!/REJECTED_TARGET_CLASSES/.test(typesText), "no rejected target-class array may remain")
  // The one allowed list remains.
  assert.ok(typesText.includes('PERSISTENCE_AUDIT_TARGET_CLASSES = ["in_memory_test_only_store"]'))
  // The index and validators are unchanged in this patch: they never named the
  // removed constants, so they must not name them now either.
  const indexText = readFileSync(SRC_INDEX, "utf8")
  const validatorsText = readFileSync(SRC_VALIDATORS, "utf8")
  for (const removed of REMOVED_TARGET_CLASS_EXPORTS) {
    assert.ok(!indexText.includes(removed), `index.ts must not name ${removed}`)
    assert.ok(!validatorsText.includes(removed), `validators.ts must not name ${removed}`)
  }
})
