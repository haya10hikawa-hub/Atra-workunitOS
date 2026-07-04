import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { test } from "node:test";

const GATE_PATH = "docs/EVIDENCE_REVIEW_GATE.md";
const CONTRACT_PATH = "docs/EVIDENCE_REVIEW_RECORD_CONTRACT.md";

const gate = existsSync(GATE_PATH) ? readFileSync(GATE_PATH, "utf8") : "";
const contract = existsSync(CONTRACT_PATH) ? readFileSync(CONTRACT_PATH, "utf8") : "";

function requireAll(doc: string, label: string, needles: string[]): void {
  for (const needle of needles) {
    assert.ok(doc.includes(needle), `${label} must contain: ${JSON.stringify(needle)}`);
  }
}

test("P6.12 docs exist", () => {
  assert.ok(existsSync(GATE_PATH), `${GATE_PATH} must exist`);
  assert.ok(existsSync(CONTRACT_PATH), `${CONTRACT_PATH} must exist`);
  assert.ok(gate.length > 0, "gate doc must be non-empty");
  assert.ok(contract.length > 0, "contract doc must be non-empty");
});

test("EVIDENCE_REVIEW_GATE contains all required sections", () => {
  requireAll(gate, "gate", [
    "## 1. Purpose",
    "## 2. Scope",
    "## 3. Definition of Evidence Review Gate",
    "## 4. What Evidence Review Is Not",
    "## 5. Gate Principles",
    "## 6. Allowed Inputs",
    "## 7. Allowed Outputs",
    "## 8. Query Result Record to Evidence Review Flow",
    "## 9. Pre-review Validation",
    "## 10. Lineage, Result Hash, and Content Integrity Checks",
    "## 11. Provenance and Source Row Checks",
    "## 12. Tenant Scope and Denied Schema Checks",
    "## 13. Redaction, Aggregation, and Source Trust Checks",
    "## 14. Conflict State and Human Review Boundary",
    "## 15. Failure and No-Go Conditions",
    "## 16. Relationship to Future Evidence Use / GraphRAG / LLM Judgment",
    "## 17. Non-authorization Statement",
  ]);
});

test("EVIDENCE_REVIEW_GATE contains the gate definition sentence and Japanese conceptual sentence", () => {
  requireAll(gate, "gate", [
    "The Evidence Review Gate allows a valid Query Result Record to be reviewed only into an Evidence Review Record, clarification_needed, or No-Go, not truth assignment, not action authorization, and not Formal WorkUnit promotion.",
    "Evidence Reviewとは真偽判定そのものでもaction authorizationでもない。Query Result Recordが人間の意思決定を支えるevidenceとして扱われる前に、provenance・tenant scope・conflict・redaction・source trust・lineage・content integrityを確認するreviewである。",
  ]);
});

test("EVIDENCE_REVIEW_GATE contains all not-review items", () => {
  requireAll(gate, "gate", [
    "- truth assignment\n",
    "- automated decision\n",
    "- action authorization\n",
    "- approval\n",
    "- external action\n",
    "- Formal WorkUnit promotion\n",
    "- GraphRAG implementation\n",
    "- LLM judgment\n",
    "- runtime evidence storage\n",
    "- runtime provenance storage\n",
    "- database access\n",
    "- D1 execution\n",
    "- SQL execution\n",
    "- model-confidence shortcut\n",
  ]);
});

test("EVIDENCE_REVIEW_GATE contains all allowed inputs", () => {
  requireAll(gate, "gate", [
    "- valid_query_result_record\n",
    "- tenant_id\n",
    "- source_rule_review_record_id\n",
    "- source_compiled_sql_artifact_id\n",
    "- source_safe_query_plan_id\n",
    "- source_query_intent_id\n",
    "- selected_source_rows\n",
    "- selected_columns\n",
    "- provenance_complete\n",
    "- evidence_eligible\n",
    "- tenant_scope_filter_used\n",
    "- denied_schema_absence\n",
    "- redaction_state\n",
    "- aggregation_method\n",
    "- source_scope\n",
    "- source_trust_marker\n",
    "- conflict_state\n",
    "- result_hash\n",
    "- content_integrity_reference\n",
    "- human_review_required\n",
    "- no_go_flags\n",
  ]);
});

test("EVIDENCE_REVIEW_GATE contains all allowed outputs and the flow", () => {
  requireAll(gate, "gate", [
    "- Evidence Review Record\n",
    "- clarification_needed\n",
    "- No-Go\n",
    "Valid Query Result Record → Lineage and integrity validation → Provenance and source row validation → Redaction / trust / conflict validation → Evidence Review Record or Clarification or No-Go",
  ]);
});

