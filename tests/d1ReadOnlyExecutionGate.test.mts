import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { test } from "node:test";

const GATE_PATH = "docs/D1_READ_ONLY_EXECUTION_GATE.md";
const CONTRACT_PATH = "docs/QUERY_RESULT_RECORD_CONTRACT.md";

const gate = existsSync(GATE_PATH) ? readFileSync(GATE_PATH, "utf8") : "";
const contract = existsSync(CONTRACT_PATH) ? readFileSync(CONTRACT_PATH, "utf8") : "";

function requireAll(doc: string, label: string, needles: string[]): void {
  for (const needle of needles) {
    assert.ok(doc.includes(needle), `${label} must contain: ${JSON.stringify(needle)}`);
  }
}

test("P6.11 docs exist", () => {
  assert.ok(existsSync(GATE_PATH), `${GATE_PATH} must exist`);
  assert.ok(existsSync(CONTRACT_PATH), `${CONTRACT_PATH} must exist`);
  assert.ok(gate.length > 0, "gate doc must be non-empty");
  assert.ok(contract.length > 0, "contract doc must be non-empty");
});

test("D1_READ_ONLY_EXECUTION_GATE contains all required sections", () => {
  requireAll(gate, "gate", [
    "## 1. Purpose",
    "## 2. Scope",
    "## 3. Definition of D1 Read-only Execution Gate",
    "## 4. What D1 Read-only Execution Is Not",
    "## 5. Gate Principles",
    "## 6. Allowed Inputs",
    "## 7. Allowed Outputs",
    "## 8. Rule Review Record to Query Result Flow",
    "## 9. Pre-execution Validation",
    "## 10. Lineage, Immutability, and Content Integrity Checks",
    "## 11. Tenant Scope and Parameter Binding Checks",
    "## 12. Read-only and Denied Operation Checks",
    "## 13. Limit, Cost, and Result Shape Checks",
    "## 14. Provenance Capture and Evidence Eligibility Boundary",
    "## 15. Failure and No-Go Conditions",
    "## 16. Relationship to Future Evidence Use / GraphRAG / LLM Judgment",
    "## 17. Non-authorization Statement",
  ]);
});

test("D1_READ_ONLY_EXECUTION_GATE contains the gate definition sentence and Japanese conceptual sentence", () => {
  requireAll(gate, "gate", [
    "The D1 Read-only Execution Gate allows a valid Rule Review Record to be used only by a future-gated read-only execution process to produce a provenance-bearing Query Result Record, clarification_needed, or No-Go, not open database access and not unrestricted SQL execution.",
    "D1 Read-only Executionとは自由なDBアクセスではない。Rule Review・lineage・immutability・limits・denied schema absence・human-review requirements・provenance capture requirementsを検証した後にのみ、tenant-scoped・parameter-bound・read-onlyな実行として、provenance-bearingなQuery Result Recordを生成しうるfuture-gated stepである。",
  ]);
});

test("D1_READ_ONLY_EXECUTION_GATE contains all not-execution items", () => {
  requireAll(gate, "gate", [
    "- open database access\n",
    "- unrestricted SQL execution\n",
    "- mutation execution\n",
    "- free-form SQL execution\n",
    "- LLM-controlled database access\n",
    "- external action\n",
    "- approval\n",
    "- execution authorization by itself\n",
    "- evidence by itself\n",
    "- provenance guarantee by itself\n",
    "- GraphRAG implementation\n",
    "- LLM judgment\n",
    "- Formal WorkUnit promotion\n",
  ]);
});

test("D1_READ_ONLY_EXECUTION_GATE contains all allowed inputs", () => {
  requireAll(gate, "gate", [
    "- valid_rule_review_record\n",
    "- source_compiled_sql_artifact\n",
    "- source_safe_query_plan\n",
    "- source_query_intent\n",
    "- tenant_id\n",
    "- tenant_scope_filter\n",
    "- parameter_binding_plan\n",
    "- row_limit\n",
    "- time_limit\n",
    "- cost_limit\n",
    "- expected_result_shape\n",
    "- provenance_capture_plan\n",
    "- evidence_eligibility\n",
    "- human_review_required\n",
    "- review_outcome\n",
    "- content_integrity_reference\n",
    "- rule_set_version\n",
  ]);
});

