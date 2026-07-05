import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { test } from "node:test";

const GATE_PATH = "docs/LLM_JUDGMENT_EVALUATION_GATE.md";
const CONTRACT_PATH = "docs/LLM_JUDGMENT_RECORD_CONTRACT.md";

const gate = existsSync(GATE_PATH) ? readFileSync(GATE_PATH, "utf8") : "";
const contract = existsSync(CONTRACT_PATH) ? readFileSync(CONTRACT_PATH, "utf8") : "";

function requireAll(doc: string, label: string, needles: string[]): void {
  for (const needle of needles) {
    assert.ok(doc.includes(needle), `${label} must contain: ${JSON.stringify(needle)}`);
  }
}

test("P6.13 docs exist", () => {
  assert.ok(existsSync(GATE_PATH), `${GATE_PATH} must exist`);
  assert.ok(existsSync(CONTRACT_PATH), `${CONTRACT_PATH} must exist`);
  assert.ok(gate.length > 0, "gate doc must be non-empty");
  assert.ok(contract.length > 0, "contract doc must be non-empty");
});

test("LLM_JUDGMENT_EVALUATION_GATE contains all required sections", () => {
  requireAll(gate, "gate", [
    "## 1. Purpose",
    "## 2. Scope",
    "## 3. Definition of LLM Judgment Evaluation Gate",
    "## 4. What LLM Judgment Evaluation Is Not",
    "## 5. Gate Principles",
    "## 6. Allowed Inputs",
    "## 7. Allowed Outputs",
    "## 8. Evidence Review Record to LLM Judgment Flow",
    "## 9. Pre-evaluation Validation",
    "## 10. Evidence Grounding and Provenance Checks",
    "## 11. Uncertainty, Confidence, and Conflict Handling",
    "## 12. Human Review and Decision Boundary",
    "## 13. Safety, Redaction, and Data Boundary",
    "## 14. Relationship to Evidence Acceptance / Ledger / Graph Model",
    "## 15. Failure and No-Go Conditions",
    "## 16. Relationship to Future GraphRAG / Vector / Runtime LLM",
    "## 17. Non-authorization Statement",
  ]);
});

test("LLM_JUDGMENT_EVALUATION_GATE contains the definition sentence and Japanese conceptual sentence", () => {
  requireAll(gate, "gate", [
    "The LLM Judgment Evaluation Gate allows reviewed evidence to be evaluated only into an LLM Judgment Record, clarification_needed, or No-Go, not truth assignment, not automated decision-making, not approval, not action authorization, and not Formal WorkUnit promotion.",
    "LLM Judgment Evaluationとは真偽判定でも自動意思決定でもない。review済みevidenceを根拠として、LLMが非認可のjudgment artifactを生成しうるboundedなreview stepであり、human decision authority・uncertainty・provenance references・conflict handling・human review boundariesを保持しなければならない。",
  ]);
});

test("LLM_JUDGMENT_EVALUATION_GATE contains all not-gate items", () => {
  requireAll(gate, "gate", [
    "- truth assignment\n",
    "- automated decision-making\n",
    "- approval\n",
    "- action authorization\n",
    "- external action\n",
    "- Formal WorkUnit promotion\n",
    "- runtime LLM enablement\n",
    "- real LLM provider integration\n",
    "- GraphRAG implementation\n",
    "- vector storage\n",
    "- evidence storage\n",
    "- provenance storage\n",
    "- model-confidence shortcut\n",
    "- human review replacement\n",
  ]);
});

