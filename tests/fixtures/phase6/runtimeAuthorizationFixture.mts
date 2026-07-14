/**
 * P6-FIX-012: shared fixture for the Runtime Authorization focused suites
 * (Issue #145). Builds a fully valid, runtime-ELIGIBLE evidence bundle from the
 * REAL Phase 6 production constructors: a verified Approval Chain Linkage over a
 * runtime-eligible Human Decision, a current executor identity distinct from the
 * approver, and the intended-action envelope. Per-source override hooks let each
 * suite mutate exactly one piece.
 */

import {
  createApprovalLinkageRecord,
  type ApprovalLinkageRecord,
} from "../../../app/lib/phase6/approvalLinkage/index.ts"
import {
  humanDecision,
  sessionIdentity,
  envelopeHashFor,
  evidence,
  identityInput,
  previewRow,
  approvalRow,
  validInput,
  EVALUATED_AT,
  TARGET_HASH,
  PAYLOAD_HASH,
} from "./approvalLinkageFixture.mts"
import type { CanonicalIdentity } from "../../../app/lib/phase6/canonicalIdentity/index.ts"
import type { RuntimeAuthorizationEvidenceBundle } from "../../../app/lib/security/runtimeAuthorizationEvidenceResolver.ts"

export const ISSUED_AT = EVALUATED_AT // one evaluation instant
export const SESSION_EXPIRES_AT = "2026-07-06T00:00:00Z"

/** A runtime-ELIGIBLE Human Decision (action_readiness + execution_required). */
export function runtimeHumanDecision(overrides: Record<string, unknown> = {}) {
  return humanDecision({
    decision_impact_scope: "action_readiness_assessment",
    execution_required: true,
    approval_required: true,
    promotion_required: false,
    ...overrides,
  })
}

/** Build a fully valid runtime linkage context. */
export function runtimeContext(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const hd = (overrides.human_decision as unknown) ?? runtimeHumanDecision()
  const { envelopeHash } = envelopeHashFor(hd)
  const ev = (overrides.review_evidence as unknown) ?? evidence(hd, envelopeHash)
  return {
    tenant_id: "tenant-1",
    human_decision: hd,
    review_evidence: ev,
    identity_input: identityInput(hd, ev),
    action_preview: previewRow(),
    approval_record: approvalRow(),
    evaluated_at: EVALUATED_AT,
    revoked_review_evidence_ids: [],
    consumed_review_evidence_ids: [],
    revoked_approval_ids: [],
    consumed_approval_ids: [],
    revoked_approval_linkage_ids: [],
    consumed_approval_linkage_ids: [],
    ...overrides,
  }
}

/** Build a verified linkage record over a runtime context. */
export function runtimeLinkage(context: Record<string, unknown> = runtimeContext()): ApprovalLinkageRecord {
  const r = createApprovalLinkageRecord(validInput(), context)
  if (!r.ok) throw new Error("fixture runtime linkage: " + JSON.stringify(r.issues))
  return r.record
}

/** Current executor identity, distinct from the fixture approver (approver-1). */
export function executorIdentity(userId = "executor-1", tenantId = "tenant-1"): CanonicalIdentity {
  return sessionIdentity(userId, "executor", tenantId)
}

/** The intended-action envelope naming the fixture chain. */
export function intendedAction(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tenant_id: "tenant-1",
    workunit_id: "wu-1",
    action_preview_id: "preview-1",
    approval_id: "approval:preview-1",
    action_type: "slack_reply",
    target_hash: TARGET_HASH,
    payload_hash: PAYLOAD_HASH,
    ...overrides,
  }
}

/** A fully valid eligibility-evaluator input. */
export function eligibilityInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const context = (overrides.linkage_context as Record<string, unknown>) ?? runtimeContext()
  const linkage = (overrides.linkage as unknown) ?? runtimeLinkage(context)
  return {
    linkage,
    linkage_context: context,
    executor_identity: executorIdentity(),
    intended_action: intendedAction(),
    session_expires_at: SESSION_EXPIRES_AT,
    issued_at: ISSUED_AT,
    ...overrides,
  }
}

/** A trusted clock pinned to the fixture evaluation instant. */
export const TEST_CLOCK = { now: () => ISSUED_AT }

/** The RAW server-owned sources (no baked evaluation timestamp) for a context. */
export function evidenceSources(context: Record<string, unknown> = runtimeContext()): Record<string, unknown> {
  return {
    tenant_id: context.tenant_id,
    human_decision: context.human_decision,
    review_evidence: context.review_evidence,
    identity_input: context.identity_input,
    action_preview: context.action_preview,
    approval_record: context.approval_record,
    revoked_review_evidence_ids: context.revoked_review_evidence_ids,
    consumed_review_evidence_ids: context.consumed_review_evidence_ids,
    revoked_approval_ids: context.revoked_approval_ids,
    consumed_approval_ids: context.consumed_approval_ids,
    revoked_approval_linkage_ids: context.revoked_approval_linkage_ids,
    consumed_approval_linkage_ids: context.consumed_approval_linkage_ids,
  }
}

/** A fully valid server-authoritative evidence bundle for the gate/resolver. */
export function evidenceBundle(context: Record<string, unknown> = runtimeContext()): RuntimeAuthorizationEvidenceBundle {
  const linkage = runtimeLinkage(context)
  const ia = intendedAction()
  return {
    linkage,
    sources: evidenceSources(context) as unknown as RuntimeAuthorizationEvidenceBundle["sources"],
    intendedAction: {
      tenantId: ia.tenant_id as string,
      workUnitId: ia.workunit_id as string,
      actionPreviewId: ia.action_preview_id as string,
      approvalId: ia.approval_id as string,
      actionType: ia.action_type as string,
      targetHash: ia.target_hash as string,
      payloadHash: ia.payload_hash as string,
    },
  }
}
