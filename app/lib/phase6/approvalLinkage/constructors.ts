/**
 * P6-FIX-011: the pure constructor for the Approval Chain Linkage Record
 * (Issue #144).
 *
 * NON-AUTHORIZING BY CONSTRUCTION. The constructor accepts unknown untrusted
 * input and an unknown server-owned context, snapshots every source once,
 * internally verifies Review Evidence and Identity Independence, recomputes the
 * Preview hashes from current JSON, derives every binding field and hash from
 * the validated snapshots, and returns a fresh frozen opaque artifact.
 * Construction success is not approval, not ApprovalStore approval, not runtime
 * authorization, not execution permission, not persistence, and not a
 * one-time-use claim.
 *
 * SERVER-OWNED BINDING BOUNDARY (fail-closed: REJECT). The untrusted input may
 * carry ONLY `approval_linkage_id` and `linked_at`; every binding field (IDs,
 * hashes, approver, expiry) is derived from server-owned sources. Input that
 * carries any other field is rejected `invalid_approval_linkage_input`, so
 * attempted mass assignment stays observable. No public constructor accepts
 * arbitrary binding IDs, hashes, approver IDs, or expiry values.
 */

import {
  type ApprovalLinkageIssue,
  approvalLinkageIssue,
  snapshotRecordOrNull,
  isApprovalLinkageNonEmptyString,
  isApprovalLinkageHex64,
  validateApprovalLinkageRecord,
} from "./validation.ts"
import { isIsoUtcTimestamp } from "../shared/isoUtcTimestamp.ts"
import {
  APPROVAL_LINKAGE_HASH_ALGORITHM,
  APPROVAL_LINKAGE_CANONICALIZATION_ALGORITHM,
  type ApprovalLinkageRecord,
} from "./types.ts"
import { buildApprovalLinkagePayload, hashApprovalLinkagePayload } from "./canonical.ts"
import { evaluateApprovalChain } from "./sourceEvaluation.ts"

// ─── Construction result (frozen, non-authorizing) ──────────────

export type ApprovalLinkageConstructionSuccess = {
  readonly ok: true
  readonly record: ApprovalLinkageRecord
  readonly issues: readonly []
}

export type ApprovalLinkageConstructionFailure = {
  readonly ok: false
  readonly issues: readonly ApprovalLinkageIssue[]
}

export type ApprovalLinkageConstructionResult =
  | ApprovalLinkageConstructionSuccess
  | ApprovalLinkageConstructionFailure

function failConstruction(
  issues: readonly ApprovalLinkageIssue[],
): ApprovalLinkageConstructionFailure {
  return Object.freeze({ ok: false, issues: Object.freeze([...issues]) })
}

/** Only these caller-selectable inert fields are permitted on the input. */
const INPUT_FIELDS: readonly string[] = ["approval_linkage_id", "linked_at"]

/**
 * The only production function that returns an ApprovalLinkageRecord. Every
 * binding value comes from `evaluateApprovalChain`; the input supplies only the
 * linkage id and the linkage timestamp. Success grants nothing.
 */
