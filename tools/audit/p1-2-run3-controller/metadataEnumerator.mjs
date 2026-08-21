/**
 * Read-only Gmail metadata-only enumerator for Run-3 selection.
 *
 * AUDIT-ONLY UTILITY. Not part of the Atra runtime.
 *
 * Emits ONLY `{message_id, internalDate}` per message — never subject,
 * sender, recipient, snippet, headers, body, RAW MIME, or attachments. This
 * is the metadata-only enumeration the P1_2_RUN3_GMAIL_METADATA_SELECTION_V1
 * rule (`selection.mjs`) consumes; it must never leak a semantic field into
 * that pipeline.
 *
 * Reuses the existing OAuth bearer-token resolution
 * (`resolveGmailBearerToken` from `gmailRaw.mjs`) rather than building a
 * second auth mechanism — this module never reads a credential env var or an
 * OAuth token file directly.
 *
 * ENUMERATION COMPLETENESS:
 *   - Paginates the `messages.list` endpoint until Gmail's `nextPageToken`
 *     pagination is exhausted (loop continues while a page returns a
 *     non-empty `nextPageToken`; a page with no `nextPageToken` field ends
 *     the loop, including the very first page).
 *   - Always sends `includeSpamTrash=true` — the Run-3 acquisition window is
 *     defined over the literal Gmail universe, not the default "not spam or
 *     trash" search scope.
 *   - `query` (if supplied) is a **recall-only prefilter**: it narrows what
 *     Gmail's search index returns for efficiency, but this module never
 *     trusts it for correctness. Final eligibility is always decided here,
 *     independently, from each message's own `internalDate` against the
 *     fixed observation window — a query that (incorrectly) excluded an
 *     eligible message would cause under-enumeration, not a false eligible
 *     result, and a query that included an ineligible message is filtered
 *     out by the window check regardless.
 *   - Uses `fields=` projection on both the list call
 *     (`nextPageToken,messages/id`) and the per-message metadata call
 *     (`id,internalDate`) — the only two fields this module ever reads off a
 *     Gmail response.
 *
 * @module p1-2-run3-controller/metadataEnumerator
 */

import { API_ORIGIN, resolveGmailBearerToken } from '../p1-2-gmail-raw-transport/gmailRaw.mjs';
import { V1_WINDOW_END_MS, V1_WINDOW_START_MS } from './selection.mjs';

export class MetadataEnumeratorError extends Error {
  constructor(code) {
    super(code);
    this.name = 'MetadataEnumeratorError';
    this.code = code;
  }
}

const REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_PAGE_SIZE = 500;
/** Enumeration must terminate even against a pathological/looping pageToken sequence. */
const MAX_PAGES = 10_000;

async function fetchJson(url, token, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'error',
      headers: { accept: 'application/json', authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new MetadataEnumeratorError('gmail_metadata_network_error');
  }
  if (response.status === 401) throw new MetadataEnumeratorError('gmail_metadata_unauthorized');
  if (response.status === 403) throw new MetadataEnumeratorError('gmail_metadata_forbidden');
  if (!response.ok) throw new MetadataEnumeratorError('gmail_metadata_http_error');
  try {
    return await response.json();
  } catch {
    throw new MetadataEnumeratorError('gmail_metadata_response_unrecognized');
  }
}

/**
 * One page of `messages.list`. Never requests more than `id` per message.
 */
async function listPage({ token, query, pageToken, pageSize, fetchImpl }) {
  const url = new URL('/gmail/v1/users/me/messages', `${API_ORIGIN}/`);
  url.searchParams.set('includeSpamTrash', 'true');
  url.searchParams.set('maxResults', String(pageSize));
  url.searchParams.set('fields', 'nextPageToken,messages/id');
  if (query) url.searchParams.set('q', query);
  if (pageToken) url.searchParams.set('pageToken', pageToken);
  if (url.origin !== API_ORIGIN) throw new MetadataEnumeratorError('gmail_metadata_request_invalid');
  return fetchJson(url, token, fetchImpl);
}

/**
 * Metadata (id + internalDate only) for a single message id.
 */
