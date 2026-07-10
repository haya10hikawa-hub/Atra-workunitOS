/**
 * P6-I5R: static, read-only tests pinning the Phase 6 Recorder Audit Summary
 * Evidence Ledger Static Contract / No-Append Validator Spec and its explicit
 * human Go record.
 *
 * These tests ONLY read the two P6-I5R documents and check that the referenced
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

const GO = "../docs/P6_I5R_EXPLICIT_HUMAN_GO.md"
const SPEC =
  "../docs/P6_I5R_RECORDER_AUDIT_SUMMARY_EVIDENCE_LEDGER_STATIC_CONTRACT_NO_APPEND_VALIDATOR_SPEC.md"

// ─── Files exist ────────────────────────────────────────────────

test("P6-I5R spec doc and explicit human Go doc exist", () => {
  for (const rel of [GO, SPEC]) {
    assert.ok(existsSync(abs(rel)), `${rel} must exist`)
  }
})

// ─── Spec: 34 required sections ─────────────────────────────────

test("static contract spec contains all 34 required sections", () => {
  pinRaw(read(SPEC), "SPEC sections", [
    "## 1. Purpose\n",
    "## 2. Scope\n",
    "## 3. Dependency Chain\n",
    "## 4. Relationship to P6-I5Q Gate Spec\n",
    "## 5. Evidence Ledger Doctrine Reference\n",
    "## 6. Static Contract Overview\n",
    "## 7. Future Linkage Candidate Shape\n",
    "## 8. Required Fields\n",
    "## 9. Forbidden Fields\n",
    "## 10. Field-level Semantics\n",
    "## 11. Validator Input Semantics\n",
    "## 12. Validator Output Semantics\n",
    "## 13. Fail-closed Issue Codes\n",
    "## 14. No-Append Guarantee\n",
    "## 15. Determinism and Idempotency Requirements\n",
    "## 16. Non-echoing Issue Requirements\n",
    "## 17. Privacy and Redaction Checks\n",
    "## 18. Tenant Boundary Checks\n",
    "## 19. Source Lineage Checks\n",
    "## 20. Payload Hash Checks\n",
    "## 21. Human Review Boundary Checks\n",
    "## 22. Evidence Ledger Append Rejection Rules\n",
    "## 23. Graph Model Write Rejection Rules\n",
    "## 24. ApprovalStore / External Action Rejection Rules\n",
    "## 25. StartHub Runtime Rejection Rules\n",
    "## 26. D1 / SQL Rejection Rules\n",
    "## 27. Future Implementation Requirements\n",
    "## 28. Future Test Requirements\n",
    "## 29. Future Audit Requirements\n",
    "## 30. What Is Proven by This Spec\n",
    "## 31. What Is Not Proven by This Spec\n",
    "## 32. Remaining Risks\n",
    "## 33. Recommended Next Safe Options\n",
    "## 34. Validation Commands\n",
  ])
})

// ─── Spec: lane lineage and P6-I5Q reference ────────────────────

test("spec names P6-I5K through P6-I5Q and references the P6-I5Q gate spec", () => {
  pinProse(read(SPEC), "SPEC lineage", [
    "P6-I5K",
    "P6-I5L",
    "P6-I5M",
    "P6-I5N",
    "P6-I5O",
    "P6-I5P",
    "P6-I5Q",
    "PR #105",
    "PR #111",
    "Relationship to P6-I5Q Gate Spec",
    "P6-I5Q defined the linkage gate",
  ])
})

// ─── Spec: doctrine references ──────────────────────────────────

test("spec references the Evidence Ledger doctrine", () => {
  pinProse(read(SPEC), "SPEC doctrine refs", [
    "ALPHA_EVIDENCE_LEDGER.md",
    "human-readable, plain-Markdown review record",
  ])
})

test("spec references Graph Model doc only as out-of-scope / No-Go", () => {
  const doc = read(SPEC)
  assert.ok(doc.includes("GRAPH_MODEL.md"), "SPEC must reference GRAPH_MODEL.md")
  pinProse(doc, "SPEC graph out-of-scope", [
    "Graph Model Write Rejection Rules",
    "out-of-scope doctrine",
    "writes no graph",
  ])
})

test("referenced doctrine and lane docs exist on disk", () => {
  for (const rel of [
    "../docs/ALPHA_EVIDENCE_LEDGER.md",
    "../docs/GRAPH_MODEL.md",
    "../docs/P6_I5Q_RECORDER_AUDIT_SUMMARY_EVIDENCE_LEDGER_LINKAGE_GATE_SPEC.md",
    "../app/lib/phase6/recorderAuditSummary/validators.ts",
  ]) {
    assert.ok(existsSync(abs(rel)), `${rel} must exist on disk`)
  }
})

// ─── Spec: static contract overview + candidate shape ───────────

test("spec contains the static contract overview and candidate shape", () => {
  pinProse(read(SPEC), "SPEC contract overview", [
    "Static Contract Overview",
    "Static Contract is not runtime contract enforcement",
    "Future Linkage Candidate Shape",
    "Linkage Candidate is not a Ledger Entry.",
    "Linkage Reference is not a Ledger Append.",
  ])
})

// ─── Spec: required fields ──────────────────────────────────────

test("spec lists all required linkage candidate fields", () => {
  pinProse(read(SPEC), "SPEC required fields", [
    "`summary_id`",
    "`payload_hash`",
    "`tenant_id`",
    "`summary_scope`",
    "`created_at`",
    "`source_loop`",
    "`source_recorder_loop`",
    "`source_fixture_loop`",
    "`source_harness_loop`",
    "`source_validator_loop`",
    "`non_authorization_statement`",
    "`evidence_ledger_reference_purpose`",
    "`human_review_required`",
    "`append_allowed`",
    "`graph_write_allowed`",
  ])
})

// ─── Spec: forbidden fields ─────────────────────────────────────

test("spec lists all forbidden linkage candidate fields", () => {
  pinRaw(read(SPEC), "SPEC forbidden fields", [
    "- `approval_granted`\n",
    "- `execution_allowed`\n",
    "- `append_performed`\n",
    "- `evidence_ledger_entry_written`\n",
    "- `graph_write_performed`\n",
    "- `approval_store_approved`\n",
    "- `external_action_executed`\n",
    "- `formal_workunit_promoted`\n",
    "- `secret`\n",
    "- `token`\n",
    "- `credential`\n",
    "- `raw_event_payload`\n",
    "- `private_customer_data`\n",
  ])
})

// ─── Spec: field-level semantics ────────────────────────────────

test("spec states the required field-level semantics", () => {
  pinProse(read(SPEC), "SPEC field semantics", [
    "`append_allowed` must be `false` in the no-append validator stage.",
    "`graph_write_allowed` must be `false` in the no-append validator stage.",
    "`human_review_required` must be `true`.",
    "`payload_hash` must be a 64-character lowercase SHA-256-like hex string.",
  ])
})

// ─── Spec: validator input/output semantics ─────────────────────

test("spec defines validator input and output semantics", () => {
  pinProse(read(SPEC), "SPEC validator semantics", [
    "Validator Input Semantics",
    "single-read snapshot",
    "must fail closed on non-object, array, or null input",
    "never mutate its input",
    "Validator Output Semantics",
    "descriptive result of the shape `{ ok, issues }`",
    "Validator output is descriptive only.",
    "`ok: true` must not grant append permission.",
    "`ok: true` must not grant approval.",
    "`ok: true` must not grant execution permission.",
    "`ok: true` must not grant production readiness.",
  ])
})

// ─── Spec: fail-closed issue codes ──────────────────────────────

test("spec lists fail-closed issue codes", () => {
  pinProse(read(SPEC), "SPEC issue codes", [
    "Fail-closed Issue Codes",
    "`invalid_input`",
    "`forbidden_field_present`",
    "`invalid_payload_hash`",
    "`append_allowed_must_be_false`",
    "`graph_write_allowed_must_be_false`",
    "`human_review_required_must_be_true`",
    "`secret_like_value_present`",
    "`validator_exception`",
    "messages are `code:field` only",
  ])
})

// ─── Spec: no-append guarantee + determinism + non-echo ─────────

test("spec states the no-append guarantee", () => {
  pinProse(read(SPEC), "SPEC no-append", [
    "No-Append Guarantee",
    "never append to the Evidence Ledger, never write the Graph Model, and never persist anything",
    "No-Append Validator Spec is not validator implementation",
    "this loop performs no append",
  ])
})

test("spec states determinism/idempotency and non-echoing requirements", () => {
  pinProse(read(SPEC), "SPEC determinism/non-echo", [
    "Determinism and Idempotency Requirements",
    "identical input yields an identical result",
    "reads no clock and no randomness",
    "Non-echoing Issue Requirements",
    "Issue objects must not echo raw input values.",
    "Messages are `code:field` only.",
  ])
})

// ─── Spec: privacy / tenant / lineage / payload hash / human ────

test("spec states privacy, tenant, lineage, payload-hash, and human review checks", () => {
  pinProse(read(SPEC), "SPEC checks", [
    "Privacy and Redaction Checks",
    "Redaction failure is a fail-closed rejection.",
    "Tenant Boundary Checks",
    "Tenant-scope bypass is a fail-closed rejection.",
    "Source Lineage Checks",
    "Missing lineage is a fail-closed rejection.",
    "Payload Hash Checks",
    "`[0-9a-f]{64}`",
    "Human Review Boundary Checks",
    "Linkage Validation is not Human Approval",
    "Human Review is not ApprovalStore Approval",
    "Human Review is not External Action Execution",
  ])
})

// ─── Spec: rejection rules ──────────────────────────────────────

test("spec states append, graph, approval, StartHub, and D1/SQL rejection rules", () => {
  pinProse(read(SPEC), "SPEC rejection rules", [
    "Evidence Ledger Append Rejection Rules",
    "`append_allowed` not equal to `false`",
    "Graph Model Write Rejection Rules",
    "`graph_write_allowed` not equal to `false`",
    "ApprovalStore / External Action Rejection Rules",
    "grants no ApprovalStore authority",
    "StartHub Runtime Rejection Rules",
    "StartHub runtime remains separately gated",
    "D1 / SQL Rejection Rules",
    "D1 read-only execution remains P6-I6 or later",
  ])
})

// ─── Spec: future requirements ──────────────────────────────────

test("spec lists future implementation, test, and audit requirements", () => {
  pinProse(read(SPEC), "SPEC future requirements", [
    "Future Implementation Requirements",
    "record a new explicit human Go before any code",
    "Any future validator implementation must not append",
    "must return fail-closed results",
    "must return non-echoing issues",
    "must not bypass human review",
    "This spec grants none of these gates.",
    "Future Test Requirements",
    "an explicit assertion that no append and no Graph Model write occurred",
    "static source guards confirming no forbidden runtime capability substrings",
    "Future Audit Requirements",
    "security-red-team, test-validation, architecture, and product-release",
  ])
})

// ─── Spec: docs-only + self-statements ──────────────────────────

test("spec states its own docs-only + non-authorization boundary", () => {
  pinProse(read(SPEC), "SPEC self-statements", [
    "This loop is docs-only + static-test.",
    "This loop does not implement the validator.",
    "This loop does not implement contract types.",
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

test("spec states the core non-authorization equalities and future-gate requirement", () => {
  pinProse(read(SPEC), "SPEC equalities", [
    "Static Contract is not runtime contract enforcement",
    "No-Append Validator Spec is not validator implementation",
    "Linkage Candidate is not a Ledger Entry.",
    "Linkage Reference is not a Ledger Append.",
    "Linkage Validation is not Human Approval",
    "Recorder Audit Summary is not truth.",
    "Recorder Audit Summary is not approval.",
    "Recorder Audit Summary is not execution permission.",
    "Passing this spec is not append permission.",
    "Passing this spec is not runtime-wiring permission.",
    "record a new explicit human Go before any code",
  ])
})

// ─── Spec: no capability claims ─────────────────────────────────

test("spec never claims a forbidden capability was implemented", () => {
  const doc = read(SPEC)
  const forbiddenClaims = [
    "the validator is implemented",
    "validator implementation is complete",
    "contract types are implemented",
    "Evidence Ledger was appended",
    "appended to the Evidence Ledger",
    "Graph Model was written",
    "runtime linkage is implemented",
    "persistence is implemented",
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
    "P6-I5R has explicit human Go.",
    "This task is docs-only + static-test.",
    "The task will create only the three allowed files.",
    "The task will not modify `app/`.",
    "The task will not modify `docs/ALPHA_EVIDENCE_LEDGER.md`.",
    "The task will not modify `docs/GRAPH_MODEL.md`.",
    "No validator implementation is allowed.",
    "No contract type implementation is allowed.",
    "No Evidence Ledger append is allowed.",
    "No Graph Model write is allowed.",
    "Passing this spec is not append permission.",
    "Passing this spec is not runtime-wiring permission.",
    "Any future validator implementation requires a separate explicit human Go.",
    "AI proposes. Rules guard. Humans decide.",
  ])
})

// ─── Both-ways sanity (no self-match trap) ──────────────────────

test("assertions are behavioral, not self-matching", () => {
  const doc = read(SPEC)
  assert.ok(doc.includes("## 14. No-Append Guarantee\n"))
  assert.ok(!doc.includes("## 99. Nonexistent Section\n"))
  assert.ok(!read(GO).includes("## 99. Nonexistent Section\n"))
})
