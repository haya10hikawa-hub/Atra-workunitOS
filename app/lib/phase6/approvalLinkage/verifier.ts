/**
 * P6-FIX-011: the pure verifier for an Approval Chain Linkage Record
 * (Issue #144).
 *
 * NON-AUTHORIZING BY CONSTRUCTION. `verified` proves only that the stored
 * linkage record is self-consistent (its `linkage_hash` covers its fields) AND
 * still matches the current, independently re-evaluated source chain at
 * `evaluated_at`. It is NOT approval, NOT ApprovalStore approval, NOT runtime
 * authorization, and NOT execution permission. Runtime authorization and the
 * atomic immediately-before-use claim belong to Issue #145.
 *
 * The verifier revalidates the linkage record, recomputes its self-hash,
 * re-evaluates all five current sources (recomputing every hash from current
 * Preview JSON, internally re-running Review Evidence and Identity Independence
 * verification), and compares every current-derived value to the stored record.
 * It never accepts a caller-supplied verification result. Pure: no I/O, no
 * clock, no randomness, no mutation.
 */

import {
  type ApprovalLinkageIssue,
  approvalLinkageIssue,
  snapshotRecordOrNull,
  validateApprovalLinkageRecord,
} from "./validation.ts"
import {
  APPROVAL_LINKAGE_HASH_ALGORITHM,
  APPROVAL_LINKAGE_CANONICALIZATION_ALGORITHM,
  type ApprovalLinkageVerificationState,
} from "./types.ts"
import { buildApprovalLinkagePayload, hashApprovalLinkagePayload } from "./canonical.ts"
import { evaluateApprovalChain, type DerivedApprovalChain } from "./sourceEvaluation.ts"

export type ApprovalLinkageVerificationResult = {
  readonly ok: boolean
  readonly state: ApprovalLinkageVerificationState
  readonly issues: readonly ApprovalLinkageIssue[]
}

function resultOf(
  state: ApprovalLinkageVerificationState,
  issues: readonly ApprovalLinkageIssue[],
): ApprovalLinkageVerificationResult {
  return Object.freeze({
    ok: state === "verified",
    state,
    issues: Object.freeze([...issues]),
  })
}

/** Codes that mean the linkage record ARGUMENT itself is untrustworthy. */
const INVALID_CODES: ReadonlySet<string> = new Set([
  "invalid_approval_linkage_input",
  "approval_linkage_validation_exception",
  "approval_linkage_hash_mismatch",
])

/** Stored fields compared to the current-derived chain for stale detection. */
const DERIVED_COMPARISON: readonly (keyof DerivedApprovalChain)[] = [
  "tenant_id",
  "human_decision_id",
  "human_decision_hash",
  "review_evidence_id",
  "review_evidence_hash",
  "review_envelope_hash",
  "first_review_attestation_id",
  "second_review_attestation_id",
  "identity_chain_hash",
  "workunit_id",
  "action_preview_id",
  "approval_id",
  "action_type",
  "target_hash",
  "payload_hash",
  "approver_id",
  "preview_created_at",
  "preview_expires_at",
  "review_completed_at",
  "review_expires_at",
  "approval_created_at",
  "approval_approved_at",
  "approval_expires_at",
  "linkage_expires_at",
]

