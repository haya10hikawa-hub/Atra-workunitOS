/**
 * F3 — Goal Identity preparation.
 *
 * Turns an UNTRUSTED `GroupingSubjectInput` into a bounded, inert `PreparedSubject`
 * from which the grouping evidence ledger is computed. All trust flows through
 * F1C runtime provenance: a subject is only ever built from the fresh detached
 * snapshot returned by `snapshotValidatedWorkUnitFormationResult` — never from a
 * structural or serialized clone of an F1C success.
 *
 * Everything derived here is Goal Identity ONLY. It is deliberately independent
 * of State Prediction, ranking, provider authority, SourceRole, ROI, freshness,
 * and actor activity — none of those fields is read. The F1B Done Condition
 * verdict is consumed read-only; nothing is recomputed.
 *
 * Canonical object identity is the collision-safe tuple (provider,
 * sourceObjectId), JSON-encoded so no raw delimiter can forge a collision. It is
 * never `externalId` alone, a URL, a container, a title, an actor, a timestamp,
 * or provider alone.
 */

import {
  snapshotValidatedWorkUnitFormationResult,
} from "./workUnitFormationAggregate.ts"
import { FORMATION_SOURCE_PROVIDERS } from "./sourceContract.ts"
import type { FormationIndependentClosure } from "./goalDoneConditionAdapter.ts"
import type {
  GroupingSubjectInput,
  GroupingRejectionReason,
} from "./groupingTypes.ts"

/**
 * Resource bounds. They are enforced BEFORE the expensive per-object iteration,
 * and an exceeded bound fails closed — the input is never truncated.
 */
export const GROUPING_BOUNDS = {
  maxSubjectMembers: 50,
  maxObjectKeysPerSubject: 2500,
  maxRetrievalCandidates: 100,
} as const

/**
 * Bounded lexical tokenisation cap. Token collection stops once this many
 * distinct tokens have been gathered for a subject, so an oversized Goal field
 * cannot drive unbounded work. Tokens are never echoed — only counts are.
 */
export const GROUPING_MAX_LEXICAL_TOKENS = 256

const PROVIDER_SET: ReadonlySet<string> = new Set(FORMATION_SOURCE_PROVIDERS)

// A tiny closed stop-word set removed before lexical comparison, so trivial
// function words cannot manufacture a lexical overlap. Deliberately small and
// fixed — this is not natural-language understanding.
const LEXICAL_STOPWORDS: ReadonlySet<string> = new Set([
  "the",
  "a",
  "an",
  "of",
  "to",
  "and",
  "or",
  "for",
  "in",
  "on",
  "is",
  "be",
  "this",
  "that",
])

/**
 * Canonical object identity: the collision-safe JSON tuple of a KNOWN provider
 * and a non-empty `sourceObjectId`. Returns `null` for an unknown provider or a
 * missing/blank id — so an untrusted selector can never introduce an object and
 * no raw delimiter concatenation can forge a collision.
 */
export function canonicalObjectKey(provider: unknown, sourceObjectId: unknown): string | null {
  if (typeof provider !== "string" || !PROVIDER_SET.has(provider)) return null
  if (typeof sourceObjectId !== "string" || sourceObjectId.length === 0) return null
  return JSON.stringify([provider, sourceObjectId])
}

/**
 * The bounded, inert Goal Identity of one subject. Every field is either a
 * closed enum value, a canonical object key, a normalized exact string, a
 * numeric timestamp, or a set/count thereof. It carries no raw title, summary,
 * URL, provider payload, or identity, and aliases no caller-owned object.
 */
export type PreparedSubject = {
  /** Full canonical universe: member source objects + validated referencedObjects. */
  readonly objectKeys: ReadonlySet<string>
  /** Member source objects only. */
  readonly memberObjectKeys: ReadonlySet<string>
  /** Validated referencedObjects only (for explicit cross-link detection). */
  readonly referencedObjectKeys: ReadonlySet<string>
  /** Canonical work-object key from an ADMITTED selector, else null. */
  readonly canonicalWorkObjectKey: string | null
  /** F1B Goal outcome (exact-normalized), else null. */
  readonly outcome: string | null
  /** F1B Goal verifier (exact-normalized), else null. */
  readonly verifier: string | null
  /** F1B Goal decisionNeeded (exact-normalized), else null. */
  readonly decisionNeeded: string | null
  /** F1B Goal workObject text (exact-normalized) — RECALL retrieval only. */
  readonly workObjectText: string | null
  /** F1B independent-closure verdict, read-only. */
  readonly independentClosure: FormationIndependentClosure
  /** F1B Done Condition acceptanceCriteria as an exact-normalized set. */
  readonly acceptanceCriteria: ReadonlySet<string>
  /** Exact-normalized actor names across all members. */
  readonly actors: ReadonlySet<string>
  /** Exact sourceRef.container values across all members. */
  readonly containers: ReadonlySet<string>
  /** Provider enum values across all members. */
  readonly providers: ReadonlySet<string>
  /** Parseable member occurredAt timestamps (ms). */
  readonly occurredAtMs: readonly number[]
  /** Parseable member explicitDeadline values (ms). */
  readonly deadlineMs: readonly number[]
  /** Bounded lexical tokens over validated Goal fields (stop-words removed). */
  readonly goalTokens: ReadonlySet<string>
}

export type PrepareSubjectResult =
  | { readonly ok: true; readonly subject: PreparedSubject }
  | { readonly ok: false; readonly reason: GroupingRejectionReason }

function reject(reason: GroupingRejectionReason): PrepareSubjectResult {
  return { ok: false, reason }
}

