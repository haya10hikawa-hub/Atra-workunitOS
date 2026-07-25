/**
 * F3 — Deterministic grouping evidence ledger.
 *
 * Pure, deterministic pairwise comparison of two attested F1C subjects, plus
 * bounded candidate retrieval. It emits an EVIDENCE LEDGER and a suggestion
 * verdict only — never a grouping outcome. There is no membership change, no
 * merge_candidate / split_candidate / formal_candidate / context_only, no
 * SourceRole, no State Prediction / ranking / projection, and no LLM / provider
 * / network / persistence.
 *
 * Evaluation order (Section 13):
 *   1. any hard split           → must_split      (final; overrides everything)
 *   2. else any hard positive   → strong_match
 *   3. else ≥3 DISTINCT weak kinds → possible_match (suggestion; NOT grouped)
 *   4. else                      → insufficient
 *
 * The F1B Done Condition verdict is consumed read-only; nothing is recomputed.
 */

import {
  GROUPING_BOUNDS,
  prepareSubject,
  type PreparedSubject,
} from "./goalIdentity.ts"
import {
  HARD_SPLIT_KINDS,
  HARD_POSITIVE_KINDS,
  WEAK_KINDS,
  RETRIEVAL_KEY_KINDS,
  type GroupingComparisonInput,
  type GroupingComparisonResult,
  type GroupingSubjectInput,
  type GroupingRetrievalResult,
  type GroupingRetrievalMatch,
  type GroupingEvidence,
  type GroupingEvidenceSupport,
  type GroupingVerdict,
  type HardSplitKind,
  type HardPositiveKind,
  type WeakKind,
  type RetrievalKeyKind,
} from "./groupingTypes.ts"

// ─── F3 runtime-provenance attestation (consumed by F4) ─────────
//
// F3 publishes NO forgeable brand. A later slice (F4 state / grouping-outcome
// mapping) must never accept a structural or serialized clone of an F3 success
// as a real grouping verdict, and must never apply a real pair-A result to a
// different pair-B input. So the EXACT success result object returned by
// `compareGroupingSubjects` is registered here, keyed by its own object
// identity, against BOTH (a) the EXACT original `GroupingComparisonInput` object
// identity and (b) a module-private detached inert snapshot of the success
// result taken BEFORE it is exposed. A spread/JSON/structuredClone copy, a
// forged look-alike, a failed comparison, the bare payload, or the exact result
// paired with a cloned/different/other-pair input is a different identity and
// never attests. WeakMap keys are held weakly, so a dead public result and its
// input are not retained. The public `GroupingComparisonResult` shape is
// unchanged — this adds no field to it.

/** A successful F3 comparison result — the ONLY attestable grouping verdict. */
export type SuccessfulGroupingComparisonResult = Extract<
  GroupingComparisonResult,
  { readonly ok: true }
>

/** A fresh, fully detached inert snapshot of a validated F3 success result. */
export type SuccessfulGroupingComparisonSnapshot = SuccessfulGroupingComparisonResult

// The container identity alone is NOT the pair. `GroupingComparisonInput` is a
// caller-owned mutable object, so `input.left` / `input.right` can be replaced,
// or swapped, in place after registration while the container identity check
// still passes. The ORDERED pair semantics are therefore pinned explicitly:
// both subject wrappers, both attested F1C results (a wrapper can be kept while
// its `formationResult` is swapped), and a detached copy of each side's
// canonical selector (the same wrapper can keep its identity while its
// `canonicalWorkObjectRef` is added, removed, or edited). Left and right are
// compared positionally, so a swap is a mismatch. Caller objects are never
// frozen or mutated, and none of this is exposed publicly.
//
// Pinning the ordered pair is not sufficient on its own: `readonly` is erased at
// runtime, so every caller-owned property can be an accessor or a Proxy trap
// that answers differently on each read. If the verdict were computed from one
// read of `input.left` / `input.right` and the binding captured from a second
// read, a changing getter could have a result computed over pair A/B registered
// as belonging to pair C/D. Therefore EVERY security-sensitive caller value is
// read EXACTLY ONCE, into a single private capture taken at the very start of
// `compareGroupingSubjects`:
//
//   input.left · input.right
//   left.formationResult · right.formationResult
//   left.canonicalWorkObjectRef · right.canonicalWorkObjectRef
//   left selector provider / sourceObjectId · right selector provider / sourceObjectId
//
// That one capture supplies BOTH the stable subject values fed to
// `prepareSubject` (so the verdict is computed from the captured pair) AND the
// registered binding (so the attestation names the same captured pair). An
// accessor or Proxy is accepted under one-read semantics — it can never yield a
// success computed from one pair and registered against another.

