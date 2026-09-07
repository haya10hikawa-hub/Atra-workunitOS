/**
 * P6.1 — Atra doctrine / information intake policy / decision rubric contract.
 *
 * Static, read-only guards (matching the repo's alpha-safety-gate / design-gate test
 * convention) so a future edit cannot silently weaken the constitution: the product
 * invariant, the intake classifications, the human-review requirements, the external-action
 * boundary, or the capability permission matrix.
 *
 * This test does NOT touch the network, the GitHub API, child_process, or the filesystem
 * (read-only). It only reads three docs under docs/ and asserts their content. It does NOT
 * scan its own source; every required phrase is asserted against the docs.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync, existsSync } from "node:fs"
import path from "node:path"

const root = process.cwd()

const DOCTRINE = path.join(root, "docs/archive/v0/ATRA_DOCTRINE.md")
const INTAKE = path.join(root, "docs/archive/v0/INFORMATION_INTAKE_POLICY.md")
const RUBRIC = path.join(root, "docs/archive/v0/DECISION_RUBRIC.md")

const read = (p: string): string => (existsSync(p) ? readFileSync(p, "utf8") : "")
const doctrine = read(DOCTRINE)
const intake = read(INTAKE)
const rubric = read(RUBRIC)

const requireAll = (haystack: string, needles: string[], label: string): void => {
  for (const n of needles) assert.ok(haystack.includes(n), `${label} must include: ${n}`)
}

// ── Files exist ──────────────────────────────────────────────

test("1. docs/archive/v0/ATRA_DOCTRINE.md exists", () => {
  assert.equal(existsSync(DOCTRINE), true)
  assert.ok(doctrine.length > 0)
})

test("2. docs/archive/v0/INFORMATION_INTAKE_POLICY.md exists", () => {
  assert.equal(existsSync(INTAKE), true)
  assert.ok(intake.length > 0)
})

test("3. docs/archive/v0/DECISION_RUBRIC.md exists", () => {
  assert.equal(existsSync(RUBRIC), true)
  assert.ok(rubric.length > 0)
})

// ── ATRA_DOCTRINE ────────────────────────────────────────────

test("4. doctrine defines the target user", () => {
  assert.ok(doctrine.includes(
    "Atra is an operating system for knowledge workers who become the bottleneck of their own intellectual work and project decisions.",
  ))
})

test("5. doctrine contains the WorkUnit transformation sentence", () => {
  assert.ok(doctrine.includes(
    "Atra transforms goal-related information into human-reviewable WorkUnits with evidence, relationships, risks, next actions, tool suggestions, and drafts.",
  ))
})

test("6. doctrine contains the draft boundary sentence", () => {
  assert.ok(doctrine.includes(
    "Atra may generate drafts, but Atra must not send drafts without explicit human approval and a separate execution gate.",
  ))
})

test("7. doctrine contains the product invariant", () => {
  assert.ok(doctrine.includes("AI proposes. Rules guard. Humans decide."))
})

test("8. doctrine contains the Japanese North Star sentence", () => {
  assert.ok(doctrine.includes(
    "Atraは、自分が知的作業のボトルネックになっている人のために、goalごとの情報を判断可能なWorkUnitへ変換し、証拠・関係・リスク・次行動・Draftを揃えたうえで、人間が最終判断できる状態を作るOSである。",
  ))
})

test("9. doctrine states what Atra is not / may / must not", () => {
  requireAll(doctrine, [
    "a generic task manager",
    "a search tool",
    "an autonomous execution agent",
    "a system that replaces human judgment",
  ], "doctrine is-not list")
  requireAll(doctrine, [
    "aggregate goal-related information",
    "decompose Signals into WorkUnit candidates",
    "identify missing information",
    "attach evidence",
    "suggest tools for a WorkUnit",
    "generate drafts",
    "prepare external-action previews",
    "request human review",
  ], "doctrine may list")
  requireAll(doctrine, [
    "make final decisions on behalf of humans",
    "approve on behalf of humans",
    "send external messages on behalf of humans",
    "execute external actions on behalf of humans",
    "skip human review based on LLM confidence",
    "promote blocked input into WorkUnits",
    "treat Draft as Sent",
    "treat Preview as Approval",
    "treat Approval as Execution",
  ], "doctrine must-not list")
})

// ── INFORMATION_INTAKE_POLICY ────────────────────────────────

test("10. intake contains the central intake question", () => {
  assert.ok(intake.includes(
    "Does this information change a user goal, decision, priority, risk, dependency, evidence, or next action?",
  ))
})

test("11. intake contains accepted / ignored / held / blocked definitions", () => {
  requireAll(intake, [
    "Information that can connect to a goal, judgment, action, risk, deadline, responsibility, evidence, WorkUnit, or WorkUnit update.",
    "Information that does not change the current goal, judgment, priority, risk, dependency, evidence, or next action.",
    "Information that may matter but lacks goal relevance, evidence, owner, deadline, source trust, or authority conditions.",
    "Information that Atra must not ingest, decompose, promote, or use because of authority, secret, safety, tenant-boundary, prompt-injection, or unauthorized-execution risk.",
  ], "intake definitions")
  requireAll(intake, [
    "Atra accepts information when it can change a goal, decision, priority, risk, dependency, evidence, or next action.",
    "Atra holds information when it may matter but lacks sufficient goal relevance, evidence, owner, deadline, or source trust.",
    "Atra blocks information that violates tenant boundaries, contains secrets, attempts prompt injection, or requests unauthorized execution.",
  ], "intake classification sentences")
})

test("12. intake contains the blocked-input rules", () => {
  assert.ok(intake.includes("Blocked input must be rejected or redacted before decomposition."))
  assert.ok(intake.includes("Blocked classification should be rule-first and fail-closed."))
})

test("13. intake contains the ignored and held rules", () => {
  assert.ok(intake.includes("Ignored means not relevant to the current decision, not nonexistent."))
  assert.ok(intake.includes(
    "Held input must not be promoted to a Formal WorkUnit until missing information is resolved.",
  ))
})

// ── DECISION_RUBRIC ──────────────────────────────────────────

test("14. rubric contains the action-readiness sentence", () => {
  assert.ok(rubric.includes(
    "Action readiness means readiness for human review, not permission to execute.",
  ))
})

test("15. rubric contains the LLM confidence sentence", () => {
  assert.ok(rubric.includes("LLM confidence must not skip human review."))
})

test("16. rubric contains the draft boundary", () => {
  assert.ok(rubric.includes("Draft generation is allowed. Draft sending is not allowed."))
  assert.ok(rubric.includes("Draft is decision support. Sending is external authority."))
})

test("17. rubric contains the preview / approval / execution boundary", () => {
  assert.ok(rubric.includes("Preview is not approval. Approval is not execution."))
})

test("18. rubric contains the external-action definition and checklist sentence", () => {
  assert.ok(rubric.includes(
    "External action means any action that sends, publishes, creates, modifies, deletes, shares, or commits information outside Atra's internal workspace.",
  ))
  assert.ok(rubric.includes(
    "External action requires recipient, destination, payload, reason, related goal, evidence, reversibility, impact scope, secret and PII check, tenant boundary check, explicit human approval, and audit event.",
  ))
  requireAll(rubric, [
    "Gmail sending",
    "Slack posting",
    "GitHub issue creation",
    "Calendar invitation sending",
    "external API writes",
    "file sharing",
    "public-setting changes",
    "permission changes",
  ], "rubric external-action examples")
})

test("19. rubric contains all rubric axes", () => {
  // Bullet-anchored needles so deleting an axis bullet fails even when the bare
  // word also appears elsewhere in the rubric prose (auditor-hardened).
  requireAll(rubric, [
    "- goal relevance",
    "- urgency",
    "- impact\n",
    "- evidence strength",
    "- uncertainty\n",
    "- reversibility\n",
    "- authority risk",
    "- human review requirement",
  ], "rubric axes")
})

test("20. rubric contains all capability permission levels with Current Go / No-Go", () => {
  requireAll(rubric, [
    "Level 0: Read / Observe",
    "Level 1: Classify / Decompose",
    "Level 2: Suggest",
    "Level 3: Draft",
    "Level 4: Prepare Preview",
    "Level 5: Request Approval",
    "Level 6: Execute External Action",
    "Level 7: Irreversible / High-risk Action",
  ], "capability levels")
  assert.ok(rubric.includes("Current Go:"))
  assert.ok(rubric.includes("Current No-Go:"))
  assert.ok(rubric.includes(
    "Current Atra may read, classify, decompose, suggest, draft, prepare preview, and request approval, but must not execute external actions or irreversible high-risk actions.",
  ))
})

test("21. rubric contains human-review requirements and No-Go conditions", () => {
  requireAll(rubric, [
    "external sending is involved",
    "the impact scope extends beyond the user",
    "the action is irreversible or difficult to reverse",
    "authority, secrets, or personal information are involved",
    "source trust is low",
    "evidence is insufficient",
    "information conflicts are present",
    "the LLM reports uncertainty",
    "a draft connects to external sending",
    "the workflow approaches approval or execution",
  ], "human review requirements")
  requireAll(rubric, [
    "WorkUnit promotion based on blocked input",
    "cross-tenant processing",
    "external sending without approval",
    "external API write without approval",
    "treating Draft as Sent",
    "treating Preview as Approval",
    "treating Approval as Execution",
    "skipping review based on LLM confidence",
    "generating or sending payloads containing secrets, tokens, or passwords",
    "automatic execution of irreversible actions",
  ], "rubric No-Go conditions")
})
