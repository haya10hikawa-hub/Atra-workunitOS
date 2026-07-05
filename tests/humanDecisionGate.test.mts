import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { test } from "node:test";

const GATE_PATH = "docs/HUMAN_DECISION_GATE.md";
const CONTRACT_PATH = "docs/HUMAN_DECISION_RECORD_CONTRACT.md";

const gate = existsSync(GATE_PATH) ? readFileSync(GATE_PATH, "utf8") : "";
const contract = existsSync(CONTRACT_PATH) ? readFileSync(CONTRACT_PATH, "utf8") : "";

function requireAll(doc: string, label: string, needles: string[]): void {
  for (const needle of needles) {
    assert.ok(doc.includes(needle), `${label} must contain: ${JSON.stringify(needle)}`);
  }
}

test("P6.14 docs exist", () => {
  assert.ok(existsSync(GATE_PATH), `${GATE_PATH} must exist`);
  assert.ok(existsSync(CONTRACT_PATH), `${CONTRACT_PATH} must exist`);
  assert.ok(gate.length > 0, "gate doc must be non-empty");
  assert.ok(contract.length > 0, "contract doc must be non-empty");
});

test("HUMAN_DECISION_GATE contains all required sections", () => {
  requireAll(gate, "gate", [
    "## 1. Purpose",
    "## 2. Scope",
    "## 3. Definition of Human Decision Gate",
    "## 4. What Human Decision Is Not",
    "## 5. Gate Principles",
    "## 6. Allowed Inputs",
    "## 7. Allowed Outputs",
    "## 8. Evidence / Judgment to Human Decision Flow",
    "## 9. Pre-decision Validation",
    "## 10. Evidence Acceptance Requirements",
    "## 11. LLM Judgment Review Requirements",
    "## 12. Decision Impact Scope",
    "## 13. Human Authority and Review Boundary",
    "## 14. Relationship to Approval / Promotion / Execution",
    "## 15. Failure and No-Go Conditions",
    "## 16. Relationship to Future Evidence Ledger / Graph Model / Runtime Decision Storage",
    "## 17. Non-authorization Statement",
  ]);
});

test("HUMAN_DECISION_GATE contains the definition sentence and Japanese conceptual sentence", () => {
  requireAll(gate, "gate", [
    "The Human Decision Gate allows reviewed evidence and reviewed LLM judgment to be recorded only into a Human Decision Record, clarification_needed, or No-Go, not ApprovalStore approval, not action authorization, not external action execution, and not automatic Formal WorkUnit promotion.",
    "Human DecisionとはApprovalStore approvalでもaction authorizationでもない。review済みevidenceとLLM judgmentを参照しながら、人間が何を判断したか、どの根拠を考慮したか、どの不確実性が残るか、approval・promotion・executionの前にどのfuture gateが必要かを記録する、人間作成のdecision artifactである。",
  ]);
});

test("HUMAN_DECISION_GATE contains all not-gate items", () => {
  requireAll(gate, "gate", [
    "- ApprovalStore approval\n",
    "- action authorization\n",
    "- external action execution\n",
    "- automatic Formal WorkUnit promotion\n",
    "- automated decision-making\n",
    "- runtime decision storage\n",
    "- runtime evidence acceptance storage\n",
    "- runtime evidence ledger update\n",
    "- runtime graph update\n",
    "- approval replacement\n",
    "- human review replacement\n",
    "- LLM judgment replacement\n",
    "- model-confidence shortcut\n",
  ]);
});

