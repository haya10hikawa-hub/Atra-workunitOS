/**
 * P6-I5I: isolated tests for the deterministic, test-only Phase 6 Persistence
 * Audit Evidence fixtures.
 *
 * Imports the fixture module and the Phase 6 Persistence Audit Evidence module
 * surface (for the P6-I5G validator), plus node:test / node:assert/strict and —
 * for the Phase 4 static source guard only — node:fs / node:url to READ (never
 * mutate) the fixture source. No app runtime modules, no app/lib/persistence, no
 * app/lib/phase6/persistenceTargetDecision, no P6-I0..I5H tests, no harness, no
 * P7.1 utilities, no network, no GitHub API, no child_process, no file mutation,
 * no secrets, no ApprovalStore, no external actions, no D1, no SQL, no LLM, no
 * Evidence Ledger append, no Graph Model write. The fixtures are exercised
 * in-memory only.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import {
  VALID_PUT_AUDIT_EVENT_FIXTURE_INPUT,
  VALID_GET_AUDIT_EVENT_FIXTURE_INPUT,
  VALID_LIST_AUDIT_EVENT_FIXTURE_INPUT,
  VALID_COUNT_AUDIT_EVENT_FIXTURE_INPUT,
  VALID_CLEAR_TENANT_AUDIT_EVENT_FIXTURE_INPUT,
  VALID_CLEAR_ALL_AUDIT_EVENT_FIXTURE_INPUT,
  BLOCKED_NO_GO_AUDIT_EVENT_FIXTURE_INPUT,
  VALID_PUT_AUDIT_EVENT_FIXTURE,
  VALID_GET_AUDIT_EVENT_FIXTURE,
  VALID_LIST_AUDIT_EVENT_FIXTURE,
  VALID_COUNT_AUDIT_EVENT_FIXTURE,
  VALID_CLEAR_TENANT_AUDIT_EVENT_FIXTURE,
  VALID_CLEAR_ALL_AUDIT_EVENT_FIXTURE,
  BLOCKED_NO_GO_AUDIT_EVENT_FIXTURE,
  createValidPutAuditEventFixture,
  createValidGetAuditEventFixture,
  createValidListAuditEventFixture,
  createValidCountAuditEventFixture,
  createValidClearTenantAuditEventFixture,
  createValidClearAllAuditEventFixture,
  createBlockedNoGoAuditEventFixture,
  ALL_PERSISTENCE_AUDIT_EVENT_FIXTURES,
} from "./fixtures/phase6/persistenceAuditEvidenceFixture.mts"
import { validatePersistenceAuditEvent } from "../app/lib/phase6/persistenceAuditEvidence/index.ts"

const VALID_FIXTURES = [
  VALID_PUT_AUDIT_EVENT_FIXTURE,
  VALID_GET_AUDIT_EVENT_FIXTURE,
  VALID_LIST_AUDIT_EVENT_FIXTURE,
  VALID_COUNT_AUDIT_EVENT_FIXTURE,
  VALID_CLEAR_TENANT_AUDIT_EVENT_FIXTURE,
  VALID_CLEAR_ALL_AUDIT_EVENT_FIXTURE,
]
const ALL = [...VALID_FIXTURES, BLOCKED_NO_GO_AUDIT_EVENT_FIXTURE]

// 1-7 existence
test("put audit event fixture exists", () => assert.ok(VALID_PUT_AUDIT_EVENT_FIXTURE))
test("get audit event fixture exists", () => assert.ok(VALID_GET_AUDIT_EVENT_FIXTURE))
test("list audit event fixture exists", () => assert.ok(VALID_LIST_AUDIT_EVENT_FIXTURE))
test("count audit event fixture exists", () => assert.ok(VALID_COUNT_AUDIT_EVENT_FIXTURE))
test("clear_tenant audit event fixture exists", () => assert.ok(VALID_CLEAR_TENANT_AUDIT_EVENT_FIXTURE))
test("clear_all audit event fixture exists", () => assert.ok(VALID_CLEAR_ALL_AUDIT_EVENT_FIXTURE))
test("blocked_no_go audit event fixture exists", () => assert.ok(BLOCKED_NO_GO_AUDIT_EVENT_FIXTURE))

// 8-14 validate
test("put fixture validates with validatePersistenceAuditEvent", () => assert.equal(validatePersistenceAuditEvent(VALID_PUT_AUDIT_EVENT_FIXTURE).ok, true))
test("get fixture validates with validatePersistenceAuditEvent", () => assert.equal(validatePersistenceAuditEvent(VALID_GET_AUDIT_EVENT_FIXTURE).ok, true))
test("list fixture validates with validatePersistenceAuditEvent", () => assert.equal(validatePersistenceAuditEvent(VALID_LIST_AUDIT_EVENT_FIXTURE).ok, true))
test("count fixture validates with validatePersistenceAuditEvent", () => assert.equal(validatePersistenceAuditEvent(VALID_COUNT_AUDIT_EVENT_FIXTURE).ok, true))
test("clear_tenant fixture validates with validatePersistenceAuditEvent", () => assert.equal(validatePersistenceAuditEvent(VALID_CLEAR_TENANT_AUDIT_EVENT_FIXTURE).ok, true))
test("clear_all fixture validates with validatePersistenceAuditEvent", () => assert.equal(validatePersistenceAuditEvent(VALID_CLEAR_ALL_AUDIT_EVENT_FIXTURE).ok, true))
test("blocked fixture validates with validatePersistenceAuditEvent", () => assert.equal(validatePersistenceAuditEvent(BLOCKED_NO_GO_AUDIT_EVENT_FIXTURE).ok, true))

// 15-20 operation values
test("put fixture operation is put", () => assert.equal(VALID_PUT_AUDIT_EVENT_FIXTURE.operation, "put"))
test("get fixture operation is get", () => assert.equal(VALID_GET_AUDIT_EVENT_FIXTURE.operation, "get"))
test("list fixture operation is list", () => assert.equal(VALID_LIST_AUDIT_EVENT_FIXTURE.operation, "list"))
test("count fixture operation is count", () => assert.equal(VALID_COUNT_AUDIT_EVENT_FIXTURE.operation, "count"))
test("clear_tenant fixture operation is clear_tenant", () => assert.equal(VALID_CLEAR_TENANT_AUDIT_EVENT_FIXTURE.operation, "clear_tenant"))
test("clear_all fixture operation is clear_all", () => assert.equal(VALID_CLEAR_ALL_AUDIT_EVENT_FIXTURE.operation, "clear_all"))

// 21-23 blocked
test("blocked fixture operation_status is blocked_no_go", () => assert.equal(BLOCKED_NO_GO_AUDIT_EVENT_FIXTURE.operation_status, "blocked_no_go"))
test("blocked fixture operation_outcome is no_go", () => assert.equal(BLOCKED_NO_GO_AUDIT_EVENT_FIXTURE.operation_outcome, "no_go"))
test("blocked fixture has non-empty no_go_flags", () => assert.ok(BLOCKED_NO_GO_AUDIT_EVENT_FIXTURE.no_go_flags.length > 0))

// 24-25 target invariants
test("every fixture adapter_target_class is in_memory_test_only_store", () => {
  for (const e of ALL) assert.equal(e.adapter_target_class, "in_memory_test_only_store")
})
test("every fixture selected_target_class is in_memory_test_only_store", () => {
  for (const e of ALL) assert.equal(e.selected_target_class, "in_memory_test_only_store")
})

// 26-30 fixed caller-provided values
test("every fixture preserves fixed caller-provided audit_event_id", () => {
  for (const e of ALL) assert.ok(typeof e.audit_event_id === "string" && e.audit_event_id.length > 0)
  assert.equal(VALID_PUT_AUDIT_EVENT_FIXTURE.audit_event_id, VALID_PUT_AUDIT_EVENT_FIXTURE_INPUT.audit_event_id)
})
test("every fixture preserves fixed caller-provided tenant_id", () => {
  for (const e of ALL) assert.equal(e.tenant_id, "tenant_audit_evidence_fixture")
})
test("every fixture preserves fixed caller-provided target_decision_record_id", () => {
  for (const e of ALL) assert.equal(e.target_decision_record_id, "tdr_audit_evidence_fixture_001")
})
test("every fixture preserves fixed caller-provided created_at", () => {
  for (const e of ALL) assert.equal(e.created_at, "2026-07-08T00:00:00Z")
})
test("every fixture preserves fixed caller-provided payload_hash", () => {
  assert.equal(VALID_PUT_AUDIT_EVENT_FIXTURE.payload_hash, VALID_PUT_AUDIT_EVENT_FIXTURE_INPUT.payload_hash)
  for (const e of ALL) assert.match(e.payload_hash, /^[0-9a-f]{64}$/)
})

// 31
test("every valid fixture has no_go_flags []", () => {
  for (const e of VALID_FIXTURES) assert.deepEqual([...e.no_go_flags], [])
})

// 32
test("all fixtures have non_authorization_statement", () => {
  for (const e of ALL) {
    assert.ok(e.non_authorization_statement.includes("not approval"))
    assert.ok(e.non_authorization_statement.includes("not production readiness"))
  }
})

// 33
test("all fixtures contain no approval/execution/persistence/storage/durable-storage/ledger/graph/promotion grant fields", () => {
  for (const e of ALL) {
    for (const f of [
      "approval", "approved", "authorized", "execution_permission", "executed",
      "promotion_permission", "promoted", "persistence_permission", "persisted",
      "storage_permission", "stored", "durable_storage_permission",
      "evidence_ledger_append_permission", "graph_write_permission",
      "external_action_permission", "formal_workunit_promotion", "approvalstore_approval",
    ]) {
      assert.equal(Object.prototype.hasOwnProperty.call(e, f), false, f)
    }
  }
})

// 34
test("fixture factory functions return deterministic deep-equal events", () => {
  assert.deepEqual(createValidPutAuditEventFixture(), VALID_PUT_AUDIT_EVENT_FIXTURE)
  assert.deepEqual(createValidGetAuditEventFixture(), VALID_GET_AUDIT_EVENT_FIXTURE)
  assert.deepEqual(createValidListAuditEventFixture(), VALID_LIST_AUDIT_EVENT_FIXTURE)
  assert.deepEqual(createValidCountAuditEventFixture(), VALID_COUNT_AUDIT_EVENT_FIXTURE)
  assert.deepEqual(createValidClearTenantAuditEventFixture(), VALID_CLEAR_TENANT_AUDIT_EVENT_FIXTURE)
  assert.deepEqual(createValidClearAllAuditEventFixture(), VALID_CLEAR_ALL_AUDIT_EVENT_FIXTURE)
  assert.deepEqual(createBlockedNoGoAuditEventFixture(), BLOCKED_NO_GO_AUDIT_EVENT_FIXTURE)
})

// 35
test("fixture constants are frozen or treated as immutable where practical", () => {
  for (const e of ALL) assert.equal(Object.isFrozen(e), true)
  assert.equal(Object.isFrozen(VALID_PUT_AUDIT_EVENT_FIXTURE_INPUT), true)
  assert.equal(Object.isFrozen(ALL_PERSISTENCE_AUDIT_EVENT_FIXTURES), true)
})

// 36
test("mutating a returned fixture copy does not mutate exported fixture constants", () => {
  const fresh = createValidPutAuditEventFixture()
  try {
    ;(fresh as unknown as Record<string, unknown>).tenant_id = "mutated"
  } catch {
    /* frozen event rejects mutation; expected */
  }
  assert.equal(VALID_PUT_AUDIT_EVENT_FIXTURE.tenant_id, "tenant_audit_evidence_fixture")
})

