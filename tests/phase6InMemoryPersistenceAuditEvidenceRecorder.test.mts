/**
 * P6-I5J: isolated tests for the test-only in-memory Phase 6 Persistence Audit
 * Evidence recorder.
 *
 * Imports the fixture module, the recorder harness, and the Phase 6 Persistence
 * Audit Evidence module surface (for the P6-I5G validator and a P6-I5H
 * constructor used to build a second-tenant event), plus node:test /
 * node:assert/strict and — for the Phase 4 static source guard only — node:fs /
 * node:url to READ (never mutate) the recorder source. No app runtime modules,
 * no app/lib/persistence, no app/lib/phase6/persistenceTargetDecision, no
 * P6-I0..I5I tests, no P7.1 utilities, no network, no GitHub API, no
 * child_process, no file mutation, no secrets, no ApprovalStore, no external
 * actions, no D1, no SQL, no LLM, no Evidence Ledger append, no Graph Model
 * write. The recorder is exercised in-process only.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import {
  VALID_PUT_AUDIT_EVENT_FIXTURE,
  VALID_GET_AUDIT_EVENT_FIXTURE,
  VALID_LIST_AUDIT_EVENT_FIXTURE,
  VALID_COUNT_AUDIT_EVENT_FIXTURE,
  VALID_CLEAR_TENANT_AUDIT_EVENT_FIXTURE,
  VALID_CLEAR_ALL_AUDIT_EVENT_FIXTURE,
  BLOCKED_NO_GO_AUDIT_EVENT_FIXTURE,
  VALID_PUT_AUDIT_EVENT_FIXTURE_INPUT,
  ALL_PERSISTENCE_AUDIT_EVENT_FIXTURES,
} from "./fixtures/phase6/persistenceAuditEvidenceFixture.mts"
import { createInMemoryPersistenceAuditEvidenceRecorder } from "./harness/phase6/inMemoryPersistenceAuditEvidenceRecorder.mts"
import {
  validatePersistenceAuditEvent,
  createPutPersistenceAuditEvent,
} from "../app/lib/phase6/persistenceAuditEvidence/index.ts"

const TENANT = VALID_PUT_AUDIT_EVENT_FIXTURE.tenant_id
const PUT_ID = VALID_PUT_AUDIT_EVENT_FIXTURE.audit_event_id

/** A valid put event under a second tenant, built via the P6-I5H constructor. */
function secondTenantEvent() {
  const result = createPutPersistenceAuditEvent({
    ...VALID_PUT_AUDIT_EVENT_FIXTURE_INPUT,
    tenant_id: "tenant_audit_second",
    audit_event_id: "ae_second_fixture_001",
  })
  if (!result.ok) throw new Error("second tenant event failed to construct")
  return result.event
}

function seeded() {
  const r = createInMemoryPersistenceAuditEvidenceRecorder()
  for (const e of ALL_PERSISTENCE_AUDIT_EVENT_FIXTURES) {
    r.recordAuditEvent({ tenant_id: TENANT, event: e })
  }
  return r
}

// 1
test("recorder can be created", () => {
  const r = createInMemoryPersistenceAuditEvidenceRecorder()
  assert.equal(typeof r.recordAuditEvent, "function")
  assert.equal(typeof r.getAuditEvent, "function")
})

// 2-8 accept each fixture
test("recordAuditEvent accepts put fixture", () => assert.equal(createInMemoryPersistenceAuditEvidenceRecorder().recordAuditEvent({ tenant_id: TENANT, event: VALID_PUT_AUDIT_EVENT_FIXTURE }).ok, true))
test("recordAuditEvent accepts get fixture", () => assert.equal(createInMemoryPersistenceAuditEvidenceRecorder().recordAuditEvent({ tenant_id: TENANT, event: VALID_GET_AUDIT_EVENT_FIXTURE }).ok, true))
test("recordAuditEvent accepts list fixture", () => assert.equal(createInMemoryPersistenceAuditEvidenceRecorder().recordAuditEvent({ tenant_id: TENANT, event: VALID_LIST_AUDIT_EVENT_FIXTURE }).ok, true))
test("recordAuditEvent accepts count fixture", () => assert.equal(createInMemoryPersistenceAuditEvidenceRecorder().recordAuditEvent({ tenant_id: TENANT, event: VALID_COUNT_AUDIT_EVENT_FIXTURE }).ok, true))
test("recordAuditEvent accepts clear_tenant fixture", () => assert.equal(createInMemoryPersistenceAuditEvidenceRecorder().recordAuditEvent({ tenant_id: TENANT, event: VALID_CLEAR_TENANT_AUDIT_EVENT_FIXTURE }).ok, true))
test("recordAuditEvent accepts clear_all fixture", () => assert.equal(createInMemoryPersistenceAuditEvidenceRecorder().recordAuditEvent({ tenant_id: TENANT, event: VALID_CLEAR_ALL_AUDIT_EVENT_FIXTURE }).ok, true))
test("recordAuditEvent accepts blocked_no_go fixture", () => assert.equal(createInMemoryPersistenceAuditEvidenceRecorder().recordAuditEvent({ tenant_id: TENANT, event: BLOCKED_NO_GO_AUDIT_EVENT_FIXTURE }).ok, true))

