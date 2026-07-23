/**
 * F2A — Deterministic GitHub formation extraction.
 *
 * Maps a bounded, normalized GitHub event (fixture-shaped; see `./types.ts`)
 * onto the structured (`D`) fields of the F1A source contract, then hands the
 * constructed candidate to the REAL F1A builder and returns its exact result.
 *
 * Constitutional dependency (plan Section 2):
 *   - Consumes F1A (`buildFormationSourceCandidate`) only.
 *   - Never calls or constructs F1B (Goal/Done Condition) or F1C (aggregate /
 *     Source Role) — those imports are absent by design.
 *   - Never returns a forged or reconstructed candidate: the success result is
 *     the exact F1A builder object, which alone attests through
 *     `snapshotValidatedFormationSourceResult`.
 *
 * Determinism & scope (plan Sections 5–6):
 *   - Identity is composed from the structured repository owner/name and object
 *     number ONLY — independent of title, actor, timestamp, and URL.
 *   - Natural-language (`L`) fields (Goal outcome, Decision Needed, Verifier,
 *     Acceptance Criteria, textual deadline, authority/supersession claims,
 *     unresolved-question semantics) are NOT invented: they are omitted.
 *   - No grouping, ranking, projection, membership, or Source Role.
 *   - No LLM, no decomposition, and no network access whatsoever.
 */

import {
  buildFormationSourceCandidate,
  type FormationActorAssertedRelation,
  type FormationSourceStatus,
} from "../sourceContract.ts"
import { normalizeHost, parseProviderUrl, recognizeGitHubObjectPath } from "./providerUrl.ts"
import type { ProviderUrlRejection } from "./providerUrl.ts"
import type {
  GitHubExtractionConfig,
  GitHubExtractionRejection,
  GitHubFormationExtractionResult,
  NormalizedGitHubEventType,
  NormalizedGitHubFormationInput,
  NormalizedGitHubStatus,
} from "./types.ts"

const PROVIDER = "github" as const

const DEFAULT_ALLOWED_HOSTS: readonly string[] = ["github.com"]

// GitHub owner/repository allowed charset. Excludes `/`, `#`, `:`, and every
// whitespace/control/format character, so a composed identity cannot collide by
// delimiter injection and is free of invisible characters (plan Section 5).
const GITHUB_NAME_PATTERN = /^[A-Za-z0-9._-]+$/

// Structured GitHub state → a single SOURCE status marker. This is a source
// status only; it never becomes a Done Condition status or an authority signal.
const STATUS_TO_MARKER: Readonly<Record<NormalizedGitHubStatus, FormationSourceStatus>> = {
  open: "open",
  draft: "draft",
  closed: "closed",
  merged: "merged",
  in_review: "in_review",
  changes_requested: "changes_requested",
  approved: "approved",
}

function mapUrlRejection(reason: ProviderUrlRejection): GitHubExtractionRejection {
  switch (reason) {
    case "not_string":
      return "source_url_not_string"
    case "too_long":
      return "source_url_too_long"
    case "unparseable":
      return "source_url_unparseable"
    case "scheme_not_https":
      return "source_url_scheme_not_https"
    case "userinfo_present":
      return "source_url_userinfo_present"
    case "empty_host":
      return "source_url_empty_host"
    case "host_not_allowed":
      return "source_url_host_not_allowed"
  }
}

/**
 * The relational assertion for the assignee field. A structural mapping from the
 * event type — NOT an authority claim. `reviewer_requested`/`assignee` are
 * source-asserted relations; they never populate `authoritySignals`.
 */
function assigneeRelation(eventType: NormalizedGitHubEventType): FormationActorAssertedRelation {
  return eventType === "review_requested" ? "reviewer_requested" : "assignee"
}

type ActorAssertion = { readonly name: string; readonly assertedRelation: FormationActorAssertedRelation }
type ObjectRef = { readonly provider: typeof PROVIDER; readonly sourceObjectId: string }
type SourceLink = { readonly url: string; readonly recognized?: ObjectRef }

/**
 * Extract a deterministic F1A source candidate from a normalized GitHub event.
 *
 * Returns the exact F1A builder result on success (`{ ok: true, sourceResult }`)
 * or a small, content-free provider-extraction rejection on failure. Never
 * mutates `input`, never performs network access, and never invokes an LLM.
 */
