/**
 * P6-FIX-009: isolated tests for the pure, redacted Review Evidence audit
 * projection (Issue #142; hardened for PR #160).
 *
 * The factory accepts the evidence and the server-side verification context —
 * never an externally supplied verification result — and produces the
 * decision internally through verifyFourEyesReviewEvidence. Issue codes must
 * pass the canonical REVIEW_EVIDENCE_ISSUE_CODES allowlist before they may be
 * emitted.
 *
 * Imports ONLY node:test, node:assert/strict, the reviewEvidence public
 * surface, and the artifacts public surface (to construct the source Human
 * Decision). No app runtime, no audit logger, no persistence, no
 * ApprovalStore, no network, no child_process, no secrets, no D1, no SQL, no
 * LLM. The factory is I/O-free and exercised over in-memory objects only.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { createHumanDecisionRecord } from "../app/lib/phase6/artifacts/index.ts"
import {
  createCanonicalSessionIdentity,
  type CanonicalIdentity,
} from "../app/lib/phase6/canonicalIdentity/index.ts"
import {
  createReviewAttestation,
  createFourEyesReviewEvidence,
  verifyFourEyesReviewEvidence,
  createReviewEvidenceAuditEvent,
  sanitizeReviewEvidenceAuditIssueCodes,
  type FourEyesReviewEvidence,
} from "../app/lib/phase6/reviewEvidence/index.ts"

const HASH = "a".repeat(64)
const T = "2026-07-05T00:00:00Z"
const EVALUATED_AT = "2026-07-05T03:00:00Z"

/** Canonical reviewer identity fixture (P6-FIX-010): derived from a session. */
function reviewerIdentityOf(userId: string): CanonicalIdentity {
  const result = createCanonicalSessionIdentity(
    {
      userId,
      tenantId: "tenant-1",
      role: "manager",
      email: `${userId}@example.test`,
      isDevSession: false,
      sessionId: `sess-${userId}`,
      createdAt: "2026-07-04T00:00:00Z",
      expiresAt: "2026-07-06T00:00:00Z",
    },
    { actor_kind: "reviewer", expected_tenant_id: "tenant-1", observed_at: "2026-07-05T00:30:00Z" },
  )
  if (!result.ok) throw new Error("fixture reviewer identity must construct")
  return result.identity
}

function buildEvidence(): FourEyesReviewEvidence {
  const decisionResult = createHumanDecisionRecord({
    human_decision_id: "hdr-1",
    tenant_id: "tenant-1",
    decision_status: "ready_for_future_gate_review",
    decision_outcome: "pass",
    human_reviewer_id: "user-1",
    human_reviewer_role: "pm",
    reviewer_context: "weekly triage review",
    source_evidence_review_record_id: "err-1",
    source_llm_judgment_record_id: "ljr-1",
    source_query_result_record_id: "qrr-1",
    source_rule_review_record_id: "rrr-1",
    source_compiled_sql_artifact_id: "csa-1",
    source_safe_query_plan_id: "sqp-1",
    source_query_intent_id: "qi-1",
    evidence_accepted: true,
    evidence_claim: "there are 12 open workunits",
    evidence_type: "count_result supports",
    llm_judgment_id: "ljr-1",
    judgment_summary: "the open workunit count appears stable",
    uncertainty_state: "low_uncertainty",
    human_decision_summary: "accept the count as evidence for priority review",
    human_decision_rationale: "matches board state; no conflicting source",
    decision_impact_scope: "evidence_acceptance",
    allowed_use: ["priority_assessment input"],
    disallowed_use: ["action authorization", "promotion"],
    future_gate_requirements: ["approval gate", "promotion gate"],
    approval_required: true,
    promotion_required: false,
    execution_required: false,
    four_eyes_required: true,
    self_approval_blocked: true,
    reviewed_by_human_at: T,
    no_go_flags: [],
  })
  assert.equal(decisionResult.ok, true)
  if (!decisionResult.ok) throw new Error("unreachable")
  const decision = decisionResult.artifact
  const first = createReviewAttestation(
    {
      review_attestation_id: "att-1",
      source_workunit_id: "wu-1",
      reviewed_payload_hash: HASH,
      reviewed_at: "2026-07-05T01:00:00Z",
    },
    reviewerIdentityOf("reviewer-alpha"),
    decision,
  )
  const second = createReviewAttestation(
    {
      review_attestation_id: "att-2",
      source_workunit_id: "wu-1",
      reviewed_payload_hash: HASH,
      reviewed_at: "2026-07-05T02:00:00Z",
    },
    reviewerIdentityOf("reviewer-beta"),
    decision,
  )
  if (!first.ok || !second.ok) throw new Error("unreachable")
  const evidence = createFourEyesReviewEvidence(
    {
      review_evidence_id: "rev-1",
      review_completed_at: "2026-07-05T02:30:00Z",
      review_expires_at: "2026-07-05T03:30:00Z",
    },
    first.artifact,
    second.artifact,
    decision,
  )
  if (!evidence.ok) throw new Error("unreachable")
  return evidence.artifact
}

