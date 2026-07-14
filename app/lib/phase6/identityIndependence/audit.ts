/**
 * P6-FIX-010: pure, redacted audit-event projection for identity-independence
 * decisions (Issue #143; hardened P6-FIX-009 pattern).
 *
 * INTERNAL DECISION ONLY. The factory accepts the raw evaluation input and
 * calls `verifyIdentityIndependence` itself: an external caller can never
 * supply the verification result, so a fabricated `{ ok: true }` object
 * cannot produce a verified audit event. `event_kind`, `ok`, and
 * `issue_codes` are derived exclusively from that internally produced
 * decision.
 *
 * I/O-FREE AND NON-AUTHORIZING. This factory builds a frozen, in-memory audit
 * description only: it never calls the runtime audit logger, writes nothing
 * anywhere, and producing an audit event authorizes nothing — no approval, no
 * persistence, no runtime authorization, no execution.
 *
 * STABLE-CODE ALLOWLIST (defense-in-depth). Even though the verification
 * result is internally produced, every issue code is checked against the
 * canonical `CANONICAL_IDENTITY_ISSUE_CODES` before it may enter
 * `event.issue_codes`. A non-canonical or malformed issue entry is never
 * echoed; it forces the event to the rejected state and is replaced by the
 * single stable fallback code `identity_validation_exception`. Codes are
 * de-duplicated in first-occurrence order, so the projection stays
 * deterministic.
 *
 * REDACTION BOUNDARY. The event exposes only: the event kind, the expected
 * Human Decision / WorkUnit / ActionPreview identifiers, the boolean outcome,
 * the allowlisted stable issue codes, and the supplied evaluation timestamp.
 * It NEVER exposes requester / creator / reviewer / approver / executor user
 * IDs, session IDs, email addresses, roles, raw session objects, payloads,
 * payload hashes, secrets, tokens, ApprovalStore records, or authorization
 * material. Identifiers are projected through a bounded-length guard;
 * otherwise they project as the literal "(invalid)" placeholder and supplied
 * values are not echoed.
 *
 * SELF-APPROVAL VISIBILITY. Any conflict detected by the canonical
 * `self_approval_forbidden` issue code projects the dedicated
 * `self_approval_forbidden` event kind so self-approval attempts stay
 * distinguishable in audit streams; every other failure projects the generic
 * `identity_independence_rejected` kind.
 *
 * TOTAL AND FAIL-CLOSED. The factory never throws for malformed input, never
 * mutates its input, and is deterministic for identical inputs.
 */

import {
  CANONICAL_IDENTITY_ISSUE_CODES,
  isCanonicalIdentityRecord,
  isCanonicalIdentityNonEmptyString,
} from "../canonicalIdentity/index.ts"
import { isIsoUtcTimestamp } from "../shared/isoUtcTimestamp.ts"
import {
  IDENTITY_INDEPENDENCE_AUDIT_EVENT_KINDS,
  type IdentityIndependenceAuditEvent,
} from "./types.ts"
import { verifyIdentityIndependence } from "./verifier.ts"

const INVALID_PLACEHOLDER = "(invalid)"

/**
 * The single stable fallback code substituted for any non-canonical or
 * malformed issue entry. It is itself a member of the canonical set.
 */
const FALLBACK_ISSUE_CODE = "identity_validation_exception"

const CANONICAL_CODES: ReadonlySet<string> = new Set(CANONICAL_IDENTITY_ISSUE_CODES)

/**
 * Identifiers longer than this are treated as invalid rather than echoed: a
 * malformed "identifier" field could otherwise smuggle payload-sized content
 * into the redacted audit event.
 */
const MAX_AUDIT_IDENTIFIER_LENGTH = 256

function safeIdentifier(value: unknown): string {
  return isCanonicalIdentityNonEmptyString(value) && value.length <= MAX_AUDIT_IDENTIFIER_LENGTH
    ? value
    : INVALID_PLACEHOLDER
}