export function extractGitHubFormationSource(
  input: NormalizedGitHubFormationInput,
  config?: GitHubExtractionConfig,
): GitHubFormationExtractionResult {
  const allowedHosts = config?.allowedHosts ?? DEFAULT_ALLOWED_HOSTS

  // ── Identity: structured owner/name/number ONLY (plan Section 5) ──
  const { owner, name } = input.repository
  if (!GITHUB_NAME_PATTERN.test(owner) || !GITHUB_NAME_PATTERN.test(name)) {
    return { ok: false, reason: "identity_unsafe" }
  }
  if (!Number.isSafeInteger(input.number) || input.number <= 0) {
    return { ok: false, reason: "identity_unsafe" }
  }
  const sourceObjectId = `${PROVIDER}:${owner}/${name}#${input.number}`
  const parentObjectId = `${PROVIDER}:${owner}/${name}`
  const externalId = `${owner}/${name}#${input.number}`
  const container = `${owner}/${name}`

  // ── Navigation target / source reference URL: host policy (Section 7) ──
  const primary = parseProviderUrl(input.sourceUrl, allowedHosts)
  if (!primary.ok) {
    return { ok: false, reason: mapUrlRejection(primary.reason) }
  }
  const navigationTarget = primary.value.url

  // ── Actor assertions from structured actor/assignee (never authority) ──
  const actorAssertions: ActorAssertion[] = []
  if (input.actor !== undefined) {
    actorAssertions.push({ name: input.actor, assertedRelation: "author" })
  }
  if (input.assignee !== undefined) {
    actorAssertions.push({ name: input.assignee, assertedRelation: assigneeRelation(input.eventType) })
  }

  // ── Timestamps from structured provider timestamps only ──
  const occurredAt = input.createdAt ?? input.updatedAt
  const editedAt =
    input.createdAt !== undefined && input.updatedAt !== input.createdAt ? input.updatedAt : undefined
  const timestamps = {
    occurredAt,
    ...(editedAt !== undefined ? { editedAt } : {}),
    capturedAt: input.capturedAt,
  }

  // ── Source links + deterministically recognized GitHub references ──
  const normalizedAllowed = new Set<string>()
  for (const entry of allowedHosts) {
    const normalized = normalizeHost(entry)
    if (normalized !== null) normalizedAllowed.add(normalized)
  }

  const sourceLinks: SourceLink[] = [{ url: primary.value.url }]
  const seenLinks = new Set<string>([primary.value.url])
  const referencedObjects: ObjectRef[] = []
  const seenRefs = new Set<string>()

  for (const rawUrl of input.referencedUrls ?? []) {
    // Any safe https host may be retained as an OPAQUE source link; only
    // provider-host + object-path matches become recognized references. Unsafe
    // or unparseable referenced URLs are dropped, never fetched.
    const safe = parseProviderUrl(rawUrl)
    if (!safe.ok) continue

    let recognized: ObjectRef | undefined
    if (normalizedAllowed.has(safe.value.hostname)) {
      const object = recognizeGitHubObjectPath(safe.value.pathname)
      if (object !== null) {
        recognized = { provider: PROVIDER, sourceObjectId: `${PROVIDER}:${object.owner}/${object.name}#${object.number}` }
      }
    }

    if (!seenLinks.has(safe.value.url)) {
      seenLinks.add(safe.value.url)
      sourceLinks.push(recognized !== undefined ? { url: safe.value.url, recognized } : { url: safe.value.url })
    }
    if (recognized !== undefined && !seenRefs.has(recognized.sourceObjectId)) {
      seenRefs.add(recognized.sourceObjectId)
      referencedObjects.push(recognized)
    }
  }

  // ── Construct ONLY the bounded F1A input (D fields; L fields omitted). ──
  // Derived fields (`extractionConfidence`, `candidateOnly`) are NOT supplied —
  // F1A derives them. No Goal, Done Condition, Source Role, grouping, membership,
  // or authority field appears here.
  const candidateInput = {
    provider: PROVIDER,
    sourceRef: {
      source: PROVIDER,
      externalId,
      container,
      url: primary.value.url,
      capturedAt: input.capturedAt,
    },
    sourceObjectId,
    parentObjectId,
    title: input.title,
    sanitizedSummary: input.summary,
    actorAssertions,
    timestamps,
    sourceLinks,
    referencedObjects,
    statusMarkers: [STATUS_TO_MARKER[input.status]],
    navigationTarget,
  }

  // ── F1A handoff: serialize and call the REAL builder (plan Section 8). ──
  // The builder is the sole validation authority. Its exact returned object is
  // propagated on success so it attests through
  // `snapshotValidatedFormationSourceResult`; a clone would not.
  const result = buildFormationSourceCandidate(JSON.stringify(candidateInput))
  if (!result.ok) {
    return { ok: false, reason: "source_contract_rejected" }
  }
  return { ok: true, sourceResult: result }
}
