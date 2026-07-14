/**
 * P6-FIX-010: pure constructors for Phase 6 canonical identities (Issue #143).
 *
 * NON-AUTHORIZING BY CONSTRUCTION. Each constructor derives a canonical
 * identity exclusively from a trusted server-side source — a previously
 * authenticated session, or a stored ActionPreview row that trusted server
 * code already fetched — validates it fail-closed, and returns a fresh frozen
 * artifact. Construction success is not approval, not ApprovalStore approval,
 * not runtime authorization, not execution permission, not persistence, and
 * not Formal WorkUnit promotion.
 *
 * NO GENERIC CONSTRUCTOR. There is deliberately no public constructor that
 * accepts arbitrary `user_id` / `tenant_id` strings: callers can never supply
 * the canonical user or tenant identity directly. `user_id`, `tenant_id`, and
 * `source_record_id` are always derived from the trusted source object. The
 * single internal production point (`produceCanonicalIdentity`) is
 * module-private and both public constructors funnel through it.
 *
 * PROVENANCE, NOT PROOF. The opaque CanonicalIdentity brand is compile-time
 * only; a TypeScript cast can lie, so every downstream consumer re-validates
 * at runtime and future runtime gates (Issue #145) must re-check identity
 * server-side immediately before use.
 *
 * FAIL-CLOSED DELEGATION / SERVICE-ACCOUNT POLICY. Development sessions,
 * anonymous sessions, service-account markers, and delegation markers are
 * rejected. Delegated approval without separate delegation evidence is
 * unsupported.
 *
 * No I/O, no clock (`observed_at` is caller-supplied and validated), no
 * randomness, no repository access, no mutation of any input.
 */

import { isIsoUtcTimestamp } from "../shared/isoUtcTimestamp.ts"
import {
  SESSION_DERIVABLE_ACTOR_KINDS,
  type CanonicalIdentity,
  type SessionDerivableActorKind,
} from "./types.ts"
import {
  type CanonicalIdentityIssue,
  canonicalIdentityIssue,
  isCanonicalIdentityRecord,
  isCanonicalIdentityNonEmptyString,
  compareCanonicalIsoUtc,
  collectUnsupportedIdentityMarkerIssues,
  validateCanonicalIdentity,
} from "./validation.ts"

// ─── Construction result (frozen, non-authorizing) ──────────────

export type CanonicalIdentityConstructionSuccess = {
  readonly ok: true
  readonly identity: CanonicalIdentity
  readonly issues: readonly []
}

export type CanonicalIdentityConstructionFailure = {
  readonly ok: false
  readonly issues: readonly CanonicalIdentityIssue[]
}

export type CanonicalIdentityConstructionResult =
  | CanonicalIdentityConstructionSuccess
  | CanonicalIdentityConstructionFailure

function failConstruction(
  issues: readonly CanonicalIdentityIssue[],
): CanonicalIdentityConstructionFailure {
  return Object.freeze({ ok: false, issues: Object.freeze([...issues]) })
}

// ─── Shared construction helpers ────────────────────────────────

function snapshotRecord(value: unknown): Readonly<Record<string, unknown>> | null {
  if (!isCanonicalIdentityRecord(value)) return null
  // Single-read snapshot (getter-TOCTOU hardening): every own enumerable
  // top-level property is read exactly once; construction reads only this.
  const snapshot: Record<string, unknown> = {}
  for (const key of Object.keys(value)) {
    snapshot[key] = value[key]
  }
  return snapshot
}

/**
 * Fail-closed input-field guard: the caller-supplied input object may carry
 * ONLY the allowlisted control fields. Any other field — in particular
 * user_id / tenant_id / session-like or preview-like identity material — is
 * rejected so a caller can never smuggle identity through the input argument.
 * Delegation and service-account markers get their dedicated codes.
 */
function collectInputFieldIssues(
  snapshot: Readonly<Record<string, unknown>>,
  allowedFields: readonly string[],
): CanonicalIdentityIssue[] {
  const issues: CanonicalIdentityIssue[] = [
    ...collectUnsupportedIdentityMarkerIssues(snapshot, "(input)"),
  ]
  const markerHandled = new Set<string>(
    issues.map((issue) => issue.field.replace("(input).", "")),
  )
  for (const key of Object.keys(snapshot)) {
    if (allowedFields.includes(key)) continue
    if (markerHandled.has(key)) continue
    issues.push(canonicalIdentityIssue("invalid_identity_input", `(input).${key}`))
  }
  return issues
}

/**
 * The single module-private production point for the branded type. Every
 * candidate passes the full structural validator before the brand cast, even
 * though both constructors derive the fields themselves (defense in depth).
 */
