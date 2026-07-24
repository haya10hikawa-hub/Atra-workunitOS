/**
 * F2B — Deterministic Slack formation extraction.
 *
 * Maps a bounded, normalized Slack event (fixture-shaped; see `./slackTypes.ts`)
 * onto the structured (`D`) fields of the F1A source contract, then hands the
 * constructed candidate to the REAL F1A builder and returns its exact result.
 *
 * Constitutional dependency (plan Section 3):
 *   - Consumes F1A (`buildFormationSourceCandidate`) only.
 *   - Reuses the merged F2A shared URL boundary (`parseProviderUrl`,
 *     `normalizeHost`, `recognizeGitHubObjectPath`) unchanged — never a weaker,
 *     duplicated URL parser.
 *   - Never calls or constructs F1B (Goal / Done Condition) or F1C (aggregate /
 *     Source Role) — those imports are absent by design.
 *   - Never returns a forged or reconstructed candidate: the success result is the
 *     exact F1A builder object, which alone attests through
 *     `snapshotValidatedFormationSourceResult`; a clone would not.
 *
 * Determinism & scope (plan Sections 5–15):
 *   - Identity is composed from the provider-native workspace / channel / message
 *     timestamp ONLY — independent of title, summary, actor, assignee, channel
 *     name, and URL display text.
 *   - `messageAt` (not the `messageTs` identity field) is the timestamp authority;
 *     no ISO instant is ever derived from `messageTs`.
 *   - Natural-language (`L`) fields — Goal, Done Condition, Verifier, Acceptance
 *     Criteria, Decision Needed, unresolved-question semantics, authority /
 *     supersession, Source Role — are NOT invented: they are omitted. A
 *     `decision_request` / `thread_needs_reply` event NEVER becomes a decision or
 *     unresolved marker (plan Sections 11–12).
 *   - No grouping, ranking, membership, or projection. No LLM. No network access.
 *   - No infrastructure Slack event/mapper type is imported.
 */

import { buildFormationSourceCandidate, type FormationSourceStatus } from "../sourceContract.ts"
import { normalizeHost, parseProviderUrl, recognizeGitHubObjectPath } from "./providerUrl.ts"
import type { ProviderUrlRejection } from "./providerUrl.ts"
import { recognizeSlackPermalink } from "./slackUrl.ts"
import type {
  NormalizedSlackFormationInput,
  NormalizedSlackStatus,
  SlackExtractionConfig,
  SlackExtractionRejection,
  SlackFormationExtractionResult,
} from "./slackTypes.ts"

const PROVIDER = "slack" as const

const DEFAULT_GITHUB_HOSTS: readonly string[] = ["github.com"]

// Provider-native identity grammars (plan Section 7). Slack IDs are exact and
// case-sensitive: a `T`/`E` (workspace / enterprise) or `C`/`G`/`D` (channel /
// group / DM) prefix followed by uppercase ASCII alphanumerics. Lowercase,
// whitespace, delimiters, control/format characters, empty, and oversized values
// are all refused. IDs are NEVER lowercased or up-cased.
const SLACK_WORKSPACE_ID = /^[TE][A-Z0-9]{1,63}$/
const SLACK_CHANNEL_ID = /^[CGD][A-Z0-9]{1,63}$/
// Message timestamp: integer part (no leading zero, 10–13 digits) + six
// fractional digits. Kept as a STRING; never parsed as a number.
const SLACK_TIMESTAMP = /^[1-9][0-9]{9,12}\.[0-9]{6}$/

// Resource bound (plan Section 14): 1 primary source link + at most 49 referenced
// links == F1A's 50-link boundary. The normalized referenced-URL array is rejected
// BEFORE iteration when it exceeds this, so oversized input never drives unbounded
// parse/dedup work. A deterministic bound on the normalized contract.
const MAX_REFERENCED_URLS = 49

// Structured Slack source status → a single SOURCE status marker. This is a source
// status only; it never becomes a Done Condition status or an authority signal, and
// is never inferred from the event type, reactions, emoji, or message text.
const STATUS_TO_MARKER: Readonly<Record<NormalizedSlackStatus, FormationSourceStatus>> = {
  open: "open",
  in_review: "in_review",
  closed: "closed",
}

