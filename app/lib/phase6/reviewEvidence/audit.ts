/**
 * P6-FIX-009: pure, redacted audit-event projection for Four-Eyes Review
 * Evidence verification decisions (Issue #142).
 *
 * I/O-FREE AND NON-AUTHORIZING. This factory builds a frozen, in-memory audit
 * description only: it never calls the runtime audit logger, writes nothing
 * anywhere, and producing an audit event authorizes nothing.
 *
 * REDACTION BOUNDARY. The event exposes only: the event kind, the evidence /
 * source Human Decision / source WorkUnit identifiers, the boolean outcome,
 * the stable issue codes, and the supplied evaluation timestamp. It never
 * exposes the raw reviewed payload, any payload body or content, the payload
 * hash (a hash is payload-derived material with no audit-side consumer in this
 * patch, so it is excluded rather than justified), reviewer identities
 * (reviewer-level attribution belongs to the Issue #143 identity boundary),
 * secrets, credentials, session tokens, raw authorization material, or
 * approval records.
 *
 * TOTAL AND FAIL-CLOSED. The factory never throws for malformed input:
 * unusable identifiers or timestamps are replaced with the literal
 * "(invalid)" placeholder — supplied values are never echoed when malformed —
 * and a result that is not a verified-ok result projects as a rejection.
 */

import {
  type ReviewEvidenceAuditEvent,
  REVIEW_EVIDENCE_AUDIT_EVENT_KINDS,
} from "./types.ts"
import { isRecordObject, isNonEmptyString } from "./validation.ts"
import { isIsoUtcTimestamp } from "../shared/isoUtcTimestamp.ts"

const INVALID_PLACEHOLDER = "(invalid)"

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

function safeIssueCodes(result: unknown): readonly string[] {
  if (!isRecordObject(result) || !Array.isArray(result.issues)) return Object.freeze([])
  const codes: string[] = []
  for (const entry of result.issues) {
    if (isRecordObject(entry) && isNonEmptyString(entry.code)) codes.push(entry.code)
  }
  return Object.freeze(codes)
}

/**
 * Project one verification decision into a frozen, redacted audit event. The
 * `evidence` and `result` arguments are treated as untrusted shapes: only
 * allowlisted, non-sensitive projections are read from them.
 */
export function createReviewEvidenceAuditEvent(
  evidence: unknown,
  result: unknown,
  evaluatedAt: unknown,
): ReviewEvidenceAuditEvent {
  const record = isRecordObject(evidence) ? evidence : {}
  const ok = isRecordObject(result) && result.ok === true
  const eventKind = ok
    ? REVIEW_EVIDENCE_AUDIT_EVENT_KINDS[0]
    : REVIEW_EVIDENCE_AUDIT_EVENT_KINDS[1]
  return Object.freeze({
    event_kind: eventKind,
    review_evidence_id: safeIdentifier(record.review_evidence_id),
    source_human_decision_id: safeIdentifier(record.source_human_decision_id),
    source_workunit_id: safeIdentifier(record.source_workunit_id),
    ok,
    issue_codes: safeIssueCodes(result),
    evaluated_at: isIsoUtcTimestamp(evaluatedAt) ? evaluatedAt : INVALID_PLACEHOLDER,
  })
}
