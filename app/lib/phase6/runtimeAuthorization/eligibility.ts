/**
 * P6-FIX-012: the pure Runtime Authorization eligibility evaluator (Issue #145).
 *
 * NON-AUTHORIZING BY CONSTRUCTION. This function determines EVIDENCE and POLICY
 * eligibility only. It does NOT claim ApprovalStore, does NOT consume the
 * Linkage, does NOT write audit logs, does NOT persist anything, does NOT call a
 * provider, does NOT create an ExecutionResult, and does NOT promote a WorkUnit.
 * `eligible` means only that every current source and policy would permit
 * ATTEMPTING the atomic claim at the supplied instant.
 *
 * It internally, in order:
 *   1. snapshots the complete input once;
 *   2. validates the exact snapshots it will use;
 *   3. runs `verifyApprovalLinkage` INTERNALLY (never a caller-supplied result)
 *      and requires linkage state exactly `verified`;
 *   4. evaluates the Human Decision runtime matrix;
 *   5. requires tenant, WorkUnit, ActionPreview, Approval, action type, target
 *      hash, and payload hash to match the intended action envelope AND the
 *      verified Linkage;
 *   6. validates the current canonical executor identity, enforcing executor
 *      tenant == authorization tenant, actor kind `executor`, identity source
 *      `authenticated_session`, human subject, and executor canonical user id
 *      DIFFERENT from the Linkage approver;
 *   7. derives a bounded authorization expiry (inclusive-fail at expiry);
 *   8. returns a frozen deterministic result.
 *
 * Never accepts a caller-supplied Linkage verification result, `linkage_verified`
 * boolean, `authorization_allowed` boolean, caller-supplied executor id, RBAC
 * result, kill-switch result, or an audit event as proof.
 *
 * Pure: no I/O, no clock (`issued_at` is supplied), no randomness, no mutation.
 */

import { verifyApprovalLinkage } from "../approvalLinkage/index.ts"
import { validateCanonicalIdentity } from "../canonicalIdentity/index.ts"
import { isIsoUtcTimestamp } from "../shared/isoUtcTimestamp.ts"
import {
  MAX_AUTHORIZATION_TTL_MS,
  RUNTIME_AUTHORIZATION_ACTION_TYPES,
  type RuntimeAuthorizationEligibilityResult,
  type RuntimeAuthorizationEligibilityState,
} from "./types.ts"
import {
  type RuntimeAuthorizationIssue,
  runtimeAuthorizationIssue,
  snapshotRecordOrNull,
  isRuntimeAuthorizationNonEmptyString,
} from "./validation.ts"
import { evaluateHumanDecisionRuntimeEligibility } from "./humanDecisionPolicy.ts"
import {
  deriveRuntimeAuthorizationIdempotencyKey,
  deriveRuntimeAuthorizationId,
} from "./canonical.ts"

// ─── Input shape ────────────────────────────────────────────────

const INPUT_FIELDS: readonly string[] = [
  "linkage",
  "linkage_context",
  "executor_identity",
  "intended_action",
  "session_expires_at",
  "issued_at",
]

const INTENDED_ACTION_FIELDS: readonly string[] = [
  "tenant_id",
  "workunit_id",
  "action_preview_id",
  "approval_id",
  "action_type",
  "target_hash",
  "payload_hash",
]

// Verified-linkage binding fields compared to the intended-action envelope.
const LINKAGE_ENVELOPE_FIELDS = [
  ["tenant_id", "runtime_authorization_tenant_mismatch"],
  ["workunit_id", "runtime_authorization_workunit_mismatch"],
  ["action_preview_id", "runtime_authorization_action_preview_mismatch"],
  ["approval_id", "runtime_authorization_approval_mismatch"],
  ["action_type", "runtime_authorization_action_type_mismatch"],
  ["target_hash", "runtime_authorization_target_hash_mismatch"],
  ["payload_hash", "runtime_authorization_payload_hash_mismatch"],
] as const

// ─── Helpers ────────────────────────────────────────────────────

function fail(
  state: Exclude<RuntimeAuthorizationEligibilityState, "eligible">,
  issues: readonly RuntimeAuthorizationIssue[],
): RuntimeAuthorizationEligibilityResult {
  return Object.freeze({
    ok: false,
    state,
    issue_codes: Object.freeze(issues.map((i) => i.code)),
  })
}

/** Map the Linkage verification state onto an eligibility failure state. */
function linkageStateToEligibility(
  state: string,
): { state: Exclude<RuntimeAuthorizationEligibilityState, "eligible">; code: RuntimeAuthorizationIssue["code"] } {
  switch (state) {
    case "invalid":
      return { state: "invalid", code: "runtime_authorization_linkage_invalid" }
    case "stale":
      return { state: "stale", code: "runtime_authorization_linkage_stale" }
    case "expired":
      return { state: "expired", code: "runtime_authorization_linkage_expired" }
    case "revoked":
      return { state: "revoked", code: "runtime_authorization_linkage_revoked" }
    case "used":
      return { state: "used", code: "runtime_authorization_linkage_used" }
    case "replayed":
      return { state: "replayed", code: "runtime_authorization_linkage_replayed" }
    default:
      return { state: "not_ready", code: "runtime_authorization_linkage_not_verified" }
  }
}

