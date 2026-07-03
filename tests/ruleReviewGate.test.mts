import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { test } from "node:test";

const GATE_PATH = "docs/RULE_REVIEW_GATE.md";
const CONTRACT_PATH = "docs/RULE_REVIEW_RECORD_CONTRACT.md";

const gate = existsSync(GATE_PATH) ? readFileSync(GATE_PATH, "utf8") : "";
const contract = existsSync(CONTRACT_PATH) ? readFileSync(CONTRACT_PATH, "utf8") : "";

function requireAll(doc: string, label: string, needles: string[]): void {
  for (const needle of needles) {
    assert.ok(doc.includes(needle), `${label} must contain: ${JSON.stringify(needle)}`);
  }
}

test("P6.10 docs exist", () => {
  assert.ok(existsSync(GATE_PATH), `${GATE_PATH} must exist`);
  assert.ok(existsSync(CONTRACT_PATH), `${CONTRACT_PATH} must exist`);
  assert.ok(gate.length > 0, "gate doc must be non-empty");
  assert.ok(contract.length > 0, "contract doc must be non-empty");
});

test("RULE_REVIEW_GATE contains all required sections", () => {
  requireAll(gate, "gate", [
    "## 1. Purpose",
    "## 2. Scope",
    "## 3. Definition of Rule Review Gate",
    "## 4. What Rule Review Is Not",
    "## 5. Gate Principles",
    "## 6. Allowed Inputs",
    "## 7. Allowed Outputs",
    "## 8. Compiled SQL Artifact to Rule Review Flow",
    "## 9. Pre-review Validation",
    "## 10. Lineage and Consistency Checks",
    "## 11. Tenant Scope and Parameter Binding Checks",
    "## 12. Schema Denylist / Allowlist Checks",
    "## 13. Limit and Cost Checks",
    "## 14. Provenance and Evidence Boundary",
    "## 15. Failure and No-Go Conditions",
    "## 16. Relationship to Future D1 Read-only Execution / GraphRAG / LLM Judgment",
    "## 17. Non-authorization Statement",
  ]);
});

test("RULE_REVIEW_GATE contains the gate definition sentence and Japanese conceptual sentence", () => {
  requireAll(gate, "gate", [
    "The Rule Review Gate allows a valid Compiled SQL Artifact to be reviewed only into a Rule Review Record, clarification_needed, or No-Go, not D1 execution, not SQL execution, and not execution authorization.",
    "Rule Reviewとは実行許可ではない。Compiled SQL Artifactを、将来のD1 read-only execution gateの前に、source Safe Query Plan・Query Intent・schema catalog・parameter binding plan・limits・denied schema・future provenance capture requirementsと照合する、deterministic・provenance-aware・tenant-scopedなレビューである。",
  ]);
});

test("RULE_REVIEW_GATE contains all not-review items", () => {
  requireAll(gate, "gate", [
    "- D1 execution\n",
    "- SQL execution\n",
    "- database access\n",
    "- execution authorization\n",
    "- approval\n",
    "- external action\n",
    "- evidence by itself\n",
    "- provenance record creation\n",
    "- Formal WorkUnit promotion\n",
    "- runtime rule review\n",
    "- runtime approval\n",
    "- human approval replacement\n",
    "- LLM-controlled database access\n",
  ]);
});

test("RULE_REVIEW_GATE contains all allowed inputs", () => {
  requireAll(gate, "gate", [
    "- valid_compiled_sql_artifact\n",
    "- source_safe_query_plan\n",
    "- source_query_intent\n",
    "- tenant_id\n",
    "- tenant_scope_filter\n",
    "- parameter_binding_plan\n",
    "- allowed_tables\n",
    "- allowed_columns\n",
    "- denied_tables\n",
    "- denied_columns\n",
    "- row_limit\n",
    "- time_limit\n",
    "- cost_limit\n",
    "- provenance_capture_plan\n",
    "- evidence_eligibility\n",
    "- human_review_context\n",
  ]);
});

