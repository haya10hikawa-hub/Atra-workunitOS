/**
 * Gmail RAW read-only live transport — non-model byte-preserving conduit.
 *
 * AUDIT-ONLY UTILITY. Not part of the Atra runtime.
 *
 * Exists to close the gap the Run-2 canary found: a model that reads a Gmail
 * RAW payload through its own context and retypes it back out can corrupt a
 * single byte while preserving length, and a self-consistent hash of the
 * retyped bytes will certify the corruption as authentic. This module never
 * lets that happen, structurally — it is a subprocess that fetches, decodes,
 * hashes and writes in one uninterrupted run with no step that returns the
 * decoded bytes to a caller. The only thing that ever crosses back to a
 * caller (CLI stdout, a calling script) is the seven-field content-free
 * result from `acquireGmailRawMessage`: message id, byte length, two hex
 * digests, and a boolean.
 *
 * READ-ONLY BY CONSTRUCTION:
 *   - `fetchRawMessage` is the only function that calls `fetch`, and it
 *     hardcodes `method: 'GET'` and `format=raw`. There is no body
 *     parameter and no other call site.
 *   - The origin is a pinned constant, re-asserted after URL construction,
 *     and redirects are an error.
 *
 * BYTE FIDELITY BY CONSTRUCTION:
 *   - The provider digest is computed from the decoded bytes immediately
 *     after decode, before any write.
 *   - The persisted digest is computed from an independent reopen + read of
 *     the file just written — never from the in-memory buffer a second time.
 *     A bug that wrote the wrong buffer, or a disk that silently truncated
 *     it, is caught the same way a retyped byte would be.
 *   - `writeBytesDurable` uses `wx` (create, fail if exists) so a destination
 *     can never be silently overwritten, and fsyncs before close so a crash
 *     immediately after cannot leave an unflushed partial file registered as
 *     complete.
 *
 * @module p1-2-gmail-raw-transport/gmailRaw
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export class GmailTransportError extends Error {
  constructor(code) {
    super(code);
    this.name = 'GmailTransportError';
    this.code = code;
  }
}

/** Pinned. There is no environment variable or config field that redirects this. */
export const API_ORIGIN = 'https://gmail.googleapis.com';
const USER_AGENT = 'atra-p1-2-gmail-raw-transport/1 (read-only)';
const REQUEST_TIMEOUT_MS = 15_000;
/** A single Gmail message, RAW + base64url overhead, bounded generously. */
const MAX_RESPONSE_BYTES = 64 * 1024 * 1024;

export const CREDENTIAL_ENV = 'ATRA_P1_2_GMAIL_TOKEN';
export const ROOT_ENV = 'ATRA_P1_2_GMAIL_RAW_ROOT';
/** No whitespace, no control bytes: a token is going into a header verbatim. */
const TOKEN_RE = /^[A-Za-z0-9_.\-/]{20,2048}$/;
const MESSAGE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** Read the operator's read-only-scoped credential. Never returned or logged. */
export function readCredential(env) {
  const token = env?.[CREDENTIAL_ENV];
  if (typeof token !== 'string' || token.length === 0) {
    throw new GmailTransportError('gmail_raw_credential_not_configured');
  }
  if (!TOKEN_RE.test(token)) throw new GmailTransportError('gmail_raw_credential_invalid');
  return token;
}

/**
 * Decode Gmail's `raw` field (RFC 4648 base64url, no model in the loop).
 * Validates the alphabet before decoding so a malformed field fails closed
 * rather than silently decoding to truncated or wrong bytes.
 */
export function decodeBase64Url(value) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new GmailTransportError('gmail_raw_field_missing');
  }
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new GmailTransportError('gmail_raw_field_malformed');
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.length === 0) throw new GmailTransportError('gmail_raw_field_malformed');
  return bytes;
}

