/**
 * P6-FIX-010: the single canonical identity issue-code list, validation result
 * plumbing, and the fail-closed structural validator for canonical identities
 * (Issue #143).
 *
 * FAIL-CLOSED, NON-AUTHORIZING. A CanonicalIdentityValidationResult carries
 * only { ok, issues }: validation success is not approval, not ApprovalStore
 * approval, not runtime authorization, and not execution permission. Issue
 * messages are `${code}:${field}` only — they never echo input values, so a
 * supplied user ID, tenant ID, session ID, email, or token can never leak
 * through validation output.
 *
 * ONE CANONICAL CODE LIST. `CANONICAL_IDENTITY_ISSUE_CODES` is the single
 * exported issue-code source of truth for the canonical identity core AND the
 * higher identity-independence gate (which imports it from here). No second
 * copy may be maintained.
 *
 * Results follow the P6-FIX-007b frozen-snapshot precedent: the result object
 * is frozen and the issues array is a cloned + frozen snapshot.
 *
 * No I/O, no network, no database, no environment reads, no clock reads, no
 * randomness. Timestamp comparison is pure string normalization over the
 * pinned ISO-8601 UTC profile — never Date parsing.
 */

import { isIsoUtcTimestamp } from "../shared/isoUtcTimestamp.ts"
import {
  CANONICAL_ACTOR_KINDS,
  CANONICAL_IDENTITY_SOURCES,
  CANONICAL_IDENTITY_SUBJECT_TYPES,
  type CanonicalIdentity,
} from "./types.ts"

// ─── Stable issue codes (single canonical list) ─────────────────

export const CANONICAL_IDENTITY_ISSUE_CODES = [
  "invalid_identity_input",
  "identity_state_missing",
  "identity_source_untrusted",
  "identity_session_expired",
  "identity_tenant_mismatch",
  "identity_actor_kind_mismatch",
  "identity_subject_unsupported",
  "identity_evidence_mismatch",
  "duplicate_reviewer_identity",
  "self_approval_forbidden",
  "delegation_not_supported",
  "identity_validation_exception",
] as const

export type CanonicalIdentityIssueCode = (typeof CANONICAL_IDENTITY_ISSUE_CODES)[number]

export type CanonicalIdentityIssue = {
  readonly code: CanonicalIdentityIssueCode
  readonly field: string
  /** Always `${code}:${field}` — never contains input values. */
  readonly message: string
}

export type CanonicalIdentityValidationResult = {
  readonly ok: boolean
  readonly issues: readonly CanonicalIdentityIssue[]
}

export function canonicalIdentityIssue(
  code: CanonicalIdentityIssueCode,
  field: string,
): CanonicalIdentityIssue {
  return { code, field, message: `${code}:${field}` }
}

export function canonicalIdentityResultOf(
  issues: readonly CanonicalIdentityIssue[],
): CanonicalIdentityValidationResult {
  // Completed, immutable runtime snapshot (P6-FIX-007b precedent): clone and
  // freeze the issues array, then freeze the result. Freezing grants nothing.
  return Object.freeze({ ok: issues.length === 0, issues: Object.freeze([...issues]) })
}

// ─── Primitive predicates ───────────────────────────────────────

export function isCanonicalIdentityRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function isCanonicalIdentityNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}

// ─── Pure ISO-8601 UTC comparison ───────────────────────────────

/**
 * Compare two already-validated pinned-profile ISO-8601 UTC timestamps
 * without Date parsing (local pure copy of the P6-FIX-009 comparator: this
 * leaf module cannot import the Review Evidence module without inverting the
 * required dependency direction). Returns -1, 0, or 1. Callers must validate
 * both inputs with `isIsoUtcTimestamp` first.
 */
export function compareCanonicalIsoUtc(a: string, b: string): -1 | 0 | 1 {
  const [aBase, aFraction = ""] = a.replace("Z", "").split(".")
  const [bBase, bFraction = ""] = b.replace("Z", "").split(".")
  if (aBase !== bBase) return aBase < bBase ? -1 : 1
  const aPadded = aFraction.padEnd(3, "0")
  const bPadded = bFraction.padEnd(3, "0")
  if (aPadded === bPadded) return 0
  return aPadded < bPadded ? -1 : 1
}

// ─── Delegation / service-account fail-closed markers ──────────

/**
 * Field names whose PRESENCE on an identity-bearing object signals a
 * delegation attempt. Delegated approval is unsupported without separate
 * delegation evidence (deferred; see contract), so any such field fails
 * closed with `delegation_not_supported`.
 */
export const DELEGATION_MARKER_FIELDS = [
  "delegated_for_user_id",
  "delegatedForUserId",
  "delegation_evidence_id",
  "on_behalf_of",
] as const

/**
 * Field names whose PRESENCE signals a service-account identity. Service
 * accounts are not supported human review/approval identities in this patch,
 * so any such field fails closed with `identity_subject_unsupported`.
 */
export const SERVICE_ACCOUNT_MARKER_FIELDS = [
  "is_service_account",
  "isServiceAccount",
  "service_account_id",
  "serviceAccountId",
] as const

/**
 * Collect fail-closed issues for delegation and service-account markers on a
 * snapshot of any identity-bearing object. `fieldPrefix` names the object
 * position (e.g. "(session)") — never a value.
 */
export function collectUnsupportedIdentityMarkerIssues(
  snapshot: Readonly<Record<string, unknown>>,
  fieldPrefix: string,
): CanonicalIdentityIssue[] {
  const issues: CanonicalIdentityIssue[] = []
  for (const marker of DELEGATION_MARKER_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(snapshot, marker)) {
      issues.push(canonicalIdentityIssue("delegation_not_supported", `${fieldPrefix}.${marker}`))
    }
  }
  for (const marker of SERVICE_ACCOUNT_MARKER_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(snapshot, marker)) {
      issues.push(
        canonicalIdentityIssue("identity_subject_unsupported", `${fieldPrefix}.${marker}`),
      )
    }
  }
  return issues
}