const EVIDENCE = buildEvidence()

function matchingContext(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tenant_id: "tenant-1",
    human_decision_id: "hdr-1",
    workunit_id: "wu-1",
    current_payload_hash: HASH,
    evaluated_at: EVALUATED_AT,
    revoked_review_evidence_ids: [],
    consumed_review_evidence_ids: [],
    ...overrides,
  }
}

// ─── Internal decision only ─────────────────────────────────────

test("only a real successful verification produces the verified event kind", () => {
  const check = verifyFourEyesReviewEvidence(EVIDENCE, matchingContext())
  assert.equal(check.ok, true, "fixture must verify")
  const event = createReviewEvidenceAuditEvent(EVIDENCE, matchingContext())
  assert.equal(event.event_kind, "four_eyes_review_evidence_verified")
  assert.equal(event.ok, true)
  assert.equal(event.review_evidence_id, "rev-1")
  assert.equal(event.source_human_decision_id, "hdr-1")
  assert.equal(event.source_workunit_id, "wu-1")
  assert.deepEqual([...event.issue_codes], [])
  assert.equal(event.evaluated_at, EVALUATED_AT)
})

test("a fabricated { ok: true } object cannot produce a verified event", () => {
  // The second argument is the verification CONTEXT. A fabricated result-like
  // object is simply a malformed context, so the internal verification fails
  // closed and the event is rejected.
  for (const fabricated of [
    { ok: true },
    { ok: true, issues: [] },
    { ok: true, issues: [], evaluated_at: EVALUATED_AT },
  ]) {
    const event = createReviewEvidenceAuditEvent(EVIDENCE, fabricated)
    assert.equal(
      event.event_kind,
      "four_eyes_review_evidence_rejected",
      JSON.stringify(fabricated),
    )
    assert.equal(event.ok, false)
  }
})

test("the factory has no result parameter: a forged third argument changes nothing", () => {
  // Passing an extra argument (the old result-shaped API) must have no effect:
  // the decision comes only from the internal verifier over (evidence, context).
  const call = createReviewEvidenceAuditEvent as unknown as (
    ...args: unknown[]
  ) => ReturnType<typeof createReviewEvidenceAuditEvent>
  const withForgedExtra = call(EVIDENCE, matchingContext({ tenant_id: "tenant-OTHER" }), {
    ok: true,
    issues: [],
  })
  assert.equal(withForgedExtra.event_kind, "four_eyes_review_evidence_rejected")
  assert.deepEqual([...withForgedExtra.issue_codes], ["review_tenant_mismatch"])
})

// ─── Rejection scenarios project the rejected kind with stable codes ─

test("every verifier rejection scenario projects the rejected event kind", () => {
  const scenarios: readonly [Record<string, unknown>, string][] = [
    [{ revoked_review_evidence_ids: ["rev-1"] }, "review_evidence_revoked"],
    [{ consumed_review_evidence_ids: ["rev-1"] }, "review_evidence_replayed"],
    [{ evaluated_at: "2026-07-05T03:30:00Z" }, "review_evidence_expired"],
    [{ tenant_id: "tenant-OTHER" }, "review_tenant_mismatch"],
    [{ human_decision_id: "hdr-OTHER" }, "review_source_human_decision_mismatch"],
    [{ workunit_id: "wu-OTHER" }, "review_source_workunit_mismatch"],
    [{ current_payload_hash: "b".repeat(64) }, "review_payload_hash_mismatch"],
  ]
  for (const [override, expectedCode] of scenarios) {
    const event = createReviewEvidenceAuditEvent(EVIDENCE, matchingContext(override))
    assert.equal(event.event_kind, "four_eyes_review_evidence_rejected", expectedCode)
    assert.equal(event.ok, false)
    assert.deepEqual([...event.issue_codes], [expectedCode])
  }
})

