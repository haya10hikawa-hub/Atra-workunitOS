/**
 * P6-I1: pure artifact constructors for the eight Phase 6 artifacts
 * (docs/P6_I1_PURE_ARTIFACT_CONSTRUCTORS.md). Builds on P6-I0 shared types and
 * validators.
 *
 * PURE, DETERMINISTIC, NON-AUTHORIZING. Every constructor:
 *   - accepts unknown input and takes a single-read snapshot of it;
 *   - is a thin allowlisted builder over the P6-I0 artifact field set — it copies
 *     only allowlisted fields present in the snapshot, so unknown input fields are
 *     dropped and missing fields stay absent (fail-closed at validation);
 *   - uses caller-provided ids and caller-provided timestamps; it generates none;
 *   - calls no clock (no Date.now, no new Date), no id source (no crypto.randomUUID,
 *     no Math.random), no network, no database, no D1, no SQL, no LLM, no
 *     ApprovalStore, no P7.1 TSP utility, and no external action;
 *   - never mutates its input;
 *   - validates the constructed artifact with the matching P6-I0 validator and
 *     returns failure (never ok=true) if validation fails;
 *   - freezes the artifact before returning success;
 *   - returns a structured ConstructionResult carrying no approval, no execution
 *     permission, and no promotion.
 *
 * Constructor success is not approval, not execution permission, not Formal
 * WorkUnit promotion, and not pipeline execution.
 */

import type {
  QueryIntentRecord,
  SafeQueryPlan,
  CompiledSqlArtifact,
  RuleReviewRecord,
  QueryResultRecord,
  EvidenceReviewRecord,
  LlmJudgmentRecord,
  ValidatedHumanDecisionRecord,
} from "./types.ts"
import type { ValidationResult } from "./validation.ts"
import {
  validateQueryIntentRecord,
  validateSafeQueryPlan,
  validateCompiledSqlArtifact,
  validateRuleReviewRecord,
  validateQueryResultRecord,
  validateEvidenceReviewRecord,
  validateLlmJudgmentRecord,
  validateHumanDecisionRecord,
} from "./validators.ts"
import {
  type ConstructionResult,
  type ConstructorInputSnapshot,
  snapshotConstructorInput,
  freezeConstructedArtifact,
  validationIssuesToConstructionIssues,
  failConstruction,
  passConstruction,
  constructionIssue,
  ensureHumanDecisionJudgmentIdConsistency,
} from "./construction.ts"

// ─── Allowlisted artifact field sets (P6-I0 types are the source of truth) ──

const QUERY_INTENT_FIELDS = [
  "query_intent_id",
  "tenant_id",
  "actor_id",
  "input_signal_id",
  "intent_summary",
  "requested_information",
  "allowed_sources",
  "disallowed_sources",
  "tenant_scope_required",
  "human_review_required",
  "created_at",
  "no_go_flags",
] as const

const SAFE_QUERY_PLAN_FIELDS = [
  "safe_query_plan_id",
  "tenant_id",
  "source_query_intent_id",
  "query_goal",
  "allowed_tables",
  "selected_columns",
  "tenant_scope_filter_required",
  "denied_operations",
  "estimated_result_shape",
  "human_review_required",
  "created_at",
  "no_go_flags",
] as const

const COMPILED_SQL_ARTIFACT_FIELDS = [
  "compiled_sql_artifact_id",
  "tenant_id",
  "source_safe_query_plan_id",
  "source_query_intent_id",
  "sql_hash",
  "sql_text_redaction_state",
  "read_only",
  "mutation_detected",
  "tenant_scope_filter_present",
  "selected_columns",
  "created_at",
  "no_go_flags",
] as const

const RULE_REVIEW_RECORD_FIELDS = [
  "rule_review_record_id",
  "tenant_id",
  "source_compiled_sql_artifact_id",
  "source_safe_query_plan_id",
  "source_query_intent_id",
  "rule_review_status",
  "rule_review_outcome",
  "read_only_check_result",
  "tenant_scope_check_result",
  "denied_schema_check_result",
  "human_review_required",
  "reviewed_at",
  "no_go_flags",
] as const