export function sha256Hex(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Write bytes to `destPath` and fsync before returning. `wx` refuses to
 * overwrite an existing file — re-acquiring into the same destination is a
 * caller bug, not a retry to paper over.
 */
export function writeBytesDurable(destPath, buffer) {
  let fd;
  try {
    fd = fs.openSync(destPath, 'wx', 0o600);
  } catch (error) {
    if (error && error.code === 'EEXIST') throw new GmailTransportError('gmail_raw_destination_exists');
    throw new GmailTransportError('gmail_raw_write_failed');
  }
  try {
    let written = 0;
    while (written < buffer.length) {
      written += fs.writeSync(fd, buffer, written, buffer.length - written);
    }
    fs.fsyncSync(fd);
  } catch {
    throw new GmailTransportError('gmail_raw_write_failed');
  } finally {
    fs.closeSync(fd);
  }
}

/** Independent reopen + read. Never reuses the buffer that was written. */
export function readBytesDurable(destPath) {
  const fd = fs.openSync(destPath, 'r');
  try {
    const stat = fs.fstatSync(fd);
    const out = Buffer.alloc(stat.size);
    let read = 0;
    while (read < stat.size) {
      const chunk = fs.readSync(fd, out, read, stat.size - read, read);
      if (chunk === 0) break;
      read += chunk;
    }
    if (read !== stat.size) throw new GmailTransportError('gmail_raw_readback_short');
    return out;
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Compare provider-derived bytes against an independent persisted read-back.
 * This is the single check the Run-2 canary failed: length equal, digest
 * unequal. Both are reported so a future length-only check cannot be
 * mistaken for this one.
 */
export function verifyByteFidelity({ providerBytes, destPath }) {
  const providerLength = providerBytes.length;
  const providerSha256 = sha256Hex(providerBytes);
  const persisted = readBytesDurable(destPath);
  const persistedLength = persisted.length;
  const persistedSha256 = sha256Hex(persisted);
  return Object.freeze({
    providerLength,
    persistedLength,
    providerSha256,
    persistedSha256,
    lengthEqual: providerLength === persistedLength,
    byteEqual: providerSha256 === persistedSha256,
  });
}

/** Destination must resolve strictly inside the authorized root. No exceptions. */
function assertInsideRoot(destPath, root) {
  const resolvedRoot = path.resolve(root);
  const resolvedDest = path.resolve(destPath);
  if (resolvedDest !== resolvedRoot && !resolvedDest.startsWith(resolvedRoot + path.sep)) {
    throw new GmailTransportError('gmail_raw_destination_outside_root');
  }
  return resolvedDest;
}

/**
 * The only network call in this module.
 *
 * @returns {Promise<string>} the undecoded `raw` field, still base64url
 */
async function fetchRawField(messageId, token) {
  const url = new URL(`/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}`, `${API_ORIGIN}/`);
  url.searchParams.set('format', 'raw');
  if (url.origin !== API_ORIGIN) throw new GmailTransportError('gmail_raw_request_invalid');

  let response;
  try {
    response = await globalThis.fetch(url, {
      method: 'GET',
      redirect: 'error',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${token}`,
        'user-agent': USER_AGENT,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    // A fetch rejection can quote the URL and, in some runtimes, the request
    // headers — which is the token. Nothing from it survives.
    throw new GmailTransportError('gmail_raw_network_error');
  }

  if (!response.ok) {
    if (response.status === 401) throw new GmailTransportError('gmail_raw_unauthorized');
    if (response.status === 403) throw new GmailTransportError('gmail_raw_forbidden');
    if (response.status === 404) throw new GmailTransportError('gmail_raw_not_found');
    if (response.status === 429) throw new GmailTransportError('gmail_raw_rate_limited');
    if (response.status >= 500) throw new GmailTransportError('gmail_raw_upstream_error');
    throw new GmailTransportError('gmail_raw_http_error');
  }

  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    throw new GmailTransportError('gmail_raw_response_too_large');
  }
  let text;
  try {
    text = await response.text();
  } catch {
    throw new GmailTransportError('gmail_raw_network_error');
  }
  if (text.length > MAX_RESPONSE_BYTES) throw new GmailTransportError('gmail_raw_response_too_large');

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new GmailTransportError('gmail_raw_response_unrecognized');
  }
  if (parsed === null || typeof parsed !== 'object' || typeof parsed.raw !== 'string') {
    throw new GmailTransportError('gmail_raw_response_unrecognized');
  }
  return parsed.raw;
}

/**
 * Fetch one Gmail message's RAW bytes, persist them, and prove byte fidelity —
 * all in one process, none of it returned to a model context.
 *
 * @param {{messageId: string, destPath: string, root: string, env: Record<string, string|undefined>}} input
 * @returns {Promise<Readonly<{message_id: string, byte_length: number, provider_sha256: string,
 *   persisted_sha256: string, byte_equal: boolean}>>}
 */
export async function acquireGmailRawMessage({ messageId, destPath, root, env }) {
  if (typeof messageId !== 'string' || !MESSAGE_ID_RE.test(messageId)) {
    throw new GmailTransportError('gmail_raw_message_id_invalid');
  }
  const resolvedDest = assertInsideRoot(destPath, root);
  const token = readCredential(env);

  const rawField = await fetchRawField(messageId, token);
  const providerBytes = decodeBase64Url(rawField);

  writeBytesDurable(resolvedDest, providerBytes);
  const fidelity = verifyByteFidelity({ providerBytes, destPath: resolvedDest });

  return Object.freeze({
    message_id: messageId,
    byte_length: fidelity.persistedLength,
    provider_sha256: fidelity.providerSha256,
    persisted_sha256: fidelity.persistedSha256,
    byte_equal: fidelity.lengthEqual && fidelity.byteEqual,
  });
}
