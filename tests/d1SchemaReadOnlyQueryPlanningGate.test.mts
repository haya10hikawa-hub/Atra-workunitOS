/**
 * P6.6 — D1 Schema Catalog / Read-only Query Planning Spec contract.
 *
 * Static, read-only guards (matching the repo's constitution / decomposition / graph /
 * evaluation test convention) so a future edit cannot silently weaken the D1 catalog or the
 * read-only query planning spec: the definitions, not-lists, catalog field/class rules,
 * denied operations, tenant enforcement, provenance/evidence rules, and non-authorization.
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

const CATALOG = path.join(root, "docs/D1_SCHEMA_CATALOG.md")
const PLAN = path.join(root, "docs/READ_ONLY_QUERY_PLANNING_SPEC.md")

const read = (p: string): string => (existsSync(p) ? readFileSync(p, "utf8") : "")
const catalog = read(CATALOG)
const plan = read(PLAN)

const requireAll = (haystack: string, needles: string[], label: string): void => {
  for (const n of needles) assert.ok(haystack.includes(n), `${label} must include: ${n}`)
}

// ── Files exist ──────────────────────────────────────────────

test("1. docs/D1_SCHEMA_CATALOG.md exists", () => {
  assert.equal(existsSync(CATALOG), true)
  assert.ok(catalog.length > 0)
})

test("2. docs/READ_ONLY_QUERY_PLANNING_SPEC.md exists", () => {
  assert.equal(existsSync(PLAN), true)
  assert.ok(plan.length > 0)
})

// ── Required sections ────────────────────────────────────────

test("3. D1_SCHEMA_CATALOG contains all required sections", () => {
  requireAll(catalog, [
    "## 1. Purpose",
    "## 2. Scope",
    "## 3. Definition of D1 Schema Catalog",
    "## 4. What the Catalog Is Not",
    "## 5. Cataloging Principles",
    "## 6. Schema Discovery Source Rules",
    "## 7. Table Registry",
    "## 8. Column Classification",
    "## 9. Tenant Scope Requirements",
    "## 10. Sensitivity and Redaction Classes",
    "## 11. Evidence and Provenance Relevance",
    "## 12. Queryability Classification",
    "## 13. Unknown / Future / Deprecated Schema Handling",
    "## 14. Relationship to Read-only Query Planning",
    "## 15. Relationship to Future NL2SQL / GraphRAG / LLM Judgment",
    "## 16. Catalog Quality Rubric",
    "## 17. Non-authorization Statement",
  ], "D1_SCHEMA_CATALOG sections")
})

test("4. READ_ONLY_QUERY_PLANNING_SPEC contains all required sections", () => {
  requireAll(plan, [
    "## 1. Purpose",
    "## 2. Scope",
    "## 3. Definition of Read-only Query Planning",
    "## 4. What Read-only Query Planning Is Not",
    "## 5. Query Planning Flow",
    "## 6. Query Intent",
    "## 7. Safe Query Plan",
    "## 8. Required Plan Fields",
    "## 9. Tenant Scope Enforcement",
    "## 10. Allowlist and Denylist Rules",
    "## 11. Cost, Row, and Time Limits",
    "## 12. Result Provenance Requirements",
    "## 13. Evidence Eligibility for Query Results",
    "## 14. Human Review Requirements",
    "## 15. Relationship to Future NL2SQL / D1 Execution / GraphRAG / LLM Judgment",
    "## 16. Query Planning Quality Rubric",
    "## 17. Non-authorization Statement",
  ], "READ_ONLY_QUERY_PLANNING_SPEC sections")
})

// ── Catalog content ──────────────────────────────────────────

test("5. catalog contains the definition sentence (EN + JP)", () => {
  assert.ok(catalog.includes(
    "A D1 Schema Catalog is a documentation-only inventory of known D1 tables, columns, tenant scope, sensitivity, queryability, and evidence/provenance relevance.",
  ))
  assert.ok(catalog.includes(
    "D1 Schema Catalogとは、既知のD1 table・column・tenant scope・sensitivity・queryability・evidence/provenance上の意味を記録するdocumentation-onlyな目録である。",
  ))
})

test("6. catalog contains all not-catalog items", () => {
  requireAll(catalog, [
    "- a migration",
    "- a database implementation",
    "- a runtime schema registry",
    "- a query executor",
    "- an ORM",
    "- an API contract by itself",
    "- an authorization layer",
    "- an evidence store",
    "- a provenance store",
    "- a source of truth when repository schema files disagree",
  ], "catalog not-list")
})

test("7. catalog contains all schema discovery source rules", () => {
  requireAll(catalog, [
    "- migrations",
    "- existing schema files",
    "- existing repository code",
    "- existing tests",
    "- existing docs",
    "- explicit human confirmation",
  ], "catalog discovery sources")
})

test("8. catalog contains all table entry field requirements", () => {
  requireAll(catalog, [
    "- table_name",
    "- status\n",
    "- discovery_source",
    "- tenant_scope_field",
    "- primary_key",
    "- sensitivity_class",
    "- queryability\n",
    "- evidence_relevance",
    "- provenance_relevance",
    "- mutation_allowed_by_this_phase",
    "- notes",
  ], "catalog table fields")
})

test("9. catalog contains all column classification requirements", () => {
  requireAll(catalog, [
    "- column_name",
    "- data_kind",
    "- tenant_scope_relevance",
    "- redaction_required",
  ], "catalog column fields")
})

test("10. catalog contains all sensitivity classes", () => {
  requireAll(catalog, [
    "- public_metadata",
    "- internal_metadata",
    "- tenant_scoped_business_data",
    "- personal_data",
    "- secret_or_token",
    "- blocked_input",
    "- unknown_sensitive",
  ], "catalog sensitivity classes")
})

test("11. catalog contains all queryability classes", () => {
  requireAll(catalog, [
    "- queryable_read_only",
    "- queryable_with_redaction",
    "- aggregate_only",
    "- human_review_required",
    "- not_queryable",
    "- unknown\n",
  ], "catalog queryability classes")
})

test("12. catalog contains all fixed catalog rules", () => {
  requireAll(catalog, [
    "Every cataloged table must declare tenant scope or be marked unknown.",
    "Every cataloged column must declare sensitivity_class or be marked unknown_sensitive.",
    "Secrets, tokens, passwords, and blocked input must be classified as not_queryable.",
    "Unknown schema must not be treated as safe by default.",
    "The catalog must not authorize mutation.",
    "The catalog must not authorize query execution.",
    "The catalog must not authorize NL2SQL.",
    "A schema entry may support query planning only when tenant scope, sensitivity, queryability, and provenance relevance are documented.",
  ], "catalog fixed rules")
})

test("13. catalog contains the quality rubric and non-authorization statement", () => {
  requireAll(catalog, [
    "- schema source traceability",
    "- tenant scope clarity",
    "- sensitivity classification",
    "- queryability clarity",
    "- evidence relevance clarity",
    "- provenance relevance clarity",
    "- unknown handling",
    "- mutation safety",
    "- future-query usefulness",
    "- non-authorization clarity",
  ], "catalog quality rubric")
  assert.ok(catalog.includes(
    "This D1 Schema Catalog authorizes no migration, no database implementation, no runtime schema registry, no query execution, no NL2SQL execution, no GraphRAG implementation, no vectorization, no real LLM enablement, no external execution, and no automated decision-making.",
  ))
})

// ── Query planning content ───────────────────────────────────

test("14. plan spec contains the definition sentence (EN + JP)", () => {
  assert.ok(plan.includes(
    "Read-only query planning is the creation of a constrained, tenant-scoped, provenance-aware plan for retrieving decision-relevant information without mutation, external authority, or LLM-controlled database access.",
  ))
  assert.ok(plan.includes(
    "Read-only query planningとはSQL実行ではない。判断に関係する情報を、変更・外部権限・LLMによるDB直接操作なしに取得するための、制約付き・tenant-scoped・provenance-awareな計画を作ることである。",
  ))
})

test("15. plan spec contains all not-query-planning items", () => {
  requireAll(plan, [
    "- SQL execution",
    "- NL2SQL execution",
    "- free-form SQL generation",
    "- database mutation",
    "- external action",
    "- evidence by itself",
    "- approval\n",
    "- execution authorization",
    "- LLM-controlled database access",
    "- production data processing by itself",
  ], "plan not-list")
})

test("16. plan spec contains the query planning flow", () => {
  assert.ok(plan.includes(
    "User / WorkUnit question → Query Intent → Safe Query Plan → Human or Rule Review → Future gated execution → Provenance-bearing result",
  ))
})

test("17. plan spec contains all required plan fields", () => {
  requireAll(plan, [
    "- plan_id",
    "- tenant_id",
    "- related_goal_id",
    "- related_workunit_candidate_id",
    "- query_intent",
    "- allowed_tables",
    "- allowed_columns",
    "- denied_tables",
    "- denied_columns",
    "- tenant_scope_filter",
    "- sensitivity_handling",
    "- redaction_plan",
    "- aggregation_plan",
    "- row_limit",
    "- time_limit",
    "- cost_limit",
    "- expected_result_shape",
    "- provenance_capture_plan",
    "- evidence_eligibility",
    "- human_review_required",
    "- execution_allowed",
  ], "plan fields")
})

test("18. plan spec contains all tenant enforcement rules", () => {
  requireAll(plan, [
    "Tenant scope must be enforced by rules outside the LLM.",
    "A plan without tenant_id is No-Go.",
    "A plan without tenant_scope_filter is No-Go.",
    "A query plan must not cross tenant boundaries.",
  ], "plan tenant enforcement")
})

test("19. plan spec contains all allowlist/denylist rules and denied operations", () => {
  requireAll(plan, [
    "Only allowlisted tables and columns may appear in a Safe Query Plan.",
    "Denied tables and columns must override allowlists.",
    "Secrets, tokens, passwords, blocked input, and unknown_sensitive columns must be denied.",
    "Mutation operations are always denied in this phase.",
  ], "plan allowlist/denylist rules")
  requireAll(plan, [
    "- INSERT",
    "- UPDATE",
    "- DELETE",
    "- DROP",
    "- ALTER",
    "- CREATE",
    "- REPLACE",
    "- UPSERT",
    "- PRAGMA",
    "- ATTACH",
    "- DETACH",
    "- VACUUM",
  ], "plan denied operations")
})

test("20. plan spec contains provenance + evidence eligibility + human review rules", () => {
  requireAll(plan, [
    "A query result is not evidence unless the query plan, tenant scope, selected source rows, and result provenance are recorded.",
    "Query results must preserve table, column, row reference, query plan id, tenant id, obtained_at, and redaction state.",
    "Aggregated results must preserve aggregation method and source scope.",
    "A query result may become evidence only when its tenant scope, query plan, selected source rows, redaction state, and provenance are known.",
    "A query result with unknown tenant scope is No-Go.",
    "A query result from denied columns is No-Go.",
    "A query result must not be treated as truth by default when source rows conflict.",
    "Human review is required when query results affect priority, risk, action readiness, external-action preview, human-review requirement, or promotion readiness.",
    "Human review is required when sensitive data, personal data, redaction, aggregation, contradiction, or missing information is involved.",
  ], "plan provenance/evidence/review rules")
})

test("21. plan spec contains future-system rules, quality rubric, and non-authorization statement", () => {
  requireAll(plan, [
    "Future NL2SQL may produce Query Intent only after a separate NL2SQL planning gate.",
    "Future NL2SQL must not execute SQL directly.",
    "Future D1 execution requires a separate runtime read-only execution gate.",
    "Future GraphRAG may use query results only after provenance is restored.",
    "Future LLM judgment may inspect query results only after a separate LLM judgment evaluation gate.",
    "A query plan must not authorize execution.",
  ], "plan future-system rules")
  requireAll(plan, [
    "- intent clarity",
    "- tenant scope safety",
    "- allowlist correctness",
    "- denylist correctness",
    "- sensitivity handling",
    "- redaction clarity",
    "- cost and row limit clarity",
    "- provenance capture completeness",
    "- evidence eligibility clarity",
    "- non-authorization clarity",
  ], "plan quality rubric")
  assert.ok(plan.includes(
    "This Read-only Query Planning Spec authorizes no SQL execution, no D1 runtime execution, no NL2SQL execution, no free-form SQL generation, no database mutation, no runtime query planner, no GraphRAG implementation, no vectorization, no real LLM enablement, no external execution, and no automated decision-making.",
  ))
})