/** A detached copy of one side's canonical selector — primitives only. */
type DetachedSelector = {
  readonly present: boolean
  readonly provider: unknown
  readonly sourceObjectId: unknown
}

/**
 * Detach one side's canonical selector. `canonicalWorkObjectRef` is read exactly
 * once, and `provider` / `sourceObjectId` exactly once each, so a changing
 * accessor cannot serve a different tuple to a later reader.
 */
function detachSelector(subject: unknown): DetachedSelector {
  if (subject === null || typeof subject !== "object") {
    return { present: false, provider: undefined, sourceObjectId: undefined }
  }
  const ref = (subject as { canonicalWorkObjectRef?: unknown }).canonicalWorkObjectRef
  if (ref === undefined) return { present: false, provider: undefined, sourceObjectId: undefined }
  if (ref === null || typeof ref !== "object") {
    return { present: true, provider: undefined, sourceObjectId: undefined }
  }
  return {
    present: true,
    provider: (ref as { provider?: unknown }).provider,
    sourceObjectId: (ref as { sourceObjectId?: unknown }).sourceObjectId,
  }
}

function sameSelector(a: DetachedSelector, b: DetachedSelector): boolean {
  return a.present === b.present && a.provider === b.provider && a.sourceObjectId === b.sourceObjectId
}

function formationResultOf(subject: unknown): unknown {
  if (subject === null || typeof subject !== "object") return undefined
  return (subject as { formationResult?: unknown }).formationResult
}

/**
 * One side of the single private capture: the exact caller wrapper, the exact
 * attested F1C result read from it, its detached selector tuple, and a STABLE
 * plain `GroupingSubjectInput` rebuilt from those same values. `stable` is what
 * `prepareSubject` consumes, so preparation re-reads nothing from the caller.
 */
type CapturedSide = {
  readonly subject: unknown
  readonly formationResult: unknown
  readonly selector: DetachedSelector
  readonly stable: GroupingSubjectInput
}

function captureSide(subject: unknown): CapturedSide {
  const formationResult = formationResultOf(subject)
  const selector = detachSelector(subject)
  // Rebuild an inert plain subject from the captured values only. An absent
  // selector stays absent (`prepareSubject` keys off `!== undefined`); a present
  // but malformed one degrades to the same undefined/undefined tuple the raw
  // value would have produced, so admission behaviour is unchanged.
  const stable = {
    formationResult,
    ...(selector.present
      ? { canonicalWorkObjectRef: { provider: selector.provider, sourceObjectId: selector.sourceObjectId } }
      : {}),
  } as unknown as GroupingSubjectInput
  return { subject, formationResult, selector, stable }
}

/**
 * The single private capture of one comparison. Every security-sensitive caller
 * value in it was read exactly once, and the SAME capture is used both to
 * compute the verdict and to register the attestation.
 */
type GroupingPairCapture = {
  readonly input: object
  readonly left: CapturedSide
  readonly right: CapturedSide
}

function capturePair(input: object): GroupingPairCapture {
  // Exactly one read of each side, before anything else touches the caller graph.
  const left = (input as { left?: unknown }).left
  const right = (input as { right?: unknown }).right
  return { input, left: captureSide(left), right: captureSide(right) }
}

/**
 * True only when the ORDERED pair the caller now presents is still the exact
 * pair that was compared. Positional, so a left/right swap is a mismatch. This
 * is the VERIFICATION read — a caller that has since mutated the pair (or whose
 * accessors now answer differently) stops attesting.
 */
