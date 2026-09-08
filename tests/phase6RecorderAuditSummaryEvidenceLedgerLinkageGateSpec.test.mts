/**
 * P6-I5Q: static, read-only tests pinning the Phase 6 Recorder Audit Summary
 * Evidence Ledger Linkage Gate Spec and its explicit human Go record.
 *
 * These tests ONLY read the two P6-I5Q documents and check that the referenced
 * doctrine and lane docs exist on disk. They import no app code, no harness, no
 * fixture; they call no network, no GitHub API, no child_process, no
 * ApprovalStore, no D1, no SQL, no LLM; they append no Evidence Ledger and
 * write no Graph Model; they mutate no files and require no secrets. They
 * inspect documentation, not runtime behavior. To avoid self-match traps, the
 * tests never scan their own source — every assertion targets a document's
 * contents with exact required phrases and anchored section headings, or a
 * file's existence.
 *
 * Structural assertions (section headings, list items) match the raw document
 * text with newline anchors. Prose-sentence assertions match a
 * whitespace-normalized copy of the document, so hard-wrap positions never make
 * an assertion brittle while the exact wording is still pinned.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

function abs(rel: string): string {
  return fileURLToPath(new URL(rel, import.meta.url))
}

function read(rel: string): string {
  return readFileSync(abs(rel), "utf8")
}

/** Exact raw match — used for section headings and list items with `\n` anchors. */
function pinRaw(doc: string, label: string, needles: readonly string[]): void {
  for (const needle of needles) {
    assert.ok(doc.includes(needle), `${label} must contain (raw): <<<${needle}>>>`)
  }
}

/** Whitespace-normalized match — used for prose sentences that may hard-wrap. */
function pinProse(doc: string, label: string, needles: readonly string[]): void {
  const normalized = doc.replace(/\s+/g, " ")
  for (const needle of needles) {
    assert.ok(normalized.includes(needle), `${label} must contain (prose): <<<${needle}>>>`)
  }
}

const GO = "../docs/legacy/P6_I5Q_EXPLICIT_HUMAN_GO.md"
const SPEC = "../docs/legacy/P6_I5Q_RECORDER_AUDIT_SUMMARY_EVIDENCE_LEDGER_LINKAGE_GATE_SPEC.md"

// ─── Files exist ────────────────────────────────────────────────

test("P6-I5Q gate spec doc and explicit human Go doc exist", () => {
  for (const rel of [GO, SPEC]) {
    assert.ok(existsSync(abs(rel)), `${rel} must exist`)
  }
})

// ─── Spec: 32 required sections ─────────────────────────────────

test("gate spec contains all 32 required sections", () => {
  pinRaw(read(SPEC), "SPEC sections", [
    "## 1. Purpose\n",
    "## 2. Scope\n",
    "## 3. Dependency Chain\n",
    "## 4. Existing Recorder Audit Summary Lane State\n",
    "## 5. Evidence Ledger Doctrine Reference\n",
    "## 6. Linkage Terminology\n",
    "## 7. Non-authorization Boundary\n",
    "## 8. What Linkage Would Mean in a Future Loop\n",
    "## 9. What Linkage Does Not Mean\n",
    "## 10. Future Linkage Preconditions\n",
    "## 11. Required Metadata Before Any Future Append\n",
    "## 12. Required Validation Before Any Future Append\n",
    "## 13. Required Human Review Boundary\n",
    "## 14. Required Audit Trail Boundary\n",
    "## 15. Required Privacy and Redaction Boundary\n",
    "## 16. Required Tenant Boundary\n",
    "## 17. Required Idempotency Boundary\n",
    "## 18. Required Failure and No-Go Handling\n",
    "## 19. Forbidden Runtime Escalations\n",
    "## 20. Evidence Ledger Append No-Go Conditions\n",
    "## 21. Graph Model Write No-Go Conditions\n",
    "## 22. ApprovalStore / External Action No-Go Conditions\n",
    "## 23. StartHub Boundary Reminder\n",
    "## 24. D1 / SQL Boundary Reminder\n",
    "## 25. Future Implementation Gate Requirements\n",
    "## 26. Future Test Requirements\n",
    "## 27. Future Audit Requirements\n",
    "## 28. What Is Proven by This Spec\n",
    "## 29. What Is Not Proven by This Spec\n",
    "## 30. Remaining Risks\n",
    "## 31. Recommended Next Safe Options\n",
    "## 32. Validation Commands\n",
  ])
})

// ─── Spec: lane lineage named ───────────────────────────────────

test("gate spec names P6-I5K through P6-I5P and their PRs", () => {
  pinProse(read(SPEC), "SPEC lineage", [
    "P6-I5K",
    "P6-I5L",
    "P6-I5M",
    "P6-I5N",
    "P6-I5O",
    "P6-I5P",
    "PR #105",
    "PR #106",
    "PR #107",
    "PR #108",
    "PR #109",
    "PR #110",
  ])
})

// ─── Spec: doctrine references ──────────────────────────────────