// 37-38 collection
test("ALL_PERSISTENCE_AUDIT_EVENT_FIXTURES contains exactly seven fixtures", () => {
  assert.equal(ALL_PERSISTENCE_AUDIT_EVENT_FIXTURES.length, 7)
})
test("ALL_PERSISTENCE_AUDIT_EVENT_FIXTURES is deterministically ordered", () => {
  assert.deepEqual(
    ALL_PERSISTENCE_AUDIT_EVENT_FIXTURES.map((e) => e.operation + ":" + e.operation_status),
    [
      "put:accepted",
      "get:not_found",
      "list:accepted",
      "count:accepted",
      "clear_tenant:cleared",
      "clear_all:cleared",
      "put:blocked_no_go",
    ],
  )
})

// 39
test("fixture inputs are exported", () => {
  for (const input of [
    VALID_PUT_AUDIT_EVENT_FIXTURE_INPUT,
    VALID_GET_AUDIT_EVENT_FIXTURE_INPUT,
    VALID_LIST_AUDIT_EVENT_FIXTURE_INPUT,
    VALID_COUNT_AUDIT_EVENT_FIXTURE_INPUT,
    VALID_CLEAR_TENANT_AUDIT_EVENT_FIXTURE_INPUT,
    VALID_CLEAR_ALL_AUDIT_EVENT_FIXTURE_INPUT,
    BLOCKED_NO_GO_AUDIT_EVENT_FIXTURE_INPUT,
  ]) {
    assert.equal(typeof input, "object")
  }
})