test("LLM_JUDGMENT_EVALUATION_GATE contains all allowed inputs", () => {
  requireAll(gate, "gate", [
    "- valid_evidence_review_record\n",
    "- tenant_id\n",
    "- evidence_review_id\n",
    "- source_query_result_record_id\n",
    "- source_rule_review_record_id\n",
    "- source_compiled_sql_artifact_id\n",
    "- source_safe_query_plan_id\n",
    "- source_query_intent_id\n",
    "- evidence_claim\n",
    "- evidence_type\n",
    "- source_trust_marker\n",
    "- provenance_check_result\n",
    "- lineage_check_result\n",
    "- tenant_scope_check_result\n",
    "- selected_source_rows_check_result\n",
    "- selected_columns_check_result\n",
    "- redaction_check_result\n",
    "- aggregation_check_result\n",
    "- source_trust_check_result\n",
    "- conflict_check_result\n",
    "- result_hash_check_result\n",
    "- content_integrity_check_result\n",
    "- human_review_required\n",
    "- decision_impact_scope\n",
    "- allowed_use\n",
    "- disallowed_use\n",
    "- evidence_accepted\n",
    "- evidence_rejected_reason\n",
    "- reviewer_context\n",
    "- no_go_flags\n",
  ]);
});

test("LLM_JUDGMENT_EVALUATION_GATE contains allowed outputs and the flow", () => {
  requireAll(gate, "gate", [
    "- LLM Judgment Record\n",
    "- clarification_needed\n",
    "- No-Go\n",
    "Valid Evidence Review Record → Evidence acceptance and use-boundary validation → Grounding and provenance validation → Uncertainty and conflict validation → LLM Judgment Record or Clarification or No-Go",
  ]);
});

test("LLM_JUDGMENT_EVALUATION_GATE contains all fixed gate rules", () => {
  requireAll(gate, "gate", [
    "An LLM Judgment Record must be non-executing.",
    "An LLM Judgment Record must not authorize execution.",
    "An LLM Judgment Record must not authorize external action.",
    "An LLM Judgment Record must not approve anything.",
    "An LLM Judgment Record must not promote a WorkUnit Candidate into a Formal WorkUnit.",
    "An LLM Judgment Record must not be treated as truth by default.",
    "An LLM Judgment Record must not override Evidence Review.",
    "An LLM Judgment Record must not override human review.",
    "A model confidence score must not be used as evidence.",
    "A model confidence score must not be used as truth.",
    "A model confidence score must not authorize approval.",
    "A model confidence score must not authorize action.",
    "A model confidence score must not reduce human_review_required.",
    "A model confidence score must not resolve conflict_state by itself.",
    "Evidence Review Record without tenant_id is No-Go.",
    "Evidence Review Record without evidence_review_id is No-Go.",
    "Evidence Review Record without lineage ids is No-Go.",
    "Evidence Review Record without complete provenance checks is No-Go.",
    "Evidence Review Record with no_go_flags is No-Go.",
    "Evidence Review Record with disallowed_use that includes LLM judgment is No-Go.",
    "Evidence Review Record with evidence_accepted other than true must be clarification_needed or No-Go.",
    "Evidence Review Record with unresolved conflict requires human review.",
    "Evidence Review Record with unknown_source or untrusted_source must not automatically pass into LLM judgment.",
  ]);
});

test("LLM_JUDGMENT_EVALUATION_GATE contains pre-evaluation validation requirements", () => {
  requireAll(gate, "gate", [
    "Before an LLM Judgment Record can be produced, the gate must validate evidence_review_id, tenant_id, lineage ids, evidence_claim, evidence_type, source_trust_marker, provenance_check_result, lineage_check_result, tenant_scope_check_result, selected_source_rows_check_result, selected_columns_check_result, redaction_check_result, aggregation_check_result, source_trust_check_result, conflict_check_result, result_hash_check_result, content_integrity_check_result, decision_impact_scope, allowed_use, disallowed_use, evidence_accepted, human_review_required, reviewer_context, and no_go_flags.",
  ]);
});

test("LLM_JUDGMENT_EVALUATION_GATE contains evidence grounding and provenance checks", () => {
  requireAll(gate, "gate", [
    "LLM judgment input must reference Evidence Review Record ids.",
    "LLM judgment input must reference selected source rows through reviewed evidence only.",
    "LLM judgment input must reference selected columns through reviewed evidence only.",
    "LLM judgment input must preserve provenance references.",
    "LLM judgment input must preserve content_integrity_check_result.",
    "LLM judgment input must preserve result_hash_check_result.",
    "LLM judgment must not cite unavailable sources.",
    "LLM judgment must not invent source rows.",
    "LLM judgment must not invent selected columns.",
    "LLM judgment must not treat unsupported inference as evidence.",
  ]);
});

