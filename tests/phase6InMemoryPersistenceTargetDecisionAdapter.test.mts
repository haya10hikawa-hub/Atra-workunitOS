/**
 * P6-I5E: isolated tests for the test-only in-memory Phase 6 Persistence Target
 * Decision adapter.
 *
 * Imports the fixture module, the adapter harness, and the Phase 6 Persistence
 * Target Decision module surface, plus node:test / node:assert/strict and — for
 * the Phase 4 static source guard only — node:fs / node:url to READ (never
 * mutate) the adapter source. No app runtime modules, no app/lib/persistence, no
 * P6-I0..I5D tests, no P7.1 utilities, no network, no GitHub API, no
 * child_process, no file mutation, no secrets, no ApprovalStore, no external
 * actions, no D1, no SQL, no LLM. The adapter is exercised in-process only.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import {
  VALID_TARGET_DECISION_RECORD_FIXTURE,
  BLOCKED_TARGET_DECISION_RECORD_FIXTURE,
  VALID_TARGET_DECISION_RECORD_FIXTURE_INPUT,
} from "./fixtures/phase6/persistenceTargetDecisionFixture.mts"
import { createInMemoryPersistenceTargetDecisionAdapter } from "./harness/phase6/inMemoryPersistenceTargetDecisionAdapter.mts"
import { createTargetDecisionRecord } from "../app/lib/phase6/persistenceTargetDecision/index.ts"

const TENANT = VALID_TARGET_DECISION_RECORD_FIXTURE.tenant_id
const VALID_ID = VALID_TARGET_DECISION_RECORD_FIXTURE.target_decision_record_id
const BLOCKED_ID = BLOCKED_TARGET_DECISION_RECORD_FIXTURE.target_decision_record_id

const DEFERRED = [
  "local_ephemeral_dev_store",
  "append_only_audit_candidate_store",
  "tenant_scoped_artifact_candidate_store",
  "future_d1_store_after_separate_d1_gate",
]

/** Build a valid record for a second tenant via the P6-I5C constructor. */
function secondTenantRecord() {
  const result = createTargetDecisionRecord({
    ...VALID_TARGET_DECISION_RECORD_FIXTURE_INPUT,
    tenant_id: "tenant_phase6_second",
    target_decision_record_id: "tdr_fixture_second_001",
  })
  if (!result.ok) throw new Error("second tenant record failed to construct")
  return result.record
}

function seeded() {
  const a = createInMemoryPersistenceTargetDecisionAdapter()
  a.putTargetDecisionCandidate({ tenant_id: TENANT, record: VALID_TARGET_DECISION_RECORD_FIXTURE })
  a.putTargetDecisionCandidate({ tenant_id: TENANT, record: BLOCKED_TARGET_DECISION_RECORD_FIXTURE })
  return a
}

// 1
test("adapter can be created", () => {
  const a = createInMemoryPersistenceTargetDecisionAdapter()
  assert.equal(typeof a.putTargetDecisionCandidate, "function")
  assert.equal(typeof a.getTargetDecisionCandidate, "function")
})

// 2
test("putTargetDecisionCandidate accepts valid fixture", () => {
  const a = createInMemoryPersistenceTargetDecisionAdapter()
  const r = a.putTargetDecisionCandidate({ tenant_id: TENANT, record: VALID_TARGET_DECISION_RECORD_FIXTURE })
  assert.equal(r.ok, true, JSON.stringify(r.issues))
})

// 3
test("putTargetDecisionCandidate accepts blocked fixture", () => {
  const a = createInMemoryPersistenceTargetDecisionAdapter()
  const r = a.putTargetDecisionCandidate({ tenant_id: TENANT, record: BLOCKED_TARGET_DECISION_RECORD_FIXTURE })
  assert.equal(r.ok, true, JSON.stringify(r.issues))
})

// 4
test("getTargetDecisionCandidate returns valid fixture by tenant and id", () => {
  const a = seeded()
  const r = a.getTargetDecisionCandidate({ tenant_id: TENANT, target_decision_record_id: VALID_ID })
  assert.equal(r.ok, true)
  assert.equal(r.record?.target_decision_record_id, VALID_ID)
  assert.equal(r.record?.selected_target_class, "in_memory_test_only_store")
})

