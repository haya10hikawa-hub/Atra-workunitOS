/**
 * P6-FIX-010: inert types for the Phase 6 Identity Independence gate
 * (Issue #143, docs/CANONICAL_IDENTITY_INDEPENDENCE_CONTRACT.md).
 *
 * NON-AUTHORIZING BY CONSTRUCTION. Identity independence verification proves
 * only that the requester, creator, two reviewers, and approver of one Human
 * Decision / Review Evidence pair are distinct canonical users from trusted
 * sources. It is NOT ApprovalStore approval, NOT runtime authorization, and
 * NOT execution permission. Binding these artifacts to ApprovalStore records
 * belongs to Issue #144; the final runtime authorization gate with
 * immediately-before-use checks belongs to Issue #145.
 *
 * EXECUTOR RULE DEFERRED. An optional executor identity is represented and
 * validated (source, actor kind, tenant, shape), but whether the executor
 * must differ from the approver is deliberately NOT decided here — that rule
 * belongs to Issue #145. A present executor identity grants nothing.
 *
 * These types are inert descriptions only: no runtime behavior, no consumer,
 * no capability, no I/O, no clock, no randomness.
 */

import type {
  CanonicalIdentityIssue,
  CanonicalIdentityValidationResult,
} from "../canonicalIdentity/index.ts"

// ─── Result surface (single canonical issue list) ───────────────

/**
 * Identity-independence issues ARE canonical identity issues: the single
 * exported issue-code list lives in the canonical identity core
 * (`CANONICAL_IDENTITY_ISSUE_CODES`) and is not duplicated here.
 */
export type IdentityIndependenceIssue = CanonicalIdentityIssue

/**
 * The frozen, deterministic, non-authorizing verification result: exactly
 * `{ ok, issues }`. It carries no grant, token, approval, or permission
 * field, and issue messages are stable `code:field` strings that never
 * contain supplied identity values.
 */
export type IdentityIndependenceResult = CanonicalIdentityValidationResult

// ─── Verifier input ─────────────────────────────────────────────

/**
 * The structural input consumed by `verifyIdentityIndependence`. The verifier
 * treats the whole object as untrusted: every artifact and identity is
 * internally re-validated, and a caller can never supply a result object.
 *
 * `human_decision` must be a ValidatedHumanDecisionRecord and
 * `review_evidence` a FourEyesReviewEvidence artifact; the identity fields
 * must be constructor-produced CanonicalIdentity values. They are typed
 * `unknown` because a TypeScript cast can lie — runtime validation is the
 * boundary, not the static type.
 */
export type IdentityIndependenceEvaluationInput = {
  readonly human_decision: unknown
  readonly review_evidence: unknown
  readonly requester_identity: unknown
  readonly creator_identity: unknown
  readonly first_reviewer_identity: unknown
  readonly second_reviewer_identity: unknown
  readonly approver_identity: unknown
  /** Optional; validated when present, never interpreted as execution permission. */
  readonly executor_identity?: unknown
  readonly expected_tenant_id: string
  readonly expected_human_decision_id: string
  readonly expected_workunit_id: string
  readonly expected_action_preview_id: string
  readonly evaluated_at: string
}

// ─── Redacted audit projection ──────────────────────────────────

export const IDENTITY_INDEPENDENCE_AUDIT_EVENT_KINDS = [
  "identity_independence_verified",
  "self_approval_forbidden",
  "identity_independence_rejected",
] as const

export type IdentityIndependenceAuditEventKind =
  (typeof IDENTITY_INDEPENDENCE_AUDIT_EVENT_KINDS)[number]

/**
 * A pure, redacted audit projection of one identity-independence decision.
 * It carries the record identifiers, the boolean outcome, allowlisted stable
 * issue codes, and the evaluation timestamp ONLY. It never exposes requester
 * / creator / reviewer / approver / executor user IDs, session IDs, email
 * addresses, roles, raw session objects, payloads, payload hashes, secrets,
 * tokens, ApprovalStore records, or authorization material. Producing an
 * audit event authorizes nothing.
 */
export type IdentityIndependenceAuditEvent = {
  readonly event_kind: IdentityIndependenceAuditEventKind
  readonly human_decision_id: string
  readonly workunit_id: string
  readonly action_preview_id: string
  readonly ok: boolean
  readonly issue_codes: readonly string[]
  readonly evaluated_at: string
}
