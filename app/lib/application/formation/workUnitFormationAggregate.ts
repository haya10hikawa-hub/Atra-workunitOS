/**
 * F1C — WorkUnit Formation Aggregate.
 *
 * The minimal candidate-only aggregate that binds a set of ALREADY-validated
 * F1A source members, an explicit caller-provided Source Role per member, and
 * exactly one existing F1B Goal / Done Condition adapter result.
 *
 * What F1C is NOT:
 *  - It does not decide whether sources should be grouped (that is F3/F4).
 *  - It generates no merge or split proposal, no grouping evidence, no
 *    formation state, no State Prediction, no ranking, no "why now".
 *  - It performs no provider extraction, LLM call, projection, approval,
 *    execution, or persistence.
 *  - It introduces NO second completion model: `evaluateDoneConditionDraft`
 *    (reached only through the F1B result) remains the sole status authority.
 *    F1C copies the F1B verdict verbatim and never recomputes it.
 *
 * Authority rules inherited unchanged:
 *  - A member may ONLY come from a successful F1A validation result
 *    (`FormationSourceContractResult` with `ok: true`). A failed result, raw
 *    JSON, or a malformed object is never a member.
 *  - `SourceRole` is explicit and provider-independent: the provider never
 *    implies a role, and the same validated source may carry a different role
 *    in a different aggregate.
 *  - The output is literal `candidateOnly: true` and `humanReviewRequired:
 *    true`; the input cannot set either to false.
 */

import type { SourceRef } from "../../domain/types.ts"
import type {
  FormationSourceCandidate,
  FormationSourceContractResult,
} from "./sourceContract.ts"
import type { FormationGoalDoneConditionCandidate } from "./goalDoneConditionAdapter.ts"

/**
 * The exact closed Source Role set. Role is a candidate-scoped association a
 * human (or a later, explicitly-assigned slice) supplies; it is NOT derived
 * from the provider. `provider !== SourceRole`.
 */
export const FORMATION_SOURCE_ROLES = [
  "implementation",
  "original_request",
  "accepted_specification",
  "decision_record",
  "external_context",
  "review_state",
  "evidence",
  "open_question",
  "deadline_context",
  "historical_context",
  "contradicting_claim",
] as const

export type SourceRole = (typeof FORMATION_SOURCE_ROLES)[number]

const SOURCE_ROLE_SET: ReadonlySet<string> = new Set(FORMATION_SOURCE_ROLES)

/**
 * The minimum member association: one validated F1A source candidate plus one
 * explicit Source Role. No grouping reason, confidence/authority/ranking score,
 * primary flag, conflict finding, State Prediction, or merge/split verdict —
 * those belong to later slices.
 */
export type FormationMember = {
  readonly source: FormationSourceCandidate
  readonly role: SourceRole
}

/**
 * The minimal aggregate. It carries ONLY plural members, the read-only F1B
 * Goal / Done Condition result, and the two safety literals. It has no
 * completion status of its own, and no formalization / merge / split /
 * approval / execution / persistence / projection field.
 */
export type WorkUnitFormationCandidate = {
  readonly members: readonly FormationMember[]
  readonly goalDoneCondition: FormationGoalDoneConditionCandidate
  readonly humanReviewRequired: true
  readonly candidateOnly: true
}

/**
 * Fail-closed rejection reasons. A minimal closed set (repository-consistent
 * with the F1A result contract); it carries no value echo and no finding
 * taxonomy beyond a single reason discriminator.
 */
export type WorkUnitFormationRejectionReason =
  | "empty_members"
  | "member_not_validated"
  | "unknown_source_role"
  | "duplicate_member_identity"
  | "missing_goal_done_condition"
  | "evidence_ref_not_a_member"
  | "primary_source_ref_not_a_member"

export type WorkUnitFormationResult =
  | { readonly ok: true; readonly candidateOnly: true; readonly candidate: WorkUnitFormationCandidate }
  | { readonly ok: false; readonly candidateOnly: true; readonly reason: WorkUnitFormationRejectionReason }

/** A successful F1A validation result — the ONLY admissible member source. */
type ValidatedSourceResult = Extract<FormationSourceContractResult, { readonly ok: true }>

type WorkUnitFormationMemberInput = {
  readonly sourceResult: ValidatedSourceResult
  readonly role: SourceRole
}

/**
 * Builder input. `members` are pairs of a successful F1A result and an explicit
 * role; `goalDoneCondition` is exactly one existing F1B result. Left unexported
 * — no downstream caller requires the named type yet.
 */
type WorkUnitFormationAggregateInput = {
  readonly members: readonly WorkUnitFormationMemberInput[]
  readonly goalDoneCondition: FormationGoalDoneConditionCandidate
}