test("HUMAN_DECISION_GATE contains all allowed inputs", () => {
  requireAll(gate, "gate", [
    "- valid_evidence_review_record\n",
    "- valid_llm_judgment_record\n",
    "- tenant_id\n",
    "- evidence_review_id\n",
    "- llm_judgment_id\n",
    "- source_query_result_record_id\n",
    "- source_rule_review_record_id\n",
    "- source_compiled_sql_artifact_id\n",
    "- source_safe_query_plan_id\n",
    "- source_query_intent_id\n",
    "- evidence_claim\n",
    "- evidence_type\n",
    "- source_trust_marker\n",
    "- evidence_accepted\n",
    "- evidence_rejected_reason\n",
    "- judgment_summary\n",
    "- judgment_claims\n",
    "- uncertainty_state\n",
    "- confidence_explanation\n",
    "- unsupported_inferences\n",
    "- conflict_handling_summary\n",
    "- human_review_required\n",
    "- human_review_reason\n",
    "- decision_impact_scope\n",
    "- allowed_use\n",
    "- disallowed_use\n",
    "- reviewer_context\n",
    "- no_go_flags\n",
  ]);
});

test("HUMAN_DECISION_GATE contains allowed outputs and the flow", () => {
  requireAll(gate, "gate", [
    "- Human Decision Record\n",
    "- clarification_needed\n",
    "- No-Go\n",
    "Valid Evidence Review Record + Valid LLM Judgment Record → Evidence acceptance and judgment review validation → Human decision capture → Human Decision Record or Clarification or No-Go",
  ]);
});

test("HUMAN_DECISION_GATE contains all fixed gate rules", () => {
  requireAll(gate, "gate", [
    "A Human Decision Record must be human-authored.",
    "A Human Decision Record must be non-executing.",
    "A Human Decision Record must not authorize execution.",
    "A Human Decision Record must not authorize external action.",
    "A Human Decision Record must not approve anything in ApprovalStore.",
    "A Human Decision Record must not automatically promote a WorkUnit Candidate into a Formal WorkUnit.",
    "A Human Decision Record must not override ApprovalStore.",
    "A Human Decision Record must not override external action gating.",
    "A Human Decision Record must not be produced solely by an LLM.",
    "A Human Decision Record must not be produced solely from model confidence.",
    "Human decision may reference LLM Judgment Record only as non-authorizing support.",
    "Evidence acceptance must not mean action authorization.",
    "Evidence acceptance must not mean Formal WorkUnit promotion.",
  ]);
});

test("HUMAN_DECISION_GATE contains pre-decision validation requirements", () => {
  requireAll(gate, "gate", [
    "Before a Human Decision Record can be produced, the gate must validate tenant_id, evidence_review_id, llm_judgment_id, lineage ids, evidence_claim, evidence_type, source_trust_marker, evidence_accepted, evidence_rejected_reason, judgment_summary, judgment_claims, uncertainty_state, confidence_explanation, unsupported_inferences, conflict_handling_summary, human_review_required, human_review_reason, decision_impact_scope, allowed_use, disallowed_use, reviewer_context, and no_go_flags.",
  ]);
});

test("HUMAN_DECISION_GATE contains evidence acceptance requirements", () => {
  requireAll(gate, "gate", [
    "Evidence acceptance is a human-recorded state.",
    "Evidence acceptance must reference an Evidence Review Record.",
    "Evidence acceptance must preserve evidence_review_id.",
    "Evidence acceptance must preserve evidence_claim.",
    "Evidence acceptance must preserve evidence_type.",
    "Evidence acceptance must preserve source_trust_marker.",
    "Evidence acceptance must preserve result_hash.",
    "Evidence acceptance must preserve content_integrity_reference.",
    "Evidence acceptance must preserve conflict state.",
    "Evidence acceptance must not authorize action.",
    "Evidence acceptance must not authorize external execution.",
    "Evidence acceptance must not authorize Formal WorkUnit promotion.",
    "Evidence rejection must preserve evidence_rejected_reason.",
  ]);
});

