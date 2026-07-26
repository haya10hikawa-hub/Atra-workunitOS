/**
 * F2A — GitHub deterministic extraction input/result contract.
 *
 * A small, CLOSED input type: only the normalized, structured fields required
 * for deterministic (`D`) extraction. It deliberately cannot represent a live
 * provider surface — there is no field for an Octokit/GitHub API client, an
 * access token, a cookie, an authorization header, a raw webhook body, or an
 * arbitrary provider payload. The extractor consumes THIS shape only, after the
 * existing acquisition/normalization boundary.
 *
 * Scope boundary (plan Sections 4–6):
 *   - No Goal, no Done Condition, no Source Role, no aggregate, no grouping.
 *   - No natural-language (`L`) interpretation: fields requiring it are omitted.
 *   - The extractor's success output is the EXACT F1A builder result object; it
 *     never reconstructs the F1A success type.
 */

import type { FormationSourceContractResult } from "../sourceContract.ts"

export type NormalizedGitHubEventType = "pull_request" | "issue" | "review_requested"

/**
 * Normalized, structured GitHub state. A closed union (not a raw string): the
 * normalization boundary maps provider state onto these values, so extraction is
 * deterministic and cannot smuggle arbitrary provider text through `status`.
 * These are SOURCE status markers only — never Done Condition status.
 */
export type NormalizedGitHubStatus =
  | "open"
  | "draft"
  | "closed"
  | "merged"
  | "in_review"
  | "changes_requested"
  | "approved"

export type NormalizedGitHubRepository = {
  readonly owner: string
  readonly name: string
}

/**
 * The bounded, fixture-shaped normalized GitHub event F2A accepts.
 *
 * `capturedAt` is the acquisition/normalization timestamp stamped by the
 * boundary that produced this record (F1A requires it on both the source
 * reference and the timestamps). `updatedAt`/`createdAt` are the provider event
 * timestamps.
 */
export type NormalizedGitHubFormationInput = {
  readonly eventType: NormalizedGitHubEventType
  readonly repository: NormalizedGitHubRepository
  readonly number: number
  readonly title: string
  readonly summary: string
  readonly actor?: string
  readonly assignee?: string
  readonly status: NormalizedGitHubStatus
  readonly sourceUrl: string
  readonly capturedAt: string
  readonly updatedAt: string
  readonly createdAt?: string
  readonly referencedUrls?: readonly string[]
}

/**
 * Extraction configuration. GitHub Enterprise hosts are allowed ONLY through an
 * explicit allowlist here — provider identity is never inferred from a substring
 * of the URL. When omitted, only `github.com` is trusted.
 */
export type GitHubExtractionConfig = {
  readonly allowedHosts?: readonly string[]
}

/**
 * Provider-extraction rejection categories. Deliberately carry NO echo of the
 * rejected input value — every value is a closed discriminator only.
 * `source_contract_rejected` is opaque: it means the F1A builder rejected the
 * constructed candidate, without exposing the rejected content or F1A's own
 * finding detail.
 *
 * Remediation additions:
 *   - `primary_source_identity_mismatch` (B1): the primary URL does not identify
 *     the same provider-native object as the structured `repository`/`number`/
 *     `eventType`.
 *   - `source_url_sensitive_value` (B2): the primary URL carries credential-shaped
 *     material (the value itself is never echoed).
 *   - `referenced_urls_too_many` (resource bound): the normalized referenced-URL
 *     array exceeds the deterministic pre-iteration limit.
 */
export type GitHubExtractionRejection =
  | "source_contract_rejected"
  | "identity_unsafe"
  | "primary_source_identity_mismatch"
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
export type GitHubFormationExtractionResult =
  | {
      readonly ok: true
      readonly sourceResult: Extract<FormationSourceContractResult, { readonly ok: true }>
    }
  | {
      readonly ok: false
      readonly reason: GitHubExtractionRejection
    }