export function createApprovalLinkageRecord(
  input: unknown,
  context: unknown,
): ApprovalLinkageConstructionResult {
  try {
    const snap = snapshotRecordOrNull(input)
    if (snap === null) {
      return failConstruction([approvalLinkageIssue("invalid_approval_linkage_input", "(input)")])
    }
    const issues: ApprovalLinkageIssue[] = []
    for (const key of Object.keys(snap)) {
      if (!INPUT_FIELDS.includes(key)) {
        issues.push(approvalLinkageIssue("invalid_approval_linkage_input", `(input).${key}`))
      }
    }
    const approvalLinkageId = snap.approval_linkage_id
    const linkedAt = snap.linked_at
    if (!isApprovalLinkageNonEmptyString(approvalLinkageId)) {
      issues.push(approvalLinkageIssue("invalid_approval_linkage_input", "(input).approval_linkage_id"))
    }
    if (!isIsoUtcTimestamp(linkedAt)) {
      issues.push(approvalLinkageIssue("invalid_approval_linkage_input", "(input).linked_at"))
    }

    // Evaluate all five sources once; construction requires zero issues.
    const evaluation = evaluateApprovalChain(
      context,
      isIsoUtcTimestamp(linkedAt) ? linkedAt : "",
    )
    issues.push(...evaluation.issues)
    if (issues.length > 0 || evaluation.derived === null) {
      return failConstruction(issues.length > 0 ? issues : [
        approvalLinkageIssue("approval_linkage_state_missing", "(context)"),
      ])
    }
    const d = evaluation.derived

    // Build the canonical linkage payload (never includes linkage_hash) and
    // compute the linkage hash internally.
    const payload = buildApprovalLinkagePayload({
      approval_linkage_id: approvalLinkageId as string,
      tenant_id: d.tenant_id,
      human_decision_id: d.human_decision_id,
      human_decision_hash: d.human_decision_hash,
      review_evidence_id: d.review_evidence_id,
      review_evidence_hash: d.review_evidence_hash,
      review_envelope_hash: d.review_envelope_hash,
      first_review_attestation_id: d.first_review_attestation_id,
      second_review_attestation_id: d.second_review_attestation_id,
      identity_chain_hash: d.identity_chain_hash,
      workunit_id: d.workunit_id,
      action_preview_id: d.action_preview_id,
      approval_id: d.approval_id,
      action_type: d.action_type,
      target_hash: d.target_hash,
      payload_hash: d.payload_hash,
      approver_id: d.approver_id,
      preview_created_at: d.preview_created_at,
      preview_expires_at: d.preview_expires_at,
      review_completed_at: d.review_completed_at,
      review_expires_at: d.review_expires_at,
      approval_created_at: d.approval_created_at,
      approval_approved_at: d.approval_approved_at,
      approval_expires_at: d.approval_expires_at,
      linked_at: linkedAt as string,
      linkage_expires_at: d.linkage_expires_at,
    })
    const linkageHash = hashApprovalLinkagePayload(payload)
    if (!isApprovalLinkageHex64(linkageHash)) {
      return failConstruction([approvalLinkageIssue("approval_linkage_hash_mismatch", "(linkage_hash)")])
    }

    const record: Record<string, unknown> = {
      approval_linkage_id: payload.approval_linkage_id,
      tenant_id: payload.tenant_id,
      human_decision_id: payload.human_decision_id,
      human_decision_hash: payload.human_decision_hash,
      review_evidence_id: payload.review_evidence_id,
      review_evidence_hash: payload.review_evidence_hash,
      review_envelope_hash: payload.review_envelope_hash,
      first_review_attestation_id: payload.first_review_attestation_id,
      second_review_attestation_id: payload.second_review_attestation_id,
      identity_chain_hash: payload.identity_chain_hash,
      workunit_id: payload.workunit_id,
      action_preview_id: payload.action_preview_id,
      approval_id: payload.approval_id,
      action_type: payload.action_type,
      target_hash: payload.target_hash,
      payload_hash: payload.payload_hash,
      approver_id: payload.approver_id,
      preview_created_at: payload.preview_created_at,
      preview_expires_at: payload.preview_expires_at,
      review_completed_at: payload.review_completed_at,
      review_expires_at: payload.review_expires_at,
      approval_created_at: payload.approval_created_at,
      approval_approved_at: payload.approval_approved_at,
      approval_expires_at: payload.approval_expires_at,
      linked_at: payload.linked_at,
      linkage_expires_at: payload.linkage_expires_at,
      hash_algorithm: APPROVAL_LINKAGE_HASH_ALGORITHM,
      canonicalization_algorithm: APPROVAL_LINKAGE_CANONICALIZATION_ALGORITHM,
      linkage_hash: linkageHash,
    }

    // Defensive output validation: the assembled record must pass the same
    // structural validator every consumer uses.
    const validation = validateApprovalLinkageRecord(record)
    if (!validation.ok) return failConstruction(validation.issues)

    // The opaque brand is compile-time only; no runtime field is added. This
    // cast is the module's single trusted production point for the type.
    return Object.freeze({
      ok: true,
      record: Object.freeze(record) as unknown as ApprovalLinkageRecord,
      issues: Object.freeze([]) as readonly [],
    })
  } catch {
    return failConstruction([
      approvalLinkageIssue("approval_linkage_validation_exception", "(constructor)"),
    ])
  }
}