test("HUMAN_DECISION_GATE contains LLM judgment review requirements", () => {
  requireAll(gate, "gate", [
    "Human decision may reference LLM Judgment Record.",
    "Human decision must preserve llm_judgment_id when judgment is used.",
    "Human decision must preserve uncertainty_state.",
    "Human decision must preserve confidence_explanation.",
    "Human decision must preserve unsupported_inferences.",
    "Human decision must preserve conflict_handling_summary.",
    "Human decision must not treat LLM Judgment as truth by default.",
    "Human decision must not treat model_confidence_value as permission.",
    "Human decision must not ignore unsupported_inferences.",
    "Human decision must not ignore unresolved conflict.",
  ]);
});

test("HUMAN_DECISION_GATE contains decision impact scope enum and rules", () => {
  requireAll(gate, "gate", [
    "- priority_assessment\n",
    "- risk_assessment\n",
    "- action_readiness_assessment\n",
    "- promotion_readiness_assessment\n",
    "- evidence_acceptance\n",
    "- judgment_acceptance\n",
    "- no_action_decision\n",
    "- clarification_request\n",
    "- defer_decision\n",
    "decision_impact_scope must not authorize action by itself.",
    "decision_impact_scope must not authorize approval by itself.",
    "decision_impact_scope must not authorize Formal WorkUnit promotion by itself.",
    "action_readiness_assessment is not action execution.",
    "promotion_readiness_assessment is not Formal WorkUnit promotion.",
  ]);
});

test("HUMAN_DECISION_GATE contains human authority and review boundary", () => {
  requireAll(gate, "gate", [
    "Human decision authority remains with the human reviewer.",
    "LLM judgment may support but not replace human decision.",
    "Evidence may support but not replace human decision.",
    "Model confidence must not replace human decision.",
    "Human decision must be attributable to a human reviewer.",
    "Human decision must record reviewer_context.",
    "Human decision must preserve uncertainty and conflict notes.",
  ]);
});

test("HUMAN_DECISION_GATE contains relationship to approval / promotion / execution", () => {
  requireAll(gate, "gate", [
    "ApprovalStore approval remains a separate future gate.",
    "Formal WorkUnit promotion remains a separate future gate.",
    "External action execution remains a separate future gate.",
    "Human Decision Record may be an input to future approval, promotion, or execution gates.",
    "Human Decision Record must not itself perform approval, promotion, or execution.",
    "Human Decision Record must not bypass four-eyes requirements.",
    "Human Decision Record must not bypass self-approval restrictions.",
  ]);
});

test("HUMAN_DECISION_GATE contains all failure and No-Go conditions", () => {
  requireAll(gate, "gate", [
    "- invalid_evidence_review_record\n",
    "- invalid_llm_judgment_record\n",
    "- missing_tenant_id\n",
    "- missing_evidence_review_id\n",
    "- missing_llm_judgment_id\n",
    "- missing_lineage_id\n",
    "- missing_evidence_claim\n",
    "- missing_evidence_type\n",
    "- missing_source_trust_marker\n",
    "- evidence_not_accepted\n",
    "- missing_evidence_rejected_reason\n",
    "- missing_judgment_summary\n",
    "- missing_judgment_claims\n",
    "- missing_uncertainty_state\n",
    "- missing_confidence_explanation\n",
    "- missing_unsupported_inferences\n",
    "- missing_conflict_handling_summary\n",
    "- missing_human_review_required\n",
    "- missing_human_review_reason\n",
    "- missing_decision_impact_scope\n",
    "- missing_allowed_use\n",
    "- missing_disallowed_use\n",
    "- missing_reviewer_context\n",
    "- no_go_flags_present\n",
    "- llm_only_decision\n",
    "- model_confidence_as_decision\n",
    "- human_review_bypass\n",
    "- evidence_acceptance_as_action_authorization\n",
    "- human_decision_as_approvalstore_approval\n",
    "- human_decision_as_action_authorization\n",
    "- human_decision_as_external_action\n",
    "- human_decision_as_formal_workunit_promotion\n",
    "- four_eyes_bypass\n",
    "- self_approval_bypass\n",
  ]);
});

