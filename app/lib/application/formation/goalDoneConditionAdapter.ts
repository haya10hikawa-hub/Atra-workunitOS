/**
 * F1B — Goal / Done Condition Adapter.
 *
 * Binds a formation-side `GoalHypothesis`, plural evidence references, and
 * independent-closure information to the EXISTING canonical Done Condition.
 *
 * Canonical authority: `evaluateDoneConditionDraft` (decomposition boundary) is
 * the ONLY status authority. This adapter never introduces a second completion
 * model. `doneCondition.status`, `.missingFields`, and `.invalidReasons` are
 * recomputed from the evaluator; the incoming values are never trusted. Plural
 * `evidenceRefs`, `independentClosure`, and `adapterIssues` are aggregation-side
 * inputs only — they can never upgrade, downgrade, or override the canonical
 * Done Condition verdict.
 *
 * Reference safety: requested `evidenceRefs` and the incoming primary
 * `doneCondition.sourceRef` are UNTRUSTED selectors. The only authority for a
 * safe `SourceRef` is the preceding F1A boundary's `validatedSources`. A
 * selector's identity (source + externalId) may look up a canonical reference,
 * but the selector's URL / container / capturedAt / unknown fields are never
 * emitted — only a fresh snapshot of the canonical mapped reference is.
 *
 * F1B owns only Goal / Done Condition adaptation. It does not perform provider
 * extraction, grouping, State Prediction, ranking, projection, membership
 * (F1C), cross-source conflict findings (F6), or any UI/approval/execution.
 */

import type { SourceRef } from "../../domain/types.ts"
import type { DoneConditionDraft, DoneConditionStatus } from "../decomposition/types.ts"
import type { FormationSourceCandidate } from "./sourceContract.ts"
import { evaluateDoneConditionDraft } from "../decomposition/doneConditionGate.ts"

/**
 * The UX-contract Goal fields (§4.1), the smallest deterministic representation.
 * Every field is optional: a missing value stays missing and is never invented.
 * No ranking/ROI/authority/provider field and no display projection appears.
 */
export type GoalHypothesis = {
  readonly outcome?: string
  readonly workObject?: string
  readonly decisionNeeded?: string
  readonly scope?: string
  readonly verifier?: string
  readonly timeHorizon?: string
}

/** Ordered Goal fields — issue ordering follows the UX-contract §4.1 order. */
export const GOAL_HYPOTHESIS_FIELDS = [
  "outcome",
  "workObject",
  "decisionNeeded",
  "scope",
  "verifier",
  "timeHorizon",
] as const satisfies readonly (keyof GoalHypothesis)[]

export type GoalHypothesisField = (typeof GOAL_HYPOTHESIS_FIELDS)[number]

export const FORMATION_INDEPENDENT_CLOSURES = [
  "independent",
  "parent_bounded",
  "unknown",
] as const

export type FormationIndependentClosure = (typeof FORMATION_INDEPENDENT_CLOSURES)[number]

/**
 * Closed, discriminated adapter-issue model. Issues affect future aggregation
 * eligibility only; they never assign Done Condition status and never echo
 * rejected or untrusted values.
 */
export type FormationAdapterIssue =
  | { readonly category: "missing_goal_field"; readonly field: GoalHypothesisField }
  | { readonly category: "evidence_membership_mismatch"; readonly path: string }
  | { readonly category: "independent_closure_unknown" }

export type FormationGoalDoneConditionCandidate = {
  readonly goal: GoalHypothesis
  readonly doneCondition: DoneConditionDraft
  readonly evidenceRefs: readonly SourceRef[]
  readonly independentClosure: FormationIndependentClosure
  readonly adapterIssues: readonly FormationAdapterIssue[]
  readonly humanReviewRequired: true
  readonly candidateOnly: true
}

/**
 * Adapter input. `validatedSources` are validated F1A source candidates used
 * ONLY as a transient membership-validation context — no member/aggregate is
 * stored. `context` is forwarded verbatim to the canonical evaluator.
 */
