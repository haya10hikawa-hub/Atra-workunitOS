/**
 * P6-I3: tests for the test-only in-memory non-persistent Phase 6 harness.
 *
 * Imports ONLY Node built-ins, the P6-I2 fixture, the P6-I3 harness, and the
 * Phase 6 artifact module surface. No app runtime module outside
 * app/lib/phase6/artifacts/ is imported. No network, no GitHub API, no
 * child_process, no file mutation, no secrets, no P7.1 utilities, no
 * ApprovalStore, no external actions, no D1, no SQL, no LLM.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { buildValidPhase6SpineInputs } from "./fixtures/phase6/exampleSpineFixture.mts"
import {
  runPhase6InMemoryHarness,
  summarizePhase6HarnessRun,
  collectPhase6HarnessArtifacts,
  assertPhase6HarnessNonAuthorizingShape,
  phase6HarnessInputSetFromFixture,
  PHASE6_HARNESS_STAGE_ORDER,
  type Phase6HarnessInputSet,
  type Phase6HarnessRunResult,
} from "./harness/phase6/inMemoryPhase6Harness.mts"
import * as harnessExports from "./harness/phase6/inMemoryPhase6Harness.mts"
import {
  validateQueryIntentRecord,
  validateSafeQueryPlan,
  validateCompiledSqlArtifact,
  validateRuleReviewRecord,
  validateQueryResultRecord,
  validateEvidenceReviewRecord,
  validateLlmJudgmentRecord,
  validateHumanDecisionRecord,
  type ValidationResult,
} from "../app/lib/phase6/artifacts/index.ts"

const SHA256_HEX = /^[0-9a-f]{64}$/
const CONTENT_INTEGRITY = /^sha256:[0-9a-f]{64}$/

const FORBIDDEN_GRANT_KEYS = [
  "approval",
  "approved",
  "authorized",
  "authorization",
  "execution_permission",
  "executed",
  "promotion_permission",
  "promoted",
  "external_action_permission",
  "formal_workunit_promotion",
]

const VALIDATORS: readonly ((i: unknown) => ValidationResult)[] = [
  validateQueryIntentRecord,
  validateSafeQueryPlan,
  validateCompiledSqlArtifact,
  validateRuleReviewRecord,
  validateQueryResultRecord,
  validateEvidenceReviewRecord,
  validateLlmJudgmentRecord,
  validateHumanDecisionRecord,
]

function inputs(): Phase6HarnessInputSet {
  return phase6HarnessInputSetFromFixture()
}

function record(x: unknown): Record<string, unknown> {
  return x as Record<string, unknown>
}

function mustOkRun(): Phase6HarnessRunResult {
  const r = runPhase6InMemoryHarness(inputs())
  assert.equal(r.ok, true)
  return r
}

// ─── 1: complete valid spine runs successfully ──────────────────

test("harness runs the complete valid spine successfully", () => {
  const r = mustOkRun()
  assert.equal(r.stopped_at, null)
  assert.equal(r.issues.length, 0)
})

// ─── 2: records all eight stages in order ───────────────────────

test("harness records all eight stages in order", () => {
  const r = mustOkRun()
  assert.deepEqual(
    r.stages.map((s) => s.stage),
    [...PHASE6_HARNESS_STAGE_ORDER],
  )
  for (const s of r.stages) assert.equal(s.ok, true)
})

// ─── 3: returns constructed artifacts in spine order ────────────

test("harness returns constructed artifacts in spine order", () => {
  const r = mustOkRun()
  const arts = collectPhase6HarnessArtifacts(r)
  assert.equal(arts.length, 8)
  assert.equal(record(arts[0]).query_intent_id, "qi_fixture_001")
  assert.equal(record(arts[7]).human_decision_id, "hd_fixture_001")
})

// ─── 4: every artifact passes its matching validator ────────────

test("every returned artifact passes its matching P6-I0 validator", () => {
  const arts = collectPhase6HarnessArtifacts(mustOkRun())
  arts.forEach((a, i) => assert.equal(VALIDATORS[i](a).ok, true))
})

// ─── 5: tenant consistency across the run ───────────────────────

test("tenant_id remains consistent across the successful harness run", () => {
  const arts = collectPhase6HarnessArtifacts(mustOkRun())
  const t = record(arts[0]).tenant_id
  for (const a of arts) assert.equal(record(a).tenant_id, t)
})

// ─── 6: lineage continuity across the run ───────────────────────

test("lineage continuity remains correct across the successful harness run", () => {
  const arts = collectPhase6HarnessArtifacts(mustOkRun())
  const [qi, sqp, csa, rr, qrr, er, lj, hd] = arts.map(record)
  assert.equal(sqp.source_query_intent_id, qi.query_intent_id)
  assert.equal(csa.source_safe_query_plan_id, sqp.safe_query_plan_id)
  assert.equal(rr.source_compiled_sql_artifact_id, csa.compiled_sql_artifact_id)
  assert.equal(qrr.source_rule_review_record_id, rr.rule_review_record_id)
  assert.equal(er.source_query_result_record_id, qrr.query_result_record_id)
  assert.equal(lj.source_evidence_review_record_id, er.evidence_review_id)
  assert.equal(hd.source_llm_judgment_record_id, lj.llm_judgment_id)
  assert.equal(hd.llm_judgment_id, lj.llm_judgment_id)
  // Hash / content-integrity formats survive the harness run unchanged.
  assert.match(csa.sql_hash as string, SHA256_HEX)
  assert.match(qrr.result_hash as string, SHA256_HEX)
  assert.match(qrr.content_integrity_reference as string, CONTENT_INTEGRITY)
})

// ─── 7: deterministic across repeated runs ──────────────────────

test("harness result is deterministic across repeated runs", () => {
  const a = runPhase6InMemoryHarness(inputs())
  const b = runPhase6InMemoryHarness(inputs())
  assert.deepEqual(a, b)
  assert.notEqual(a, b)
})

// ─── 8: does not mutate input sets ──────────────────────────────

test("harness does not mutate input sets", () => {
  const set = inputs()
  const before = structuredClone(set)
  runPhase6InMemoryHarness(set)
  assert.deepEqual(set, before)
})

// ─── 9-11: no approval / execution / promotion grant ────────────

test("harness result and summary contain no approval grant", () => {
  const r = mustOkRun()
  const summary = summarizePhase6HarnessRun(r)
  for (const k of FORBIDDEN_GRANT_KEYS) {
    assert.equal(k in r, false, `result must not carry ${k}`)
    assert.equal(k in summary, false, `summary must not carry ${k}`)
  }
  assert.deepEqual(Object.keys(r).sort(), [
    "artifacts",
    "issues",
    "non_authorization_statement",
    "ok",
    "stages",
    "stopped_at",
  ])
})

test("harness result and summary contain no execution grant", () => {
  const r = mustOkRun()
  const summary = summarizePhase6HarnessRun(r)
  assert.equal("execution_permission" in r, false)
  assert.equal("executed" in r, false)
  assert.equal("execution_permission" in summary, false)
})

test("harness result and summary contain no promotion grant", () => {
  const r = mustOkRun()
  const summary = summarizePhase6HarnessRun(r)
  assert.equal("promotion_permission" in r, false)
  assert.equal("promoted" in r, false)
  assert.equal("formal_workunit_promotion" in summary, false)
})

// ─── 12: harness pass is not production readiness ───────────────

test("harness pass is not production readiness", () => {
  const r = mustOkRun()
  assert.match(r.non_authorization_statement, /not production readiness/)
  assert.match(r.non_authorization_statement, /Humans decide/)
})

// ─── 13: stop_on_first_failure stops at first failing stage ─────

test("stop_on_first_failure=true stops at the first failing stage", () => {
  const set = inputs()
  delete record(set.safe_query_plan).tenant_id
  const r = runPhase6InMemoryHarness(set, { stop_on_first_failure: true })
  assert.equal(r.ok, false)
  assert.equal(r.stopped_at, "safe_query_plan")
})

// ─── 14: no downstream constructors after failure ──────────────

test("stop_on_first_failure=true does not run downstream constructors after failure", () => {
  const set = inputs()
  delete record(set.safe_query_plan).tenant_id
  const r = runPhase6InMemoryHarness(set, { stop_on_first_failure: true })
  assert.deepEqual(
    r.stages.map((s) => s.stage),
    ["query_intent", "safe_query_plan"],
  )
})

// ─── 15: multi-failure collection mode ──────────────────────────

test("stop_on_first_failure=false records multiple failures", () => {
  const set = inputs()
  delete record(set.safe_query_plan).tenant_id
  record(set.query_result_record).result_hash = "not-a-valid-hash"
  const r = runPhase6InMemoryHarness(set, { stop_on_first_failure: false })
  assert.equal(r.ok, false)
  assert.equal(r.stages.length, 8)
  const failed = r.stages.filter((s) => !s.ok).map((s) => s.stage)
  assert.ok(failed.includes("safe_query_plan"))
  assert.ok(failed.includes("query_result_record"))
  assert.ok(failed.length >= 2)
})

// ─── 16-20: individual failure modes fail safely ────────────────

test("missing tenant_id in safe_query_plan input fails safely", () => {
  const set = inputs()
  delete record(set.safe_query_plan).tenant_id
  const r = runPhase6InMemoryHarness(set)
  assert.equal(r.ok, false)
  assert.equal(r.stopped_at, "safe_query_plan")
  assert.ok(r.issues.some((i) => i.message.includes("missing_tenant_id")))
  for (const k of FORBIDDEN_GRANT_KEYS) assert.equal(k in r, false)
})

test("invalid source_query_intent_id in compiled_sql_artifact fails safely", () => {
  const set = inputs()
  record(set.compiled_sql_artifact).source_query_intent_id = ""
  const r = runPhase6InMemoryHarness(set)
  assert.equal(r.ok, false)
  assert.equal(r.stopped_at, "compiled_sql_artifact")
  assert.ok(r.issues.some((i) => i.message.includes("invalid_lineage_id")))
})

test("mismatched source_llm_judgment_record_id in human_decision fails safely", () => {
  const set = inputs()
  record(set.human_decision_record).source_llm_judgment_record_id = "lj_MISMATCH"
  const r = runPhase6InMemoryHarness(set)
  assert.equal(r.ok, false)
  assert.equal(r.stopped_at, "human_decision_record")
  assert.ok(r.issues.some((i) => i.code === "mismatched_llm_judgment_id"))
})

test("invalid query_result_record result_hash fails safely", () => {
  const set = inputs()
  record(set.query_result_record).result_hash = "ZZZ_not_hex"
  const r = runPhase6InMemoryHarness(set)
  assert.equal(r.ok, false)
  assert.equal(r.stopped_at, "query_result_record")
  assert.ok(r.issues.some((i) => i.message.includes("invalid_sha256_hex")))
})

test("invalid content_integrity_reference fails safely", () => {
  const set = inputs()
  record(set.query_result_record).content_integrity_reference = "not-a-valid-ref"
  const r = runPhase6InMemoryHarness(set)
  assert.equal(r.ok, false)
  assert.equal(r.stopped_at, "query_result_record")
  assert.ok(r.issues.some((i) => i.message.includes("invalid_content_integrity_reference")))
})

// ─── 21: no_go_flags policy ─────────────────────────────────────

test("no_go_flags non-empty fails unless blocked_no_go status is present", () => {
  // (a) status-less artifact with a flag → fail closed.
  const setA = inputs()
  record(setA.query_intent).no_go_flags = ["some_flag"]
  const rA = runPhase6InMemoryHarness(setA)
  assert.equal(rA.ok, false)
  assert.equal(rA.stopped_at, "query_intent")
  assert.ok(rA.issues.some((i) => i.message.includes("no_go_flags_present")))

  // (b) status-bearing artifact with blocked_no_go status + a flag → that stage passes.
  const setB = inputs()
  record(setB.rule_review_record).rule_review_status = "blocked_no_go"
  record(setB.rule_review_record).no_go_flags = ["blocked_reason"]
  const rB = runPhase6InMemoryHarness(setB, { stop_on_first_failure: false })
  const ruleStage = rB.stages.find((s) => s.stage === "rule_review_record")
  assert.equal(ruleStage?.ok, true)
})

// ─── 22: non_authorization_statement present ────────────────────

test("non_authorization_statement is present in all run results", () => {
  const okRun = mustOkRun()
  assert.equal(typeof okRun.non_authorization_statement, "string")
  const set = inputs()
  delete record(set.safe_query_plan).tenant_id
  const failRun = runPhase6InMemoryHarness(set)
  assert.equal(typeof failRun.non_authorization_statement, "string")
  assert.equal(
    failRun.non_authorization_statement,
    okRun.non_authorization_statement,
  )
})

// ─── 23: summary is JSON-serializable ───────────────────────────

test("summarizePhase6HarnessRun is JSON-serializable", () => {
  const summary = summarizePhase6HarnessRun(mustOkRun())
  const round = JSON.parse(JSON.stringify(summary))
  assert.deepEqual(round, summary)
  assert.equal(round.ok, true)
  assert.equal(round.completed_stages.length, 8)
})

// ─── 24-25: collect artifacts ───────────────────────────────────

test("collectPhase6HarnessArtifacts returns empty array for failed runs", () => {
  const set = inputs()
  delete record(set.safe_query_plan).tenant_id
  const r = runPhase6InMemoryHarness(set)
  assert.deepEqual(collectPhase6HarnessArtifacts(r), [])
})

test("collectPhase6HarnessArtifacts returns eight artifacts for successful runs", () => {
  assert.equal(collectPhase6HarnessArtifacts(mustOkRun()).length, 8)
})

// ─── 26: non-authorizing shape assertion ────────────────────────

test("assertPhase6HarnessNonAuthorizingShape rejects grant-like keys", () => {
  const r = mustOkRun()
  const summary = summarizePhase6HarnessRun(r)
  assert.doesNotThrow(() =>
    assertPhase6HarnessNonAuthorizingShape(r, summary as unknown as Record<string, unknown>),
  )
  const tainted = { ...r, approved: true } as unknown as Phase6HarnessRunResult
  assert.throws(() => assertPhase6HarnessNonAuthorizingShape(tainted))
  const taintedSummary = { ...summary, execution_permission: true } as unknown as Record<
    string,
    unknown
  >
  assert.throws(() => assertPhase6HarnessNonAuthorizingShape(r, taintedSummary))
})

// ─── 27: no clock / uuid / random source ────────────────────────

test("harness does not call Date.now / new Date / randomUUID / Math.random", () => {
  const realNow = Date.now
  const realRandom = Math.random
  const RealDate = globalThis.Date
  const cryptoObj = globalThis.crypto as unknown as Record<string, unknown> | undefined
  const realUUID = cryptoObj ? cryptoObj["randomUUID"] : undefined
  let patchedUUID = false
  let ok = false
  try {
    Date.now = () => {
      throw new Error("Date.now must not be called by the harness")
    }
    Math.random = () => {
      throw new Error("Math.random must not be called by the harness")
    }
    const throwingDate = function () {
      throw new Error("new Date must not be called by the harness")
    } as unknown as DateConstructor
    throwingDate.now = Date.now
    globalThis.Date = throwingDate
    if (cryptoObj && typeof realUUID === "function") {
      try {
        cryptoObj["randomUUID"] = () => {
          throw new Error("crypto.randomUUID must not be called by the harness")
        }
        patchedUUID = true
      } catch {
        patchedUUID = false
      }
    }
    ok = runPhase6InMemoryHarness(phase6HarnessInputSetFromFixture()).ok
  } finally {
    globalThis.Date = RealDate
    Date.now = realNow
    Math.random = realRandom
    if (patchedUUID && cryptoObj) {
      try {
        cryptoObj["randomUUID"] = realUUID
      } catch {
        /* best-effort restore */
      }
    }
  }
  assert.equal(ok, true)
})