export function verifyApprovalLinkage(
  linkage: unknown,
  context: unknown,
): ApprovalLinkageVerificationResult {
  try {
    // 1. Revalidate the linkage record argument and snapshot it once.
    const recordValidation = validateApprovalLinkageRecord(linkage)
    const record = snapshotRecordOrNull(linkage)
    if (!recordValidation.ok || record === null) {
      return resultOf(
        "invalid",
        recordValidation.ok
          ? [approvalLinkageIssue("invalid_approval_linkage_input", "(linkage)")]
          : recordValidation.issues,
      )
    }

    const recordIssues: ApprovalLinkageIssue[] = []

    // 2. Recompute the self-hash from the stored fields (a hash never covers
    //    itself). A mismatch means the record was tampered with.
    const selfPayload = buildApprovalLinkagePayload({
      approval_linkage_id: record.approval_linkage_id as string,
      tenant_id: record.tenant_id as string,
      human_decision_id: record.human_decision_id as string,
      human_decision_hash: record.human_decision_hash as string,
      review_evidence_id: record.review_evidence_id as string,
      review_evidence_hash: record.review_evidence_hash as string,
      review_envelope_hash: record.review_envelope_hash as string,
      first_review_attestation_id: record.first_review_attestation_id as string,
      second_review_attestation_id: record.second_review_attestation_id as string,
      identity_chain_hash: record.identity_chain_hash as string,
      workunit_id: record.workunit_id as string,
      action_preview_id: record.action_preview_id as string,
      approval_id: record.approval_id as string,
      action_type: record.action_type as string,
      target_hash: record.target_hash as string,
      payload_hash: record.payload_hash as string,
      approver_id: record.approver_id as string,
      preview_created_at: record.preview_created_at as string,
      preview_expires_at: record.preview_expires_at as string,
      review_completed_at: record.review_completed_at as string,
      review_expires_at: record.review_expires_at as string,
      approval_created_at: record.approval_created_at as string,
      approval_approved_at: record.approval_approved_at as string,
      approval_expires_at: record.approval_expires_at as string,
      linked_at: record.linked_at as string,
      linkage_expires_at: record.linkage_expires_at as string,
    })
    if (
      record.hash_algorithm !== APPROVAL_LINKAGE_HASH_ALGORITHM ||
      record.canonicalization_algorithm !== APPROVAL_LINKAGE_CANONICALIZATION_ALGORITHM ||
      hashApprovalLinkagePayload(selfPayload) !== record.linkage_hash
    ) {
      recordIssues.push(approvalLinkageIssue("approval_linkage_hash_mismatch", "(linkage).linkage_hash"))
    }

    // 3. Re-evaluate the current sources (snapshots the context once).
    const ctxSnap = snapshotRecordOrNull(context)
    const evaluation = evaluateApprovalChain(ctxSnap, record.linked_at as string)
    const chainIssues: ApprovalLinkageIssue[] = [...evaluation.issues]

    // 4. Stale detection: every stored binding field must equal the
    //    current-derived value. A source mutated after linking → stale.
    if (evaluation.derived !== null) {
      const d = evaluation.derived
      for (const field of DERIVED_COMPARISON) {
        if (record[field] !== d[field]) {
          chainIssues.push(approvalLinkageIssue("approval_linkage_stale", `(linkage).${field}`))
        }
      }
    }

    // 5. Linkage-level revoke / replay from the current context snapshots.
    const linkageId = record.approval_linkage_id
    const consumedLink = ctxSnap?.consumed_approval_linkage_ids
    const revokedLink = ctxSnap?.revoked_approval_linkage_ids
    if (Array.isArray(consumedLink) && typeof linkageId === "string" && consumedLink.includes(linkageId)) {
      chainIssues.push(approvalLinkageIssue("approval_linkage_replayed", "(linkage).approval_linkage_id"))
    }
    if (Array.isArray(revokedLink) && typeof linkageId === "string" && revokedLink.includes(linkageId)) {
      chainIssues.push(approvalLinkageIssue("approval_linkage_revoked", "(linkage).approval_linkage_id"))
    }

    const allIssues = [...recordIssues, ...chainIssues]

    // 6. Determine the state by fixed precedence.
    const codes = new Set(allIssues.map((i) => i.code))
    let state: ApprovalLinkageVerificationState
    if (recordIssues.some((i) => INVALID_CODES.has(i.code))) {
      state = "invalid"
    } else if (codes.has("approval_linkage_replayed")) {
      state = "replayed"
    } else if (codes.has("approval_linkage_used")) {
      state = "used"
    } else if (codes.has("approval_linkage_revoked")) {
      state = "revoked"
    } else if (codes.has("approval_linkage_expired")) {
      state = "expired"
    } else if (allIssues.length > 0) {
      // Any remaining mismatch / stale / identity / missing-source issue means
      // the current chain no longer matches the stored linkage.
      state = "stale"
    } else {
      state = "verified"
    }

    return resultOf(state, allIssues)
  } catch {
    return resultOf("invalid", [
      approvalLinkageIssue("approval_linkage_validation_exception", "(verifier)"),
    ])
  }
}