test("D1_READ_ONLY_EXECUTION_GATE contains all allowed outputs and the flow", () => {
  requireAll(gate, "gate", [
    "- Query Result Record\n",
    "- clarification_needed\n",
    "- No-Go\n",
    "Valid Rule Review Record → Lineage and integrity validation → Tenant and parameter binding validation → Read-only / limit / denied schema validation → Future read-only execution → Query Result Record or Clarification or No-Go",
  ]);
});

test("D1_READ_ONLY_EXECUTION_GATE contains all fixed gate rules", () => {
  requireAll(gate, "gate", [
    "A Query Result Record must be tenant-scoped.",
    "A Query Result Record must be provenance-bearing.",
    "A Query Result Record must not authorize execution.",
    "A Query Result Record must not authorize external action.",
    "A Query Result Record must not promote a WorkUnit Candidate into a Formal WorkUnit.",
    "A Query Result Record must not be treated as evidence unless evidence eligibility and provenance requirements are satisfied.",
    "A Rule Review Record without tenant_id is No-Go.",
    "A Rule Review Record without source_compiled_sql_artifact_id is No-Go.",
    "A Rule Review Record without source_safe_query_plan_id is No-Go.",
    "A Rule Review Record without source_query_intent_id is No-Go.",
    "A Rule Review Record with execution_allowed other than false is No-Go.",
    "A Rule Review Record with review_outcome other than pass is No-Go for execution-gate entry.",
    "A Rule Review Record with human_review_required true must require recorded human decision before any future execution gate.",
    "Cross-tenant D1 execution is No-Go.",
    "Missing rule_set_version is No-Go.",
    "Missing parameter_binding_plan is No-Go.",
    "Missing tenant_scope_filter is No-Go.",
    "Missing row_limit, time_limit, or cost_limit is No-Go.",
    "Denied schema presence is No-Go.",
    "secret_or_token, blocked_input, and unknown_sensitive data must not be executed against.",
    "Free-form SQL execution is No-Go.",
    "LLM-generated raw SQL execution is No-Go.",
    "String interpolation is No-Go.",
    "String concatenation for SQL construction is No-Go.",
    "Model confidence must not be used as permission to execute.",
  ]);
});

test("D1_READ_ONLY_EXECUTION_GATE contains pre-execution validation requirements", () => {
  requireAll(gate, "gate", [
    "Before a Query Result Record can be produced, the future D1 read-only execution gate must validate rule review record id, compiled artifact id, safe query plan id, query intent id, tenant_id, tenant_scope_filter, parameter_binding_plan, row_limit, time_limit, cost_limit, denied schema absence, review_outcome, human_review_required, content integrity, rule_set_version, and provenance_capture_plan.",
  ]);
});

test("D1_READ_ONLY_EXECUTION_GATE contains lineage, immutability, and content integrity checks", () => {
  requireAll(gate, "gate", [
    "The Rule Review Record must reference the Compiled SQL Artifact.",
    "The Compiled SQL Artifact must reference the Safe Query Plan.",
    "The Safe Query Plan must reference the Query Intent.",
    "The artifact content must match the content_integrity_reference.",
    "The source artifacts must not change between rule review and future execution.",
    "The rule_set_version used for review must be recorded.",
    "Lineage mismatch is No-Go.",
    "Content integrity mismatch is No-Go.",
  ]);
});

test("D1_READ_ONLY_EXECUTION_GATE contains tenant scope and parameter binding checks", () => {
  requireAll(gate, "gate", [
    "tenant_id is required.",
    "tenant_scope_filter is required.",
    "tenant_id must be bound as a parameter.",
    "All user-controlled values must be represented as bound parameters.",
    "No user-controlled value may be interpolated into SQL text.",
    "Parameter binding must match the compiled artifact and rule review record.",
  ]);
});

test("D1_READ_ONLY_EXECUTION_GATE contains read-only and denied operation checks", () => {
  requireAll(gate, "gate", [
    "Only read-only selected operation shapes may be eligible.",
    "Mutation operations are No-Go.",
    "INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, REPLACE, UPSERT, PRAGMA, ATTACH, DETACH, and VACUUM are No-Go.",
    "Denied tables and denied columns must not appear.",
    "Denied schema absence must be verified before future execution.",
  ]);
});