const QUERY_RESULT_RECORD_FIELDS = [
  "query_result_record_id",
  "tenant_id",
  "source_rule_review_record_id",
  "source_compiled_sql_artifact_id",
  "source_safe_query_plan_id",
  "source_query_intent_id",
  "selected_source_rows",
  "selected_columns",
  "provenance_complete",
  "evidence_eligible",
  "result_hash",
  "content_integrity_reference",
  "redaction_state",
  "aggregation_method",
  "source_scope",
  "source_trust_marker",
  "conflict_state",
  "human_review_required",
  "created_at",
  "no_go_flags",
] as const

const EVIDENCE_REVIEW_RECORD_FIELDS = [
  "evidence_review_id",
  "tenant_id",
  "source_query_result_record_id",
  "source_rule_review_record_id",
  "source_compiled_sql_artifact_id",
  "source_safe_query_plan_id",
  "source_query_intent_id",
  "evidence_review_status",
  "evidence_review_outcome",
  "evidence_claim",
  "evidence_type",
  "source_trust_marker",
  "evidence_eligible",
  "evidence_accepted",
  "human_review_required",
  "result_hash_check_result",
  "content_integrity_check_result",
  "reviewed_at",
  "no_go_flags",
] as const

const LLM_JUDGMENT_RECORD_FIELDS = [
  "llm_judgment_id",
  "tenant_id",
  "source_evidence_review_record_id",
  "source_query_result_record_id",
  "source_rule_review_record_id",
  "source_compiled_sql_artifact_id",
  "source_safe_query_plan_id",
  "source_query_intent_id",
  "judgment_status",
  "judgment_outcome",
  "judgment_summary",
  "judgment_claims",
  "evidence_references",
  "provenance_references",
  "uncertainty_state",
  "confidence_explanation",
  "unsupported_inferences",
  "conflict_handling_summary",
  "human_review_required",
  "allowed_use",
  "disallowed_use",
  "judged_at",
  "no_go_flags",
] as const

const HUMAN_DECISION_RECORD_FIELDS = [
  "human_decision_id",
  "tenant_id",
  "decision_status",
  "decision_outcome",
  "human_reviewer_id",
  "human_reviewer_role",
  "reviewer_context",
  "source_evidence_review_record_id",
  "source_llm_judgment_record_id",
  "source_query_result_record_id",
  "source_rule_review_record_id",
  "source_compiled_sql_artifact_id",
  "source_safe_query_plan_id",
  "source_query_intent_id",
  "evidence_accepted",
  "evidence_claim",
  "evidence_type",
  "llm_judgment_id",
  "judgment_summary",
  "uncertainty_state",
  "human_decision_summary",
  "human_decision_rationale",
  "decision_impact_scope",
  "allowed_use",
  "disallowed_use",
  "future_gate_requirements",
  "approval_required",
  "promotion_required",
  "execution_required",
  "four_eyes_required",
  "self_approval_blocked",
  "reviewed_by_human_at",
  "no_go_flags",
] as const

// ─── Shared allowlisted-build path ──────────────────────────────

/**
 * Copy exactly the allowlisted fields that are present in the single-read
 * snapshot into a fresh plain object. Present is own-key + not-undefined
 * (explicit null is preserved so the validator can distinguish it from missing).
 * Unknown snapshot keys are never copied; missing allowlisted keys stay absent.
 */
function buildAllowlisted(
  snapshot: ConstructorInputSnapshot,
  allowedFields: readonly string[],
): Record<string, unknown> {
  const artifact: Record<string, unknown> = {}
  for (const field of allowedFields) {
    if (!Object.prototype.hasOwnProperty.call(snapshot, field)) continue
    const value = snapshot[field]
    if (value === undefined) continue
    artifact[field] = value
  }
  return artifact
}