test("gate spec references the Evidence Ledger doctrine and the P6-I5P review", () => {
  pinProse(read(SPEC), "SPEC doctrine refs", [
    "ALPHA_EVIDENCE_LEDGER.md",
    "P6-I5P",
    "readiness review",
  ])
})

test("gate spec references Graph Model doc only as out-of-scope / No-Go", () => {
  const doc = read(SPEC)
  assert.ok(doc.includes("GRAPH_MODEL.md"), "SPEC must reference GRAPH_MODEL.md")
  pinProse(doc, "SPEC graph out-of-scope", [
    "Graph Model Write No-Go Conditions",
    "not a Graph Model node",
    "out-of-scope doctrine",
    "writes no graph",
  ])
})

test("referenced doctrine and lane docs exist on disk", () => {
  for (const rel of [
    "../docs/legacy/ALPHA_EVIDENCE_LEDGER.md",
    "../docs/archive/v0/GRAPH_MODEL.md",
    "../docs/legacy/P6_I5P_RECORDER_AUDIT_SUMMARY_LANE_READINESS_REVIEW.md",
    "../docs/legacy/P6_I5K_RECORDER_AUDIT_SUMMARY_SPEC.md",
    "../app/lib/phase6/recorderAuditSummary/validators.ts",
  ]) {
    assert.ok(existsSync(abs(rel)), `${rel} must exist on disk`)
  }
})

// ─── Spec: boundary sections and lists ──────────────────────────

test("gate spec contains the non-authorization boundary", () => {
  pinProse(read(SPEC), "SPEC non-authorization", [
    "A Recorder Audit Summary record is not truth.",
    "A Recorder Audit Summary record is not approval.",
    "A Recorder Audit Summary record is not execution permission.",
    "Evidence Ledger linkage is not Evidence Ledger append.",
    "Evidence Ledger linkage is not Graph Model write.",
    "Evidence Ledger linkage is not production readiness.",
    "Passing this spec is not permission to implement append.",
    "Passing this spec is not permission to wire runtime.",
  ])
})

test("gate spec lists future linkage preconditions", () => {
  pinProse(read(SPEC), "SPEC preconditions", [
    "Future Linkage Preconditions",
    "A new explicit human Go recorded before any linkage code.",
    "A dedicated, separately gated loop",
    "A human reviewer in the loop for every proposed reference — no automated append.",
  ])
})

test("gate spec lists required metadata before any future append", () => {
  pinProse(read(SPEC), "SPEC metadata", [
    "Required Metadata Before Any Future Append",
    "`summary_id`",
    "`payload_hash`",
    "`tenant_id`",
    "`summary_scope`",
    "`created_at`",
    "`non_authorization_statement`",
    "no secret-like value",
    "no raw event payload",
  ])
})

test("gate spec lists required validation before any future append", () => {
  pinProse(read(SPEC), "SPEC validation", [
    "Required Validation Before Any Future Append",
    "validateRecorderAuditSummaryRecord",
    "in_memory_test_only_store",
    "must be rejected, never linked",
  ])
})

test("gate spec states the human review boundary", () => {
  pinProse(read(SPEC), "SPEC human review", [
    "Required Human Review Boundary",
    "No future linkage may bypass human review.",
    "cannot promote itself into the ledger",
    "Automated append is forbidden.",
  ])
})

test("gate spec states the audit trail boundary", () => {
  pinProse(read(SPEC), "SPEC audit trail", [
    "Required Audit Trail Boundary",
    "not an audit runtime and not an audit event emission",
    "runtime audit path remains separate and unchanged",
  ])
})

test("gate spec states the privacy and redaction boundary", () => {
  pinProse(read(SPEC), "SPEC privacy", [
    "Required Privacy and Redaction Boundary",
    "no secrets, no credentials, no tokens",
    "no raw event payloads",
    "Redaction failure is a No-Go.",
    "must not echo input values",
  ])
})

test("gate spec states the tenant boundary", () => {
  pinProse(read(SPEC), "SPEC tenant", [
    "Required Tenant Boundary",
    "must preserve tenant scope",
    "must not leak cross-tenant data",
    "Tenant-scope bypass is a No-Go.",
  ])
})

test("gate spec states the idempotency boundary", () => {
  pinProse(read(SPEC), "SPEC idempotency", [
    "Required Idempotency Boundary",
    "idempotent by stable identifier",
    "duplicate conflict must be fail-closed",
    "overwrite-on-conflict linkage is a No-Go",
  ])
})

// ─── Spec: forbidden escalations and No-Go conditions ───────────

test("gate spec lists forbidden runtime escalations", () => {
  pinRaw(read(SPEC), "SPEC forbidden escalations", [
    "- recorder summary runtime\n",
    "- summary emitter\n",
    "- audit runtime\n",
    "- audit event emitter\n",
    "- Evidence Ledger append\n",
    "- Evidence Ledger writer\n",
    "- Graph Model write\n",
    "- real persistence\n",
    "- durable storage\n",
    "- D1 binding\n",
    "- D1 migration\n",
    "- D1 access\n",
    "- SQL execution\n",
    "- SQL mutation\n",
    "- ApprovalStore integration\n",
    "- P7.1 TSP wiring\n",
    "- StartHub runtime\n",
    "- external action execution\n",
    "- Formal WorkUnit promotion\n",
  ])
})

