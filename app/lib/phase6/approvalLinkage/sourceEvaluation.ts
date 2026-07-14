/**
 * P6-FIX-011: module-private shared source evaluation for the Approval Chain
 * Linkage module (Issue #144). Both `createApprovalLinkageRecord` and
 * `verifyApprovalLinkage` delegate ALL source snapshotting, hashing, internal
 * Review Evidence + Identity Independence verification, state checks, and
 * timeline/expiry derivation here, so construction and verification observe the
 * exact same evaluated snapshots.
 *
 * NON-AUTHORIZING. Producing a derived chain proves only structural + state
 * consistency of the five source objects at one instant. It is not approval,
 * not ApprovalStore approval, not runtime authorization, and not execution
 * permission.
 *
 * SNAPSHOT CONSISTENCY. Every source (context, Human Decision, Review Evidence,
 * ActionPreview, Approval Record, Identity Independence input, each nested
 * Canonical Identity, and the six revoke/consume collections) is reduced to a
 * single-read snapshot; a hostile getter or `ownKeys` trap fails closed and
 * never escapes. Preview target/payload JSON is parsed and the hashes are
 * RECOMPUTED from current content — the two stored hash strings are never
 * trusted alone. No raw target/payload content ever leaves this module.
 *
 * Pure: no I/O, no repository, no clock (`evaluated_at` is supplied), no
 * randomness, no mutation of any input. NOT EXPORTED from the module index.
 */

import { validateHumanDecisionRecord } from "../artifacts/index.ts"
import {
  validateFourEyesReviewEvidence,
  verifyFourEyesReviewEvidence,
} from "../reviewEvidence/index.ts"
import { validateCanonicalIdentity } from "../canonicalIdentity/index.ts"
import { verifyIdentityIndependence } from "../identityIndependence/index.ts"
import { hashActionTarget, hashActionPayload } from "../../security/hash.ts"
import { isIsoUtcTimestamp } from "../shared/isoUtcTimestamp.ts"
import {
  type ApprovalLinkageIssue,
  approvalLinkageIssue,
  isApprovalLinkageRecordObject,
  isApprovalLinkageNonEmptyString,
  isApprovalLinkageHex64,
  snapshotRecordOrNull,
  snapshotStringArrayOrNull,
  compareApprovalLinkageIsoUtc,
} from "./validation.ts"
import { APPROVAL_LINKAGE_ACTION_TYPES } from "./types.ts"
import {
  hashHumanDecisionSnapshot,
  buildApprovalReviewEnvelope,
  hashApprovalReviewEnvelope,
  buildApprovalIdentityChain,
  hashApprovalIdentityChain,
} from "./canonical.ts"

// ─── Derived chain (all server-derived binding fields) ──────────

export type DerivedApprovalChain = {
  readonly tenant_id: string
  readonly human_decision_id: string
  readonly human_decision_hash: string
  readonly review_evidence_id: string
  readonly review_evidence_hash: string
  readonly review_envelope_hash: string
  readonly first_review_attestation_id: string
  readonly second_review_attestation_id: string
  readonly identity_chain_hash: string
  readonly workunit_id: string
  readonly action_preview_id: string
  readonly approval_id: string
  readonly action_type: string
  readonly target_hash: string
  readonly payload_hash: string
  readonly approver_id: string
  readonly preview_created_at: string
  readonly preview_expires_at: string
  readonly review_completed_at: string
  readonly review_expires_at: string
  readonly approval_created_at: string
  readonly approval_approved_at: string
  readonly approval_expires_at: string
  readonly linkage_expires_at: string
}

export type SourceEvaluation = {
  readonly derived: DerivedApprovalChain | null
  readonly issues: readonly ApprovalLinkageIssue[]
}

// ─── Exact context allowlist ────────────────────────────────────