test("HUMAN_DECISION_GATE contains future system rules and the non-authorization statement", () => {
  requireAll(gate, "gate", [
    "Future ALPHA_EVIDENCE_LEDGER linkage may use Human Decision Record only after a separate evidence ledger linkage gate.",
    "Future GRAPH_MODEL linkage may use Human Decision Record only after a separate graph linkage gate.",
    "Future runtime decision storage requires a separate implementation gate.",
    "Future ApprovalStore approval requires a separate approval gate.",
    "Future Formal WorkUnit promotion requires a separate promotion gate.",
    "Future external action execution requires a separate execution gate.",
    "This Human Decision Gate authorizes no ApprovalStore approval, no action authorization, no external action execution, no automatic Formal WorkUnit promotion, no automated decision-making, no runtime decision storage, no runtime evidence acceptance storage, no runtime evidence ledger update, no runtime graph update, no ApprovalStore integration, no real LLM enablement, no GraphRAG implementation, no vectorization, no deployment, and no automated decision-making.",
  ]);
});

test("HUMAN_DECISION_RECORD_CONTRACT contains all required sections", () => {
  requireAll(contract, "contract", [
    "## 1. Purpose",
    "## 2. Scope",
    "## 3. Definition of Human Decision Record",
    "## 4. What Human Decision Record Is Not",
    "## 5. Required Fields",
    "## 6. Decision Status",
    "## 7. Decision Outcome Types",
    "## 8. Evidence Acceptance Fields",
    "## 9. LLM Judgment Reference Fields",
    "## 10. Decision Impact Scope Fields",
    "## 11. Human Reviewer and Attribution Fields",
    "## 12. Uncertainty, Conflict, and Rationale Fields",
    "## 13. Allowed Use and Disallowed Use Fields",
    "## 14. Relationship to Approval / Promotion / Evidence Ledger / Graph Model",
    "## 15. Validation Rules",
    "## 16. Pass / Warn / Fail / No-Go Outcomes",
    "## 17. Non-authorization Statement",
  ]);
});

test("HUMAN_DECISION_RECORD_CONTRACT contains the definition sentence and Japanese conceptual sentence", () => {
  requireAll(contract, "contract", [
    "A Human Decision Record is a non-executing, human-authored, tenant-scoped artifact that records a human decision, reviewed evidence references, reviewed LLM judgment references, evidence acceptance state, uncertainty, conflict, rationale, decision impact scope, allowed use, disallowed use, and future gate requirements without authorizing approval, promotion, or execution.",
    "Human Decision Recordとは、人間の判断・review済みevidence references・review済みLLM judgment references・evidence acceptance state・uncertainty・conflict・rationale・decision impact scope・allowed use・disallowed use・future gate requirementsを記録する、非実行・人間作成・tenant-scopedなartifactであり、approval・promotion・executionを認可しない。",
  ]);
});

test("HUMAN_DECISION_RECORD_CONTRACT contains all not-record items", () => {
  requireAll(contract, "contract", [
    "- ApprovalStore approval\n",
    "- action authorization\n",
    "- external action\n",
    "- Formal WorkUnit promotion\n",
    "- automated decision\n",
    "- runtime decision storage\n",
    "- runtime evidence ledger update\n",
    "- runtime graph update\n",
    "- LLM judgment\n",
    "- evidence review\n",
    "- approval replacement\n",
    "- human review replacement\n",
  ]);
});