export type FormationGoalDoneConditionInput = {
  readonly goal: GoalHypothesis
  readonly doneCondition: DoneConditionDraft
  readonly evidenceRefs?: readonly SourceRef[]
  readonly independentClosure?: FormationIndependentClosure
  readonly validatedSources?: readonly FormationSourceCandidate[]
  readonly context?: Record<string, unknown>
}

export function buildFormationGoalDoneConditionCandidate(
  input: FormationGoalDoneConditionInput,
): FormationGoalDoneConditionCandidate {
  const adapterIssues: FormationAdapterIssue[] = []

  // ── Goal ──────────────────────────────────────────────────────────────
  // Normalize (trim) the present fields; missing/blank fields stay missing and
  // produce a deterministic issue in contract order. Nothing is invented.
  const goal = normalizeGoal(input.goal)
  for (const field of GOAL_HYPOTHESIS_FIELDS) {
    if (goal[field] === undefined) {
      adapterIssues.push({ category: "missing_goal_field", field })
    }
  }

  // ── Canonical reference map (validated F1A sources ONLY) ──────────────
  // The ONLY authority for a safe SourceRef is the preceding F1A boundary's
  // validatedSources. Requested evidenceRefs and the incoming primary
  // doneCondition.sourceRef are untrusted *selectors*: their identity may look
  // one up, but their URL/container/capturedAt/unknown fields are never trusted.
  // Identity is a collision-safe tuple of source + externalId (JSON-encoded, so
  // no raw delimiter can be forged across the boundary); the first validated
  // occurrence wins and later duplicates never replace it. Neither a requested
  // ref nor the primary ref can add an entry to this map.
  const canonicalById = new Map<string, SourceRef>()
  for (const source of input.validatedSources ?? []) {
    const ref = source?.sourceRef
    const id = sourceRefIdentity(ref)
    if (id !== null && !canonicalById.has(id)) canonicalById.set(id, ref as SourceRef)
  }

  // ── Canonicalize the primary Done Condition sourceRef ─────────────────
  // A primary ref is no longer automatically authoritative. It is admitted only
  // when its identity is a member of the canonical map, and then it is REPLACED
  // by a fresh snapshot of the canonical mapped ref (never the caller's fields).
  // An unmatched/malformed primary is removed and reported value-free, so the
  // canonical gate (not this adapter) decides status from what remains.
  let canonicalPrimary: SourceRef | undefined
  if (input.doneCondition.sourceRef !== undefined) {
    const primaryId = sourceRefIdentity(input.doneCondition.sourceRef)
    const mapped = primaryId !== null ? canonicalById.get(primaryId) : undefined
    if (mapped !== undefined) {
      canonicalPrimary = snapshotSourceRef(mapped)
    } else {
      adapterIssues.push({ category: "evidence_membership_mismatch", path: "doneCondition.sourceRef" })
    }
  }

  // ── Canonical Done Condition ──────────────────────────────────────────
  // The evaluator is the SOLE authority for status/missingFields/invalidReasons,
  // computed on the CANONICALIZED draft (primary ref replaced/removed) so a
  // rejected primary anchor cannot silently satisfy the canonical gate. The
  // incoming draft's status/missingFields/invalidReasons are never trusted.
  const canonicalDraft: DoneConditionDraft = {
    outcome: input.doneCondition.outcome,
    verifier: input.doneCondition.verifier,
    acceptanceCriteria: input.doneCondition.acceptanceCriteria,
    ...(canonicalPrimary !== undefined ? { sourceRef: canonicalPrimary } : {}),
    ...(input.doneCondition.humanInputRef !== undefined ? { humanInputRef: input.doneCondition.humanInputRef } : {}),
    riskFlags: input.doneCondition.riskFlags,
    candidateOnly: true,
    // Placeholders — overwritten by the sole authority below; never trusted.
    status: "partial",
    missingFields: [],
    invalidReasons: [],
  }
  const verdict: DoneConditionStatus = evaluateDoneConditionDraft(canonicalDraft, input.context)
  const doneCondition: DoneConditionDraft = {
    ...canonicalDraft,
    // Authority-derived ONLY:
    status: verdict.status,
    missingFields: verdict.missingFields,
    invalidReasons: verdict.invalidReasons,
  }

  // ── Evidence sidecar ──────────────────────────────────────────────────
  // Every emitted reference is a fresh snapshot of a CANONICAL mapped ref — the
  // caller's requested object is never emitted. Non-member/malformed selectors
  // create a value-free mismatch issue and are excluded; members are
  // deduplicated by canonical identity preserving first requested order.
  const evidenceRefs: SourceRef[] = []
  const seen = new Set<string>()
  const requested = input.evidenceRefs ?? []
  for (let index = 0; index < requested.length; index++) {
    const id = sourceRefIdentity(requested[index])
    const mapped = id !== null ? canonicalById.get(id) : undefined
    if (id === null || mapped === undefined) {
      adapterIssues.push({ category: "evidence_membership_mismatch", path: `evidenceRefs[${index}]` })
      continue
    }
    if (seen.has(id)) continue
    seen.add(id)
    evidenceRefs.push(snapshotSourceRef(mapped))
  }
  // Include the canonicalized primary anchor once (when it matched a member).
  if (canonicalPrimary !== undefined) {
    const primaryId = sourceRefIdentity(canonicalPrimary)
    if (primaryId !== null && !seen.has(primaryId)) {
      seen.add(primaryId)
      evidenceRefs.push(snapshotSourceRef(canonicalPrimary))
    }
  }

  // ── Independent closure ───────────────────────────────────────────────
  const independentClosure: FormationIndependentClosure = normalizeClosure(input.independentClosure)
  if (independentClosure === "unknown") {
    adapterIssues.push({ category: "independent_closure_unknown" })
  }

  return {
    goal,
    doneCondition,
    evidenceRefs,
    independentClosure,
    adapterIssues,
    humanReviewRequired: true,
    candidateOnly: true,
  }
}

