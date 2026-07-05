/**
 * P6-I2: deterministic, TEST-ONLY Phase 6 example spine fixture.
 *
 * This file assembles one coherent artifact chain — Query Intent → Safe Query
 * Plan → Compiled SQL Artifact → Rule Review Record → Query Result Record →
 * Evidence Review Record → LLM Judgment Record → Human Decision Record — using
 * the P6-I1 pure constructors and (transitively) the P6-I0 validators, from
 * fully caller-provided fixture data.
 *
 * It is NOT a runtime pipeline and NOT an in-memory harness: it is a fixture.
 * It performs no I/O of any kind (no network, file, database, D1, SQL, LLM,
 * ApprovalStore, P7.1 TSP, or external action calls), generates no ids and no
 * timestamps (no Date.now, no new Date, no crypto.randomUUID, no Math.random),
 * mutates no global state, and authorizes nothing. A fixture pass is not
 * approval, not execution permission, and not production readiness.
 *
 * The only import is the Phase 6 artifact module surface.
 */

import {
  createQueryIntentRecord,
  createSafeQueryPlan,
  createCompiledSqlArtifact,
  createRuleReviewRecord,
  createQueryResultRecord,
  createEvidenceReviewRecord,
  createLlmJudgmentRecord,
  createHumanDecisionRecord,
  type QueryIntentRecord,
  type SafeQueryPlan,
  type CompiledSqlArtifact,
  type RuleReviewRecord,
  type QueryResultRecord,
  type EvidenceReviewRecord,
  type LlmJudgmentRecord,
  type HumanDecisionRecord,
  type ConstructionResult,
  type ConstructionIssue,
} from "../../../app/lib/phase6/artifacts/index.ts"

// ─── Deterministic fixture constants ────────────────────────────

export const PHASE6_FIXTURE_TENANT_ID = "tenant_phase6_fixture" as const

export const PHASE6_FIXTURE_IDS = {
  input_signal_id: "sig_fixture_001",
  query_intent_id: "qi_fixture_001",
  safe_query_plan_id: "sqp_fixture_001",
  compiled_sql_artifact_id: "csa_fixture_001",
  rule_review_record_id: "rr_fixture_001",
  query_result_record_id: "qrr_fixture_001",
  evidence_review_id: "er_fixture_001",
  llm_judgment_id: "lj_fixture_001",
  human_decision_id: "hd_fixture_001",
} as const

export const PHASE6_FIXTURE_TIMESTAMPS = {
  query_intent_created_at: "2026-07-05T09:00:00Z",
  safe_query_plan_created_at: "2026-07-05T09:01:00Z",
  compiled_sql_created_at: "2026-07-05T09:02:00Z",
  rule_reviewed_at: "2026-07-05T09:03:00Z",
  query_result_created_at: "2026-07-05T09:04:00Z",
  evidence_reviewed_at: "2026-07-05T09:05:00Z",
  llm_judged_at: "2026-07-05T09:06:00Z",
  human_reviewed_by_human_at: "2026-07-05T09:07:00Z",
} as const

// Deterministic 64-character lowercase SHA-256 hex fixtures (not real digests).
export const PHASE6_FIXTURE_HASHES = {
  sql_hash: "a1".repeat(32),
  result_hash: "b2".repeat(32),
  content_integrity_reference: `sha256:${"c3".repeat(32)}`,
} as const

// ─── Fixture input builder (fresh copies per call) ──────────────

/**
 * Returns a fresh set of the eight constructor inputs, each a new object so
 * callers (e.g. mismatch tests) can mutate a local copy without affecting the
 * shared constants. All values are deterministic; nothing is generated.
 */