function pairCaptureIntact(capture: GroupingPairCapture, input: object): boolean {
  if (capture.input !== input) return false
  const left = (input as { left?: unknown }).left
  const right = (input as { right?: unknown }).right
  if (left !== capture.left.subject || right !== capture.right.subject) return false
  if (formationResultOf(left) !== capture.left.formationResult) return false
  if (formationResultOf(right) !== capture.right.formationResult) return false
  if (!sameSelector(detachSelector(left), capture.left.selector)) return false
  if (!sameSelector(detachSelector(right), capture.right.selector)) return false
  return true
}

// ─── Opaque F3 pair token (consumed by F4) ──────────────────────
//
// A later slice must be able to prove "this outcome belongs to the pair F3
// actually attested" WITHOUT re-reading the caller graph — a second read is
// exactly the accessor/Proxy hole above, one layer further out. So a successful
// attestation also hands back an OPAQUE token: an empty frozen object carrying
// no pair data at all, tied by module-private WeakMap identity to the exact
// private capture. It cannot be forged (an arbitrary object is not a key), it
// cannot be cloned (a spread / JSON / structuredClone copy is a new identity),
// it is bound to ONE ordered capture (a token for pair A never resolves pair B),
// and it stops resolving once that pair is mutated. Nothing about the subjects,
// their `formationResult`s, or their selectors is reachable through its shape.

/** An opaque, unforgeable handle to one attested F3 ordered pair. */
export type AttestedGroupingPairToken = {
  readonly __attestedGroupingPair?: never
}

const attestedPairCaptures = new WeakMap<object, GroupingPairCapture>()

function issuePairToken(capture: GroupingPairCapture): AttestedGroupingPairToken {
  const token: AttestedGroupingPairToken = Object.freeze({})
  attestedPairCaptures.set(token as object, capture)
  return token
}

/**
 * True only when `token` is a genuine token this module issued AND the pair it
 * was issued for is the exact ordered pair `comparisonInput` still carries. A
 * forged, cloned, or foreign-pair token is false, and no pair data is returned.
 */
export function attestedGroupingPairTokenMatches(token: unknown, comparisonInput: unknown): boolean {
  if (token === null || typeof token !== "object") return false
  if (comparisonInput === null || typeof comparisonInput !== "object") return false
  const capture = attestedPairCaptures.get(token as object)
  if (capture === undefined) return false
  return pairCaptureIntact(capture, comparisonInput as object)
}

type AttestedGroupingEntry = {
  readonly capture: GroupingPairCapture
  readonly token: AttestedGroupingPairToken
  readonly snapshot: SuccessfulGroupingComparisonSnapshot
}

const attestedGroupingResults = new WeakMap<object, AttestedGroupingEntry>()

// Deep clone over INTERNALLY-CONSTRUCTED, JSON-safe data only. Never run over an
// arbitrary caller graph: callers reach only the WeakMap identity lookup. The
// reconstruction drops any non-plain field, so no accessor, prototype, or
// unknown post-validation field can travel into or out of a snapshot.
function inertGroupingClone<T>(value: T): T {
  if (value === null || typeof value !== "object") return value
  if (Array.isArray(value)) return value.map((item) => inertGroupingClone(item)) as unknown as T
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(value as Record<string, unknown>)) {
    out[key] = inertGroupingClone((value as Record<string, unknown>)[key])
  }
  return out as T
}

/**
 * Runtime-provenance attestation for a validated F3 comparison result.
 *
 * Returns a fresh, fully detached inert snapshot of the success result ONLY
 * when `value` is the EXACT success object a real `compareGroupingSubjects`
 * call returned AND `comparisonInput` is the EXACT original input object that
 * produced it; otherwise `null`. A spread/JSON/structuredClone copy, a forged
 * look-alike, a failed comparison, the bare payload, the exact result paired
 * with a cloned or different input, or a pair-A result applied to a pair-B
 * input is unregistered/mismatched and returns `null`. Repeated snapshots
 * neither alias each other nor the stored snapshot, and a later mutation of the
 * public result cannot alter it.
 *
 * `comparisonInput` is NOT merely an identity token: the ORDERED pair it
 * carried at comparison time is pinned, so the same container also fails to
 * attest once either side is replaced, the two sides are swapped, a subject
 * wrapper is re-pointed at a different `formationResult`, or a canonical
 * selector is added, removed, or edited. Only the ordered pair is re-checked —
 * all verdict/reason data still comes solely from the detached snapshot, and no
 * caller object is ever frozen or mutated.
 */
