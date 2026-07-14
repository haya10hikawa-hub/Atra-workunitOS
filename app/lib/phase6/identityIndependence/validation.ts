/**
 * P6-FIX-010: validation plumbing for the Phase 6 Identity Independence gate
 * (Issue #143).
 *
 * SINGLE SOURCE OF TRUTH. This file deliberately defines NO issue codes of
 * its own: the canonical exported list is `CANONICAL_IDENTITY_ISSUE_CODES`
 * in the canonical identity core, re-used here unchanged so no duplicated
 * code list can drift. Only thin result helpers live here.
 *
 * FAIL-CLOSED, NON-AUTHORIZING. Results carry only { ok, issues }; issue
 * messages are stable `code:field` strings and never echo supplied values.
 * The result object is frozen and the issues array is a cloned + frozen
 * snapshot (P6-FIX-007b precedent). No I/O, no clock, no randomness.
 */

import {
  type CanonicalIdentityIssue,
  canonicalIdentityIssue,
  canonicalIdentityResultOf,
  type CanonicalIdentityIssueCode,
} from "../canonicalIdentity/index.ts"
import type { IdentityIndependenceIssue, IdentityIndependenceResult } from "./types.ts"

/** Stable `code:field` issue for the independence gate (canonical codes only). */
export function identityIndependenceIssue(
  code: CanonicalIdentityIssueCode,
  field: string,
): IdentityIndependenceIssue {
  return canonicalIdentityIssue(code, field)
}

/** Frozen `{ ok, issues }` result with a defensively copied issue array. */
export function identityIndependenceResultOf(
  issues: readonly IdentityIndependenceIssue[],
): IdentityIndependenceResult {
  return canonicalIdentityResultOf(issues)
}

/**
 * Re-scope a validation issue produced for a nested object (an identity or
 * artifact) onto its named position in the independence evaluation, e.g.
 * `(identity).user_id` → `(first_reviewer_identity).user_id`. Codes pass
 * through unchanged; values are never echoed.
 */
export function rescopeIssueField(
  issue: CanonicalIdentityIssue,
  positionField: string,
): IdentityIndependenceIssue {
  const rescoped = issue.field.startsWith("(identity)")
    ? issue.field.replace("(identity)", positionField)
    : `${positionField}.${issue.field}`
  return canonicalIdentityIssue(issue.code, rescoped)
}
