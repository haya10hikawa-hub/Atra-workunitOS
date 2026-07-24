/**
 * F2B — Slack deterministic extraction input/config/result contract.
 *
 * A small, CLOSED input type: only the normalized, structured fields required
 * for deterministic (`D`) extraction. Like the F2A GitHub contract it deliberately
 * cannot represent a live provider surface — there is no field for a Slack Web
 * API / Events API client, a workspace/bot/user token, a cookie, an authorization
 * header, a raw event body, blocks, attachments, files, or an arbitrary provider
 * payload. The extractor consumes THIS shape only, AFTER the existing
 * acquisition/normalization boundary.
 *
 * Trust boundary (plan Section 5):
 *   - F2B is a TRUSTED_NORMALIZED_INTERNAL_BOUNDARY and is UNWIRED. It makes no
 *     claim of arbitrary-runtime totality: a future live adapter must runtime-
 *     normalize a raw Slack event into this shape BEFORE calling F2B.
 *
 * Scope boundary (plan Sections 11–12):
 *   - No Goal, Done Condition, Verifier, Acceptance Criteria, Decision Needed,
 *     Source Role, authority, grouping, membership, ranking, or aggregate.
 *   - No natural-language (`L`) interpretation: fields requiring it are omitted.
 *   - The extractor's success output is the EXACT F1A builder result object; it
 *     never reconstructs the F1A success type.
 */

import type { FormationSourceContractResult } from "../sourceContract.ts"

/**
 * Normalized Slack event type. A closed union (never a raw provider string): the
 * normalization boundary maps a provider event onto exactly one of these. The
 * event type is validated and preserved; it NEVER implies authority, a Source
 * Role, a status, or a Decision Needed / unresolved marker (plan Sections 11–12).
 */
export type NormalizedSlackEventType = "mention_request" | "thread_needs_reply" | "decision_request"

/**
 * Normalized, structured Slack source status. A closed union — SOURCE status
 * markers only, never a Done Condition status and never inferred from the event
 * type, reactions, emoji, or message text (plan Section 11).
 */
export type NormalizedSlackStatus = "open" | "in_review" | "closed"

/**
 * The bounded, fixture-shaped normalized Slack event F2B accepts.
 *
 * Identity fields (`workspaceId`, `channelId`, `messageTs`, optional
 * `threadRootTs`) are provider-native and exact. `messageAt` is the timestamp
 * AUTHORITY (maps to `occurredAt`); `messageTs` is an IDENTITY field only and is
 * never turned into a timestamp. `capturedAt` is the acquisition/normalization
 * timestamp stamped by the boundary that produced this record. `channelName` is
 * an optional display label ONLY — it never participates in identity.
 */
export type NormalizedSlackFormationInput = {
  readonly eventType: NormalizedSlackEventType
  readonly workspaceId: string
  readonly channelId: string
  readonly channelName?: string
  readonly messageTs: string
  readonly threadRootTs?: string
  readonly title: string
  readonly summary: string
  readonly actor?: string
  readonly assignee?: string
  readonly sourceStatus: NormalizedSlackStatus
  readonly sourceUrl: string
  readonly capturedAt: string
  readonly messageAt: string
  readonly updatedAt: string
  readonly referencedUrls?: readonly string[]
}

/** One explicit workspace-ID ↔ Slack host binding. No default workspace exists. */
export type SlackWorkspaceHost = {
  readonly workspaceId: string
  readonly host: string
}

/**
 * Slack extraction configuration. Workspace hosts are supplied EXPLICITLY by the
 * trusted normalization boundary — provider identity is never inferred from a URL
 * substring and there is no default Slack workspace. The mapping must be a
 * bijection over the configured entries: one host maps to exactly one workspace ID
 * and one workspace ID maps to exactly one host (plan Section 6). GitHub Enterprise
 * hosts for referenced-link recognition are allowed ONLY through `githubHosts`;
 * when omitted, only `github.com` is trusted for references.
 */
export type SlackExtractionConfig = {
  readonly workspaces: readonly SlackWorkspaceHost[]
  readonly githubHosts?: readonly string[]
}

/**
 * Provider-extraction rejection categories. Deliberately carry NO echo of the
 * rejected input value, URL, host, query, fragment, token, or secret — every value
 * is a closed discriminator only. `source_contract_rejected` is opaque: it means
 * the F1A builder rejected the constructed candidate, without exposing the rejected
 * content or F1A's own finding detail.
 */
export type SlackExtractionRejection =
  | "source_contract_rejected"
  | "config_invalid"
  | "workspace_not_configured"
  | "event_type_unsupported"
  | "identity_unsafe"
  | "primary_source_identity_mismatch"
  | "thread_identity_mismatch"
  | "referenced_urls_too_many"
  | "source_url_not_string"
  | "source_url_too_long"
  | "source_url_unparseable"
  | "source_url_scheme_not_https"
  | "source_url_userinfo_present"
  | "source_url_empty_host"
  | "source_url_host_not_allowed"
  | "source_url_sensitive_value"

/**
 * On success, `sourceResult` is the EXACT object returned by
 * `buildFormationSourceCandidate` — the same identity that
 * `snapshotValidatedFormationSourceResult` attests. It is never a clone.
 */
export type SlackFormationExtractionResult =
  | {
      readonly ok: true
      readonly sourceResult: Extract<FormationSourceContractResult, { readonly ok: true }>
    }
  | {
      readonly ok: false
      readonly reason: SlackExtractionRejection
    }