function parseIsoMs(value: string): number {
  return Date.parse(value)
}

/** Minimum of two pinned UTC ISO timestamps as an ISO string. */
function minIso(a: string, b: string): string {
  return parseIsoMs(a) <= parseIsoMs(b) ? a : b
}

// ─── Evaluator ──────────────────────────────────────────────────

export function evaluateRuntimeAuthorizationEligibility(
  input: unknown,
): RuntimeAuthorizationEligibilityResult {
  try {
    // 1. Snapshot the complete input once.
    const snap = snapshotRecordOrNull(input)
    if (snap === null) {
      return fail("invalid", [runtimeAuthorizationIssue("invalid_runtime_authorization_input", "(input)")])
    }
    for (const key of Object.keys(snap)) {
      if (!INPUT_FIELDS.includes(key)) {
        return fail("invalid", [runtimeAuthorizationIssue("invalid_runtime_authorization_input", `(input).${key}`)])
      }
    }

    const issuedAt = snap.issued_at
    const sessionExpiresAt = snap.session_expires_at
    if (!isIsoUtcTimestamp(issuedAt)) {
      return fail("invalid", [runtimeAuthorizationIssue("invalid_runtime_authorization_input", "(input).issued_at")])
    }
    if (!isIsoUtcTimestamp(sessionExpiresAt)) {
      return fail("invalid", [runtimeAuthorizationIssue("invalid_runtime_authorization_input", "(input).session_expires_at")])
    }

    // 2. Validate the intended-action envelope snapshot.
    const intended = snapshotRecordOrNull(snap.intended_action)
    if (intended === null) {
      return fail("invalid", [runtimeAuthorizationIssue("invalid_runtime_authorization_input", "(input).intended_action")])
    }
    for (const key of Object.keys(intended)) {
      if (!INTENDED_ACTION_FIELDS.includes(key)) {
        return fail("invalid", [runtimeAuthorizationIssue("invalid_runtime_authorization_input", `(intended_action).${key}`)])
      }
    }
    for (const field of INTENDED_ACTION_FIELDS) {
      if (!isRuntimeAuthorizationNonEmptyString(intended[field])) {
        return fail("invalid", [runtimeAuthorizationIssue("invalid_runtime_authorization_input", `(intended_action).${field}`)])
      }
    }
    if (!(RUNTIME_AUTHORIZATION_ACTION_TYPES as readonly string[]).includes(intended.action_type as string)) {
      return fail("invalid", [runtimeAuthorizationIssue("runtime_authorization_action_type_mismatch", "(intended_action).action_type")])
    }

    // 3. Snapshot the linkage context once; enforce one-evaluation-timestamp
    //    consistency (issued_at must equal the context evaluated_at), then run
    //    verifyApprovalLinkage INTERNALLY against the same snapshot.
    const context = snapshotRecordOrNull(snap.linkage_context)
    if (context === null) {
      return fail("not_ready", [runtimeAuthorizationIssue("runtime_authorization_state_missing", "(linkage_context)")])
    }
    if (context.evaluated_at !== issuedAt) {
      return fail("invalid", [runtimeAuthorizationIssue("runtime_authorization_timestamp_inconsistent", "(linkage_context).evaluated_at")])
    }

    const linkageResult = verifyApprovalLinkage(snap.linkage, context)
    if (!linkageResult.ok || linkageResult.state !== "verified") {
      const mapped = linkageStateToEligibility(linkageResult.state)
      return fail(mapped.state, [runtimeAuthorizationIssue(mapped.code, "(linkage)")])
    }

    // 4. Snapshot the verified linkage record and read its binding fields. The
    //    record is trusted post-verification, but still read via a single-read
    //    snapshot so no getter can diverge.
    const linkage = snapshotRecordOrNull(snap.linkage)
    if (linkage === null) {
      return fail("invalid", [runtimeAuthorizationIssue("runtime_authorization_linkage_invalid", "(linkage)")])
    }

    // 5. Human Decision runtime matrix over the context's authoritative Human
    //    Decision (its content is bound into the verified linkage hash).
    const decision = evaluateHumanDecisionRuntimeEligibility(context.human_decision)
    if (!decision.ok) {
      return fail("not_ready", decision.issues)
    }

    // 6. Intended-action envelope must equal the verified Linkage binding.
    const envelopeIssues: RuntimeAuthorizationIssue[] = []
    for (const [field, code] of LINKAGE_ENVELOPE_FIELDS) {
      if (linkage[field] !== intended[field]) {
        envelopeIssues.push(runtimeAuthorizationIssue(code, `(intended_action).${field}`))
      }
    }
    if (envelopeIssues.length > 0) {
      return fail("stale", envelopeIssues)
    }

    // 7. Current canonical executor identity.
    const executor = snapshotRecordOrNull(snap.executor_identity)
    if (executor === null || !validateCanonicalIdentity(executor).ok) {
      return fail("forbidden", [runtimeAuthorizationIssue("runtime_authorization_executor_invalid", "(executor_identity)")])
    }
    const executorIssues: RuntimeAuthorizationIssue[] = []
    if (executor.actor_kind !== "executor") {
      executorIssues.push(runtimeAuthorizationIssue("runtime_authorization_executor_actor_kind_mismatch", "(executor_identity).actor_kind"))
    }
    if (executor.identity_source !== "authenticated_session") {
      executorIssues.push(runtimeAuthorizationIssue("runtime_authorization_executor_source_untrusted", "(executor_identity).identity_source"))
    }
    if (executor.subject_type !== "human_user") {
      executorIssues.push(runtimeAuthorizationIssue("runtime_authorization_executor_subject_unsupported", "(executor_identity).subject_type"))
    }
    if (executor.tenant_id !== intended.tenant_id) {
      executorIssues.push(runtimeAuthorizationIssue("runtime_authorization_executor_tenant_mismatch", "(executor_identity).tenant_id"))
    }
    // Executor-versus-approver separation (Issue #145 owns this rule). Identity
    // equality is canonical tenant + user id — never role, email, or session id.
    if (
      isRuntimeAuthorizationNonEmptyString(executor.user_id) &&
      executor.user_id === linkage.approver_id
    ) {
      executorIssues.push(runtimeAuthorizationIssue("runtime_authorization_executor_equals_approver", "(executor_identity).user_id"))
    }
    if (executorIssues.length > 0) {
      return fail("forbidden", executorIssues)
    }

    // 8. Bounded authorization expiry (inclusive-fail at expiry).
    const linkageExpiresAt = linkage.linkage_expires_at
    const previewExpiresAt = linkage.preview_expires_at
    const approvalExpiresAt = linkage.approval_expires_at
    if (
      !isIsoUtcTimestamp(linkageExpiresAt) ||
      !isIsoUtcTimestamp(previewExpiresAt) ||
      !isIsoUtcTimestamp(approvalExpiresAt)
    ) {
      return fail("invalid", [runtimeAuthorizationIssue("runtime_authorization_linkage_invalid", "(linkage).expiry")])
    }
    const ttlCeiling = new Date(parseIsoMs(issuedAt) + MAX_AUTHORIZATION_TTL_MS).toISOString()
    const expiresAt = [
      previewExpiresAt as string,
      approvalExpiresAt as string,
      sessionExpiresAt,
      ttlCeiling,
    ].reduce((acc, cur) => minIso(acc, cur), linkageExpiresAt as string)

    // issued_at must strictly precede expiry; exactly-at-expiry is expired.
    if (parseIsoMs(issuedAt) >= parseIsoMs(expiresAt)) {
      return fail("expired", [runtimeAuthorizationIssue("runtime_authorization_expired", "(authorization).expires_at")])
    }

    // 9. Deterministic idempotency key + authorization id.
    const idempotencyKey = deriveRuntimeAuthorizationIdempotencyKey({
      tenant_id: intended.tenant_id as string,
      workunit_id: intended.workunit_id as string,
      action_preview_id: intended.action_preview_id as string,
      approval_id: intended.approval_id as string,
      approval_linkage_id: linkage.approval_linkage_id as string,
      action_type: intended.action_type as string,
      target_hash: intended.target_hash as string,
      payload_hash: intended.payload_hash as string,
      executor_id: executor.user_id as string,
    })
    const authorizationId = deriveRuntimeAuthorizationId(idempotencyKey)

    return Object.freeze({
      ok: true,
      state: "eligible",
      issue_codes: Object.freeze([]) as readonly [],
      evidence: Object.freeze({
        tenant_id: intended.tenant_id as string,
        workunit_id: intended.workunit_id as string,
        action_preview_id: intended.action_preview_id as string,
        approval_id: intended.approval_id as string,
        approval_linkage_id: linkage.approval_linkage_id as string,
        action_type: intended.action_type as string,
        target_hash: intended.target_hash as string,
        payload_hash: intended.payload_hash as string,
        executor_id: executor.user_id as string,
        idempotency_key: idempotencyKey,
        authorization_id: authorizationId,
        issued_at: issuedAt,
        expires_at: expiresAt,
      }),
    })
  } catch {
    return fail("invalid", [runtimeAuthorizationIssue("runtime_authorization_validation_exception", "(eligibility)")])
  }
}
