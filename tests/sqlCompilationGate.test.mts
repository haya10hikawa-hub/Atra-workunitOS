import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { test } from "node:test";

const GATE_PATH = "docs/SQL_COMPILATION_GATE.md";
const CONTRACT_PATH = "docs/COMPILED_SQL_ARTIFACT_CONTRACT.md";

const gate = existsSync(GATE_PATH) ? readFileSync(GATE_PATH, "utf8") : "";
const contract = existsSync(CONTRACT_PATH) ? readFileSync(CONTRACT_PATH, "utf8") : "";

function requireAll(doc: string, label: string, needles: string[]): void {
  for (const needle of needles) {
    assert.ok(doc.includes(needle), `${label} must contain: ${JSON.stringify(needle)}`);
  }
}

test("P6.9 docs exist", () => {
  assert.ok(existsSync(GATE_PATH), `${GATE_PATH} must exist`);
  assert.ok(existsSync(CONTRACT_PATH), `${CONTRACT_PATH} must exist`);
  assert.ok(gate.length > 0, "gate doc must be non-empty");
  assert.ok(contract.length > 0, "contract doc must be non-empty");
});

test("SQL_COMPILATION_GATE contains all required sections", () => {
  requireAll(gate, "gate", [
    "## 1. Purpose",
    "## 2. Scope",
    "## 3. Definition of SQL Compilation Gate",
    "## 4. What SQL Compilation Is Not",
    "## 5. Gate Principles",
    "## 6. Allowed Inputs",
    "## 7. Allowed Outputs",
    "## 8. Safe Query Plan to Compiled SQL Flow",
    "## 9. Pre-compilation Validation",
    "## 10. Read-only Operation Enforcement",
    "## 11. Tenant Scope and Parameter Binding",
    "## 12. Schema Allowlist and Denylist Enforcement",
    "## 13. Limit and Cost Enforcement",
    "## 14. Provenance and Evidence Boundary",
    "## 15. Failure and No-Go Conditions",
    "## 16. Relationship to Future D1 Read-only Execution / GraphRAG / LLM Judgment",
    "## 17. Non-authorization Statement",
  ]);
});

test("SQL_COMPILATION_GATE contains the gate definition sentence and Japanese conceptual sentence", () => {
  requireAll(gate, "gate", [
    "The SQL Compilation Gate allows a valid Safe Query Plan to be converted only into a non-executed, parameterized, read-only Compiled SQL Artifact, clarification_needed, or No-Go, not SQL execution and not database access.",
    "SQL CompilationとはSQL実行ではない。validなSafe Query Planを、将来のrule reviewに渡すための、未実行・parameterized・read-onlyなSQL compilation artifactへ制約付きで変換し、tenant scope・allowlist・denylist・limits・provenance captureを保持することである。",
  ]);
});

test("SQL_COMPILATION_GATE contains all not-compilation items", () => {
  requireAll(gate, "gate", [
    "- SQL execution\n",
    "- D1 execution\n",
    "- database access\n",
    "- free-form SQL generation\n",
    "- LLM-controlled SQL generation\n",
    "- LLM-controlled database access\n",
    "- runtime SQL compilation\n",
    "- runtime query planning\n",
    "- runtime Safe Query Plan generation\n",
    "- evidence by itself\n",
    "- approval\n",
    "- execution authorization\n",
    "- Formal WorkUnit promotion\n",
  ]);
});

test("SQL_COMPILATION_GATE contains all allowed inputs", () => {
  requireAll(gate, "gate", [
    "- valid_safe_query_plan\n",
    "- tenant_id\n",
    "- tenant_scope_filter\n",
    "- source_query_intent_id\n",
    "- related_goal_id\n",
    "- related_workunit_candidate_id\n",
    "- allowed_tables\n",
    "- allowed_columns\n",
    "- denied_tables\n",
    "- denied_columns\n",
    "- operation_type\n",
    "- row_limit\n",
    "- time_limit\n",
    "- cost_limit\n",
    "- expected_result_shape\n",
    "- provenance_capture_plan\n",
    "- evidence_eligibility\n",
    "- human_review_context\n",
  ]);
});

test("SQL_COMPILATION_GATE contains all allowed outputs and the flow", () => {
  requireAll(gate, "gate", [
    "- Compiled SQL Artifact\n",
    "- clarification_needed\n",
    "- No-Go\n",
    "Valid Safe Query Plan → Compilation validation → Read-only operation check → Parameter binding and limit enforcement → Compiled SQL Artifact or Clarification or No-Go",
  ]);
});