test("EVIDENCE_REVIEW_GATE contains all fixed gate rules", () => {
  requireAll(gate, "gate", [
    "An Evidence Review Record must be non-executing.",
    "An Evidence Review Record must not authorize execution.",
    "An Evidence Review Record must not authorize external action.",
    "An Evidence Review Record must not approve anything.",
    "An Evidence Review Record must not promote a WorkUnit Candidate into a Formal WorkUnit.",
    "An Evidence Review Record must not be treated as truth by default.",
    "A Query Result Record without tenant_id is No-Go.",
    "A Query Result Record without selected_source_rows is No-Go for evidence review.",
    "A Query Result Record without selected_columns is No-Go for evidence review.",
    "A Query Result Record with provenance_complete other than true is No-Go for evidence review.",
    "A Query Result Record with evidence_eligible other than true is No-Go for evidence review.",
    "A Query Result Record with denied schema presence is No-Go.",
    "A Query Result Record with secret_or_token, blocked_input, or unknown_sensitive data is No-Go.",
    "A Query Result Record with unresolved redaction is No-Go or clarification_needed depending on risk.",
    "A Query Result Record with unresolved conflict_state requires human review.",
    "A Query Result Record with unknown source_trust_marker is No-Go or clarification_needed depending on risk.",
    "Model confidence must not be used as evidence.",
    "Model confidence must not be used as truth.",
    "Model confidence must not bypass human review.",
    "Evidence Review pass must not authorize action.",
    "Evidence Review pass must not authorize Formal WorkUnit promotion.",
  ]);
});

test("EVIDENCE_REVIEW_GATE contains pre-review validation requirements", () => {
  requireAll(gate, "gate", [
    "Before an Evidence Review Record can be produced, the gate must validate query result record id, tenant_id, lineage ids, selected_source_rows, selected_columns, provenance_complete, evidence_eligible, tenant_scope_filter_used, denied schema absence, redaction_state, aggregation_method, source_scope, source_trust_marker, conflict_state, result_hash, content_integrity_reference, human_review_required, and no_go_flags.",
  ]);
});

test("EVIDENCE_REVIEW_GATE contains lineage, result hash, and content integrity checks", () => {
  requireAll(gate, "gate", [
    "source_query_intent_id must be present.",
    "source_safe_query_plan_id must be present.",
    "source_compiled_sql_artifact_id must be present.",
    "source_rule_review_record_id must be present.",
    "Lineage mismatch is No-Go.",
    "result_hash is required.",
    "result_hash must be a 64-character lowercase hex SHA-256 string.",
    "content_integrity_reference is required.",
    "content_integrity_reference must use the format sha256:<64 lowercase hex>.",
    "content_integrity_reference mismatch is No-Go.",
    "The Query Result Record must not change between D1 Read-only Execution Gate review and Evidence Review.",
  ]);
});

test("EVIDENCE_REVIEW_GATE contains provenance and source row checks", () => {
  requireAll(gate, "gate", [
    "selected_source_rows is required.",
    "selected_columns is required.",
    "selected_source_rows must identify source table and row reference strategy.",
    "selected_columns must identify source table and column references.",
    "provenance_complete must be true.",
    "evidence_eligible must be true.",
    "A result without source rows is not evidence.",
    "A result without selected columns is not evidence.",
    "A result without provenance is not evidence.",
  ]);
});

test("EVIDENCE_REVIEW_GATE contains tenant scope and denied schema checks", () => {
  requireAll(gate, "gate", [
    "tenant_id is required.",
    "tenant_scope_filter_used is required.",
    "Cross-tenant evidence review is No-Go.",
    "Denied schema presence is No-Go.",
    "secret_or_token data must not pass evidence review.",
    "blocked_input data must not pass evidence review.",
    "unknown_sensitive data must not pass evidence review.",
  ]);
});

test("EVIDENCE_REVIEW_GATE contains redaction, aggregation, and source trust checks", () => {
  requireAll(gate, "gate", [
    "redaction_state is required.",
    "- not_required\n",
    "- redacted\n",
    "- partially_redacted\n",
    "- redaction_required\n",
    "- redaction_unknown\n",
    "- redaction_failed\n",
    "redaction_required, redaction_unknown, and redaction_failed require human review and must not be automatically treated as pass.",
    "aggregation_method is required when result shape is aggregate_result.",
    "source_scope is required for aggregated results.",
    "source_trust_marker is required.",
    "- first_party_system_record\n",
    "- integration_provided_record\n",
    "- user_provided_record\n",
    "- derived_query_result\n",
    "- aggregated_result\n",
    "- unknown_source\n",
    "- untrusted_source\n",
    "unknown_source and untrusted_source must not automatically pass evidence review.",
  ]);
});

