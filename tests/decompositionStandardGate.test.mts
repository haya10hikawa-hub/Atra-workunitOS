/**
 * P6.3 — Decomposition Standard / Typed Decomposition Object contract.
 *
 * Static, read-only guards (matching the repo's constitution / evidence-standard test
 * convention) so a future edit cannot silently weaken the product-level decomposition
 * standard or the typed decomposition object contract: the flow, the candidate-only
 * boundary, evidence/provenance requirements, missing-info / risk / dependency / duplicate
 * / conflict / action-candidate fields, and the fixed No-Go rules.
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

const STANDARD = path.join(root, "docs/DECOMPOSITION_STANDARD.md")
const TYPED = path.join(root, "docs/TYPED_DECOMPOSITION_OBJECT.md")

const read = (p: string): string => (existsSync(p) ? readFileSync(p, "utf8") : "")
const standard = read(STANDARD)
const typed = read(TYPED)

const requireAll = (haystack: string, needles: string[], label: string): void => {
  for (const n of needles) assert.ok(haystack.includes(n), `${label} must include: ${n}`)
}

// ── Files exist ──────────────────────────────────────────────

test("1. docs/DECOMPOSITION_STANDARD.md exists", () => {
  assert.equal(existsSync(STANDARD), true)
  assert.ok(standard.length > 0)
})

test("2. docs/TYPED_DECOMPOSITION_OBJECT.md exists", () => {
  assert.equal(existsSync(TYPED), true)
  assert.ok(typed.length > 0)
})

// ── Required sections ────────────────────────────────────────

test("3. DECOMPOSITION_STANDARD contains all required sections", () => {
  requireAll(standard, [
    "## 1. Purpose",
    "## 2. Scope",
    "## 3. Definition of Decomposition",
    "## 4. What Decomposition Is Not",
    "## 5. Decomposition Flow",
    "## 6. Signal",
    "## 7. Intent",
    "## 8. Problem",
    "## 9. WorkUnit Candidate",
    "## 10. Action Candidate",
    "## 11. Missing Information",
    "## 12. Risk, Dependency, Duplicate, and Conflict Handling",
    "## 13. Evidence and Provenance Requirements",
    "## 14. WorkUnit Granularity",
    "## 15. Decomposition Quality Rubric",
    "## 16. Human Review and Promotion Boundary",
    "## 17. Non-authorization Statement",
  ], "DECOMPOSITION_STANDARD sections")
})

test("4. TYPED_DECOMPOSITION_OBJECT contains all required sections", () => {
  requireAll(typed, [
    "## 1. Purpose",
    "## 2. Scope",
    "## 3. Typed Object Principle",
    "## 4. Object Lifecycle",
    "## 5. Required Top-level Fields",
    "## 6. Object Kinds",
    "## 7. Evidence References",
    "## 8. Provenance References",
    "## 9. Missing Information Fields",
    "## 10. Risk Fields",
    "## 11. Dependency Fields",
    "## 12. Duplicate and Conflict Fields",
    "## 13. Action Candidate Fields",
    "## 14. Human Review Fields",
    "## 15. Promotion Blockers",
    "## 16. Relationship to Future Graph / Retrieval / NL2SQL / LLM Judgment",
    "## 17. Non-authorization Statement",
  ], "TYPED_DECOMPOSITION_OBJECT sections")
})

// ── DECOMPOSITION_STANDARD content ───────────────────────────

test("5. DECOMPOSITION_STANDARD contains the decomposition definition sentence", () => {
  assert.ok(standard.includes(
    "Decomposition is the conversion of goal-related signals into candidate decision units with explicit evidence, provenance, missing information, risks, dependencies, conflicts, and human-review requirements.",
  ))
})

test("6. DECOMPOSITION_STANDARD contains the Japanese conceptual sentence", () => {
  assert.ok(standard.includes(
    "分解とは要約ではない。分解とは、goalに関係するSignalを、証拠・provenance・不足情報・リスク・依存関係・矛盾・人間レビュー条件を持つ判断候補単位へ変換することである。",
  ))
})

test("7. DECOMPOSITION_STANDARD contains all not-decomposition items", () => {
  requireAll(standard, [
    "- summarization",
    "- task extraction only",
    "- priority scoring only",
    "- autonomous planning",
    "- execution preparation",
    "- external action authorization",
    "- Formal WorkUnit promotion",
    "- truth resolution by the model",
  ], "DECOMPOSITION_STANDARD not-decomposition list")
})

test("8. DECOMPOSITION_STANDARD contains the full decomposition flow", () => {
  assert.ok(standard.includes(
    "Signal → Intent → Problem → WorkUnit Candidate → Action Candidate → Human Review",
  ))
})

test("9. DECOMPOSITION_STANDARD contains Signal/Intent/Problem/WorkUnit/Action definitions", () => {
  requireAll(standard, [
    "An observed piece of goal-relevant information that may affect a decision, priority, risk, dependency, evidence, or next action.",
    "The inferred or explicit purpose, request, pressure, or decision need contained in a Signal.",
    "The unresolved condition that prevents the user from making or completing a decision.",
    "A candidate decision unit that may become reviewable by a human, but is not a Formal WorkUnit.",
    "A proposed next action, draft, tool suggestion, clarification, or review request attached to a WorkUnit Candidate.",
  ], "DECOMPOSITION_STANDARD definitions")
})

test("10. DECOMPOSITION_STANDARD contains the candidate/promotion/evidence/boundary rules", () => {
  requireAll(standard, [
    "A WorkUnit Candidate is not a Formal WorkUnit.",
    "A Formal WorkUnit must not be created from blocked input.",
    "A Formal WorkUnit must not be created while required evidence or missing information remains unresolved.",
    "Action Candidate means proposed action for human review, not permission to execute.",
    "Decomposition must preserve evidence references and provenance references.",
    "Model confidence must not be used as evidence or as permission to promote a candidate.",
    "Contradiction must be preserved as a review signal, not silently resolved during decomposition.",
    "Missing information must be represented explicitly and must not be treated as negative evidence.",
    "Draft must not be treated as Sent.",
    "Preview must not be treated as Approval.",
    "Approval must not be treated as Execution.",
  ], "DECOMPOSITION_STANDARD rules")
})

test("11. DECOMPOSITION_STANDARD contains all quality rubric items", () => {
  requireAll(standard, [
    "- goal relevance",
    "- evidence coverage",
    "- provenance preservation",
    "- missing information clarity",
    "- risk visibility",
    "- dependency clarity",
    "- duplicate detection",
    "- conflict preservation",
    "- actionability for human review",
    "- candidate-only safety",
  ], "DECOMPOSITION_STANDARD quality rubric")
})

test("12. DECOMPOSITION_STANDARD contains the granularity rule and non-authorization statement", () => {
  assert.ok(standard.includes(
    "A good WorkUnit Candidate should correspond to one human-reviewable decision or one completion condition.",
  ))
  assert.ok(standard.includes(
    "This Decomposition Standard authorizes no runtime decomposition implementation, no Formal WorkUnit promotion, no runtime WorkUnit storage, no GraphRAG implementation, no vectorization, no NL2SQL execution, no real LLM enablement, no external execution, and no automated decision-making.",
  ))
})

// ── TYPED_DECOMPOSITION_OBJECT content ───────────────────────

test("13. TYPED_DECOMPOSITION_OBJECT contains the typed object definition sentence", () => {
  assert.ok(typed.includes(
    "A Typed Decomposition Object is a candidate-only structured representation of a decomposed Signal, designed for human review and future evaluation, not for autonomous execution.",
  ))
})

test("14. TYPED_DECOMPOSITION_OBJECT contains the Japanese conceptual sentence", () => {
  assert.ok(typed.includes(
    "Typed Decomposition Objectとは、分解されたSignalを人間レビューと将来の評価に使うためのcandidate-onlyな構造表現であり、自律実行のための命令ではない。",
  ))
})

test("15. TYPED_DECOMPOSITION_OBJECT contains all required top-level fields", () => {
  requireAll(typed, [
    "- object_id",
    "- tenant_id",
    "- goal_id",
    "- source_signal_refs",
    "- object_kind",
    "- canonical_summary",
    "- evidence_refs",
    "- provenance_refs",
    "- missing_info",
    "- risks",
    "- dependencies",
    "- duplicates",
    "- conflicts",
    "- action_candidates",
    "- action_readiness",
    "- human_review_required",
    "- candidate_only",
    "- promotion_blockers",
    "- created_by_system",
    "- created_at",
  ], "TYPED top-level fields")
})

test("16. TYPED_DECOMPOSITION_OBJECT contains all object kinds", () => {
  // Newline-anchored so a singular kind (e.g. "- risk") is not satisfied by the plural
  // top-level field (e.g. "- risks"); each kind bullet must exist on its own line.
  requireAll(typed, [
    "- signal\n",
    "- intent\n",
    "- problem\n",
    "- workunit_candidate\n",
    "- action_candidate\n",
    "- missing_info\n",
    "- risk\n",
    "- dependency\n",
    "- duplicate\n",
    "- conflict\n",
  ], "TYPED object kinds")
})

test("17. TYPED_DECOMPOSITION_OBJECT contains evidence + provenance reference rules", () => {
  requireAll(typed, [
    "Evidence references must point to provenance-bearing evidence defined by docs/EVIDENCE_STANDARD.md.",
    "A Typed Decomposition Object must not treat model confidence as evidence.",
    "Unsupported claims must be marked unsupported and must not raise action readiness.",
    "Provenance references must point to provenance records defined by docs/PROVENANCE_MODEL.md.",
    "Every Typed Decomposition Object must be tenant-scoped.",
    "Raw retrieved text without provenance must not be used as evidence.",
  ], "TYPED evidence/provenance rules")
})

test("18. TYPED_DECOMPOSITION_OBJECT contains missing-info / risk / dependency / dup-conflict / action fields", () => {
  requireAll(typed, [
    "- missing_field",
    "- why_needed",
    "- blocks_promotion",
    "- suggested_clarification",
  ], "TYPED missing-info fields")
  requireAll(typed, [
    "- risk_type",
    "- risk_description",
    "- severity",
    "- mitigation_candidate",
  ], "TYPED risk fields")
  requireAll(typed, [
    "- depends_on",
    "- blocks\n", // newline-anchored so it is not satisfied by "- blocks_promotion"
    "- blocked_by",
    "- dependency_reason",
  ], "TYPED dependency fields")
  requireAll(typed, [
    "- duplicate_of",
    "- duplicate_reason",
    "- conflicts_with",
    "- conflict_reason",
    "- contradiction_evidence_refs",
  ], "TYPED duplicate/conflict fields")
  requireAll(typed, [
    "- action_type",
    "- tool_suggestion",
    "- draft_allowed",
    "- preview_required",
    "- external_action_level",
    "- requires_approval",
    "- execution_allowed",
  ], "TYPED action candidate fields")
})

test("19. TYPED_DECOMPOSITION_OBJECT contains the fixed candidate-only / No-Go rules", () => {
  requireAll(typed, [
    "candidate_only must be true for every Typed Decomposition Object in this phase.",
    "execution_allowed must be false for every Action Candidate in this phase.",
    "external_action_level must not exceed Level 5 Request Approval in this phase.",
    "Level 6 Execute External Action remains No-Go.",
    "Level 7 Irreversible / High-risk Action remains No-Go.",
    "A Typed Decomposition Object must not authorize GraphRAG, vectorization, NL2SQL execution, real LLM enablement, external execution, or automated decision-making.",
  ], "TYPED fixed rules")
})

test("20. TYPED_DECOMPOSITION_OBJECT contains future-gating rule and non-authorization statement", () => {
  assert.ok(typed.includes(
    "Future GraphRAG, vector retrieval, NL2SQL, and LLM judgment layers may use Typed Decomposition Objects only after their own gates, and only if evidence and provenance references can be restored.",
  ))
  assert.ok(typed.includes(
    "This Typed Decomposition Object contract authorizes no runtime schema migration, no database implementation, no runtime WorkUnit storage, no GraphRAG implementation, no vectorization, no NL2SQL execution, no real LLM enablement, no external execution, and no automated decision-making.",
  ))
})
