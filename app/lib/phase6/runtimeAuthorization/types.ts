/**
 * P6-FIX-012: inert types and pinned constants for the Phase 6 Runtime
 * Authorization module (Issue #145,
 * docs/RUNTIME_AUTHORIZATION_GATE_CONTRACT.md).
 *
 * NON-AUTHORIZING BY CONSTRUCTION UNTIL THE SIDE-EFFECTFUL GATE CLAIMS.
 * Evaluating runtime-authorization eligibility proves only that, at one
 * server-supplied instant, a verified Approval Chain Linkage, a runtime-eligible
 * Human Decision, the current executor identity, and the intended action
 * envelope are all mutually consistent. It is NOT approval, NOT ApprovalStore
 * approval, NOT a one-time-use claim, NOT runtime authorization, and NOT
 * execution permission. Only the server-side gate — after the exact-binding
 * atomic ApprovalStore claim wins — may construct a `RuntimeAuthorizationReceipt`.
 *
 * A `RuntimeAuthorizationReceipt` is `authorized_not_executed`. It is NOT a
 * bearer token, NOT a provider credential, NOT a provider request, NOT an
 * ExecutionResult, and holding or validating one never itself calls a provider.
 * Its `authorization_hash` is an unkeyed SHA-256 INTEGRITY identifier, never a
 * MAC.
 *
 * DEPENDENCY LEAF. This module imports only inert Phase 6 policy modules and the
 * shared SHA-256 hash/timestamp leaves. It must never import routes,
 * repositories, D1, ApprovalStore resolvers, environment variables, provider
 * clients, audit persistence, Next.js, UI, or Electron. It never reads a clock
 * (`issued_at`/`evaluated_at` are supplied), never reads randomness, and never
 * mutates an input.
 */

// ─── Pinned canonical domains, versions, algorithm, TTL ─────────

/** SHA-256 over `atra-sorted-json-v1` canonical JSON. Never a keyed MAC. */
export const RUNTIME_AUTHORIZATION_HASH_ALGORITHM = "sha256" as const
export const RUNTIME_AUTHORIZATION_CANONICALIZATION_ALGORITHM = "atra-sorted-json-v1" as const

/** Domain separation: distinct from every other Phase 6 hash domain. */
export const RUNTIME_AUTHORIZATION_HASH_DOMAIN = "atra.runtime-authorization" as const
export const RUNTIME_AUTHORIZATION_HASH_VERSION = "1" as const

/** Separate domain for the deterministic idempotency key. */
export const RUNTIME_AUTHORIZATION_IDEMPOTENCY_DOMAIN =
  "atra.runtime-authorization-idempotency" as const
export const RUNTIME_AUTHORIZATION_IDEMPOTENCY_VERSION = "1" as const

/** The single non-executed status a receipt may ever carry. */
export const RUNTIME_AUTHORIZATION_STATUS = "authorized_not_executed" as const

/**
 * Short pinned maximum authorization TTL (milliseconds). The derived expiry is
 * the minimum of this and every upstream expiry; it can only ever be shorter.
 */
export const MAX_AUTHORIZATION_TTL_MS = 30_000

/** Supported external action types (mirror of the runtime `ApprovalActionType`). */
export const RUNTIME_AUTHORIZATION_ACTION_TYPES = [
  "slack_reply",
  "gmail_reply",
  "github_issue",
  "calendar_event",
] as const

export type RuntimeAuthorizationActionType =
  (typeof RUNTIME_AUTHORIZATION_ACTION_TYPES)[number]

// ─── Inert intended-action envelope ─────────────────────────────

/**
 * The inert identifiers the caller may name. Every hash and every evidence
 * object is server-owned and resolved separately; the caller never supplies
 * Human Decision, Review Evidence, Linkage, identities, hashes, RBAC results,
 * kill-switch results, executor IDs, or any authorization boolean.
 */
export type RuntimeAuthorizationIntendedAction = {
  readonly tenant_id: string
  readonly workunit_id: string
  readonly action_preview_id: string
  readonly approval_id: string
  readonly action_type: string
  readonly target_hash: string
  readonly payload_hash: string
}

// ─── Canonical payload (plain, insertion-order independent) ──────

/**
 * Runtime Authorization payload V1 — the exact canonical value hashed into
 * `authorization_hash`. It deliberately EXCLUDES `authorization_hash` itself (a
 * hash never covers itself), and carries NO raw target, raw payload, email,
 * session object, role text, token, secret, or environment value.
 */
export type RuntimeAuthorizationPayloadV1 = {
  readonly hash_domain: typeof RUNTIME_AUTHORIZATION_HASH_DOMAIN
  readonly hash_version: typeof RUNTIME_AUTHORIZATION_HASH_VERSION
  readonly authorization_id: string
  readonly status: typeof RUNTIME_AUTHORIZATION_STATUS
  readonly tenant_id: string
  readonly workunit_id: string
  readonly action_preview_id: string
  readonly approval_id: string
  readonly approval_linkage_id: string
  readonly action_type: string
  readonly target_hash: string
  readonly payload_hash: string
  readonly executor_id: string
  readonly idempotency_key: string
  readonly issued_at: string
  readonly expires_at: string
  readonly hash_algorithm: typeof RUNTIME_AUTHORIZATION_HASH_ALGORITHM
  readonly canonicalization_algorithm: typeof RUNTIME_AUTHORIZATION_CANONICALIZATION_ALGORITHM
}