test("EVIDENCE_REVIEW_GATE contains conflict state and human review boundary rules", () => {
  requireAll(gate, "gate", [
    "conflict_state is required.",
    "- no_conflict\n",
    "- conflict_detected\n",
    "- unresolved_conflict\n",
    "- source_disagreement\n",
    "- missing_information\n",
    "- unknown\n",
    "A result with conflict_detected, unresolved_conflict, source_disagreement, missing_information, or unknown conflict_state requires human review.",
    "A result must not be treated as truth by default when sources conflict.",
    "human_review_required must be explicit.",
    "Human review must not be bypassed by model confidence.",
  ]);
});

test("EVIDENCE_REVIEW_GATE contains all failure and No-Go conditions", () => {
  requireAll(gate, "gate", [
    "- invalid_query_result_record\n",
    "- missing_tenant_id\n",
    "- missing_lineage_id\n",
    "- lineage_mismatch\n",
    "- missing_selected_source_rows\n",
    "- missing_selected_columns\n",
    "- provenance_incomplete\n",
    "- evidence_eligible_not_true\n",
    "- missing_tenant_scope\n",
    "- cross_tenant_evidence_review\n",
    "- denied_schema_presence\n",
    "- secret_or_token_evidence\n",
    "- blocked_input_evidence\n",
    "- unknown_sensitive_evidence\n",
    "- missing_redaction_state\n",
    "- unresolved_redaction\n",
    "- missing_aggregation_method\n",
    "- missing_source_scope\n",
    "- missing_source_trust_marker\n",
    "- unknown_source_trust\n",
    "- untrusted_source\n",
    "- missing_conflict_state\n",
    "- unresolved_conflict\n",
    "- missing_result_hash\n",
    "- invalid_result_hash\n",
    "- missing_content_integrity_reference\n",
    "- content_integrity_mismatch\n",
    "- no_go_flags_present\n",
    "- model_confidence_as_evidence\n",
    "- evidence_review_as_action_authorization\n",
    "- evidence_review_as_formal_workunit_promotion\n",
  ]);
});

test("EVIDENCE_REVIEW_GATE contains future system rules and the non-authorization statement", () => {
  requireAll(gate, "gate", [
    "Future evidence use requires an Evidence Review Record.",
    "Future GraphRAG may use evidence only after evidence review passes and provenance remains complete.",
    "Future LLM judgment may inspect evidence only after a separate LLM judgment evaluation gate.",
    "Evidence Review Record must not authorize external execution.",
    "Evidence Review Record must not authorize Formal WorkUnit promotion.",
    "This Evidence Review Gate authorizes no truth assignment, no automated decision, no approval, no action authorization, no external action execution, no Formal WorkUnit promotion, no runtime evidence storage, no runtime provenance storage, no GraphRAG implementation, no vectorization, no real LLM enablement, no database access, no D1 execution, no SQL execution, no deployment, and no automated decision-making.",
  ]);
});

test("EVIDENCE_REVIEW_RECORD_CONTRACT contains all required sections", () => {
  requireAll(contract, "contract", [
    "## 1. Purpose",
    "## 2. Scope",
    "## 3. Definition of Evidence Review Record",
    "## 4. What Evidence Review Record Is Not",
    "## 5. Required Fields",
    "## 6. Evidence Review Status",
    "## 7. Evidence Review Outcome Types",
    "## 8. Lineage Fields",
    "## 9. Provenance and Source Fields",
    "## 10. Integrity and Hash Fields",
    "## 11. Redaction and Aggregation Fields",
    "## 12. Source Trust Fields",
    "## 13. Conflict and Human Review Fields",
    "## 14. Evidence Use Boundary",
    "## 15. Validation Rules",
    "## 16. Pass / Warn / Fail / No-Go Outcomes",
    "## 17. Non-authorization Statement",
  ]);
});