function mapUrlRejection(reason: ProviderUrlRejection): SlackExtractionRejection {
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

type ActorAssertion = { readonly name: string; readonly assertedRelation: "author" | "assignee" }
type ObjectRef = { readonly provider: "slack" | "github"; readonly sourceObjectId: string }
type SourceLink = { readonly url: string; readonly recognized?: ObjectRef }

/**
 * A validated, bijective workspace-host binding derived from the configuration.
 * `hostToWorkspace` recognizes referenced Slack permalinks by their host; the
 * configuration itself is never retained in the output (plan Section 6).
 */
type ResolvedSlackConfig = {
  readonly workspaceToHost: ReadonlyMap<string, string>
  readonly hostToWorkspace: ReadonlyMap<string, string>
  readonly githubHosts: ReadonlySet<string>
}

/**
 * Validate the workspace-host configuration into a bijection, fail-closed.
 *
 * Rejects an empty configuration, a malformed workspace ID or host entry, and any
 * ambiguity: one host mapping to two workspace IDs, or one workspace ID mapping to
 * two distinct hosts. Hosts are canonicalized with the shared `normalizeHost`
 * before comparison, so an IDN/case variant cannot smuggle a second mapping.
 */
function resolveSlackConfig(config: SlackExtractionConfig): ResolvedSlackConfig | null {
  if (!Array.isArray(config.workspaces) || config.workspaces.length === 0) return null

  const workspaceToHost = new Map<string, string>()
  const hostToWorkspace = new Map<string, string>()
  for (const entry of config.workspaces) {
    if (entry === null || typeof entry !== "object") return null
    const workspaceId = entry.workspaceId
    if (typeof workspaceId !== "string" || !SLACK_WORKSPACE_ID.test(workspaceId)) return null
    if (typeof entry.host !== "string") return null
    const host = normalizeHost(entry.host)
    if (host === null) return null

    const existingHost = workspaceToHost.get(workspaceId)
    if (existingHost !== undefined && existingHost !== host) return null // one workspace → two hosts
    const existingWorkspace = hostToWorkspace.get(host)
    if (existingWorkspace !== undefined && existingWorkspace !== workspaceId) return null // one host → two workspaces
    workspaceToHost.set(workspaceId, host)
    hostToWorkspace.set(host, workspaceId)
  }

  const githubHosts = new Set<string>()
  for (const entry of config.githubHosts ?? DEFAULT_GITHUB_HOSTS) {
    const normalized = normalizeHost(entry)
    if (normalized !== null) githubHosts.add(normalized)
  }

  return { workspaceToHost, hostToWorkspace, githubHosts }
}

/**
 * Extract a deterministic F1A source candidate from a normalized Slack event.
 *
 * Returns the exact F1A builder result on success (`{ ok: true, sourceResult }`)
 * or a small, content-free provider-extraction rejection on failure. Never mutates
 * `input` or `config`, never performs network access, and never invokes an LLM.
 */
export function extractSlackFormationSource(
  input: NormalizedSlackFormationInput,
  config: SlackExtractionConfig,
): SlackFormationExtractionResult {
  // ── Event type: validated and preserved (never collapsed, never authority) ──
  if (
    input.eventType !== "mention_request" &&
    input.eventType !== "thread_needs_reply" &&
    input.eventType !== "decision_request"
  ) {
    return { ok: false, reason: "event_type_unsupported" }
  }

  // ── Configuration: explicit, bijective workspace-host binding ──
  const resolved = resolveSlackConfig(config)
  if (resolved === null) return { ok: false, reason: "config_invalid" }

  const status = STATUS_TO_MARKER[input.sourceStatus]
  if (status === undefined) return { ok: false, reason: "identity_unsafe" }

  // ── Identity: provider-native workspace / channel / message ONLY (Section 8) ──
  if (
    !SLACK_WORKSPACE_ID.test(input.workspaceId) ||
    !SLACK_CHANNEL_ID.test(input.channelId) ||
    !SLACK_TIMESTAMP.test(input.messageTs)
  ) {
    return { ok: false, reason: "identity_unsafe" }
  }

  const isReply = input.threadRootTs !== undefined
  if (isReply) {
    const threadRootTs = input.threadRootTs as string
    // A thread root must be a valid, DISTINCT, and strictly-earlier timestamp than
    // the triggering reply: a reply and its root are separate source objects.
    if (
      !SLACK_TIMESTAMP.test(threadRootTs) ||
      threadRootTs === input.messageTs ||
      compareSlackTimestamp(threadRootTs, input.messageTs) >= 0
    ) {
      return { ok: false, reason: "identity_unsafe" }
    }
  }

  // ── Workspace must be configured with EXACTLY one host ──
  const host = resolved.workspaceToHost.get(input.workspaceId)
  if (host === undefined) return { ok: false, reason: "workspace_not_configured" }

  // ── Primary URL: host policy + sensitive screening via the shared F2A boundary.
  // The configured host is the sole allowlist, so host confusion / IDN / userinfo /
  // scheme / sensitive-value forms are all refused there and never fetched.
  const primary = parseProviderUrl(input.sourceUrl, [host])
  if (!primary.ok) return { ok: false, reason: mapUrlRejection(primary.reason) }

  // ── Primary-source identity coherence (Section 9): the permalink path must
  // identify the SAME provider-native channel/message as the structured identity.
  const permalink = recognizeSlackPermalink(primary.value.url)
  if (
    permalink === null ||
    permalink.channelId !== input.channelId ||
    permalink.messageTs !== input.messageTs
  ) {
    return { ok: false, reason: "primary_source_identity_mismatch" }
  }

  // ── Thread query coherence (Section 10): for a top-level message thread_ts and
  // cid must both be ABSENT; for a threaded reply thread_ts must equal threadRootTs
  // and cid must equal channelId. A URL is never accepted on its path alone.
  if (isReply) {
    if (permalink.threadTs !== input.threadRootTs || permalink.cid !== input.channelId) {
      return { ok: false, reason: "thread_identity_mismatch" }
    }
  } else if (permalink.threadTs !== undefined || permalink.cid !== undefined) {
    return { ok: false, reason: "thread_identity_mismatch" }
  }

  // ── Identity strings (Section 8). Never composed from title/summary/actor/
  // channel name/URL display text. `/`-separated to match the repository's house
  // identity form (cf. `github:owner/name#number`). ──
  const sourceObjectId = `${PROVIDER}:${input.workspaceId}/${input.channelId}/${input.messageTs}`
  const parentObjectId = isReply
    ? `${PROVIDER}:${input.workspaceId}/${input.channelId}/${input.threadRootTs as string}`
    : `${PROVIDER}:${input.workspaceId}/${input.channelId}`
  const externalId = `${input.channelId}:${input.messageTs}`
  const container = `${input.workspaceId}/${input.channelId}`
  const navigationTarget = primary.value.url

  // ── Actor assertions from structured actor/assignee (never authority) ──
  const actorAssertions: ActorAssertion[] = []
  if (input.actor !== undefined) actorAssertions.push({ name: input.actor, assertedRelation: "author" })
  if (input.assignee !== undefined) actorAssertions.push({ name: input.assignee, assertedRelation: "assignee" })

  // ── Timestamps from structured provider timestamps only. `messageAt` is the
  // occurred-at authority; `messageTs` is identity and is never turned into time. ──
  const occurredAt = input.messageAt
  const editedAt = input.updatedAt !== input.messageAt ? input.updatedAt : undefined
  const timestamps = {
    occurredAt,
    ...(editedAt !== undefined ? { editedAt } : {}),
    capturedAt: input.capturedAt,
  }

  // ── Source links + deterministically recognized references (Section 14) ──
  // Reject an oversized referenced-URL array BEFORE any iteration.
  const referencedUrls = input.referencedUrls ?? []
  if (referencedUrls.length > MAX_REFERENCED_URLS) {
    return { ok: false, reason: "referenced_urls_too_many" }
  }

  const sourceLinks: SourceLink[] = [{ url: primary.value.url }]
  const seenLinks = new Set<string>([primary.value.url])
  const referencedObjects: ObjectRef[] = []
  const seenRefs = new Set<string>()

  for (const rawUrl of referencedUrls) {
    // Any safe https host may be retained as an OPAQUE source link; only a
    // configured Slack workspace host (canonical permalink) or an allowed GitHub
    // host (object path) becomes a recognized reference. Unsafe, unparseable, or
    // sensitive-value-bearing referenced URLs are DROPPED WITHOUT ECHO
    // (`parseProviderUrl` refuses `sensitive_value`), never fetched.
    const safe = parseProviderUrl(rawUrl)
    if (!safe.ok) continue

    let recognized: ObjectRef | undefined
    const referencedWorkspace = resolved.hostToWorkspace.get(safe.value.hostname)
    if (referencedWorkspace !== undefined) {
      const slackRef = recognizeSlackPermalink(safe.value.url)
      if (slackRef !== null) {
        recognized = {
          provider: "slack",
          sourceObjectId: `${PROVIDER}:${referencedWorkspace}/${slackRef.channelId}/${slackRef.messageTs}`,
        }
      }
    } else if (resolved.githubHosts.has(safe.value.hostname)) {
      const githubRef = recognizeGitHubObjectPath(safe.value.pathname)
      if (githubRef !== null) {
        // Canonical (ASCII lowercase) GitHub identity per the merged F2A policy,
        // so a case variant dedupes to one identity.
        recognized = {
          provider: "github",
          sourceObjectId: `github:${githubRef.owner.toLowerCase()}/${githubRef.name.toLowerCase()}#${githubRef.number}`,
        }
      }
    }

    // Exact-string dedup for source links; canonical-identity dedup for referenced
    // objects; the primary object never lists itself as a reference.
    if (!seenLinks.has(safe.value.url)) {
      seenLinks.add(safe.value.url)
      sourceLinks.push(recognized !== undefined ? { url: safe.value.url, recognized } : { url: safe.value.url })
    }
    if (recognized !== undefined) {
      const key = `${recognized.provider} ${recognized.sourceObjectId}`
      if (recognized.sourceObjectId !== sourceObjectId && !seenRefs.has(key)) {
        seenRefs.add(key)
        referencedObjects.push(recognized)
      }
    }
  }

  // ── Construct ONLY the bounded F1A input (D fields; every L field omitted). ──
  // Derived fields (`extractionConfidence`, `candidateOnly`) are NOT supplied — F1A
  // derives them. No Goal, Done Condition, Source Role, decision/unresolved marker,
  // authority signal, supersession, grouping, or membership field appears here.
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
    statusMarkers: [status],
    navigationTarget,
  }

  // ── F1A handoff: serialize and call the REAL builder (plan Section 15). ──
  // The builder is the sole validation authority. Its exact returned object is
  // propagated on success so it attests through
  // `snapshotValidatedFormationSourceResult`; a clone would not.
  const result = buildFormationSourceCandidate(JSON.stringify(candidateInput))
  if (!result.ok) {
    return { ok: false, reason: "source_contract_rejected" }
  }
  return { ok: true, sourceResult: result }
}

/**
 * Compare two validated Slack timestamps (`<seconds>.<micros>`) numerically without
 * floating point: pad the integer part and compare the fixed-width digit strings.
 * Both arguments have already matched `SLACK_TIMESTAMP`. Returns <0, 0, or >0.
 */
function compareSlackTimestamp(a: string, b: string): number {
  const [aInt, aFrac] = a.split(".")
  const [bInt, bFrac] = b.split(".")
  if (aInt.length !== bInt.length) return aInt.length - bInt.length
  if (aInt !== bInt) return aInt < bInt ? -1 : 1
  if (aFrac === bFrac) return 0
  return aFrac < bFrac ? -1 : 1
}
