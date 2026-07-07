/**
 * P6-I5H: isolated tests for the pure Phase 6 Persistence Audit Evidence
 * constructors.
 *
 * Imports the module public surface (app/lib/phase6/persistenceAuditEvidence/
 * index.ts) plus node:test / node:assert/strict, and — for the Phase 7 static
 * source guards only — node:fs / node:url to READ (never mutate) the two
 * constructor source files. No app runtime modules, no app/lib/persistence, no
 * app/lib/phase6/persistenceTargetDecision, no P6-I0..I5G tests, no fixtures, no
 * harness, no P7.1 utilities, no network, no GitHub API, no child_process, no
 * file mutation, no secrets, no ApprovalStore, no external actions, no D1, no
 * SQL, no LLM, no Evidence Ledger append, no Graph Model write. Constructors are
 * exercised over in-memory objects only.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import {
  createPersistenceAuditEvent,
  createPutPersistenceAuditEvent,
  createGetPersistenceAuditEvent,
  createListPersistenceAuditEvent,
  createCountPersistenceAuditEvent,
  createClearTenantPersistenceAuditEvent,
  createClearAllPersistenceAuditEvent,
  createBlockedPersistenceAuditEvent,
  validatePersistenceAuditEvent,
  type CreatePersistenceAuditEventInput,
} from "../app/lib/phase6/persistenceAuditEvidence/index.ts"

const HASH = "b".repeat(64)
const TS = "2026-07-07T16:00:00Z"
const NA =
  "This event is descriptive: it is not approval, not execution permission, not persistence, not durable storage, and not production readiness."

function putInput(): CreatePersistenceAuditEventInput {
  return {
    audit_event_id: "ae_put_1",
    tenant_id: "tenant_1",
    target_decision_record_id: "tdr_1",
    operation: "put",
    operation_status: "accepted",
    operation_outcome: "pass",
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
function getInput(): CreatePersistenceAuditEventInput {
  return { ...putInput(), operation: "get", operation_status: "not_found", validation_result: "validator_not_applicable", record_count: 0 }
}
function listInput(): CreatePersistenceAuditEventInput {
  return { ...putInput(), operation: "list", validation_result: "validator_not_applicable", record_count: 4 }
}
function countInput(): CreatePersistenceAuditEventInput {
  return { ...putInput(), operation: "count", validation_result: "validator_not_applicable", record_count: 2 }
}
function clearTenantInput(): CreatePersistenceAuditEventInput {
  return { ...putInput(), operation: "clear_tenant", operation_status: "cleared", validation_result: "validator_not_applicable", clear_scope: "tenant_only", record_count: 2 }
}
function clearAllInput(): CreatePersistenceAuditEventInput {
  return { ...putInput(), operation: "clear_all", operation_status: "cleared", validation_result: "validator_not_applicable", clear_scope: "all_test_memory", record_count: 0 }
}
function blockedInput(): CreatePersistenceAuditEventInput {
  return { ...putInput(), validation_result: "validator_failed", no_go_flags: ["validation_failed"] }
}

function asInput(o: object): CreatePersistenceAuditEventInput {
  return o as unknown as CreatePersistenceAuditEventInput
}

// 1-2
test("createPersistenceAuditEvent returns ok for valid put-shaped input", () => {
  const r = createPersistenceAuditEvent(putInput())
  assert.equal(r.ok, true, JSON.stringify(r))
})
test("created generic event validates with validatePersistenceAuditEvent", () => {
  const r = createPersistenceAuditEvent(putInput())
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(validatePersistenceAuditEvent(r.event).ok, true)
})

// 3-8 operation-specific
test("createPutPersistenceAuditEvent returns ok for valid put input", () => assert.equal(createPutPersistenceAuditEvent(putInput()).ok, true))
test("createGetPersistenceAuditEvent returns ok for valid get input", () => assert.equal(createGetPersistenceAuditEvent(getInput()).ok, true))
test("createListPersistenceAuditEvent returns ok for valid list input", () => assert.equal(createListPersistenceAuditEvent(listInput()).ok, true))
test("createCountPersistenceAuditEvent returns ok for valid count input", () => assert.equal(createCountPersistenceAuditEvent(countInput()).ok, true))
test("createClearTenantPersistenceAuditEvent returns ok for valid clear_tenant input", () => assert.equal(createClearTenantPersistenceAuditEvent(clearTenantInput()).ok, true))
test("createClearAllPersistenceAuditEvent returns ok for valid clear_all input", () => assert.equal(createClearAllPersistenceAuditEvent(clearAllInput()).ok, true))

// 9-11 blocked
test("createBlockedPersistenceAuditEvent returns ok with non-empty no_go_flags", () => {
  const r = createBlockedPersistenceAuditEvent(blockedInput())
  assert.equal(r.ok, true, JSON.stringify(r))
  if (r.ok) assert.ok(r.event.no_go_flags.length > 0)
})
test("blocked constructor sets operation_status blocked_no_go", () => {
  const r = createBlockedPersistenceAuditEvent(blockedInput())
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.event.operation_status, "blocked_no_go")
})
test("blocked constructor sets operation_outcome no_go", () => {
  const r = createBlockedPersistenceAuditEvent(blockedInput())
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.event.operation_outcome, "no_go")
})

// 12-13 target invariants
test("constructors set adapter_target_class to in_memory_test_only_store", () => {
  const r = createPersistenceAuditEvent(putInput())
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.event.adapter_target_class, "in_memory_test_only_store")
})
test("constructors set selected_target_class to in_memory_test_only_store", () => {
  const r = createPersistenceAuditEvent(putInput())
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.event.selected_target_class, "in_memory_test_only_store")
})

// 14-18 caller-provided preservation
test("caller-provided audit_event_id is preserved", () => {
  const r = createPersistenceAuditEvent(putInput())
  if (r.ok) assert.equal(r.event.audit_event_id, "ae_put_1")
})
test("caller-provided tenant_id is preserved", () => {
  const r = createPersistenceAuditEvent(putInput())
  if (r.ok) assert.equal(r.event.tenant_id, "tenant_1")
})
test("caller-provided target_decision_record_id is preserved", () => {
  const r = createPersistenceAuditEvent(putInput())
  if (r.ok) assert.equal(r.event.target_decision_record_id, "tdr_1")
})
test("caller-provided created_at is preserved", () => {
  const r = createPersistenceAuditEvent(putInput())
  if (r.ok) assert.equal(r.event.created_at, TS)
})
test("caller-provided payload_hash is preserved", () => {
  const r = createPersistenceAuditEvent(putInput())
  if (r.ok) assert.equal(r.event.payload_hash, HASH)
})

// 19
test("constructor output validates through P6-I5G validators", () => {
  for (const r of [
    createPutPersistenceAuditEvent(putInput()),
    createGetPersistenceAuditEvent(getInput()),
    createClearAllPersistenceAuditEvent(clearAllInput()),
    createBlockedPersistenceAuditEvent(blockedInput()),
  ]) {
    assert.equal(r.ok, true)
    if (r.ok) assert.equal(validatePersistenceAuditEvent(r.event).ok, true)
  }
})

// 20-23 failures
test("invalid payload_hash returns fail result", () => {
  const r = createPersistenceAuditEvent(asInput({ ...putInput(), payload_hash: "not-a-hash" }))
  assert.equal(r.ok, false)
  if (!r.ok) assert.ok(r.issues.some((i) => i.code === "validation_failed"))
})
test("invalid created_at returns fail result", () => {
  const r = createPersistenceAuditEvent(asInput({ ...putInput(), created_at: "2026/07/07" }))
  assert.equal(r.ok, false)
})
test("missing required caller input returns fail result", () => {
  const partial = { ...putInput() } as Record<string, unknown>
  delete partial.tenant_id
  assert.equal(createPersistenceAuditEvent(asInput(partial)).ok, false)
})
test("invalid operation-specific shape returns fail result", () => {
  // put with record_count 5 violates the put shape rule.
  assert.equal(createPutPersistenceAuditEvent(asInput({ ...putInput(), record_count: 5 })).ok, false)
})

// 24
test("put constructor rejects validator_not_applicable", () => {
  assert.equal(createPutPersistenceAuditEvent(asInput({ ...putInput(), validation_result: "validator_not_applicable" })).ok, false)
})

// 25-27 fail-closed
test("duplicate_conflict requires fail or no_go", () => {
  assert.equal(createPersistenceAuditEvent(asInput({ ...putInput(), duplicate_result: "duplicate_conflict" })).ok, false)
})
test("tenant_mismatch requires fail or no_go", () => {
  assert.equal(createPersistenceAuditEvent(asInput({ ...putInput(), tenant_scope_result: "tenant_mismatch" })).ok, false)
})
test("redaction_no_go requires no_go", () => {
  assert.equal(createPersistenceAuditEvent(asInput({ ...putInput(), redaction_result: "redaction_no_go" })).ok, false)
})

// 28
test("blocked constructor fails when no_go_flags is empty", () => {
  const r = createBlockedPersistenceAuditEvent(asInput({ ...putInput(), no_go_flags: [] }))
  assert.equal(r.ok, false)
  if (!r.ok) assert.ok(r.issues.some((i) => i.code === "invalid_constructor_input"))
})

// 29-30 override
test("constructors reject adapter target override attempt", () => {
  const r = createPersistenceAuditEvent(asInput({ ...putInput(), adapter_target_class: "blocked_target" }))
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.event.adapter_target_class, "in_memory_test_only_store")
})
test("constructors reject selected target override attempt", () => {
  const r = createPersistenceAuditEvent(asInput({ ...putInput(), selected_target_class: "local_ephemeral_dev_store" }))
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.event.selected_target_class, "in_memory_test_only_store")
})

// 31-33 purity
test("constructors do not mutate input", () => {
  const input = putInput()
  const before = JSON.stringify(input)
  createPersistenceAuditEvent(input)
  assert.equal(JSON.stringify(input), before)
})
test("constructors are deterministic for the same input", () => {
  const a = createPersistenceAuditEvent(putInput())
  const b = createPersistenceAuditEvent(putInput())
  assert.equal(a.ok, true)
  assert.equal(b.ok, true)
  if (a.ok && b.ok) assert.deepEqual(a.event, b.event)
})
test("constructors produce different events only when caller-provided input differs", () => {
  const a = createPersistenceAuditEvent(putInput())
  const b = createPersistenceAuditEvent({ ...putInput(), tenant_id: "tenant_2" })
  if (a.ok && b.ok) {
    assert.notDeepEqual(a.event, b.event)
    assert.equal(b.event.tenant_id, "tenant_2")
  }
})

// 34-35 no clock/random
test("constructors do not generate current time", () => {
  const input = putInput()
  const r = createPersistenceAuditEvent(input)
  if (r.ok) assert.equal(r.event.created_at, input.created_at)
})
test("constructors do not generate random ids", () => {
  const input = putInput()
  const r = createPersistenceAuditEvent(input)
  if (r.ok) {
    assert.equal(r.event.audit_event_id, input.audit_event_id)
    assert.equal(r.event.payload_hash, input.payload_hash)
  }
})

// 36
test("constructor issue messages do not echo secret-like values", () => {
  const secret = "SUPER_SECRET_zzz999"
  const r = createPersistenceAuditEvent(asInput({ ...putInput(), payload_hash: secret }))
  assert.equal(r.ok, false)
  if (!r.ok) for (const i of r.issues) {
    assert.equal(i.message, `${i.code}:${i.field}`)
    assert.ok(!i.message.includes(secret))
  }
})

// 37-39 result shape
test("construction failure has no event field", () => {
  const r = createPersistenceAuditEvent(asInput({ ...putInput(), payload_hash: "bad" }))
  assert.equal(r.ok, false)
  assert.equal(Object.prototype.hasOwnProperty.call(r, "event"), false)
})
test("construction success has empty issues", () => {
  const r = createPersistenceAuditEvent(putInput())
  if (r.ok) assert.equal(r.issues.length, 0)
})
test("result shape is non-authorizing", () => {
  const r = createPersistenceAuditEvent(putInput())
  assert.deepEqual(Object.keys(r).sort(), ["event", "issues", "ok"])
})

// 40
test("constructed event has no approval/execution/persistence/storage/durable-storage/ledger/graph/promotion grant fields", () => {
  const r = createPersistenceAuditEvent(putInput())
  assert.equal(r.ok, true)
  if (r.ok) {
    for (const f of [
      "approval", "approved", "authorized", "execution_permission", "executed",
      "promotion_permission", "promoted", "persistence_permission", "persisted",
      "storage_permission", "stored", "durable_storage_permission",
      "evidence_ledger_append_permission", "graph_write_permission",
      "external_action_permission", "formal_workunit_promotion", "approvalstore_approval",
    ]) {
      assert.equal(Object.prototype.hasOwnProperty.call(r.event, f), false, f)
    }
  }
})

// 41
test("normal invalid input does not throw", () => {
  for (const bad of [null, undefined, 42, "x", []]) {
    assert.equal(createPersistenceAuditEvent(asInput(bad as object)).ok, false)
  }
})

// 42-44 preservation
test("createClearAllPersistenceAuditEvent preserves non-durability evidence", () => {
  const r = createClearAllPersistenceAuditEvent({ ...clearAllInput(), non_durability_result: "process_lifetime_only" })
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.event.non_durability_result, "process_lifetime_only")
})
test("createListPersistenceAuditEvent preserves record_count", () => {
  const r = createListPersistenceAuditEvent({ ...listInput(), record_count: 7 })
  if (r.ok) assert.equal(r.event.record_count, 7)
})
test("createCountPersistenceAuditEvent preserves record_count", () => {
  const r = createCountPersistenceAuditEvent({ ...countInput(), record_count: 9 })
  if (r.ok) assert.equal(r.event.record_count, 9)
})

// 45
test("index exports constructors and construction helpers", () => {
  assert.equal(typeof createPersistenceAuditEvent, "function")
  assert.equal(typeof createBlockedPersistenceAuditEvent, "function")
  assert.equal(typeof createClearAllPersistenceAuditEvent, "function")
})

// 46
test("test asserts observable constructor behavior, not self-source", () => {
  assert.equal(createPersistenceAuditEvent(putInput()).ok, true)
  assert.equal(createPersistenceAuditEvent(asInput({})).ok, false)
})

// ─── Phase 7: static source guards (read-only) ──────────────────

const SRC_CONSTRUCTION = fileURLToPath(new URL("../app/lib/phase6/persistenceAuditEvidence/construction.ts", import.meta.url))
const SRC_CONSTRUCTORS = fileURLToPath(new URL("../app/lib/phase6/persistenceAuditEvidence/constructors.ts", import.meta.url))
const SRC_INDEX = fileURLToPath(new URL("../app/lib/phase6/persistenceAuditEvidence/index.ts", import.meta.url))

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
]

test("constructor sources contain no forbidden impurity or capability tokens", () => {
  for (const src of [SRC_CONSTRUCTION, SRC_CONSTRUCTORS, SRC_INDEX]) {
    const text = readFileSync(src, "utf8")
    for (const needle of FORBIDDEN_SOURCE_SUBSTRINGS) {
      assert.ok(!text.includes(needle), `${src} must not contain: <<<${needle}>>>`)
    }
  }
})