function normalizeGoal(goal: GoalHypothesis): GoalHypothesis {
  const normalized: { -readonly [K in GoalHypothesisField]?: string } = {}
  for (const field of GOAL_HYPOTHESIS_FIELDS) {
    const value = goal[field]
    if (typeof value === "string") {
      const trimmed = value.trim()
      if (trimmed.length > 0) normalized[field] = trimmed
    }
  }
  return normalized
}

function normalizeClosure(value: FormationIndependentClosure | undefined): FormationIndependentClosure {
  return value === "independent" || value === "parent_bounded" ? value : "unknown"
}

// Membership identity is source + externalId ONLY. URL, container and capturedAt
// are deliberately excluded from identity — they must come from the canonical
// mapped reference, never from a selector. The tuple is JSON-encoded so no raw
// delimiter (space, colon, slash, NUL) can be forged to collide two identities.
// Accepts `unknown`: requested refs and the incoming primary ref are untrusted.
function sourceRefIdentity(ref: unknown): string | null {
  if (!ref || typeof ref !== "object") return null
  const { source, externalId } = ref as { source?: unknown; externalId?: unknown }
  if (typeof source !== "string" || source.length === 0) return null
  if (typeof externalId !== "string" || externalId.length === 0) return null
  return JSON.stringify([source, externalId])
}

// Build a fresh SourceRef from ONLY the known contract fields of a canonical
// (validated F1A) reference. No broad object spread: unknown runtime properties
// are never carried through, and the returned object aliases neither the
// validated source, the requested selector, nor the incoming primary ref.
function snapshotSourceRef(ref: SourceRef): SourceRef {
  return {
    source: ref.source,
    externalId: ref.externalId,
    ...(ref.container !== undefined ? { container: ref.container } : {}),
    ...(ref.url !== undefined ? { url: ref.url } : {}),
    capturedAt: ref.capturedAt,
  }
}
