/**
 * P6-I5O: isolated tests for the test-only Phase 6 Recorder Audit Summary
 * harness.
 *
 * Imports ONLY node:test, node:assert/strict, the harness module
 * (tests/harness/phase6/recorderAuditSummaryHarness.mts), the P6-I5N fixture
 * module, and the Phase 6 Recorder Audit Summary module surface, plus — for
 * the static source guard only — node:fs / node:url to READ (never mutate)
 * the harness source. No app runtime modules, no app/lib/persistence, no
 * other harnesses, no P6-I0..I5N tests, no P7.1 utilities, no network, no
 * GitHub API, no child_process, no file mutation, no secrets, no
 * ApprovalStore, no external actions, no D1, no SQL, no LLM. The harness is
 * exercised in memory only.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import {
  createRecorderAuditSummaryTestHarness,
  RECORDER_AUDIT_SUMMARY_HARNESS_ISSUE_CODES,
} from "./harness/phase6/recorderAuditSummaryHarness.mts"
import {
  ALL_RECORDER_AUDIT_SUMMARY_FIXTURES,
  VALID_TENANT_RECORDER_AUDIT_SUMMARY_FIXTURE,
  BLOCKED_NO_GO_RECORDER_AUDIT_SUMMARY_FIXTURE,
} from "./fixtures/phase6/recorderAuditSummaryFixture.mts"
import { validateRecorderAuditSummaryRecord } from "../app/lib/phase6/recorderAuditSummary/index.ts"

const EXPECTED_ORDER = [
  "ras_tenant_fixture_001",
  "ras_all_test_memory_fixture_001",
  "ras_operation_subset_fixture_001",
  "ras_fixture_suite_fixture_001",
  "ras_blocked_no_go_fixture_001",
]

function harness() {
  return createRecorderAuditSummaryTestHarness()
}

// 1
test("harness loads exactly five P6-I5N fixtures", () => {
  const h = harness()
  const r = h.listSummaries()
  assert.equal(r.ok, true)
  assert.equal(r.summaries?.length, 5)
  const c = h.countSummaries()
  assert.equal(c.ok, true)
  assert.equal(c.count, 5)
})

// 2
test("harness list order is deterministic", () => {
  const h = harness()
  const r = h.listSummaries()
  assert.deepEqual(
    r.summaries?.map((s) => s.summary_id),
    EXPECTED_ORDER,
  )
  const again = h.listSummaries()
  assert.deepEqual(
    again.summaries?.map((s) => s.summary_id),
    EXPECTED_ORDER,
  )
})

// 3
test("getSummary returns expected fixture by summary_id", () => {
  const h = harness()
  const r = h.getSummary("ras_tenant_fixture_001")
  assert.equal(r.ok, true)
  assert.deepEqual(r.summary, VALID_TENANT_RECORDER_AUDIT_SUMMARY_FIXTURE)
})

// 4
test("missing summary_id returns stable not-found result", () => {
  const h = harness()
  const secretId = "definitely-missing-secret-like-id"
  const r = h.getSummary(secretId)
  assert.equal(r.ok, false)
  assert.equal(r.summary, undefined)
  assert.deepEqual(r.issues, [
    { code: "not_found", field: "summary_id", message: "not_found:summary_id" },
  ])
  for (const i of r.issues) assert.ok(!i.message.includes(secretId))
})

// 5
test("invalid getSummary input fails with invalid_input and does not throw", () => {
  const h = harness()
  for (const bad of ["", 42, null, undefined, {}, []]) {
    const r = h.getSummary(bad)
    assert.equal(r.ok, false, JSON.stringify(bad))
    assert.equal(r.issues[0]?.code, "invalid_input")
  }
})

// 6
test("requireSummary returns the record or throws a generic non-echoing error", () => {
  const h = harness()
  const found = h.requireSummary("ras_fixture_suite_fixture_001")
  assert.equal(found.summary_id, "ras_fixture_suite_fixture_001")
  const secretId = "missing-secret-value-do-not-echo"
  assert.throws(
    () => h.requireSummary(secretId),
    (e: Error) => !e.message.includes(secretId) && e.message.length > 0,
  )
  assert.throws(() => h.requireSummary(""), Error)
})

// 7
test("listByScope works for tenant / all_test_memory / operation_subset / fixture_suite", () => {
  const h = harness()
  // The blocked fixture also carries scope "tenant", so tenant yields 2.
  const tenant = h.listByScope("tenant")
  assert.equal(tenant.ok, true)
  assert.deepEqual(
    tenant.summaries?.map((s) => s.summary_id),
    ["ras_tenant_fixture_001", "ras_blocked_no_go_fixture_001"],
  )
  for (const [scope, expectedId] of [
    ["all_test_memory", "ras_all_test_memory_fixture_001"],
    ["operation_subset", "ras_operation_subset_fixture_001"],
    ["fixture_suite", "ras_fixture_suite_fixture_001"],
  ] as const) {
    const r = h.listByScope(scope)
    assert.equal(r.ok, true, scope)
    assert.deepEqual(
      r.summaries?.map((s) => s.summary_id),
      [expectedId],
      scope,
    )
  }
})

// 8
test("invalid summary_scope fails with invalid_input", () => {
  const h = harness()
  for (const bad of ["bogus_scope", "", 42, null, undefined]) {
    const r = h.listByScope(bad)
    assert.equal(r.ok, false, JSON.stringify(bad))
    assert.equal(r.issues[0]?.code, "invalid_input")
  }
})

// 9
test("blocked_no_go fixture is reachable", () => {
  const h = harness()
  const r = h.getSummary("ras_blocked_no_go_fixture_001")
  assert.equal(r.ok, true)
  assert.deepEqual(r.summary, BLOCKED_NO_GO_RECORDER_AUDIT_SUMMARY_FIXTURE)
  assert.ok((r.summary?.no_go_flags.length ?? 0) > 0)
  assert.ok((r.summary?.outcome_counts.no_go ?? 0) > 0)
})

// 10
test("listByTenant works", () => {
  const h = harness()
  const main = h.listByTenant("tenant_recorder_summary_fixture")
  assert.equal(main.ok, true)
  assert.deepEqual(
    main.summaries?.map((s) => s.summary_id),
    [
      "ras_tenant_fixture_001",
      "ras_operation_subset_fixture_001",
      "ras_fixture_suite_fixture_001",
      "ras_blocked_no_go_fixture_001",
    ],
  )
  const all = h.listByTenant("all_tenants_recorder_summary_fixture")
  assert.deepEqual(
    all.summaries?.map((s) => s.summary_id),
    ["ras_all_test_memory_fixture_001"],
  )
  const none = h.listByTenant("unknown_tenant")
  assert.equal(none.ok, true)
  assert.deepEqual([...(none.summaries ?? ["sentinel"])], [])
  const bad = h.listByTenant("")
  assert.equal(bad.ok, false)
  assert.equal(bad.issues[0]?.code, "invalid_input")
})

// 11
test("countSummaries returns 5", () => {
  const r = harness().countSummaries()
  assert.equal(r.ok, true)
  assert.equal(r.count, 5)
})

// 12
test("validateAllSummaries passes through P6-I5L validators", () => {
  const h = harness()
  const r = h.validateAllSummaries()
  assert.equal(r.ok, true, JSON.stringify(r.issues))
  assert.equal(r.count, 5)
  // The valid fixture set yields an explicitly empty issue collection.
  assert.deepEqual([...(r.issues ?? ["sentinel"])], [])
  // Cross-check against the validator directly.
  for (const s of h.listSummaries().summaries ?? []) {
    assert.equal(validateRecorderAuditSummaryRecord(s).ok, true, s.summary_id)
  }
})

// 13
test("every harness-returned summary has recorder_target_class in_memory_test_only_store", () => {
  for (const s of harness().listSummaries().summaries ?? []) {
    assert.equal(s.recorder_target_class, "in_memory_test_only_store", s.summary_id)
  }
})

// 14
test("every harness-returned summary has selected_target_class in_memory_test_only_store", () => {
  for (const s of harness().listSummaries().summaries ?? []) {
    assert.equal(s.selected_target_class, "in_memory_test_only_store", s.summary_id)
  }
})

// 15
test("harness does not mutate exported fixture constants", () => {
  const before = JSON.stringify(ALL_RECORDER_AUDIT_SUMMARY_FIXTURES)
  const h = harness()
  h.listSummaries()
  h.getSummary("ras_tenant_fixture_001")
  h.listByScope("tenant")
  h.listByTenant("tenant_recorder_summary_fixture")
  h.countSummaries()
  h.validateAllSummaries()
  h.reset()
  const after = JSON.stringify(ALL_RECORDER_AUDIT_SUMMARY_FIXTURES)
  assert.equal(after, before)
  assert.ok(Object.isFrozen(ALL_RECORDER_AUDIT_SUMMARY_FIXTURES))
  assert.ok(Object.isFrozen(VALID_TENANT_RECORDER_AUDIT_SUMMARY_FIXTURE))
})

// 16
test("returned snapshots cannot be used to mutate harness state", () => {
  const h = harness()
  const first = h.listSummaries().summaries
  assert.ok(Object.isFrozen(first))
  // A frozen array rejects mutation attempts; a shallow copy of it is
  // caller-local and disconnected from harness state.
  const copy = [...(first ?? [])]
  copy.pop()
  copy.reverse()
  const again = h.listSummaries()
  assert.equal(again.summaries?.length, 5)
  assert.deepEqual(
    again.summaries?.map((s) => s.summary_id),
    EXPECTED_ORDER,
  )
  // Distinct snapshot arrays per call.
  assert.notEqual(first, again.summaries)
})

// 17
test("harness is deterministic across repeated construction", () => {
  const a = harness()
  const b = harness()
  assert.deepEqual(a.listSummaries().summaries, b.listSummaries().summaries)
  assert.deepEqual(a.getSummary("ras_tenant_fixture_001"), b.getSummary("ras_tenant_fixture_001"))
  assert.deepEqual(a.countSummaries(), b.countSummaries())
  assert.deepEqual(a.validateAllSummaries(), b.validateAllSummaries())
})

// 18
test("reset restores the deterministic fixture view", () => {
  const h = harness()
  const before = h.listSummaries().summaries
  const r = h.reset()
  assert.equal(r.ok, true)
  assert.equal(r.count, 5)
  assert.deepEqual(h.listSummaries().summaries, before)
})

// 19
test("harness success remains non-authorizing", () => {
  const h = harness()
  const results = [
    h.listSummaries(),
    h.getSummary("ras_tenant_fixture_001"),
    h.countSummaries(),
    h.validateAllSummaries(),
    h.reset(),
  ]
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
  for (const r of results) {
    for (const key of Object.keys(r)) {
      assert.ok(["ok", "issues", "summary", "summaries", "count"].includes(key), key)
    }
    for (const key of forbidden) {
      assert.equal(Object.prototype.hasOwnProperty.call(r, key), false, key)
    }
  }
})

// 20
test("issue codes are the stable exported set", () => {
  assert.deepEqual(
    [...RECORDER_AUDIT_SUMMARY_HARNESS_ISSUE_CODES],
    ["invalid_input", "not_found", "validation_failed", "forbidden_target_class", "harness_exception"],
  )
})

// 21
test("test does not rely on self-match traps", () => {
  // Observable behavior asserted both ways: real lookups succeed, wrong ones
  // fail; the validator agrees with the harness on the loaded records.
  const h = harness()
  assert.equal(h.getSummary("ras_tenant_fixture_001").ok, true)
  assert.equal(h.getSummary("ras_missing_fixture").ok, false)
  assert.equal(validateRecorderAuditSummaryRecord({}).ok, false)
})

// ─── Static source guard (read-only) ────────────────────────────

const SRC_HARNESS = fileURLToPath(
  new URL("./harness/phase6/recorderAuditSummaryHarness.mts", import.meta.url),
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

// 22
test("harness source guard confirms no forbidden runtime capability substrings", () => {
  const text = readFileSync(SRC_HARNESS, "utf8")
  for (const needle of FORBIDDEN_SOURCE_SUBSTRINGS) {
    assert.ok(!text.includes(needle), `harness source must not contain: <<<${needle}>>>`)
  }
})

// ─── P6-FIX-007d (Issue #121): field-specific target-class diagnostics ───────
//
// The harness loads only fixed, pre-validated fixtures whose target-class
// fields are always in_memory_test_only_store, and it exposes no invalid-record
// injection seam (broadening the API just to inject invalid values would add a
// fixture-mutation path this patch forbids). The field-attribution correction
// therefore lives in validateAllSummaries(), so it is proven by extracting only
// that method's source region and pinning the two independent, correctly
// labelled, deterministically ordered checks. Comments are stripped first so
// they cannot satisfy the structural assertions. The load-time fixture check in
// loadFixtureSnapshot() legitimately keeps a combined boolean (it throws a
// generic label-free error) and is outside this region and this patch.

/** Strip block and line comments so comments cannot satisfy structural checks. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")
}

/**
 * Isolate the validateAllSummaries() implementation body: from its marker up to
 * the next reset() marker. The method name also appears once in the harness
 * type declaration earlier in the file, so lastIndexOf selects the actual
 * implementation (which follows the type block); indexOf from there finds the
 * matching reset() implementation marker.
 */