/**
 * Pure shallow single-read snapshot of the audit input (P6-FIX-010
 * snapshot-consistency hardening). Returns a plain object copying every
 * own-enumerable property exactly once, or `null` when the value is not a
 * record or when reading it throws — a hostile getter or `ownKeys` trap fails
 * closed rather than escaping. The verifier decision AND the projected
 * identifiers/timestamp are derived from this same snapshot, so a getter can
 * never make the verifier see one value and the audit event emit another
 * (including a sensitive string).
 */
function snapshotRecordOrNull(value: unknown): Record<string, unknown> | null {
  try {
    if (!isCanonicalIdentityRecord(value)) return null
    const snapshot: Record<string, unknown> = {}
    for (const key of Object.keys(value)) {
      snapshot[key] = value[key]
    }
    return snapshot
  } catch {
    return null
  }
}

function rejectedRedactedEvent(): IdentityIndependenceAuditEvent {
  // Absolute totality: a snapshot failure (or any unexpected failure) projects
  // a rejected, fully redacted event and never throws.
  return Object.freeze({
    event_kind: IDENTITY_INDEPENDENCE_AUDIT_EVENT_KINDS[2],
    human_decision_id: INVALID_PLACEHOLDER,
    workunit_id: INVALID_PLACEHOLDER,
    action_preview_id: INVALID_PLACEHOLDER,
    ok: false,
    issue_codes: Object.freeze([FALLBACK_ISSUE_CODE]),
    evaluated_at: INVALID_PLACEHOLDER,
  })
}

/**
 * Defense-in-depth issue-code sanitizer for the audit boundary. Only exact
 * members of the canonical `CANONICAL_IDENTITY_ISSUE_CODES` may pass; an
 * arbitrary non-empty string is never copied merely because it appears in a
 * property named `code`. Any non-canonical or malformed entry is dropped
 * without being echoed, marks the projection as not-all-canonical (forcing
 * the audit event to the rejected state), and is represented once by the
 * stable fallback code. Output is de-duplicated in deterministic
 * first-occurrence order and frozen.
 */
export function sanitizeIdentityIndependenceAuditIssueCodes(issues: unknown): {
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
    const code = isCanonicalIdentityRecord(entry) ? entry.code : undefined
    if (typeof code === "string" && CANONICAL_CODES.has(code)) {
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
 * Project one identity-independence decision into a frozen, redacted audit
 * event. The decision is produced internally by
 * `verifyIdentityIndependence(input)` — callers supply the raw evaluation
 * input, never the result.
 */
export function createIdentityIndependenceAuditEvent(
  input: unknown,
): IdentityIndependenceAuditEvent {
  try {
    // One top-level snapshot: the verifier decision AND the projected
    // identifiers/timestamp are both derived from this exact snapshot, so a
    // getter cannot make the verifier see one value and the event emit
    // another. Snapshot failure fails closed with a fully redacted event.
    const snapshot = snapshotRecordOrNull(input)
    if (snapshot === null) return rejectedRedactedEvent()

    // The verification decision is internal and cannot be fabricated.
    const verification = verifyIdentityIndependence(snapshot)
    const sanitized = sanitizeIdentityIndependenceAuditIssueCodes(verification.issues)
    const ok = verification.ok === true && sanitized.all_canonical
    const eventKind = ok
      ? IDENTITY_INDEPENDENCE_AUDIT_EVENT_KINDS[0]
      : sanitized.issue_codes.includes("self_approval_forbidden")
        ? IDENTITY_INDEPENDENCE_AUDIT_EVENT_KINDS[1]
        : IDENTITY_INDEPENDENCE_AUDIT_EVENT_KINDS[2]

    // Only the expected record identifiers are projected — from the SAME
    // snapshot the verifier evaluated — never an identity object, user ID,
    // session ID, or any other actor material.
    return Object.freeze({
      event_kind: eventKind,
      human_decision_id: safeIdentifier(snapshot.expected_human_decision_id),
      workunit_id: safeIdentifier(snapshot.expected_workunit_id),
      action_preview_id: safeIdentifier(snapshot.expected_action_preview_id),
      ok,
      issue_codes: sanitized.issue_codes,
      evaluated_at: isIsoUtcTimestamp(snapshot.evaluated_at)
        ? snapshot.evaluated_at
        : INVALID_PLACEHOLDER,
    })
  } catch {
    return rejectedRedactedEvent()
  }
}