function produceCanonicalIdentity(
  candidate: Record<string, unknown>,
): CanonicalIdentityConstructionResult {
  const validation = validateCanonicalIdentity(candidate)
  if (!validation.ok) return failConstruction(validation.issues)
  // The opaque brand is compile-time only; no runtime field is added. This
  // cast is the module's single trusted production point for the type.
  return Object.freeze({
    ok: true,
    identity: Object.freeze(candidate) as unknown as CanonicalIdentity,
    issues: Object.freeze([]) as readonly [],
  })
}

// ─── createCanonicalSessionIdentity ─────────────────────────────

const SESSION_INPUT_FIELDS: readonly string[] = [
  "actor_kind",
  "expected_tenant_id",
  "observed_at",
]

/**
 * Derive a canonical identity from a previously authenticated session.
 *
 * The caller never supplies `user_id` or the canonical tenant ID:
 * `user_id` ← `session.userId`, `tenant_id` ← `session.tenantId`,
 * `source_record_id` ← `session.sessionId`, `identity_source` is always
 * `authenticated_session`, `subject_type` is always the supported human-user
 * type. `expected_tenant_id` only asserts which tenant the caller believes it
 * is operating in — a mismatch fails closed, it never overrides the session.
 *
 * Fail-closed rejections: malformed session or input, missing user / tenant /
 * session id, unknown input fields, tenant mismatch, malformed or missing
 * expiry, `observed_at >= session.expiresAt` (exactly-at-expiry is expired),
 * development or anonymous sessions (`isDevSession` must be exactly `false`),
 * an actor kind not derivable from a session (`creator` in particular), and
 * delegation or service-account markers. No clock is read.
 */
export function createCanonicalSessionIdentity(
  session: unknown,
  input: {
    readonly actor_kind: SessionDerivableActorKind
    readonly expected_tenant_id: string
    readonly observed_at: string
  },
): CanonicalIdentityConstructionResult {
  try {
    const inputSnapshot = snapshotRecord(input)
    if (inputSnapshot === null) {
      return failConstruction([canonicalIdentityIssue("invalid_identity_input", "(input)")])
    }

    const issues: CanonicalIdentityIssue[] = collectInputFieldIssues(
      inputSnapshot,
      SESSION_INPUT_FIELDS,
    )

    const actorKind = inputSnapshot.actor_kind
    if (
      typeof actorKind !== "string" ||
      !(SESSION_DERIVABLE_ACTOR_KINDS as readonly string[]).includes(actorKind)
    ) {
      // `creator` and unknown kinds are not session-derivable.
      issues.push(canonicalIdentityIssue("identity_actor_kind_mismatch", "(input).actor_kind"))
    }
    const expectedTenantId = inputSnapshot.expected_tenant_id
    if (!isCanonicalIdentityNonEmptyString(expectedTenantId)) {
      issues.push(canonicalIdentityIssue("identity_state_missing", "(input).expected_tenant_id"))
    }
    const observedAt = inputSnapshot.observed_at
    if (!isIsoUtcTimestamp(observedAt)) {
      issues.push(canonicalIdentityIssue("invalid_identity_input", "(input).observed_at"))
    }

    const sessionSnapshot = snapshotRecord(session)
    if (sessionSnapshot === null) {
      issues.push(canonicalIdentityIssue("invalid_identity_input", "(session)"))
      return failConstruction(issues)
    }

    issues.push(...collectUnsupportedIdentityMarkerIssues(sessionSnapshot, "(session)"))

    const userId = sessionSnapshot.userId
    if (!isCanonicalIdentityNonEmptyString(userId)) {
      // An anonymous session (no canonical user) can never be an identity.
      issues.push(canonicalIdentityIssue("identity_state_missing", "(session).userId"))
    }
    const tenantId = sessionSnapshot.tenantId
    if (!isCanonicalIdentityNonEmptyString(tenantId)) {
      issues.push(canonicalIdentityIssue("identity_state_missing", "(session).tenantId"))
    }
    const sessionId = sessionSnapshot.sessionId
    if (!isCanonicalIdentityNonEmptyString(sessionId)) {
      issues.push(canonicalIdentityIssue("identity_state_missing", "(session).sessionId"))
    }
    const expiresAt = sessionSnapshot.expiresAt
    if (!isIsoUtcTimestamp(expiresAt)) {
      issues.push(canonicalIdentityIssue("identity_state_missing", "(session).expiresAt"))
    } else if (
      isIsoUtcTimestamp(observedAt) &&
      compareCanonicalIsoUtc(observedAt, expiresAt) >= 0
    ) {
      // Inclusive-fail expiry: exactly-at-expiry is already expired.
      issues.push(canonicalIdentityIssue("identity_session_expired", "(session).expiresAt"))
    }
    if (sessionSnapshot.isDevSession !== false) {
      // Development (or indeterminate) sessions are not approval-grade
      // identity sources; only an explicit boolean `false` passes.
      issues.push(canonicalIdentityIssue("identity_source_untrusted", "(session).isDevSession"))
    }
    if (
      isCanonicalIdentityNonEmptyString(expectedTenantId) &&
      isCanonicalIdentityNonEmptyString(tenantId) &&
      expectedTenantId !== tenantId
    ) {
      issues.push(canonicalIdentityIssue("identity_tenant_mismatch", "(session).tenantId"))
    }

    if (issues.length > 0) return failConstruction(issues)

    return produceCanonicalIdentity({
      tenant_id: tenantId as string,
      user_id: userId as string,
      actor_kind: actorKind as string,
      identity_source: "authenticated_session",
      source_record_id: sessionId as string,
      observed_at: observedAt as string,
      subject_type: "human_user",
    })
  } catch {
    return failConstruction([
      canonicalIdentityIssue("identity_validation_exception", "(session_identity_constructor)"),
    ])
  }
}