/**
 * The single shared constructor path: snapshot → allowlisted build → validate →
 * freeze. `extraCheck` runs an optional constructor-level invariant (e.g. the
 * HumanDecisionRecord id-consistency check) against the snapshot after output
 * validation passes and before success is returned. All normal invalid input
 * yields a failed ConstructionResult; the defensive catch maps any unexpected
 * failure to `constructor_exception` (never throws for normal invalid input).
 */
function constructArtifact<T>(
  input: unknown,
  allowedFields: readonly string[],
  validate: (candidate: unknown) => ValidationResult,
  extraCheck?: (snapshot: ConstructorInputSnapshot) => { readonly ok: boolean } & {
    readonly issues?: unknown
  },
): ConstructionResult<T> {
  try {
    const snap = snapshotConstructorInput(input)
    if (!snap.ok) return snap
    const artifact = buildAllowlisted(snap.snapshot, allowedFields)
    const validation = validate(artifact)
    if (!validation.ok) {
      return failConstruction(validationIssuesToConstructionIssues(validation.issues))
    }
    if (extraCheck) {
      const checked = extraCheck(snap.snapshot)
      if (!checked.ok) return checked as ConstructionResult<T>
    }
    return passConstruction(freezeConstructedArtifact(artifact) as T)
  } catch {
    return failConstruction([constructionIssue("constructor_exception", "(constructor)")])
  }
}

// ─── Public constructors ────────────────────────────────────────

export function createQueryIntentRecord(
  input: unknown,
): ConstructionResult<QueryIntentRecord> {
  return constructArtifact(input, QUERY_INTENT_FIELDS, validateQueryIntentRecord)
}

export function createSafeQueryPlan(input: unknown): ConstructionResult<SafeQueryPlan> {
  return constructArtifact(input, SAFE_QUERY_PLAN_FIELDS, validateSafeQueryPlan)
}

export function createCompiledSqlArtifact(
  input: unknown,
): ConstructionResult<CompiledSqlArtifact> {
  return constructArtifact(input, COMPILED_SQL_ARTIFACT_FIELDS, validateCompiledSqlArtifact)
}

export function createRuleReviewRecord(
  input: unknown,
): ConstructionResult<RuleReviewRecord> {
  return constructArtifact(input, RULE_REVIEW_RECORD_FIELDS, validateRuleReviewRecord)
}

export function createQueryResultRecord(
  input: unknown,
): ConstructionResult<QueryResultRecord> {
  return constructArtifact(input, QUERY_RESULT_RECORD_FIELDS, validateQueryResultRecord)
}

export function createEvidenceReviewRecord(
  input: unknown,
): ConstructionResult<EvidenceReviewRecord> {
  return constructArtifact(input, EVIDENCE_REVIEW_RECORD_FIELDS, validateEvidenceReviewRecord)
}

export function createLlmJudgmentRecord(
  input: unknown,
): ConstructionResult<LlmJudgmentRecord> {
  return constructArtifact(input, LLM_JUDGMENT_RECORD_FIELDS, validateLlmJudgmentRecord)
}

/**
 * The only repository production function that returns a
 * ValidatedHumanDecisionRecord (P6-FIX-008, Issue #141). It validates, runs the
 * cross-field semantic rules (via validateHumanDecisionRecord), enforces the LLM
 * judgment id-consistency invariant, and freezes the artifact before the trusted
 * type is returned. The opaque brand is compile-time only — no runtime field is
 * added — and success is not approval, authorization, or execution permission.
 */
export function createHumanDecisionRecord(
  input: unknown,
): ConstructionResult<ValidatedHumanDecisionRecord> {
  return constructArtifact(
    input,
    HUMAN_DECISION_RECORD_FIELDS,
    validateHumanDecisionRecord,
    ensureHumanDecisionJudgmentIdConsistency,
  )
}
