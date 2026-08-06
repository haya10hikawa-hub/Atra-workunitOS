/**
 * Dashboard Inbox refresh transport.
 *
 * The ONLY module that issues `POST /api/workunit/inbox/refresh`. It decides no
 * policy: it turns exactly one HTTP attempt into a three-way transport union and
 * lets `inboxRefreshStateModel` decide what the user is told.
 *
 * `verified_success` is produced ONLY for a strict success envelope carrying a
 * non-negative safe-integer `refreshed`; `safe_error` ONLY for a strict safeError
 * envelope. EVERYTHING else — a rejected fetch, an unreadable body, an invalid
 * count, a 5xx whose body is not this envelope — is `indeterminate`, because none
 * of those proves that no row was written. That distinction is load-bearing: the
 * write loop reached from `refreshInbox` has no try/catch, so an `upsert` exception
 * escapes the handler unhandled and the framework 500 it produces is
 * POST-WRITE-POSSIBLE. Calling that a known failure would let the UI assert
 * "Nothing was changed" when rows may in fact exist. This is therefore a
 * positive-proof test, not a deny-list: an unproven shape is never treated as safe.
 */

/** The one source the dashboard projects, and therefore the one it refreshes. */
export const DASHBOARD_INBOX_SOURCE = "all"

/** The single URL this module may ever request. */
export const DASHBOARD_INBOX_REFRESH_PATH = "/api/workunit/inbox/refresh"

/** Route step 18 returns exactly this status on success. */
const REFRESH_SUCCESS_STATUS = 200

export type InboxRefreshTransportResult =
  | { kind: "verified_success"; refreshed: number }
  | { kind: "safe_error"; status: number; code: string }
  | { kind: "indeterminate" }

const INDETERMINATE = { kind: "indeterminate" } as const

export async function requestInboxRefresh(
  options: { source?: string } = {},
  fetchImpl: typeof fetch = fetch,
): Promise<InboxRefreshTransportResult> {
  const source = options.source ?? DASHBOARD_INBOX_SOURCE

  let response: Response
  try {
    response = await fetchImpl(DASHBOARD_INBOX_REFRESH_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source }),
    })
  } catch {
    // The request may or may not have reached the server. Nothing is provable.
    return INDETERMINATE
  }
  if (!response || typeof response.status !== "number") return INDETERMINATE

  let body: unknown
  try {
    body = await response.json()
  } catch {
    return INDETERMINATE
  }
  if (!isPlainRecord(body)) return INDETERMINATE

  if (response.status === REFRESH_SUCCESS_STATUS) {
    const refreshed = body.refreshed
    if (!hasExactKeys(body, ["ok", "requestId", "refreshed", "source"])) return INDETERMINATE
    if (body.ok !== true || typeof body.requestId !== "string") return INDETERMINATE
    if (typeof refreshed !== "number" || !Number.isSafeInteger(refreshed) || refreshed < 0) return INDETERMINATE
    return { kind: "verified_success", refreshed }
  }

  // A strict safeError envelope. Whether the pair is a PROVEN pre-write failure is
  // decided by the model's frozen matrix; an unlisted code can never match a row
  // and therefore lands in the indeterminate state, which is the fail-safe way.
  if (!hasExactKeys(body, ["ok", "requestId", "error"])) return INDETERMINATE
  if (body.ok !== false || typeof body.requestId !== "string" || typeof body.error !== "string") return INDETERMINATE
  return { kind: "safe_error", status: response.status, code: body.error }
}

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const hasExactKeys = (record: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(record).length === keys.length && keys.every((key) => Object.hasOwn(record, key))
