/**
 * P6.2 — Evidence Standard / Provenance Model contract.
 *
 * Static, read-only guards (matching the repo's constitution / design-gate test
 * convention) so a future edit cannot silently weaken the product-level definition of
 * evidence and provenance: the definitions, not-evidence list, roles, strength factors,
 * contradiction / missing-info rules, LLM-claim evidence requirement, provenance fields,
 * source types, trust levels, tenant scope, and future-retrieval provenance rules.
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

const EVIDENCE = path.join(root, "docs/EVIDENCE_STANDARD.md")
const PROVENANCE = path.join(root, "docs/PROVENANCE_MODEL.md")

const read = (p: string): string => (existsSync(p) ? readFileSync(p, "utf8") : "")
const evidence = read(EVIDENCE)
const provenance = read(PROVENANCE)

const requireAll = (haystack: string, needles: string[], label: string): void => {
  for (const n of needles) assert.ok(haystack.includes(n), `${label} must include: ${n}`)
}

// ── Files exist ──────────────────────────────────────────────

test("1. docs/EVIDENCE_STANDARD.md exists", () => {
  assert.equal(existsSync(EVIDENCE), true)
  assert.ok(evidence.length > 0)
})

test("2. docs/PROVENANCE_MODEL.md exists", () => {
  assert.equal(existsSync(PROVENANCE), true)
  assert.ok(provenance.length > 0)
})

// ── Required sections ────────────────────────────────────────

test("3. EVIDENCE_STANDARD contains all required sections", () => {
  requireAll(evidence, [
    "## 1. Purpose",
    "## 2. Scope",
    "## 3. Definition of Evidence",
    "## 4. What Is Not Evidence",
    "## 5. Evidence Roles",
    "## 6. Evidence Strength",
    "## 7. First-party vs Third-party Evidence",
    "## 8. Contradiction Handling",
    "## 9. Missing Information Handling",
    "## 10. Evidence Requirements for LLM Claims",
    "## 11. Evidence Requirements for WorkUnits",
    "## 12. Evidence and Human Review",
    "## 13. Non-authorization Statement",
  ], "EVIDENCE_STANDARD sections")
})

test("4. PROVENANCE_MODEL contains all required sections", () => {
  requireAll(provenance, [
    "## 1. Purpose",
    "## 2. Scope",
    "## 3. Definition of Provenance",
    "## 4. Provenance Required Fields",
    "## 5. Source Types",
    "## 6. Source Trust Levels",
    "## 7. Transformation History",
    "## 8. Tenant Scope",
    "## 9. First-party / Third-party Handling",
    "## 10. Contradiction and Missing Information Links",
    "## 11. Retention and Redaction Principles",
    "## 12. Relationship to Future Retrieval / GraphRAG / NL2SQL",
    "## 13. Non-authorization Statement",
  ], "PROVENANCE_MODEL sections")
})

// ── Evidence definitions ─────────────────────────────────────

test("5. EVIDENCE_STANDARD contains the evidence definition sentence", () => {
  assert.ok(evidence.includes(
    "Evidence is provenance-preserving, goal-relevant information that can support, weaken, contradict, or qualify a human decision.",
  ))
})

test("6. EVIDENCE_STANDARD contains the Japanese evidence definition", () => {
  assert.ok(evidence.includes(
    "Evidenceとは、LLMがそれらしく引用できる文章ではなく、出所・取得時刻・信頼度・変換履歴を保持し、人間の判断を支える、弱める、矛盾させる、または条件づける情報である。",
  ))
})

test("7. EVIDENCE_STANDARD contains all not-evidence items", () => {
  requireAll(evidence, [
    "model confidence",
    "unsupported summary",
    "uncited claim",
    "raw retrieved text without provenance",
    "third-party text treated as truth by default",
    "draft content",
    "preview content",
    "approval itself",
    "execution result without source metadata",
  ], "EVIDENCE_STANDARD not-evidence list")
})

test("8. EVIDENCE_STANDARD contains all evidence roles", () => {
  requireAll(evidence, [
    "- supports",
    "- weakens",
    "- contradicts",
    "- qualifies",
    "- contextualizes",
    "- verifies source existence",
  ], "EVIDENCE_STANDARD roles")
})

test("9. EVIDENCE_STANDARD contains all evidence strength factors", () => {
  requireAll(evidence, [
    "- source trust",
    "- provenance completeness",
    "- recency",
    "- directness",
    "- consistency",
    "- tenant scope",
    "- transformation history",
    "- human confirmation status",
  ], "EVIDENCE_STANDARD strength factors")
})

// ── Evidence rules ───────────────────────────────────────────

test("10. EVIDENCE_STANDARD contains the third-party text rule", () => {
  assert.ok(evidence.includes(
    "Third-party text can be evidence that a claim was made, but it is not evidence that the claim is true by default.",
  ))
})

test("11. EVIDENCE_STANDARD contains the contradiction rule", () => {
  assert.ok(evidence.includes(
    "Contradiction must be preserved as a first-class decision signal, not silently resolved by the model.",
  ))
  assert.ok(evidence.includes(
    "Atra may organize evidence, but Atra must not automatically decide truth when sources conflict.",
  ))
})

test("12. EVIDENCE_STANDARD contains the missing-information rule", () => {
  assert.ok(evidence.includes(
    "Missing information must be represented explicitly and must not be treated as negative evidence.",
  ))
})

test("13. EVIDENCE_STANDARD contains the LLM-claim evidence rule", () => {
  assert.ok(evidence.includes(
    "LLM-generated claims that affect priority, risk, action readiness, or human review must reference evidence or be marked as unsupported.",
  ))
})

test("14. EVIDENCE_STANDARD contains the Formal WorkUnit evidence rule", () => {
  assert.ok(evidence.includes("A Formal WorkUnit must not rely on unsupported claims as evidence."))
})

test("15. EVIDENCE_STANDARD contains the non-authorization statement", () => {
  assert.ok(evidence.includes(
    "This Evidence Standard authorizes no runtime evidence storage, no GraphRAG implementation, no NL2SQL execution, no real LLM enablement, no external execution, and no automated decision-making.",
  ))
})

// ── Provenance definitions + fields ──────────────────────────

test("16. PROVENANCE_MODEL contains the provenance definition sentence", () => {
  assert.ok(provenance.includes(
    "Provenance is the record of where information came from, when it was obtained, how it was transformed, and under which tenant and trust boundary it may be used.",
  ))
})

test("17. PROVENANCE_MODEL contains the Japanese provenance definition", () => {
  assert.ok(provenance.includes(
    "Provenanceとは、情報がどこから来て、いつ取得され、どのように変換され、どのtenantと信頼境界の中で利用できるかを示す記録である。",
  ))
})

test("18. PROVENANCE_MODEL contains all required provenance fields", () => {
  requireAll(provenance, [
    "source_id",
    "source_type",
    "source_uri_or_reference",
    "obtained_at",
    "tenant_id",
    "actor_or_system",
    "trust_level",
    "transformation_history",
    "redaction_state",
    "retention_class",
    "evidence_role",
  ], "PROVENANCE_MODEL required fields")
})

test("19. PROVENANCE_MODEL contains all source types", () => {
  requireAll(provenance, [
    "first_party_structured",
    "first_party_semistructured",
    "first_party_unstructured",
    "third_party_text",
    "human_confirmation",
    "system_generated",
  ], "PROVENANCE_MODEL source types")
})

test("20. PROVENANCE_MODEL contains all source trust levels", () => {
  requireAll(provenance, [
    "- untrusted",
    "- sanitized_candidate",
    "- source_verified",
    "- human_confirmed",
    "- system_verified",
  ], "PROVENANCE_MODEL trust levels")
})

// ── Provenance rules ─────────────────────────────────────────

test("21. PROVENANCE_MODEL contains the tenant-scope rule", () => {
  assert.ok(provenance.includes("Every evidence object and provenance record must be tenant-scoped."))
})

test("22. PROVENANCE_MODEL contains the transformation-history rule", () => {
  assert.ok(provenance.includes(
    "Transformation history must preserve whether information was summarized, normalized, redacted, classified, embedded, or linked.",
  ))
})

test("23. PROVENANCE_MODEL contains the redaction rule", () => {
  assert.ok(provenance.includes(
    "Secrets, tokens, passwords, and blocked input must not be preserved as evidence content.",
  ))
})

test("24. PROVENANCE_MODEL contains the retrieval / GraphRAG / NL2SQL restoration rule", () => {
  assert.ok(provenance.includes(
    "Future retrieval, GraphRAG, and NL2SQL outputs must restore provenance before they can be used as evidence.",
  ))
})

test("25. PROVENANCE_MODEL contains the vector-hit rule", () => {
  assert.ok(provenance.includes(
    "A vector hit is not evidence until it resolves back to a provenance-bearing source.",
  ))
})

test("26. PROVENANCE_MODEL contains the SQL-result provenance rule", () => {
  assert.ok(provenance.includes(
    "A SQL result is not evidence unless the query plan, tenant scope, selected source rows, and result provenance are recorded.",
  ))
})

test("27. PROVENANCE_MODEL contains the non-authorization statement", () => {
  assert.ok(provenance.includes(
    "This Provenance Model authorizes no runtime provenance storage, no database schema change, no vector storage, no GraphRAG implementation, no NL2SQL execution, no real LLM enablement, and no external execution.",
  ))
})