test("stable verifier issue codes are projected in deterministic order", () => {
  const event = createReviewEvidenceAuditEvent(
    EVIDENCE,
    matchingContext({ tenant_id: "tenant-OTHER", revoked_review_evidence_ids: ["rev-1"] }),
  )
  assert.deepEqual(
    [...event.issue_codes],
    ["review_tenant_mismatch", "review_evidence_revoked"],
  )
})

// ─── Stable-code allowlist (defense-in-depth sanitizer) ─────────

test("hostile issue codes are never emitted by the sanitizer", () => {
  const hostile = sanitizeReviewEvidenceAuditIssueCodes([
    { code: "RAW-PAYLOAD" },
    { code: "secret-value" },
    { code: "token-value" },
    { code: "sk-live-DO-NOT-LEAK" },
  ])
  assert.equal(hostile.all_canonical, false)
  assert.deepEqual([...hostile.issue_codes], ["review_evidence_validation_exception"])
  const serialized = JSON.stringify(hostile)
  for (const leaked of ["RAW-PAYLOAD", "secret-value", "token-value", "sk-live"]) {
    assert.ok(!serialized.includes(leaked), leaked)
  }
})

test("unknown issue codes are replaced by the stable fallback and mark non-canonical", () => {
  const mixed = sanitizeReviewEvidenceAuditIssueCodes([
    { code: "review_tenant_mismatch" },
    { code: "not_a_canonical_code" },
    { code: "review_evidence_revoked" },
  ])
  assert.equal(mixed.all_canonical, false)
  assert.deepEqual(
    [...mixed.issue_codes],
    ["review_tenant_mismatch", "review_evidence_revoked", "review_evidence_validation_exception"],
  )
})

test("malformed issue entries fail closed without echoing anything", () => {
  for (const bad of [null, "review_tenant_mismatch", 42, [{ code: 42 }], [null], [{ notCode: "x" }]]) {
    const result = sanitizeReviewEvidenceAuditIssueCodes(bad)
    assert.equal(result.all_canonical, false, JSON.stringify(bad))
    assert.ok(result.issue_codes.includes("review_evidence_validation_exception"))
  }
})

test("duplicate issue codes are deterministically de-duplicated", () => {
  const duplicated = sanitizeReviewEvidenceAuditIssueCodes([
    { code: "review_evidence_revoked" },
    { code: "review_tenant_mismatch" },
    { code: "review_evidence_revoked" },
    { code: "review_tenant_mismatch" },
  ])
  assert.equal(duplicated.all_canonical, true)
  assert.deepEqual(
    [...duplicated.issue_codes],
    ["review_evidence_revoked", "review_tenant_mismatch"],
  )
})

test("sanitizer output is frozen", () => {
  const result = sanitizeReviewEvidenceAuditIssueCodes([{ code: "review_evidence_revoked" }])
  assert.ok(Object.isFrozen(result))
  assert.ok(Object.isFrozen(result.issue_codes))
})

// ─── Redaction boundary ─────────────────────────────────────────

test("audit events carry exactly the allowlisted keys and are frozen", () => {
  const event = createReviewEvidenceAuditEvent(EVIDENCE, matchingContext())
  assert.deepEqual(
    Object.keys(event).sort(),
    [
      "evaluated_at",
      "event_kind",
      "issue_codes",
      "ok",
      "review_evidence_id",
      "source_human_decision_id",
      "source_workunit_id",
    ],
  )
  assert.ok(Object.isFrozen(event))
  assert.ok(Object.isFrozen(event.issue_codes))
  assert.equal(Object.getOwnPropertySymbols(event).length, 0)
})

test("audit events never expose the payload hash, reviewer identities, or grant-like fields", () => {
  for (const context of [matchingContext(), matchingContext({ tenant_id: "tenant-OTHER" })]) {
    const event = createReviewEvidenceAuditEvent(EVIDENCE, context)
    const serialized = JSON.stringify(event)
    assert.ok(!serialized.includes(HASH), "payload hash must not be emitted")
    assert.ok(!serialized.includes("reviewer-alpha"), "first reviewer id must not be emitted")
    assert.ok(!serialized.includes("reviewer-beta"), "second reviewer id must not be emitted")
    for (const key of [
      "reviewed_payload_hash",
      "first_reviewer_id",
      "second_reviewer_id",
      "approval",
      "approved",
      "authorized",
      "execution_permission",
      "token",
      "secret",
    ]) {
      assert.equal(Object.prototype.hasOwnProperty.call(event, key), false, key)
    }
  }
})