test("gate spec lists Evidence Ledger append No-Go conditions", () => {
  pinProse(read(SPEC), "SPEC append No-Go", [
    "Evidence Ledger Append No-Go Conditions",
    "no new explicit human Go",
    "no separate gated PR",
    "automated append without human review",
    "This loop performs no append",
  ])
})

test("gate spec lists Graph Model write No-Go conditions", () => {
  pinProse(read(SPEC), "SPEC graph No-Go", [
    "Graph Model Write No-Go Conditions",
    "out of scope and No-Go",
    "not a Graph Model node",
    "writes no graph",
  ])
})

test("gate spec lists ApprovalStore / external action No-Go conditions", () => {
  pinProse(read(SPEC), "SPEC approval No-Go", [
    "ApprovalStore / External Action No-Go Conditions",
    "grants no ApprovalStore authority",
    "P7.1 TSP utilities remain unwired",
    "External action execution remains forbidden.",
  ])
})

test("gate spec contains StartHub and D1/SQL boundary reminders", () => {
  pinProse(read(SPEC), "SPEC StartHub/D1", [
    "StartHub Boundary Reminder",
    "does not implement StartHub runtime",
    "D1 / SQL Boundary Reminder",
    "D1 read-only execution remains P6-I6 or later",
    "does not execute SQL",
  ])
})

// ─── Spec: future gate/test/audit requirements ──────────────────

test("gate spec lists future implementation gate, test, and audit requirements", () => {
  pinProse(read(SPEC), "SPEC future requirements", [
    "Future Implementation Gate Requirements",
    "record a new explicit human Go before code",
    "This spec grants none of these gates.",
    "Future Test Requirements",
    "static source guards confirming no forbidden runtime capability substrings",
    "Future Audit Requirements",
    "security-red-team, test-validation, architecture, and product-release",
  ])
})

// ─── Spec: docs-only + static-test self-statements ──────────────

test("gate spec states its own docs-only + non-authorization boundary", () => {
  pinProse(read(SPEC), "SPEC self-statements", [
    "This loop is docs-only + static-test.",
    "This loop does not append to the Evidence Ledger.",
    "This loop does not write the Graph Model.",
    "This loop does not implement runtime linkage.",
    "This loop does not implement a summary emitter.",
    "This loop does not implement audit runtime.",
    "This loop does not implement persistence.",
    "This loop does not implement durable storage.",
    "This loop does not implement D1 or SQL.",
    "This loop does not wire ApprovalStore.",
    "This loop does not execute external actions.",
    "This loop does not promote Formal WorkUnits.",
    "This loop does not implement StartHub runtime.",
  ])
})

test("gate spec states future append requires separate explicit human Go", () => {
  pinProse(read(SPEC), "SPEC future append gate", [
    "A future Evidence Ledger linkage implementation loop must: record a new explicit human Go before code",
    "scope to a dedicated separately gated PR",
    "This spec grants none of these gates.",
    "only when a human explicitly decides, a separately gated Evidence Ledger linkage",
  ])
})

// ─── Spec: no capability claims ─────────────────────────────────

test("gate spec never claims a forbidden capability was implemented", () => {
  const doc = read(SPEC)
  const forbiddenClaims = [
    "Evidence Ledger was appended",
    "appended to the Evidence Ledger",
    "Graph Model was written",
    "summary emitter is implemented",
    "runtime linkage is implemented",
    "persistence is implemented",
    "durable storage is implemented",
    "D1 access is implemented",
    "SQL was executed",
    "ApprovalStore is wired",
    "StartHub runtime is implemented",
    "production ready",
    "production-ready",
  ]
  for (const claim of forbiddenClaims) {
    assert.ok(!doc.includes(claim), `SPEC must not claim: <<<${claim}>>>`)
  }
})

// ─── Go doc: sign-off content ───────────────────────────────────

test("explicit human Go records the docs-only scope and non-authorization boundary", () => {
  pinProse(read(GO), "GO statements", [
    "P6-I5Q has explicit human Go.",
    "This task is docs-only + static-test.",
    "The task will create only the three allowed files.",
    "The task will not modify `app/`.",
    "The task will not modify `docs/legacy/ALPHA_EVIDENCE_LEDGER.md`.",
    "The task will not modify `docs/archive/v0/GRAPH_MODEL.md`.",
    "No Evidence Ledger append is allowed.",
    "No Graph Model write is allowed.",
    "Gate Spec PASS is not authorization to implement append.",
    "Gate Spec PASS is not authorization to wire runtime.",
    "Any future append implementation requires a separate explicit human Go.",
    "AI proposes. Rules guard. Humans decide.",
  ])
})

// ─── Both-ways sanity (no self-match trap) ──────────────────────

test("assertions are behavioral, not self-matching", () => {
  const doc = read(SPEC)
  assert.ok(doc.includes("## 6. Linkage Terminology\n"))
  assert.ok(!doc.includes("## 99. Nonexistent Section\n"))
  assert.ok(!read(GO).includes("## 99. Nonexistent Section\n"))
})