test("RULE_REVIEW_GATE contains all allowed outputs and the flow", () => {
  requireAll(gate, "gate", [
    "- Rule Review Record\n",
    "- clarification_needed\n",
    "- No-Go\n",
    "Valid Compiled SQL Artifact → Lineage and consistency checks → Tenant and parameter checks → Denylist / limit / provenance checks → Rule Review Record or Clarification or No-Go",
  ]);
});

test("RULE_REVIEW_GATE contains all fixed gate rules", () => {
  requireAll(gate, "gate", [
    "A Rule Review Record must be non-executing.",
    "A Rule Review Record must not authorize execution.",
    "A Rule Review Record must not access D1.",
    "A Rule Review Record must not execute SQL.",
    "A Rule Review Record must not query production data.",
    "A Rule Review Record must not be treated as evidence.",
    "A Rule Review Record must not create provenance records.",
    "A Rule Review Record must not promote a WorkUnit Candidate into a Formal WorkUnit.",
    "A Rule Review Record must be produced only from a valid Compiled SQL Artifact.",
    "Rule Review pass must not authorize D1 execution.",
    "A Compiled SQL Artifact without tenant_id is No-Go.",
    "A Compiled SQL Artifact without tenant_scope_filter is No-Go.",
    "A Compiled SQL Artifact with execution_allowed other than false is No-Go.",
    "Cross-tenant rule review is No-Go.",
    "Missing row_limit, time_limit, or cost_limit is Fail or No-Go depending on risk.",
    "Denied tables and denied columns must override allowed tables and columns.",
    "secret_or_token, blocked_input, and unknown_sensitive data must not pass rule review.",
    "Model confidence must not be used as review evidence.",
    "Model confidence must not be used as permission to pass rule review.",
  ]);
});

test("RULE_REVIEW_GATE contains pre-review validation requirements", () => {
  requireAll(gate, "gate", [
    "Before a Rule Review Record can be produced, the Compiled SQL Artifact must be validated for non-executed status, read-only operation shape, tenant_id, tenant_scope_filter, parameter_binding_plan, denied schema preservation, source_safe_query_plan_id, source_query_intent_id, row_limit, time_limit, cost_limit, provenance_capture_plan, evidence_eligibility, and execution_allowed=false.",
  ]);
});

test("RULE_REVIEW_GATE contains lineage and consistency checks", () => {
  requireAll(gate, "gate", [
    "Lineage mismatch between Query Intent, Safe Query Plan, and Compiled SQL Artifact is No-Go.",
    "Missing source_safe_query_plan_id is No-Go.",
    "Missing source_query_intent_id is No-Go.",
    "source_query_intent_id must match the Query Intent lineage.",
    "source_safe_query_plan_id must match the Safe Query Plan lineage.",
    "The Compiled SQL Artifact must be derived from the referenced Safe Query Plan.",
    "The Safe Query Plan must be derived from the referenced Query Intent.",
    "operation_shape must be consistent with the source Safe Query Plan operation_type.",
    "allowed_tables and allowed_columns must be consistent across source artifacts.",
    "denied_tables and denied_columns must be preserved across source artifacts.",
    "unsupported_assumptions and no_go_flags must not be silently dropped.",
  ]);
});

test("RULE_REVIEW_GATE contains tenant scope and parameter binding checks", () => {
  requireAll(gate, "gate", [
    "tenant_id is required.",
    "tenant_scope_filter is required.",
    "tenant_id must be bound as a parameter.",
    "All user-controlled values must be represented as bound parameters.",
    "No user-controlled value may be interpolated into SQL text.",
    "String interpolation is No-Go.",
    "String concatenation for SQL construction is No-Go.",
    "Missing parameter_binding_plan is No-Go.",
  ]);
});