const CONTEXT_FIELDS: readonly string[] = [
  "tenant_id",
  "human_decision",
  "review_evidence",
  "identity_input",
  "action_preview",
  "approval_record",
  "evaluated_at",
  "revoked_review_evidence_ids",
  "consumed_review_evidence_ids",
  "revoked_approval_ids",
  "consumed_approval_ids",
  "revoked_approval_linkage_ids",
  "consumed_approval_linkage_ids",
]

const II_INPUT_FIELDS: readonly string[] = [
  "human_decision",
  "review_evidence",
  "requester_identity",
  "creator_identity",
  "first_reviewer_identity",
  "second_reviewer_identity",
  "approver_identity",
  "executor_identity",
  "expected_tenant_id",
  "expected_human_decision_id",
  "expected_workunit_id",
  "expected_action_preview_id",
  "evaluated_at",
]

const IDENTITY_POSITIONS = [
  "requester_identity",
  "creator_identity",
  "first_reviewer_identity",
  "second_reviewer_identity",
  "approver_identity",
] as const

// ─── Helpers ────────────────────────────────────────────────────

function parseJsonRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "string") return null
  try {
    const parsed: unknown = JSON.parse(value)
    return isApprovalLinkageRecordObject(parsed) ? parsed : null
  } catch {
    return null
  }
}

type IdentityFields = {
  readonly user_id: string
  readonly source_record_id: string
  readonly identity_source: string
  readonly actor_kind: string
  readonly tenant_id: string
}

/**
 * Snapshot a nested Canonical Identity once, validate the snapshot, and return
 * both the plain snapshot (for `verifyIdentityIndependence`) and the extracted
 * scalar fields (for the identity-chain hash). Null on structural failure.
 */
function snapshotIdentity(value: unknown): {
  readonly snapshot: Record<string, unknown>
  readonly fields: IdentityFields
} | null {
  const snapshot = snapshotRecordOrNull(value)
  if (snapshot === null || !validateCanonicalIdentity(snapshot).ok) return null
  const user_id = snapshot.user_id
  const source_record_id = snapshot.source_record_id
  const identity_source = snapshot.identity_source
  const actor_kind = snapshot.actor_kind
  const tenant_id = snapshot.tenant_id
  if (
    !isApprovalLinkageNonEmptyString(user_id) ||
    !isApprovalLinkageNonEmptyString(source_record_id) ||
    !isApprovalLinkageNonEmptyString(identity_source) ||
    !isApprovalLinkageNonEmptyString(actor_kind) ||
    !isApprovalLinkageNonEmptyString(tenant_id)
  ) {
    return null
  }
  return { snapshot, fields: { user_id, source_record_id, identity_source, actor_kind, tenant_id } }
}

function minIso(a: string, b: string): string {
  return compareApprovalLinkageIsoUtc(a, b) <= 0 ? a : b
}

// ─── Core evaluation ────────────────────────────────────────────

/**
 * Evaluate the five source objects and the state snapshots at `evaluatedAt`,
 * with `linkedAt` supplied for timeline validation. Returns the derived chain
 * (present whenever every binding field is structurally computable) plus every
 * consistency, state, and timeline issue found. The constructor requires zero
 * issues; the verifier uses `derived` for stale comparison and maps the issues
 * to a verification state.
 */
