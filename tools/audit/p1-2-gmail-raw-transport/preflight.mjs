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
import { hasRefreshState, isOAuthClientConfigured, readTokenState } from './oauthCredential.mjs';

const CHECK_NAMES = Object.freeze([
  'runner_installed',
  'gmail_auth_available',
  'destination_writable',
  'readback_works',
  'disk_space_sufficient',
  'run_root_valid',
  'plan_hash_matches',
  'run2_github_reuse_metadata_valid',
  'run2_github_selection_provenance_valid',
  'run2_github_count_exact',
  'run2_github_artifacts_exist',
  'run2_github_artifact_hash_valid',
  'run2_github_selection_set_equal',
  'run2_github_record_order_valid',
  'run2_dataset_record_id_sequential',
]);

/** Pinned Run-3 reuse contract — see `RUN3_PREREGISTRATION.md` §2. */
const EXPECTED_RUN2_GITHUB_REUSE_COUNT = 34;

const MIN_FREE_BYTES = 256 * 1024 * 1024;

function tryCheck(fn) {
  try {
    return { ok: Boolean(fn()), error_code: null };
  } catch (error) {
    const code = error && typeof error.code === 'string' ? error.code : 'internal_error';
    return { ok: false, error_code: code };
  }
}

/** Like {@link tryCheck}, but preserves `fn`'s return value instead of coercing it to a boolean. */
function tryCheckValue(fn) {
  try {
    return { value: fn(), error_code: null };
  } catch (error) {
    const code = error && typeof error.code === 'string' ? error.code : 'internal_error';
    return { value: null, error_code: code };
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

/**
 * Diagnostic-only sub-signals for `gmail_auth_available`, reported alongside
 * `checks` but not part of `CHECK_NAMES`/`overall_pass`: `gmail_auth_available`
 * already covers both the OAuth path and the documented
 * `ATRA_P1_2_GMAIL_TOKEN` fallback end to end, so gating on these two as well
 * would wrongly fail a preflight that is legitimately using the fallback
 * (no OAuth client configured at all). They exist purely so a human reading
 * a failed preflight can tell *why* — client never provisioned vs. client
 * provisioned but consent never completed — without gating on either.
 */
function oauthDiagnostics(env) {
  return Object.freeze({
    oauth_client_available: isOAuthClientConfigured(env),
    oauth_refresh_state_available: hasRefreshState(readTokenState(env)),
  });
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
const GITHUB_SELECTION_RESOURCE_CLASSES = Object.freeze(Object.values(RESOURCE_CLASS_TO_SELECTION_KEY));

function readGithubManifestRows(manifestPath) {
  const lines = fs.readFileSync(manifestPath, 'utf8').split('\n').filter((line) => line.trim().length > 0);
  const rows = lines.map((line) => JSON.parse(line));
  return rows.filter((row) => row.provider === 'github');
}

/**
 * The stable identity a reused GitHub row and a resolved-selection entry are
 * compared by: `(work_universe_id, resource_class, artifact number)`. Returns
 * `null` if the row does not carry a well-formed identity.
 */
function githubRowIdentityKey(row) {
  if (typeof row.work_universe_id !== 'string' || typeof row.resource_class !== 'string') return null;
  if (RESOURCE_CLASS_TO_SELECTION_KEY[row.resource_class] === undefined) return null;
  const match = typeof row.raw_artifact_relative_path === 'string' ? GITHUB_ARTIFACT_NUMBER_RE.exec(row.raw_artifact_relative_path) : null;
  if (!match) return null;
  return `${row.work_universe_id}::${row.resource_class}::${Number(match[1])}`;
}

/**
 * Every identity the resolved-selection authority actually selected, across
 * every universe and every GitHub resource class. Non-selection fields in the
 * document (`plan_sha256`, `TOTALS`, `CANARY`, …) are skipped structurally —
 * none of them are an object carrying a `.selected` array under a github
 * resource-class key, so they never contribute a false identity.
 */
function selectedGithubIdentityKeys(selection) {
  const keys = new Set();
  for (const [universeId, universe] of Object.entries(selection)) {
    if (universe === null || typeof universe !== 'object') continue;
    for (const resourceClass of GITHUB_SELECTION_RESOURCE_CLASSES) {
      const bucket = universe[resourceClass];
      if (bucket === null || typeof bucket !== 'object' || !Array.isArray(bucket.selected)) continue;
      for (const number of bucket.selected) {
        keys.add(`${universeId}::${resourceClass}::${Number(number)}`);
      }
    }
  }
  return keys;
}

/**
 * Destination must resolve strictly inside the authorized Run-2 artifact
 * root — the same realpath-containment property `assertInsideRoot` enforces
 * for Gmail writes, applied here to a read of an already-persisted artifact.
 * Returns `null` (never throws) on traversal, an absolute path, a symlink
 * escape, or a missing/unreadable file — every one of those must read as
 * "not eligible", not as a crash.
 */
function resolveRun2ArtifactRealPath(artifactRoot, relativePath) {
  if (typeof relativePath !== 'string' || relativePath.length === 0 || path.isAbsolute(relativePath)) return null;
  const resolvedRoot = path.resolve(artifactRoot);
  const resolvedPath = path.resolve(resolvedRoot, relativePath);
  if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(resolvedRoot + path.sep)) return null;

  let realRoot;
  try {
    realRoot = fs.realpathSync(resolvedRoot);
  } catch {
    return null;
  }
  let realPath;
  try {
    realPath = fs.realpathSync(resolvedPath);
  } catch {
    return null;
  }
  if (realPath !== realRoot && !realPath.startsWith(realRoot + path.sep)) return null;
  return realPath;
}

/**
 * Exact reuse cardinality: not "at least 34", not "34 well-formed rows out of
 * a larger set" — exactly 34 GitHub manifest rows, each with a distinct
 * `(work_universe_id, resource_class, artifact number)` identity. A subset
 * that happens to be internally well-formed must not silently pass as if it
 * were the full reused set.
 */
function checkRun2GithubCountExact(manifestPath, expectedCount) {
  const github = readGithubManifestRows(manifestPath);
  if (github.length !== expectedCount) return false;
  const keys = github.map(githubRowIdentityKey);
  if (keys.some((key) => key === null)) return false;
  return new Set(keys).size === expectedCount;
}

/**
 * Every reused GitHub row's artifact file actually exists, under the
 * authorized Run-2 artifact root, and its bytes hash to the exact
 * `content_sha256` the manifest committed to at Run-2 acquisition time. This
 * is the property `run2_github_reuse_metadata_valid` cannot prove on its own:
 * that check only confirms the manifest *carries* a hash field, never that
 * the artifact on disk still matches it. Reads bytes solely inside the local
 * hash function — never returns or logs them.
 */
function checkRun2GithubArtifactsMatchManifest(manifestPath, artifactRoot) {
  const github = readGithubManifestRows(manifestPath);
  if (github.length === 0) return { exist: false, hashValid: false };
  let exist = true;
  let hashValid = true;
  for (const row of github) {
    if (typeof row.content_sha256 !== 'string' || row.content_sha256.length === 0) {
      exist = false;
      hashValid = false;
      continue;
    }
    const realPath = resolveRun2ArtifactRealPath(artifactRoot, row.raw_artifact_relative_path);
    if (realPath === null) {
      exist = false;
      hashValid = false;
      continue;
    }
    let bytes;
    try {
      bytes = fs.readFileSync(realPath);
    } catch {
      exist = false;
      hashValid = false;
      continue;
    }
    if (sha256Hex(bytes) !== row.content_sha256) hashValid = false;
  }
  return { exist, hashValid: exist && hashValid };
}

/**
 * Strengthens `checkRun2GithubSelectionProvenance` (every manifest row traces
 * to *a* selection entry) into full bidirectional set equality: no manifest
 * row is missing from the resolved selection, and no item the selection
 * authority actually selected is missing from the manifest. Duplicate
 * manifest identities collapse the manifest-side set below the selection-side
 * count and fail this check, which is the intended effect — a duplicate must
 * not silently pass as reuse of a single selected item.
 */
function checkRun2GithubSelectionSetEqual(manifestPath, selectionResolvedPath) {
  const github = readGithubManifestRows(manifestPath);
  if (github.length === 0) return false;

  const selection = JSON.parse(fs.readFileSync(selectionResolvedPath, 'utf8'));
  if (selection === null || typeof selection !== 'object') return false;

  const manifestKeys = github.map(githubRowIdentityKey);
  if (manifestKeys.some((key) => key === null)) return false;
  const manifestKeySet = new Set(manifestKeys);
  if (manifestKeySet.size !== manifestKeys.length) return false;

  const selectedKeySet = selectedGithubIdentityKeys(selection);
  if (selectedKeySet.size !== manifestKeySet.size) return false;
  for (const key of manifestKeySet) {
    if (!selectedKeySet.has(key)) return false;
  }
  return true;
}

/**
 * The 34 reused GitHub records must appear in the manifest in run order — a
 * strictly increasing `dataset_record_id` sequence restricted to the GitHub
 * subset — without claiming anything about the full manifest (a Gmail row can
 * legitimately sit at a lower id between two GitHub rows). This is the
 * GitHub-specific half of record order; `run2_dataset_record_id_sequential`
 * below is the full-manifest half.
 */
function checkRun2GithubRecordOrderValid(manifestPath) {
  const github = readGithubManifestRows(manifestPath);
  if (github.length === 0) return false;
  let previous = -Infinity;
  for (const row of github) {
    const match = typeof row.dataset_record_id === 'string' ? DATASET_RECORD_ID_RE.exec(row.dataset_record_id) : null;
    if (!match) return false;
    const value = Number(match[1]);
    if (value <= previous) return false;
    previous = value;
  }
  return true;
}

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
 * run of `P1D-NNNN` values in manifest file order, across the *whole*
 * manifest (every provider, not just the reused GitHub subset) — uniqueness
 * alone cannot catch a reordered or gapped sequence with all-unique ids. This
 * is deliberately full-manifest scope; it does not by itself speak to GitHub
 * reuse ordering specifically — see `checkRun2GithubRecordOrderValid` above
 * for that.
 */
function checkRun2ManifestRecordIdSequential(manifestPath) {
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
 *   run2ArtifactRoot: string,
 *   expectedGithubReuseCount?: number,
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
  run2ArtifactRoot,
  expectedGithubReuseCount = EXPECTED_RUN2_GITHUB_REUSE_COUNT,
}) {
  const results = {};

  results.runner_installed = tryCheck(() => checkRunnerInstalled());
  results.gmail_auth_available = await tryCheckAsync(async () => (await checkGmailAuth({ env })).available);
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
  results.run2_github_count_exact = tryCheck(() => checkRun2GithubCountExact(run2ManifestPath, expectedGithubReuseCount));

  const artifactEvidence = tryCheckValue(() => checkRun2GithubArtifactsMatchManifest(run2ManifestPath, run2ArtifactRoot));
  results.run2_github_artifacts_exist = {
    ok: artifactEvidence.value !== null && artifactEvidence.value.exist === true,
    error_code: artifactEvidence.error_code,
  };
  results.run2_github_artifact_hash_valid = {
    ok: artifactEvidence.value !== null && artifactEvidence.value.hashValid === true,
    error_code: artifactEvidence.error_code,
  };

  results.run2_github_selection_set_equal = tryCheck(() =>
    checkRun2GithubSelectionSetEqual(run2ManifestPath, run2SelectionResolvedPath),
  );
  results.run2_github_record_order_valid = tryCheck(() => checkRun2GithubRecordOrderValid(run2ManifestPath));
  results.run2_dataset_record_id_sequential = tryCheck(() => checkRun2ManifestRecordIdSequential(run2ManifestPath));

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
    diagnostics: oauthDiagnostics(env),
  });
}

export { CHECK_NAMES, EXPECTED_RUN2_GITHUB_REUSE_COUNT };
