/**
 * P1-2 Gmail RAW OAuth credential provider — dedicated Desktop OAuth
 * lifecycle for the read-only Run-3 transport.
 *
 * AUDIT-ONLY UTILITY. Not part of the Atra runtime.
 *
 * Scope is pinned to `gmail.readonly` (see {@link OAUTH_SCOPE}) and never
 * widened. This module is OAuth-only and has no knowledge of the manual
 * `ATRA_P1_2_GMAIL_TOKEN` fallback or of the runtime's send-capable
 * `GMAIL_ACCESS_TOKEN` — it never reads either. The precedence between OAuth
 * and the manual token fallback is decided one level up, in
 * `gmailRaw.mjs`'s `resolveGmailBearerToken`, which is the only place that
 * needs to know both paths exist. Keeping this module OAuth-only (rather
 * than importing from `gmailRaw.mjs`) avoids a module cycle between the two
 * files.
 *
 * LIFECYCLE:
 *   `credentials.json` (Desktop OAuth client, operator-provisioned)
 *     -> one-time browser consent (`runFirstRunConsent`, human clicks Allow)
 *     -> `token.json` (refresh token, private, 0600)
 *     -> automatic access-token refresh (`refreshAccessToken`) on each run
 *        where the cached access token is expired or missing
 *     -> `resolveOAuthAccessToken` returns a usable bearer token
 *
 * CALLBACK BINDING: each `runFirstRunConsent` attempt generates a fresh,
 * process-local, unpredictable `state` value and a PKCE (S256) verifier
 * pair, embeds both in the authorization URL, and requires the exact same
 * `state` back on `/oauth2callback` before it will touch the authorization
 * code at all — a missing, malformed, or mismatched state fails closed
 * (`gmail_oauth_state_invalid`) with no code exchange and no `token.json`
 * write. Neither the state nor the PKCE verifier is ever persisted past the
 * attempt's lifetime or printed to any output.
 *
 * SECRET HANDLING: `credentials.json` and `token.json` live outside the repo
 * (private, per-operator paths — see {@link OAUTH_CREDENTIALS_PATH_ENV} and
 * {@link OAUTH_TOKEN_PATH_ENV}), are never git-tracked, and no function in
 * this module returns, logs, or throws an error containing a secret value.
 * Every thrown error is a {@link GmailOAuthError} carrying a stable code
 * only — never the underlying token, client secret, or library error
 * message (which can quote request/response internals).
 *
 * @module p1-2-gmail-raw-transport/oauthCredential
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { OAuth2Client } from 'google-auth-library';

/** Pinned. Never widened, never a send-capable scope. */
export const OAUTH_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

export const OAUTH_CREDENTIALS_PATH_ENV = 'ATRA_P1_2_GMAIL_OAUTH_CREDENTIALS_PATH';
export const OAUTH_TOKEN_PATH_ENV = 'ATRA_P1_2_GMAIL_OAUTH_TOKEN_PATH';

const DEFAULT_CREDENTIALS_PATH = path.join(os.homedir(), 'atra-private', 'p1-2-oauth', 'credentials.json');
const DEFAULT_TOKEN_PATH = path.join(os.homedir(), 'atra-private', 'p1-2-oauth', 'token.json');

/** A cached access token is treated as usable only if it outlives this margin. */
const EXPIRY_SKEW_MS = 60_000;
/** How long `runFirstRunConsent` waits for the operator to complete the browser step. */
const CONSENT_SERVER_TIMEOUT_MS = 5 * 60_000;
const REDIRECT_PATH = '/oauth2callback';

export class GmailOAuthError extends Error {
  constructor(code) {
    super(code);
    this.name = 'GmailOAuthError';
    this.code = code;
  }
}

/** @returns {{credentialsPath: string, tokenPath: string}} */
export function resolveOAuthPaths(env) {
  return {
    credentialsPath: (env && env[OAUTH_CREDENTIALS_PATH_ENV]) || DEFAULT_CREDENTIALS_PATH,
    tokenPath: (env && env[OAUTH_TOKEN_PATH_ENV]) || DEFAULT_TOKEN_PATH,
  };
}

/**
 * True only if a Desktop OAuth client file exists at the resolved path.
 * Existence only — this is the cheap, side-effect-free signal
 * `resolveGmailBearerToken` uses to decide whether OAuth is in play at all.
 */