test("D1_READ_ONLY_EXECUTION_GATE contains limit, cost, and result shape checks", () => {
  requireAll(gate, "gate", [
    "row_limit is required.",
    "time_limit is required.",
    "cost_limit is required.",
    "expected_result_shape is required.",
    "Result size must be constrained by row_limit.",
    "Execution cost must be constrained by cost_limit.",
    "Timeout behavior must be defined by time_limit.",
  ]);
});

test("D1_READ_ONLY_EXECUTION_GATE contains provenance capture and evidence eligibility boundary rules", () => {
  requireAll(gate, "gate", [
    "Query Result Record may become evidence only when provenance is complete.",
    "Query Result Record must record query plan id, compiled artifact id, rule review record id, tenant id, selected source rows, selected columns, obtained_at, redaction state, aggregation method when applicable, and result hash.",
    "A query result with unknown tenant scope is No-Go.",
    "A query result without selected source rows is not evidence.",
    "A query result without provenance capture is not evidence.",
    "A query result from denied schema is No-Go.",
    "A query result must not be treated as truth by default when source rows conflict.",
  ]);
});

test("D1_READ_ONLY_EXECUTION_GATE contains all failure and No-Go conditions", () => {
  requireAll(gate, "gate", [
    "- invalid_rule_review_record\n",
    "- missing_tenant_id\n",
    "- missing_tenant_scope_filter\n",
    "- missing_source_query_intent_id\n",
    "- missing_source_safe_query_plan_id\n",
    "- missing_source_compiled_sql_artifact_id\n",
    "- execution_allowed_not_false\n",
    "- review_outcome_not_pass\n",
    "- missing_required_human_decision\n",
    "- cross_tenant_execution\n",
    "- lineage_mismatch\n",
    "- content_integrity_mismatch\n",
    "- missing_rule_set_version\n",
    "- missing_parameter_binding_plan\n",
    "- missing_limits\n",
    "- denied_schema_presence\n",
    "- secret_or_token_execution\n",
    "- blocked_input_execution\n",
    "- unknown_sensitive_execution\n",
    "- mutation_operation\n",
    "- free_form_sql_execution\n",
    "- raw_llm_sql_execution\n",
    "- string_interpolation\n",
    "- string_concatenation\n",
    "- missing_provenance_capture_plan\n",
    "- query_result_as_evidence_without_provenance\n",
    "- direct_unscoped_database_access\n",
  ]);
});

test("D1_READ_ONLY_EXECUTION_GATE contains future system rules and the non-authorization statement", () => {
  requireAll(gate, "gate", [
    "Future evidence use requires complete provenance and human-review compatibility.",
    "Future GraphRAG may use query results only after provenance is restored and evidence eligibility is satisfied.",
    "Future LLM judgment may inspect query results only after a separate LLM judgment evaluation gate.",
    "A Query Result Record must not authorize external execution.",
    "A Query Result Record must not authorize Formal WorkUnit promotion.",
    "This D1 Read-only Execution Gate authorizes no runtime D1 execution, no unrestricted SQL execution, no mutation execution, no open database access, no free-form SQL execution, no LLM-controlled database access, no external execution, no approval, no GraphRAG implementation, no vectorization, no real LLM enablement, no Formal WorkUnit promotion, and no automated decision-making.",
  ]);
});

test("QUERY_RESULT_RECORD_CONTRACT contains all required sections", () => {
  requireAll(contract, "contract", [
    "## 1. Purpose",
    "## 2. Scope",
    "## 3. Definition of Query Result Record",
    "## 4. What Query Result Record Is Not",
    "## 5. Required Fields",
    "## 6. Result Status",
    "## 7. Result Shape",
    "## 8. Lineage Fields",
    "## 9. Tenant Scope Fields",
    "## 10. Source Row and Column Provenance Fields",
    "## 11. Parameter and Limit Fields",
    "## 12. Redaction and Aggregation Fields",
    "## 13. Evidence Eligibility Fields",
    "## 14. Human Review and Conflict Handling Requirements",
    "## 15. Validation Rules",
    "## 16. Pass / Warn / Fail / No-Go Outcomes",
    "## 17. Non-authorization Statement",
  ]);
});