test("SQL_COMPILATION_GATE contains all fixed gate rules", () => {
  requireAll(gate, "gate", [
    "A Compiled SQL Artifact must be non-executed.",
    "A Compiled SQL Artifact must not authorize execution.",
    "A Compiled SQL Artifact must not access D1.",
    "A Compiled SQL Artifact must not query production data.",
    "A Compiled SQL Artifact must not be treated as evidence.",
    "A Compiled SQL Artifact must not promote a WorkUnit Candidate into a Formal WorkUnit.",
    "A Compiled SQL Artifact must be compiled only from a valid Safe Query Plan.",
    "A Safe Query Plan without tenant_id is No-Go.",
    "A Safe Query Plan without tenant_scope_filter is No-Go.",
    "A Safe Query Plan with execution_allowed other than false is No-Go.",
    "Cross-tenant SQL compilation is No-Go.",
    "Free-form SQL must not be accepted as input.",
    "LLM-generated raw SQL must not be accepted as trusted output.",
  ]);
});

test("SQL_COMPILATION_GATE contains read-only operation enforcement rules", () => {
  requireAll(gate, "gate", [
    "Only read-only SELECT-style compilation may be planned by this gate.",
    "Only read-only query shapes may be compiled.",
    "Mutation operations are No-Go.",
    "INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, REPLACE, UPSERT, PRAGMA, ATTACH, DETACH, and VACUUM are No-Go.",
    "The compiled artifact must preserve the operation_type from the Safe Query Plan.",
    "The compiled artifact must preserve denied tables and denied columns.",
    "The compiled artifact must include row_limit.",
    "The compiled artifact must include tenant_scope_filter.",
    "The compiled artifact must include parameter_binding_plan.",
  ]);
});

test("SQL_COMPILATION_GATE contains tenant scope and parameter binding rules", () => {
  requireAll(gate, "gate", [
    "tenant_id is required.",
    "tenant_scope_filter is required.",
    "tenant_scope_filter must be enforceable by rules outside the LLM.",
    "tenant_id must be bound as a parameter.",
    "All user-controlled values must be bound as parameters.",
    "No user-controlled value may be interpolated into SQL text.",
    "Tenant values must be represented as parameters, not string interpolation.",
    "All dynamic values must be represented as bound parameters.",
    "String concatenation for SQL construction is No-Go.",
  ]);
});

test("SQL_COMPILATION_GATE contains schema allowlist and denylist rules", () => {
  requireAll(gate, "gate", [
    "Only allowlisted tables and columns from the Safe Query Plan may appear in the artifact.",
    "Denied tables and denied columns must not appear in the artifact.",
    "Denied tables and denied columns must override allowed tables and columns.",
    "Unknown schema must produce clarification_needed or No-Go.",
    "Unknown schema must not be treated as safe.",
    "secret_or_token, blocked_input, and unknown_sensitive data must not be compilable.",
    "Model confidence must not be used as schema evidence.",
    "Model confidence must not be used as permission to compile SQL.",
  ]);
});

test("SQL_COMPILATION_GATE contains limit and cost rules", () => {
  requireAll(gate, "gate", [
    "row_limit is required.",
    "time_limit is required.",
    "cost_limit is required.",
    "Compiled SQL Artifact must preserve row_limit, time_limit, and cost_limit.",
    "Missing limits are Fail or No-Go depending on risk",
  ]);
});

test("SQL_COMPILATION_GATE contains provenance and evidence boundary rules", () => {
  requireAll(gate, "gate", [
    "Compiled SQL Artifact is not evidence.",
    "Compiled SQL Artifact may describe future provenance capture, but it must not create provenance records.",
    "Future query results are not evidence unless query plan, compiled artifact, tenant scope, selected source rows, and result provenance are recorded.",
  ]);
});

test("SQL_COMPILATION_GATE contains all failure and No-Go conditions", () => {
  requireAll(gate, "gate", [
    "- invalid_safe_query_plan\n",
    "- missing_tenant_id\n",
    "- missing_tenant_scope_filter\n",
    "- execution_allowed_not_false\n",
    "- cross_tenant_compilation\n",
    "- undocumented_schema_reference\n",
    "- denied_schema_reference\n",
    "- secret_or_token_compilation\n",
    "- blocked_input_compilation\n",
    "- unknown_sensitive_compilation\n",
    "- mutation_operation\n",
    "- free_form_sql_input\n",
    "- raw_llm_sql_output\n",
    "- string_interpolation\n",
    "- missing_bound_parameters\n",
    "- compiled_sql_as_evidence\n",
    "- compiled_sql_as_execution_authorization\n",
    "- direct_database_access\n",
  ]);
});