// ─── Opaque authorization receipt ───────────────────────────────

/**
 * Module-private opaque brand for gate-produced receipts. Compile-time-only
 * phantom property: never assigned at runtime, never serialized, and
 * deliberately NOT exported. A TypeScript cast can always lie, so this brand is
 * a compile-time provenance boundary — not authorization, not a credential.
 */
declare const runtimeAuthorizationReceiptBrand: unique symbol

/**
 * One opaque, frozen runtime authorization receipt. Produced ONLY by
 * `constructRuntimeAuthorizationReceipt`, which the server-side gate invokes
 * ONLY after the exact-binding atomic ApprovalStore claim wins. Its `status` is
 * always `authorized_not_executed`. Holding one grants nothing and calls no
 * provider.
 */
export type RuntimeAuthorizationReceipt = {
  readonly hash_domain: typeof RUNTIME_AUTHORIZATION_HASH_DOMAIN
  readonly hash_version: typeof RUNTIME_AUTHORIZATION_HASH_VERSION
  readonly authorization_id: string
  readonly status: typeof RUNTIME_AUTHORIZATION_STATUS
  readonly tenant_id: string
  readonly workunit_id: string
  readonly action_preview_id: string
  readonly approval_id: string
  readonly approval_linkage_id: string
  readonly action_type: string
  readonly target_hash: string
  readonly payload_hash: string
  readonly executor_id: string
  readonly idempotency_key: string
  readonly issued_at: string
  readonly expires_at: string
  readonly hash_algorithm: typeof RUNTIME_AUTHORIZATION_HASH_ALGORITHM
  readonly canonicalization_algorithm: typeof RUNTIME_AUTHORIZATION_CANONICALIZATION_ALGORITHM
  readonly authorization_hash: string
  readonly [runtimeAuthorizationReceiptBrand]: true
}

// ─── Eligibility result ─────────────────────────────────────────

/**
 * States the PURE evaluator (evidence + policy eligibility only) may return.
 * `eligible` means every current source and policy would permit ATTEMPTING the
 * atomic claim now — it is not a claim, not authorization, and not execution.
 */
export const RUNTIME_AUTHORIZATION_ELIGIBILITY_STATES = [
  "eligible",
  "invalid",
  "not_ready",
  "forbidden",
  "stale",
  "expired",
  "revoked",
  "used",
  "replayed",
  "blocked",
] as const

export type RuntimeAuthorizationEligibilityState =
  (typeof RUNTIME_AUTHORIZATION_ELIGIBILITY_STATES)[number]

/**
 * The server-derived binding fields produced by a successful eligibility
 * evaluation. These are exactly the values the gate feeds to the atomic claim
 * and to the receipt constructor — no raw target/payload, no session, no role.
 */
export type RuntimeAuthorizationEligibleEvidence = {
  readonly tenant_id: string
  readonly workunit_id: string
  readonly action_preview_id: string
  readonly approval_id: string
  readonly approval_linkage_id: string
  readonly action_type: string
  readonly target_hash: string
  readonly payload_hash: string
  readonly executor_id: string
  readonly idempotency_key: string
  readonly authorization_id: string
  readonly issued_at: string
  readonly expires_at: string
}

export type RuntimeAuthorizationEligibilityResult =
  | {
      readonly ok: true
      readonly state: "eligible"
      readonly evidence: RuntimeAuthorizationEligibleEvidence
      readonly issue_codes: readonly []
    }
  | {
      readonly ok: false
      readonly state: Exclude<RuntimeAuthorizationEligibilityState, "eligible">
      readonly issue_codes: readonly string[]
    }

// ─── Gate result ────────────────────────────────────────────────

export type RuntimeAuthorizationResult =
  | {
      readonly ok: true
      readonly state: typeof RUNTIME_AUTHORIZATION_STATUS
      readonly receipt: RuntimeAuthorizationReceipt
    }
  | {
      readonly ok: false
      readonly state: Exclude<RuntimeAuthorizationEligibilityState, "eligible">
      readonly issue_code: string
    }

// ─── Redacted audit projection ──────────────────────────────────

export const RUNTIME_AUTHORIZATION_AUDIT_EVENT_KINDS = [
  "runtime_authorization_requested",
  "runtime_authorization_eligible",
  "runtime_authorization_claimed",
  "runtime_authorization_created",
  "runtime_authorization_rejected",
  "runtime_authorization_replayed",
  "runtime_authorization_blocked",
] as const

export type RuntimeAuthorizationAuditEventKind =
  (typeof RUNTIME_AUTHORIZATION_AUDIT_EVENT_KINDS)[number]

/**
 * A pure, redacted audit projection of one runtime-authorization lifecycle
 * event. It exposes allowlisted identifiers, the state, and allowlisted stable
 * issue codes ONLY. It never exposes the authorization hash, target/payload
 * hash, raw target/payload, any actor identity beyond the dedicated executor
 * actor id, session IDs, reviewer IDs, roles, email, tokens, or secrets.
 */
export type RuntimeAuthorizationAuditEvent = {
  readonly event_kind: RuntimeAuthorizationAuditEventKind
  readonly tenant_id: string
  readonly workunit_id: string
  readonly action_preview_id: string
  readonly approval_id: string
  readonly action_type: string
  readonly state: RuntimeAuthorizationEligibilityState | typeof RUNTIME_AUTHORIZATION_STATUS
  readonly issue_codes: readonly string[]
  readonly evaluated_at: string
}