function reject(reason: WorkUnitFormationRejectionReason): WorkUnitFormationResult {
  return { ok: false, candidateOnly: true, reason }
}

// Canonical membership identity is `sourceRef.source` + `sourceRef.externalId`
// ONLY, JSON-tuple-encoded so no raw delimiter can forge a collision. Provider
// alone, sourceObjectId, URL, container, capturedAt, title and navigationTarget
// are deliberately NOT identity. Accepts `unknown`: F1B evidence/primary refs
// are treated defensively even though F1B already canonicalizes them.
function sourceRefIdentity(ref: unknown): string | null {
  if (!ref || typeof ref !== "object") return null
  const { source, externalId } = ref as { source?: unknown; externalId?: unknown }
  if (typeof source !== "string" || source.length === 0) return null
  if (typeof externalId !== "string" || externalId.length === 0) return null
  return JSON.stringify([source, externalId])
}

/**
 * Deterministic, pure builder for the F1C aggregate. Fails closed: any invalid
 * member, unknown role, duplicate identity, missing F1B result, or F1B
 * reference that is absent from the members rejects the whole aggregate — it is
 * never silently repaired. Inputs are never mutated; the F1B result is bound
 * read-only (its Goal, Done Condition verdict, evidence refs, independent
 * closure and adapter issues are preserved exactly).
 */
export function buildWorkUnitFormationCandidate(
  input: WorkUnitFormationAggregateInput,
): WorkUnitFormationResult {
  const rawMembers = (input as { members?: unknown } | null | undefined)?.members
  if (!Array.isArray(rawMembers) || rawMembers.length === 0) return reject("empty_members")

  const members: FormationMember[] = []
  const memberIdentities = new Set<string>()

  for (const entry of rawMembers) {
    // 1. Member source must be a SUCCESSFUL F1A result. A failed result, raw
    //    JSON string, or malformed object never becomes a member. F1A's own
    //    validator is NOT reimplemented here — only its success shape and a
    //    well-formed canonical identity are required.
    const result = (entry as { sourceResult?: unknown } | null | undefined)?.sourceResult
    if (!result || typeof result !== "object" || (result as { ok?: unknown }).ok !== true) {
      return reject("member_not_validated")
    }
    const candidate = (result as { candidate?: unknown }).candidate
    const identity =
      candidate && typeof candidate === "object"
        ? sourceRefIdentity((candidate as { sourceRef?: unknown }).sourceRef)
        : null
    if (identity === null) return reject("member_not_validated")

    // 2. Role is explicit and provider-independent; unknown roles fail closed.
    const role = (entry as { role?: unknown }).role
    if (typeof role !== "string" || !SOURCE_ROLE_SET.has(role)) return reject("unknown_source_role")

    // 3. Duplicate source membership is INVALID, not repairable — the same
    //    canonical identity (even under a different role) rejects the aggregate.
    if (memberIdentities.has(identity)) return reject("duplicate_member_identity")
    memberIdentities.add(identity)

    members.push({ source: candidate as FormationSourceCandidate, role: role as SourceRole })
  }

  // 4. Exactly one existing F1B result, bound read-only.
  const goalDoneCondition = (input as { goalDoneCondition?: unknown }).goalDoneCondition
  if (!goalDoneCondition || typeof goalDoneCondition !== "object") {
    return reject("missing_goal_done_condition")
  }
  const gdc = goalDoneCondition as FormationGoalDoneConditionCandidate

  // 5. F1B-to-member consistency. Every F1B evidence ref and any primary
  //    Done Condition sourceRef must already be a member. A non-member
  //    reference rejects the aggregate; it is never removed, and it never adds
  //    a member. A human-input-only Done Condition (no primary sourceRef) is
  //    accepted. F1B references are NOT rewritten and the verdict is untouched.
  const evidenceRefs = (gdc as { evidenceRefs?: unknown }).evidenceRefs
  if (Array.isArray(evidenceRefs)) {
    for (const ref of evidenceRefs as readonly SourceRef[]) {
      const id = sourceRefIdentity(ref)
      if (id === null || !memberIdentities.has(id)) return reject("evidence_ref_not_a_member")
    }
  }
  const primaryRef = (gdc as { doneCondition?: { sourceRef?: unknown } }).doneCondition?.sourceRef
  if (primaryRef !== undefined) {
    const id = sourceRefIdentity(primaryRef)
    if (id === null || !memberIdentities.has(id)) return reject("primary_source_ref_not_a_member")
  }

  // 6. Force the safety literals; never read them from input. The F1B result is
  //    passed through unchanged — no second completion status is computed.
  return {
    ok: true,
    candidateOnly: true,
    candidate: {
      members,
      goalDoneCondition: gdc,
      humanReviewRequired: true,
      candidateOnly: true,
    },
  }
}
