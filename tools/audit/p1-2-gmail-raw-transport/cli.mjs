#!/usr/bin/env node
/**
 * Operator entry point for the Gmail RAW byte-preserving transport.
 *
 * AUDIT-ONLY UTILITY. Not part of the Atra runtime.
 *
 * Normal operation needs no manual token: provision a Desktop OAuth client
 * once (see README), then
 *
 *   node tools/audit/p1-2-gmail-raw-transport/cli.mjs oauth-authorize
 *
 * completes one-time browser consent (or refreshes silently if consent was
 * already granted). After that:
 *
 *   node tools/audit/p1-2-gmail-raw-transport/cli.mjs auth-check
 *
 *   node tools/audit/p1-2-gmail-raw-transport/cli.mjs acquire \
 *     --message-id <id> --root /secure/local/p1-2/sources/gmail \
 *     --dest /secure/local/p1-2/sources/gmail/<id>.eml
 *
 * `ATRA_P1_2_GMAIL_TOKEN=<gmail.readonly-scoped access token>` remains as a
 * fallback for tests and unconfigured installs — see `resolveGmailBearerToken`
 * in `gmailRaw.mjs` for the exact precedence.
 *
 * Prints only content-free results: message id, byte length, two hex
 * digests, a boolean, or a stable status/reason code. Never a token, a
 * client secret, or message bytes.
 *
 * NOT the Run-3 pre-T0 preflight gate. This CLI has no `preflight` command:
 * the canonical Run-3 pre-T0 preflight lives at
 * `tools/audit/p1-2-run3-controller/cli.mjs run3-preflight` and is sealed to
 * the ratified plan hash with no caller-suppliable override. An earlier
 * version of this CLI exposed a `preflight` command that accepted an
 * operator-supplied `--plan-sha256` value and self-certified against it —
 * that command has been removed outright (not renamed or repurposed) because
 * its only use was as the Run-3 gate, and a self-certifying gate is worse
 * than no gate. `runPreflight` (`preflight.mjs`), the function it used to
 * call, is unaffected: it stays exactly as-is and is still tested directly
 * (`tests/p1_2GmailRawTransport.test.mts`) and still reused as the shared
 * Run-2 GitHub-reuse evidence checks inside `runRun3Preflight`
 * (`../p1-2-run3-controller/preflight.mjs`) — only its CLI exposure as an
 * operator-facing plan-authority gate is gone.
 */

import process from 'node:process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkGmailAuth } from './authPreflight.mjs';
import { GmailTransportError, acquireGmailRawMessage } from './gmailRaw.mjs';
import { GmailOAuthError, isOAuthClientConfigured, resolveOAuthAccessToken, runFirstRunConsent } from './oauthCredential.mjs';

const USAGE = [
  'usage:',
  '  cli.mjs auth-check',
  '  cli.mjs oauth-authorize',
  '  cli.mjs acquire --message-id <id> --root <dir> --dest <path>',
  '',
  '  Run-3 pre-T0 preflight is NOT here — see',
  '  tools/audit/p1-2-run3-controller/cli.mjs run3-preflight',
].join('\n');

function parseAcquireArgs(argv) {
  const options = { messageId: null, root: null, dest: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) return { invalid: 'argument_invalid' };
    i += 1;
    if (arg === '--message-id') options.messageId = value;
    else if (arg === '--root') options.root = value;
    else if (arg === '--dest') options.dest = value;
    // Unknown flags are refused, not ignored.
    else return { invalid: 'argument_unknown' };
  }
  if (options.messageId === null || options.root === null || options.dest === null) {
    return { invalid: 'argument_invalid' };
  }
  return options;
}

export async function main(argv, env) {
  const [command, ...rest] = argv;

  if (command === 'auth-check') {
    const result = await checkGmailAuth({ env });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result.available ? 0 : 2;
  }

  if (command === 'oauth-authorize') {
    if (!isOAuthClientConfigured(env)) {
      process.stdout.write(`${JSON.stringify({ status: 'HUMAN_GOOGLE_OAUTH_CLIENT_REQUIRED' }, null, 2)}\n`);
      return 2;
    }
    try {
      // Silent path: a refresh token is already on disk, so no browser step
      // is needed — this also covers "already authorized, just refresh".
      await resolveOAuthAccessToken(env);
      process.stdout.write(`${JSON.stringify({ status: 'READY' }, null, 2)}\n`);
      return 0;
    } catch (error) {
      const code = error instanceof GmailOAuthError ? error.code : 'internal_error';
      if (code !== 'gmail_oauth_consent_required') {
        process.stdout.write(`${JSON.stringify({ status: 'HUMAN_GOOGLE_OAUTH_CLIENT_REQUIRED', error_code: code }, null, 2)}\n`);
        return 2;
      }
    }
    // No usable refresh state yet: run the one-time consent flow. The human
    // action needed is exactly "click Allow in the browser" — everything
    // mechanical (server, code exchange, persistence) happens here.
    try {
      const result = await runFirstRunConsent(env);
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return result.status === 'READY' ? 0 : 2;
    } catch (error) {
      const code = error instanceof GmailOAuthError ? error.code : 'internal_error';
      process.stdout.write(`${JSON.stringify({ status: 'HUMAN_GOOGLE_OAUTH_CONSENT_REQUIRED', error_code: code }, null, 2)}\n`);
      return 2;
    }
  }

  if (command === 'acquire') {
    const options = parseAcquireArgs(rest);
    if (options.invalid) {
      process.stdout.write(`${JSON.stringify({ error_code: options.invalid }, null, 2)}\n`);
      return 2;
    }
    try {
      const result = await acquireGmailRawMessage({
        messageId: options.messageId,
        destPath: options.dest,
        root: options.root,
        env,
      });
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return result.byte_equal ? 0 : 3;
    } catch (error) {
      // Fail closed; never let the underlying error message out — it can
      // quote a path or, from some runtimes, request internals.
      const code = error instanceof GmailTransportError || error instanceof GmailOAuthError ? error.code : 'internal_error';
      process.stdout.write(`${JSON.stringify({ error_code: code }, null, 2)}\n`);
      return 2;
    }
  }

  process.stdout.write(`${USAGE}\n`);
  return command === undefined ? 0 : 2;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = await main(process.argv.slice(2), process.env);
}
