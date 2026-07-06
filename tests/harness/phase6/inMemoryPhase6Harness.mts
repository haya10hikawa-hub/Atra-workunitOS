/**
 * P6-I3: TEST-ONLY in-memory, non-persistent Phase 6 harness.
 *
 * This module runs the eight P6-I1 constructors, in spine order, over
 * caller-provided fixture inputs, entirely in memory. It records each stage
 * result, stops safely on the first failure (configurable), and returns a
 * structured, non-authorizing result. It is NOT a product runtime pipeline.
 *
 * It performs no I/O of any kind (no network, file, database, D1, SQL, LLM,
 * ApprovalStore, P7.1 TSP, or external action calls), generates no ids and no
 * timestamps (no Date.now, no new Date, no crypto.randomUUID, no Math.random),
 * persists nothing (the only artifacts that exist are the ones returned inside
 * the run result), and authorizes nothing. A harness pass is not approval, not
 * execution permission, not Formal WorkUnit promotion, and not production
 * readiness.
 *
 * This module lives only under tests/. It must never be exported from or
 * imported by app/.
 */

import { buildValidPhase6SpineInputs } from "../../fixtures/phase6/exampleSpineFixture.mts"
import {
  createQueryIntentRecord,
  createSafeQueryPlan,
  createCompiledSqlArtifact,
  createRuleReviewRecord,
  createQueryResultRecord,
  createEvidenceReviewRecord,
  createLlmJudgmentRecord,
  createHumanDecisionRecord,
  type ConstructionResult,
  type ConstructionIssue,
} from "../../../app/lib/phase6/artifacts/index.ts"

// ─── Stage order ────────────────────────────────────────────────

export const PHASE6_HARNESS_STAGE_ORDER = [
  "query_intent",
  "safe_query_plan",
  "compiled_sql_artifact",
  "rule_review_record",
  "query_result_record",
  "evidence_review_record",
  "llm_judgment_record",
  "human_decision_record",
] as const

export type Phase6HarnessStageName = (typeof PHASE6_HARNESS_STAGE_ORDER)[number]

const STAGE_CONSTRUCTORS: Record<
  Phase6HarnessStageName,
  (input: unknown) => ConstructionResult<unknown>
> = {
  query_intent: createQueryIntentRecord,
  safe_query_plan: createSafeQueryPlan,
  compiled_sql_artifact: createCompiledSqlArtifact,
  rule_review_record: createRuleReviewRecord,
  query_result_record: createQueryResultRecord,
  evidence_review_record: createEvidenceReviewRecord,
  llm_judgment_record: createLlmJudgmentRecord,
  human_decision_record: createHumanDecisionRecord,
}

// The single non-authorization statement carried by every run result.
export const PHASE6_HARNESS_NON_AUTHORIZATION_STATEMENT =
  "Harness pass is not approval, not execution permission, not Formal WorkUnit promotion, " +
  "and not production readiness. AI proposes. Rules guard. Humans decide."

// Grant-like keys that must never appear on a run result or its summary.
const FORBIDDEN_HARNESS_KEYS = [
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
] as const

// ─── Types ──────────────────────────────────────────────────────

export type Phase6HarnessStageResult = {
  readonly stage: Phase6HarnessStageName
  readonly ok: boolean
  readonly issues: readonly ConstructionIssue[]
}

export type Phase6HarnessInputSet = {
  readonly query_intent: unknown
  readonly safe_query_plan: unknown
  readonly compiled_sql_artifact: unknown
  readonly rule_review_record: unknown
  readonly query_result_record: unknown
  readonly evidence_review_record: unknown
  readonly llm_judgment_record: unknown
  readonly human_decision_record: unknown
}

export type Phase6HarnessOptions = {
  readonly stop_on_first_failure?: boolean
  readonly include_artifacts?: boolean
}

export type Phase6HarnessRunResult = {
  readonly ok: boolean
  readonly stages: readonly Phase6HarnessStageResult[]
  readonly stopped_at: Phase6HarnessStageName | null
  readonly issues: readonly ConstructionIssue[]
  readonly artifacts?: readonly unknown[]
  readonly non_authorization_statement: string
}

// ─── Input derivation (test-only convenience) ───────────────────

/**
 * Derive a harness input set (keyed by stage name) from the P6-I2 fixture inputs.
 * Returns fresh copies per call so callers can mutate a local copy for failure
 * cases without affecting shared fixture constants.
 */