test("EVIDENCE_REVIEW_RECORD_CONTRACT contains the record definition sentence and Japanese conceptual sentence", () => {
  requireAll(contract, "contract", [
    "An Evidence Review Record is a non-executing, tenant-scoped review artifact that records whether a Query Result Record satisfies lineage, provenance, source row, source column, redaction, aggregation, source trust, conflict, result hash, content integrity, and human-review requirements before it may support human decision-making as evidence.",
    "Evidence Review Recordとは、Query Result Recordが人間の意思決定を支えるevidenceとして扱われる前に、lineage・provenance・source row・source column・redaction・aggregation・source trust・conflict・result hash・content integrity・human-review requirementsを満たすかを記録する、非実行・tenant-scopedなreview artifactである。",
  ]);
});

test("EVIDENCE_REVIEW_RECORD_CONTRACT contains all not-record items", () => {
  requireAll(contract, "contract", [
    "- truth assignment\n",
    "- automated decision\n",
    "- approval\n",
    "- action authorization\n",
    "- external action\n",
    "- Formal WorkUnit promotion\n",
    "- runtime evidence storage\n",
    "- runtime provenance storage\n",
    "- GraphRAG implementation\n",
    "- LLM judgment\n",
    "- database access\n",
  ]);
});

test("EVIDENCE_REVIEW_RECORD_CONTRACT contains all required fields", () => {
  requireAll(contract, "contract", [
    "- evidence_review_id\n",
    "- tenant_id\n",
    "- source_query_result_record_id\n",
    "- source_rule_review_record_id\n",
    "- source_compiled_sql_artifact_id\n",
    "- source_safe_query_plan_id\n",
    "- source_query_intent_id\n",
    "- related_goal_id\n",
    "- related_workunit_candidate_id\n",
    "- evidence_review_status\n",
    "- evidence_review_outcome\n",
    "- evidence_claim\n",
    "- evidence_type\n",
    "- source_trust_marker\n",
    "- provenance_check_result\n",
    "- lineage_check_result\n",
    "- tenant_scope_check_result\n",
    "- selected_source_rows_check_result\n",
    "- selected_columns_check_result\n",
    "- denied_schema_check_result\n",
    "- redaction_check_result\n",
    "- aggregation_check_result\n",
    "- source_trust_check_result\n",
    "- conflict_check_result\n",
    "- result_hash_check_result\n",
    "- content_integrity_check_result\n",
    "- human_review_required\n",
    "- human_review_reason\n",
    "- decision_impact_scope\n",
    "- allowed_use\n",
    "- disallowed_use\n",
    "- evidence_eligible\n",
    "- evidence_accepted\n",
    "- evidence_rejected_reason\n",
    "- reviewer_context\n",
    "- reviewed_by_system\n",
    "- reviewed_at\n",
    "- no_go_flags\n",
    "- notes\n",
  ]);
});

test("EVIDENCE_REVIEW_RECORD_CONTRACT contains all status values and outcome types", () => {
  requireAll(contract, "contract", [
    "- draft_evidence_review\n",
    "- clarification_needed\n",
    "- blocked_no_go\n",
    "- ready_for_human_evidence_review\n",
    "- pass\n",
    "- warn\n",
    "- fail\n",
    "- no_go\n",
  ]);
});

test("EVIDENCE_REVIEW_RECORD_CONTRACT contains lineage field rules", () => {
  requireAll(contract, "contract", [
    "source_query_result_record_id is required.",
    "source_rule_review_record_id is required.",
    "source_compiled_sql_artifact_id is required.",
    "source_safe_query_plan_id is required.",
    "source_query_intent_id is required.",
    "Lineage mismatch is No-Go.",
  ]);
});

test("EVIDENCE_REVIEW_RECORD_CONTRACT contains provenance and source field rules", () => {
  requireAll(contract, "contract", [
    "provenance_check_result is required.",
    "selected_source_rows_check_result is required.",
    "selected_columns_check_result is required.",
    "tenant_scope_check_result is required.",
    "denied_schema_check_result is required.",
    "A record without selected source rows must not pass.",
    "A record without selected columns must not pass.",
    "A record without complete provenance must not pass.",
  ]);
});

test("EVIDENCE_REVIEW_RECORD_CONTRACT contains integrity and hash field rules", () => {
  requireAll(contract, "contract", [
    "result_hash_check_result is required.",
    "content_integrity_check_result is required.",
    "result_hash must be checked against the Query Result Record.",
    "content_integrity_reference must be checked before pass.",
    "Content integrity mismatch is No-Go.",
  ]);
});

test("EVIDENCE_REVIEW_RECORD_CONTRACT contains redaction and aggregation field rules", () => {
  requireAll(contract, "contract", [
    "redaction_check_result is required.",
    "aggregation_check_result is required.",
    "redaction_state must be reviewed.",
    "aggregation_method must be reviewed when applicable.",
    "source_scope must be reviewed for aggregated results.",
    "- not_required\n",
    "- redacted\n",
    "- partially_redacted\n",
    "- redaction_required\n",
    "- redaction_unknown\n",
    "- redaction_failed\n",
  ]);
});