// 5
test("getTargetDecisionCandidate returns blocked fixture by tenant and id", () => {
  const a = seeded()
  const r = a.getTargetDecisionCandidate({ tenant_id: TENANT, target_decision_record_id: BLOCKED_ID })
  assert.equal(r.ok, true)
  assert.equal(r.record?.target_decision_record_id, BLOCKED_ID)
  assert.equal(r.record?.target_decision_status, "blocked_no_go")
})

// 6
test("getTargetDecisionCandidate does not read across tenants", () => {
  const a = seeded()
  const r = a.getTargetDecisionCandidate({ tenant_id: "tenant_other", target_decision_record_id: VALID_ID })
  assert.equal(r.ok, true)
  assert.equal(r.record, undefined)
})

// 7
test("listTargetDecisionCandidates returns only same-tenant records", () => {
  const a = seeded()
  a.putTargetDecisionCandidate({ tenant_id: "tenant_phase6_second", record: secondTenantRecord() })
  const r = a.listTargetDecisionCandidates({ tenant_id: TENANT })
  assert.equal(r.ok, true)
  for (const rec of r.records ?? []) assert.equal(rec.tenant_id, TENANT)
  assert.equal(r.records?.length, 2)
})

// 8
test("listTargetDecisionCandidates is deterministically sorted by target_decision_record_id", () => {
  const a = seeded()
  const ids = (a.listTargetDecisionCandidates({ tenant_id: TENANT }).records ?? []).map(
    (r) => r.target_decision_record_id,
  )
  const sorted = [...ids].sort()
  assert.deepEqual(ids, sorted)
})

// 9
test("countTargetDecisionCandidates counts only same-tenant records", () => {
  const a = seeded()
  a.putTargetDecisionCandidate({ tenant_id: "tenant_phase6_second", record: secondTenantRecord() })
  assert.equal(a.countTargetDecisionCandidates({ tenant_id: TENANT }).count, 2)
  assert.equal(a.countTargetDecisionCandidates({ tenant_id: "tenant_phase6_second" }).count, 1)
})

// 10
test("clearTargetDecisionCandidates clears only one tenant", () => {
  const a = seeded()
  a.putTargetDecisionCandidate({ tenant_id: "tenant_phase6_second", record: secondTenantRecord() })
  const cleared = a.clearTargetDecisionCandidates({ tenant_id: TENANT })
  assert.equal(cleared.ok, true)
  assert.equal(cleared.cleared_count, 2)
  assert.equal(a.countTargetDecisionCandidates({ tenant_id: TENANT }).count, 0)
  assert.equal(a.countTargetDecisionCandidates({ tenant_id: "tenant_phase6_second" }).count, 1)
})

// 11
test("clearAllTargetDecisionCandidates clears all tenants", () => {
  const a = seeded()
  a.putTargetDecisionCandidate({ tenant_id: "tenant_phase6_second", record: secondTenantRecord() })
  const cleared = a.clearAllTargetDecisionCandidates()
  assert.equal(cleared.ok, true)
  assert.equal(cleared.cleared_count, 3)
  assert.equal(a.countTargetDecisionCandidates({ tenant_id: TENANT }).count, 0)
  assert.equal(a.countTargetDecisionCandidates({ tenant_id: "tenant_phase6_second" }).count, 0)
})

// 12
test("putTargetDecisionCandidate validates records before accepting", () => {
  const a = createInMemoryPersistenceTargetDecisionAdapter()
  const bad = { ...VALID_TARGET_DECISION_RECORD_FIXTURE, payload_hash: "not-a-valid-hash" }
  const r = a.putTargetDecisionCandidate({ tenant_id: TENANT, record: bad })
  assert.equal(r.ok, false)
  assert.ok(r.issues.some((i) => i.code === "validation_failed"))
})

// 13
test("invalid record is rejected", () => {
  const a = createInMemoryPersistenceTargetDecisionAdapter()
  const r = a.putTargetDecisionCandidate({ tenant_id: TENANT, record: 42 })
  assert.equal(r.ok, false)
  assert.ok(r.issues.some((i) => i.code === "invalid_record"))
})

