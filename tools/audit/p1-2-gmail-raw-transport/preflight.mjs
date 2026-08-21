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
  'run2_github_reuse_metadata_valid',
  'run2_github_selection_provenance_valid',
  'run2_github_record_id_sequential',
]);

const MIN_FREE_BYTES = 256 * 1024 * 1024;

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

function checkDestinationWritableAndReadback(runRoot) {
  fs.mkdirSync(runRoot, { recursive: true });
  const probeBytes = crypto.randomBytes(4096);
  const probeEncoded = probeBytes.toString('base64url');
  const decoded = decodeBase64Url(probeEncoded);
  const probePath = path.join(runRoot, `.preflight-probe-${crypto.randomBytes(8).toString('hex')}`);
  writeBytesDurable(probePath, decoded);
  let persisted;
  try {
    persisted = readBytesDurable(probePath);
  } finally {
    fs.rmSync(probePath, { force: true });
  }
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
  const entries = fs.readdirSync(runRoot).filter((name) => !name.startsWith('.preflight-probe-'));
  return entries.length === 0;
}

function checkPlanHash(planPath, expectedSha256) {
  const bytes = fs.readFileSync(planPath);
  return sha256Hex(bytes) === expectedSha256;
}

/**
 * Structural-only reuse validation over the Run-2 manifest: every GitHub row
 * carries a content hash, an identity commitment, an acquisition timestamp
 * inside the Run-2 acquisition window (T0..deadline, not the observation
 * window), and unique ids. Never reads a row's staged content, only manifest
 * metadata fields.
 */
function checkRun2GithubReuseMetadata(manifestPath, acquisitionWindowStartIso, acquisitionWindowEndIso) {
  const lines = fs.readFileSync(manifestPath, 'utf8').split('\n').filter((line) => line.trim().length > 0);
  const rows = lines.map((line) => JSON.parse(line));
  const github = rows.filter((row) => row.provider === 'github');
  if (github.length === 0) return false;

  const windowStart = Date.parse(acquisitionWindowStartIso);
  const windowEnd = Date.parse(acquisitionWindowEndIso);
  const requiredFields = [
    'dataset_record_id',
    'content_sha256',
    'provider_identity_commitment_sha256',
    'observed_at',
    'source_event_at',
  ];
  for (const row of github) {
    for (const field of requiredFields) {
      if (typeof row[field] !== 'string' || row[field].length === 0) return false;
    }
    const observedAt = Date.parse(row.observed_at);
    if (!Number.isFinite(observedAt) || observedAt < windowStart || observedAt > windowEnd) return false;
  }
  const ids = github.map((row) => row.dataset_record_id).sort();
  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== ids.length) return false;
  return true;
}

const DATASET_RECORD_ID_RE = /^P1D-(\d+)$/;
/** `raw_artifact_relative_path` for a reused github row, e.g. `aihack-pr-14.json` or `atra-issue-7.json`. */
const GITHUB_ARTIFACT_NUMBER_RE = /-(?:pr|issue)-(\d+)\.json$/;
const RESOURCE_CLASS_TO_SELECTION_KEY = Object.freeze({
  github_pull_request: 'github_pull_request',
  github_issue: 'github_issue',
});

/**
 * Every reused GitHub row must trace to an explicit, pre-registered selection
 * decision — not merely carry a well-formed hash. Ties each row's
 * `(work_universe_id, resource_class, artifact number)` back to the exact
 * `selected` list the selection-resolution authority recorded for that
 * universe/class. Reads only manifest and selection-resolution metadata
 * fields, never artifact content.
 */
function checkRun2GithubSelectionProvenance(manifestPath, selectionResolvedPath) {
  const lines = fs.readFileSync(manifestPath, 'utf8').split('\n').filter((line) => line.trim().length > 0);
  const rows = lines.map((line) => JSON.parse(line));
  const github = rows.filter((row) => row.provider === 'github');
  if (github.length === 0) return false;

  const selection = JSON.parse(fs.readFileSync(selectionResolvedPath, 'utf8'));
  if (selection === null || typeof selection !== 'object') return false;

  for (const row of github) {
    const universeId = row.work_universe_id;
    const resourceClass = row.resource_class;
    const artifactPath = row.raw_artifact_relative_path;
    if (typeof universeId !== 'string' || typeof resourceClass !== 'string' || typeof artifactPath !== 'string') {
      return false;
    }
    const selectionKey = RESOURCE_CLASS_TO_SELECTION_KEY[resourceClass];
    const universe = selection[universeId];
    if (selectionKey === undefined || universe === null || typeof universe !== 'object') return false;
    const bucket = universe[selectionKey];
    if (bucket === null || typeof bucket !== 'object' || !Array.isArray(bucket.selected)) return false;

    const match = GITHUB_ARTIFACT_NUMBER_RE.exec(artifactPath);
    if (!match) return false;
    const number = Number(match[1]);
    if (!bucket.selected.includes(number)) return false;
  }
  return true;
}

/**
 * `dataset_record_id` must be a strictly sequential, gap-free, non-reordered
 * run of `P1D-NNNN` values in manifest file order — uniqueness alone (the
 * existing check) cannot catch a reordered or gapped sequence with all-unique
 * ids.
 */
function checkRun2DatasetRecordIdSequential(manifestPath) {
  const lines = fs.readFileSync(manifestPath, 'utf8').split('\n').filter((line) => line.trim().length > 0);
  const rows = lines.map((line) => JSON.parse(line));
  if (rows.length === 0) return false;

  let previous = null;
  for (const row of rows) {
    const match = typeof row.dataset_record_id === 'string' ? DATASET_RECORD_ID_RE.exec(row.dataset_record_id) : null;
    if (!match) return false;
    const value = Number(match[1]);
    if (previous !== null && value !== previous + 1) return false;
    previous = value;
  }
  return true;
}

/**
 * @param {{
 *   env: Record<string, string|undefined>,
 *   runRoot: string,
 *   planPath: string,
 *   expectedPlanSha256: string,
 *   run2ManifestPath: string,
 *   run2AcquisitionWindowStartIso: string,
 *   run2AcquisitionWindowEndIso: string,
 *   run2SelectionResolvedPath: string,
 * }} input
 */
export async function runPreflight({
  env,
  runRoot,
  planPath,
  expectedPlanSha256,
  run2ManifestPath,
  run2AcquisitionWindowStartIso,
  run2AcquisitionWindowEndIso,
  run2SelectionResolvedPath,
}) {
  const results = {};

  results.runner_installed = tryCheck(() => checkRunnerInstalled());
  results.auth_available = await tryCheckAsync(async () => (await checkGmailAuth({ env })).available);
  results.destination_writable = tryCheck(() => checkDestinationWritableAndReadback(runRoot));
  results.readback_works = results.destination_writable;
  results.disk_space_sufficient = tryCheck(() => checkDiskSpace(runRoot));
  results.run_root_valid = tryCheck(() => checkRunRootValid(runRoot));
  results.plan_hash_matches = tryCheck(() => checkPlanHash(planPath, expectedPlanSha256));
  results.run2_github_reuse_metadata_valid = tryCheck(() =>
    checkRun2GithubReuseMetadata(run2ManifestPath, run2AcquisitionWindowStartIso, run2AcquisitionWindowEndIso),
  );
  results.run2_github_selection_provenance_valid = tryCheck(() =>
    checkRun2GithubSelectionProvenance(run2ManifestPath, run2SelectionResolvedPath),
  );
  results.run2_github_record_id_sequential = tryCheck(() => checkRun2DatasetRecordIdSequential(run2ManifestPath));

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
