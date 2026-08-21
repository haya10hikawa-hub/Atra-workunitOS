#!/usr/bin/env node
/**
 * Operator entry point for the Gmail RAW byte-preserving transport.
 *
 * AUDIT-ONLY UTILITY. Not part of the Atra runtime.
 *
 *   ATRA_P1_2_GMAIL_TOKEN=<gmail.readonly-scoped access token> \
 *     node tools/audit/p1-2-gmail-raw-transport/cli.mjs auth-check
 *
 *   ATRA_P1_2_GMAIL_TOKEN=<gmail.readonly-scoped access token> \
 *     node tools/audit/p1-2-gmail-raw-transport/cli.mjs acquire \
 *       --message-id <id> --root /secure/local/p1-2/sources/gmail \
 *       --dest /secure/local/p1-2/sources/gmail/<id>.eml
 *
 * Prints only the content-free result: message id, byte length, two hex
 * digests, and a boolean. Never the token, never message bytes.
 */

import process from 'node:process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkGmailAuth } from './authPreflight.mjs';
import { GmailTransportError, acquireGmailRawMessage } from './gmailRaw.mjs';
import { runPreflight } from './preflight.mjs';

const USAGE = [
  'usage:',
  '  cli.mjs auth-check',
  '  cli.mjs acquire --message-id <id> --root <dir> --dest <path>',
  '  cli.mjs preflight --run-root <dir> --plan <path> --plan-sha256 <hex>',
].join('\n');

function parsePreflightArgs(argv) {
  // Run-3 is current-run only: there is deliberately no --run2-* flag here.
  // Reintroducing one would make a forbidden Run-2 artifact a precondition of
  // starting, and the unknown-flag branch below refuses any such argument.
  const options = { runRoot: null, planPath: null, planSha256: null };
  const flagMap = {
    '--run-root': 'runRoot',
    '--plan': 'planPath',
    '--plan-sha256': 'planSha256',
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
    let result;
    try {
      result = await checkGmailAuth({ env });
    } catch (error) {
      const code = error instanceof GmailTransportError ? error.code : 'internal_error';
      process.stdout.write(`${JSON.stringify({ error_code: code }, null, 2)}\n`);
      return 2;
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result.available ? 0 : 2;
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
      const code = error instanceof GmailTransportError ? error.code : 'internal_error';
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
    let result;
    try {
      result = await runPreflight({
        env,
        runRoot: options.runRoot,
        planPath: options.planPath,
        expectedPlanSha256: options.planSha256,
      });
    } catch (error) {
      const code = error instanceof GmailTransportError ? error.code : 'internal_error';
      process.stdout.write(`${JSON.stringify({ error_code: code }, null, 2)}\n`);
      return 2;
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result.overall_pass ? 0 : 2;
  }

  process.stdout.write(`${USAGE}\n`);
  return command === undefined ? 0 : 2;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  // Nothing may reach stderr. An escaped throw would print a stack trace, and a
  // stack trace can quote a destination path, a request URL or, from some
  // runtimes, the authorization header. Every exit goes through the same
  // content-free JSON shape on stdout instead.
  try {
    process.exitCode = await main(process.argv.slice(2), process.env);
  } catch (error) {
    const code = error instanceof GmailTransportError ? error.code : 'internal_error';
    process.stdout.write(`${JSON.stringify({ error_code: code }, null, 2)}\n`);
    process.exitCode = 2;
  }
}