export function evaluateApprovalChain(context: unknown, linkedAt: string): SourceEvaluation {
  const issues: ApprovalLinkageIssue[] = []
  const fail = (): SourceEvaluation => ({ derived: null, issues })
  try {
    const ctx = snapshotRecordOrNull(context)
    if (ctx === null) {
      issues.push(approvalLinkageIssue("approval_linkage_state_missing", "(context)"))
      return fail()
    }
    for (const key of Object.keys(ctx)) {
      if (!CONTEXT_FIELDS.includes(key)) {
        issues.push(approvalLinkageIssue("invalid_approval_linkage_input", `(context).${key}`))
      }
    }

    const tenantId = ctx.tenant_id
    if (!isApprovalLinkageNonEmptyString(tenantId)) {
      issues.push(approvalLinkageIssue("approval_linkage_state_missing", "(context).tenant_id"))
    }
    const evaluatedAt = ctx.evaluated_at
    if (!isIsoUtcTimestamp(evaluatedAt)) {
      issues.push(approvalLinkageIssue("approval_linkage_state_missing", "(context).evaluated_at"))
    }
    if (!isIsoUtcTimestamp(linkedAt)) {
      issues.push(approvalLinkageIssue("approval_linkage_state_missing", "(linked_at)"))
    }

    // Revoke / consume collections (single-read frozen snapshots).
    const revokedRe = snapshotStringArrayOrNull(ctx.revoked_review_evidence_ids)
    const consumedRe = snapshotStringArrayOrNull(ctx.consumed_review_evidence_ids)
    const revokedAppr = snapshotStringArrayOrNull(ctx.revoked_approval_ids)
    const consumedAppr = snapshotStringArrayOrNull(ctx.consumed_approval_ids)
    const revokedLink = snapshotStringArrayOrNull(ctx.revoked_approval_linkage_ids)
    const consumedLink = snapshotStringArrayOrNull(ctx.consumed_approval_linkage_ids)
    for (const [name, snap] of [
      ["revoked_review_evidence_ids", revokedRe],
      ["consumed_review_evidence_ids", consumedRe],
      ["revoked_approval_ids", revokedAppr],
      ["consumed_approval_ids", consumedAppr],
      ["revoked_approval_linkage_ids", revokedLink],
      ["consumed_approval_linkage_ids", consumedLink],
    ] as const) {
      if (snap === null) {
        issues.push(approvalLinkageIssue("approval_linkage_state_missing", `(context).${name}`))
      }
    }

    // ── Human Decision ────────────────────────────────────────
    const hd = snapshotRecordOrNull(ctx.human_decision)
    if (hd === null || !validateHumanDecisionRecord(hd).ok) {
      issues.push(approvalLinkageIssue("approval_linkage_human_decision_mismatch", "(human_decision)"))
      return fail()
    }
    const humanDecisionId = hd.human_decision_id
    const hdTenant = hd.tenant_id
    if (!isApprovalLinkageNonEmptyString(humanDecisionId) || !isApprovalLinkageNonEmptyString(hdTenant)) {
      issues.push(approvalLinkageIssue("approval_linkage_human_decision_mismatch", "(human_decision)"))
      return fail()
    }
    if (isApprovalLinkageNonEmptyString(tenantId) && hdTenant !== tenantId) {
      issues.push(approvalLinkageIssue("approval_linkage_tenant_mismatch", "(human_decision).tenant_id"))
    }
    const humanDecisionHash = hashHumanDecisionSnapshot(hd)

    // ── ActionPreview (recompute hashes from current JSON) ─────
    const preview = snapshotRecordOrNull(ctx.action_preview)
    if (preview === null) {
      issues.push(approvalLinkageIssue("approval_linkage_action_preview_mismatch", "(action_preview)"))
      return fail()
    }
    const previewId = preview.id
    const previewTenant = preview.tenantId
    const previewWorkunit = preview.workUnitId
    const previewActionType = preview.actionType
    const previewStatus = preview.status
    const previewCreator = preview.creatorUserId
    const previewCreatedAt = preview.createdAt
    const previewExpiresAt = preview.expiresAt
    const parsedTarget = parseJsonRecord(preview.targetPreview)
    const parsedPayload = parseJsonRecord(preview.payloadPreview)
    if (
      !isApprovalLinkageNonEmptyString(previewId) ||
      !isApprovalLinkageNonEmptyString(previewTenant) ||
      !isApprovalLinkageNonEmptyString(previewWorkunit) ||
      !isApprovalLinkageNonEmptyString(previewActionType) ||
      !isIsoUtcTimestamp(previewCreatedAt) ||
      !isIsoUtcTimestamp(previewExpiresAt) ||
      parsedTarget === null ||
      parsedPayload === null
    ) {
      issues.push(approvalLinkageIssue("approval_linkage_action_preview_mismatch", "(action_preview)"))
      return fail()
    }
    // Hashes are RECOMPUTED from current parsed content (never trust the two
    // stored hash strings alone). Raw parsed content never leaves this scope.
    const targetHash = hashActionTarget(parsedTarget)
    const payloadHash = hashActionPayload(parsedPayload)
    if (preview.targetHash !== targetHash) {
      issues.push(approvalLinkageIssue("approval_linkage_target_hash_mismatch", "(action_preview).targetHash"))
    }
    if (preview.payloadHash !== payloadHash) {
      issues.push(approvalLinkageIssue("approval_linkage_payload_hash_mismatch", "(action_preview).payloadHash"))
    }
    if (previewStatus !== "preview") {
      issues.push(approvalLinkageIssue("approval_linkage_action_preview_mismatch", "(action_preview).status"))
    }
    if (preview.requiresApproval !== 1) {
      issues.push(approvalLinkageIssue("approval_linkage_action_preview_mismatch", "(action_preview).requiresApproval"))
    }
    if (!isApprovalLinkageNonEmptyString(previewCreator)) {
      issues.push(approvalLinkageIssue("approval_linkage_identity_mismatch", "(action_preview).creatorUserId"))
    }
    if (!(APPROVAL_LINKAGE_ACTION_TYPES as readonly string[]).includes(previewActionType)) {
      issues.push(approvalLinkageIssue("approval_linkage_action_type_mismatch", "(action_preview).actionType"))
    }
    if (isApprovalLinkageNonEmptyString(tenantId) && previewTenant !== tenantId) {
      issues.push(approvalLinkageIssue("approval_linkage_tenant_mismatch", "(action_preview).tenantId"))
    }
    if (isIsoUtcTimestamp(evaluatedAt) && compareApprovalLinkageIsoUtc(evaluatedAt as string, previewExpiresAt) >= 0) {
      issues.push(approvalLinkageIssue("approval_linkage_expired", "(action_preview).expiresAt"))
    }

    // ── Approval Record ───────────────────────────────────────
    const approval = snapshotRecordOrNull(ctx.approval_record)
    if (approval === null) {
      issues.push(approvalLinkageIssue("approval_linkage_approval_record_mismatch", "(approval_record)"))
      return fail()
    }
    const approvalId = approval.id
    const approvalCreatedAt = approval.createdAt
    const approvalApprovedAt = approval.approvedAt
    const approvalExpiresAt = approval.expiresAt
    const approvedBy = approval.approvedByUserId
    if (
      !isApprovalLinkageNonEmptyString(approvalId) ||
      !isIsoUtcTimestamp(approvalCreatedAt) ||
      !isIsoUtcTimestamp(approvalApprovedAt) ||
      !isIsoUtcTimestamp(approvalExpiresAt)
    ) {
      issues.push(approvalLinkageIssue("approval_linkage_approval_record_mismatch", "(approval_record)"))
      return fail()
    }
    if (approval.status !== "approved") {
      issues.push(approvalLinkageIssue("approval_linkage_approval_record_mismatch", "(approval_record).status"))
    }
    if (!isApprovalLinkageNonEmptyString(approvedBy)) {
      issues.push(approvalLinkageIssue("approval_linkage_approver_mismatch", "(approval_record).approvedByUserId"))
    }
    if (approval.usedAt !== undefined && approval.usedAt !== null) {
      issues.push(approvalLinkageIssue("approval_linkage_used", "(approval_record).usedAt"))
    }
    if (approval.status === "used") {
      issues.push(approvalLinkageIssue("approval_linkage_used", "(approval_record).status"))
    }
    if (isApprovalLinkageNonEmptyString(tenantId) && approval.tenantId !== tenantId) {
      issues.push(approvalLinkageIssue("approval_linkage_tenant_mismatch", "(approval_record).tenantId"))
    }
    if (approval.workUnitId !== previewWorkunit) {
      issues.push(approvalLinkageIssue("approval_linkage_workunit_mismatch", "(approval_record).workUnitId"))
    }
    if (approval.actionPreviewId !== previewId) {
      issues.push(approvalLinkageIssue("approval_linkage_action_preview_mismatch", "(approval_record).actionPreviewId"))
    }
    if (approval.actionType !== previewActionType) {
      issues.push(approvalLinkageIssue("approval_linkage_action_type_mismatch", "(approval_record).actionType"))
    }
    if (approval.targetHash !== targetHash) {
      issues.push(approvalLinkageIssue("approval_linkage_target_hash_mismatch", "(approval_record).targetHash"))
    }
    if (approval.payloadHash !== payloadHash) {
      issues.push(approvalLinkageIssue("approval_linkage_payload_hash_mismatch", "(approval_record).payloadHash"))
    }
    if (revokedAppr !== null && revokedAppr.includes(approvalId)) {
      issues.push(approvalLinkageIssue("approval_linkage_revoked", "(approval_record).id"))
    }
    if (consumedAppr !== null && consumedAppr.includes(approvalId)) {
      issues.push(approvalLinkageIssue("approval_linkage_used", "(approval_record).id"))
    }
    if (compareApprovalLinkageIsoUtc(evaluatedAt as string, approvalExpiresAt) >= 0) {
      issues.push(approvalLinkageIssue("approval_linkage_expired", "(approval_record).expiresAt"))
    }

    // ── Review envelope + Review Evidence internal verification ─
    const envelope = buildApprovalReviewEnvelope({
      tenant_id: isApprovalLinkageNonEmptyString(tenantId) ? tenantId : "",
      human_decision_id: humanDecisionId,
      human_decision_hash: humanDecisionHash,
      workunit_id: previewWorkunit,
      action_preview_id: previewId,
      action_type: previewActionType,
      target_hash: targetHash,
      payload_hash: payloadHash,
    })
    const reviewEnvelopeHash = hashApprovalReviewEnvelope(envelope)

    const re = snapshotRecordOrNull(ctx.review_evidence)
    if (re === null || !validateFourEyesReviewEvidence(re).ok) {
      issues.push(approvalLinkageIssue("approval_linkage_review_evidence_mismatch", "(review_evidence)"))
      return fail()
    }
    const reviewEvidenceId = re.review_evidence_id
    const firstAttestationId = re.first_review_attestation_id
    const secondAttestationId = re.second_review_attestation_id
    const reviewCompletedAt = re.review_completed_at
    const reviewExpiresAt = re.review_expires_at
    if (
      !isApprovalLinkageNonEmptyString(reviewEvidenceId) ||
      !isApprovalLinkageNonEmptyString(firstAttestationId) ||
      !isApprovalLinkageNonEmptyString(secondAttestationId) ||
      !isIsoUtcTimestamp(reviewCompletedAt) ||
      !isIsoUtcTimestamp(reviewExpiresAt)
    ) {
      issues.push(approvalLinkageIssue("approval_linkage_review_evidence_mismatch", "(review_evidence)"))
      return fail()
    }
    if (re.reviewed_payload_hash !== reviewEnvelopeHash) {
      issues.push(approvalLinkageIssue("approval_linkage_review_envelope_mismatch", "(review_evidence).reviewed_payload_hash"))
    }
    const reviewEvidenceHash = hashHumanDecisionSnapshot(re) // hashField over RE snapshot

    // Internal Review Evidence verification — never a caller-supplied result.
    const reContext = {
      tenant_id: isApprovalLinkageNonEmptyString(tenantId) ? tenantId : "",
      human_decision_id: humanDecisionId,
      workunit_id: previewWorkunit,
      current_payload_hash: reviewEnvelopeHash,
      evaluated_at: isIsoUtcTimestamp(evaluatedAt) ? evaluatedAt : "",
      revoked_review_evidence_ids: revokedRe ?? [],
      consumed_review_evidence_ids: consumedRe ?? [],
    }
    const reResult = verifyFourEyesReviewEvidence(re, reContext)
    if (!reResult.ok) {
      for (const issue of reResult.issues) {
        if (issue.code === "review_evidence_expired") {
          issues.push(approvalLinkageIssue("approval_linkage_expired", "(review_evidence).review_expires_at"))
        } else if (issue.code === "review_evidence_revoked") {
          issues.push(approvalLinkageIssue("approval_linkage_revoked", "(review_evidence).review_evidence_id"))
        } else if (issue.code === "review_evidence_replayed") {
          issues.push(approvalLinkageIssue("approval_linkage_replayed", "(review_evidence).review_evidence_id"))
        } else {
          issues.push(approvalLinkageIssue("approval_linkage_review_evidence_mismatch", "(review_evidence)"))
        }
      }
    }

    // ── Identity Independence internal verification + chain hash ─
    const iiTop = snapshotRecordOrNull(ctx.identity_input)
    if (iiTop === null) {
      issues.push(approvalLinkageIssue("approval_linkage_identity_mismatch", "(identity_input)"))
      return fail()
    }
    for (const key of Object.keys(iiTop)) {
      if (!II_INPUT_FIELDS.includes(key)) {
        issues.push(approvalLinkageIssue("approval_linkage_identity_mismatch", `(identity_input).${key}`))
      }
    }
    const iiHd = snapshotRecordOrNull(iiTop.human_decision)
    const iiRe = snapshotRecordOrNull(iiTop.review_evidence)
    const identitySnaps: Record<string, ReturnType<typeof snapshotIdentity>> = {}
    let identityStructurallyOk = iiHd !== null && iiRe !== null
    for (const pos of IDENTITY_POSITIONS) {
      const snap = snapshotIdentity(iiTop[pos])
      identitySnaps[pos] = snap
      if (snap === null) identityStructurallyOk = false
    }
    const executorSnap =
      iiTop.executor_identity === undefined ? null : snapshotIdentity(iiTop.executor_identity)
    if (!identityStructurallyOk) {
      issues.push(approvalLinkageIssue("approval_linkage_identity_mismatch", "(identity_input)"))
      return fail()
    }

    const requester = identitySnaps.requester_identity!
    const creator = identitySnaps.creator_identity!
    const firstReviewer = identitySnaps.first_reviewer_identity!
    const secondReviewer = identitySnaps.second_reviewer_identity!
    const approver = identitySnaps.approver_identity!

    // Assemble a plain II input from the single-read snapshots and verify.
    const iiForVerify: Record<string, unknown> = {
      human_decision: iiHd,
      review_evidence: iiRe,
      requester_identity: requester.snapshot,
      creator_identity: creator.snapshot,
      first_reviewer_identity: firstReviewer.snapshot,
      second_reviewer_identity: secondReviewer.snapshot,
      approver_identity: approver.snapshot,
      expected_tenant_id: iiTop.expected_tenant_id,
      expected_human_decision_id: iiTop.expected_human_decision_id,
      expected_workunit_id: iiTop.expected_workunit_id,
      expected_action_preview_id: iiTop.expected_action_preview_id,
      evaluated_at: iiTop.evaluated_at,
    }
    if (executorSnap !== null) iiForVerify.executor_identity = executorSnap.snapshot
    const iiResult = verifyIdentityIndependence(iiForVerify)
    if (!iiResult.ok) {
      issues.push(approvalLinkageIssue("approval_linkage_identity_mismatch", "(identity_input)"))
    }

    // Cross-record identity bindings (Issue #144 §11).
    if (iiTop.expected_tenant_id !== tenantId) {
      issues.push(approvalLinkageIssue("approval_linkage_tenant_mismatch", "(identity_input).expected_tenant_id"))
    }
    if (iiTop.expected_human_decision_id !== humanDecisionId) {
      issues.push(approvalLinkageIssue("approval_linkage_human_decision_mismatch", "(identity_input).expected_human_decision_id"))
    }
    if (iiTop.expected_workunit_id !== previewWorkunit) {
      issues.push(approvalLinkageIssue("approval_linkage_workunit_mismatch", "(identity_input).expected_workunit_id"))
    }
    if (iiTop.expected_action_preview_id !== previewId) {
      issues.push(approvalLinkageIssue("approval_linkage_action_preview_mismatch", "(identity_input).expected_action_preview_id"))
    }
    if (iiHd !== null && iiHd.human_decision_id !== humanDecisionId) {
      issues.push(approvalLinkageIssue("approval_linkage_human_decision_mismatch", "(identity_input).human_decision"))
    }
    if (iiRe !== null && iiRe.review_evidence_id !== reviewEvidenceId) {
      issues.push(approvalLinkageIssue("approval_linkage_review_evidence_mismatch", "(identity_input).review_evidence"))
    }
    if (creator.fields.user_id !== previewCreator) {
      issues.push(approvalLinkageIssue("approval_linkage_identity_mismatch", "(creator_identity).user_id"))
    }
    if (creator.fields.source_record_id !== previewId) {
      issues.push(approvalLinkageIssue("approval_linkage_identity_mismatch", "(creator_identity).source_record_id"))
    }
    if (approver.fields.user_id !== approvedBy) {
      issues.push(approvalLinkageIssue("approval_linkage_approver_mismatch", "(approver_identity).user_id"))
    }
    if (approver.fields.identity_source !== "authenticated_session") {
      issues.push(approvalLinkageIssue("approval_linkage_approver_mismatch", "(approver_identity).identity_source"))
    }

    const identityChain = buildApprovalIdentityChain({
      tenant_id: isApprovalLinkageNonEmptyString(tenantId) ? tenantId : "",
      requester_user_id: requester.fields.user_id,
      creator_user_id: creator.fields.user_id,
      creator_source_action_preview_id: creator.fields.source_record_id,
      first_reviewer_user_id: firstReviewer.fields.user_id,
      second_reviewer_user_id: secondReviewer.fields.user_id,
      approver_user_id: approver.fields.user_id,
      requester_identity_source: requester.fields.identity_source,
      creator_identity_source: creator.fields.identity_source,
      first_reviewer_identity_source: firstReviewer.fields.identity_source,
      second_reviewer_identity_source: secondReviewer.fields.identity_source,
      approver_identity_source: approver.fields.identity_source,
      requester_actor_kind: requester.fields.actor_kind,
      creator_actor_kind: creator.fields.actor_kind,
      first_reviewer_actor_kind: firstReviewer.fields.actor_kind,
      second_reviewer_actor_kind: secondReviewer.fields.actor_kind,
      approver_actor_kind: approver.fields.actor_kind,
    })
    const identityChainHash = hashApprovalIdentityChain(identityChain)

    // ── Timeline + derived expiry ─────────────────────────────
    if (compareApprovalLinkageIsoUtc(previewCreatedAt, previewExpiresAt) >= 0) {
      issues.push(approvalLinkageIssue("approval_linkage_stale", "(timeline).preview"))
    }
    if (compareApprovalLinkageIsoUtc(reviewCompletedAt, reviewExpiresAt) >= 0) {
      issues.push(approvalLinkageIssue("approval_linkage_stale", "(timeline).review"))
    }
    if (compareApprovalLinkageIsoUtc(approvalCreatedAt, approvalApprovedAt) > 0) {
      issues.push(approvalLinkageIssue("approval_linkage_stale", "(timeline).approval_created"))
    }
    if (compareApprovalLinkageIsoUtc(approvalApprovedAt, approvalExpiresAt) >= 0) {
      issues.push(approvalLinkageIssue("approval_linkage_stale", "(timeline).approval_expiry"))
    }
    if (isIsoUtcTimestamp(linkedAt)) {
      if (compareApprovalLinkageIsoUtc(linkedAt, reviewCompletedAt) < 0) {
        issues.push(approvalLinkageIssue("approval_linkage_stale", "(timeline).linked_at_review"))
      }
      if (compareApprovalLinkageIsoUtc(linkedAt, approvalApprovedAt) < 0) {
        issues.push(approvalLinkageIssue("approval_linkage_stale", "(timeline).linked_at_approval"))
      }
      if (
        compareApprovalLinkageIsoUtc(linkedAt, reviewExpiresAt) >= 0 ||
        compareApprovalLinkageIsoUtc(linkedAt, previewExpiresAt) >= 0 ||
        compareApprovalLinkageIsoUtc(linkedAt, approvalExpiresAt) >= 0
      ) {
        issues.push(approvalLinkageIssue("approval_linkage_stale", "(timeline).linked_at_expiry"))
      }
    }
    const linkageExpiresAt = minIso(minIso(reviewExpiresAt, previewExpiresAt), approvalExpiresAt)
    if (isIsoUtcTimestamp(evaluatedAt) && compareApprovalLinkageIsoUtc(evaluatedAt as string, linkageExpiresAt) >= 0) {
      issues.push(approvalLinkageIssue("approval_linkage_expired", "(linkage).linkage_expires_at"))
    }

    const derived: DerivedApprovalChain = {
      tenant_id: isApprovalLinkageNonEmptyString(tenantId) ? tenantId : "",
      human_decision_id: humanDecisionId,
      human_decision_hash: humanDecisionHash,
      review_evidence_id: reviewEvidenceId,
      review_evidence_hash: reviewEvidenceHash,
      review_envelope_hash: reviewEnvelopeHash,
      first_review_attestation_id: firstAttestationId,
      second_review_attestation_id: secondAttestationId,
      identity_chain_hash: identityChainHash,
      workunit_id: previewWorkunit,
      action_preview_id: previewId,
      approval_id: approvalId,
      action_type: previewActionType,
      target_hash: targetHash,
      payload_hash: payloadHash,
      approver_id: isApprovalLinkageNonEmptyString(approvedBy) ? approvedBy : "",
      preview_created_at: previewCreatedAt,
      preview_expires_at: previewExpiresAt,
      review_completed_at: reviewCompletedAt,
      review_expires_at: reviewExpiresAt,
      approval_created_at: approvalCreatedAt,
      approval_approved_at: approvalApprovedAt,
      approval_expires_at: approvalExpiresAt,
      linkage_expires_at: linkageExpiresAt,
    }

    // A required-hash sanity gate: never emit a derived chain with a
    // non-hex64 hash (defense in depth against an unexpected empty string).
    if (
      !isApprovalLinkageHex64(derived.human_decision_hash) ||
      !isApprovalLinkageHex64(derived.review_evidence_hash) ||
      !isApprovalLinkageHex64(derived.review_envelope_hash) ||
      !isApprovalLinkageHex64(derived.identity_chain_hash) ||
      !isApprovalLinkageHex64(derived.target_hash) ||
      !isApprovalLinkageHex64(derived.payload_hash) ||
      !isApprovalLinkageNonEmptyString(derived.tenant_id) ||
      !isApprovalLinkageNonEmptyString(derived.approver_id)
    ) {
      issues.push(approvalLinkageIssue("approval_linkage_state_missing", "(derived)"))
      return fail()
    }

    return { derived, issues }
  } catch {
    return {
      derived: null,
      issues: [approvalLinkageIssue("approval_linkage_validation_exception", "(source_evaluation)")],
    }
  }
}