// 14
test("tenant mismatch is rejected", () => {
  const a = createInMemoryPersistenceTargetDecisionAdapter()
  const r = a.putTargetDecisionCandidate({ tenant_id: "tenant_wrong", record: VALID_TARGET_DECISION_RECORD_FIXTURE })
  assert.equal(r.ok, false)
  assert.ok(r.issues.some((i) => i.code === "tenant_mismatch"))
})

// 15
test("selected target other than in_memory_test_only_store is rejected", () => {
  const a = createInMemoryPersistenceTargetDecisionAdapter()
  const deferred = { ...VALID_TARGET_DECISION_RECORD_FIXTURE, selected_target_class: DEFERRED[0] }
  const r = a.putTargetDecisionCandidate({ tenant_id: TENANT, record: deferred })
  assert.equal(r.ok, false)
  assert.ok(r.issues.some((i) => i.code === "forbidden_selected_target"))
})

// 16
test("duplicate same id with same content is idempotent", () => {
  const a = createInMemoryPersistenceTargetDecisionAdapter()
  const first = a.putTargetDecisionCandidate({ tenant_id: TENANT, record: VALID_TARGET_DECISION_RECORD_FIXTURE })
  const second = a.putTargetDecisionCandidate({ tenant_id: TENANT, record: VALID_TARGET_DECISION_RECORD_FIXTURE })
  assert.equal(first.ok, true)
  assert.equal(second.ok, true)
  assert.equal(a.countTargetDecisionCandidates({ tenant_id: TENANT }).count, 1)
})

// 17
test("duplicate same id with different content fails closed", () => {
  const a = createInMemoryPersistenceTargetDecisionAdapter()
  a.putTargetDecisionCandidate({ tenant_id: TENANT, record: VALID_TARGET_DECISION_RECORD_FIXTURE })
  const conflict = { ...VALID_TARGET_DECISION_RECORD_FIXTURE, review_rationale: "changed non-key field" }
  const r = a.putTargetDecisionCandidate({ tenant_id: TENANT, record: conflict })
  assert.equal(r.ok, false)
  assert.ok(r.issues.some((i) => i.code === "duplicate_conflict"))
})

// 18
test("returned records are defensive snapshots or frozen", () => {
  const a = seeded()
  const r = a.getTargetDecisionCandidate({ tenant_id: TENANT, target_decision_record_id: VALID_ID })
  assert.ok(r.record)
  assert.equal(Object.isFrozen(r.record), true)
})

// 19
test("mutating a returned record does not mutate stored record", () => {
  const a = seeded()
  const first = a.getTargetDecisionCandidate({ tenant_id: TENANT, target_decision_record_id: VALID_ID }).record
  try {
    ;(first as unknown as Record<string, unknown>).tenant_id = "mutated"
  } catch {
    /* frozen snapshot rejects mutation; expected */
  }
  const again = a.getTargetDecisionCandidate({ tenant_id: TENANT, target_decision_record_id: VALID_ID }).record
  assert.equal(again?.tenant_id, TENANT)
})

// 20
test("adapter does not create approval/execution/persistence/storage/promotion grant fields", () => {
  const a = seeded()
  const r = a.getTargetDecisionCandidate({ tenant_id: TENANT, target_decision_record_id: VALID_ID })
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
    assert.equal(Object.prototype.hasOwnProperty.call(r, forbidden), false, forbidden)
    assert.equal(Object.prototype.hasOwnProperty.call(r.record ?? {}, forbidden), false, forbidden)
  }
})

// 21
test("adapter issue messages do not echo secret-like values", () => {
  const a = createInMemoryPersistenceTargetDecisionAdapter()
  const secret = "SUPER_SECRET_zzz999"
  const bad = { ...VALID_TARGET_DECISION_RECORD_FIXTURE, payload_hash: secret }
  const r = a.putTargetDecisionCandidate({ tenant_id: TENANT, record: bad })
  assert.equal(r.ok, false)
  for (const i of r.issues) {
    assert.equal(i.message, `${i.code}:${i.field}`)
    assert.ok(!i.message.includes(secret))
  }
})