test("QUERY_RESULT_RECORD_CONTRACT contains the record definition sentence and Japanese conceptual sentence", () => {
  requireAll(contract, "contract", [
    "A Query Result Record is a tenant-scoped, provenance-bearing record of a future read-only D1 query result, including lineage, selected source rows, selected columns, parameter bindings, limits, redaction state, aggregation details, obtained_at, and result hash.",
    "Query Result Recordとは、将来のread-only D1 query resultについて、lineage・selected source rows・selected columns・parameter bindings・limits・redaction state・aggregation details・obtained_at・result hashを含む、tenant-scoped・provenance-bearingな記録である。",
  ]);
});

test("QUERY_RESULT_RECORD_CONTRACT contains all not-record items", () => {
  requireAll(contract, "contract", [
    "- open database access\n",
    "- unrestricted SQL execution\n",
    "- mutation execution\n",
    "- evidence by default\n",
    "- truth by default\n",
    "- approval\n",
    "- execution authorization\n",
    "- external action\n",
    "- Formal WorkUnit promotion\n",
    "- GraphRAG implementation\n",
    "- LLM judgment\n",
  ]);
});

test("QUERY_RESULT_RECORD_CONTRACT contains all required fields", () => {
  requireAll(contract, "contract", [
    "- result_id\n",
    "- tenant_id\n",
    "- source_rule_review_record_id\n",
    "- source_compiled_sql_artifact_id\n",
    "- source_safe_query_plan_id\n",
    "- source_query_intent_id\n",
    "- related_goal_id\n",
    "- related_workunit_candidate_id\n",
    "- result_status\n",
    "- result_shape\n",
    "- selected_source_rows\n",
    "- selected_columns\n",
    "- parameter_bindings_used\n",
    "- tenant_scope_filter_used\n",
    "- row_limit_used\n",
    "- time_limit_used\n",
    "- cost_limit_used\n",
    "- redaction_state\n",
    "- aggregation_method\n",
    "- source_scope\n",
    "- obtained_at\n",
    "- result_hash\n",
    "- provenance_complete\n",
    "- evidence_eligible\n",
    "- conflict_state\n",
    "- human_review_required\n",
    "- execution_authorized\n",
    "- created_by_system\n",
    "- created_at\n",
    "- no_go_flags\n",
    "- notes\n",
  ]);
});

test("QUERY_RESULT_RECORD_CONTRACT contains all result status values and result shape values", () => {
  requireAll(contract, "contract", [
    "- draft_result_record\n",
    "- provenance_incomplete\n",
    "- blocked_no_go\n",
    "- ready_for_evidence_review\n",
    "- row_set\n",
    "- aggregate_result\n",
    "- count_result\n",
    "- existence_result\n",
    "- relationship_result\n",
    "- provenance_result\n",
    "- evidence_result\n",
  ]);
});

test("QUERY_RESULT_RECORD_CONTRACT contains lineage field rules", () => {
  requireAll(contract, "contract", [
    "source_rule_review_record_id is required.",
    "source_compiled_sql_artifact_id is required.",
    "source_safe_query_plan_id is required.",
    "source_query_intent_id is required.",
    "Lineage mismatch is No-Go.",
  ]);
});

test("QUERY_RESULT_RECORD_CONTRACT contains tenant scope rules", () => {
  requireAll(contract, "contract", [
    "tenant_id is required.",
    "tenant_scope_filter_used is required.",
    "A Query Result Record without tenant_id is No-Go.",
    "A Query Result Record without tenant_scope_filter_used is No-Go.",
    "A Query Result Record must not cross tenant boundaries.",
  ]);
});

test("QUERY_RESULT_RECORD_CONTRACT contains source row and column provenance field rules", () => {
  requireAll(contract, "contract", [
    "selected_source_rows is required.",
    "selected_columns is required.",
    "selected_source_rows must identify source table and row reference strategy.",
    "selected_columns must identify source table and column references.",
    "A Query Result Record without selected_source_rows is not evidence.",
    "A Query Result Record without selected_columns is not evidence.",
  ]);
});