export function isOAuthClientConfigured(env) {
  const { credentialsPath } = resolveOAuthPaths(env);
  return fs.existsSync(credentialsPath);
}

/**
 * Parses a Google Desktop-app `credentials.json`. Only the standard
 * `{installed: {client_id, client_secret, ...}}` shape is accepted; a `web`
 * client would not support the loopback redirect this module uses, so it is
 * rejected explicitly rather than silently mishandled.
 */
export function loadClientCredentials(env) {
  const { credentialsPath } = resolveOAuthPaths(env);
  let raw;
  try {
    raw = fs.readFileSync(credentialsPath, 'utf8');
  } catch {
    throw new GmailOAuthError('gmail_oauth_client_not_configured');
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new GmailOAuthError('gmail_oauth_client_invalid');
  }
  const client = parsed && typeof parsed === 'object' ? parsed.installed : null;
  if (
    client === null ||
    typeof client !== 'object' ||
    typeof client.client_id !== 'string' ||
    client.client_id.length === 0 ||
    typeof client.client_secret !== 'string' ||
    client.client_secret.length === 0
  ) {
    throw new GmailOAuthError('gmail_oauth_client_invalid');
  }
  return Object.freeze({ clientId: client.client_id, clientSecret: client.client_secret });
}

/**
 * Reads persisted token state. Returns `null` for anything short of a
 * parseable JSON object — missing file, unreadable file, malformed JSON —
 * never throws. Absence of prior consent is an ordinary, expected state.
 */