export function snapshotValidatedGroupingComparisonResult(
  value: unknown,
  comparisonInput: unknown,
): SuccessfulGroupingComparisonSnapshot | null {
  return attestValidatedGroupingComparison(value, comparisonInput)?.snapshot ?? null
}

/** A successful F3 attestation: a detached snapshot plus an opaque pair handle. */
export type AttestedGroupingComparison = {
  readonly snapshot: SuccessfulGroupingComparisonSnapshot
  readonly pairToken: AttestedGroupingPairToken
}

/**
 * The stronger internal attestation path (F4 consumes this; the public
 * `snapshotValidatedGroupingComparisonResult` delegates to it).
 *
 * Returns `null` under exactly the conditions documented above. On success it
 * returns BOTH a fresh detached snapshot AND the opaque token for the exact
 * ordered pair this result was computed from, so a downstream slice can bind its
 * own output to that pair without ever re-reading the caller graph.
 */
export function attestValidatedGroupingComparison(
  value: unknown,
  comparisonInput: unknown,
): AttestedGroupingComparison | null {
  if (value === null || typeof value !== "object") return null
  if (comparisonInput === null || typeof comparisonInput !== "object") return null
  const entry = attestedGroupingResults.get(value as object)
  if (entry === undefined) return null
  // The result attests ONLY when bound to its EXACT original input object AND
  // that input still carries the EXACT ordered pair that was compared; a cloned,
  // different, or other-pair input — or the same container whose sides were
  // replaced, swapped, re-pointed at another formationResult, or had a canonical
  // selector added/removed/edited — is a mismatch (identity, not shape).
  if (!pairCaptureIntact(entry.capture, comparisonInput as object)) return null
  return { snapshot: inertGroupingClone(entry.snapshot), pairToken: entry.token }
}

// ─── Documented deterministic thresholds ────────────────────────

/** DISTINCT weak kinds required for `possible_match`. Instances of one kind = 1. */
export const WEAK_MIN_DISTINCT_KINDS = 3
/** occurredAt values within this window (24h) support `timestamp_proximity`. */
export const WEAK_TIMESTAMP_PROXIMITY_WINDOW_MS = 24 * 60 * 60 * 1000
/** explicitDeadline values within this window (7d) support `related_deadline`. */
export const WEAK_DEADLINE_PROXIMITY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
/** Minimum shared distinct non-stop-word tokens for `bounded_lexical_similarity`. */
export const WEAK_LEXICAL_MIN_SHARED_TOKENS = 2
/** Minimum Jaccard over Goal tokens for `bounded_lexical_similarity`. */
export const WEAK_LEXICAL_MIN_JACCARD = 0.5

/** Reason bounds (Section 14). */
export const MAX_GROUPING_REASONS = 20
export const MAX_GROUPING_REASON_LENGTH = 200

// ─── Closed reason templates (Section 14) ───────────────────────
//
// Exactly one deterministic, bounded, human-readable template per kind. No raw
// title/summary/URL/selector value, no score, no chain of thought is ever
// interpolated — the templates are constant.

const HARD_SPLIT_REASONS: Record<HardSplitKind, string> = {
  different_work_object: "The candidates resolve to different canonical work objects.",
  different_verifier: "The candidates have different validated verifiers.",
  separate_decision_boundary: "The candidates independently decide different questions.",
  independently_closable_outcomes: "The candidates close independently across a separated boundary.",
  incompatible_acceptance_boundary: "The candidates declare an explicitly incompatible acceptance boundary.",
}

const HARD_POSITIVE_REASONS: Record<HardPositiveKind, string> = {
  exact_provider_object: "Both candidates contain the same member provider object.",
  explicit_cross_link: "One candidate explicitly cross-links the other's object.",
  same_canonical_work_object: "Both candidates resolve to the same canonical work object.",
  same_outcome: "The candidates share the same corroborated outcome.",
  same_verifier: "The candidates share the same validated verifier.",
  compatible_acceptance_criteria: "The candidates share an identical acceptance-criteria set.",
  same_decision_boundary: "The candidates share the same decision boundary.",
}

