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

/** The two states whose copy makes a quantitative claim, and therefore needs a count. */
export type CountBearingRefreshState = "SUCCESS" | "MATERIALIZED_RELOAD_FAILED"

/**
 * The ONE value the dashboard holds and the control renders. A count-bearing state cannot be
 * written down without its verified count, so `SUCCESS` with no count is not expressible.
 */
export type InboxRefreshPresentation =
  | { state: CountBearingRefreshState; refreshed: number }
  | { state: Exclude<InboxRefreshState, CountBearingRefreshState> }

/** Stage 2 — the ONLY producer of `SUCCESS`/`EMPTY`/`MATERIALIZED_RELOAD_FAILED`, and a presentation in its own right. */
export type ProjectionReloadOutcome =
  | { state: "SUCCESS"; refreshed: number; applyRows: true }
  | { state: "EMPTY"; applyRows: true }
  | { state: "MATERIALIZED_RELOAD_FAILED"; refreshed: number; applyRows: false }

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
 * Copy table. The entry type is DERIVED FROM the state: a count-bearing state's entry is
 * a function of the verified count, and every other state's entry is a plain string. That
 * mapping is what lets `refreshCopy` pick a branch from the discriminant alone, with no
 * cast and no default count. `MATERIALIZATION_OUTCOME_UNKNOWN` is a plain string BY
 * CONSTRUCTION, so no count can be rendered there even by a later careless edit — there is
 * no count to tell the truth with, and a stale or fabricated one would be a false claim.
 */
type RefreshCopyTable = {
  [S in InboxRefreshState]: {
    tone: InboxRefreshTone
    text: S extends CountBearingRefreshState ? (refreshed: number) => string : string
  }
}

const REFRESH_COPY: RefreshCopyTable = {
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
  if (!reloadOk) return { state: "MATERIALIZED_RELOAD_FAILED", refreshed, applyRows: false }
  if (refreshed > 0) return { state: "SUCCESS", refreshed, applyRows: true }
  return { state: "EMPTY", applyRows: true }
}

export function canSubmitRefresh(state: InboxRefreshState): boolean {
  return state !== "REFRESHING"
}

/** `SUCCESS` claims rows were materialized, so its count must be at least one. */
const MINIMUM_RENDERABLE_COUNT: Record<CountBearingRefreshState, number> = { SUCCESS: 1, MATERIALIZED_RELOAD_FAILED: 0 }

/** The truthful outcome every unprovable presentation degrades to. Frozen: it is returned by reference. */
const UNKNOWN_PRESENTATION: InboxRefreshPresentation = Object.freeze({ state: "MATERIALIZATION_OUTCOME_UNKNOWN" })

/**
 * EXACT, own-only state recognition. `state in table` was the defect: `in` walks the
 * prototype chain, so `toString`, `__proto__`, `constructor`, `valueOf` and
 * `hasOwnProperty` all answered `true` and reached the copy lookup. `Object.keys`
 * yields own enumerable keys only, and `Set.has` is exact — an inherited name can
 * never be recognized, and the set cannot drift from the copy table it is built from.
 */
const RECOGNIZED_STATES: ReadonlySet<string> = new Set(Object.keys(REFRESH_COPY))

const isRecognizedState = (value: unknown): value is InboxRefreshState =>
  typeof value === "string" && RECOGNIZED_STATES.has(value)

/** Explicit equality, never membership: the two states whose copy needs a verified count. */
const isCountBearing = (state: InboxRefreshState): state is CountBearingRefreshState =>
  state === "SUCCESS" || state === "MATERIALIZED_RELOAD_FAILED"

/**
 * The runtime fail-closed boundary. The type above makes an absent count unrepresentable,
 * but types are erased: a JavaScript caller, a cast or a later refactor can still hand this
 * module `SUCCESS` with nothing to count, an unrecognized state name, a getter that throws,
 * or a Proxy that answers differently on each read. There is no honest number to print then
 * — `0` is a specific false claim, indistinguishable from a genuine `EMPTY` — so every such
 * input degrades to the truthful unknown-outcome state, whose copy is count-free by
 * construction. A freshly built value is returned, so a stray count cannot reach the copy.
 *
 * Never throws, echoes nothing. That contract is enforced three ways, not asserted:
 *   - the WHOLE read-and-validate body sits inside one try/catch, so a throwing accessor or
 *     Proxy trap becomes the unknown outcome instead of an exception on the render path;
 *   - `state` and `refreshed` are each read EXACTLY ONCE into a local, so a value that
 *     changes between reads cannot be validated as one thing and rendered as another;
 *   - nothing derived from the input reaches the returned value except a recognized state
 *     and a validated safe integer.
 */
function normalizePresentation(presentation: InboxRefreshPresentation): InboxRefreshPresentation {
  try {
    const state: unknown = (presentation as { state?: unknown } | null | undefined)?.state
    if (!isRecognizedState(state)) return UNKNOWN_PRESENTATION
    if (!isCountBearing(state)) return { state }
    const refreshed: unknown = (presentation as { refreshed?: unknown }).refreshed
    if (typeof refreshed !== "number" || !Number.isSafeInteger(refreshed) || refreshed < MINIMUM_RENDERABLE_COUNT[state]) return UNKNOWN_PRESENTATION
    return { state, refreshed }
  } catch {
    // A throwing accessor or Proxy trap proves nothing about the outcome, and its message
    // is caller-controlled text. Neither is rethrown, logged or rendered.
    return UNKNOWN_PRESENTATION
  }
}

/**
 * Returns the normalized state alongside its copy so the control renders from ONE reading
 * of the presentation: the render path never touches `presentation.state` itself.
 */
export function refreshCopy(presentation: InboxRefreshPresentation): { state: InboxRefreshState; copy: string; tone: InboxRefreshTone } {
  const normalized = normalizePresentation(presentation)
  // The discriminant alone selects the branch. `RefreshCopyTable` derives the entry type
  // from the state, so the count-bearing branch gets a function and every other branch a
  // string — no cast, no unchecked index, and no default count to fabricate.
  if (normalized.state === "SUCCESS" || normalized.state === "MATERIALIZED_RELOAD_FAILED") {
    const entry = REFRESH_COPY[normalized.state]
    return { state: normalized.state, copy: entry.text(normalized.refreshed), tone: entry.tone }
  }
  const entry = REFRESH_COPY[normalized.state]
  return { state: normalized.state, copy: entry.text, tone: entry.tone }
}
