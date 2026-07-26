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

// Resource bound (remediation): 1 primary source link + at most 49 referenced
// links == F1A's 50-link boundary. The normalized referenced-URL array is
// rejected BEFORE iteration when it exceeds this, so oversized input never drives
// unbounded parse/dedup work that F1A would only reject afterwards. This is a
// deterministic bound on the normalized contract, not a public-payload validator.
const MAX_REFERENCED_URLS = 49

/**
 * Canonical GitHub owner/repository identity: ASCII lowercase. GitHub owner and
 * repository names are case-insensitive for the same object, so a case variant
 * must not produce a distinct `sourceObjectId` (which keys F3 hard Goal-identity
 * matching and cross-link dedup). The caller guarantees the value already matched
 * `GITHUB_NAME_PATTERN` (ASCII `[A-Za-z0-9._-]`), so `toLowerCase()` is a pure,
 * locale-independent ASCII fold. Applied to identity only — never to title,
 * summary, actor, or the stored navigation URL string.
 */
function canonicalName(value: string): string {
  return value.toLowerCase()
}

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
    case "sensitive_value":
      return "source_url_sensitive_value"
  }
}

/**
 * The GitHub object kind a normalized event type must identify in its primary
 * URL. Pull requests and review requests are pull-request objects; issues are
 * issue objects. Used by the B1 primary-source identity-coherence check.
 */
function expectedObjectKind(eventType: NormalizedGitHubEventType): "pull" | "issues" {
  return eventType === "issue" ? "issues" : "pull"
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
  // Shape is validated on the raw value (still rejecting whitespace/control/
  // format characters); identity is then composed from the CANONICAL (ASCII
  // lowercase) owner/name so a case variant of the same GitHub object yields one
  // stable identity (remediation B3).
  const { owner: rawOwner, name: rawName } = input.repository
  if (!GITHUB_NAME_PATTERN.test(rawOwner) || !GITHUB_NAME_PATTERN.test(rawName)) {
    return { ok: false, reason: "identity_unsafe" }
  }
  if (!Number.isSafeInteger(input.number) || input.number <= 0) {
    return { ok: false, reason: "identity_unsafe" }
  }
  const owner = canonicalName(rawOwner)
  const name = canonicalName(rawName)
  const sourceObjectId = `${PROVIDER}:${owner}/${name}#${input.number}`
  const parentObjectId = `${PROVIDER}:${owner}/${name}`
  const externalId = `${owner}/${name}#${input.number}`
  const container = `${owner}/${name}`

  // ── Navigation target / source reference URL: host policy (Section 7) ──
  const primary = parseProviderUrl(input.sourceUrl, allowedHosts)
  if (!primary.ok) {
    return { ok: false, reason: mapUrlRejection(primary.reason) }
  }

  // ── B1: primary-source identity coherence ──
  // The primary URL must identify the SAME provider-native object as the
  // structured identity. After host/scheme/userinfo/sensitive screening, its
  // pathname must be an exact GitHub object path whose canonical owner/name,
  // number, and kind equal the structured identity. This is F2A's provider
  // authority — F1A has no GitHub object-path semantics and cannot check it.
  // A non-sensitive query or fragment may remain (the canonical pathname still
  // identifies the exact object); the accepted URL is never rewritten to match.
  const primaryObject = recognizeGitHubObjectPath(primary.value.pathname)
  if (
    primaryObject === null ||
    canonicalName(primaryObject.owner) !== owner ||
    canonicalName(primaryObject.name) !== name ||
    primaryObject.number !== input.number ||
    primaryObject.kind !== expectedObjectKind(input.eventType)
  ) {
    return { ok: false, reason: "primary_source_identity_mismatch" }
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

  // Resource bound (remediation): reject an oversized referenced-URL array
  // BEFORE any iteration, so unbounded parse/dedup work is never performed.
  const referencedUrls = input.referencedUrls ?? []
  if (referencedUrls.length > MAX_REFERENCED_URLS) {
    return { ok: false, reason: "referenced_urls_too_many" }
  }

  const sourceLinks: SourceLink[] = [{ url: primary.value.url }]
  const seenLinks = new Set<string>([primary.value.url])
  const referencedObjects: ObjectRef[] = []
  const seenRefs = new Set<string>()

  for (const rawUrl of referencedUrls) {
    // Any safe https host may be retained as an OPAQUE source link; only
    // provider-host + object-path matches become recognized references. Unsafe,
    // unparseable, or sensitive-value-bearing referenced URLs are dropped
    // (parseProviderUrl refuses `sensitive_value`), never fetched.
    const safe = parseProviderUrl(rawUrl)
    if (!safe.ok) continue

    let recognized: ObjectRef | undefined
    if (normalizedAllowed.has(safe.value.hostname)) {
      const object = recognizeGitHubObjectPath(safe.value.pathname)
      if (object !== null) {
        // Canonical (lowercase) reference identity (B3): a case variant of a
        // referenced object dedupes to one identity and matches the structured id.
        recognized = {
          provider: PROVIDER,
          sourceObjectId: `${PROVIDER}:${canonicalName(object.owner)}/${canonicalName(object.name)}#${object.number}`,
        }
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