test("QUERY_RESULT_RECORD_CONTRACT contains parameter and limit field rules", () => {
  requireAll(contract, "contract", [
    "parameter_bindings_used is required.",
    "row_limit_used is required.",
    "time_limit_used is required.",
    "cost_limit_used is required.",
    "parameter_bindings_used must match the Compiled SQL Artifact and Rule Review Record.",
  ]);
});

test("QUERY_RESULT_RECORD_CONTRACT contains redaction and aggregation field rules", () => {
  requireAll(contract, "contract", [
    "redaction_state is required.",
    "aggregation_method is required when result_shape is aggregate_result.",
    "source_scope is required for aggregated results.",
    "personal_data must preserve redaction state.",
    "secret_or_token, blocked_input, and unknown_sensitive data must not appear.",
  ]);
});

test("QUERY_RESULT_RECORD_CONTRACT contains evidence eligibility rules", () => {
  requireAll(contract, "contract", [
    "provenance_complete is required.",
    "evidence_eligible is required.",
    "Query Result Record is not evidence by default.",
    "Query Result Record may become evidence only when provenance_complete is true, evidence_eligible is true, tenant scope is known, selected source rows are recorded, selected columns are recorded, denied schema is absent, and human-review requirements are satisfied.",
  ]);
});

test("QUERY_RESULT_RECORD_CONTRACT contains human review and conflict handling requirements", () => {
  requireAll(contract, "contract", [
    "human_review_required must be explicit.",
    "Human review is required when query results affect priority, risk, action readiness, external-action preview, human-review requirement, or promotion readiness.",
    "Human review is required when sensitive data, personal data, redaction, aggregation, contradiction, conflict, or missing information is involved.",
    "A Query Result Record must not be treated as truth by default when source rows conflict.",
    "conflict_state must be explicit.",
  ]);
});

test("QUERY_RESULT_RECORD_CONTRACT contains validation rules", () => {
  requireAll(contract, "contract", [
    "A valid Query Result Record must contain tenant_id.",
    "A valid Query Result Record must contain all lineage ids.",
    "A valid Query Result Record must contain selected_source_rows.",
    "A valid Query Result Record must contain selected_columns.",
    "A valid Query Result Record must contain parameter_bindings_used.",
    "A valid Query Result Record must contain row_limit_used, time_limit_used, and cost_limit_used.",
    "A valid Query Result Record must contain redaction_state.",
    "A valid Query Result Record must contain obtained_at.",
    "A valid Query Result Record must contain result_hash.",
    "A valid Query Result Record must not include denied schema.",
    "A valid Query Result Record must not include secret_or_token, blocked_input, or unknown_sensitive data.",
    "A valid Query Result Record must not authorize execution.",
    "execution_authorized must be false in this phase.",
  ]);
});

test("QUERY_RESULT_RECORD_CONTRACT contains Pass / Warn / Fail / No-Go outcome definitions", () => {
  requireAll(contract, "contract", [
    "The Query Result Record is tenant-scoped, lineage-consistent, provenance-complete, limit-preserving, redaction-aware, conflict-explicit, and safe for future evidence review.",
    "The Query Result Record is tenant-scoped and non-authorizing, but clarification, human review, redaction review, or quality improvement is needed before future evidence review.",
    "Required result fields, provenance fields, or review requirements are missing, but no hard safety boundary is crossed.",
    "A hard safety boundary is violated, such as open database access, mutation execution, missing tenant scope, cross-tenant result, lineage mismatch, missing source rows, missing provenance, denied schema result, secret_or_token result, blocked_input result, unknown_sensitive result, or execution authorization.",
  ]);
});

test("QUERY_RESULT_RECORD_CONTRACT contains the non-authorization statement", () => {
  requireAll(contract, "contract", [
    "This Query Result Record Contract authorizes no D1 execution, no SQL execution, no mutation execution, no open database access, no approval, no execution authorization, no external action, no GraphRAG implementation, no vectorization, no real LLM enablement, no Formal WorkUnit promotion, and no automated decision-making.",
  ]);
});
