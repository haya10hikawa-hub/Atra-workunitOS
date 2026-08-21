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
 */

import process from 'node:process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkGmailAuth } from './authPreflight.mjs';
import { GmailTransportError, acquireGmailRawMessage } from './gmailRaw.mjs';
import { GmailOAuthError, isOAuthClientConfigured, resolveOAuthAccessToken, runFirstRunConsent } from './oauthCredential.mjs';
import { runPreflight } from './preflight.mjs';

const USAGE = [
  'usage:',
  '  cli.mjs auth-check',
  '  cli.mjs oauth-authorize',
  '  cli.mjs acquire --message-id <id> --root <dir> --dest <path>',
  '  cli.mjs preflight --run-root <dir> --plan <path> --plan-sha256 <hex> \\',
  '    --run2-manifest <path> --run2-window-start <iso> --run2-window-end <iso> \\',
  '    --run2-selection-resolved <path> --run2-artifact-root <dir>',
].join('\n');

function parsePreflightArgs(argv) {
  const options = {
    runRoot: null,
    planPath: null,
    planSha256: null,
    run2Manifest: null,
    run2WindowStart: null,
    run2WindowEnd: null,
    run2SelectionResolved: null,
    run2ArtifactRoot: null,
  };
  const flagMap = {
    '--run-root': 'runRoot',
    '--plan': 'planPath',
    '--plan-sha256': 'planSha256',
    '--run2-manifest': 'run2Manifest',
    '--run2-window-start': 'run2WindowStart',
    '--run2-window-end': 'run2WindowEnd',
    '--run2-selection-resolved': 'run2SelectionResolved',
    '--run2-artifact-root': 'run2ArtifactRoot',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) return { invalid: 'argument_invalid' };
    i += 1;
    const key = flagMap[arg];
    if (key === undefined) return { invalid: 'argument_unknown' };
    options[key] = value;
  }
  if (Object.values(options).some((value) => value === null)) return { invalid: 'argument_invalid' };
  return options;
}

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

  if (command === 'preflight') {
    const options = parsePreflightArgs(rest);
    if (options.invalid) {
      process.stdout.write(`${JSON.stringify({ error_code: options.invalid }, null, 2)}\n`);
      return 2;
    }
    const result = await runPreflight({
      env,
      runRoot: options.runRoot,
      planPath: options.planPath,
      expectedPlanSha256: options.planSha256,
      run2ManifestPath: options.run2Manifest,
      run2AcquisitionWindowStartIso: options.run2WindowStart,
      run2AcquisitionWindowEndIso: options.run2WindowEnd,
      run2SelectionResolvedPath: options.run2SelectionResolved,
      run2ArtifactRoot: options.run2ArtifactRoot,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result.overall_pass ? 0 : 2;
  }

  process.stdout.write(`${USAGE}\n`);
  return command === undefined ? 0 : 2;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = await main(process.argv.slice(2), process.env);
}