test("RULE_REVIEW_GATE contains schema denylist / allowlist checks", () => {
  requireAll(gate, "gate", [
    "Only allowlisted tables and columns may appear in the compiled artifact.",
    "Denied tables and denied columns must not appear in the compiled artifact.",
    "Denied tables and denied columns must override allowlists.",
    "Unknown schema must produce clarification_needed or No-Go.",
  ]);
});

test("RULE_REVIEW_GATE contains limit and cost checks", () => {
  requireAll(gate, "gate", [
    "row_limit is required.",
    "time_limit is required.",
    "cost_limit is required.",
    "Rule Review must preserve row_limit, time_limit, and cost_limit.",
    "Missing limits are Fail or No-Go depending on risk",
  ]);
});

test("RULE_REVIEW_GATE contains provenance and evidence boundary rules", () => {
  requireAll(gate, "gate", [
    "Rule Review Record is not evidence.",
    "Rule Review Record may describe future provenance capture, but it must not create provenance records.",
    "Future query results are not evidence unless query plan, compiled artifact, rule review record, tenant scope, selected source rows, and result provenance are recorded.",
  ]);
});

test("RULE_REVIEW_GATE contains all failure and No-Go conditions", () => {
  requireAll(gate, "gate", [
    "- invalid_compiled_sql_artifact\n",
    "- missing_tenant_id\n",
    "- missing_tenant_scope_filter\n",
    "- execution_allowed_not_false\n",
    "- cross_tenant_rule_review\n",
    "- missing_source_query_intent_id\n",
    "- missing_source_safe_query_plan_id\n",
    "- lineage_mismatch\n",
    "- missing_parameter_binding_plan\n",
    "- string_interpolation\n",
    "- string_concatenation\n",
    "- denied_schema_reference\n",
    "- secret_or_token_review\n",
    "- blocked_input_review\n",
    "- unknown_sensitive_review\n",
    "- missing_limits\n",
    "- missing_provenance_capture_plan\n",
    "- rule_review_as_evidence\n",
    "- rule_review_as_execution_authorization\n",
    "- direct_database_access\n",
  ]);
});

test("RULE_REVIEW_GATE contains future system rules and the non-authorization statement", () => {
  requireAll(gate, "gate", [
    "Future D1 read-only execution requires a separate D1 read-only execution gate.",
    "Future D1 execution must verify rule review record id, compiled artifact id, safe query plan id, query intent id, tenant scope, parameters, limits, denied schema absence, and provenance capture plan.",
    "Future GraphRAG may use query results only after provenance is restored.",
    "Future LLM judgment may inspect query results only after a separate LLM judgment evaluation gate.",
    "A Rule Review Record must not authorize D1 execution.",
    "A Rule Review Record must not authorize external execution.",
    "This Rule Review Gate authorizes no D1 execution, no SQL execution, no database access, no execution authorization, no approval, no runtime rule review, no runtime approval, no provenance record creation, no GraphRAG implementation, no vectorization, no real LLM enablement, no external execution, no Formal WorkUnit promotion, and no automated decision-making.",
  ]);
});

test("RULE_REVIEW_RECORD_CONTRACT contains all required sections", () => {
  requireAll(contract, "contract", [
    "## 1. Purpose",
    "## 2. Scope",
    "## 3. Definition of Rule Review Record",
    "## 4. What Rule Review Record Is Not",
    "## 5. Required Fields",
    "## 6. Review Status",
    "## 7. Review Outcome Types",
    "## 8. Lineage Fields",
    "## 9. Tenant Scope Fields",
    "## 10. Parameter Binding Review Fields",
    "## 11. Schema Review Fields",
    "## 12. Limit and Cost Review Fields",
    "## 13. Provenance Review Fields",
    "## 14. Evidence Boundary and Human Review Requirements",
    "## 15. Validation Rules",
    "## 16. Pass / Warn / Fail / No-Go Outcomes",
    "## 17. Non-authorization Statement",
  ]);
});