const WEAK_REASONS: Record<WeakKind, string> = {
  actor_overlap: "Only weak actor overlap is present.",
  container_overlap: "Only weak container overlap is present.",
  provider_overlap: "Only weak provider overlap is present.",
  timestamp_proximity: "Only weak timestamp proximity is present.",
  related_deadline: "Only weak related-deadline proximity is present.",
  bounded_lexical_similarity: "Only weak bounded lexical similarity is present.",
}

// Deterministic ordering indices for stable evidence/reason order.
const HARD_SPLIT_ORDER = new Map(HARD_SPLIT_KINDS.map((k, i) => [k, i]))
const HARD_POSITIVE_ORDER = new Map(HARD_POSITIVE_KINDS.map((k, i) => [k, i]))
const WEAK_ORDER = new Map(WEAK_KINDS.map((k, i) => [k, i]))

// ─── Small deterministic set helpers ────────────────────────────

function intersectionCount(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  // Iterate the smaller set for determinism and bounded work.
  const [small, large] = a.size <= b.size ? [a, b] : [b, a]
  let n = 0
  for (const value of small) if (large.has(value)) n += 1
  return n
}

function setsEqual(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false
  for (const value of a) if (!b.has(value)) return false
  return true
}

// Count of (left,right) timestamp pairs within `window`. Bounded: each side is
// at most `maxSubjectMembers`, so this is at most ~2500 comparisons.
function proximatePairCount(a: readonly number[], b: readonly number[], window: number): number {
  let n = 0
  for (const x of a) for (const y of b) if (Math.abs(x - y) <= window) n += 1
  return n
}

function support(left: number, right: number, shared: number): GroupingEvidenceSupport {
  return { left, right, shared }
}

// ─── Evidence computation ───────────────────────────────────────

function computeHardSplit(left: PreparedSubject, right: PreparedSubject): GroupingEvidence<HardSplitKind>[] {
  const out: GroupingEvidence<HardSplitKind>[] = []

  // A. Different canonical Work Objects (both admitted selectors, and differ).
  const differentWorkObject =
    left.canonicalWorkObjectKey !== null &&
    right.canonicalWorkObjectKey !== null &&
    left.canonicalWorkObjectKey !== right.canonicalWorkObjectKey
  if (differentWorkObject) push(out, "different_work_object", support(1, 1, 0), HARD_SPLIT_REASONS)

  // B. Different verifier (both present, differ under the same F1B trim).
  if (left.verifier !== null && right.verifier !== null && left.verifier !== right.verifier) {
    push(out, "different_verifier", support(1, 1, 0), HARD_SPLIT_REASONS)
  }

  // C. Separate decision boundary (both decisionNeeded present + differ, and
  //    both independent closures are "independent").
  const bothIndependent =
    left.independentClosure === "independent" && right.independentClosure === "independent"
  const separateDecisionBoundary =
    bothIndependent &&
    left.decisionNeeded !== null &&
    right.decisionNeeded !== null &&
    left.decisionNeeded !== right.decisionNeeded
  if (separateDecisionBoundary) push(out, "separate_decision_boundary", support(1, 1, 0), HARD_SPLIT_REASONS)

  // D. Independently closable outcomes: both independent, both outcomes present,
  //    AND a separately-proven object or decision-boundary split already exists.
  if (
    bothIndependent &&
    left.outcome !== null &&
    right.outcome !== null &&
    (differentWorkObject || separateDecisionBoundary)
  ) {
    push(out, "independently_closable_outcomes", support(1, 1, 0), HARD_SPLIT_REASONS)
  }

  // E. incompatible_acceptance_boundary is RESERVED for a closed, explicitly
  //    structured counterexample. F3 performs no semantic contradiction
  //    detection over natural-language criteria — that is deferred to F6 — so it
  //    is never emitted here from ordinary acceptance-criteria text.

  return sortEvidence(out, HARD_SPLIT_ORDER)
}