async function getMetadata({ token, messageId, fetchImpl }) {
  const url = new URL(`/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}`, `${API_ORIGIN}/`);
  url.searchParams.set('format', 'metadata');
  url.searchParams.set('fields', 'id,internalDate');
  if (url.origin !== API_ORIGIN) throw new MetadataEnumeratorError('gmail_metadata_request_invalid');
  const parsed = await fetchJson(url, token, fetchImpl);
  if (parsed === null || typeof parsed !== 'object' || typeof parsed.id !== 'string' || typeof parsed.internalDate !== 'string') {
    throw new MetadataEnumeratorError('gmail_metadata_response_unrecognized');
  }
  // The contract surface stops here: only `message_id` and `internalDate`
  // are ever copied out of a Gmail response object anywhere in this module.
  return Object.freeze({ message_id: parsed.id, internalDate: parsed.internalDate });
}

function isEligible(candidate, windowStartMs, windowEndMs) {
  const ms = Number(candidate.internalDate);
  return Number.isFinite(ms) && ms >= windowStartMs && ms <= windowEndMs;
}

/**
 * Enumerates every message id in the Gmail mailbox (via paginated
 * `messages.list`, `includeSpamTrash=true`, optional recall-only `query`),
 * then fetches `{id, internalDate}` for each one and applies final
 * eligibility against the fixed Run-3 observation window.
 *
 * @param {{
 *   env: Record<string, string | undefined>,
 *   query?: string,
 *   pageSize?: number,
 *   windowStartMs?: number,
 *   windowEndMs?: number,
 *   fetchImpl?: typeof fetch,
 * }} input
 * @returns {Promise<Readonly<{
 *   candidates: ReadonlyArray<Readonly<{message_id: string, internalDate: string}>>,
 *   eligible: ReadonlyArray<Readonly<{message_id: string, internalDate: string}>>,
 *   pageCount: number,
 * }>>}
 */
export async function enumerateGmailMetadata({
  env,
  query,
  pageSize = DEFAULT_PAGE_SIZE,
  windowStartMs = V1_WINDOW_START_MS,
  windowEndMs = V1_WINDOW_END_MS,
  fetchImpl = globalThis.fetch,
} = {}) {
  const token = await resolveGmailBearerToken(env);

  const messageIds = [];
  let pageToken;
  let pageCount = 0;
  do {
    if (pageCount >= MAX_PAGES) throw new MetadataEnumeratorError('gmail_metadata_pagination_runaway');
    const page = await listPage({ token, query, pageToken, pageSize, fetchImpl });
    pageCount += 1;
    const messages = Array.isArray(page?.messages) ? page.messages : [];
    for (const m of messages) {
      if (m && typeof m.id === 'string' && m.id.length > 0) messageIds.push(m.id);
    }
    pageToken = typeof page?.nextPageToken === 'string' && page.nextPageToken.length > 0 ? page.nextPageToken : undefined;
  } while (pageToken);

  const candidates = [];
  const seen = new Set();
  for (const messageId of messageIds) {
    // The list endpoint can repeat an id — within one page or across pages —
    // under concurrent mailbox mutation. That is exactly the situation that
    // must FAIL, not be silently absorbed: a silent dedup here would let a
    // duplicate provider identity reach `selection.mjs` as an invisibly
    // reweighted universe (one physical message effectively counted once for
    // eligibility purposes but a duplicate id could still race a legitimate
    // second enumeration pass, or mask a provider bug). This module fails
    // closed the instant a repeat id is seen — before a second metadata call
    // is ever issued for it — rather than deduplicating and continuing.
    if (seen.has(messageId)) {
      throw new MetadataEnumeratorError('P1_2_RUN3_GMAIL_DUPLICATE_PROVIDER_IDENTITY');
    }
    seen.add(messageId);
    candidates.push(await getMetadata({ token, messageId, fetchImpl }));
  }

  const eligible = Object.freeze(candidates.filter((c) => isEligible(c, windowStartMs, windowEndMs)));

  return Object.freeze({ candidates: Object.freeze([...candidates]), eligible, pageCount });
}
