/**
 * P6.7 — NL2SQL Planning Gate / Query Intent Contract.
 *
 * Static, read-only guards (matching the repo's spine-doc test convention) so a future edit
 * cannot silently weaken the NL2SQL planning boundary: the gate produces Query Intent /
 * clarification / No-Go only, never SQL, never execution, never database access; Query Intent
 * is non-executable, tenant-scoped, schema-grounded, and never evidence.
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

const GATE = path.join(root, "docs/NL2SQL_PLANNING_GATE.md")
const INTENT = path.join(root, "docs/QUERY_INTENT_CONTRACT.md")

const read = (p: string): string => (existsSync(p) ? readFileSync(p, "utf8") : "")
const gate = read(GATE)
const intent = read(INTENT)

const requireAll = (haystack: string, needles: string[], label: string): void => {
  for (const n of needles) assert.ok(haystack.includes(n), `${label} must include: ${n}`)
}

// ── Files exist ──────────────────────────────────────────────

test("1. docs/NL2SQL_PLANNING_GATE.md exists", () => {
  assert.equal(existsSync(GATE), true)
  assert.ok(gate.length > 0)
})

test("2. docs/QUERY_INTENT_CONTRACT.md exists", () => {
  assert.equal(existsSync(INTENT), true)
  assert.ok(intent.length > 0)
})

// ── Required sections ────────────────────────────────────────

test("3. NL2SQL_PLANNING_GATE contains all required sections", () => {
  requireAll(gate, [
    "## 1. Purpose",
    "## 2. Scope",
    "## 3. Definition of NL2SQL Planning Gate",
    "## 4. What NL2SQL Planning Is Not",
    "## 5. Gate Principles",
    "## 6. Allowed Inputs",
    "## 7. Allowed Outputs",
    "## 8. Natural Language to Query Intent Flow",
    "## 9. Prohibited Outputs and Actions",
    "## 10. Tenant Scope and Authorization Boundary",
    "## 11. Schema Catalog Use",
    "## 12. Read-only Query Planning Handoff",
    "## 13. Evidence and Provenance Boundary",
    "## 14. Clarification and Human Review Requirements",
    "## 15. Failure and No-Go Conditions",
    "## 16. Relationship to Future Runtime NL2SQL / D1 Execution / GraphRAG / LLM Judgment",
    "## 17. Non-authorization Statement",
  ], "GATE sections")
})

test("4. QUERY_INTENT_CONTRACT contains all required sections", () => {
  requireAll(intent, [
    "## 1. Purpose",
    "## 2. Scope",
    "## 3. Definition of Query Intent",
    "## 4. What Query Intent Is Not",
    "## 5. Required Fields",
    "## 6. Intent Types",
    "## 7. Schema Reference Rules",
    "## 8. Tenant Scope Fields",
    "## 9. Sensitivity and Redaction Hints",
    "## 10. Evidence and Provenance Expectations",
    "## 11. Clarification Requirements",
    "## 12. Unsafe Request Handling",
    "## 13. Handoff to Safe Query Plan",
    "## 14. Validation Rules",
    "## 15. Pass / Warn / Fail / No-Go Outcomes",
    "## 16. Relationship to Future Safe Query Plan and Execution Gates",
    "## 17. Non-authorization Statement",
  ], "INTENT sections")
})

// ── Gate content ─────────────────────────────────────────────

test("5. gate contains the definition sentence (EN + JP)", () => {
  assert.ok(gate.includes(
    "The NL2SQL Planning Gate allows natural-language information needs to be converted only into Query Intent, clarification needs, or No-Go, not SQL, not execution, and not database access.",
  ))
  assert.ok(gate.includes(
    "NL2SQL PlanningとはSQL生成ではない。自然言語の情報要求を、documented schemaだけを使って、DBアクセスなしに、Query Intent・確認質問・No-Goへ制約付きで変換することである。",
  ))
})

test("6. gate contains all not-planning items", () => {
  requireAll(gate, [
    "- SQL generation",
    "- SQL execution",
    "- D1 execution",
    "- free-form SQL generation",
    "- database access",
    "- LLM-controlled database access",
    "- runtime query planning",
    "- schema discovery by the model",
    "- evidence by itself",
    "- approval\n",
    "- execution authorization",
    "- Formal WorkUnit promotion",
  ], "gate not-list")
})

test("7. gate contains all allowed inputs", () => {
  requireAll(gate, [
    "- natural_language_request",
    "- tenant_id",
    "- related_goal_id",
    "- related_workunit_candidate_id",
    "- goal_context",
    "- documented_schema_refs",
    "- allowed_schema_refs",
    "- denied_schema_refs",
    "- sensitivity_context",
    "- evidence_need",
    "- provenance_need",
    "- human_review_context",
  ], "gate allowed inputs")
})

test("8. gate contains all allowed outputs", () => {
  requireAll(gate, [
    "- Query Intent\n",
    "- clarification_needed",
    "- No-Go\n",
  ], "gate allowed outputs")
})

test("9. gate contains the natural-language to Query Intent flow", () => {
  assert.ok(gate.includes(
    "Natural-language information need → Schema-grounded interpretation → Query Intent or Clarification → Rule review → Future Safe Query Plan gate",
  ))
})

test("10. gate contains all fixed gate rules", () => {
  requireAll(gate, [
    "The model must not output executable SQL.",
    "The model must not output SELECT, INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, REPLACE, UPSERT, PRAGMA, ATTACH, DETACH, or VACUUM as executable database operations.",
    "The model must not invent tables or columns.",
    "The model must not treat unknown schema as safe.",
    "The model must not bypass D1 Schema Catalog.",
    "The model must not bypass Read-only Query Planning.",
    "The model must not directly create a Safe Query Plan in this phase.",
    "The model must not access D1.",
    "The model must not query production data.",
    "The model must not use model confidence as schema evidence.",
    "The model must not use model confidence as permission to proceed.",
    "A request without tenant_id is No-Go.",
    "A request that requires cross-tenant access is No-Go.",
    "A request targeting denied tables, denied columns, secret_or_token, blocked_input, or unknown_sensitive data is No-Go unless rewritten as an allowed aggregate or clarification need by future gates.",
    "A Query Intent must not authorize execution.",
    "A Query Intent must not be treated as evidence.",
  ], "gate fixed rules")
})

test("11. gate contains schema catalog use + handoff + evidence rules", () => {
  requireAll(gate, [
    "Only documented schema from docs/D1_SCHEMA_CATALOG.md may be referenced.",
    "Repository schema files win over catalog text when disagreement is discovered.",
    "Unknown schema must produce clarification_needed or No-Go, not invented intent.",
  ], "gate schema catalog use")
  requireAll(gate, [
    "Query Intent may be handed off to the future Safe Query Plan process defined by docs/READ_ONLY_QUERY_PLANNING_SPEC.md.",
    "The handoff does not authorize SQL execution.",
    "The handoff does not authorize D1 execution.",
    "The handoff does not authorize evidence creation.",
    "Safe Query Plan generation remains a separate future gate unless already explicitly implemented by a later approved phase.",
  ], "gate handoff rules")
  requireAll(gate, [
    "Query Intent is not evidence.",
    "Query Intent contains an evidence need, not evidence itself.",
    "Future query results are not evidence unless query plan, tenant scope, selected source rows, and result provenance are recorded.",
    "Provenance must be restored before future query results can support WorkUnit review.",
  ], "gate evidence/provenance boundary")
})

test("12. gate contains all failure/No-Go conditions and non-authorization statement", () => {
  requireAll(gate, [
    "- missing_tenant_id",
    "- cross_tenant_request",
    "- unknown_schema_request",
    "- denied_schema_request",
    "- secret_or_token_request",
    "- blocked_input_request",
    "- executable_sql_output",
    "- free_form_sql_output",
    "- direct_database_access",
    "- unsupported_schema_assumption",
    "- query_intent_as_evidence",
    "- query_intent_as_execution_authorization",
  ], "gate No-Go conditions")
  assert.ok(gate.includes(
    "This NL2SQL Planning Gate authorizes no SQL generation, no SQL execution, no D1 execution, no free-form SQL generation, no runtime query planner, no database access, no LLM-controlled database access, no GraphRAG implementation, no vectorization, no real LLM enablement, no external execution, no Formal WorkUnit promotion, and no automated decision-making.",
  ))
})

// ── Query Intent Contract content ────────────────────────────

test("13. intent contract contains the definition sentence (EN + JP)", () => {
  assert.ok(intent.includes(
    "Query Intent is a non-executable, tenant-scoped description of what information is needed and why, designed to be reviewed before any future Safe Query Plan or database access.",
  ))
  assert.ok(intent.includes(
    "Query Intentとは、どの情報がなぜ必要かを示す、実行不能・tenant-scopedな記述であり、将来のSafe Query PlanやDBアクセスの前にレビューされるためのものである。",
  ))
})

test("14. intent contract contains all not-Query-Intent items", () => {
  requireAll(intent, [
    "- SQL\n",
    "- executable code",
    "- database access",
    "- Safe Query Plan\n",
    "- query execution",
    "- evidence\n",
    "- provenance record",
    "- approval\n",
    "- execution authorization",
    "- Formal WorkUnit promotion",
  ], "intent not-list")
})

test("15. intent contract contains all required fields", () => {
  requireAll(intent, [
    "- intent_id",
    "- tenant_id",
    "- related_goal_id",
    "- related_workunit_candidate_id",
    "- natural_language_request",
    "- intent_type",
    "- target_information_need",
    "- candidate_tables",
    "- candidate_columns",
    "- denied_tables",
    "- denied_columns",
    "- tenant_scope_requirement",
    "- sensitivity_considerations",
    "- redaction_needed",
    "- aggregation_requested",
    "- time_range",
    "- row_limit_hint",
    "- evidence_need",
    "- provenance_need",
    "- clarification_questions",
    "- unsupported_assumptions",
    "- no_go_flags",
    "- created_by_system",
    "- created_at",
  ], "intent required fields")
})

test("16. intent contract contains all intent types", () => {
  // Newline-anchored so "- lookup" is not satisfied by "- relationship_lookup" etc.,
  // and "- no_go" is not satisfied by "- no_go_flags".
  requireAll(intent, [
    "- lookup\n",
    "- filter\n",
    "- aggregate\n",
    "- compare\n",
    "- trend\n",
    "- count\n",
    "- existence_check",
    "- relationship_lookup",
    "- provenance_lookup",
    "- evidence_lookup",
    "- clarification_needed\n",
    "- no_go\n",
  ], "intent types")
})

test("17. intent contract contains schema/tenant/sensitivity rules", () => {
  requireAll(intent, [
    "candidate_tables and candidate_columns must reference documented schema only.",
    "Denied tables and denied columns must override candidate tables and candidate columns.",
    "Unknown schema must be represented as unsupported_assumptions or clarification_questions.",
    "The model must not invent schema.",
    "The model must not use model confidence as schema evidence.",
  ], "intent schema reference rules")
  requireAll(intent, [
    "tenant_id is required.",
    "tenant_scope_requirement is required.",
    "A Query Intent without tenant_id is No-Go.",
    "A Query Intent without tenant_scope_requirement is No-Go.",
    "A Query Intent must not request cross-tenant access.",
  ], "intent tenant scope rules")
  requireAll(intent, [
    "secret_or_token data must not be requested.",
    "blocked_input data must not be requested.",
    "unknown_sensitive data must not be requested.",
    "personal_data must require human review and redaction consideration.",
    "redaction_needed must be explicit when sensitive data may appear.",
  ], "intent sensitivity rules")
})

test("18. intent contract contains evidence/clarification/unsafe/validation rules", () => {
  requireAll(intent, [
    "Query Intent may state evidence_need.",
    "Query Intent may state provenance_need.",
    "Query Intent must not claim that evidence exists.",
    "Query Intent must not be treated as evidence.",
    "Future query results must restore provenance before they can support human review.",
  ], "intent evidence/provenance expectations")
  requireAll(intent, [
    "Clarification is required when tenant scope is unclear.",
    "Clarification is required when schema references are unknown.",
    "Clarification is required when sensitivity or redaction handling is unclear.",
    "Clarification is required when the requested information need cannot be safely mapped to documented schema.",
  ], "intent clarification requirements")
  requireAll(intent, [
    "Unsafe requests must produce no_go or clarification_needed.",
    "Unsafe requests must not produce SQL.",
    "Unsafe requests must not produce Safe Query Plans.",
    "Unsafe requests must not authorize execution.",
  ], "intent unsafe handling")
  requireAll(intent, [
    "A valid Query Intent must contain tenant_id.",
    "A valid Query Intent must contain tenant_scope_requirement.",
    "A valid Query Intent must not contain executable SQL.",
    "A valid Query Intent must not reference undocumented schema as fact.",
    "A valid Query Intent must preserve denied tables and denied columns.",
    "A valid Query Intent must mark unsupported assumptions.",
    "A valid Query Intent must not authorize execution.",
  ], "intent validation rules")
})

test("19. intent contract contains Pass/Warn/Fail/No-Go outcomes and non-authorization statement", () => {
  requireAll(intent, [
    "Pass:\nThe Query Intent is tenant-scoped, non-executable, schema-grounded, and safe for future rule review.",
    "Warn:\nThe Query Intent is non-executable and tenant-scoped, but clarification or quality improvement is needed.",
    "Fail:\nRequired fields or grounding requirements are missing, but no hard safety boundary is crossed.",
    "No-Go:\nA hard safety boundary is violated, such as executable SQL output, missing tenant scope, cross-tenant request, denied schema request, secret_or_token request, blocked_input request, or execution authorization.",
  ], "intent outcomes")
  assert.ok(intent.includes(
    "This Query Intent Contract authorizes no SQL generation, no SQL execution, no D1 execution, no Safe Query Plan generation, no runtime query planner, no database access, no LLM-controlled database access, no GraphRAG implementation, no vectorization, no real LLM enablement, no external execution, no Formal WorkUnit promotion, and no automated decision-making.",
  ))
})
