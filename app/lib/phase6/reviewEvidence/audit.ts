/**
 * P6-FIX-009: pure, redacted audit-event projection for Four-Eyes Review
 * Evidence verification decisions (Issue #142; hardened for PR #160).
 *
 * INTERNAL DECISION ONLY. The factory accepts the evidence and the server-side
 * verification context and calls `verifyFourEyesReviewEvidence` itself: an
 * external caller can never supply the verification result, so a fabricated
 * `{ ok: true }` object cannot produce a verified audit event. `event_kind`,
 * `ok`, and `issue_codes` are derived exclusively from that internally
 * produced decision.
 *
 * I/O-FREE AND NON-AUTHORIZING. This factory builds a frozen, in-memory audit
 * description only: it never calls the runtime audit logger, writes nothing
 * anywhere, and producing an audit event authorizes nothing — no approval, no
 * persistence, no runtime authorization, no execution.
 *
 * STABLE-CODE ALLOWLIST (defense-in-depth). Even though the verification
 * result is internally produced, every issue code is checked against the
 * canonical `REVIEW_EVIDENCE_ISSUE_CODES` before it may enter
 * `event.issue_codes`. A non-canonical or malformed issue entry is never
 * echoed (not its code, field, message, or value); it forces the event to the
 * rejected state and is replaced by the single stable fallback code
 * `review_evidence_validation_exception`. Codes are de-duplicated in
 * first-occurrence order, so the projection stays deterministic.
 *
 * REDACTION BOUNDARY. The event exposes only: the event kind, the evidence /
 * source Human Decision / source WorkUnit identifiers, the boolean outcome,
 * the allowlisted stable issue codes, and the context-supplied evaluation
 * timestamp. It never exposes the raw reviewed payload, any payload body or
 * content, the payload hash (payload-derived material with no audit-side
 * consumer in this patch), reviewer identities (reviewer-level attribution
 * belongs to the Issue #143 identity boundary), secrets, credentials, session
 * tokens, raw authorization material, or approval records. Evidence
 * identifiers are projected only after the evidence passes defensive
 * structural validation; otherwise every identifier projects as the literal
 * "(invalid)" placeholder and supplied values are not echoed.
 *
 * TOTAL AND FAIL-CLOSED. The factory never throws for malformed input, never
 * mutates the evidence or the context, and is deterministic for identical
 * inputs.
 */

import {
  type ReviewEvidenceAuditEvent,
  REVIEW_EVIDENCE_AUDIT_EVENT_KINDS,
} from "./types.ts"
import {
  REVIEW_EVIDENCE_ISSUE_CODES,
  isRecordObject,
  isNonEmptyString,
} from "./validation.ts"
import { validateFourEyesReviewEvidence } from "./validators.ts"
import { verifyFourEyesReviewEvidence } from "./verifier.ts"
import { isIsoUtcTimestamp } from "../shared/isoUtcTimestamp.ts"

const INVALID_PLACEHOLDER = "(invalid)"

/**
 * The single stable fallback code substituted for any non-canonical or
 * malformed issue entry. It is itself a member of the canonical set.
 */
const FALLBACK_ISSUE_CODE = "review_evidence_validation_exception"

const CANONICAL_ISSUE_CODES: ReadonlySet<string> = new Set(REVIEW_EVIDENCE_ISSUE_CODES)

/**
 * Identifiers longer than this are treated as invalid rather than echoed: a
 * malformed "identifier" field could otherwise smuggle payload-sized content
 * into the redacted audit event.
 */
const MAX_AUDIT_IDENTIFIER_LENGTH = 256

function safeIdentifier(value: unknown): string {
  return isNonEmptyString(value) && value.length <= MAX_AUDIT_IDENTIFIER_LENGTH
    ? value
    : INVALID_PLACEHOLDER
}

/**
 * Defense-in-depth issue-code sanitizer for the audit boundary. Only exact
 * members of the canonical `REVIEW_EVIDENCE_ISSUE_CODES` may pass; an
 * arbitrary non-empty string is never copied merely because it appears in a
 * property named `code`. Any non-canonical or malformed entry is dropped
 * without being echoed, marks the projection as not-all-canonical (forcing
 * the audit event to the rejected state), and is represented once by the
 * stable fallback code. Output is de-duplicated in deterministic
 * first-occurrence order and frozen.
 */
export function sanitizeReviewEvidenceAuditIssueCodes(issues: unknown): {
  readonly issue_codes: readonly string[]
  readonly all_canonical: boolean
} {
  if (!Array.isArray(issues)) {
    return Object.freeze({
      issue_codes: Object.freeze([FALLBACK_ISSUE_CODE]),
      all_canonical: false,
    })
  }
  const codes: string[] = []
  let allCanonical = true
  for (const entry of issues) {
    const code = isRecordObject(entry) ? entry.code : undefined
    if (typeof code === "string" && CANONICAL_ISSUE_CODES.has(code)) {
      if (!codes.includes(code)) codes.push(code)
    } else {
      // Never echo the entry's code, field, message, or value.
      allCanonical = false
    }
  }
  if (!allCanonical && !codes.includes(FALLBACK_ISSUE_CODE)) {
    codes.push(FALLBACK_ISSUE_CODE)
  }
  return Object.freeze({ issue_codes: Object.freeze(codes), all_canonical: allCanonical })
}

/**
 * Project one verification decision into a frozen, redacted audit event. The
 * decision is produced internally by `verifyFourEyesReviewEvidence(evidence,
 * context)` — callers supply the evidence and the server-side verification
 * context, never the result.
 */
export function createReviewEvidenceAuditEvent(
  evidence: unknown,
  context: unknown,
): ReviewEvidenceAuditEvent {
  try {
    // The verification decision is internal and cannot be fabricated.
    const verification = verifyFourEyesReviewEvidence(evidence, context)
    const sanitized = sanitizeReviewEvidenceAuditIssueCodes(verification.issues)
    const ok = verification.ok === true && sanitized.all_canonical
    const eventKind = ok
      ? REVIEW_EVIDENCE_AUDIT_EVENT_KINDS[0]
      : REVIEW_EVIDENCE_AUDIT_EVENT_KINDS[1]

    // Evidence identifiers are projected only from structurally valid
    // evidence; otherwise every identifier is the "(invalid)" placeholder.
    const structurallyValid = validateFourEyesReviewEvidence(evidence).ok
    const record = structurallyValid && isRecordObject(evidence) ? evidence : {}

    // evaluated_at is obtained defensively from the supplied context.
    const evaluatedAt = isRecordObject(context) ? context.evaluated_at : undefined

    return Object.freeze({
      event_kind: eventKind,
      review_evidence_id: safeIdentifier(record.review_evidence_id),
      source_human_decision_id: safeIdentifier(record.source_human_decision_id),
      source_workunit_id: safeIdentifier(record.source_workunit_id),
      ok,
      issue_codes: sanitized.issue_codes,
      evaluated_at: isIsoUtcTimestamp(evaluatedAt) ? evaluatedAt : INVALID_PLACEHOLDER,
    })
  } catch {
    // Absolute totality: even an unexpected failure projects a rejected,
    // fully redacted event and never throws.
    return Object.freeze({
      event_kind: REVIEW_EVIDENCE_AUDIT_EVENT_KINDS[1],
      review_evidence_id: INVALID_PLACEHOLDER,
      source_human_decision_id: INVALID_PLACEHOLDER,
      source_workunit_id: INVALID_PLACEHOLDER,
      ok: false,
      issue_codes: Object.freeze([FALLBACK_ISSUE_CODE]),
      evaluated_at: INVALID_PLACEHOLDER,
    })
  }
}