test("SQL_COMPILATION_GATE contains future system rules and the non-authorization statement", () => {
  requireAll(gate, "gate", [
    "Future D1 read-only execution requires a separate D1 read-only execution gate.",
    "Future D1 execution must verify compiled artifact id, tenant scope, parameters, row limits, denied schema absence, and provenance capture plan.",
    "Future GraphRAG may use query results only after provenance is restored.",
    "Future LLM judgment may inspect query results only after a separate LLM judgment evaluation gate.",
    "A Compiled SQL Artifact must not authorize D1 execution.",
    "A Compiled SQL Artifact must not authorize external execution.",
    "This SQL Compilation Gate authorizes no SQL execution, no D1 execution, no database access, no free-form SQL generation, no LLM-controlled SQL generation, no LLM-controlled database access, no runtime SQL compiler, no runtime query planner, no runtime Safe Query Plan generation, no GraphRAG implementation, no vectorization, no real LLM enablement, no external execution, no Formal WorkUnit promotion, and no automated decision-making.",
  ]);
});

test("COMPILED_SQL_ARTIFACT_CONTRACT contains all required sections", () => {
  requireAll(contract, "contract", [
    "## 1. Purpose",
    "## 2. Scope",
    "## 3. Definition of Compiled SQL Artifact",
    "## 4. What Compiled SQL Artifact Is Not",
    "## 5. Required Fields",
    "## 6. Artifact Status",
    "## 7. Allowed Operation Shape",
    "## 8. SQL Text and Parameter Binding Fields",
    "## 9. Schema Reference Fields",
    "## 10. Tenant Scope Fields",
    "## 11. Limit and Cost Fields",
    "## 12. Provenance Capture Fields",
    "## 13. Evidence Eligibility Fields",
    "## 14. Human Review Requirements",
    "## 15. Validation Rules",
    "## 16. Pass / Warn / Fail / No-Go Outcomes",
    "## 17. Non-authorization Statement",
  ]);
});

test("COMPILED_SQL_ARTIFACT_CONTRACT contains the artifact definition sentence and Japanese conceptual sentence", () => {
  requireAll(contract, "contract", [
    "A Compiled SQL Artifact is a non-executed, read-only, parameterized SQL representation derived from a valid Safe Query Plan for future rule review before any D1 access.",
    "Compiled SQL Artifactとは、D1アクセスの前にfuture rule reviewへ渡すための、validなSafe Query Planから導出された、未実行・read-only・parameterizedなSQL表現である。",
  ]);
});

test("COMPILED_SQL_ARTIFACT_CONTRACT contains all not-artifact items", () => {
  requireAll(contract, "contract", [
    "- SQL execution\n",
    "- D1 access\n",
    "- database access\n",
    "- free-form SQL\n",
    "- LLM-authored trusted SQL\n",
    "- evidence\n",
    "- provenance record\n",
    "- approval\n",
    "- execution authorization\n",
    "- Formal WorkUnit promotion\n",
  ]);
});

test("COMPILED_SQL_ARTIFACT_CONTRACT contains all required fields", () => {
  requireAll(contract, "contract", [
    "- artifact_id\n",
    "- tenant_id\n",
    "- source_safe_query_plan_id\n",
    "- source_query_intent_id\n",
    "- related_goal_id\n",
    "- related_workunit_candidate_id\n",
    "- artifact_status\n",
    "- operation_shape\n",
    "- sql_text_template\n",
    "- parameter_binding_plan\n",
    "- allowed_tables\n",
    "- allowed_columns\n",
    "- denied_tables\n",
    "- denied_columns\n",
    "- tenant_scope_filter\n",
    "- row_limit\n",
    "- time_limit\n",
    "- cost_limit\n",
    "- expected_result_shape\n",
    "- provenance_capture_plan\n",
    "- evidence_eligibility\n",
    "- human_review_required\n",
    "- execution_allowed\n",
    "- unsupported_assumptions\n",
    "- no_go_flags\n",
    "- created_by_system\n",
    "- created_at\n",
  ]);
});

test("COMPILED_SQL_ARTIFACT_CONTRACT contains all artifact status values and allowed operation shape rules", () => {
  requireAll(contract, "contract", [
    "- draft_compilation\n",
    "- clarification_needed\n",
    "- blocked_no_go\n",
    "- ready_for_rule_review\n",
    "- read_only_select_shape\n",
    "Only read_only_select_shape is allowed in this phase.",
  ]);
});

test("COMPILED_SQL_ARTIFACT_CONTRACT contains SQL text and parameter binding rules", () => {
  requireAll(contract, "contract", [
    "sql_text_template may exist only as a non-executed template.",
    "sql_text_template must not be executed in this phase.",
    "parameter_binding_plan is required.",
    "tenant_id must be represented in parameter_binding_plan.",
    "All user-controlled values must be represented in parameter_binding_plan.",
    "No user-controlled value may be interpolated into sql_text_template.",
    "String concatenation for SQL construction is No-Go.",
  ]);
});