/** Exact-normalized non-empty string, else null. Trim only (F1B canonical form). */
function normalizeExact(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/** Parse an ISO/date string to ms; NaN and non-strings yield null. */
function parseMs(value: unknown): number | null {
  if (typeof value !== "string" || value.length === 0) return null
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? null : ms
}

// Unicode-aware token matcher: letter-led words and pure number runs. Used only
// over already-bounded Goal fields, and the collected set is itself capped.
const TOKEN_RE = /[\p{L}][\p{L}\p{N}]*|\p{N}+/gu

function collectTokens(text: string, into: Set<string>): void {
  if (into.size >= GROUPING_MAX_LEXICAL_TOKENS) return
  const matches = text.toLowerCase().match(TOKEN_RE)
  if (matches === null) return
  for (const token of matches) {
    if (into.size >= GROUPING_MAX_LEXICAL_TOKENS) return
    if (LEXICAL_STOPWORDS.has(token)) continue
    into.add(token)
  }
}

/**
 * Prepare one subject. Fails closed on: an unattested F1C result, more than
 * `maxSubjectMembers` members, an object universe exceeding
 * `maxObjectKeysPerSubject`, or a supplied `canonicalWorkObjectRef` that is
 * malformed or is not a member of the subject's attested object universe. On
 * rejection the supplied selector value is never echoed.
 */
export function prepareSubject(input: GroupingSubjectInput): PrepareSubjectResult {
  // 1. Runtime provenance is the ONLY gate. A forged/cloned F1C result yields
  //    null and is rejected; the returned candidate is a fresh detached snapshot.
  const candidate = snapshotValidatedWorkUnitFormationResult(
    (input as { formationResult?: unknown } | null | undefined)?.formationResult,
  )
  if (candidate === null) return reject("subject_not_validated")

  const members = candidate.members
  if (members.length > GROUPING_BOUNDS.maxSubjectMembers) return reject("subject_members_exceeded")

  const objectKeys = new Set<string>()
  const memberObjectKeys = new Set<string>()
  const referencedObjectKeys = new Set<string>()
  const actors = new Set<string>()
  const containers = new Set<string>()
  const providers = new Set<string>()
  const occurredAtMs: number[] = []
  const deadlineMs: number[] = []

  // 2. Build the bounded object universe, rejecting BEFORE more work once the
  //    key bound is exceeded (never truncating).
  for (const member of members) {
    const source = member.source
    const ownKey = canonicalObjectKey(source.provider, source.sourceObjectId)
    if (ownKey !== null) {
      memberObjectKeys.add(ownKey)
      objectKeys.add(ownKey)
      if (objectKeys.size > GROUPING_BOUNDS.maxObjectKeysPerSubject) {
        return reject("subject_object_keys_exceeded")
      }
    }
    if (typeof source.provider === "string" && PROVIDER_SET.has(source.provider)) {
      providers.add(source.provider)
    }
    const container = normalizeExact(source.sourceRef?.container)
    if (container !== null) containers.add(container)
    for (const assertion of source.actorAssertions ?? []) {
      const name = normalizeExact(assertion?.name)
      if (name !== null) actors.add(name)
    }
    const occurred = parseMs(source.timestamps?.occurredAt)
    if (occurred !== null) occurredAtMs.push(occurred)
    const deadline = parseMs(source.explicitDeadline?.value)
    if (deadline !== null) deadlineMs.push(deadline)
    for (const ref of source.referencedObjects ?? []) {
      const refKey = canonicalObjectKey(ref?.provider, ref?.sourceObjectId)
      if (refKey === null) continue
      referencedObjectKeys.add(refKey)
      objectKeys.add(refKey)
      if (objectKeys.size > GROUPING_BOUNDS.maxObjectKeysPerSubject) {
        return reject("subject_object_keys_exceeded")
      }
    }
  }

  // 3. Admit the untrusted selector ONLY as an exact member of the universe.
  let canonicalWorkObjectKey: string | null = null
  const selector = (input as { canonicalWorkObjectRef?: unknown }).canonicalWorkObjectRef
  if (selector !== undefined) {
    const key = canonicalObjectKey(
      (selector as { provider?: unknown } | null | undefined)?.provider,
      (selector as { sourceObjectId?: unknown } | null | undefined)?.sourceObjectId,
    )
    if (key === null || !objectKeys.has(key)) return reject("canonical_work_object_ref_not_a_member")
    canonicalWorkObjectKey = key
  }

  // 4. Goal Identity + read-only Done Condition fields.
  const gdc = candidate.goalDoneCondition
  const goal = gdc.goal
  const goalTokens = new Set<string>()
  for (const field of [goal.outcome, goal.workObject, goal.decisionNeeded, goal.scope, goal.verifier, goal.timeHorizon]) {
    if (typeof field === "string" && field.length > 0) collectTokens(field, goalTokens)
  }
  const acceptanceCriteria = new Set<string>()
  for (const criterion of gdc.doneCondition?.acceptanceCriteria ?? []) {
    const normalized = normalizeExact(criterion)
    if (normalized !== null) acceptanceCriteria.add(normalized)
  }

  return {
    ok: true,
    subject: {
      objectKeys,
      memberObjectKeys,
      referencedObjectKeys,
      canonicalWorkObjectKey,
      outcome: normalizeExact(goal.outcome),
      verifier: normalizeExact(goal.verifier),
      decisionNeeded: normalizeExact(goal.decisionNeeded),
      workObjectText: normalizeExact(goal.workObject),
      independentClosure: gdc.independentClosure,
      acceptanceCriteria,
      actors,
      containers,
      providers,
      occurredAtMs,
      deadlineMs,
      goalTokens,
    },
  }
}