// 9-10 get
test("getAuditEvent returns event by tenant and audit_event_id", () => {
  const r = seeded()
  const got = r.getAuditEvent({ tenant_id: TENANT, audit_event_id: PUT_ID })
  assert.equal(got.ok, true)
  assert.equal(got.event?.audit_event_id, PUT_ID)
})
test("getAuditEvent does not read across tenants", () => {
  const r = seeded()
  assert.equal(r.getAuditEvent({ tenant_id: "tenant_other", audit_event_id: PUT_ID }).event, undefined)
})

// 11-12 list
test("listAuditEvents returns only same-tenant events", () => {
  const r = seeded()
  r.recordAuditEvent({ tenant_id: "tenant_audit_second", event: secondTenantEvent() })
  const list = r.listAuditEvents({ tenant_id: TENANT })
  assert.equal(list.ok, true)
  assert.equal(list.events?.length, 7)
  for (const e of list.events ?? []) assert.equal(e.tenant_id, TENANT)
})
test("listAuditEvents is deterministically sorted by created_at then audit_event_id", () => {
  const r = seeded()
  const events = r.listAuditEvents({ tenant_id: TENANT }).events ?? []
  const keys = events.map((e) => `${e.created_at}|${e.audit_event_id}`)
  assert.deepEqual(keys, [...keys].sort())
})

// 13
test("countAuditEvents counts only same-tenant events", () => {
  const r = seeded()
  r.recordAuditEvent({ tenant_id: "tenant_audit_second", event: secondTenantEvent() })
  assert.equal(r.countAuditEvents({ tenant_id: TENANT }).count, 7)
  assert.equal(r.countAuditEvents({ tenant_id: "tenant_audit_second" }).count, 1)
})

// 14-15 clear
test("clearTenantAuditEvents clears only one tenant", () => {
  const r = seeded()
  r.recordAuditEvent({ tenant_id: "tenant_audit_second", event: secondTenantEvent() })
  const cleared = r.clearTenantAuditEvents({ tenant_id: TENANT })
  assert.equal(cleared.ok, true)
  assert.equal(cleared.cleared_count, 7)
  assert.equal(r.countAuditEvents({ tenant_id: TENANT }).count, 0)
  assert.equal(r.countAuditEvents({ tenant_id: "tenant_audit_second" }).count, 1)
})
test("clearAllAuditEvents clears all tenants", () => {
  const r = seeded()
  r.recordAuditEvent({ tenant_id: "tenant_audit_second", event: secondTenantEvent() })
  const cleared = r.clearAllAuditEvents()
  assert.equal(cleared.ok, true)
  assert.equal(cleared.cleared_count, 8)
  assert.equal(r.countAuditEvents({ tenant_id: TENANT }).count, 0)
  assert.equal(r.countAuditEvents({ tenant_id: "tenant_audit_second" }).count, 0)
})

// 16
test("recordAuditEvent validates events before accepting", () => {
  const r = createInMemoryPersistenceAuditEvidenceRecorder()
  const bad = { ...VALID_PUT_AUDIT_EVENT_FIXTURE, payload_hash: "not-a-valid-hash" }
  const res = r.recordAuditEvent({ tenant_id: TENANT, event: bad })
  assert.equal(res.ok, false)
  assert.ok(res.issues.some((i) => i.code === "validation_failed"))
})

// 17
test("invalid event is rejected", () => {
  const r = createInMemoryPersistenceAuditEvidenceRecorder()
  const res = r.recordAuditEvent({ tenant_id: TENANT, event: 42 })
  assert.equal(res.ok, false)
  assert.ok(res.issues.some((i) => i.code === "invalid_event"))
})

// 18
test("tenant mismatch is rejected", () => {
  const r = createInMemoryPersistenceAuditEvidenceRecorder()
  const res = r.recordAuditEvent({ tenant_id: "tenant_wrong", event: VALID_PUT_AUDIT_EVENT_FIXTURE })
  assert.equal(res.ok, false)
  assert.ok(res.issues.some((i) => i.code === "tenant_mismatch"))
})

