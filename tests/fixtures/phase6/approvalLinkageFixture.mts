/**
 * P6-FIX-011: shared fixture for the Approval Chain Linkage focused suites
 * (Issue #144). Builds a fully valid five-source chain from the REAL Phase 6
 * production constructors, plus per-source override hooks so each suite can
 * mutate exactly one piece. Imports only node builtins are avoided here — this
 * is a pure fixture over the real module exports.
 */

import { createHumanDecisionRecord } from "../../../app/lib/phase6/artifacts/index.ts"
import {
  createCanonicalSessionIdentity,
  createCanonicalPreviewCreatorIdentity,
  type CanonicalIdentity,
  type SessionDerivableActorKind,
} from "../../../app/lib/phase6/canonicalIdentity/index.ts"
import {
  createReviewAttestation,
  createFourEyesReviewEvidence,
  type FourEyesReviewEvidence,
} from "../../../app/lib/phase6/reviewEvidence/index.ts"
import { hashActionTarget, hashActionPayload, hashField } from "../../../app/lib/security/hash.ts"
import {
  buildApprovalReviewEnvelope,
  hashApprovalReviewEnvelope,
} from "../../../app/lib/phase6/approvalLinkage/index.ts"

export const OBS = "2026-07-05T00:30:00Z"
export const EVALUATED_AT = "2026-07-05T03:00:00Z"
export const LINKED_AT = "2026-07-05T02:50:00Z"

export const TARGET = { provider: "slack", destination: "channel-1" }
export const PAYLOAD = { body: "hello reviewers" }
export const TARGET_HASH = hashActionTarget(TARGET)
export const PAYLOAD_HASH = hashActionPayload(PAYLOAD)

export function humanDecision(overrides: Record<string, unknown> = {}) {
  const r = createHumanDecisionRecord({
    human_decision_id: "hdr-1", tenant_id: "tenant-1", decision_status: "ready_for_future_gate_review",
    decision_outcome: "pass", human_reviewer_id: "u1", human_reviewer_role: "pm", reviewer_context: "c",
    source_evidence_review_record_id: "e", source_llm_judgment_record_id: "l", source_query_result_record_id: "q",
    source_rule_review_record_id: "r", source_compiled_sql_artifact_id: "cs", source_safe_query_plan_id: "sp",
    source_query_intent_id: "qi", evidence_accepted: true, evidence_claim: "x", evidence_type: "count_result supports",
    llm_judgment_id: "l", judgment_summary: "s", uncertainty_state: "low_uncertainty",
    human_decision_summary: "s", human_decision_rationale: "r", decision_impact_scope: "evidence_acceptance",
    allowed_use: ["a"], disallowed_use: ["b"], future_gate_requirements: ["g"], approval_required: true,
    promotion_required: false, execution_required: false, four_eyes_required: true, self_approval_blocked: true,
    reviewed_by_human_at: "2026-07-05T00:00:00Z", no_go_flags: [], ...overrides,
  })
  if (!r.ok) throw new Error("fixture human decision: " + JSON.stringify(r.issues))
  return r.artifact
}

export function sessionIdentity(
  userId: string,
  actorKind: SessionDerivableActorKind,
  tenantId = "tenant-1",
): CanonicalIdentity {
  const r = createCanonicalSessionIdentity(
    { userId, tenantId, role: "manager", email: `${userId}@x.test`, isDevSession: false,
      sessionId: `s-${userId}-${actorKind}`, createdAt: "2026-07-04T00:00:00Z", expiresAt: "2026-07-06T00:00:00Z" },
    { actor_kind: actorKind, expected_tenant_id: tenantId, observed_at: OBS })
  if (!r.ok) throw new Error("fixture identity: " + JSON.stringify(r.issues))
  return r.identity
}

export function creatorIdentity(previewId = "preview-1", creatorUserId = "creator-1", tenantId = "tenant-1"): CanonicalIdentity {
  const r = createCanonicalPreviewCreatorIdentity(
    { id: previewId, tenantId, workUnitId: "wu-1", creatorUserId },
    { expected_tenant_id: tenantId, observed_at: OBS })
  if (!r.ok) throw new Error("fixture creator: " + JSON.stringify(r.issues))
  return r.identity
}

/** Human Decision hash and Approval Review Envelope hash for a given chain. */
export function envelopeHashFor(
  hd: unknown,
  opts: { tenant?: string; workunit?: string; previewId?: string; actionType?: string; targetHash?: string; payloadHash?: string } = {},
): { hdHash: string; envelopeHash: string } {
  const hdHash = hashField(hd)
  const envelope = buildApprovalReviewEnvelope({
    tenant_id: opts.tenant ?? "tenant-1",
    human_decision_id: "hdr-1",
    human_decision_hash: hdHash,
    workunit_id: opts.workunit ?? "wu-1",
    action_preview_id: opts.previewId ?? "preview-1",
    action_type: opts.actionType ?? "slack_reply",
    target_hash: opts.targetHash ?? TARGET_HASH,
    payload_hash: opts.payloadHash ?? PAYLOAD_HASH,
  })
  return { hdHash, envelopeHash: hashApprovalReviewEnvelope(envelope) }
}