test("RULE_REVIEW_RECORD_CONTRACT contains the record definition sentence and Japanese conceptual sentence", () => {
  requireAll(contract, "contract", [
    "A Rule Review Record is a non-executing, tenant-scoped review artifact that records whether a Compiled SQL Artifact satisfies lineage, parameter binding, denylist, limit, and provenance requirements before any future D1 read-only execution gate.",
    "Rule Review Recordとは、将来のD1 read-only execution gateの前に、Compiled SQL Artifactがlineage・parameter binding・denylist・limit・provenance requirementsを満たすかを記録する、非実行・tenant-scopedなreview artifactである。",
  ]);
});

test("RULE_REVIEW_RECORD_CONTRACT contains all not-record items", () => {
  requireAll(contract, "contract", [
    "- D1 execution\n",
    "- SQL execution\n",
    "- database access\n",
    "- approval\n",
    "- execution authorization\n",
    "- evidence\n",
    "- provenance record\n",
    "- Formal WorkUnit promotion\n",
    "- human approval replacement\n",
    "- external action\n",
  ]);
});

test("RULE_REVIEW_RECORD_CONTRACT contains all required fields", () => {
  requireAll(contract, "contract", [
    "- review_id\n",
    "- tenant_id\n",
    "- source_compiled_sql_artifact_id\n",
    "- source_safe_query_plan_id\n",
    "- source_query_intent_id\n",
    "- related_goal_id\n",
    "- related_workunit_candidate_id\n",
    "- review_status\n",
    "- review_outcome\n",
    "- lineage_check_result\n",
    "- tenant_scope_check_result\n",
    "- parameter_binding_check_result\n",
    "- schema_allowlist_check_result\n",
    "- schema_denylist_check_result\n",
    "- limit_check_result\n",
    "- cost_check_result\n",
    "- provenance_capture_check_result\n",
    "- evidence_boundary_check_result\n",
    "- human_review_required\n",
    "- execution_allowed\n",
    "- reviewed_by_system\n",
    "- reviewed_at\n",
    "- unsupported_assumptions\n",
    "- no_go_flags\n",
    "- notes\n",
  ]);
});

test("RULE_REVIEW_RECORD_CONTRACT contains all review status values and review outcome types", () => {
  requireAll(contract, "contract", [
    "- draft_review\n",
    "- clarification_needed\n",
    "- blocked_no_go\n",
    "- ready_for_future_execution_gate_review\n",
    "- pass\n",
    "- warn\n",
    "- fail\n",
    "- no_go\n",
  ]);
});

test("RULE_REVIEW_RECORD_CONTRACT contains lineage field rules", () => {
  requireAll(contract, "contract", [
    "source_compiled_sql_artifact_id is required.",
    "source_safe_query_plan_id is required.",
    "source_query_intent_id is required.",
    "Lineage mismatch is No-Go.",
    "A Rule Review Record must not silently drop unsupported_assumptions or no_go_flags from source artifacts.",
  ]);
});

test("RULE_REVIEW_RECORD_CONTRACT contains tenant scope rules", () => {
  requireAll(contract, "contract", [
    "tenant_id is required.",
    "tenant_scope_check_result is required.",
    "Tenant scope must be enforceable by rules outside the LLM.",
    "A Rule Review Record without tenant_id is No-Go.",
    "A Rule Review Record must not allow cross-tenant execution.",
  ]);
});

test("RULE_REVIEW_RECORD_CONTRACT contains parameter binding review rules", () => {
  requireAll(contract, "contract", [
    "parameter_binding_check_result is required.",
    "tenant_id must be bound as a parameter.",
    "All user-controlled values must be represented as bound parameters.",
    "String interpolation is No-Go.",
    "String concatenation for SQL construction is No-Go.",
  ]);
});