function validateAllSummariesRegion(): string {
  const full = stripComments(readFileSync(SRC_HARNESS, "utf8"))
  const start = full.lastIndexOf("validateAllSummaries():")
  assert.ok(start !== -1, "validateAllSummaries() marker must be present")
  const end = full.indexOf("reset():", start)
  assert.ok(end !== -1, "reset() marker must follow validateAllSummaries()")
  return full.slice(start, end)
}

// 23
test("validateAllSummaries maps recorder mismatch to recorder_target_class", () => {
  const region = validateAllSummariesRegion()
  const compare = "record.recorder_target_class !== FIXED_TARGET_CLASS"
  const emit = 'issue("forbidden_target_class", "recorder_target_class")'
  assert.ok(region.includes(compare), "recorder comparison must be present")
  assert.ok(region.includes(emit), "recorder issue emission must be present")
  assert.ok(
    region.indexOf(compare) < region.indexOf(emit),
    "recorder comparison must precede its issue emission",
  )
})

// 24
test("validateAllSummaries maps selected mismatch to selected_target_class", () => {
  const region = validateAllSummariesRegion()
  const compare = "record.selected_target_class !== FIXED_TARGET_CLASS"
  const emit = 'issue("forbidden_target_class", "selected_target_class")'
  assert.ok(region.includes(compare), "selected comparison must be present")
  assert.ok(region.includes(emit), "selected issue emission must be present")
  assert.ok(
    region.indexOf(compare) < region.indexOf(emit),
    "selected comparison must precede its issue emission",
  )
})

