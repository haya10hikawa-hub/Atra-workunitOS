/**
 * P6.4 — Relationship Schema / Graph Model contract.
 *
 * Static, read-only guards (matching the repo's constitution / decomposition-standard test
 * convention) so a future edit cannot silently weaken the product-level relationship schema
 * or graph model: the definitions, not-relationship / not-graph lists, typed properties and
 * fields, relationship/node/edge types, tenant-scope + evidence/provenance rules, and the
 * future-gating and non-authorization boundaries.
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

const REL = path.join(root, "docs/archive/v0/RELATIONSHIP_SCHEMA.md")
const GRAPH = path.join(root, "docs/archive/v0/GRAPH_MODEL.md")

const read = (p: string): string => (existsSync(p) ? readFileSync(p, "utf8") : "")
const rel = read(REL)
const graph = read(GRAPH)

const requireAll = (haystack: string, needles: string[], label: string): void => {
  for (const n of needles) assert.ok(haystack.includes(n), `${label} must include: ${n}`)
}

// ── Files exist ──────────────────────────────────────────────

test("1. docs/archive/v0/RELATIONSHIP_SCHEMA.md exists", () => {
  assert.equal(existsSync(REL), true)
  assert.ok(rel.length > 0)
})

test("2. docs/archive/v0/GRAPH_MODEL.md exists", () => {
  assert.equal(existsSync(GRAPH), true)
  assert.ok(graph.length > 0)
})

// ── Required sections ────────────────────────────────────────

test("3. RELATIONSHIP_SCHEMA contains all required sections", () => {
  requireAll(rel, [
    "## 1. Purpose",
    "## 2. Scope",
    "## 3. Definition of Relationship",
    "## 4. What Relationships Are Not",
    "## 5. Relationship Principles",
    "## 6. Required Relationship Properties",
    "## 7. Relationship Types",
    "## 8. Evidence Relationships",
    "## 9. Provenance Relationships",
    "## 10. Dependency Relationships",
    "## 11. Duplicate and Conflict Relationships",
    "## 12. Risk and Mitigation Relationships",
    "## 13. Human Review and Approval Relationships",
    "## 14. Action Candidate Relationships",
    "## 15. Tenant Scope and Isolation",
    "## 16. Relationship Quality Rubric",
    "## 17. Non-authorization Statement",
  ], "RELATIONSHIP_SCHEMA sections")
})

test("4. GRAPH_MODEL contains all required sections", () => {
  requireAll(graph, [
    "## 1. Purpose",
    "## 2. Scope",
    "## 3. Definition of Atra Graph",
    "## 4. What the Graph Is Not",
    "## 5. Graph Node Types",
    "## 6. Graph Edge Types",
    "## 7. Node Required Fields",
    "## 8. Edge Required Fields",
    "## 9. Evidence and Provenance in the Graph",
    "## 10. Tenant Scope",
    "## 11. Contradiction, Conflict, and Missing Information",
    "## 12. Relationship to Typed Decomposition Objects",
    "## 13. Relationship to Future GraphRAG and Vector Retrieval",
    "## 14. Relationship to Future NL2SQL and D1 Queries",
    "## 15. Relationship to Future LLM Judgment",
    "## 16. Graph Quality Rubric",
    "## 17. Non-authorization Statement",
  ], "GRAPH_MODEL sections")
})

// ── RELATIONSHIP_SCHEMA content ──────────────────────────────

test("5. RELATIONSHIP_SCHEMA contains the relationship definition sentence", () => {
  assert.ok(rel.includes(
    "A relationship is a typed, tenant-scoped, provenance-aware connection between Atra objects that explains support, contradiction, dependency, duplication, risk, review, approval, or action context.",
  ))
})

test("6. RELATIONSHIP_SCHEMA contains the Japanese conceptual sentence", () => {
  assert.ok(rel.includes(
    "関係性とは、Atra内のオブジェクト同士を結び、支持・矛盾・依存・重複・リスク・レビュー・承認・action contextを説明する、型付き・tenant-scoped・provenance-awareな接続である。",
  ))
})

test("7. RELATIONSHIP_SCHEMA contains all not-relationship items", () => {
  requireAll(rel, [
    "- decorative links",
    "- untyped references",
    "- model intuition",
    "- vector similarity by itself",
    "- proof of truth",
    "- permission to execute",
    "- approval\n",
    "- Formal WorkUnit promotion",
    "- cross-tenant association",
  ], "RELATIONSHIP_SCHEMA not-relationship list")
})

test("8. RELATIONSHIP_SCHEMA contains all required relationship properties", () => {
  requireAll(rel, [
    "- relationship_id",
    "- tenant_id",
    "- source_object_id",
    "- target_object_id",
    "- relationship_type",
    "- evidence_refs",
    "- provenance_refs",
    "- confidence_source",
    "- human_review_required",
    "- created_by_system",
    "- created_at",
  ], "RELATIONSHIP_SCHEMA required properties")
})

test("9. RELATIONSHIP_SCHEMA contains all relationship types", () => {
  requireAll(rel, [
    "- derived_from",
    "- supports",
    "- weakens",
    "- contradicts",
    "- qualifies",
    "- depends_on",
    "- blocks\n",
    "- blocked_by",
    "- duplicate_of",
    "- conflicts_with",
    "- mitigates",
    "- requires_evidence",
    "- requires_human_review",
    "- suggested_action_for",
    "- preview_for",
    "- approval_requested_for",
    "- approved_by",
  ], "RELATIONSHIP_SCHEMA relationship types")
})

test("10. RELATIONSHIP_SCHEMA contains all required rules", () => {
  requireAll(rel, [
    "Every relationship must be tenant-scoped.",
    "A relationship must not cross tenant boundaries.",
    "A relationship must preserve evidence references and provenance references when it affects priority, risk, action readiness, human review, or future retrieval.",
    "Vector similarity is not a relationship unless resolved into a typed relationship with provenance.",
    "A relationship that contradicts another object must be preserved as a review signal, not silently resolved by the model.",
    "A relationship may support human review, but it must not authorize execution.",
    "Approval relationships must not be treated as execution relationships.",
    "Preview relationships must not be treated as approval relationships.",
    "A relationship must not promote a WorkUnit Candidate into a Formal WorkUnit.",
  ], "RELATIONSHIP_SCHEMA rules")
})

test("11. RELATIONSHIP_SCHEMA contains the quality rubric and non-authorization statement", () => {
  requireAll(rel, [
    "- type clarity",
    "- tenant isolation",
    "- evidence coverage",
    "- provenance preservation",
    "- direction correctness",
    "- review usefulness",
    "- contradiction preservation",
    "- dependency usefulness",
    "- duplicate clarity",
    "- execution-safety",
  ], "RELATIONSHIP_SCHEMA quality rubric")
  assert.ok(rel.includes(
    "This Relationship Schema authorizes no runtime relationship storage, no graph database implementation, no GraphRAG implementation, no vectorization, no NL2SQL execution, no real LLM enablement, no external execution, no Formal WorkUnit promotion, and no automated decision-making.",
  ))
})

// ── GRAPH_MODEL content ──────────────────────────────────────

test("12. GRAPH_MODEL contains the graph definition sentence", () => {
  assert.ok(graph.includes(
    "The Atra graph is a product-level model of typed nodes and edges for explaining decisions, not a runtime graph database in this phase.",
  ))
})

test("13. GRAPH_MODEL contains the Japanese conceptual sentence", () => {
  assert.ok(graph.includes(
    "Atra graphとは、判断を説明するための型付きnodeとedgeのproduct-level modelであり、このフェーズでruntime graph databaseを実装するものではない。",
  ))
})

test("14. GRAPH_MODEL contains all graph node types", () => {
  requireAll(graph, [
    "- Signal\n",
    "- Intent\n",
    "- Problem\n",
    "- WorkUnitCandidate",
    "- ActionCandidate",
    "- Evidence\n",
    "- Provenance\n",
    "- MissingInformation",
    "- Risk\n",
    "- Dependency\n",
    "- Duplicate\n",
    "- Conflict\n",
    "- HumanReview",
    "- Preview\n",
    "- Approval\n",
    "- Project",
    "- Goal",
    "- Person",
  ], "GRAPH_MODEL node types")
})

test("15. GRAPH_MODEL contains all graph edge types", () => {
  requireAll(graph, [
    "- derived_from",
    "- supports",
    "- weakens",
    "- contradicts",
    "- qualifies",
    "- depends_on",
    "- blocks\n",
    "- blocked_by",
    "- duplicate_of",
    "- conflicts_with",
    "- mitigates",
    "- requires_evidence",
    "- requires_human_review",
    "- suggested_action_for",
    "- preview_for",
    "- approval_requested_for",
    "- approved_by",
  ], "GRAPH_MODEL edge types")
})

test("16. GRAPH_MODEL contains all node and edge required fields", () => {
  requireAll(graph, [
    "- node_id",
    "- tenant_id",
    "- node_type",
    "- canonical_label",
    "- provenance_refs",
    "- evidence_refs",
    "- trust_level",
    "- lifecycle_state",
  ], "GRAPH_MODEL node fields")
  requireAll(graph, [
    "- edge_id",
    "- source_node_id",
    "- target_node_id",
    "- edge_type",
    "- human_review_required",
  ], "GRAPH_MODEL edge fields")
})

test("17. GRAPH_MODEL contains all required graph rules", () => {
  requireAll(graph, [
    "Every graph node must be tenant-scoped.",
    "Every graph edge must be tenant-scoped.",
    "A graph edge must not cross tenant boundaries.",
    "The graph must preserve contradiction, conflict, and missing information as reviewable structures.",
    "The graph must not silently resolve truth when evidence conflicts.",
    "Typed Decomposition Objects may become graph nodes or graph-node inputs only after their own future implementation gate.",
    "GraphRAG may use the graph only after a separate GraphRAG gate.",
    "Vector retrieval may use graph-derived projections only after a separate vector/retrieval gate.",
    "NL2SQL and D1 query results may attach to graph nodes only after a separate read-only query planning gate.",
    "LLM judgment may inspect graph context only after a separate LLM judgment evaluation gate.",
    "The graph must not authorize execution.",
  ], "GRAPH_MODEL rules")
})

test("18. GRAPH_MODEL contains the quality rubric and non-authorization statement", () => {
  requireAll(graph, [
    "- node type clarity",
    "- edge type clarity",
    "- tenant isolation",
    "- provenance completeness",
    "- evidence restoration",
    "- contradiction preservation",
    "- missing information visibility",
    "- dependency usefulness",
    "- human review usefulness",
    "- future retrieval safety",
  ], "GRAPH_MODEL quality rubric")
  assert.ok(graph.includes(
    "This Graph Model authorizes no runtime graph database, no graph storage, no GraphRAG implementation, no vectorization, no NL2SQL execution, no D1 query execution, no real LLM enablement, no external execution, no Formal WorkUnit promotion, and no automated decision-making.",
  ))
})