// 19-20 forbidden target
test("adapter target other than in_memory_test_only_store is rejected", () => {
  const r = createInMemoryPersistenceAuditEvidenceRecorder()
  const bad = { ...VALID_PUT_AUDIT_EVENT_FIXTURE, adapter_target_class: "local_ephemeral_dev_store" }
  const res = r.recordAuditEvent({ tenant_id: TENANT, event: bad })
  assert.equal(res.ok, false)
  assert.ok(res.issues.some((i) => i.code === "forbidden_target_class"))
})
test("selected target other than in_memory_test_only_store is rejected", () => {
  const r = createInMemoryPersistenceAuditEvidenceRecorder()
  const bad = { ...VALID_PUT_AUDIT_EVENT_FIXTURE, selected_target_class: "blocked_target" }
  const res = r.recordAuditEvent({ tenant_id: TENANT, event: bad })
  assert.equal(res.ok, false)
  assert.ok(res.issues.some((i) => i.code === "forbidden_target_class"))
})

// 21-22 duplicate
test("duplicate same id with same content is idempotent", () => {
  const r = createInMemoryPersistenceAuditEvidenceRecorder()
  const a = r.recordAuditEvent({ tenant_id: TENANT, event: VALID_PUT_AUDIT_EVENT_FIXTURE })
  const b = r.recordAuditEvent({ tenant_id: TENANT, event: VALID_PUT_AUDIT_EVENT_FIXTURE })
  assert.equal(a.ok, true)
  assert.equal(b.ok, true)
  assert.equal(r.countAuditEvents({ tenant_id: TENANT }).count, 1)
})
test("duplicate same id with different content fails closed", () => {
  const r = createInMemoryPersistenceAuditEvidenceRecorder()
  r.recordAuditEvent({ tenant_id: TENANT, event: VALID_PUT_AUDIT_EVENT_FIXTURE })
  // A valid-but-different put event (non-key field changed): still validates,
  // so it reaches the duplicate check.
  const conflict = { ...VALID_PUT_AUDIT_EVENT_FIXTURE, defensive_snapshot_result: "defensive_clone_returned" }
  const res = r.recordAuditEvent({ tenant_id: TENANT, event: conflict })
  assert.equal(res.ok, false)
  assert.ok(res.issues.some((i) => i.code === "duplicate_conflict"))
  // Original event not overwritten.
  const got = r.getAuditEvent({ tenant_id: TENANT, audit_event_id: PUT_ID })
  assert.equal(got.event?.defensive_snapshot_result, "frozen_snapshot_returned")
})

// 23
test("returned events are defensive snapshots or frozen", () => {
  const r = seeded()
  const got = r.getAuditEvent({ tenant_id: TENANT, audit_event_id: PUT_ID })
  assert.ok(got.event)
  assert.equal(Object.isFrozen(got.event), true)
})

// 24
test("mutating a returned event does not mutate stored event", () => {
  const r = seeded()
  const first = r.getAuditEvent({ tenant_id: TENANT, audit_event_id: PUT_ID }).event
  try {
    ;(first as unknown as Record<string, unknown>).tenant_id = "mutated"
  } catch {
    /* frozen snapshot rejects mutation; expected */
  }
  const again = r.getAuditEvent({ tenant_id: TENANT, audit_event_id: PUT_ID }).event
  assert.equal(again?.tenant_id, TENANT)
})

// 25
test("recorder result shape is non-authorizing", () => {
  const r = seeded()
  const res = r.listAuditEvents({ tenant_id: TENANT })
  for (const k of Object.keys(res)) {
    assert.ok(["ok", "issues", "event", "events", "count", "cleared_count"].includes(k), k)
  }
})

// 26
test("recorder does not create approval/execution/persistence/storage/durable-storage/ledger/graph/promotion grant fields", () => {
  const r = seeded()
  const res = r.getAuditEvent({ tenant_id: TENANT, audit_event_id: PUT_ID })
  for (const f of [
    "approval", "approved", "authorized", "execution_permission", "executed",
    "promotion_permission", "promoted", "persistence_permission", "persisted",
    "storage_permission", "stored", "durable_storage_permission",
    "evidence_ledger_append_permission", "graph_write_permission",
    "external_action_permission", "formal_workunit_promotion", "approvalstore_approval",
  ]) {
    assert.equal(Object.prototype.hasOwnProperty.call(res, f), false, f)
    assert.equal(Object.prototype.hasOwnProperty.call(res.event ?? {}, f), false, f)
  }
})

