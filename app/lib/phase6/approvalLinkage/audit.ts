/**
 * P6-FIX-011: pure, redacted audit-event projection for Approval Chain Linkage
 * verification decisions (Issue #144; hardened P6-FIX-009/010 pattern).
 *
 * INTERNAL DECISION ONLY. The factory accepts the raw linkage record and the
 * current context and calls `verifyApprovalLinkage` itself: an external caller
 * can never supply the verification result. `event_kind`, `state`, `ok`, and
 * `issue_codes` are derived exclusively from that internally produced decision.
 *
 * I/O-FREE AND NON-AUTHORIZING. The factory builds a frozen in-memory audit
 * description only: it never calls the runtime audit logger, writes nothing,
 * and producing an audit event authorizes nothing.
 *
 * REDACTION BOUNDARY. The event exposes ONLY the record identifiers (linkage,
 * Human Decision, Review Evidence, WorkUnit, ActionPreview, Approval), the
 * verification state, the boolean outcome, the allowlisted stable issue codes,
 * and the supplied evaluation timestamp. It NEVER exposes target/payload
 * content, any hash (human-decision / review-envelope / identity-chain /
 * target / payload / linkage), any actor identity (requester / creator /
 * reviewer / approver), session IDs, roles, email, tokens, secrets,
 * ApprovalStore contents, or authorization material.
 *
 * TOTAL AND FAIL-CLOSED. Malformed input produces a rejected, fully redacted
 * event; the factory never throws and never mutates its input. Verification
 * and projection read the SAME single-read snapshots.
 */

import {
  APPROVAL_LINKAGE_ISSUE_CODES,
  isApprovalLinkageRecordObject,
  isApprovalLinkageNonEmptyString,
  snapshotRecordOrNull,
} from "./validation.ts"
import { isIsoUtcTimestamp } from "../shared/isoUtcTimestamp.ts"
import {
  APPROVAL_LINKAGE_AUDIT_EVENT_KINDS,
  type ApprovalLinkageAuditEvent,
  type ApprovalLinkageAuditEventKind,
  type ApprovalLinkageVerificationState,
} from "./types.ts"
import { verifyApprovalLinkage } from "./verifier.ts"

const INVALID_PLACEHOLDER = "(invalid)"
const FALLBACK_ISSUE_CODE = "approval_linkage_validation_exception"
const CANONICAL_CODES: ReadonlySet<string> = new Set(APPROVAL_LINKAGE_ISSUE_CODES)
const MAX_AUDIT_IDENTIFIER_LENGTH = 256

function safeIdentifier(value: unknown): string {
  return isApprovalLinkageNonEmptyString(value) && value.length <= MAX_AUDIT_IDENTIFIER_LENGTH
    ? value
    : INVALID_PLACEHOLDER
}

/**
 * Defense-in-depth issue-code sanitizer. Only exact members of the canonical
 * `APPROVAL_LINKAGE_ISSUE_CODES` may pass; a non-canonical or malformed entry
 * is never echoed, forces the projection to not-all-canonical, and is replaced
 * once by the stable fallback code. Output is de-duplicated in deterministic
 * first-occurrence order and frozen.
 */
export function sanitizeApprovalLinkageAuditIssueCodes(issues: unknown): {
  readonly issue_codes: readonly string[]
  readonly all_canonical: boolean
} {
  if (!Array.isArray(issues)) {
    return Object.freeze({ issue_codes: Object.freeze([FALLBACK_ISSUE_CODE]), all_canonical: false })
  }
  const codes: string[] = []
  let allCanonical = true
  for (const entry of issues) {
    const code = isApprovalLinkageRecordObject(entry) ? entry.code : undefined
    if (typeof code === "string" && CANONICAL_CODES.has(code)) {
      if (!codes.includes(code)) codes.push(code)
    } else {
      allCanonical = false
    }
  }
  if (!allCanonical && !codes.includes(FALLBACK_ISSUE_CODE)) codes.push(FALLBACK_ISSUE_CODE)
  return Object.freeze({ issue_codes: Object.freeze(codes), all_canonical: allCanonical })
}

function eventKindForState(
  state: ApprovalLinkageVerificationState,
  ok: boolean,
): ApprovalLinkageAuditEventKind {
  if (ok && state === "verified") return APPROVAL_LINKAGE_AUDIT_EVENT_KINDS[0]
  if (state === "stale") return APPROVAL_LINKAGE_AUDIT_EVENT_KINDS[1]
  if (state === "replayed") return APPROVAL_LINKAGE_AUDIT_EVENT_KINDS[2]
  return APPROVAL_LINKAGE_AUDIT_EVENT_KINDS[3]
}

function rejectedRedactedEvent(): ApprovalLinkageAuditEvent {
  return Object.freeze({
    event_kind: APPROVAL_LINKAGE_AUDIT_EVENT_KINDS[3],
    approval_linkage_id: INVALID_PLACEHOLDER,
    human_decision_id: INVALID_PLACEHOLDER,
    review_evidence_id: INVALID_PLACEHOLDER,
    workunit_id: INVALID_PLACEHOLDER,
    action_preview_id: INVALID_PLACEHOLDER,
    approval_id: INVALID_PLACEHOLDER,
    state: "invalid",
    ok: false,
    issue_codes: Object.freeze([FALLBACK_ISSUE_CODE]),
    evaluated_at: INVALID_PLACEHOLDER,
  })
}

/**
 * Project one linkage verification decision into a frozen, redacted audit
 * event. The decision is produced internally by `verifyApprovalLinkage` —
 * callers supply the raw linkage record and current context, never a result.
 */
export function createApprovalLinkageAuditEvent(
  linkage: unknown,
  context: unknown,
): ApprovalLinkageAuditEvent {
  try {
    // Single snapshots: verification AND projection read the same bytes.
    const linkageSnap = snapshotRecordOrNull(linkage)
    const contextSnap = snapshotRecordOrNull(context)

    const verification = verifyApprovalLinkage(linkageSnap, contextSnap)
    const sanitized = sanitizeApprovalLinkageAuditIssueCodes(verification.issues)
    const ok = verification.ok === true && sanitized.all_canonical
    const state = sanitized.all_canonical ? verification.state : "invalid"
    const eventKind = eventKindForState(state, ok)

    const record = linkageSnap ?? {}
    const evaluatedAt = contextSnap ? contextSnap.evaluated_at : undefined

    return Object.freeze({
      event_kind: eventKind,
      approval_linkage_id: safeIdentifier(record.approval_linkage_id),
      human_decision_id: safeIdentifier(record.human_decision_id),
      review_evidence_id: safeIdentifier(record.review_evidence_id),
      workunit_id: safeIdentifier(record.workunit_id),
      action_preview_id: safeIdentifier(record.action_preview_id),
      approval_id: safeIdentifier(record.approval_id),
      state,
      ok,
      issue_codes: sanitized.issue_codes,
      evaluated_at: isIsoUtcTimestamp(evaluatedAt) ? evaluatedAt : INVALID_PLACEHOLDER,
    })
  } catch {
    return rejectedRedactedEvent()
  }
}