function computeHardPositive(
  left: PreparedSubject,
  right: PreparedSubject,
): GroupingEvidence<HardPositiveKind>[] {
  const out: GroupingEvidence<HardPositiveKind>[] = []

  // A. Exact provider object: MEMBER object universes intersect on an exact
  //    canonical tuple. Only a shared MEMBER object (case A) is a hard positive.
  //    A shared NON-member referenced object (case C) is deliberately EXCLUDED
  //    here: two subjects that merely reference the same third-party object are
  //    not thereby the same Goal, and admitting that produced a false
  //    strong_match. A shared referenced-only object is recall-only — it can
  //    widen retrieval (see firstRetrievalKey) but never a comparison positive.
  const sharedMemberObjects = intersectionCount(left.memberObjectKeys, right.memberObjectKeys)
  if (sharedMemberObjects > 0) {
    push(out, "exact_provider_object", support(left.memberObjectKeys.size, right.memberObjectKeys.size, sharedMemberObjects), HARD_POSITIVE_REASONS)
  }

  // B. Explicit cross-link: a member object of one side appears in the other's
  //    validated referencedObjects.
  const crossLR = intersectionCount(left.memberObjectKeys, right.referencedObjectKeys)
  const crossRL = intersectionCount(right.memberObjectKeys, left.referencedObjectKeys)
  if (crossLR + crossRL > 0) {
    push(out, "explicit_cross_link", support(crossLR, crossRL, crossLR + crossRL), HARD_POSITIVE_REASONS)
  }

  // C. Same canonical Work Object: both admitted selectors resolve equal.
  const sameCanonicalWorkObject =
    left.canonicalWorkObjectKey !== null &&
    right.canonicalWorkObjectKey !== null &&
    left.canonicalWorkObjectKey === right.canonicalWorkObjectKey
  if (sameCanonicalWorkObject) push(out, "same_canonical_work_object", support(1, 1, 1), HARD_POSITIVE_REASONS)

  // E. Same verifier: exact normalized equality of non-empty verifiers.
  const sameVerifier = left.verifier !== null && right.verifier !== null && left.verifier === right.verifier
  if (sameVerifier) push(out, "same_verifier", support(1, 1, 1), HARD_POSITIVE_REASONS)

  // F. Compatible acceptance criteria: exact normalized SET equality (non-empty).
  const compatibleAcceptance =
    left.acceptanceCriteria.size > 0 && setsEqual(left.acceptanceCriteria, right.acceptanceCriteria)
  if (compatibleAcceptance) {
    push(out, "compatible_acceptance_criteria", support(left.acceptanceCriteria.size, right.acceptanceCriteria.size, left.acceptanceCriteria.size), HARD_POSITIVE_REASONS)
  }

  // G. Same decision boundary: decisionNeeded AND verifier both equal.
  if (
    left.decisionNeeded !== null &&
    right.decisionNeeded !== null &&
    left.decisionNeeded === right.decisionNeeded &&
    sameVerifier
  ) {
    push(out, "same_decision_boundary", support(1, 1, 1), HARD_POSITIVE_REASONS)
  }

  // D. Same outcome: exact normalized equality, corroborated by same verifier,
  //    same canonical Work Object, or a compatible exact acceptance-criteria set.
  const sameOutcome = left.outcome !== null && right.outcome !== null && left.outcome === right.outcome
  if (sameOutcome && (sameVerifier || sameCanonicalWorkObject || compatibleAcceptance)) {
    push(out, "same_outcome", support(1, 1, 1), HARD_POSITIVE_REASONS)
  }

  return sortEvidence(out, HARD_POSITIVE_ORDER)
}