test("LLM_JUDGMENT_EVALUATION_GATE contains uncertainty, confidence, and conflict handling rules", () => {
  requireAll(gate, "gate", [
    "LLM Judgment Record must contain uncertainty_state.",
    "LLM Judgment Record must contain confidence_explanation.",
    "LLM Judgment Record must contain unsupported_inferences.",
    "LLM Judgment Record must contain conflict_handling_summary.",
    "- low_uncertainty\n",
    "- medium_uncertainty\n",
    "- high_uncertainty\n",
    "- unknown_uncertainty\n",
    "- conflicting_evidence\n",
    "- insufficient_evidence\n",
    "A judgment with high_uncertainty, unknown_uncertainty, conflicting_evidence, or insufficient_evidence must require human review.",
    "Model confidence must be explanatory only.",
    "Model confidence must not be used as permission.",
    "Model confidence must not convert evidence into truth.",
  ]);
});

test("LLM_JUDGMENT_EVALUATION_GATE contains human review and decision boundary rules", () => {
  requireAll(gate, "gate", [
    "human_review_required must remain explicit.",
    "Human review cannot be bypassed by LLM judgment.",
    "LLM judgment may support human review only.",
    "LLM judgment must not make final decisions.",
    "LLM judgment must not modify decision_impact_scope.",
    "LLM judgment must not promote a candidate.",
    "LLM judgment must not create approval.",
    "LLM judgment must not create action preview.",
    "LLM judgment must not create external action.",
  ]);
});

test("LLM_JUDGMENT_EVALUATION_GATE contains safety, redaction, and data boundary rules", () => {
  requireAll(gate, "gate", [
    "redaction_check_result must be preserved.",
    "disallowed_use must be respected.",
    "secret_or_token data must not be sent to LLM judgment.",
    "blocked_input data must not be sent to LLM judgment.",
    "unknown_sensitive data must not be sent to LLM judgment.",
    "redaction_required, redaction_unknown, or redaction_failed must not automatically pass into LLM judgment.",
    "LLM judgment must not expose secrets.",
    "LLM judgment must not expand access beyond allowed_use.",
  ]);
});

test("LLM_JUDGMENT_EVALUATION_GATE contains relationship to Evidence Acceptance / Ledger / Graph Model", () => {
  requireAll(gate, "gate", [
    "Evidence Acceptance recording gate remains future-gated.",
    "LLM Judgment Record must not replace Evidence Acceptance recording.",
    "Future ALPHA_EVIDENCE_LEDGER linkage must preserve evidence_review_id, evidence_claim, evidence_type, source_trust_marker, result_hash, content_integrity_reference, and judgment_id.",
    "Future GRAPH_MODEL linkage must distinguish evidence nodes, judgment nodes, decision nodes, and action nodes.",
    "LLM Judgment Record may reference evidence nodes only after evidence review and acceptance requirements are satisfied.",
    "LLM Judgment Record must not create graph edges that imply action authorization.",
  ]);
});

test("LLM_JUDGMENT_EVALUATION_GATE contains all failure and No-Go conditions", () => {
  requireAll(gate, "gate", [
    "- invalid_evidence_review_record\n",
    "- missing_tenant_id\n",
    "- missing_evidence_review_id\n",
    "- missing_lineage_id\n",
    "- missing_evidence_claim\n",
    "- missing_evidence_type\n",
    "- missing_source_trust_marker\n",
    "- provenance_check_failed\n",
    "- lineage_check_failed\n",
    "- tenant_scope_check_failed\n",
    "- selected_source_rows_check_failed\n",
    "- selected_columns_check_failed\n",
    "- redaction_check_failed\n",
    "- aggregation_check_failed\n",
    "- source_trust_check_failed\n",
    "- conflict_check_failed\n",
    "- result_hash_check_failed\n",
    "- content_integrity_check_failed\n",
    "- evidence_not_accepted\n",
    "- llm_judgment_disallowed\n",
    "- no_go_flags_present\n",
    "- secret_or_token_sent_to_llm\n",
    "- blocked_input_sent_to_llm\n",
    "- unknown_sensitive_sent_to_llm\n",
    "- unsupported_inference_as_evidence\n",
    "- invented_source_row\n",
    "- invented_selected_column\n",
    "- model_confidence_as_truth\n",
    "- model_confidence_as_evidence\n",
    "- model_confidence_as_approval\n",
    "- model_confidence_as_action_authorization\n",
    "- human_review_bypass\n",
    "- llm_judgment_as_formal_workunit_promotion\n",
    "- llm_judgment_as_external_action\n",
  ]);
});

