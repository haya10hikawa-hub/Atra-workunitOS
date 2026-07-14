/**
 * P6-FIX-010: the pure Phase 6 identity-independence verifier (Issue #143).
 *
 * NON-AUTHORIZING BY CONSTRUCTION. A passing result proves only that, for one
 * validated Human Decision / Four-Eyes Review Evidence pair, the requester,
 * preview creator, two reviewers, and approver are distinct canonical users
 * derived from trusted sources in the expected tenant. It is NOT ApprovalStore
 * approval, NOT runtime authorization, and NOT execution permission. Artifact
 * linkage to ApprovalStore belongs to Issue #144; the final runtime gate with
 * immediately-before-use checks belongs to Issue #145.
 *
 * INTERNAL VALIDATION ONLY. Every supplied artifact and identity is
 * re-validated here through the real production validators — a caller can
 * never supply a pre-computed result object, and a TypeScript cast that lies
 * about a brand is caught by the runtime checks.
 *
 * CANONICAL IDENTITY, NOT ROLE. All equality comparisons use canonical
 * `tenant_id` + `user_id`. Role names never establish identity difference:
 * the same user acting as requester and approver (or reviewer and approver)
 * under different roles still fails with `self_approval_forbidden`.
 *
 * SESSION VALIDITY AT OBSERVATION. Session-derived identities carry the
 * provenance guarantee that the session was valid, non-development, and
 * unexpired at `observed_at` — that check is enforced fail-closed by
 * `createCanonicalSessionIdentity`, which is the only production source of an
 * `authenticated_session` identity. The verifier re-validates structure and
 * provenance fields; it cannot re-derive the original session and therefore
 * treats a failed structural validation as fatal.
 *
 * EXECUTOR RULE DEFERRED. An optional executor identity is validated (shape,
 * actor kind, source, tenant) but no executor-versus-approver rule is applied
 * here: that decision belongs to Issue #145. A present executor identity is
 * never interpreted as execution permission.
 *
 * FAIL-CLOSED. Missing, malformed, cross-tenant, wrongly-sourced,
 * wrongly-kinded, delegated, service-account, expired-at-observation, or
 * evidence-mismatched identities fail. A missing required identity always
 * fails. Deterministic: fixed evaluation order, frozen result, defensively
 * copied issue array, no I/O, no clock (`evaluated_at` is supplied), no
 * randomness, no mutation.
 */

import { validateHumanDecisionRecord } from "../artifacts/index.ts"
import { validateFourEyesReviewEvidence } from "../reviewEvidence/index.ts"
import {
  validateCanonicalIdentity,
  isSameCanonicalUser,
  isCanonicalIdentityRecord,
  isCanonicalIdentityNonEmptyString,
  type CanonicalIdentity,
} from "../canonicalIdentity/index.ts"
import { isIsoUtcTimestamp } from "../shared/isoUtcTimestamp.ts"
import type { IdentityIndependenceIssue, IdentityIndependenceResult } from "./types.ts"
import {
  identityIndependenceIssue,
  identityIndependenceResultOf,
  rescopeIssueField,
} from "./validation.ts"

// ─── Position table (fixed, deterministic order) ────────────────

type IdentityPosition = {
  readonly key:
    | "requester_identity"
    | "creator_identity"
    | "first_reviewer_identity"
    | "second_reviewer_identity"
    | "approver_identity"
    | "executor_identity"
  readonly actorKind: "requester" | "creator" | "reviewer" | "approver" | "executor"
  readonly source: "authenticated_session" | "stored_action_preview_creator"
  readonly required: boolean
}

/**
 * Provenance requirements per position: the requester, both reviewers, the
 * approver, and the executor must be authenticated-session identities; the
 * creator must be the stored ActionPreview creator. The executor is optional
 * and carries no independence rule in this patch (Issue #145).
 */
const IDENTITY_POSITIONS: readonly IdentityPosition[] = [
  { key: "requester_identity", actorKind: "requester", source: "authenticated_session", required: true },
  { key: "creator_identity", actorKind: "creator", source: "stored_action_preview_creator", required: true },
  { key: "first_reviewer_identity", actorKind: "reviewer", source: "authenticated_session", required: true },
  { key: "second_reviewer_identity", actorKind: "reviewer", source: "authenticated_session", required: true },
  { key: "approver_identity", actorKind: "approver", source: "authenticated_session", required: true },
  { key: "executor_identity", actorKind: "executor", source: "authenticated_session", required: false },
]

const EXPECTED_CONTEXT_FIELDS = [
  "expected_tenant_id",
  "expected_human_decision_id",
  "expected_workunit_id",
  "expected_action_preview_id",
] as const

/**
 * Exact evaluation-input allowlist. Unknown top-level fields fail closed:
 * a caller can never smuggle a pre-computed result (`ok`, `issues`,
 * `verification_result`, grant-like fields, …) or extra identity material
 * through the input object.
 */
