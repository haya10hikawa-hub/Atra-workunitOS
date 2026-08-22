/**
 * Content-free Gmail auth/profile health check.
 *
 * AUDIT-ONLY UTILITY. Not part of the Atra runtime.
 *
 * Calls `users/me/profile`, which returns the operator's own mailbox
 * identity and counts — not participant content — but this module discards
 * that body regardless and returns only a boolean + stable reason code. It
 * never fetches a message and never touches `format=raw`.
 *
 * @module p1-2-gmail-raw-transport/authPreflight
 */

import { API_ORIGIN, CREDENTIAL_ENV, GmailTransportError, resolveGmailBearerToken } from './gmailRaw.mjs';
import { GmailOAuthError } from './oauthCredential.mjs';

const REQUEST_TIMEOUT_MS = 15_000;

/**
 * @param {{env: Record<string, string|undefined>}} input
 * @returns {Promise<Readonly<{available: boolean, reason_code: string|null}>>}
 */
export async function checkGmailAuth({ env } = {}) {
  let token;
  try {
    token = await resolveGmailBearerToken(env);
  } catch (error) {
    const code = error instanceof GmailTransportError || error instanceof GmailOAuthError ? error.code : 'internal_error';
    return Object.freeze({ available: false, reason_code: code });
  }

  const url = new URL('/gmail/v1/users/me/profile', `${API_ORIGIN}/`);
  if (url.origin !== API_ORIGIN) return Object.freeze({ available: false, reason_code: 'gmail_raw_request_invalid' });

  let response;
  try {
    response = await globalThis.fetch(url, {
      method: 'GET',
      redirect: 'error',
      headers: { accept: 'application/json', authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return Object.freeze({ available: false, reason_code: 'gmail_raw_network_error' });
  }

  if (response.status === 401) return Object.freeze({ available: false, reason_code: 'gmail_raw_unauthorized' });
  if (response.status === 403) return Object.freeze({ available: false, reason_code: 'gmail_raw_forbidden' });
  if (!response.ok) return Object.freeze({ available: false, reason_code: 'gmail_raw_http_error' });

  // Body is discarded unread beyond the ok check — profile fields (mailbox
  // address, message counts) never leave this function.
  return Object.freeze({ available: true, reason_code: null });
}

export { CREDENTIAL_ENV };