test("COMPILED_SQL_ARTIFACT_CONTRACT contains schema reference rules", () => {
  requireAll(contract, "contract", [
    "allowed_tables and allowed_columns must reference documented schema only.",
    "denied_tables and denied_columns must be preserved from Safe Query Plan and D1 Schema Catalog.",
    "Denied tables and denied columns must override allowed tables and allowed columns.",
    "Unknown schema must appear in unsupported_assumptions or no_go_flags.",
    "secret_or_token, blocked_input, and unknown_sensitive columns must not appear in sql_text_template.",
    "The model must not invent schema.",
    "The model must not use model confidence as schema evidence.",
  ]);
});

test("COMPILED_SQL_ARTIFACT_CONTRACT contains tenant scope rules", () => {
  requireAll(contract, "contract", [
    "tenant_id is required.",
    "tenant_scope_filter is required.",
    "tenant_scope_filter must be enforceable by rules outside the LLM.",
    "tenant_id must be bound as a parameter.",
    "A Compiled SQL Artifact without tenant_id is No-Go.",
    "A Compiled SQL Artifact without tenant_scope_filter is No-Go.",
    "A Compiled SQL Artifact must not request cross-tenant access.",
  ]);
});

test("COMPILED_SQL_ARTIFACT_CONTRACT contains limit and cost rules", () => {
  requireAll(contract, "contract", [
    "row_limit is required.",
    "time_limit is required.",
    "cost_limit is required.",
    "Limits must be conservative by default.",
    "A Compiled SQL Artifact without row_limit, time_limit, or cost_limit is Fail or No-Go depending on risk.",
  ]);
});

test("COMPILED_SQL_ARTIFACT_CONTRACT contains provenance capture and evidence eligibility rules", () => {
  requireAll(contract, "contract", [
    "provenance_capture_plan is required.",
    "provenance_capture_plan must include table reference, column reference, row reference strategy, query plan id, compiled artifact id, tenant id, obtained_at, and redaction state.",
    "Aggregated results must preserve aggregation method and source scope.",
    "evidence_eligibility must be explicit.",
    "A Compiled SQL Artifact may describe future evidence eligibility, but it must not create evidence.",
    "A Compiled SQL Artifact must not be treated as evidence.",
    "Future query results must restore provenance before they can support human review.",
  ]);
});

test("COMPILED_SQL_ARTIFACT_CONTRACT contains validation rules", () => {
  requireAll(contract, "contract", [
    "A valid Compiled SQL Artifact must be non-executed.",
    "A valid Compiled SQL Artifact must be read-only.",
    "A valid Compiled SQL Artifact must contain tenant_id.",
    "A valid Compiled SQL Artifact must contain tenant_scope_filter.",
    "A valid Compiled SQL Artifact must contain parameter_binding_plan.",
    "A valid Compiled SQL Artifact must preserve denied tables and denied columns.",
    "A valid Compiled SQL Artifact must deny secret_or_token, blocked_input, and unknown_sensitive data.",
    "A valid Compiled SQL Artifact must include row_limit, time_limit, and cost_limit.",
    "A valid Compiled SQL Artifact must include provenance_capture_plan.",
    "A valid Compiled SQL Artifact must not authorize execution.",
    "execution_allowed must be false in this phase.",
  ]);
});

test("COMPILED_SQL_ARTIFACT_CONTRACT contains Pass / Warn / Fail / No-Go outcome definitions", () => {
  requireAll(contract, "contract", [
    "The Compiled SQL Artifact is non-executed, read-only, tenant-scoped, schema-grounded, parameterized, limited, provenance-planned, and safe for future rule review.",
    "The Compiled SQL Artifact is non-executed, read-only, and tenant-scoped, but clarification or quality improvement is needed.",
    "Required fields or grounding requirements are missing, but no hard safety boundary is crossed.",
    "A hard safety boundary is violated, such as SQL execution, D1 access, missing tenant scope, cross-tenant compilation, denied schema reference, mutation operation, free-form SQL, string interpolation, secret_or_token request, blocked_input request, unknown_sensitive request, or execution authorization.",
  ]);
});

test("COMPILED_SQL_ARTIFACT_CONTRACT contains the non-authorization statement", () => {
  requireAll(contract, "contract", [
    "This Compiled SQL Artifact Contract authorizes no SQL execution, no D1 execution, no database access, no free-form SQL generation, no LLM-controlled SQL generation, no LLM-controlled database access, no runtime SQL compiler, no runtime query planner, no runtime Safe Query Plan generation, no GraphRAG implementation, no vectorization, no real LLM enablement, no external execution, no Formal WorkUnit promotion, and no automated decision-making.",
  ]);
});