test("EVIDENCE_REVIEW_RECORD_CONTRACT contains source trust field rules", () => {
  requireAll(contract, "contract", [
    "source_trust_marker is required.",
    "source_trust_check_result is required.",
    "- first_party_system_record\n",
    "- integration_provided_record\n",
    "- user_provided_record\n",
    "- derived_query_result\n",
    "- aggregated_result\n",
    "- unknown_source\n",
    "- untrusted_source\n",
    "unknown_source and untrusted_source must not automatically pass.",
  ]);
});

test("EVIDENCE_REVIEW_RECORD_CONTRACT contains conflict and human review field rules", () => {
  requireAll(contract, "contract", [
    "conflict_check_result is required.",
    "human_review_required is required.",
    "human_review_reason is required when human_review_required is true.",
    "- no_conflict\n",
    "- conflict_detected\n",
    "- unresolved_conflict\n",
    "- source_disagreement\n",
    "- missing_information\n",
    "- unknown\n",
    "Any conflict_state other than no_conflict requires human review.",
    "Evidence must not be treated as truth by default when conflict exists.",
  ]);
});

test("EVIDENCE_REVIEW_RECORD_CONTRACT contains evidence use boundary rules", () => {
  requireAll(contract, "contract", [
    "Evidence Review Record may support human review only.",
    "Evidence Review Record must not authorize action.",
    "Evidence Review Record must not approve external execution.",
    "Evidence Review Record must not promote a WorkUnit Candidate into a Formal WorkUnit.",
    "Evidence Review Record must not allow LLM judgment without a separate future gate.",
    "evidence_accepted must not mean action_authorized.",
  ]);
});

test("EVIDENCE_REVIEW_RECORD_CONTRACT contains validation rules", () => {
  requireAll(contract, "contract", [
    "A valid Evidence Review Record must contain tenant_id.",
    "A valid Evidence Review Record must contain all lineage ids.",
    "A valid Evidence Review Record must contain provenance_check_result.",
    "A valid Evidence Review Record must contain selected_source_rows_check_result.",
    "A valid Evidence Review Record must contain selected_columns_check_result.",
    "A valid Evidence Review Record must contain denied_schema_check_result.",
    "A valid Evidence Review Record must contain redaction_check_result.",
    "A valid Evidence Review Record must contain source_trust_check_result.",
    "A valid Evidence Review Record must contain conflict_check_result.",
    "A valid Evidence Review Record must contain result_hash_check_result.",
    "A valid Evidence Review Record must contain content_integrity_check_result.",
    "A valid Evidence Review Record must not authorize execution.",
    "A valid Evidence Review Record must not authorize Formal WorkUnit promotion.",
  ]);
});

test("EVIDENCE_REVIEW_RECORD_CONTRACT contains Pass / Warn / Fail / No-Go outcome definitions", () => {
  requireAll(contract, "contract", [
    "The Evidence Review Record confirms that the Query Result Record is tenant-scoped, lineage-consistent, provenance-complete, source-row grounded, source-column grounded, denied-schema-safe, redaction-reviewed, source-trust-marked, conflict-explicit, content-integrity-verified, and safe to support human evidence review.",
    "The Evidence Review Record is tenant-scoped and non-authorizing, but clarification, human review, redaction review, source-trust review, or conflict review is needed before confident evidence use.",
    "Required evidence review fields, provenance fields, trust fields, or integrity checks are missing, but no hard safety boundary is crossed.",
    "A hard safety boundary is violated, such as missing tenant scope, lineage mismatch, missing selected source rows, missing selected columns, incomplete provenance, denied schema, secret_or_token result, blocked_input result, unknown_sensitive result, content integrity mismatch, unresolved conflict without human review, model confidence used as evidence, or evidence review treated as action authorization.",
  ]);
});

test("EVIDENCE_REVIEW_RECORD_CONTRACT contains the non-authorization statement", () => {
  requireAll(contract, "contract", [
    "This Evidence Review Record Contract authorizes no truth assignment, no automated decision, no approval, no action authorization, no external action execution, no Formal WorkUnit promotion, no runtime evidence storage, no runtime provenance storage, no GraphRAG implementation, no vectorization, no real LLM enablement, no database access, no D1 execution, no SQL execution, no deployment, and no automated decision-making.",
  ]);
});
