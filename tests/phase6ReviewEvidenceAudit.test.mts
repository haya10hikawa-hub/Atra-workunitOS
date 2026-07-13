/**
 * P6-FIX-009: isolated tests for the pure, redacted Review Evidence audit
 * projection (Issue #142).
 *
 * Imports ONLY node:test, node:assert/strict, the reviewEvidence public
 * surface, and the artifacts public surface (to construct the source Human
 * Decision). No app runtime, no audit logger, no persistence, no ApprovalStore,
 * no network, no child_process, no secrets, no D1, no SQL, no LLM. The factory
 * is I/O-free and exercised over in-memory objects only.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { createHumanDecisionRecord } from "../app/lib/phase6/artifacts/index.ts"
import {
  createReviewAttestation,
  createFourEyesReviewEvidence,
  verifyFourEyesReviewEvidence,
  createReviewEvidenceAuditEvent,
  type FourEyesReviewEvidence,
} from "../app/lib/phase6/reviewEvidence/index.ts"

const HASH = "a".repeat(64)
const T = "2026-07-05T00:00:00Z"
const EVALUATED_AT = "2026-07-05T03:00:00Z"

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
    { tenant_id: "tenant-1", reviewer_id: "reviewer-alpha" },
    decision,
  )
  const second = createReviewAttestation(
    {
      review_attestation_id: "att-2",
      source_workunit_id: "wu-1",
      reviewed_payload_hash: HASH,
      reviewed_at: "2026-07-05T02:00:00Z",
    },
    { tenant_id: "tenant-1", reviewer_id: "reviewer-beta" },
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

// ─── Event kinds and content ────────────────────────────────────

test("a passing verification projects the verified event kind", () => {
  const result = verifyFourEyesReviewEvidence(EVIDENCE, matchingContext())
  assert.equal(result.ok, true)
  const event = createReviewEvidenceAuditEvent(EVIDENCE, result, EVALUATED_AT)
  assert.equal(event.event_kind, "four_eyes_review_evidence_verified")
  assert.equal(event.ok, true)
  assert.equal(event.review_evidence_id, "rev-1")
  assert.equal(event.source_human_decision_id, "hdr-1")
  assert.equal(event.source_workunit_id, "wu-1")
  assert.deepEqual([...event.issue_codes], [])
  assert.equal(event.evaluated_at, EVALUATED_AT)
})

test("a rejected verification projects the rejected event kind with the stable issue codes", () => {
  const result = verifyFourEyesReviewEvidence(
    EVIDENCE,
    matchingContext({ revoked_review_evidence_ids: ["rev-1"], tenant_id: "tenant-OTHER" }),
  )
  assert.equal(result.ok, false)
  const event = createReviewEvidenceAuditEvent(EVIDENCE, result, EVALUATED_AT)
  assert.equal(event.event_kind, "four_eyes_review_evidence_rejected")
  assert.equal(event.ok, false)
  assert.deepEqual(
    [...event.issue_codes],
    ["review_tenant_mismatch", "review_evidence_revoked"],
  )
})

// ─── Redaction boundary ─────────────────────────────────────────

test("audit events carry exactly the allowlisted keys and are frozen", () => {
  const result = verifyFourEyesReviewEvidence(EVIDENCE, matchingContext())
  const event = createReviewEvidenceAuditEvent(EVIDENCE, result, EVALUATED_AT)
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
  const result = verifyFourEyesReviewEvidence(EVIDENCE, matchingContext())
  const event = createReviewEvidenceAuditEvent(EVIDENCE, result, EVALUATED_AT)
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
})

test("raw reviewed payload content never reaches the audit event", () => {
  const rawPayload = "RAW-REVIEWED-PAYLOAD-CONTENT-must-never-appear"
  // Hostile shapes that carry payload-like content in unexpected places.
  const hostileEvidence = {
    review_evidence_id: "rev-1",
    source_human_decision_id: "hdr-1",
    source_workunit_id: "wu-1",
    reviewed_payload: rawPayload,
    payload_body: rawPayload,
  }
  const hostileResult = {
    ok: false,
    issues: [{ code: "review_payload_hash_mismatch", field: rawPayload, message: rawPayload }],
  }
  const event = createReviewEvidenceAuditEvent(hostileEvidence, hostileResult, EVALUATED_AT)
  const serialized = JSON.stringify(event)
  assert.ok(!serialized.includes(rawPayload), "raw payload content must never be projected")
  assert.deepEqual([...event.issue_codes], ["review_payload_hash_mismatch"])
})

// ─── Total, fail-closed projection ──────────────────────────────

test("malformed inputs project placeholders instead of echoing values", () => {
  const event = createReviewEvidenceAuditEvent(null, null, "not-a-timestamp")
  assert.equal(event.event_kind, "four_eyes_review_evidence_rejected")
  assert.equal(event.ok, false)
  assert.equal(event.review_evidence_id, "(invalid)")
  assert.equal(event.source_human_decision_id, "(invalid)")
  assert.equal(event.source_workunit_id, "(invalid)")
  assert.deepEqual([...event.issue_codes], [])
  assert.equal(event.evaluated_at, "(invalid)")
})

test("oversized identifier-shaped content is treated as invalid, not echoed", () => {
  const smuggled = "x".repeat(300)
  const event = createReviewEvidenceAuditEvent(
    { review_evidence_id: smuggled, source_human_decision_id: "hdr-1", source_workunit_id: "wu-1" },
    { ok: true, issues: [] },
    EVALUATED_AT,
  )
  assert.equal(event.review_evidence_id, "(invalid)")
  assert.ok(!JSON.stringify(event).includes(smuggled))
})

test("a result that is not verified-ok always projects as rejected", () => {
  for (const notOk of [undefined, null, {}, { ok: false, issues: [] }, { ok: "true" }]) {
    const event = createReviewEvidenceAuditEvent(EVIDENCE, notOk, EVALUATED_AT)
    assert.equal(event.event_kind, "four_eyes_review_evidence_rejected", JSON.stringify(notOk))
    assert.equal(event.ok, false)
  }
})

test("audit projection is deterministic and does not mutate its inputs", () => {
  const result = verifyFourEyesReviewEvidence(EVIDENCE, matchingContext())
  const beforeEvidence = JSON.stringify(EVIDENCE)
  const a = createReviewEvidenceAuditEvent(EVIDENCE, result, EVALUATED_AT)
  const b = createReviewEvidenceAuditEvent(EVIDENCE, result, EVALUATED_AT)
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)))
  assert.equal(JSON.stringify(EVIDENCE), beforeEvidence)
})
