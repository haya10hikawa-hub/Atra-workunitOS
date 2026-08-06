/**
 * Inbox refresh state model — pure, dependency-free, no React, no fetch, no env.
 *
 * This module is the boundary that guarantees three things:
 *   1. no server-supplied string ever reaches the DOM (only fixed copy does);
 *   2. `SUCCESS`/`EMPTY` cannot be produced before the projection was re-read;
 *   3. an outcome the client cannot prove is never described as a known no-write.
 *
 * PRE-WRITE PROOF (from `app/api/workunit/inbox/refresh/route.ts` at e29f08cc).
 * Every `errorResponse(...)` the handler emits is at line 46, 59, 64, 79, 90, 97,
 * 102, 109, 116, 129 or 139; the sole call to `refreshInbox` — the only path that
 * can write — is at line 133.
 *   - Lines 46-129 are lexically BEFORE line 133, so no `upsert` can have run.
 *   - Line 139 is after 133 but fires only when `refreshInbox` returned `{ok:false}`,
 *     whose single producer is the catch around `resolveInboxSignals`, which PRECEDES
 *     the write loop. So it is pre-write too.
 *   - There is NO `errorResponse` after the write loop and NO try/catch around it: an
 *     `upsert` exception escapes unhandled and the framework's 500 is not a safeError
 *     envelope. That response is POST-WRITE-POSSIBLE and must never be classified here
 *     as a known failure.
 * The matrix below therefore enumerates only proven pre-write pairs; everything else
 * falls to `MATERIALIZATION_OUTCOME_UNKNOWN`.
 */

import type { InboxRefreshTransportResult } from "./dashboardInboxRefreshClient"

export type InboxRefreshState =
  | "IDLE" | "REFRESHING" | "SUCCESS" | "EMPTY"
  | "MATERIALIZED_RELOAD_FAILED" | "MATERIALIZATION_OUTCOME_UNKNOWN"
  | "UNAUTHORIZED" | "FORBIDDEN" | "RATE_LIMITED" | "PROVIDER_UNAVAILABLE" | "INTERNAL_FAILURE"

export type InboxRefreshTone = "neutral" | "busy" | "success" | "caution" | "indeterminate" | "error"

/** States reachable from a PROVEN pre-write rejection. */
export type KnownPreWriteFailureState =
  | "UNAUTHORIZED" | "FORBIDDEN" | "RATE_LIMITED" | "PROVIDER_UNAVAILABLE" | "INTERNAL_FAILURE"

/**
 * Stage 1. `SUCCESS` and `EMPTY` are deliberately NOT inhabitants of this type —
 * they are structurally unreachable until the projection has actually been re-read.
 */
export type RefreshStage1Outcome =
  | { reload: true; refreshed: number }
  | { reload: false; state: KnownPreWriteFailureState | "MATERIALIZATION_OUTCOME_UNKNOWN" }

/** Stage 2 — the ONLY producer of `SUCCESS`/`EMPTY`/`MATERIALIZED_RELOAD_FAILED`. */
export type ProjectionReloadOutcome = { state: "SUCCESS" | "EMPTY" | "MATERIALIZED_RELOAD_FAILED"; applyRows: boolean }

export type KnownPreWriteFailure = { status: number; code: string; state: KnownPreWriteFailureState }

/**
 * The closed allowlist of proven pre-write `(status, code)` pairs.
 *
 * `tenant_boundary_violation` is deliberately absent: this route cannot emit it
 * (`resolveRouteRepositories` maps `tenant_forbidden` to `forbidden`/403 and every
 * other failure to `integration_missing`/503). Were it ever to appear it would
 * miss the matrix and land in the unknown state — the fail-safe direction.
 * There is NO wildcard 5xx row, and `INTERNAL_FAILURE` is NOT a catch-all.
 */
export const KNOWN_PRE_WRITE_FAILURES: readonly KnownPreWriteFailure[] = Object.freeze([
  { status: 401, code: "unauthorized", state: "UNAUTHORIZED" },
  { status: 403, code: "forbidden", state: "FORBIDDEN" },
  { status: 403, code: "csrf_failed", state: "FORBIDDEN" },
  { status: 403, code: "invalid_origin", state: "FORBIDDEN" },
  { status: 429, code: "rate_limited", state: "RATE_LIMITED" },
  { status: 503, code: "integration_missing", state: "PROVIDER_UNAVAILABLE" },
  { status: 400, code: "invalid_request", state: "INTERNAL_FAILURE" },
  { status: 413, code: "invalid_request", state: "INTERNAL_FAILURE" },
  { status: 405, code: "invalid_request", state: "INTERNAL_FAILURE" },
  { status: 500, code: "unauthorized", state: "INTERNAL_FAILURE" },
] as const)

