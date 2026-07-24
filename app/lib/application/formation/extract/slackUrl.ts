/**
 * F2B — Slack permalink recognition (provider-native URL path/query policy).
 *
 * Deterministic, pure, and NETWORK-FREE recognition of a Slack message
 * permalink. This module never fetches, resolves, or connects to any URL — it
 * only parses and classifies a string.
 *
 * It lives beside — and never modifies — the merged F2A shared URL boundary
 * (`./providerUrl.ts`): host/scheme/userinfo/sensitive screening stays there and
 * is reused unchanged. This module adds ONLY the Slack-specific path and query
 * grammar, so the shared GitHub URL policy is not weakened, duplicated, or
 * shadowed (plan Section 9; recovery Section 8 keeps `providerUrl.ts` read-only).
 *
 * Canonical Slack message permalink (plan Sections 9–10):
 *   path : /archives/<channelId>/p<messageTs-without-dot>
 *   query: thread_ts (optional) — the thread root timestamp
 *          cid       (optional) — the channel ID
 * A recognized permalink exposes its EXACT provider-native channel/message
 * identity plus the raw thread_ts/cid query values; the caller (`slack.ts`) is
 * the sole authority on whether those cohere with the normalized event identity.
 * Host trust is the caller's responsibility (via `parseProviderUrl`); this only
 * parses the path/query shape.
 */

// Slack channel ID: C (public channel), G (private group), or D (direct message)
// prefix followed by uppercase ASCII alphanumerics. Never lowercased; a lowercase
// or otherwise malformed segment (e.g. a channel NAME) does not match and the
// permalink is refused (plan Section 7).
const SLACK_CHANNEL_ID = /^[CGD][A-Z0-9]{1,63}$/

// Slack message timestamp: an integer part with no leading zero (10–13 digits)
// and exactly six fractional digits. Kept as a STRING — Slack timestamps are
// identity, never a number (plan Section 7).
const SLACK_TIMESTAMP = /^[1-9][0-9]{9,12}\.[0-9]{6}$/

// The canonical permalink path. The `p<digits>` component is the message
// timestamp with the dot removed: 10–13 integer digits (first non-zero) followed
// by six fractional digits == 16–19 digits total. A trailing slash, an extra
// path segment (subresource), an encoded slash (`%2F` stays literal in a WHATWG
// pathname and breaks the segment), or a `..` traversal (normalized away by the
// URL parser) all fail this exact match.
const SLACK_PERMALINK_PATH = /^\/archives\/([CGD][A-Z0-9]{1,63})\/p([1-9][0-9]{15,18})$/

export type RecognizedSlackPermalink = {
  /** Provider-native channel ID from the path (exact, never lowercased). */
  readonly channelId: string
  /** Provider-native message timestamp reconstructed from the path (`p<digits>`). */
  readonly messageTs: string
  /** Raw `thread_ts` query value, or `undefined` when absent. */
  readonly threadTs: string | undefined
  /** Raw `cid` query value, or `undefined` when absent. */
  readonly cid: string | undefined
}

/**
 * Recognize a Slack message permalink from a URL string.
 *
 * Returns the exact channel/message identity and the raw thread_ts/cid query
 * values, or `null` for anything that is not exactly a canonical Slack message
 * permalink. Structural incoherence is refused here (unparseable URL, wrong path
 * shape, a query key other than thread_ts/cid, a duplicated thread_ts/cid, or any
 * non-empty fragment); VALUE coherence against the normalized event identity is
 * decided by the caller. Never fetches, never mutates, executes no getters.
 */
export function recognizeSlackPermalink(value: string): RecognizedSlackPermalink | null {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return null
  }

  // Any fragment at all is refused: a canonical message permalink carries none.
  if (parsed.hash !== "") return null

  const pathMatch = SLACK_PERMALINK_PATH.exec(parsed.pathname)
  if (pathMatch === null) return null
  const channelId = pathMatch[1]
  const digits = pathMatch[2]
  const messageTs = `${digits.slice(0, -6)}.${digits.slice(-6)}`
  if (!SLACK_CHANNEL_ID.test(channelId) || !SLACK_TIMESTAMP.test(messageTs)) return null

  // Only thread_ts and cid may appear, each at most once. An unexpected key or a
  // duplicated key refuses the whole permalink (never silently dropped/rewritten).
  for (const key of parsed.searchParams.keys()) {
    if (key !== "thread_ts" && key !== "cid") return null
  }
  const threadValues = parsed.searchParams.getAll("thread_ts")
  const cidValues = parsed.searchParams.getAll("cid")
  if (threadValues.length > 1 || cidValues.length > 1) return null

  return {
    channelId,
    messageTs,
    threadTs: threadValues.length === 1 ? threadValues[0] : undefined,
    cid: cidValues.length === 1 ? cidValues[0] : undefined,
  }
}