// ─── 28: no secret-like values in summary issues ────────────────

test("harness does not expose secret-like values in summary issues", () => {
  const secret = "sk_live_HARNESS_SECRET_should_not_appear"
  const set = inputs()
  record(set.query_result_record).result_hash = secret
  record(set.query_intent).no_go_flags = [secret]
  const r = runPhase6InMemoryHarness(set, { stop_on_first_failure: false })
  const summary = summarizePhase6HarnessRun(r)
  assert.equal(JSON.stringify(summary).includes(secret), false)
  assert.equal(JSON.stringify(r.issues).includes(secret), false)
})

// ─── 29: exports carry no pipeline/runtime/execution names ──────

test("harness module exports do not include pipeline/runtime/execution names", () => {
  const forbidden = /pipeline|runtime|execution/i
  for (const name of Object.keys(harnessExports)) {
    assert.equal(forbidden.test(name), false, `harness export ${name} must not use forbidden naming`)
  }
})

// ─── 30: app/ does not import the harness ───────────────────────

test("app/ does not import the test harness", () => {
  const appDir = fileURLToPath(new URL("../app", import.meta.url))
  const entries = readdirSync(appDir, { recursive: true }) as string[]
  const codeFiles = entries.filter((p) => /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(p))
  assert.ok(codeFiles.length > 0)
  for (const rel of codeFiles) {
    const content = readFileSync(fileURLToPath(new URL(`../app/${rel}`, import.meta.url)), "utf8")
    assert.equal(
      content.includes("inMemoryPhase6Harness"),
      false,
      `app/${rel} must not reference the test harness`,
    )
    assert.equal(content.includes("tests/harness"), false, `app/${rel} must not reference tests/harness`)
  }
})

// ─── 31-33: upstream regression tests still behave ──────────────

test("P6-I2 fixture inputs still build a valid harness run (I2 regression)", () => {
  const r = runPhase6InMemoryHarness(phase6HarnessInputSetFromFixture(buildValidPhase6SpineInputs()))
  assert.equal(r.ok, true)
})

test("P6-I1 constructors still behave through the harness (I1 regression)", () => {
  const arts = collectPhase6HarnessArtifacts(mustOkRun())
  for (const a of arts) assert.equal(Object.isFrozen(a), true)
})

test("P6-I0 validators still behave over harness artifacts (I0 regression)", () => {
  const arts = collectPhase6HarnessArtifacts(mustOkRun())
  arts.forEach((a, i) => {
    assert.equal(VALIDATORS[i](a).ok, true)
    const tenantless = { ...record(a) }
    delete tenantless.tenant_id
    assert.equal(VALIDATORS[i](tenantless).ok, false)
  })
})