function computeWeakSupport(left: PreparedSubject, right: PreparedSubject): GroupingEvidence<WeakKind>[] {
  const out: GroupingEvidence<WeakKind>[] = []

  const sharedActors = intersectionCount(left.actors, right.actors)
  if (sharedActors > 0) push(out, "actor_overlap", support(left.actors.size, right.actors.size, sharedActors), WEAK_REASONS)

  const sharedContainers = intersectionCount(left.containers, right.containers)
  if (sharedContainers > 0) push(out, "container_overlap", support(left.containers.size, right.containers.size, sharedContainers), WEAK_REASONS)

  const sharedProviders = intersectionCount(left.providers, right.providers)
  if (sharedProviders > 0) push(out, "provider_overlap", support(left.providers.size, right.providers.size, sharedProviders), WEAK_REASONS)

  const proximateTimestamps = proximatePairCount(left.occurredAtMs, right.occurredAtMs, WEAK_TIMESTAMP_PROXIMITY_WINDOW_MS)
  if (proximateTimestamps > 0) push(out, "timestamp_proximity", support(left.occurredAtMs.length, right.occurredAtMs.length, proximateTimestamps), WEAK_REASONS)

  const proximateDeadlines = proximatePairCount(left.deadlineMs, right.deadlineMs, WEAK_DEADLINE_PROXIMITY_WINDOW_MS)
  if (proximateDeadlines > 0) push(out, "related_deadline", support(left.deadlineMs.length, right.deadlineMs.length, proximateDeadlines), WEAK_REASONS)

  const sharedTokens = intersectionCount(left.goalTokens, right.goalTokens)
  const unionSize = left.goalTokens.size + right.goalTokens.size - sharedTokens
  const jaccard = unionSize > 0 ? sharedTokens / unionSize : 0
  if (sharedTokens >= WEAK_LEXICAL_MIN_SHARED_TOKENS && jaccard >= WEAK_LEXICAL_MIN_JACCARD) {
    push(out, "bounded_lexical_similarity", support(left.goalTokens.size, right.goalTokens.size, sharedTokens), WEAK_REASONS)
  }

  return sortEvidence(out, WEAK_ORDER)
}

function push<K extends string>(
  out: GroupingEvidence<K>[],
  kind: K,
  supportValue: GroupingEvidenceSupport,
  reasons: Record<K, string>,
): void {
  out.push({ kind, support: supportValue, reason: boundReason(reasons[kind]) })
}

function boundReason(reason: string): string {
  return reason.length > MAX_GROUPING_REASON_LENGTH ? reason.slice(0, MAX_GROUPING_REASON_LENGTH) : reason
}

function sortEvidence<K extends string>(
  records: GroupingEvidence<K>[],
  order: ReadonlyMap<K, number>,
): GroupingEvidence<K>[] {
  return records.sort((a, b) => (order.get(a.kind) ?? 0) - (order.get(b.kind) ?? 0))
}

// ─── Public comparison ──────────────────────────────────────────

/**
 * Compare two attested F1C subjects and return the deterministic evidence
 * ledger and suggestion verdict. Fails closed (never throws) on an unattested
 * subject, an exceeded resource bound, or a non-member `canonicalWorkObjectRef`
 * selector — and the supplied selector value is never echoed.
 */
export function compareGroupingSubjects(input: GroupingComparisonInput): GroupingComparisonResult {
  // ONE read of every security-sensitive caller value, before any other work.
  // Everything below — preparation, the verdict, and the registered binding —
  // is derived from this single capture, never from a second caller read.
  const capture = capturePair(input as object)

  const leftPrep = prepareSubject(capture.left.stable)
  if (!leftPrep.ok) return { ok: false, candidateOnly: true, reason: leftPrep.reason }
  const rightPrep = prepareSubject(capture.right.stable)
  if (!rightPrep.ok) return { ok: false, candidateOnly: true, reason: rightPrep.reason }

  const left = leftPrep.subject
  const right = rightPrep.subject

  const hardSplit = computeHardSplit(left, right)
  const hardPositive = computeHardPositive(left, right)
  const weakSupport = computeWeakSupport(left, right)

  // Verdict — strict evaluation order; hard split is final.
  let verdict: GroupingVerdict
  if (hardSplit.length > 0) verdict = "must_split"
  else if (hardPositive.length > 0) verdict = "strong_match"
  else if (weakSupport.length >= WEAK_MIN_DISTINCT_KINDS) verdict = "possible_match"
  else verdict = "insufficient"

  // Reasons: hard split → hard positive → weak, bounded.
  const reasons: string[] = []
  for (const record of hardSplit) reasons.push(record.reason)
  for (const record of hardPositive) reasons.push(record.reason)
  for (const record of weakSupport) reasons.push(record.reason)

  const result: SuccessfulGroupingComparisonResult = {
    ok: true,
    candidateOnly: true,
    humanReviewRequired: true,
    hardSplit,
    hardPositive,
    weakSupport,
    verdict,
    reasons: reasons.slice(0, MAX_GROUPING_REASONS),
  }
  // Register runtime provenance BEFORE the result leaves this module, using the
  // SAME private capture the verdict was computed from — the caller graph is not
  // read again here. A later mutation of the public result cannot reach the
  // stored attestation, and a forged/cloned result (or a mismatched input) never
  // attests. The success result object itself is the WeakMap key.
  attestedGroupingResults.set(result, {
    capture,
    token: issuePairToken(capture),
    snapshot: inertGroupingClone(result),
  })
  return result
}