// 27
test("issue messages do not echo secret-like values", () => {
  const r = createInMemoryPersistenceAuditEvidenceRecorder()
  const secret = "SUPER_SECRET_zzz999"
  const bad = { ...VALID_PUT_AUDIT_EVENT_FIXTURE, payload_hash: secret }
  const res = r.recordAuditEvent({ tenant_id: TENANT, event: bad })
  assert.equal(res.ok, false)
  for (const i of res.issues) {
    assert.equal(i.message, `${i.code}:${i.field}`)
    assert.ok(!i.message.includes(secret))
  }
})

// 28
test("normal invalid input does not throw", () => {
  const r = createInMemoryPersistenceAuditEvidenceRecorder()
  for (const bad of [null, undefined, 42, "x", []]) {
    const res = r.recordAuditEvent(bad as unknown as { tenant_id: string; event: unknown })
    assert.equal(res.ok, false)
  }
})

// 29
test("recorder works with all P6-I5I fixtures", () => {
  const r = createInMemoryPersistenceAuditEvidenceRecorder()
  for (const e of ALL_PERSISTENCE_AUDIT_EVENT_FIXTURES) {
    assert.equal(r.recordAuditEvent({ tenant_id: TENANT, event: e }).ok, true)
  }
  assert.equal(r.countAuditEvents({ tenant_id: TENANT }).count, 7)
})

// 30-33 preservation
test("recorder preserves audit_event_id", () => {
  const r = seeded()
  assert.equal(r.getAuditEvent({ tenant_id: TENANT, audit_event_id: PUT_ID }).event?.audit_event_id, PUT_ID)
})
test("recorder preserves tenant_id", () => {
  const r = seeded()
  assert.equal(r.getAuditEvent({ tenant_id: TENANT, audit_event_id: PUT_ID }).event?.tenant_id, TENANT)
})
test("recorder preserves payload_hash", () => {
  const r = seeded()
  assert.equal(
    r.getAuditEvent({ tenant_id: TENANT, audit_event_id: PUT_ID }).event?.payload_hash,
    VALID_PUT_AUDIT_EVENT_FIXTURE.payload_hash,
  )
})
test("recorder preserves non_authorization_statement", () => {
  const r = seeded()
  assert.equal(
    r.getAuditEvent({ tenant_id: TENANT, audit_event_id: PUT_ID }).event?.non_authorization_statement,
    VALID_PUT_AUDIT_EVENT_FIXTURE.non_authorization_statement,
  )
})

// 34-35 clear counts
test("clear tenant returns cleared_count", () => {
  const r = seeded()
  assert.equal(r.clearTenantAuditEvents({ tenant_id: TENANT }).cleared_count, 7)
})
test("clear all returns cleared_count", () => {
  const r = seeded()
  assert.equal(r.clearAllAuditEvents().cleared_count, 7)
})

// 36
test("get not-found returns ok with undefined event", () => {
  const r = createInMemoryPersistenceAuditEvidenceRecorder()
  const got = r.getAuditEvent({ tenant_id: TENANT, audit_event_id: "missing_id" })
  assert.equal(got.ok, true)
  assert.equal(got.event, undefined)
})

// 37
test("recorder stores no data outside process memory", () => {
  const seededOne = seeded()
  assert.equal(seededOne.countAuditEvents({ tenant_id: TENANT }).count, 7)
  const fresh = createInMemoryPersistenceAuditEvidenceRecorder()
  assert.equal(fresh.countAuditEvents({ tenant_id: TENANT }).count, 0)
})

// 39 (declared before the guard; asserts observable behavior, no self-scan)
test("test does not rely on self-match traps", () => {
  const r = createInMemoryPersistenceAuditEvidenceRecorder()
  assert.equal(r.recordAuditEvent({ tenant_id: TENANT, event: VALID_PUT_AUDIT_EVENT_FIXTURE }).ok, true)
  assert.equal(r.recordAuditEvent({ tenant_id: TENANT, event: {} }).ok, false)
})

// 40
test("recorder success remains non-authorizing", () => {
  const r = seeded()
  const res = r.getAuditEvent({ tenant_id: TENANT, audit_event_id: PUT_ID })
  assert.equal(res.ok, true)
  assert.equal(validatePersistenceAuditEvent(res.event).ok, true)
  assert.equal(Object.prototype.hasOwnProperty.call(res, "approval"), false)
})

// ─── Phase 4: static source guard (read-only, recorder source only) ──

const RECORDER_SRC = fileURLToPath(
  new URL("./harness/phase6/inMemoryPersistenceAuditEvidenceRecorder.mts", import.meta.url),
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

// 38
test("source guard confirms recorder does not contain forbidden runtime capability substrings", () => {
  const text = readFileSync(RECORDER_SRC, "utf8")
  for (const needle of FORBIDDEN_SOURCE_SUBSTRINGS) {
    assert.ok(!text.includes(needle), `recorder source must not contain: <<<${needle}>>>`)
  }
})