test("HUMAN_DECISION_RECORD_CONTRACT contains all required fields", () => {
  requireAll(contract, "contract", [
    "- human_decision_id\n",
    "- tenant_id\n",
    "- decision_status\n",
    "- decision_outcome\n",
    "- human_reviewer_id\n",
    "- human_reviewer_role\n",
    "- reviewer_context\n",
    "- source_evidence_review_record_id\n",
    "- source_llm_judgment_record_id\n",
    "- source_query_result_record_id\n",
    "- source_rule_review_record_id\n",
    "- source_compiled_sql_artifact_id\n",
    "- source_safe_query_plan_id\n",
    "- source_query_intent_id\n",
    "- related_goal_id\n",
    "- related_workunit_candidate_id\n",
    "- evidence_accepted\n",
    "- evidence_rejected_reason\n",
    "- evidence_claim\n",
    "- evidence_type\n",
    "- source_trust_marker\n",
    "- result_hash\n",
    "- content_integrity_reference\n",
    "- llm_judgment_id\n",
    "- judgment_summary\n",
    "- judgment_claims\n",
    "- uncertainty_state\n",
    "- confidence_explanation\n",
    "- unsupported_inferences\n",
    "- conflict_handling_summary\n",
    "- human_decision_summary\n",
    "- human_decision_rationale\n",
    "- decision_impact_scope\n",
    "- allowed_use\n",
    "- disallowed_use\n",
    "- future_gate_requirements\n",
    "- approval_required\n",
    "- promotion_required\n",
    "- execution_required\n",
    "- four_eyes_required\n",
    "- self_approval_blocked\n",
    "- reviewed_by_human_at\n",
    "- created_at\n",
    "- no_go_flags\n",
    "- notes\n",
  ]);
});

test("HUMAN_DECISION_RECORD_CONTRACT contains status values and outcome types", () => {
  requireAll(contract, "contract", [
    "- draft_human_decision\n",
    "- clarification_needed\n",
    "- blocked_no_go\n",
    "- ready_for_future_gate_review\n",
    "- pass\n",
    "- warn\n",
    "- fail\n",
    "- no_go\n",
  ]);
});

test("HUMAN_DECISION_RECORD_CONTRACT contains evidence acceptance field rules", () => {
  requireAll(contract, "contract", [
    "source_evidence_review_record_id is required.",
    "evidence_accepted is required.",
    "evidence_rejected_reason is required when evidence_accepted is false.",
    "evidence_claim is required.",
    "evidence_type is required.",
    "source_trust_marker is required.",
    "result_hash is required.",
    "content_integrity_reference is required.",
    "Evidence acceptance must not authorize action.",
    "Evidence acceptance must not authorize approval.",
    "Evidence acceptance must not authorize promotion.",
  ]);
});

test("HUMAN_DECISION_RECORD_CONTRACT contains LLM judgment reference field rules", () => {
  requireAll(contract, "contract", [
    "source_llm_judgment_record_id is required when LLM judgment is used.",
    "llm_judgment_id must match source_llm_judgment_record_id when present.",
    "judgment_summary is required when LLM judgment is used.",
    "judgment_claims is required when LLM judgment is used.",
    "uncertainty_state is required.",
    "confidence_explanation is required.",
    "unsupported_inferences is required.",
    "conflict_handling_summary is required.",
    "LLM judgment must not be treated as truth by default.",
  ]);
});

test("HUMAN_DECISION_RECORD_CONTRACT contains decision impact scope enum and rules", () => {
  requireAll(contract, "contract", [
    "- priority_assessment\n",
    "- risk_assessment\n",
    "- action_readiness_assessment\n",
    "- promotion_readiness_assessment\n",
    "- evidence_acceptance\n",
    "- judgment_acceptance\n",
    "- no_action_decision\n",
    "- clarification_request\n",
    "- defer_decision\n",
    "decision_impact_scope is required.",
    "action_readiness_assessment is not execution.",
    "promotion_readiness_assessment is not Formal WorkUnit promotion.",
  ]);
});

test("HUMAN_DECISION_RECORD_CONTRACT contains human reviewer and attribution fields", () => {
  requireAll(contract, "contract", [
    "human_reviewer_id is required.",
    "human_reviewer_role is required.",
    "reviewer_context is required.",
    "reviewed_by_human_at is required.",
    "Human Decision Record must be attributable to a human reviewer.",
    "LLM-only decision is No-Go.",
  ]);
});