test("structurally invalid evidence projects placeholder identifiers, never echoes", () => {
  const rawPayload = "RAW-REVIEWED-PAYLOAD-CONTENT-must-never-appear"
  const hostileEvidence = {
    review_evidence_id: "rev-1",
    source_human_decision_id: "hdr-1",
    source_workunit_id: "wu-1",
    reviewed_payload: rawPayload,
    payload_body: rawPayload,
  }
  const event = createReviewEvidenceAuditEvent(hostileEvidence, matchingContext())
  assert.equal(event.event_kind, "four_eyes_review_evidence_rejected")
  // Identifiers are projected only from structurally valid evidence.
  assert.equal(event.review_evidence_id, "(invalid)")
  assert.equal(event.source_human_decision_id, "(invalid)")
  assert.equal(event.source_workunit_id, "(invalid)")
  const serialized = JSON.stringify(event)
  assert.ok(!serialized.includes(rawPayload), "raw payload content must never be projected")
})

test("oversized identifier-shaped content is treated as invalid, not echoed", () => {
  const smuggled = "x".repeat(300)
  const event = createReviewEvidenceAuditEvent(
    { ...JSON.parse(JSON.stringify(EVIDENCE)), review_evidence_id: smuggled },
    matchingContext(),
  )
  assert.ok(!JSON.stringify(event).includes(smuggled))
})

// ─── Total, fail-closed projection ──────────────────────────────

test("malformed evidence or context never throws and projects placeholders", () => {
  for (const [evidence, context] of [
    [null, null],
    [undefined, undefined],
    [42, "context"],
    [{}, {}],
    [[], []],
    [EVIDENCE, null],
    [null, matchingContext()],
  ] as const) {
    const event = createReviewEvidenceAuditEvent(evidence, context)
    assert.equal(event.event_kind, "four_eyes_review_evidence_rejected")
    assert.equal(event.ok, false)
    assert.ok(event.issue_codes.length > 0, "rejection carries at least one stable code")
  }
  const nullEvent = createReviewEvidenceAuditEvent(null, null)
  assert.equal(nullEvent.review_evidence_id, "(invalid)")
  assert.equal(nullEvent.source_human_decision_id, "(invalid)")
  assert.equal(nullEvent.source_workunit_id, "(invalid)")
  assert.equal(nullEvent.evaluated_at, "(invalid)")
})

test("evaluated_at is obtained defensively from the context", () => {
  const good = createReviewEvidenceAuditEvent(EVIDENCE, matchingContext())
  assert.equal(good.evaluated_at, EVALUATED_AT)
  const bad = createReviewEvidenceAuditEvent(
    EVIDENCE,
    matchingContext({ evaluated_at: "not-a-timestamp" }),
  )
  assert.equal(bad.evaluated_at, "(invalid)")
  assert.equal(bad.event_kind, "four_eyes_review_evidence_rejected")
})

test("audit projection is deterministic and does not mutate evidence or context", () => {
  const context = matchingContext()
  const beforeEvidence = JSON.stringify(EVIDENCE)
  const beforeContext = JSON.stringify(context)
  const a = createReviewEvidenceAuditEvent(EVIDENCE, context)
  const b = createReviewEvidenceAuditEvent(EVIDENCE, matchingContext())
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)))
  assert.equal(JSON.stringify(EVIDENCE), beforeEvidence)
  assert.equal(JSON.stringify(context), beforeContext)
})

// ─── Source guard: the factory owns the decision ────────────────

test("source guard: the factory verifies internally and gates codes through the allowlist", () => {
  const src = readFileSync(
    fileURLToPath(new URL("../app/lib/phase6/reviewEvidence/audit.ts", import.meta.url)),
    "utf8",
  )
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")
  assert.ok(
    code.includes("verifyFourEyesReviewEvidence(evidence, context)"),
    "the verification decision must be produced internally",
  )
  assert.ok(
    code.includes("REVIEW_EVIDENCE_ISSUE_CODES"),
    "the canonical issue-code list must gate the audit boundary",
  )
  assert.ok(
    /createReviewEvidenceAuditEvent\(\s*evidence: unknown,\s*context: unknown,?\s*\)/.test(code),
    "the factory accepts (evidence, context) — no external result parameter",
  )
  assert.ok(
    code.includes("sanitized.all_canonical"),
    "a non-canonical code must force the rejected state",
  )
})