export function readTokenState(env) {
  const { tokenPath } = resolveOAuthPaths(env);
  let raw;
  try {
    raw = fs.readFileSync(tokenPath, 'utf8');
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed !== null && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function hasRefreshState(tokenState) {
  return typeof tokenState?.refresh_token === 'string' && tokenState.refresh_token.length > 0;
}

function isAccessTokenFresh(tokenState) {
  return (
    typeof tokenState?.access_token === 'string' &&
    tokenState.access_token.length > 0 &&
    typeof tokenState?.expiry_date === 'number' &&
    tokenState.expiry_date > Date.now() + EXPIRY_SKEW_MS
  );
}

/**
 * Durable, private write: the parent directory is created `0700`, the file
 * is written to a sibling temp path and renamed into place (so a crash
 * mid-write can never leave a half-written `token.json` registered as
 * complete), and the final file is `0600`.
 */
function writeTokenStateDurable(tokenPath, tokenState) {
  const dir = path.dirname(tokenPath);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmpPath = path.join(dir, `.token-${crypto.randomBytes(8).toString('hex')}.tmp`);
  fs.writeFileSync(tmpPath, JSON.stringify(tokenState), { mode: 0o600 });
  fs.renameSync(tmpPath, tokenPath);
  fs.chmodSync(tokenPath, 0o600);
}

export function persistTokenState(env, tokenState) {
  const { tokenPath } = resolveOAuthPaths(env);
  writeTokenStateDurable(tokenPath, tokenState);
}

function defaultCreateClient({ clientId, clientSecret, redirectUri }) {
  return new OAuth2Client({ clientId, clientSecret, redirectUri });
}

/**
 * Refreshes an expired access token from the persisted refresh token and
 * persists the result. A refresh call carries no scope parameter of its
 * own — Google returns a token for whatever scope the original consent
 * granted, so this can never silently broaden access beyond
 * {@link OAUTH_SCOPE}.
 *
 * `createClient` is an injection seam: real callers use
 * {@link defaultCreateClient} (a real `OAuth2Client`, real network call);
 * tests inject a fake with a `refreshAccessToken()` method so the suite
 * never performs a real Google request.
 */
export async function refreshAccessToken(env, { createClient = defaultCreateClient } = {}) {
  const { clientId, clientSecret } = loadClientCredentials(env);
  const tokenState = readTokenState(env);
  if (!hasRefreshState(tokenState)) throw new GmailOAuthError('gmail_oauth_consent_required');

  const client = createClient({ clientId, clientSecret });
  client.setCredentials({ refresh_token: tokenState.refresh_token });

  let refreshed;
  try {
    ({ credentials: refreshed } = await client.refreshAccessToken());
  } catch {
    // A library rejection can quote request/response internals; nothing
    // from it survives past this boundary.
    throw new GmailOAuthError('gmail_oauth_refresh_failed');
  }
  if (typeof refreshed?.access_token !== 'string' || refreshed.access_token.length === 0) {
    throw new GmailOAuthError('gmail_oauth_refresh_failed');
  }

  const nextState = Object.freeze({
    refresh_token: hasRefreshState(refreshed) ? refreshed.refresh_token : tokenState.refresh_token,
    access_token: refreshed.access_token,
    expiry_date: typeof refreshed.expiry_date === 'number' ? refreshed.expiry_date : Date.now() + 3_600_000,
    scope: OAUTH_SCOPE,
  });
  try {
    persistTokenState(env, nextState);
  } catch {
    // A filesystem failure here (disk full, permission denied) throws a raw
    // Node error whose `.message` quotes the private token path; nothing
    // from it survives past this boundary. Fails closed like every other
    // step in this module rather than returning a token silently uncached.
    throw new GmailOAuthError('gmail_oauth_persist_failed');
  }
  return nextState.access_token;
}

/**
 * The OAuth-only half of credential resolution: assumes a client is already
 * configured (callers check {@link isOAuthClientConfigured} first). Returns
 * a cached access token if it is still fresh; otherwise refreshes. Throws
 * `gmail_oauth_consent_required` if no refresh token has ever been
 * persisted — that is the signal the CLI layer turns into
 * `HUMAN_GOOGLE_OAUTH_CONSENT_REQUIRED`.
 */
export async function resolveOAuthAccessToken(env, deps = {}) {
  const tokenState = readTokenState(env);
  if (!hasRefreshState(tokenState)) throw new GmailOAuthError('gmail_oauth_consent_required');
  if (isAccessTokenFresh(tokenState)) return tokenState.access_token;
  return refreshAccessToken(env, deps);
}

function buildAuthUrl(client, { state, codeChallenge }) {
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: [OAUTH_SCOPE],
    prompt: 'consent',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
}

/**
 * Constant-time-ish equality: only meaningful once both inputs are known to
 * be equal-length strings (checked by the caller first), so this never
 * short-circuits on a length mismatch — only on content.
 */
function timingSafeEqualStrings(a, b) {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Best-effort only. A failure here just means the operator opens `auth_url` by hand. */
function openInBrowser(url) {
  try {
    const platform = process.platform;
    if (platform === 'darwin') spawn('open', [url], { stdio: 'ignore', detached: true }).unref();
    else if (platform === 'win32') spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true }).unref();
    else spawn('xdg-open', [url], { stdio: 'ignore', detached: true }).unref();
    return true;
  } catch {
    return false;
  }
}

/**
 * Runs the local-loopback consent flow end to end: starts an ephemeral HTTP
 * server bound to `127.0.0.1`, builds the consent URL against that server's
 * own redirect, best-effort opens the operator's browser, and waits for a
 * single callback carrying an authorization code — which it exchanges and
 * persists without ever handing the code, the exchanged tokens, or the
 * client secret back to a caller.
 *
 * The *only* mechanical step this function cannot perform is the human
 * clicking "Allow" in the browser. If that has not happened by
 * `CONSENT_SERVER_TIMEOUT_MS`, it resolves (not rejects) with
 * `{status: 'HUMAN_GOOGLE_OAUTH_CONSENT_REQUIRED', auth_url}` — `auth_url`
 * is safe to print: `generateAuthUrl` embeds `client_id`, `redirect_uri`,
 * `scope`, and `response_type`, never `client_secret`.
 *
 * `createClient`/`openBrowser`/`exchangeCode` are injection seams for tests;
 * real callers use the real implementations (real server, real browser
 * spawn, real `client.getToken`).
 */
export async function runFirstRunConsent(
  env,
  { createClient = defaultCreateClient, openBrowser = openInBrowser, exchangeCode, generateState, generateCodeVerifier } = {},
) {
  const { clientId, clientSecret } = loadClientCredentials(env);

  // Fresh, unpredictable, process-local, one-shot per consent attempt. Never
  // persisted as a long-lived secret — it lives only in this closure and is
  // discarded the instant this promise settles.
  const expectedState = generateState ? generateState() : crypto.randomBytes(32).toString('hex');
  if (typeof expectedState !== 'string' || expectedState.length === 0) {
    throw new GmailOAuthError('gmail_oauth_state_generation_failed');
  }

  return new Promise((settleResolve, settleReject) => {
    let settled = false;
    let authUrl = null;
    let codeVerifier = null;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      server.close();
      fn(value);
    };

    const server = http.createServer((req, res) => {
      let url;
      try {
        url = new URL(req.url, `http://127.0.0.1:${server.address().port}`);
      } catch {
        res.writeHead(400).end();
        return;
      }
      if (url.pathname !== REDIRECT_PATH) {
        res.writeHead(404).end();
        return;
      }
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      const returnedState = url.searchParams.get('state');
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(error ? 'Authorization was not granted. You may close this window.' : 'Authorization received. You may close this window.');

      // State is verified before anything else in this handler touches the
      // authorization code — a missing, malformed, or mismatched state must
      // never reach token exchange or persistence.
      if (
        typeof returnedState !== 'string' ||
        returnedState.length === 0 ||
        returnedState.length !== expectedState.length ||
        !timingSafeEqualStrings(returnedState, expectedState)
      ) {
        finish(settleReject, new GmailOAuthError('gmail_oauth_state_invalid'));
        return;
      }

      if (error || typeof code !== 'string' || code.length === 0) {
        finish(settleReject, new GmailOAuthError('gmail_oauth_consent_denied'));
        return;
      }

      let exchange;
      try {
        const redirectUri = `http://127.0.0.1:${server.address().port}${REDIRECT_PATH}`;
        const client = createClient({ clientId, clientSecret, redirectUri });
        exchange = exchangeCode
          ? exchangeCode({ client, code, codeVerifier })
          : client.getToken({ code, codeVerifier }).then((response) => response.tokens);
      } catch {
        // A synchronous throw from an injected test double, or from the
        // real client constructor, must still settle the promise — never
        // leave `finish` uncalled and the caller hanging on the timeout.
        finish(settleReject, new GmailOAuthError('gmail_oauth_consent_exchange_failed'));
        return;
      }

      Promise.resolve(exchange)
        .then((tokens) => {
          if (!hasRefreshState(tokens)) {
            finish(settleReject, new GmailOAuthError('gmail_oauth_no_refresh_token'));
            return;
          }
          persistTokenState(
            env,
            Object.freeze({
              refresh_token: tokens.refresh_token,
              access_token: typeof tokens.access_token === 'string' ? tokens.access_token : null,
              expiry_date: typeof tokens.expiry_date === 'number' ? tokens.expiry_date : Date.now() + 3_600_000,
              scope: OAUTH_SCOPE,
            }),
          );
          finish(settleResolve, Object.freeze({ status: 'READY' }));
        })
        .catch(() => finish(settleReject, new GmailOAuthError('gmail_oauth_consent_exchange_failed')));
    });

    const timer = setTimeout(() => {
      finish(settleResolve, Object.freeze({ status: 'HUMAN_GOOGLE_OAUTH_CONSENT_REQUIRED', auth_url: authUrl }));
    }, CONSENT_SERVER_TIMEOUT_MS);
    timer.unref?.();

    server.on('error', () => finish(settleReject, new GmailOAuthError('gmail_oauth_consent_server_failed')));

    server.listen(0, '127.0.0.1', () => {
      (async () => {
        try {
          const port = server.address().port;
          const redirectUri = `http://127.0.0.1:${port}${REDIRECT_PATH}`;
          const client = createClient({ clientId, clientSecret, redirectUri });
          const verifierResult = generateCodeVerifier
            ? await generateCodeVerifier()
            : await client.generateCodeVerifierAsync();
          if (
            !verifierResult ||
            typeof verifierResult.codeVerifier !== 'string' ||
            verifierResult.codeVerifier.length === 0 ||
            typeof verifierResult.codeChallenge !== 'string' ||
            verifierResult.codeChallenge.length === 0
          ) {
            finish(settleReject, new GmailOAuthError('gmail_oauth_pkce_generation_failed'));
            return;
          }
          codeVerifier = verifierResult.codeVerifier;
          authUrl = buildAuthUrl(client, { state: expectedState, codeChallenge: verifierResult.codeChallenge });
          openBrowser(authUrl);
        } catch {
          // Same reasoning as the request-handler try/catch above: a
          // synchronous throw here (real or injected) must still settle the
          // promise rather than hang until the timeout.
          finish(settleReject, new GmailOAuthError('gmail_oauth_consent_server_failed'));
        }
      })();
    });
  });
}