test("RULE_REVIEW_RECORD_CONTRACT contains schema review rules", () => {
  requireAll(contract, "contract", [
    "schema_allowlist_check_result is required.",
    "schema_denylist_check_result is required.",
    "Denied tables and denied columns must override allowed tables and columns.",
    "secret_or_token, blocked_input, and unknown_sensitive data must fail review.",
    "Unknown schema must produce clarification_needed or No-Go.",
  ]);
});

test("RULE_REVIEW_RECORD_CONTRACT contains limit and cost review rules", () => {
  requireAll(contract, "contract", [
    "limit_check_result is required.",
    "cost_check_result is required.",
    "row_limit, time_limit, and cost_limit must be preserved from the compiled artifact.",
    "Missing limits are Fail or No-Go depending on risk.",
  ]);
});

test("RULE_REVIEW_RECORD_CONTRACT contains provenance review rules", () => {
  requireAll(contract, "contract", [
    "provenance_capture_check_result is required.",
    "provenance_capture_plan must be present before future D1 execution.",
    "Rule Review Record may describe future provenance capture, but it must not create provenance records.",
  ]);
});

test("RULE_REVIEW_RECORD_CONTRACT contains evidence boundary and human review rules", () => {
  requireAll(contract, "contract", [
    "Rule Review Record is not evidence.",
    "Rule Review Record must not be treated as evidence.",
    "Rule Review Record must not authorize execution.",
    "execution_allowed must be false in this phase.",
    "human_review_required must be explicit.",
    "Human review is required when review_outcome is warn, fail, or no_go.",
  ]);
});

test("RULE_REVIEW_RECORD_CONTRACT contains validation rules", () => {
  requireAll(contract, "contract", [
    "A valid Rule Review Record must be non-executing.",
    "A valid Rule Review Record must contain tenant_id.",
    "A valid Rule Review Record must contain source_compiled_sql_artifact_id.",
    "A valid Rule Review Record must contain source_safe_query_plan_id.",
    "A valid Rule Review Record must contain source_query_intent_id.",
    "A valid Rule Review Record must preserve unsupported_assumptions and no_go_flags.",
    "A valid Rule Review Record must include lineage_check_result.",
    "A valid Rule Review Record must include parameter_binding_check_result.",
    "A valid Rule Review Record must include schema_allowlist_check_result.",
    "A valid Rule Review Record must include schema_denylist_check_result.",
    "A valid Rule Review Record must include limit_check_result.",
    "A valid Rule Review Record must include provenance_capture_check_result.",
    "A valid Rule Review Record must not authorize execution.",
  ]);
});

test("RULE_REVIEW_RECORD_CONTRACT contains Pass / Warn / Fail / No-Go outcome definitions", () => {
  requireAll(contract, "contract", [
    "The Rule Review Record confirms that the Compiled SQL Artifact is non-executing, tenant-scoped, lineage-consistent, parameterized, denylist-safe, limit-preserving, provenance-planned, and safe for future D1 read-only execution gate review.",
    "The Rule Review Record is non-executing and tenant-scoped, but clarification, human review, or quality improvement is needed before future execution-gate review.",
    "Required review fields or consistency checks are missing, but no hard safety boundary is crossed.",
    "A hard safety boundary is violated, such as D1 access, SQL execution, missing tenant scope, cross-tenant review, lineage mismatch, denied schema reference, string interpolation, string concatenation, secret_or_token request, blocked_input request, unknown_sensitive request, or execution authorization.",
  ]);
});

test("RULE_REVIEW_RECORD_CONTRACT contains the non-authorization statement", () => {
  requireAll(contract, "contract", [
    "This Rule Review Record Contract authorizes no D1 execution, no SQL execution, no database access, no approval, no execution authorization, no runtime rule review, no runtime approval, no provenance record creation, no GraphRAG implementation, no vectorization, no real LLM enablement, no external execution, no Formal WorkUnit promotion, and no automated decision-making.",
  ]);
});
