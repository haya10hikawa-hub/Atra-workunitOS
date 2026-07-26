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
 *  - A member may ONLY come from an ATTESTED successful F1A validation result —
 *    the exact object a real `buildFormationSourceCandidate` call returned,
 *    proven by runtime provenance (`snapshotValidatedFormationSourceResult`),
 *    not by structural shape. A forged look-alike, a clone, a failed result, or
 *    raw JSON is never a member. Likewise the F1B result must be attested
 *    (`snapshotFormationGoalDoneConditionCandidate`). Both are bound only as
 *    fresh detached snapshots, so the aggregate aliases no caller-owned object.
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
import { snapshotValidatedFormationSourceResult } from "./sourceContract.ts"
import type { FormationGoalDoneConditionCandidate } from "./goalDoneConditionAdapter.ts"
import { snapshotFormationGoalDoneConditionCandidate } from "./goalDoneConditionAdapter.ts"

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
  | "goal_done_condition_not_validated"
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

// ─── Validated-result attestation (runtime provenance) ─────────
//
// F1C — like F1A and F1B — publishes NO forgeable brand. A later slice (F3
// grouping) must never accept a structural or serialized clone of an F1C
// success as a real aggregate. So the exact success result object returned by
// `buildWorkUnitFormationCandidate` is registered here, keyed against a
// module-private detached inert snapshot of its candidate taken BEFORE the
// result is exposed. A hand-built look-alike, a spread/JSON/structuredClone
// copy, a failed result, or the bare candidate object (not the result) is a
// different identity, is never a key, and never attests. WeakMap keys are held
// weakly, so a dead public result is not retained.
const attestedFormationResults = new WeakMap<object, WorkUnitFormationCandidate>()

// Deep clone over INTERNALLY-CONSTRUCTED, JSON-safe data only. Never run over an
// arbitrary caller graph: callers only ever reach the WeakMap identity lookup.
// The reconstruction drops any non-plain field, so no accessor, prototype, or
// unknown post-validation field can travel into or out of a snapshot.
function inertResultClone<T>(value: T): T {
  if (value === null || typeof value !== "object") return value
  if (Array.isArray(value)) return value.map((item) => inertResultClone(item)) as unknown as T
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(value as Record<string, unknown>)) {
    out[key] = inertResultClone((value as Record<string, unknown>)[key])
  }
  return out as T
}

/**
 * Runtime-provenance attestation for a validated F1C result.
 *
 * Returns a fresh, fully detached inert snapshot of the candidate ONLY when
 * `value` is the exact success result object a real
 * `buildWorkUnitFormationCandidate` call returned; otherwise `null`. A forged
 * look-alike, a shallow/deep clone, a serialized/deserialized copy, a failed
 * result, or the bare candidate object is not registered and returns `null`.
 * Repeated snapshots neither alias each other nor the stored snapshot, and a
 * later mutation of the public result cannot alter it.
 */
