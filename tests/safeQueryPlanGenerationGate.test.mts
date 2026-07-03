/**
 * P6.8 — Safe Query Plan Generation Gate / Safe Query Plan Contract.
 *
 * Static, read-only guards (matching the repo's spine-doc test convention) so a future edit
 * cannot silently weaken the plan-generation boundary: a valid Query Intent converts only
 * into a non-executable Safe Query Plan / clarification_needed / No-Go — never SQL, never
 * compilation, never execution, never database access; the plan is tenant-scoped,
 * allowlisted, denylist-aware, limited, provenance-planned, and never evidence.
 *
 * This test does NOT touch the network, the GitHub API, child_process, or the filesystem
 * (read-only). It only reads two docs under docs/ and asserts their content. It does NOT
 * scan its own source; every required phrase is asserted against the docs.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync, existsSync } from "node:fs"
import path from "node:path"

const root = process.cwd()

const GATE = path.join(root, "docs/SAFE_QUERY_PLAN_GENERATION_GATE.md")
const CONTRACT = path.join(root, "docs/SAFE_QUERY_PLAN_CONTRACT.md")

const read = (p: string): string => (existsSync(p) ? readFileSync(p, "utf8") : "")
const gate = read(GATE)
const contract = read(CONTRACT)

const requireAll = (haystack: string, needles: string[], label: string): void => {
  for (const n of needles) assert.ok(haystack.includes(n), `${label} must include: ${n}`)
}

// ── Files exist ──────────────────────────────────────────────

test("1. docs/SAFE_QUERY_PLAN_GENERATION_GATE.md exists", () => {
  assert.equal(existsSync(GATE), true)
  assert.ok(gate.length > 0)
})

test("2. docs/SAFE_QUERY_PLAN_CONTRACT.md exists", () => {
  assert.equal(existsSync(CONTRACT), true)
  assert.ok(contract.length > 0)
})

// ── Required sections ────────────────────────────────────────

test("3. GATE contains all required sections", () => {
  requireAll(gate, [
    "## 1. Purpose",
    "## 2. Scope",
    "## 3. Definition of Safe Query Plan Generation Gate",
    "## 4. What Safe Query Plan Generation Is Not",
    "## 5. Gate Principles",
    "## 6. Allowed Inputs",
    "## 7. Allowed Outputs",
    "## 8. Query Intent to Safe Query Plan Flow",
    "## 9. Pre-generation Validation",
    "## 10. Tenant Scope Enforcement",
    "## 11. Schema Allowlist and Denylist Enforcement",
    "## 12. Sensitivity, Redaction, and Aggregation Handling",
    "## 13. Limit and Cost Planning",
    "## 14. Provenance and Evidence Eligibility Planning",
    "## 15. Failure and No-Go Conditions",
    "## 16. Relationship to Future SQL Compilation / D1 Execution / GraphRAG / LLM Judgment",
    "## 17. Non-authorization Statement",
  ], "GATE sections")
})

test("4. CONTRACT contains all required sections", () => {
  requireAll(contract, [
    "## 1. Purpose",
    "## 2. Scope",
    "## 3. Definition of Safe Query Plan",
    "## 4. What Safe Query Plan Is Not",
    "## 5. Required Fields",
    "## 6. Plan Status",
    "## 7. Plan Operation Types",
    "## 8. Schema Reference Fields",
    "## 9. Tenant Scope Fields",
    "## 10. Sensitivity, Redaction, and Aggregation Fields",
    "## 11. Limit Fields",
    "## 12. Provenance Capture Fields",
    "## 13. Evidence Eligibility Fields",
    "## 14. Human Review Requirements",
    "## 15. Validation Rules",
    "## 16. Pass / Warn / Fail / No-Go Outcomes",
    "## 17. Non-authorization Statement",
  ], "CONTRACT sections")
})

// ── Gate content ─────────────────────────────────────────────

test("5. gate contains the definition sentences (EN + JP)", () => {
  assert.ok(gate.includes(
    "The Safe Query Plan Generation Gate allows a valid Query Intent to be converted only into a non-executable Safe Query Plan object, clarification_needed, or No-Go, not SQL, not execution, and not database access.",
  ))
  assert.ok(gate.includes(
    "Safe Query Plan generationとはSQL生成ではない。validなQuery Intentを、将来のrule reviewに渡すための、実行不能・tenant-scoped・allowlist準拠・denylist考慮・provenance計画付きのquery objectへ制約付きで変換することである。",
  ))
})

test("6. gate contains all not-generation items", () => {
  requireAll(gate, [
    "- SQL generation",
    "- SQL execution",
    "- D1 execution",
    "- SQL compilation",
    "- free-form SQL generation",
    "- database access",
    "- LLM-controlled database access",
    "- runtime query planning",
    "- runtime Safe Query Plan generation",
    "- runtime NL2SQL",
    "- evidence by itself",
    "- approval\n",
    "- execution authorization",
    "- Formal WorkUnit promotion",
  ], "gate not-list")
})

test("7. gate contains all allowed inputs", () => {
  requireAll(gate, [
    "- valid_query_intent",
    "- tenant_id",
    "- tenant_scope_requirement",
    "- related_goal_id",
    "- related_workunit_candidate_id",
    "- documented_schema_refs",
    "- candidate_tables",
    "- candidate_columns",
    "- denied_tables",
    "- denied_columns",
    "- sensitivity_considerations",
    "- redaction_needed",
    "- aggregation_requested",
    "- row_limit_hint",
    "- evidence_need",
    "- provenance_need",
    "- human_review_context",
  ], "gate allowed inputs")
})

test("8. gate contains all allowed outputs and the flow", () => {
  requireAll(gate, [
    "- Safe Query Plan\n",
    "- clarification_needed",
    "- No-Go\n",
  ], "gate allowed outputs")
  assert.ok(gate.includes(
    "Valid Query Intent → Schema and tenant validation → Allowlist / denylist review → Limit and provenance planning → Safe Query Plan or Clarification or No-Go",
  ))
})

test("9. gate contains all fixed gate rules", () => {
  requireAll(gate, [
    "A Safe Query Plan must be non-executable.",
    "A Safe Query Plan must not contain executable SQL.",
    "A Safe Query Plan must not contain SELECT, INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, REPLACE, UPSERT, PRAGMA, ATTACH, DETACH, or VACUUM as executable database operations.",
    "A Safe Query Plan must not authorize execution.",
    "A Safe Query Plan must not access D1.",
    "A Safe Query Plan must not query production data.",
    "A Safe Query Plan must not be treated as evidence.",
    "A Safe Query Plan must not promote a WorkUnit Candidate into a Formal WorkUnit.",
    "A Safe Query Plan must be generated only from a valid Query Intent.",
    "A Query Intent without tenant_id is No-Go.",
    "A Query Intent without tenant_scope_requirement is No-Go.",
    "A Safe Query Plan without tenant_id is No-Go.",
    "A Safe Query Plan without tenant_scope_filter is No-Go.",
    "Cross-tenant query planning is No-Go.",
    "Denied tables and denied columns must override allowlisted tables and columns.",
    "secret_or_token, blocked_input, and unknown_sensitive data must not be queryable.",
    "Unknown schema must not be treated as safe.",
    "Model confidence must not be used as schema evidence.",
    "Model confidence must not be used as permission to generate a Safe Query Plan.",
  ], "gate fixed rules")
})

test("10. gate contains pre-generation validation and provenance/evidence planning rules", () => {
  assert.ok(gate.includes(
    "Before a Safe Query Plan can be produced, the source Query Intent must be validated for tenant_id, tenant_scope_requirement, non-executable content, documented schema references, denied schema preservation, unsupported assumptions, sensitivity handling, evidence_need, and provenance_need.",
  ))
  requireAll(gate, [
    "A Safe Query Plan may contain evidence_eligibility, but it must not create evidence.",
    "A Safe Query Plan may contain provenance_capture_plan, but it must not create provenance records.",
    "Future query results are not evidence unless query plan, tenant scope, selected source rows, and result provenance are recorded.",
    "A Safe Query Plan must describe how table, column, row reference, query plan id, tenant id, obtained_at, and redaction state would be captured by a future execution gate.",
  ], "gate provenance/evidence planning")
})

test("11. gate contains all failure/No-Go conditions", () => {
  requireAll(gate, [
    "- invalid_query_intent",
    "- missing_tenant_id",
    "- missing_tenant_scope_requirement",
    "- missing_tenant_scope_filter",
    "- cross_tenant_query_plan",
    "- undocumented_schema_reference",
    "- denied_schema_reference",
    "- secret_or_token_query",
    "- blocked_input_query",
    "- unknown_sensitive_query",
    "- executable_sql_in_plan",
    "- direct_database_access",
    "- query_plan_as_evidence",
    "- query_plan_as_execution_authorization",
    "- unsupported_schema_assumption",
  ], "gate No-Go conditions")
})

test("12. gate contains future-system rules and non-authorization statement", () => {
  requireAll(gate, [
    "Future SQL compilation requires a separate SQL compilation gate.",
    "Future D1 read-only execution requires a separate D1 read-only execution gate.",
    "Future GraphRAG may use query results only after provenance is restored.",
    "Future LLM judgment may inspect query results only after a separate LLM judgment evaluation gate.",
    "A Safe Query Plan must not authorize SQL compilation.",
    "A Safe Query Plan must not authorize D1 execution.",
    "A Safe Query Plan must not authorize external execution.",
  ], "gate future-system rules")
  assert.ok(gate.includes(
    "This Safe Query Plan Generation Gate authorizes no SQL generation, no SQL execution, no D1 execution, no SQL compilation, no free-form SQL generation, no runtime query planner, no runtime Safe Query Plan generation, no database access, no LLM-controlled database access, no GraphRAG implementation, no vectorization, no real LLM enablement, no external execution, no Formal WorkUnit promotion, and no automated decision-making.",
  ))
})

// ── Contract content ─────────────────────────────────────────

test("13. contract contains the definition sentences (EN + JP)", () => {
  assert.ok(contract.includes(
    "A Safe Query Plan is a non-executable, tenant-scoped, allowlisted, denylist-aware, provenance-planned query object designed for future rule review before any SQL compilation or database access.",
  ))
  assert.ok(contract.includes(
    "Safe Query Planとは、SQLコンパイルやDBアクセスの前にfuture rule reviewへ渡すための、実行不能・tenant-scoped・allowlist準拠・denylist考慮・provenance計画付きのquery objectである。",
  ))
})

test("14. contract contains all not-plan items", () => {
  requireAll(contract, [
    "- SQL\n",
    "- executable code",
    "- database access",
    "- D1 execution",
    "- SQL compilation",
    "- query execution",
    "- evidence\n",
    "- provenance record",
    "- approval\n",
    "- execution authorization",
    "- Formal WorkUnit promotion",
  ], "contract not-list")
})

test("15. contract contains all required fields", () => {
  requireAll(contract, [
    "- plan_id",
    "- tenant_id",
    "- source_query_intent_id",
    "- related_goal_id",
    "- related_workunit_candidate_id",
    "- plan_status",
    "- operation_type",
    "- allowed_tables",
    "- allowed_columns",
    "- denied_tables",
    "- denied_columns",
    "- tenant_scope_filter",
    "- sensitivity_handling",
    "- redaction_plan",
    "- aggregation_plan",
    "- row_limit\n",
    "- time_limit",
    "- cost_limit",
    "- expected_result_shape",
    "- provenance_capture_plan",
    "- evidence_eligibility",
    "- human_review_required",
    "- execution_allowed",
    "- unsupported_assumptions",
    "- no_go_flags",
    "- created_by_system",
    "- created_at",
  ], "contract required fields")
})

test("16. contract contains all plan status values and operation types", () => {
  requireAll(contract, [
    "- draft_plan",
    "- clarification_needed",
    "- blocked_no_go",
    "- ready_for_rule_review",
  ], "contract plan status")
  // Newline-anchored so "- lookup_plan" is uniquely the base type and not satisfied by
  // "- relationship_lookup_plan" / "- provenance_lookup_plan" / "- evidence_lookup_plan".
  requireAll(contract, [
    "- lookup_plan\n",
    "- filter_plan",
    "- aggregate_plan",
    "- compare_plan",
    "- trend_plan",
    "- count_plan",
    "- existence_check_plan",
    "- relationship_lookup_plan",
    "- provenance_lookup_plan",
    "- evidence_lookup_plan",
  ], "contract operation types")
})

test("17. contract contains schema/tenant/sensitivity/limit rules", () => {
  requireAll(contract, [
    "allowed_tables and allowed_columns must reference documented schema only.",
    "denied_tables and denied_columns must be preserved from Query Intent and D1 Schema Catalog.",
    "Denied tables and denied columns must override allowed tables and allowed columns.",
    "Unknown schema must appear in unsupported_assumptions or no_go_flags.",
    "The model must not invent schema.",
    "The model must not use model confidence as schema evidence.",
  ], "contract schema rules")
  requireAll(contract, [
    "tenant_id is required.",
    "tenant_scope_filter is required.",
    "tenant_scope_filter must be enforceable by rules outside the LLM.",
    "A Safe Query Plan without tenant_id is No-Go.",
    "A Safe Query Plan without tenant_scope_filter is No-Go.",
    "A Safe Query Plan must not request cross-tenant access.",
  ], "contract tenant rules")
  requireAll(contract, [
    "secret_or_token data must not be queryable.",
    "blocked_input data must not be queryable.",
    "unknown_sensitive data must not be queryable.",
    "personal_data must require human review and redaction consideration.",
    "redaction_plan must be explicit when sensitive data may appear.",
    "aggregation_plan must describe source scope and aggregation method.",
  ], "contract sensitivity rules")
  requireAll(contract, [
    "row_limit is required.",
    "time_limit is required.",
    "cost_limit is required.",
    "Limits must be conservative by default.",
    "A Safe Query Plan without row_limit, time_limit, or cost_limit is Fail or No-Go depending on risk.",
  ], "contract limit rules")
})

test("18. contract contains provenance/evidence/validation rules", () => {
  requireAll(contract, [
    "provenance_capture_plan is required.",
    "provenance_capture_plan must include table reference, column reference, row reference strategy, query plan id, tenant id, obtained_at, and redaction state.",
    "Aggregated results must preserve aggregation method and source scope.",
  ], "contract provenance capture")
  requireAll(contract, [
    "evidence_eligibility must be explicit.",
    "A Safe Query Plan may describe future evidence eligibility, but it must not create evidence.",
    "A Safe Query Plan must not be treated as evidence.",
    "Future query results must restore provenance before they can support human review.",
  ], "contract evidence eligibility")
  requireAll(contract, [
    "A valid Safe Query Plan must be non-executable.",
    "A valid Safe Query Plan must not contain executable SQL.",
    "A valid Safe Query Plan must contain tenant_id.",
    "A valid Safe Query Plan must contain tenant_scope_filter.",
    "A valid Safe Query Plan must preserve denied tables and denied columns.",
    "A valid Safe Query Plan must deny secret_or_token, blocked_input, and unknown_sensitive data.",
    "A valid Safe Query Plan must include row_limit, time_limit, and cost_limit.",
    "A valid Safe Query Plan must include provenance_capture_plan.",
    "A valid Safe Query Plan must not authorize execution.",
    "execution_allowed must be false in this phase.",
  ], "contract validation rules")
})

test("19. contract contains Pass/Warn/Fail/No-Go outcomes and non-authorization statement", () => {
  requireAll(contract, [
    "Pass:\nThe Safe Query Plan is non-executable, tenant-scoped, schema-grounded, allowlisted, denylist-aware, limited, provenance-planned, and safe for future rule review.",
    "Warn:\nThe Safe Query Plan is non-executable and tenant-scoped, but clarification or quality improvement is needed.",
    "Fail:\nRequired fields or grounding requirements are missing, but no hard safety boundary is crossed.",
    "No-Go:\nA hard safety boundary is violated, such as executable SQL, missing tenant scope, cross-tenant plan, denied schema request, secret_or_token request, blocked_input request, unknown_sensitive request, database access, or execution authorization.",
  ], "contract outcomes")
  assert.ok(contract.includes(
    "This Safe Query Plan Contract authorizes no SQL generation, no SQL execution, no D1 execution, no SQL compilation, no free-form SQL generation, no runtime query planner, no runtime Safe Query Plan generation, no database access, no LLM-controlled database access, no GraphRAG implementation, no vectorization, no real LLM enablement, no external execution, no Formal WorkUnit promotion, and no automated decision-making.",
  ))
})
