/**
 * P6-FIX-010: inert types for the Phase 6 Canonical Identity core module
 * (Issue #143, docs/CANONICAL_IDENTITY_INDEPENDENCE_CONTRACT.md).
 *
 * NON-AUTHORIZING BY CONSTRUCTION. A CanonicalIdentity records the canonical
 * user identity (`tenant_id` + `user_id`) of one actor position, together with
 * the trusted server-side source it was derived from. Producing, validating,
 * or comparing canonical identities is not approval, not ApprovalStore
 * approval, not runtime authorization, not execution permission, not
 * persistence, and not Formal WorkUnit promotion.
 *
 * CANONICAL USER IDENTITY. One user is one identity: `tenant_id` + `user_id`.
 * Role names, email addresses, display names, provider names, session IDs
 * alone, model output, and client-supplied actor fields never establish or
 * differentiate identity. One user acting under multiple roles is still one
 * identity.
 *
 * DEPENDENCY LEAF. This module is the lower Phase 6 identity layer: it must
 * never import Review Evidence, Human Decision artifacts, ApprovalStore,
 * runtime routes, external clients, or persistence repositories/database
 * implementations. Only canonical TYPE definitions (SessionContext,
 * ActionPreviewRow) are imported, type-only, for documentation and
 * compile-time tests.
 *
 * These types are inert descriptions only: no runtime behavior, no consumer,
 * no capability, no I/O, no clock, no randomness.
 */

import type { SessionContext } from "../../domain/auth/types.ts"
import type { ActionPreviewRow } from "../../persistence/types.ts"

// ─── Canonical enumerations ─────────────────────────────────────

/** Actor positions a canonical identity can occupy. */
export const CANONICAL_ACTOR_KINDS = [
  "requester",
  "creator",
  "reviewer",
  "approver",
  "executor",
] as const

export type CanonicalActorKind = (typeof CANONICAL_ACTOR_KINDS)[number]

/**
 * Actor kinds derivable from an authenticated session. `creator` is
 * deliberately absent: the creator identity comes only from the stored
 * ActionPreview row, never from the current session.
 */
export const SESSION_DERIVABLE_ACTOR_KINDS = [
  "requester",
  "reviewer",
  "approver",
  "executor",
] as const

export type SessionDerivableActorKind = (typeof SESSION_DERIVABLE_ACTOR_KINDS)[number]

/**
 * The only accepted identity provenance sources. Anything else — client
 * bodies, request headers, model output, role names, delegation strings —
 * is untrusted and fails closed.
 */
export const CANONICAL_IDENTITY_SOURCES = [
  "authenticated_session",
  "stored_action_preview_creator",
] as const

export type CanonicalIdentitySource = (typeof CANONICAL_IDENTITY_SOURCES)[number]

/**
 * Supported identity subject types. Only human users are supported: service
 * accounts and delegated identities are unsupported for review and approval
 * in this patch and fail closed (see the contract's delegation policy).
 */
export const CANONICAL_IDENTITY_SUBJECT_TYPES = ["human_user"] as const

export type CanonicalIdentitySubjectType = (typeof CANONICAL_IDENTITY_SUBJECT_TYPES)[number]

// ─── Canonical source type references (type-only) ───────────────

/**
 * The canonical authenticated-session shape consumed by
 * `createCanonicalSessionIdentity`. Type-only reference: the constructor still
 * treats its argument as `unknown` and validates every field at runtime.
 */
export type CanonicalIdentitySessionSource = SessionContext

/**
 * The canonical stored ActionPreview row shape consumed by
 * `createCanonicalPreviewCreatorIdentity`. The caller must supply an
 * already server-fetched row; this module never touches a repository.
 */
export type CanonicalIdentityPreviewSource = ActionPreviewRow

// ─── Opaque canonical identity ──────────────────────────────────

/**
 * Module-private opaque brand for constructor-produced canonical identities.
 * It is a compile-time-only phantom property: never assigned on the runtime
 * object, never serialized, and deliberately NOT exported, so no code outside
 * this module can forge a CanonicalIdentity by writing an object literal.
 *
 * A TypeScript cast can always lie: this brand is a compile-time PROVENANCE
 * boundary, not cryptographic proof of identity and not authorization.
 * Downstream verifiers must defensively re-validate every canonical identity
 * at runtime, and future runtime gates (Issue #145) must re-check identity
 * server-side immediately before use.
 */
declare const canonicalIdentityBrand: unique symbol

/**
 * One canonical actor identity, produced ONLY by
 * `createCanonicalSessionIdentity` or `createCanonicalPreviewCreatorIdentity`.
 * Identity equality is `tenant_id` + `user_id`; every other field records
 * provenance, not identity. Holding a CanonicalIdentity grants nothing.
 */
export type CanonicalIdentity = {
  readonly tenant_id: string
  readonly user_id: string
  readonly actor_kind: CanonicalActorKind
  readonly identity_source: CanonicalIdentitySource
  readonly source_record_id: string
  readonly observed_at: string
  readonly subject_type: CanonicalIdentitySubjectType
  readonly [canonicalIdentityBrand]: true
}
