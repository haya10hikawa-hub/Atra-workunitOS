/**
 * P6-I2: fixture-based Phase 6 spine tests.
 *
 * Imports ONLY Node built-ins, the test-only fixture, and the Phase 6 artifact
 * module surface. No app runtime module outside app/lib/phase6/artifacts/ is
 * imported. No network, no GitHub API, no child_process, no file mutation, no
 * secrets, no P7.1 utilities, no ApprovalStore, no external actions, no D1, no
 * SQL, no LLM. This proves artifact-chain coherence WITHOUT any runtime
 * pipeline, harness, storage, or execution.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import {
  buildValidPhase6Spine,
  buildValidPhase6SpineInputs,
  PHASE6_FIXTURE_TENANT_ID,
  PHASE6_FIXTURE_IDS,
  PHASE6_FIXTURE_TIMESTAMPS,
  PHASE6_FIXTURE_HASHES,
  type ValidPhase6Spine,
} from "./fixtures/phase6/exampleSpineFixture.mts"
import * as fixtureExports from "./fixtures/phase6/exampleSpineFixture.mts"

import {
  validateQueryIntentRecord,
  validateSafeQueryPlan,
  validateCompiledSqlArtifact,
  validateRuleReviewRecord,
  validateQueryResultRecord,
  validateEvidenceReviewRecord,
  validateLlmJudgmentRecord,
  validateHumanDecisionRecord,
  createQueryIntentRecord,
} from "../app/lib/phase6/artifacts/index.ts"

const SHA256_HEX = /^[0-9a-f]{64}$/
const CONTENT_INTEGRITY = /^sha256:[0-9a-f]{64}$/

// Grant/authorization keys that must NEVER appear on the result wrapper or on
// any artifact. (Declarative fields like approval_required / execution_required /
// promotion_required are intentionally NOT in this list — they are caller data,
// not grants, and are exact-match distinct from these keys.)
const FORBIDDEN_GRANT_KEYS = [
  "approved",
  "approval",
  "approval_store_approval",
  "approvalId",
  "authorized",
  "authorization",
  "executed",
  "execution",
  "execution_performed",
  "executionPermission",
  "promoted",
  "promotion",
  "formal_work_unit",
  "truth",
  "is_true",
  "verified_truth",
  "granted",
]

function mustBuildSpine(inputs?: ReturnType<typeof buildValidPhase6SpineInputs>) {
  const r = buildValidPhase6Spine(inputs)
  assert.equal(r.ok, true)
  if (!r.ok) throw new Error("unreachable: fixture spine did not build")
  return r
}

function artifactList(s: ValidPhase6Spine): ReadonlyArray<Record<string, unknown>> {
  return [
    s.queryIntent,
    s.safeQueryPlan,
    s.compiledSql,
    s.ruleReview,
    s.queryResult,
    s.evidenceReview,
    s.llmJudgment,
    s.humanDecision,
  ] as unknown as ReadonlyArray<Record<string, unknown>>
}

function allSameTenant(s: ValidPhase6Spine): boolean {
  const t = s.queryIntent.tenant_id
  return artifactList(s).every((a) => a.tenant_id === t)
}

function lineageConsistent(s: ValidPhase6Spine): boolean {
  const qi = s.queryIntent.query_intent_id
  const sqp = s.safeQueryPlan.safe_query_plan_id
  const csa = s.compiledSql.compiled_sql_artifact_id
  const rr = s.ruleReview.rule_review_record_id
  const qrr = s.queryResult.query_result_record_id
  const er = s.evidenceReview.evidence_review_id
  const lj = s.llmJudgment.llm_judgment_id
  return (
    s.safeQueryPlan.source_query_intent_id === qi &&
    s.compiledSql.source_safe_query_plan_id === sqp &&
    s.compiledSql.source_query_intent_id === qi &&
    s.ruleReview.source_compiled_sql_artifact_id === csa &&
    s.ruleReview.source_safe_query_plan_id === sqp &&
    s.ruleReview.source_query_intent_id === qi &&
    s.queryResult.source_rule_review_record_id === rr &&
    s.queryResult.source_compiled_sql_artifact_id === csa &&
    s.queryResult.source_safe_query_plan_id === sqp &&
    s.queryResult.source_query_intent_id === qi &&
    s.evidenceReview.source_query_result_record_id === qrr &&
    s.evidenceReview.source_rule_review_record_id === rr &&
    s.evidenceReview.source_compiled_sql_artifact_id === csa &&
    s.evidenceReview.source_safe_query_plan_id === sqp &&
    s.evidenceReview.source_query_intent_id === qi &&
    s.llmJudgment.source_evidence_review_record_id === er &&
    s.llmJudgment.source_query_result_record_id === qrr &&
    s.llmJudgment.source_rule_review_record_id === rr &&
    s.llmJudgment.source_compiled_sql_artifact_id === csa &&
    s.llmJudgment.source_safe_query_plan_id === sqp &&
    s.llmJudgment.source_query_intent_id === qi &&
    s.humanDecision.source_evidence_review_record_id === er &&
    s.humanDecision.source_llm_judgment_record_id === lj &&
    s.humanDecision.llm_judgment_id === lj &&
    s.humanDecision.source_query_result_record_id === qrr &&
    s.humanDecision.source_rule_review_record_id === rr &&
    s.humanDecision.source_compiled_sql_artifact_id === csa &&
    s.humanDecision.source_safe_query_plan_id === sqp &&
    s.humanDecision.source_query_intent_id === qi
  )
}

// ─── 1: valid fixture builds a complete spine ───────────────────

test("valid fixture builds a complete Phase 6 spine", () => {
  const r = mustBuildSpine()
  assert.deepEqual(Object.keys(r.spine).sort(), [
    "compiledSql",
    "evidenceReview",
    "humanDecision",
    "llmJudgment",
    "queryIntent",
    "queryResult",
    "ruleReview",
    "safeQueryPlan",
  ])
})

// ─── 2: all eight construction results are ok ───────────────────

test("all eight construction results are ok", () => {
  const r = mustBuildSpine()
  const results = Object.values(r.results)
  assert.equal(results.length, 8)
  for (const cr of results) assert.equal(cr.ok, true)
})

// ─── 3: every artifact passes its matching P6-I0 validator ──────

test("every artifact passes its matching P6-I0 validator", () => {
  const { spine } = mustBuildSpine()
  assert.equal(validateQueryIntentRecord(spine.queryIntent).ok, true)
  assert.equal(validateSafeQueryPlan(spine.safeQueryPlan).ok, true)
  assert.equal(validateCompiledSqlArtifact(spine.compiledSql).ok, true)
  assert.equal(validateRuleReviewRecord(spine.ruleReview).ok, true)
  assert.equal(validateQueryResultRecord(spine.queryResult).ok, true)
  assert.equal(validateEvidenceReviewRecord(spine.evidenceReview).ok, true)
  assert.equal(validateLlmJudgmentRecord(spine.llmJudgment).ok, true)
  assert.equal(validateHumanDecisionRecord(spine.humanDecision).ok, true)
})

// ─── 4: tenant_id consistent across all eight artifacts ─────────

test("tenant_id is consistent across all eight artifacts", () => {
  const { spine } = mustBuildSpine()
  assert.equal(allSameTenant(spine), true)
  for (const a of artifactList(spine)) assert.equal(a.tenant_id, PHASE6_FIXTURE_TENANT_ID)
})

// ─── 5: all lineage ids connect correctly ───────────────────────

test("all lineage ids connect to the correct upstream artifact ids", () => {
  const { spine } = mustBuildSpine()
  assert.equal(lineageConsistent(spine), true)
})

// ─── 6-12: per-stage lineage ───────────────────────────────────

test("QueryIntentRecord to SafeQueryPlan lineage is correct", () => {
  const { spine } = mustBuildSpine()
  assert.equal(spine.safeQueryPlan.source_query_intent_id, spine.queryIntent.query_intent_id)
})

test("SafeQueryPlan to CompiledSqlArtifact lineage is correct", () => {
  const { spine } = mustBuildSpine()
  assert.equal(spine.compiledSql.source_safe_query_plan_id, spine.safeQueryPlan.safe_query_plan_id)
  assert.equal(spine.compiledSql.source_query_intent_id, spine.queryIntent.query_intent_id)
})

test("CompiledSqlArtifact to RuleReviewRecord lineage is correct", () => {
  const { spine } = mustBuildSpine()
  assert.equal(
    spine.ruleReview.source_compiled_sql_artifact_id,
    spine.compiledSql.compiled_sql_artifact_id,
  )
})

test("RuleReviewRecord to QueryResultRecord lineage is correct", () => {
  const { spine } = mustBuildSpine()
  assert.equal(
    spine.queryResult.source_rule_review_record_id,
    spine.ruleReview.rule_review_record_id,
  )
})

test("QueryResultRecord to EvidenceReviewRecord lineage is correct", () => {
  const { spine } = mustBuildSpine()
  assert.equal(
    spine.evidenceReview.source_query_result_record_id,
    spine.queryResult.query_result_record_id,
  )
})

test("EvidenceReviewRecord to LlmJudgmentRecord lineage is correct", () => {
  const { spine } = mustBuildSpine()
  assert.equal(
    spine.llmJudgment.source_evidence_review_record_id,
    spine.evidenceReview.evidence_review_id,
  )
})

test("LlmJudgmentRecord to HumanDecisionRecord lineage is correct", () => {
  const { spine } = mustBuildSpine()
  assert.equal(
    spine.humanDecision.source_llm_judgment_record_id,
    spine.llmJudgment.llm_judgment_id,
  )
})

// ─── 13: HumanDecision judgment-id consistency ──────────────────

test("HumanDecisionRecord source_llm_judgment_record_id equals llm_judgment_id", () => {
  const { spine } = mustBuildSpine()
  assert.equal(spine.humanDecision.source_llm_judgment_record_id, spine.humanDecision.llm_judgment_id)
  assert.equal(spine.humanDecision.llm_judgment_id, spine.llmJudgment.llm_judgment_id)
  assert.equal(spine.humanDecision.llm_judgment_id, PHASE6_FIXTURE_IDS.llm_judgment_id)
})

// ─── 14: SHA-256 hash fields ────────────────────────────────────

test("all SHA-256 hash fields are 64-character lowercase hex", () => {
  const { spine } = mustBuildSpine()
  assert.match(spine.compiledSql.sql_hash, SHA256_HEX)
  assert.match(spine.queryResult.result_hash, SHA256_HEX)
  assert.equal(spine.compiledSql.sql_hash, PHASE6_FIXTURE_HASHES.sql_hash)
  assert.equal(spine.queryResult.result_hash, PHASE6_FIXTURE_HASHES.result_hash)
})

// ─── 15: content_integrity_reference format ─────────────────────

test("all content_integrity_reference fields use sha256:<64 lowercase hex>", () => {
  const { spine } = mustBuildSpine()
  assert.match(spine.queryResult.content_integrity_reference, CONTENT_INTEGRITY)
  assert.equal(
    spine.queryResult.content_integrity_reference,
    PHASE6_FIXTURE_HASHES.content_integrity_reference,
  )
})

// ─── 16: deterministic fixture timestamps ───────────────────────

test("all timestamps are deterministic fixture values", () => {
  const { spine } = mustBuildSpine()
  assert.equal(spine.queryIntent.created_at, PHASE6_FIXTURE_TIMESTAMPS.query_intent_created_at)
  assert.equal(spine.safeQueryPlan.created_at, PHASE6_FIXTURE_TIMESTAMPS.safe_query_plan_created_at)
  assert.equal(spine.compiledSql.created_at, PHASE6_FIXTURE_TIMESTAMPS.compiled_sql_created_at)
  assert.equal(spine.ruleReview.reviewed_at, PHASE6_FIXTURE_TIMESTAMPS.rule_reviewed_at)
  assert.equal(spine.queryResult.created_at, PHASE6_FIXTURE_TIMESTAMPS.query_result_created_at)
  assert.equal(spine.evidenceReview.reviewed_at, PHASE6_FIXTURE_TIMESTAMPS.evidence_reviewed_at)
  assert.equal(spine.llmJudgment.judged_at, PHASE6_FIXTURE_TIMESTAMPS.llm_judged_at)
  assert.equal(spine.humanDecision.reviewed_by_human_at, PHASE6_FIXTURE_TIMESTAMPS.human_reviewed_by_human_at)
})

// ─── 17: deterministic across repeated calls ────────────────────

test("fixture build is deterministic across repeated calls", () => {
  const a = mustBuildSpine()
  const b = mustBuildSpine()
  assert.deepEqual(a.spine, b.spine)
  // Distinct object identities (fresh build), equal values.
  assert.notEqual(a.spine, b.spine)
})

// ─── 18: constructed artifacts are frozen ───────────────────────

test("constructed artifacts are frozen", () => {
  const { spine } = mustBuildSpine()
  for (const a of artifactList(spine)) assert.equal(Object.isFrozen(a), true)
})

// ─── 19-21: no approval / execution / promotion permission ──────

test("fixture does not expose approval permission", () => {
  const r = mustBuildSpine()
  assert.deepEqual(Object.keys(r).sort(), ["ok", "results", "spine"])
  for (const k of FORBIDDEN_GRANT_KEYS) assert.equal(k in r, false, `result must not carry ${k}`)
  for (const a of artifactList(r.spine)) {
    for (const k of FORBIDDEN_GRANT_KEYS) assert.equal(k in a, false, `artifact must not carry ${k}`)
  }
})

test("fixture does not expose execution permission", () => {
  const { spine } = mustBuildSpine()
  assert.equal(spine.humanDecision.execution_required, false)
  assert.equal("execution" in spine.humanDecision, false)
  assert.equal("executed" in spine.humanDecision, false)
})

test("fixture does not expose promotion permission", () => {
  const { spine } = mustBuildSpine()
  assert.equal(spine.humanDecision.promotion_required, false)
  assert.equal("promotion" in spine.humanDecision, false)
  assert.equal("promoted" in spine.humanDecision, false)
})

// ─── 22-27: semantic non-authorization boundaries ───────────────

test("action_readiness_assessment does not imply execution", () => {
  const inputs = buildValidPhase6SpineInputs()
  inputs.humanDecision.decision_impact_scope = "action_readiness_assessment"
  const { spine } = mustBuildSpine(inputs)
  assert.equal(spine.humanDecision.decision_impact_scope, "action_readiness_assessment")
  assert.equal(spine.humanDecision.execution_required, false)
  assert.equal("executed" in spine.humanDecision, false)
})

test("promotion_required false does not imply promotion", () => {
  const { spine } = mustBuildSpine()
  assert.equal(spine.humanDecision.promotion_required, false)
  assert.equal("formal_work_unit" in spine.humanDecision, false)
  assert.equal("promoted" in spine.humanDecision, false)
})

test("approval_required is declarative and does not create ApprovalStore approval", () => {
  const { spine } = mustBuildSpine()
  assert.equal(typeof spine.humanDecision.approval_required, "boolean")
  assert.equal("approval_store_approval" in spine.humanDecision, false)
  assert.equal("approvalId" in spine.humanDecision, false)
})

test("evidence_accepted does not imply truth", () => {
  const { spine } = mustBuildSpine()
  assert.equal(spine.evidenceReview.evidence_accepted, true)
  assert.equal("truth" in spine.evidenceReview, false)
  assert.equal("verified_truth" in spine.evidenceReview, false)
  // Accepted evidence still routes to a human review queue.
  assert.equal(spine.evidenceReview.human_review_required, true)
})

test("LLM judgment does not imply truth", () => {
  const { spine } = mustBuildSpine()
  assert.equal("truth" in spine.llmJudgment, false)
  assert.equal(spine.llmJudgment.human_review_required, true)
  assert.equal(spine.llmJudgment.judgment_status, "ready_for_human_judgment_review")
})

test("Human Decision does not imply execution", () => {
  const { spine } = mustBuildSpine()
  assert.equal(spine.humanDecision.execution_required, false)
  assert.equal(spine.humanDecision.decision_status, "ready_for_future_gate_review")
  assert.equal("execution_performed" in spine.humanDecision, false)
})

// ─── 28: no_go_flags empty across the valid spine ───────────────

test("no_go_flags are empty across the valid spine", () => {
  const { spine } = mustBuildSpine()
  for (const a of artifactList(spine)) assert.deepEqual(a.no_go_flags, [])
})

// ─── 29: tenant inconsistency detected ──────────────────────────

test("changing tenant_id in a downstream input makes the spine tenant-inconsistent", () => {
  const inputs = buildValidPhase6SpineInputs()
  inputs.humanDecision.tenant_id = "tenant_intruder"
  const r = buildValidPhase6Spine(inputs)
  // P6-I0 validators accept any non-empty tenant_id (cross-tenant lineage is a
  // reserved future check), so construction still succeeds — but the explicit
  // spine tenant-consistency checker detects the mismatch.
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(allSameTenant(r.spine), false)
  assert.equal(r.spine.humanDecision.tenant_id, "tenant_intruder")
})

// ─── 30: lineage mismatch detected / rejected ───────────────────

test("changing one lineage id breaks the lineage checker", () => {
  const inputs = buildValidPhase6SpineInputs()
  inputs.humanDecision.source_query_intent_id = "qi_WRONG_LINEAGE"
  const r = buildValidPhase6Spine(inputs)
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(lineageConsistent(r.spine), false)
})

test("changing the judgment lineage id is rejected by the constructor invariant", () => {
  const inputs = buildValidPhase6SpineInputs()
  // Break source_llm_judgment_record_id vs llm_judgment_id consistency.
  inputs.humanDecision.source_llm_judgment_record_id = "lj_WRONG"
  const r = buildValidPhase6Spine(inputs)
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.equal(
    r.issues.some((i) => i.message.includes("mismatched_llm_judgment_id")),
    true,
  )
})

// ─── 31: fixture uses no clock / uuid / random source ───────────

test("fixture does not call Date.now / new Date / randomUUID / Math.random", () => {
  const realNow = Date.now
  const realRandom = Math.random
  const RealDate = globalThis.Date
  const cryptoObj = globalThis.crypto as unknown as Record<string, unknown> | undefined
  const realUUID = cryptoObj ? cryptoObj["randomUUID"] : undefined
  let patchedUUID = false
  let ok = false
  try {
    Date.now = () => {
      throw new Error("Date.now must not be called by the fixture")
    }
    Math.random = () => {
      throw new Error("Math.random must not be called by the fixture")
    }
    const throwingDate = function () {
      throw new Error("new Date must not be called by the fixture")
    } as unknown as DateConstructor
    throwingDate.now = Date.now
    globalThis.Date = throwingDate
    if (cryptoObj && typeof realUUID === "function") {
      try {
        cryptoObj["randomUUID"] = () => {
          throw new Error("crypto.randomUUID must not be called by the fixture")
        }
        patchedUUID = true
      } catch {
        patchedUUID = false
      }
    }
    ok = buildValidPhase6Spine().ok
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

// ─── 32: P6-I0 validators still behave ──────────────────────────

test("P6-I0 validators still pass their own behavior", () => {
  const { spine } = mustBuildSpine()
  const pairs = [
    [validateQueryIntentRecord, spine.queryIntent],
    [validateSafeQueryPlan, spine.safeQueryPlan],
    [validateCompiledSqlArtifact, spine.compiledSql],
    [validateRuleReviewRecord, spine.ruleReview],
    [validateQueryResultRecord, spine.queryResult],
    [validateEvidenceReviewRecord, spine.evidenceReview],
    [validateLlmJudgmentRecord, spine.llmJudgment],
    [validateHumanDecisionRecord, spine.humanDecision],
  ] as const
  for (const [validate, artifact] of pairs) {
    assert.equal(validate(artifact).ok, true)
    const tenantless = { ...(artifact as Record<string, unknown>) }
    delete tenantless.tenant_id
    assert.equal(validate(tenantless).ok, false)
  }
})

// ─── 33: P6-I1 constructors still behave ────────────────────────

test("P6-I1 constructors still pass their own behavior", () => {
  const inputs = buildValidPhase6SpineInputs()
  const good = createQueryIntentRecord(inputs.queryIntent)
  assert.equal(good.ok, true)
  const bad = createQueryIntentRecord(null)
  assert.equal(bad.ok, false)
  if (bad.ok) return
  assert.equal(bad.issues[0]?.code, "invalid_constructor_input")
})

// ─── 34: fixture exports carry no pipeline/harness/execution names ─

test("fixture exports do not include pipeline/harness/execution names", () => {
  const forbidden = /pipeline|harness|execution/i
  for (const name of Object.keys(fixtureExports)) {
    assert.equal(forbidden.test(name), false, `fixture export ${name} must not use pipeline/harness/execution naming`)
  }
})

// ─── 35: fixture imports limited to the phase6 artifact module ──

test("test-only fixture imports are limited to phase6 artifact modules", () => {
  const fixtureUrl = new URL("./fixtures/phase6/exampleSpineFixture.mts", import.meta.url)
  const source = readFileSync(fixtureUrl, "utf8")
  const specifiers = [...source.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1])
  assert.equal(specifiers.length > 0, true)
  for (const spec of specifiers) {
    assert.equal(
      spec.endsWith("app/lib/phase6/artifacts/index.ts"),
      true,
      `fixture import ${spec} must resolve to the phase6 artifact index`,
    )
  }
  // No import may reach P7.1, domain, application, security, persistence, or infra.
  for (const banned of [
    "approvalMac",
    "app/lib/domain",
    "app/lib/application",
    "app/lib/security",
    "app/lib/persistence",
    "app/lib/infrastructure",
  ]) {
    assert.equal(source.includes(`from "${banned}`), false)
    assert.equal(source.includes(`/${banned}`), false)
  }
})