// ─── Structural canonical-identity validator ────────────────────

const CANONICAL_IDENTITY_FIELDS = [
  "tenant_id",
  "user_id",
  "actor_kind",
  "identity_source",
  "source_record_id",
  "observed_at",
  "subject_type",
] as const

/**
 * Pure, fail-closed, NON-NARROWING structural validator for a canonical
 * identity value. Because a TypeScript cast can lie about the opaque brand,
 * every downstream consumer of a CanonicalIdentity must run this validator
 * before trusting any field. It never asserts `input is CanonicalIdentity` —
 * only the constructors produce the branded type.
 *
 * Enforced here (fail closed): record shape, exact seven-field allowlist
 * (unknown fields rejected; delegation and service-account markers rejected
 * with their dedicated codes), non-empty tenant/user/source-record ids, a
 * known actor kind, a trusted identity source, a supported subject type, a
 * valid pinned ISO-8601 UTC `observed_at`, and the source/actor-kind pairing
 * (`creator` ⇔ `stored_action_preview_creator`; every other actor kind ⇔
 * `authenticated_session`).
 */
export function validateCanonicalIdentity(input: unknown): CanonicalIdentityValidationResult {
  try {
    if (!isCanonicalIdentityRecord(input)) {
      return canonicalIdentityResultOf([
        canonicalIdentityIssue("invalid_identity_input", "(identity)"),
      ])
    }
    // Single-read snapshot (getter-TOCTOU hardening).
    const snapshot: Record<string, unknown> = {}
    for (const key of Object.keys(input)) {
      snapshot[key] = input[key]
    }

    const issues: CanonicalIdentityIssue[] = []
    issues.push(...collectUnsupportedIdentityMarkerIssues(snapshot, "(identity)"))
    for (const key of Object.keys(snapshot)) {
      if ((CANONICAL_IDENTITY_FIELDS as readonly string[]).includes(key)) continue
      if ((DELEGATION_MARKER_FIELDS as readonly string[]).includes(key)) continue
      if ((SERVICE_ACCOUNT_MARKER_FIELDS as readonly string[]).includes(key)) continue
      issues.push(canonicalIdentityIssue("invalid_identity_input", `(identity).${key}`))
    }

    if (!isCanonicalIdentityNonEmptyString(snapshot.tenant_id)) {
      issues.push(canonicalIdentityIssue("identity_state_missing", "(identity).tenant_id"))
    }
    if (!isCanonicalIdentityNonEmptyString(snapshot.user_id)) {
      issues.push(canonicalIdentityIssue("identity_state_missing", "(identity).user_id"))
    }
    if (!isCanonicalIdentityNonEmptyString(snapshot.source_record_id)) {
      issues.push(canonicalIdentityIssue("identity_state_missing", "(identity).source_record_id"))
    }
    const actorKind = snapshot.actor_kind
    if (
      typeof actorKind !== "string" ||
      !(CANONICAL_ACTOR_KINDS as readonly string[]).includes(actorKind)
    ) {
      issues.push(canonicalIdentityIssue("identity_actor_kind_mismatch", "(identity).actor_kind"))
    }
    const identitySource = snapshot.identity_source
    if (
      typeof identitySource !== "string" ||
      !(CANONICAL_IDENTITY_SOURCES as readonly string[]).includes(identitySource)
    ) {
      issues.push(canonicalIdentityIssue("identity_source_untrusted", "(identity).identity_source"))
    }
    const subjectType = snapshot.subject_type
    if (
      typeof subjectType !== "string" ||
      !(CANONICAL_IDENTITY_SUBJECT_TYPES as readonly string[]).includes(subjectType)
    ) {
      issues.push(canonicalIdentityIssue("identity_subject_unsupported", "(identity).subject_type"))
    }
    if (!isIsoUtcTimestamp(snapshot.observed_at)) {
      issues.push(canonicalIdentityIssue("invalid_identity_input", "(identity).observed_at"))
    }

    // Source/actor-kind pairing: a creator identity can come only from the
    // stored ActionPreview creator; every session-derivable kind can come only
    // from an authenticated session. A cast that mixes them fails closed.
    if (
      typeof actorKind === "string" &&
      typeof identitySource === "string" &&
      (CANONICAL_ACTOR_KINDS as readonly string[]).includes(actorKind) &&
      (CANONICAL_IDENTITY_SOURCES as readonly string[]).includes(identitySource)
    ) {
      const expectedSource =
        actorKind === "creator" ? "stored_action_preview_creator" : "authenticated_session"
      if (identitySource !== expectedSource) {
        issues.push(
          canonicalIdentityIssue("identity_source_untrusted", "(identity).identity_source"),
        )
      }
    }

    return canonicalIdentityResultOf(issues)
  } catch {
    return canonicalIdentityResultOf([
      canonicalIdentityIssue("identity_validation_exception", "(identity)"),
    ])
  }
}

// ─── Canonical user equality ────────────────────────────────────

/**
 * Canonical identity equality: the same `tenant_id` AND the same `user_id`.
 * Role, actor kind, source, email, display name, provider, and session ID are
 * deliberately ignored — one user under multiple roles is still one user.
 * Both arguments must already have passed `validateCanonicalIdentity`; this
 * predicate performs exact string comparison only and grants nothing.
 */
export function isSameCanonicalUser(a: CanonicalIdentity, b: CanonicalIdentity): boolean {
  return a.tenant_id === b.tenant_id && a.user_id === b.user_id
}