export function buildValidPhase6SpineInputs() {
  const t = PHASE6_FIXTURE_TENANT_ID
  const id = PHASE6_FIXTURE_IDS
  const ts = PHASE6_FIXTURE_TIMESTAMPS
  const h = PHASE6_FIXTURE_HASHES
  return {
    queryIntent: {
      query_intent_id: id.query_intent_id,
      tenant_id: t,
      actor_id: "actor_fixture_pm",
      input_signal_id: id.input_signal_id,
      intent_summary: "Summarize open work units for human review",
      requested_information: ["work_unit_status", "assignee"],
      allowed_sources: ["work_units"],
      disallowed_sources: ["auth_identities"],
      tenant_scope_required: true,
      human_review_required: true,
      created_at: ts.query_intent_created_at,
      no_go_flags: [],
    } as Record<string, unknown>,
    safeQueryPlan: {
      safe_query_plan_id: id.safe_query_plan_id,
      tenant_id: t,
      source_query_intent_id: id.query_intent_id,
      query_goal: "Read open work units within tenant scope",
      allowed_tables: ["work_units"],
      selected_columns: ["id", "status", "assignee"],
      tenant_scope_filter_required: true,
      denied_operations: ["INSERT", "UPDATE", "DELETE"],
      estimated_result_shape: "rows_of_work_units",
      human_review_required: true,
      created_at: ts.safe_query_plan_created_at,
      no_go_flags: [],
    } as Record<string, unknown>,
    compiledSql: {
      compiled_sql_artifact_id: id.compiled_sql_artifact_id,
      tenant_id: t,
      source_safe_query_plan_id: id.safe_query_plan_id,
      source_query_intent_id: id.query_intent_id,
      sql_hash: h.sql_hash,
      sql_text_redaction_state: "redacted",
      read_only: true,
      mutation_detected: false,
      tenant_scope_filter_present: true,
      selected_columns: ["id", "status", "assignee"],
      created_at: ts.compiled_sql_created_at,
      no_go_flags: [],
    } as Record<string, unknown>,
    ruleReview: {
      rule_review_record_id: id.rule_review_record_id,
      tenant_id: t,
      source_compiled_sql_artifact_id: id.compiled_sql_artifact_id,
      source_safe_query_plan_id: id.safe_query_plan_id,
      source_query_intent_id: id.query_intent_id,
      rule_review_status: "ready_for_future_execution_gate_review",
      rule_review_outcome: "pass",
      read_only_check_result: "read_only_confirmed",
      tenant_scope_check_result: "tenant_scope_present",
      denied_schema_check_result: "no_denied_schema_access",
      human_review_required: true,
      reviewed_at: ts.rule_reviewed_at,
      no_go_flags: [],
    } as Record<string, unknown>,
    queryResult: {
      query_result_record_id: id.query_result_record_id,
      tenant_id: t,
      source_rule_review_record_id: id.rule_review_record_id,
      source_compiled_sql_artifact_id: id.compiled_sql_artifact_id,
      source_safe_query_plan_id: id.safe_query_plan_id,
      source_query_intent_id: id.query_intent_id,
      selected_source_rows: ["wu_1", "wu_2"],
      selected_columns: ["id", "status", "assignee"],
      provenance_complete: true,
      evidence_eligible: true,
      result_hash: h.result_hash,
      content_integrity_reference: h.content_integrity_reference,
      redaction_state: "not_required",
      aggregation_method: null,
      source_scope: "tenant_scoped",
      source_trust_marker: "first_party_system_record",
      conflict_state: "no_conflict",
      human_review_required: true,
      created_at: ts.query_result_created_at,
      no_go_flags: [],
    } as Record<string, unknown>,
    evidenceReview: {
      evidence_review_id: id.evidence_review_id,
      tenant_id: t,
      source_query_result_record_id: id.query_result_record_id,
      source_rule_review_record_id: id.rule_review_record_id,
      source_compiled_sql_artifact_id: id.compiled_sql_artifact_id,
      source_safe_query_plan_id: id.safe_query_plan_id,
      source_query_intent_id: id.query_intent_id,
      evidence_review_status: "ready_for_human_evidence_review",
      evidence_review_outcome: "pass",
      evidence_claim: "Two work units are open within tenant scope",
      evidence_type: "rows_of_work_units",
      source_trust_marker: "first_party_system_record",
      evidence_eligible: true,
      evidence_accepted: true,
      human_review_required: true,
      result_hash_check_result: "result_hash_matches",
      content_integrity_check_result: "content_integrity_verified",
      reviewed_at: ts.evidence_reviewed_at,
      no_go_flags: [],
    } as Record<string, unknown>,
    llmJudgment: {
      llm_judgment_id: id.llm_judgment_id,
      tenant_id: t,
      source_evidence_review_record_id: id.evidence_review_id,
      source_query_result_record_id: id.query_result_record_id,
      source_rule_review_record_id: id.rule_review_record_id,
      source_compiled_sql_artifact_id: id.compiled_sql_artifact_id,
      source_safe_query_plan_id: id.safe_query_plan_id,
      source_query_intent_id: id.query_intent_id,
      judgment_status: "ready_for_human_judgment_review",
      judgment_outcome: "pass",
      judgment_summary: "Evidence supports two open work units; human review required",
      judgment_claims: ["two_open_work_units"],
      evidence_references: [id.evidence_review_id],
      provenance_references: [id.query_result_record_id],
      uncertainty_state: "medium_uncertainty",
      confidence_explanation: "Grounded in a single first-party query result",
      unsupported_inferences: [],
      conflict_handling_summary: "no_conflicts_detected",
      human_review_required: true,
      allowed_use: ["human_review_input"],
      disallowed_use: ["external_action", "auto_approval"],
      judged_at: ts.llm_judged_at,
      no_go_flags: [],
    } as Record<string, unknown>,
    humanDecision: {
      human_decision_id: id.human_decision_id,
      tenant_id: t,
      decision_status: "ready_for_future_gate_review",
      decision_outcome: "pass",
      human_reviewer_id: "reviewer_fixture_001",
      human_reviewer_role: "reviewing_manager",
      reviewer_context: "Reviewed evidence and LLM judgment for open work units",
      source_evidence_review_record_id: id.evidence_review_id,
      source_llm_judgment_record_id: id.llm_judgment_id,
      source_query_result_record_id: id.query_result_record_id,
      source_rule_review_record_id: id.rule_review_record_id,
      source_compiled_sql_artifact_id: id.compiled_sql_artifact_id,
      source_safe_query_plan_id: id.safe_query_plan_id,
      source_query_intent_id: id.query_intent_id,
      evidence_accepted: true,
      evidence_claim: "Two work units are open within tenant scope",
      evidence_type: "rows_of_work_units",
      llm_judgment_id: id.llm_judgment_id,
      judgment_summary: "Evidence supports two open work units; human review required",
      uncertainty_state: "medium_uncertainty",
      human_decision_summary: "Acknowledged open work units; no external action taken",
      human_decision_rationale: "Human retains responsibility; this records a review decision only",
      decision_impact_scope: "risk_assessment",
      allowed_use: ["human_review_record"],
      disallowed_use: ["external_action", "auto_promotion"],
      future_gate_requirements: ["separate_future_gate_review"],
      approval_required: false,
      promotion_required: false,
      execution_required: false,
      four_eyes_required: true,
      self_approval_blocked: true,
      reviewed_by_human_at: ts.human_reviewed_by_human_at,
      no_go_flags: [],
    } as Record<string, unknown>,
  }
}