export function phase6HarnessInputSetFromFixture(
  inputs: ReturnType<typeof buildValidPhase6SpineInputs> = buildValidPhase6SpineInputs(),
): Phase6HarnessInputSet {
  return {
    query_intent: inputs.queryIntent,
    safe_query_plan: inputs.safeQueryPlan,
    compiled_sql_artifact: inputs.compiledSql,
    rule_review_record: inputs.ruleReview,
    query_result_record: inputs.queryResult,
    evidence_review_record: inputs.evidenceReview,
    llm_judgment_record: inputs.llmJudgment,
    human_decision_record: inputs.humanDecision,
  }
}

// ─── Runner ─────────────────────────────────────────────────────

/**
 * Run the eight constructors in spine order over the provided input set.
 * Never throws for a normal construction/validation failure. Stops at the first
 * failing stage when stop_on_first_failure is true (default); otherwise runs all
 * eight stages and collects every failure. Stores nothing outside the returned
 * object; generates no ids and no timestamps.
 */
export function runPhase6InMemoryHarness(
  inputs: Phase6HarnessInputSet,
  options: Phase6HarnessOptions = {},
): Phase6HarnessRunResult {
  const stopOnFirstFailure = options.stop_on_first_failure ?? true
  const includeArtifacts = options.include_artifacts ?? true

  const stages: Phase6HarnessStageResult[] = []
  const artifacts: unknown[] = []
  const issues: ConstructionIssue[] = []
  let stoppedAt: Phase6HarnessStageName | null = null

  for (const stage of PHASE6_HARNESS_STAGE_ORDER) {
    const construct = STAGE_CONSTRUCTORS[stage]
    const result = construct((inputs as Record<string, unknown>)[stage])
    stages.push({ stage, ok: result.ok, issues: result.ok ? [] : result.issues })
    if (result.ok) {
      artifacts.push(result.artifact)
    } else {
      issues.push(...result.issues)
      if (stopOnFirstFailure) {
        stoppedAt = stage
        break
      }
    }
  }

  const ok =
    stages.length === PHASE6_HARNESS_STAGE_ORDER.length && stages.every((s) => s.ok)

  const base: Phase6HarnessRunResult = {
    ok,
    stages,
    stopped_at: stoppedAt,
    issues,
    non_authorization_statement: PHASE6_HARNESS_NON_AUTHORIZATION_STATEMENT,
  }
  return includeArtifacts ? { ...base, artifacts } : base
}

// ─── Summary ────────────────────────────────────────────────────

export type Phase6HarnessRunSummary = {
  readonly ok: boolean
  readonly completed_stages: readonly Phase6HarnessStageName[]
  readonly failed_stages: readonly Phase6HarnessStageName[]
  readonly stopped_at: Phase6HarnessStageName | null
  readonly issue_count: number
  readonly issue_codes: readonly string[]
  readonly non_authorization_statement: string
}

/**
 * JSON-serializable summary. Includes only stage names, an issue count, and
 * stable issue codes (never issue messages or input values), so secret-like
 * values cannot leak. Carries no approval/execution/promotion grant.
 */
export function summarizePhase6HarnessRun(
  result: Phase6HarnessRunResult,
): Phase6HarnessRunSummary {
  return {
    ok: result.ok,
    completed_stages: result.stages.filter((s) => s.ok).map((s) => s.stage),
    failed_stages: result.stages.filter((s) => !s.ok).map((s) => s.stage),
    stopped_at: result.stopped_at,
    issue_count: result.issues.length,
    issue_codes: result.issues.map((i) => i.code),
    non_authorization_statement: result.non_authorization_statement,
  }
}

// ─── Artifact collection ────────────────────────────────────────

/**
 * Return the constructed artifacts from a successful run, in spine order. Returns
 * an empty array for a failed run. Returns a shallow copy so the caller cannot
 * mutate the run result's array; the artifacts themselves are already frozen by
 * the P6-I1 constructors.
 */
export function collectPhase6HarnessArtifacts(
  result: Phase6HarnessRunResult,
): readonly unknown[] {
  if (!result.ok) return []
  return result.artifacts ? [...result.artifacts] : []
}

// ─── Non-authorization shape assertion (test support) ───────────

/**
 * Test-support assertion: throws if any forbidden grant-like key appears on the
 * run result or its summary. This is a test helper (it may throw); it is not the
 * runner and is never used in app runtime.
 */
export function assertPhase6HarnessNonAuthorizingShape(
  result: Phase6HarnessRunResult,
  summary?: Record<string, unknown>,
): void {
  const targets: Record<string, unknown>[] = [result as unknown as Record<string, unknown>]
  if (summary) targets.push(summary)
  for (const obj of targets) {
    for (const key of FORBIDDEN_HARNESS_KEYS) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        throw new Error(`non-authorizing harness shape violated: forbidden key ${key}`)
      }
    }
  }
}