test("LLM_JUDGMENT_EVALUATION_GATE contains future system rules and the non-authorization statement", () => {
  requireAll(gate, "gate", [
    "Future GraphRAG may use LLM Judgment Records only after evidence review, evidence acceptance recording, and graph linkage gates are satisfied.",
    "Future vector storage may embed reviewed evidence or judgment only after a separate vectorization gate.",
    "Future runtime LLM may be enabled only after a separate real LLM enablement gate.",
    "Future LLM judgment must remain non-authorizing.",
    "Future action authorization must remain separate.",
    "This LLM Judgment Evaluation Gate authorizes no truth assignment, no automated decision-making, no approval, no action authorization, no external action execution, no Formal WorkUnit promotion, no runtime LLM enablement, no real LLM provider integration, no GraphRAG implementation, no vectorization, no runtime evidence storage, no runtime provenance storage, no database access, no D1 execution, no SQL execution, no deployment, and no automated decision-making.",
  ]);
});

test("LLM_JUDGMENT_RECORD_CONTRACT contains all required sections", () => {
  requireAll(contract, "contract", [
    "## 1. Purpose",
    "## 2. Scope",
    "## 3. Definition of LLM Judgment Record",
    "## 4. What LLM Judgment Record Is Not",
    "## 5. Required Fields",
    "## 6. Judgment Status",
    "## 7. Judgment Outcome Types",
    "## 8. Evidence Reference Fields",
    "## 9. Grounding and Provenance Fields",
    "## 10. Uncertainty and Confidence Fields",
    "## 11. Conflict and Human Review Fields",
    "## 12. Allowed Use and Disallowed Use Fields",
    "## 13. Safety and Redaction Fields",
    "## 14. Relationship to Decision / Evidence Ledger / Graph Model",
    "## 15. Validation Rules",
    "## 16. Pass / Warn / Fail / No-Go Outcomes",
    "## 17. Non-authorization Statement",
  ]);
});

test("LLM_JUDGMENT_RECORD_CONTRACT contains the definition sentence and Japanese conceptual sentence", () => {
  requireAll(contract, "contract", [
    "An LLM Judgment Record is a non-executing, tenant-scoped, evidence-grounded artifact that records a bounded model judgment, its evidence references, uncertainty, confidence explanation, unsupported inferences, conflict handling, allowed use, disallowed use, and human-review requirements without authorizing decisions or actions.",
    "LLM Judgment Recordとは、boundedなmodel judgment・evidence references・uncertainty・confidence explanation・unsupported inferences・conflict handling・allowed use・disallowed use・human-review requirementsを記録する、非実行・tenant-scoped・evidence-groundedなartifactであり、decisionやactionを認可しない。",
  ]);
});

test("LLM_JUDGMENT_RECORD_CONTRACT contains all not-record items", () => {
  requireAll(contract, "contract", [
    "- truth assignment\n",
    "- automated decision\n",
    "- approval\n",
    "- action authorization\n",
    "- external action\n",
    "- Formal WorkUnit promotion\n",
    "- runtime LLM call\n",
    "- GraphRAG implementation\n",
    "- vector embedding\n",
    "- evidence storage\n",
    "- provenance storage\n",
    "- human review replacement\n",
  ]);
});