const EVALUATION_INPUT_FIELDS: readonly string[] = [
  "human_decision",
  "review_evidence",
  ...IDENTITY_POSITIONS.map((position) => position.key),
  ...EXPECTED_CONTEXT_FIELDS,
  "evaluated_at",
]

/**
 * Pure shallow single-read snapshot of an unknown value (P6-FIX-010
 * snapshot-consistency hardening). Returns a plain object copying every
 * own-enumerable property exactly once, or `null` when the value is not a
 * record or when reading it throws — a hostile getter or `ownKeys` trap fails
 * closed here rather than escaping the verifier. Every nested artifact and
 * identity is snapshotted through this helper exactly once, and only the
 * snapshot is validated, stored, and compared thereafter; the original nested
 * reference is never read again, so a getter/Proxy cannot validate as one
 * value and be compared as another.
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

// ─── Public verifier ────────────────────────────────────────────

export function verifyIdentityIndependence(input: unknown): IdentityIndependenceResult {
  try {
    // Single top-level snapshot (getter-TOCTOU hardening). A throwing getter
    // or ownKeys trap fails closed here without escaping the verifier.
    const snapshot = snapshotRecordOrNull(input)
    if (snapshot === null) {
      return identityIndependenceResultOf([
        identityIndependenceIssue("invalid_identity_input", "(input)"),
      ])
    }

    // Stage A — evaluation context. Without a valid expected tenant, record
    // ids, and timestamp nothing can be evaluated, so context problems fail
    // closed alone. Unknown top-level fields are rejected outright.
    const contextIssues: IdentityIndependenceIssue[] = []
    for (const key of Object.keys(snapshot)) {
      if (EVALUATION_INPUT_FIELDS.includes(key)) continue
      contextIssues.push(identityIndependenceIssue("invalid_identity_input", `(input).${key}`))
    }
    for (const field of EXPECTED_CONTEXT_FIELDS) {
      if (!isCanonicalIdentityNonEmptyString(snapshot[field])) {
        contextIssues.push(identityIndependenceIssue("identity_state_missing", `(input).${field}`))
      }
    }
    if (!isIsoUtcTimestamp(snapshot.evaluated_at)) {
      contextIssues.push(identityIndependenceIssue("identity_state_missing", "(input).evaluated_at"))
    }
    if (contextIssues.length > 0) return identityIndependenceResultOf(contextIssues)

    const expectedTenantId = snapshot.expected_tenant_id as string
    const expectedDecisionId = snapshot.expected_human_decision_id as string
    const expectedWorkunitId = snapshot.expected_workunit_id as string
    const expectedActionPreviewId = snapshot.expected_action_preview_id as string

    // Stage B — nested single-read snapshots + structural validity, through
    // the real production validators (a cast can lie; a fabricated result
    // cannot enter). Each nested artifact and identity is snapshotted ONCE and
    // only the snapshot is validated and later consumed. Structural failure
    // stops evaluation: no comparison may run over untrusted fields.
    const structuralIssues: IdentityIndependenceIssue[] = []

    const decisionSnapshot = snapshotRecordOrNull(snapshot.human_decision)
    if (decisionSnapshot === null || !validateHumanDecisionRecord(decisionSnapshot).ok) {
      structuralIssues.push(
        identityIndependenceIssue("invalid_identity_input", "(human_decision)"),
      )
    }
    const evidenceSnapshot = snapshotRecordOrNull(snapshot.review_evidence)
    if (evidenceSnapshot === null || !validateFourEyesReviewEvidence(evidenceSnapshot).ok) {
      structuralIssues.push(
        identityIndependenceIssue("invalid_identity_input", "(review_evidence)"),
      )
    }

    const identities: Partial<Record<IdentityPosition["key"], Record<string, unknown>>> = {}
    for (const position of IDENTITY_POSITIONS) {
      const value = snapshot[position.key]
      if (value === undefined) {
        if (position.required) {
          // A missing required identity always fails the decision.
          structuralIssues.push(
            identityIndependenceIssue("identity_state_missing", `(${position.key})`),
          )
        }
        continue
      }
      const identitySnapshot = snapshotRecordOrNull(value)
      if (identitySnapshot === null) {
        structuralIssues.push(
          identityIndependenceIssue("invalid_identity_input", `(${position.key})`),
        )
        continue
      }
      const validation = validateCanonicalIdentity(identitySnapshot)
      if (!validation.ok) {
        if (validation.issues.length > 0) {
          for (const issue of validation.issues) {
            structuralIssues.push(rescopeIssueField(issue, `(${position.key})`))
          }
        } else {
          structuralIssues.push(
            identityIndependenceIssue("invalid_identity_input", `(${position.key})`),
          )
        }
        continue
      }
      // Store ONLY the validated snapshot; the original reference is dropped.
      identities[position.key] = identitySnapshot
    }
    if (structuralIssues.length > 0) return identityIndependenceResultOf(structuralIssues)

    // Past the early return both artifact snapshots are non-null; the guard is
    // defensive and keeps the fail-closed contract explicit for the compiler.
    if (decisionSnapshot === null || evidenceSnapshot === null) {
      return identityIndependenceResultOf([
        identityIndependenceIssue("invalid_identity_input", "(input)"),
      ])
    }
    const decision = decisionSnapshot
    const evidence = evidenceSnapshot

    // Stage C — provenance and cross-record binding, in fixed order.
    const issues: IdentityIndependenceIssue[] = []
    for (const position of IDENTITY_POSITIONS) {
      const identity = identities[position.key]
      if (identity === undefined) continue // optional executor absent
      if (identity.actor_kind !== position.actorKind) {
        issues.push(
          identityIndependenceIssue(
            "identity_actor_kind_mismatch",
            `(${position.key}).actor_kind`,
          ),
        )
      }
      if (identity.identity_source !== position.source) {
        issues.push(
          identityIndependenceIssue(
            "identity_source_untrusted",
            `(${position.key}).identity_source`,
          ),
        )
      }
      if (identity.tenant_id !== expectedTenantId) {
        issues.push(
          identityIndependenceIssue("identity_tenant_mismatch", `(${position.key}).tenant_id`),
        )
      }
    }

    if (decision.tenant_id !== expectedTenantId) {
      issues.push(
        identityIndependenceIssue("identity_tenant_mismatch", "(human_decision).tenant_id"),
      )
    }
    if (decision.human_decision_id !== expectedDecisionId) {
      issues.push(
        identityIndependenceIssue(
          "identity_evidence_mismatch",
          "(human_decision).human_decision_id",
        ),
      )
    }
    if (evidence.tenant_id !== expectedTenantId) {
      issues.push(
        identityIndependenceIssue("identity_tenant_mismatch", "(review_evidence).tenant_id"),
      )
    }
    // Both the decision and the evidence must match the expected Human
    // Decision ID; transitively this also binds the evidence to the validated
    // decision itself.
    if (evidence.source_human_decision_id !== expectedDecisionId) {
      issues.push(
        identityIndependenceIssue(
          "identity_evidence_mismatch",
          "(review_evidence).source_human_decision_id",
        ),
      )
    }
    if (evidence.source_workunit_id !== expectedWorkunitId) {
      issues.push(
        identityIndependenceIssue(
          "identity_evidence_mismatch",
          "(review_evidence).source_workunit_id",
        ),
      )
    }

    const creator = identities.creator_identity
    if (creator !== undefined && creator.source_record_id !== expectedActionPreviewId) {
      issues.push(
        identityIndependenceIssue(
          "identity_evidence_mismatch",
          "(creator_identity).source_record_id",
        ),
      )
    }

    const firstReviewer = identities.first_reviewer_identity
    const secondReviewer = identities.second_reviewer_identity
    if (firstReviewer !== undefined && evidence.first_reviewer_id !== firstReviewer.user_id) {
      issues.push(
        identityIndependenceIssue(
          "identity_evidence_mismatch",
          "(review_evidence).first_reviewer_id",
        ),
      )
    }
    if (secondReviewer !== undefined && evidence.second_reviewer_id !== secondReviewer.user_id) {
      issues.push(
        identityIndependenceIssue(
          "identity_evidence_mismatch",
          "(review_evidence).second_reviewer_id",
        ),
      )
    }

    // Stage D — canonical user equality (tenant_id + user_id; never role).
    // All five required identities passed structural validation above, so the
    // comparisons below are over trusted-shape values. Issue fields name the
    // conflicting position — never the user ID.
    const requester = identities.requester_identity as unknown as CanonicalIdentity
    const approver = identities.approver_identity as unknown as CanonicalIdentity
    const first = firstReviewer as unknown as CanonicalIdentity
    const second = secondReviewer as unknown as CanonicalIdentity
    const creatorIdentity = creator as unknown as CanonicalIdentity

    if (isSameCanonicalUser(first, second)) {
      issues.push(
        identityIndependenceIssue("duplicate_reviewer_identity", "(second_reviewer_identity)"),
      )
    }
    if (isSameCanonicalUser(requester, approver)) {
      issues.push(identityIndependenceIssue("self_approval_forbidden", "(requester_identity)"))
    }
    if (isSameCanonicalUser(creatorIdentity, approver)) {
      issues.push(identityIndependenceIssue("self_approval_forbidden", "(creator_identity)"))
    }
    if (isSameCanonicalUser(first, approver)) {
      issues.push(
        identityIndependenceIssue("self_approval_forbidden", "(first_reviewer_identity)"),
      )
    }
    if (isSameCanonicalUser(second, approver)) {
      issues.push(
        identityIndependenceIssue("self_approval_forbidden", "(second_reviewer_identity)"),
      )
    }
    // Executor-versus-approver separation is deliberately NOT evaluated here:
    // that rule belongs to the Issue #145 runtime gate. A validated executor
    // identity grants no execution permission.

    return identityIndependenceResultOf(issues)
  } catch {
    return identityIndependenceResultOf([
      identityIndependenceIssue("identity_validation_exception", "(verifier)"),
    ])
  }
}