/** Rendered above the control in every one of the eleven states. */
export const REFRESH_PROVENANCE =
  "Source: built-in mock fixtures. No external provider is contacted, read or written."

export const REFRESH_BUTTON_LABEL = "Refresh (mock data)"

/**
 * Copy table. An entry is a plain string OR a function of the verified count.
 * `MATERIALIZATION_OUTCOME_UNKNOWN` is a plain string BY CONSTRUCTION, so no count
 * can be rendered there even by a later careless edit — there is no count to tell
 * the truth with, and a stale or fabricated one would be a false claim.
 */
const REFRESH_COPY: Record<InboxRefreshState, { tone: InboxRefreshTone; text: string | ((refreshed: number) => string) }> = {
  IDLE: { tone: "neutral", text: "Not yet refreshed this session." },
  REFRESHING: { tone: "busy", text: "Refreshing…" },
  SUCCESS: { tone: "success", text: (n) => `Materialized ${n} mock WorkUnit rows. The list was re-read from the server.` },
  EMPTY: { tone: "neutral", text: "Refresh completed. No mock WorkUnit rows were materialized. The list was re-read from the server." },
  MATERIALIZED_RELOAD_FAILED: {
    tone: "caution",
    text: (n) => `Materialized ${n} mock WorkUnit rows, but the list could not be re-read. The existing rows are still shown. Reload the page to re-read the list.`,
  },
  MATERIALIZATION_OUTCOME_UNKNOWN: {
    tone: "indeterminate",
    text: "The refresh result could not be confirmed. Some mock WorkUnit rows may have been materialized. The existing rows are still shown. Reload the page before trying again.",
  },
  UNAUTHORIZED: { tone: "error", text: "You are not signed in. Refresh was not performed." },
  FORBIDDEN: { tone: "error", text: "The server refused this refresh. Your account may not be allowed to refresh this workspace." },
  RATE_LIMITED: { tone: "error", text: "Too many refreshes. Wait a moment and try again." },
  PROVIDER_UNAVAILABLE: { tone: "error", text: "The mock provider source could not be read. Nothing was changed." },
  INTERNAL_FAILURE: { tone: "error", text: "Refresh could not be completed. Nothing was changed." },
}

/**
 * Stage 1 — three disjoint outcomes. Only `{reload:true}` may proceed to a GET.
 */
export function classifyRefreshResponse(result: InboxRefreshTransportResult): RefreshStage1Outcome {
  if (result.kind === "verified_success") return { reload: true, refreshed: result.refreshed }
  if (result.kind === "safe_error") {
    const row = KNOWN_PRE_WRITE_FAILURES.find(
      (candidate) => candidate.status === result.status && candidate.code === result.code,
    )
    if (row) return { reload: false, state: row.state }
  }
  return { reload: false, state: "MATERIALIZATION_OUTCOME_UNKNOWN" }
}

/**
 * Stage 2 — reached ONLY after a verified POST success and exactly one projection
 * GET. `reloadOk` has already collapsed `{ok:false}`, rejection and an unreadable
 * body to a boolean, so no server string can travel further.
 */
export function classifyProjectionReload(reloadOk: boolean, refreshed: number): ProjectionReloadOutcome {
  if (!reloadOk) return { state: "MATERIALIZED_RELOAD_FAILED", applyRows: false }
  return { state: refreshed > 0 ? "SUCCESS" : "EMPTY", applyRows: true }
}

export function canSubmitRefresh(state: InboxRefreshState): boolean {
  return state !== "REFRESHING"
}

export function refreshCopy(state: InboxRefreshState, refreshed?: number): { copy: string; tone: InboxRefreshTone } {
  const entry = REFRESH_COPY[state]
  const copy = typeof entry.text === "string" ? entry.text : entry.text(refreshed ?? 0)
  return { copy, tone: entry.tone }
}