test("LLM_JUDGMENT_RECORD_CONTRACT contains all required fields", () => {
  requireAll(contract, "contract", [
    "- llm_judgment_id\n",
    "- tenant_id\n",
    "- source_evidence_review_record_id\n",
    "- source_query_result_record_id\n",
    "- source_rule_review_record_id\n",
    "- source_compiled_sql_artifact_id\n",
    "- source_safe_query_plan_id\n",
    "- source_query_intent_id\n",
    "- related_goal_id\n",
    "- related_workunit_candidate_id\n",
    "- judgment_status\n",
    "- judgment_outcome\n",
    "- judgment_summary\n",
    "- judgment_claims\n",
    "- evidence_references\n",
    "- provenance_references\n",
    "- selected_source_rows_referenced\n",
    "- selected_columns_referenced\n",
    "- source_trust_marker\n",
    "- evidence_type\n",
    "- evidence_claim\n",
    "- uncertainty_state\n",
    "- confidence_explanation\n",
    "- model_confidence_value\n",
    "- unsupported_inferences\n",
    "- conflict_handling_summary\n",
    "- human_review_required\n",
    "- human_review_reason\n",
    "- decision_impact_scope\n",
    "- allowed_use\n",
    "- disallowed_use\n",
    "- redaction_state\n",
    "- safety_boundary_result\n",
    "- model_identity\n",
    "- prompt_version\n",
    "- reviewed_by_system\n",
    "- judged_at\n",
    "- no_go_flags\n",
    "- notes\n",
  ]);
});

test("LLM_JUDGMENT_RECORD_CONTRACT contains status values and outcome types", () => {
  requireAll(contract, "contract", [
    "- draft_judgment\n",
    "- clarification_needed\n",
    "- blocked_no_go\n",
    "- ready_for_human_judgment_review\n",
    "- pass\n",
    "- warn\n",
    "- fail\n",
    "- no_go\n",
  ]);
});

test("LLM_JUDGMENT_RECORD_CONTRACT contains evidence reference field rules", () => {
  requireAll(contract, "contract", [
    "source_evidence_review_record_id is required.",
    "source_query_result_record_id is required.",
    "source_rule_review_record_id is required.",
    "source_compiled_sql_artifact_id is required.",
    "source_safe_query_plan_id is required.",
    "source_query_intent_id is required.",
    "evidence_references is required.",
    "provenance_references is required.",
    "selected_source_rows_referenced is required.",
    "selected_columns_referenced is required.",
    "A judgment without evidence references must not pass.",
    "A judgment without provenance references must not pass.",
  ]);
});

test("LLM_JUDGMENT_RECORD_CONTRACT contains grounding and provenance field rules", () => {
  requireAll(contract, "contract", [
    "judgment_claims must be grounded in evidence_references.",
    "unsupported_inferences must be explicit.",
    "LLM Judgment Record must not invent source rows.",
    "LLM Judgment Record must not invent selected columns.",
    "LLM Judgment Record must not cite unavailable evidence.",
    "LLM Judgment Record must not treat unsupported inference as evidence.",
  ]);
});

test("LLM_JUDGMENT_RECORD_CONTRACT contains uncertainty and confidence field rules", () => {
  requireAll(contract, "contract", [
    "uncertainty_state is required.",
    "confidence_explanation is required.",
    "model_confidence_value is optional and explanatory only.",
    "- low_uncertainty\n",
    "- medium_uncertainty\n",
    "- high_uncertainty\n",
    "- unknown_uncertainty\n",
    "- conflicting_evidence\n",
    "- insufficient_evidence\n",
    "model_confidence_value must not authorize approval.",
    "model_confidence_value must not authorize action.",
    "model_confidence_value must not reduce human_review_required.",
  ]);
});

test("LLM_JUDGMENT_RECORD_CONTRACT contains conflict and human review field rules", () => {
  requireAll(contract, "contract", [
    "conflict_handling_summary is required.",
    "human_review_required is required.",
    "human_review_reason is required when human_review_required is true.",
    "high_uncertainty, unknown_uncertainty, conflicting_evidence, and insufficient_evidence require human review.",
    "LLM Judgment Record must not bypass human review.",
  ]);
});