// ─── Spine assembly ─────────────────────────────────────────────

export type ValidPhase6Spine = {
  readonly queryIntent: QueryIntentRecord
  readonly safeQueryPlan: SafeQueryPlan
  readonly compiledSql: CompiledSqlArtifact
  readonly ruleReview: RuleReviewRecord
  readonly queryResult: QueryResultRecord
  readonly evidenceReview: EvidenceReviewRecord
  readonly llmJudgment: LlmJudgmentRecord
  readonly humanDecision: HumanDecisionRecord
}

export type ValidPhase6SpineConstructionResults = {
  readonly queryIntent: ConstructionResult<QueryIntentRecord>
  readonly safeQueryPlan: ConstructionResult<SafeQueryPlan>
  readonly compiledSql: ConstructionResult<CompiledSqlArtifact>
  readonly ruleReview: ConstructionResult<RuleReviewRecord>
  readonly queryResult: ConstructionResult<QueryResultRecord>
  readonly evidenceReview: ConstructionResult<EvidenceReviewRecord>
  readonly llmJudgment: ConstructionResult<LlmJudgmentRecord>
  readonly humanDecision: ConstructionResult<HumanDecisionRecord>
}

export type BuildPhase6SpineResult =
  | {
      readonly ok: true
      readonly spine: ValidPhase6Spine
      readonly results: ValidPhase6SpineConstructionResults
    }
  | {
      readonly ok: false
      readonly results: ValidPhase6SpineConstructionResults
      readonly issues: readonly ConstructionIssue[]
    }

/**
 * Assemble the eight artifacts by calling each P6-I1 constructor once, in spine
 * order, over the fixture inputs. Returns the structured construction results
 * and, when all eight succeed, the assembled spine. Never throws for a normal
 * construction failure — a failed constructor yields `{ ok: false, results,
 * issues }`. This is fixture assembly, not a runtime pipeline.
 */
export function buildValidPhase6Spine(
  inputs: ReturnType<typeof buildValidPhase6SpineInputs> = buildValidPhase6SpineInputs(),
): BuildPhase6SpineResult {
  const results: ValidPhase6SpineConstructionResults = {
    queryIntent: createQueryIntentRecord(inputs.queryIntent),
    safeQueryPlan: createSafeQueryPlan(inputs.safeQueryPlan),
    compiledSql: createCompiledSqlArtifact(inputs.compiledSql),
    ruleReview: createRuleReviewRecord(inputs.ruleReview),
    queryResult: createQueryResultRecord(inputs.queryResult),
    evidenceReview: createEvidenceReviewRecord(inputs.evidenceReview),
    llmJudgment: createLlmJudgmentRecord(inputs.llmJudgment),
    humanDecision: createHumanDecisionRecord(inputs.humanDecision),
  }
  if (
    results.queryIntent.ok &&
    results.safeQueryPlan.ok &&
    results.compiledSql.ok &&
    results.ruleReview.ok &&
    results.queryResult.ok &&
    results.evidenceReview.ok &&
    results.llmJudgment.ok &&
    results.humanDecision.ok
  ) {
    const spine: ValidPhase6Spine = {
      queryIntent: results.queryIntent.artifact,
      safeQueryPlan: results.safeQueryPlan.artifact,
      compiledSql: results.compiledSql.artifact,
      ruleReview: results.ruleReview.artifact,
      queryResult: results.queryResult.artifact,
      evidenceReview: results.evidenceReview.artifact,
      llmJudgment: results.llmJudgment.artifact,
      humanDecision: results.humanDecision.artifact,
    }
    return { ok: true, spine, results }
  }
  const issues = (
    Object.values(results) as readonly ConstructionResult<unknown>[]
  ).flatMap((r) => (r.ok ? [] : r.issues))
  return { ok: false, results, issues }
}