/**
 * Flexible Four-Eyes Review Evidence builder. Overriding the review evidence
 * id, reviewers, attestation ids, or the reviewed (envelope) hash produces a
 * structurally-valid but content-DIFFERENT evidence artifact — useful for the
 * same-ID-different-content substitution tests.
 */
export function buildEvidence(
  hd: unknown,
  envelopeHash: string,
  opts: {
    reviewEvidenceId?: string
    firstReviewer?: string
    secondReviewer?: string
    firstAttId?: string
    secondAttId?: string
  } = {},
): FourEyesReviewEvidence {
  const att = (id: string, u: string, t: string) => {
    const r = createReviewAttestation(
      { review_attestation_id: id, source_workunit_id: "wu-1", reviewed_payload_hash: envelopeHash, reviewed_at: t },
      sessionIdentity(u, "reviewer"), hd as never)
    if (!r.ok) throw new Error("fixture attestation: " + JSON.stringify(r.issues))
    return r.artifact
  }
  const r = createFourEyesReviewEvidence(
    { review_evidence_id: opts.reviewEvidenceId ?? "rev-1", review_completed_at: "2026-07-05T02:30:00Z", review_expires_at: "2026-07-05T05:30:00Z" },
    att(opts.firstAttId ?? "att-1", opts.firstReviewer ?? "reviewer-one", "2026-07-05T01:00:00Z"),
    att(opts.secondAttId ?? "att-2", opts.secondReviewer ?? "reviewer-two", "2026-07-05T02:00:00Z"), hd as never)
  if (!r.ok) throw new Error("fixture evidence: " + JSON.stringify(r.issues))
  return r.artifact
}

export function evidenceWithId(hd: unknown, envelopeHash: string, reviewEvidenceId: string): FourEyesReviewEvidence {
  return buildEvidence(hd, envelopeHash, { reviewEvidenceId })
}

export function evidence(hd: unknown, envelopeHash: string): FourEyesReviewEvidence {
  return buildEvidence(hd, envelopeHash, {})
}

export function previewRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "preview-1", tenantId: "tenant-1", workUnitId: "wu-1", actionType: "slack_reply",
    targetPreview: JSON.stringify(TARGET), payloadPreview: JSON.stringify(PAYLOAD),
    requiresApproval: 1, status: "preview", targetHash: TARGET_HASH, payloadHash: PAYLOAD_HASH,
    createdAt: "2026-07-05T00:00:00Z", expiresAt: "2026-07-05T06:00:00Z", creatorUserId: "creator-1",
    ...overrides,
  }
}

export function approvalRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "approval:preview-1", tenantId: "tenant-1", workUnitId: "wu-1", actionPreviewId: "preview-1",
    actionType: "slack_reply", targetHash: TARGET_HASH, payloadHash: PAYLOAD_HASH, status: "approved",
    approvedByUserId: "approver-1", createdAt: "2026-07-05T02:40:00Z", approvedAt: "2026-07-05T02:45:00Z",
    expiresAt: "2026-07-05T05:00:00Z", ...overrides,
  }
}

export function identityInput(hd: unknown, ev: unknown, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    human_decision: hd, review_evidence: ev,
    requester_identity: sessionIdentity("requester-1", "requester"),
    creator_identity: creatorIdentity(),
    first_reviewer_identity: sessionIdentity("reviewer-one", "reviewer"),
    second_reviewer_identity: sessionIdentity("reviewer-two", "reviewer"),
    approver_identity: sessionIdentity("approver-1", "approver"),
    expected_tenant_id: "tenant-1", expected_human_decision_id: "hdr-1",
    expected_workunit_id: "wu-1", expected_action_preview_id: "preview-1", evaluated_at: EVALUATED_AT,
    ...overrides,
  }
}

/** Build a fully valid context; pass overrides to mutate individual sources. */
export function validContext(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const hd = humanDecision()
  const { envelopeHash } = envelopeHashFor(hd)
  const ev = evidence(hd, envelopeHash)
  return {
    tenant_id: "tenant-1", human_decision: hd, review_evidence: ev,
    identity_input: identityInput(hd, ev), action_preview: previewRow(), approval_record: approvalRow(),
    evaluated_at: EVALUATED_AT,
    revoked_review_evidence_ids: [], consumed_review_evidence_ids: [],
    revoked_approval_ids: [], consumed_approval_ids: [],
    revoked_approval_linkage_ids: [], consumed_approval_linkage_ids: [],
    ...overrides,
  }
}

export function validInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { approval_linkage_id: "link-1", linked_at: LINKED_AT, ...overrides }
}