// ─── Bounded candidate retrieval (Section 15) ───────────────────

/**
 * The first retrieval key (strong keys first, then recall keys) that the two
 * prepared subjects share, or `null`. Provider identity ALONE is never a key.
 */
function firstRetrievalKey(subject: PreparedSubject, candidate: PreparedSubject): RetrievalKeyKind | null {
  // 1. Exact MEMBER provider object — member ∩ member ONLY, never the merged
  //    referenced universe (a shared referenced-only object is the weaker recall
  //    key at step 4, and is never called exact_provider_object).
  if (intersectionCount(subject.memberObjectKeys, candidate.memberObjectKeys) > 0) return "exact_provider_object"
  // 2. Explicit member cross-link: one side's member appears in the other's refs.
  if (
    intersectionCount(subject.memberObjectKeys, candidate.referencedObjectKeys) > 0 ||
    intersectionCount(candidate.memberObjectKeys, subject.referencedObjectKeys) > 0
  ) {
    return "explicit_cross_link"
  }
  // 3. Same admitted canonical Work Object.
  if (
    subject.canonicalWorkObjectKey !== null &&
    candidate.canonicalWorkObjectKey !== null &&
    subject.canonicalWorkObjectKey === candidate.canonicalWorkObjectKey
  ) {
    return "same_canonical_work_object"
  }
  // 4. Shared referenced-only object: both reference the same third-party object.
  //    RECALL ONLY — widens the comparison set, assigns no verdict, and is never a
  //    comparison hard positive.
  if (intersectionCount(subject.referencedObjectKeys, candidate.referencedObjectKeys) > 0) {
    return "shared_referenced_object"
  }
  // 5. Exact workObject text.
  if (
    subject.workObjectText !== null &&
    candidate.workObjectText !== null &&
    subject.workObjectText === candidate.workObjectText
  ) {
    return "exact_work_object_text"
  }
  const sharedTokens = intersectionCount(subject.goalTokens, candidate.goalTokens)
  const unionSize = subject.goalTokens.size + candidate.goalTokens.size - sharedTokens
  const jaccard = unionSize > 0 ? sharedTokens / unionSize : 0
  if (sharedTokens >= WEAK_LEXICAL_MIN_SHARED_TOKENS && jaccard >= WEAK_LEXICAL_MIN_JACCARD) {
    return "bounded_lexical_similarity"
  }
  return null
}

/**
 * Return the comparable candidates for `subject`, in ORIGINAL stable order.
 * Retrieval only widens the comparison set: it assigns no verdict, changes no
 * membership, and never reorders by ROI or timestamp. An oversized candidate
 * list is rejected BEFORE iterating; unattested or over-bound candidates are
 * simply not comparable and are skipped.
 */
export function retrieveComparableSubjects(
  subject: GroupingSubjectInput,
  candidates: readonly GroupingSubjectInput[],
): GroupingRetrievalResult {
  const list = Array.isArray(candidates) ? candidates : []
  if (list.length > GROUPING_BOUNDS.maxRetrievalCandidates) {
    return { ok: false, candidateOnly: true, reason: "retrieval_candidates_exceeded" }
  }
  const subjectPrep = prepareSubject(subject ?? ({} as GroupingSubjectInput))
  if (!subjectPrep.ok) return { ok: false, candidateOnly: true, reason: subjectPrep.reason }

  const comparable: GroupingRetrievalMatch[] = []
  for (let index = 0; index < list.length; index += 1) {
    const candidatePrep = prepareSubject(list[index])
    if (!candidatePrep.ok) continue
    const via = firstRetrievalKey(subjectPrep.subject, candidatePrep.subject)
    if (via !== null) comparable.push({ index, via })
  }
  // Original stable order is preserved by index-ascending iteration; never sorted
  // by ROI, timestamp, or any score.
  return { ok: true, candidateOnly: true, comparable }
}

// Re-export ordering vocab used by permanent tests for exhaustive assertions.
export { RETRIEVAL_KEY_KINDS }