test("HUMAN_DECISION_RECORD_CONTRACT contains uncertainty, conflict, and rationale fields", () => {
  requireAll(contract, "contract", [
    "uncertainty_state is required.",
    "unsupported_inferences is required.",
    "conflict_handling_summary is required.",
    "human_decision_summary is required.",
    "human_decision_rationale is required.",
    "Unresolved conflict must be preserved.",
    "Unsupported inference must not be treated as evidence.",
  ]);
});

test("HUMAN_DECISION_RECORD_CONTRACT contains allowed use and disallowed use fields", () => {
  requireAll(contract, "contract", [
    "allowed_use is required.",
    "disallowed_use is required.",
    "Human Decision Record may support future gates only.",
    "Human Decision Record must respect disallowed_use.",
    "Human Decision Record must not authorize action.",
    "Human Decision Record must not authorize approval.",
    "Human Decision Record must not authorize promotion.",
  ]);
});

test("HUMAN_DECISION_RECORD_CONTRACT contains relationship to approval / promotion / evidence ledger / graph model", () => {
  requireAll(contract, "contract", [
    "ApprovalStore approval remains a separate future gate.",
    "Formal WorkUnit promotion remains a separate future gate.",
    "External action execution remains a separate future gate.",
    "Future ALPHA_EVIDENCE_LEDGER linkage must preserve human_decision_id, evidence_review_id, llm_judgment_id, evidence_claim, evidence_type, source_trust_marker, result_hash, and content_integrity_reference.",
    "Future GRAPH_MODEL linkage must distinguish evidence nodes, judgment nodes, human decision nodes, approval nodes, promotion nodes, and action nodes.",
    "Human Decision Record must not create graph edges that imply action authorization.",
  ]);
});

test("HUMAN_DECISION_RECORD_CONTRACT contains validation rules", () => {
  requireAll(contract, "contract", [
    "A valid Human Decision Record must contain tenant_id.",
    "A valid Human Decision Record must contain human_reviewer_id.",
    "A valid Human Decision Record must contain reviewer_context.",
    "A valid Human Decision Record must contain evidence_accepted.",
    "A valid Human Decision Record must contain decision_impact_scope.",
    "A valid Human Decision Record must contain allowed_use and disallowed_use.",
    "A valid Human Decision Record must contain future_gate_requirements.",
    "A valid Human Decision Record must not be LLM-only.",
    "A valid Human Decision Record must not authorize execution.",
    "A valid Human Decision Record must not authorize Formal WorkUnit promotion.",
    "A valid Human Decision Record must not authorize ApprovalStore approval.",
  ]);
});

test("HUMAN_DECISION_RECORD_CONTRACT contains Pass / Warn / Fail / No-Go outcomes and non-authorization statement", () => {
  requireAll(contract, "contract", [
    "The Human Decision Record is tenant-scoped, human-authored, evidence-aware, judgment-aware, uncertainty-preserving, conflict-preserving, rationale-complete, future-gate-explicit, and non-authorizing.",
    "The Human Decision Record is non-authorizing, but evidence acceptance, judgment review, uncertainty, conflict, rationale, or future gate requirements need clarification before downstream use.",
    "Required human decision fields, evidence references, judgment references, or rationale fields are missing, but no hard safety boundary is crossed.",
    "A hard safety boundary is violated, such as LLM-only decision, model confidence used as decision, evidence acceptance used as action authorization, human decision used as ApprovalStore approval, human decision used as external action, human decision used as Formal WorkUnit promotion, self-approval bypass, four-eyes bypass, or execution authorization.",
    "This Human Decision Record Contract authorizes no ApprovalStore approval, no action authorization, no external action execution, no Formal WorkUnit promotion, no automated decision, no runtime decision storage, no runtime evidence ledger update, no runtime graph update, no ApprovalStore integration, no real LLM enablement, no GraphRAG implementation, no vectorization, no deployment, and no automated decision-making.",
  ]);
});