export function snapshotValidatedWorkUnitFormationResult(
  value: unknown,
): WorkUnitFormationCandidate | null {
  if (value === null || typeof value !== "object") return null
  const stored = attestedFormationResults.get(value as object)
  if (stored === undefined) return null
  return inertResultClone(stored)
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
    // 1. Member source must be an ATTESTED successful F1A result: the exact
    //    object a real `buildFormationSourceCandidate` call returned. Attestation
    //    (runtime provenance), NOT structural compatibility, is the gate — a
    //    forged look-alike, a shallow/deep clone, a serialized copy, a failed
    //    result, or raw JSON is unregistered and rejected. The attested value is
    //    a fresh, fully detached snapshot; the aggregate never touches, reads, or
    //    aliases the caller's own F1A object.
    const attested = snapshotValidatedFormationSourceResult(
      (entry as { sourceResult?: unknown } | null | undefined)?.sourceResult,
    )
    if (attested === null) return reject("member_not_validated")
    const candidate = attested.candidate
    const identity = sourceRefIdentity(candidate.sourceRef)
    if (identity === null) return reject("member_not_validated")

    // 2. Role is explicit and provider-independent; unknown roles fail closed.
    const role = (entry as { role?: unknown }).role
    if (typeof role !== "string" || !SOURCE_ROLE_SET.has(role)) return reject("unknown_source_role")

    // 3. Duplicate source membership is INVALID, not repairable — the same
    //    canonical identity (even under a different role) rejects the aggregate.
    if (memberIdentities.has(identity)) return reject("duplicate_member_identity")
    memberIdentities.add(identity)

    members.push({ source: candidate, role: role as SourceRole })
  }

  // 4. Exactly one ATTESTED F1B result. A missing/non-object input is
  //    `missing_goal_done_condition`; a present object that is not the exact
  //    result of a real `buildFormationGoalDoneConditionCandidate` call (a `{}`,
  //    a malformed object, a forged `complete` verdict, or a structural/
  //    serialized clone) is unregistered and rejected as
  //    `goal_done_condition_not_validated`. The attested value is a fresh,
  //    detached snapshot carrying the original canonical verdict verbatim; F1C
  //    never re-evaluates it (no second completion authority).
  const rawGoalDoneCondition = (input as { goalDoneCondition?: unknown }).goalDoneCondition
  if (!rawGoalDoneCondition || typeof rawGoalDoneCondition !== "object") {
    return reject("missing_goal_done_condition")
  }
  const gdc = snapshotFormationGoalDoneConditionCandidate(rawGoalDoneCondition)
  if (gdc === null) return reject("goal_done_condition_not_validated")

  // 5. F1B-to-member consistency, over the ATTESTED snapshot. `evidenceRefs`
  //    must be an actual array (any impossible malformed attested snapshot fails
  //    closed). Every F1B evidence ref and any primary Done Condition sourceRef
  //    must already be a member; a non-member reference rejects the aggregate —
  //    it is never removed and never adds a member. A human-input-only Done
  //    Condition (no primary sourceRef) is accepted. References are not
  //    rewritten and the verdict is untouched.
  const evidenceRefs = (gdc as { evidenceRefs?: unknown }).evidenceRefs
  if (!Array.isArray(evidenceRefs)) return reject("goal_done_condition_not_validated")
  // The primary Done Condition anchor is checked before the evidence sidecar so
  // a non-member anchor is reported as such (a real F1B co-locates the primary
  // anchor into `evidenceRefs`, so the two checks otherwise overlap).
  const primaryRef = (gdc as { doneCondition?: { sourceRef?: unknown } }).doneCondition?.sourceRef
  if (primaryRef !== undefined) {
    const id = sourceRefIdentity(primaryRef)
    if (id === null || !memberIdentities.has(id)) return reject("primary_source_ref_not_a_member")
  }
  for (const ref of evidenceRefs as readonly SourceRef[]) {
    const id = sourceRefIdentity(ref)
    if (id === null || !memberIdentities.has(id)) return reject("evidence_ref_not_a_member")
  }

  // 6. Force the safety literals; never read them from input. Members are
  //    detached F1A source snapshots and the F1B result is a detached snapshot,
  //    so the returned aggregate aliases no caller input and post-return
  //    mutation of any original input has no effect. The verdict is passed
  //    through unchanged — no second completion status is computed.
  const result: WorkUnitFormationResult = {
    ok: true,
    candidateOnly: true,
    candidate: {
      members,
      goalDoneCondition: gdc,
      humanReviewRequired: true,
      candidateOnly: true,
    },
  }
  // Register runtime provenance BEFORE the result leaves this module, snapshotting
  // the candidate so a later mutation of the public result cannot reach the
  // stored attestation. The success result object itself is the WeakMap key.
  attestedFormationResults.set(result, inertResultClone(result.candidate))
  return result
}