test("LLM_JUDGMENT_RECORD_CONTRACT contains allowed use and disallowed use field rules", () => {
  requireAll(contract, "contract", [
    "allowed_use is required.",
    "disallowed_use is required.",
    "LLM Judgment Record may support human review only.",
    "LLM Judgment Record must not authorize decisions.",
    "LLM Judgment Record must not authorize actions.",
    "LLM Judgment Record must respect disallowed_use.",
  ]);
});

test("LLM_JUDGMENT_RECORD_CONTRACT contains safety and redaction field rules", () => {
  requireAll(contract, "contract", [
    "redaction_state is required.",
    "safety_boundary_result is required.",
    "secret_or_token data must not appear.",
    "blocked_input data must not appear.",
    "unknown_sensitive data must not appear.",
    "Redaction failures must not pass.",
  ]);
});

test("LLM_JUDGMENT_RECORD_CONTRACT contains relationship to Decision / Evidence Ledger / Graph Model", () => {
  requireAll(contract, "contract", [
    "LLM Judgment Record may support human decision review.",
    "LLM Judgment Record must not be a decision record.",
    "LLM Judgment Record must not update ALPHA_EVIDENCE_LEDGER in this phase.",
    "Future ALPHA_EVIDENCE_LEDGER linkage must preserve evidence_review_id and llm_judgment_id.",
    "Future GRAPH_MODEL linkage must distinguish evidence nodes, judgment nodes, decision nodes, and action nodes.",
    "LLM Judgment Record must not create graph edges that imply action authorization.",
  ]);
});

test("LLM_JUDGMENT_RECORD_CONTRACT contains validation rules", () => {
  requireAll(contract, "contract", [
    "A valid LLM Judgment Record must contain tenant_id.",
    "A valid LLM Judgment Record must contain all lineage ids.",
    "A valid LLM Judgment Record must contain evidence_references.",
    "A valid LLM Judgment Record must contain provenance_references.",
    "A valid LLM Judgment Record must contain selected_source_rows_referenced.",
    "A valid LLM Judgment Record must contain selected_columns_referenced.",
    "A valid LLM Judgment Record must contain uncertainty_state.",
    "A valid LLM Judgment Record must contain confidence_explanation.",
    "A valid LLM Judgment Record must contain conflict_handling_summary.",
    "A valid LLM Judgment Record must contain allowed_use and disallowed_use.",
    "A valid LLM Judgment Record must not authorize execution.",
    "A valid LLM Judgment Record must not authorize Formal WorkUnit promotion.",
  ]);
});

test("LLM_JUDGMENT_RECORD_CONTRACT contains Pass / Warn / Fail / No-Go outcomes and non-authorization statement", () => {
  requireAll(contract, "contract", [
    "The LLM Judgment Record is tenant-scoped, evidence-grounded, provenance-referenced, uncertainty-explicit, conflict-explicit, human-review-preserving, safety-boundary-compliant, and non-authorizing.",
    "The LLM Judgment Record is non-authorizing, but uncertainty, conflict, redaction, grounding, or reviewer context requires clarification before confident human review.",
    "Required judgment fields, evidence references, provenance references, or uncertainty fields are missing, but no hard safety boundary is crossed.",
    "A hard safety boundary is violated, such as model confidence used as truth, model confidence used as evidence, model confidence used as approval, model confidence used as action authorization, invented source rows, invented selected columns, unsupported inference treated as evidence, human review bypass, secret_or_token exposure, blocked_input exposure, unknown_sensitive exposure, Formal WorkUnit promotion, or external action authorization.",
    "This LLM Judgment Record Contract authorizes no truth assignment, no automated decision, no approval, no action authorization, no external action execution, no Formal WorkUnit promotion, no runtime LLM call, no GraphRAG implementation, no vector embedding, no runtime evidence storage, no runtime provenance storage, no database access, no D1 execution, no SQL execution, no deployment, and no automated decision-making.",
  ]);
});