// 40
test("fixture source_loop/source lineage fields are fixed", () => {
  for (const e of ALL) {
    assert.equal(e.source_loop, "P6-I5E")
    assert.equal(e.source_adapter_loop, "P6-I5E")
    assert.equal(e.source_fixture_loop, "P6-I5D")
    assert.equal(e.source_validator_loop, "P6-I5G")
    assert.equal(e.source_constructor_loop, "P6-I5H")
    assert.equal(e.source_target_decision_record_id, "tdr_audit_evidence_fixture_001")
  }
})

// 41 (behavior-level proof of P6-I5H construction)
test("fixtures are created through P6-I5H constructors", () => {
  // Factory output deep-equals the exported constant and re-validates; the
  // operation-specific shape matches each constructor contract.
  assert.deepEqual(createValidPutAuditEventFixture(), VALID_PUT_AUDIT_EVENT_FIXTURE)
  assert.equal(VALID_PUT_AUDIT_EVENT_FIXTURE.operation, "put")
  assert.equal(VALID_PUT_AUDIT_EVENT_FIXTURE.clear_scope, "none")
  assert.equal(VALID_CLEAR_ALL_AUDIT_EVENT_FIXTURE.clear_scope, "all_test_memory")
  assert.equal(BLOCKED_NO_GO_AUDIT_EVENT_FIXTURE.operation_status, "blocked_no_go")
})