// ─── createCanonicalPreviewCreatorIdentity ──────────────────────

const PREVIEW_INPUT_FIELDS: readonly string[] = ["expected_tenant_id", "observed_at"]

/**
 * Derive the canonical CREATOR identity from a stored ActionPreview row that
 * trusted server code already fetched. This module never fetches the row and
 * never reads a client body or request field: only the stored row's
 * `creatorUserId`, `tenantId`, `id`, and `workUnitId` are consumed.
 *
 * `user_id` ← `preview.creatorUserId`, `tenant_id` ← `preview.tenantId`,
 * `source_record_id` ← `preview.id`, `actor_kind` is always `creator`,
 * `identity_source` is always `stored_action_preview_creator`.
 *
 * Fail-closed rejections: malformed preview or input, a MISSING CREATOR
 * (pre-P1 rows cannot prove distinct actors — no fallback or anonymous
 * creator is ever generated), missing tenant / preview / WorkUnit ids, tenant
 * mismatch, unknown input fields, and delegation or service-account markers.
 */
export function createCanonicalPreviewCreatorIdentity(
  preview: unknown,
  input: {
    readonly expected_tenant_id: string
    readonly observed_at: string
  },
): CanonicalIdentityConstructionResult {
  try {
    const inputSnapshot = snapshotRecord(input)
    if (inputSnapshot === null) {
      return failConstruction([canonicalIdentityIssue("invalid_identity_input", "(input)")])
    }

    const issues: CanonicalIdentityIssue[] = collectInputFieldIssues(
      inputSnapshot,
      PREVIEW_INPUT_FIELDS,
    )

    const expectedTenantId = inputSnapshot.expected_tenant_id
    if (!isCanonicalIdentityNonEmptyString(expectedTenantId)) {
      issues.push(canonicalIdentityIssue("identity_state_missing", "(input).expected_tenant_id"))
    }
    const observedAt = inputSnapshot.observed_at
    if (!isIsoUtcTimestamp(observedAt)) {
      issues.push(canonicalIdentityIssue("invalid_identity_input", "(input).observed_at"))
    }

    const previewSnapshot = snapshotRecord(preview)
    if (previewSnapshot === null) {
      issues.push(canonicalIdentityIssue("invalid_identity_input", "(preview)"))
      return failConstruction(issues)
    }

    issues.push(...collectUnsupportedIdentityMarkerIssues(previewSnapshot, "(preview)"))

    const creatorUserId = previewSnapshot.creatorUserId
    if (!isCanonicalIdentityNonEmptyString(creatorUserId)) {
      // Missing creator fails closed: a pre-P1 row cannot prove who created
      // the preview, and no fallback identity is ever synthesized.
      issues.push(canonicalIdentityIssue("identity_state_missing", "(preview).creatorUserId"))
    }
    const tenantId = previewSnapshot.tenantId
    if (!isCanonicalIdentityNonEmptyString(tenantId)) {
      issues.push(canonicalIdentityIssue("identity_state_missing", "(preview).tenantId"))
    }
    const previewId = previewSnapshot.id
    if (!isCanonicalIdentityNonEmptyString(previewId)) {
      issues.push(canonicalIdentityIssue("identity_state_missing", "(preview).id"))
    }
    if (!isCanonicalIdentityNonEmptyString(previewSnapshot.workUnitId)) {
      issues.push(canonicalIdentityIssue("identity_state_missing", "(preview).workUnitId"))
    }
    if (
      isCanonicalIdentityNonEmptyString(expectedTenantId) &&
      isCanonicalIdentityNonEmptyString(tenantId) &&
      expectedTenantId !== tenantId
    ) {
      issues.push(canonicalIdentityIssue("identity_tenant_mismatch", "(preview).tenantId"))
    }

    if (issues.length > 0) return failConstruction(issues)

    return produceCanonicalIdentity({
      tenant_id: tenantId as string,
      user_id: creatorUserId as string,
      actor_kind: "creator",
      identity_source: "stored_action_preview_creator",
      source_record_id: previewId as string,
      observed_at: observedAt as string,
      subject_type: "human_user",
    })
  } catch {
    return failConstruction([
      canonicalIdentityIssue("identity_validation_exception", "(creator_identity_constructor)"),
    ])
  }
}