// 25
test("validateAllSummaries uses two independent, deterministically ordered checks", () => {
  const region = validateAllSummariesRegion()
  const recorderCompare = "record.recorder_target_class !== FIXED_TARGET_CLASS"
  const selectedCompare = "record.selected_target_class !== FIXED_TARGET_CLASS"
  const recorderEmit = 'issue("forbidden_target_class", "recorder_target_class")'
  const selectedEmit = 'issue("forbidden_target_class", "selected_target_class")'

  // The two comparisons are separate checks, not combined via ||. We scope the
  // || prohibition to the region between the two comparisons so the load-time
  // fixture check elsewhere is unaffected.
  const between = region.slice(
    region.indexOf(recorderCompare),
    region.indexOf(selectedCompare) + selectedCompare.length,
  )
  assert.ok(!between.includes("||"), "recorder and selected checks must not be combined with ||")

  // Deterministic order: recorder-specific emission precedes selected-specific.
  assert.ok(
    region.indexOf(recorderEmit) < region.indexOf(selectedEmit),
    "recorder issue must be emitted before selected issue",
  )

  // Exactly one emission per field.
  assert.equal(region.split(recorderEmit).length - 1, 1, "exactly one recorder-field emission")
  assert.equal(region.split(selectedEmit).length - 1, 1, "exactly one selected-field emission")

  // Structural cross-mapping guard: within the block guarded by the selected
  // comparison, no recorder-field emission may appear, and within the block
  // guarded by the recorder comparison, no selected-field emission may appear.
  const selectedBlock = region.slice(region.indexOf(selectedCompare))
  assert.ok(
    !selectedBlock.includes(recorderEmit),
    "selected mismatch must not emit recorder_target_class",
  )
  const recorderBlock = region.slice(
    region.indexOf(recorderCompare),
    region.indexOf(selectedCompare),
  )
  assert.ok(
    !recorderBlock.includes(selectedEmit),
    "recorder mismatch must not emit selected_target_class",
  )
})