// 22
test("normal invalid input does not throw", () => {
  const a = createInMemoryPersistenceTargetDecisionAdapter()
  for (const bad of [null, undefined, 42, "x", []]) {
    const r = a.putTargetDecisionCandidate(bad as unknown as { tenant_id: string; record: unknown })
    assert.equal(r.ok, false)
  }
})

// 23
test("adapter works with P6-I5D valid fixture", () => {
  const a = createInMemoryPersistenceTargetDecisionAdapter()
  const put = a.putTargetDecisionCandidate({ tenant_id: TENANT, record: VALID_TARGET_DECISION_RECORD_FIXTURE })
  assert.equal(put.ok, true)
  const got = a.getTargetDecisionCandidate({ tenant_id: TENANT, target_decision_record_id: VALID_ID })
  assert.equal(got.record?.target_decision_outcome, "pass")
})

// 24
test("adapter works with P6-I5D blocked_no_go fixture", () => {
  const a = createInMemoryPersistenceTargetDecisionAdapter()
  const put = a.putTargetDecisionCandidate({ tenant_id: TENANT, record: BLOCKED_TARGET_DECISION_RECORD_FIXTURE })
  assert.equal(put.ok, true)
  const got = a.getTargetDecisionCandidate({ tenant_id: TENANT, target_decision_record_id: BLOCKED_ID })
  assert.equal(got.record?.target_decision_status, "blocked_no_go")
  assert.ok((got.record?.no_go_flags.length ?? 0) > 0)
})

// 25
test("adapter result shape is non-authorizing", () => {
  const a = seeded()
  const r = a.listTargetDecisionCandidates({ tenant_id: TENANT })
  const keys = Object.keys(r).sort()
  for (const k of keys) {
    assert.ok(["ok", "issues", "record", "records", "count", "cleared_count"].includes(k), k)
  }
})

// 26
test("clear tenant does not clear other tenant's records", () => {
  const a = seeded()
  a.putTargetDecisionCandidate({ tenant_id: "tenant_phase6_second", record: secondTenantRecord() })
  a.clearTargetDecisionCandidates({ tenant_id: "tenant_phase6_second" })
  assert.equal(a.countTargetDecisionCandidates({ tenant_id: TENANT }).count, 2)
  assert.equal(a.countTargetDecisionCandidates({ tenant_id: "tenant_phase6_second" }).count, 0)
})

// 27
test("not-found get returns ok with undefined record", () => {
  const a = createInMemoryPersistenceTargetDecisionAdapter()
  const r = a.getTargetDecisionCandidate({ tenant_id: TENANT, target_decision_record_id: "missing_id" })
  assert.equal(r.ok, true)
  assert.equal(r.record, undefined)
})

// 29 (declared before the guard; asserts observable behavior, no self-scan)
test("adapter test does not rely on self-match traps", () => {
  const a = createInMemoryPersistenceTargetDecisionAdapter()
  assert.equal(a.putTargetDecisionCandidate({ tenant_id: TENANT, record: VALID_TARGET_DECISION_RECORD_FIXTURE }).ok, true)
  assert.equal(a.putTargetDecisionCandidate({ tenant_id: TENANT, record: {} }).ok, false)
})

// 30
test("adapter stores no data outside process memory", () => {
  // A fresh adapter instance shares no state with a previously-seeded one, which
  // demonstrates candidates live only in that instance's in-process map.
  const seededOne = seeded()
  assert.equal(seededOne.countTargetDecisionCandidates({ tenant_id: TENANT }).count, 2)
  const fresh = createInMemoryPersistenceTargetDecisionAdapter()
  assert.equal(fresh.countTargetDecisionCandidates({ tenant_id: TENANT }).count, 0)
})

// ─── Phase 4: static source guard (read-only, adapter source only) ──

const ADAPTER_SRC = fileURLToPath(
  new URL("./harness/phase6/inMemoryPersistenceTargetDecisionAdapter.mts", import.meta.url),
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

// 28
test("source guard confirms adapter does not contain forbidden runtime capability substrings", () => {
  const text = readFileSync(ADAPTER_SRC, "utf8")
  for (const needle of FORBIDDEN_SOURCE_SUBSTRINGS) {
    assert.ok(!text.includes(needle), `adapter source must not contain: <<<${needle}>>>`)
  }
})