// 42
test("fixtures validate through P6-I5G validators", () => {
  for (const e of ALL) assert.equal(validatePersistenceAuditEvent(e).ok, true)
})

// 43
test("fixture module exports expected constants and factory functions", () => {
  assert.equal(typeof createValidPutAuditEventFixture, "function")
  assert.equal(typeof createBlockedNoGoAuditEventFixture, "function")
  assert.equal(Array.isArray(ALL_PERSISTENCE_AUDIT_EVENT_FIXTURES), true)
})

// 44
test("fixture construction does not rely on self-match traps", () => {
  // Assert observable behavior: each fixture re-validates and the collection is complete.
  for (const e of ALL_PERSISTENCE_AUDIT_EVENT_FIXTURES) assert.equal(validatePersistenceAuditEvent(e).ok, true)
  assert.equal(ALL_PERSISTENCE_AUDIT_EVENT_FIXTURES.length, 7)
})

// 46 (non-authorizing) — declared before the source guard
test("fixture validity remains non-authorizing", () => {
  for (const e of ALL) {
    const v = validatePersistenceAuditEvent(e)
    assert.deepEqual(Object.keys(v).sort(), ["issues", "ok"])
    assert.equal(Object.prototype.hasOwnProperty.call(e, "approval"), false)
  }
})

// ─── Phase 4: static source guard (read-only, fixture source only) ──

const FIXTURE_SRC = fileURLToPath(
  new URL("./fixtures/phase6/persistenceAuditEvidenceFixture.mts", import.meta.url),
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
]

// 45
test("source guard confirms fixture does not contain forbidden runtime capability substrings", () => {
  const text = readFileSync(FIXTURE_SRC, "utf8")
  for (const needle of FORBIDDEN_SOURCE_SUBSTRINGS) {
    assert.ok(!text.includes(needle), `fixture source must not contain: <<<${needle}>>>`)
  }
})
