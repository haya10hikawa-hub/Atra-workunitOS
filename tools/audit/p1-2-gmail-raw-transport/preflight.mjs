/**
 * Pre-T0 preflight — a single content-free PASS/FAIL over the checks the Run-3
 * charter requires before acquisition may begin.
 *
 * AUDIT-ONLY UTILITY. Not part of the Atra runtime.
 *
 * Every check here is structural (file exists, path is writable, a digest
 * matches, a count matches) — none of it reads or returns dataset content.
 * The result is a fixed set of named booleans plus an overall verdict, safe
 * to print in full.
 *
 * CURRENT-RUN ONLY. Run-3 forbids reuse of Run-2 source bytes, so this
 * preflight deliberately has no Run-2 manifest, selection-resolution or
 * record-id input. A preflight that required a Run-2 artifact to pass would
 * make the forbidden thing a precondition of starting — the reuse-validation
 * checks that lived here have been removed outright rather than defaulted.
 *
 * @module p1-2-gmail-raw-transport/preflight
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { checkGmailAuth } from './authPreflight.mjs';
import { decodeBase64Url, readBytesDurable, sha256Hex, writeBytesDurable } from './gmailRaw.mjs';

const CHECK_NAMES = Object.freeze([
  'runner_installed',
  'auth_available',
  'destination_writable',
  'readback_works',
  'disk_space_sufficient',
  'run_root_valid',
  'plan_hash_matches',
]);

const MIN_FREE_BYTES = 256 * 1024 * 1024;
const PROBE_PREFIX = '.preflight-probe-';

/**
 * The IO the two destination checks run through.
 *
 * This exists as a seam for exactly one reason: `readback_works` must be
 * independently falsifiable from `destination_writable`, and the only honest
 * way to demonstrate that is to make reads fail while writes keep succeeding.
 * It follows the same convention as `verifyByteFidelity`'s `hashFn` — a test
 * affordance, not a configuration point. Real callers pass nothing.
 */
const DEFAULT_IO = Object.freeze({ writeBytesDurable, readBytesDurable, decodeBase64Url });

function tryCheck(fn) {
  try {
    return { ok: Boolean(fn()), error_code: null };
  } catch (error) {
    const code = error && typeof error.code === 'string' ? error.code : 'internal_error';
    return { ok: false, error_code: code };
  }
}

async function tryCheckAsync(fn) {
  try {
    return { ok: Boolean(await fn()), error_code: null };
  } catch (error) {
    const code = error && typeof error.code === 'string' ? error.code : 'internal_error';
    return { ok: false, error_code: code };
  }
}

function checkRunnerInstalled() {
  return typeof writeBytesDurable === 'function' && typeof readBytesDurable === 'function';
}

function probePath(runRoot) {
  return path.join(runRoot, `${PROBE_PREFIX}${crypto.randomBytes(8).toString('hex')}`);
}

/**
 * Can this run create and durably write a file under the run root?
 *
 * Deliberately does NOT read the file back — that is `readback_works`'s job,
 * and conflating the two is what made the reviewed preflight report a single
 * fact under two names. Confirms the write landed using directory metadata
 * (`lstat` size) rather than file contents, so a destination that accepts
 * writes but cannot serve reads still passes this check and fails the next.
 */
function checkDestinationWritable(runRoot, io) {
  fs.mkdirSync(runRoot, { recursive: true });
  const probe = probePath(runRoot);
  const bytes = crypto.randomBytes(4096);
  try {
    io.writeBytesDurable(probe, bytes);
    return fs.lstatSync(probe).size === bytes.length;
  } finally {
    fs.rmSync(probe, { force: true });
  }
}

/**
 * Does an independent reopen + read return exactly the bytes that were written?
 *
 * Uses its own probe file and its own random payload, so it shares no state
 * with `checkDestinationWritable` and can fail while that one passes. Equality
 * is a direct `Buffer.compare`, not a digest comparison — a digest-only
 * verdict is precisely the failure mode the Run-2 canary exposed, where a
 * self-consistent hash certified corrupted bytes as authentic. The digest is
 * still computed as corroborating evidence, never as the authority.
 */
function checkReadbackWorks(runRoot, io) {
  fs.mkdirSync(runRoot, { recursive: true });
  const probe = probePath(runRoot);
  const payload = crypto.randomBytes(4096);
  const decoded = io.decodeBase64Url(payload.toString('base64url'));
  let persisted;
  try {
    io.writeBytesDurable(probe, decoded);
    persisted = io.readBytesDurable(probe);
  } finally {
    fs.rmSync(probe, { force: true });
  }
  if (Buffer.compare(persisted, decoded) !== 0) return false;
  return sha256Hex(persisted) === sha256Hex(decoded);
}

function checkDiskSpace(runRoot) {
  fs.mkdirSync(runRoot, { recursive: true });
  const stats = fs.statfsSync(runRoot);
  const free = Number(stats.bavail) * Number(stats.bsize);
  return Number.isFinite(free) && free >= MIN_FREE_BYTES;
}

function checkRunRootValid(runRoot) {
  fs.mkdirSync(runRoot, { recursive: true });
  const entries = fs.readdirSync(runRoot).filter((name) => !name.startsWith(PROBE_PREFIX));
  return entries.length === 0;
}

function checkPlanHash(planPath, expectedSha256) {
  const bytes = fs.readFileSync(planPath);
  return sha256Hex(bytes) === expectedSha256;
}

/**
 * @param {{
 *   env: Record<string, string|undefined>,
 *   runRoot: string,
 *   planPath: string,
 *   expectedPlanSha256: string,
 *   io?: {writeBytesDurable: Function, readBytesDurable: Function, decodeBase64Url: Function},
 * }} input
 */
export async function runPreflight({ env, runRoot, planPath, expectedPlanSha256, io = DEFAULT_IO }) {
  const results = {};

  results.runner_installed = tryCheck(() => checkRunnerInstalled());
  results.auth_available = await tryCheckAsync(async () => (await checkGmailAuth({ env })).available);
  results.destination_writable = tryCheck(() => checkDestinationWritable(runRoot, io));
  results.readback_works = tryCheck(() => checkReadbackWorks(runRoot, io));
  results.disk_space_sufficient = tryCheck(() => checkDiskSpace(runRoot));
  results.run_root_valid = tryCheck(() => checkRunRootValid(runRoot));
  results.plan_hash_matches = tryCheck(() => checkPlanHash(planPath, expectedPlanSha256));

  const checks = {};
  for (const name of CHECK_NAMES) {
    checks[name] = results[name].ok;
  }
  const overall = CHECK_NAMES.every((name) => results[name].ok);
  const failedChecks = CHECK_NAMES.filter((name) => !results[name].ok);

  return Object.freeze({
    overall_pass: overall,
    checks: Object.freeze(checks),
    failed_checks: Object.freeze(failedChecks),
  });
}

export { CHECK_NAMES };
