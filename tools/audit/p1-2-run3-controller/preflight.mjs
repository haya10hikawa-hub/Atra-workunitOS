/**
 * Pre-T0 preflight for the Run-3 final-integration control plane — a single
 * content-free PASS/FAIL over the checks that must hold before any of
 * `authorizePM` / `resolveSelection` / `recordT0` may run.
 *
 * AUDIT-ONLY UTILITY. Not part of the Atra runtime.
 *
 * READ-ONLY BY CONSTRUCTION: every check here is structural — a function
 * exists, a credential/file is present, a hash matches, a count matches. No
 * check in this module calls `Run3AcquisitionController#recordT0`,
 * `#runCanary`, or `#acquireNext`; no check calls `acquireGmailRawMessage`
 * or the raw adapter; no check inspects message content. This module never
 * imports the controller's mutating methods for anything other than a
 * `typeof` availability probe.
 *
 * @module p1-2-run3-controller/preflight
 */

import fs from 'node:fs';
import path from 'node:path';

import { checkGmailAuth } from '../p1-2-gmail-raw-transport/authPreflight.mjs';
import { acquireGmailRawMessage } from '../p1-2-gmail-raw-transport/gmailRaw.mjs';
import { hasRefreshState, isOAuthClientConfigured, readTokenState } from '../p1-2-gmail-raw-transport/oauthCredential.mjs';
import {
  EXPECTED_RUN2_GITHUB_REUSE_COUNT,
  checkRun2GithubArtifactsMatchManifest,
  checkRun2GithubCountExact,
  checkRun2GithubSelectionProvenance,
  checkRun2GithubSelectionSetEqual,
} from '../p1-2-gmail-raw-transport/preflight.mjs';
import { Run3AcquisitionController } from './controller.mjs';
import { enumerateGmailMetadata } from './metadataEnumerator.mjs';
import { verifyPlanAuthority } from './planAuthority.mjs';

export const CHECK_NAMES = Object.freeze([
  'runner_installed',
  'oauth_client_available',
  'oauth_refresh_state_available',
  'gmail_auth_available',
  'raw_transport_available',
  'controller_available',
  'metadata_enumerator_available',
  'private_state_root_valid',
  'plan_authority_valid',
  'run2_github_reuse_count_exact',
  'run2_github_artifact_hashes_valid',
  'run2_github_selection_provenance_valid',
  'run2_github_selection_set_equal',
]);

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

/** Like {@link tryCheck}, but preserves `fn`'s return value instead of coercing it to a boolean. */
function tryCheckValue(fn) {
  try {
    return { value: fn(), error_code: null };
  } catch (error) {
    const code = error && typeof error.code === 'string' ? error.code : 'internal_error';
    return { value: null, error_code: code };
  }
}

/**
 * The controller's private JSON state root must be creatable/writable, and
 * — if a state file already exists there from a prior run — it must be
 * parseable. A corrupted state file must fail closed *here*, at preflight,
 * rather than surfacing later as a confusing construction-time crash inside
 * `Run3AcquisitionController`.
 */
function checkPrivateStateRootValid(statePath) {
  const dir = path.dirname(statePath);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (fs.existsSync(statePath)) {
    const raw = fs.readFileSync(statePath, 'utf8');
    if (raw.length > 0) JSON.parse(raw);
  }
  return true;
}

/**
 * @param {{
 *   env: Record<string, string | undefined>,
 *   statePath: string,
 *   planBuffer: Buffer,
 *   planBoundaryMarker: string,
 *   expectedPlanSha256?: string,
 *   run2ManifestPath: string,
 *   run2ArtifactRoot: string,
 *   run2SelectionResolvedPath: string,
 *   expectedGithubReuseCount?: number,
 * }} input
 */
export async function runRun3Preflight({
  env,
  statePath,
  planBuffer,
  planBoundaryMarker,
  expectedPlanSha256,
  run2ManifestPath,
  run2ArtifactRoot,
  run2SelectionResolvedPath,
  expectedGithubReuseCount = EXPECTED_RUN2_GITHUB_REUSE_COUNT,
}) {
  const results = {};

  results.runner_installed = tryCheck(
    () => typeof Run3AcquisitionController === 'function' && typeof enumerateGmailMetadata === 'function' && typeof acquireGmailRawMessage === 'function',
  );
  results.oauth_client_available = tryCheck(() => isOAuthClientConfigured(env));
  results.oauth_refresh_state_available = tryCheck(() => hasRefreshState(readTokenState(env)));
  results.gmail_auth_available = await tryCheckAsync(async () => (await checkGmailAuth({ env })).available);
  results.raw_transport_available = tryCheck(() => typeof acquireGmailRawMessage === 'function');
  results.controller_available = tryCheck(() => typeof Run3AcquisitionController === 'function');
  results.metadata_enumerator_available = tryCheck(() => typeof enumerateGmailMetadata === 'function');
  results.private_state_root_valid = tryCheck(() => checkPrivateStateRootValid(statePath));
  results.plan_authority_valid = tryCheck(
    () => verifyPlanAuthority({ buffer: planBuffer, boundaryMarker: planBoundaryMarker, expectedSha256: expectedPlanSha256 }).PLAN_AUTHORITY_MATCH,
  );
  results.run2_github_reuse_count_exact = tryCheck(() => checkRun2GithubCountExact(run2ManifestPath, expectedGithubReuseCount));

  const artifactEvidence = tryCheckValue(() => checkRun2GithubArtifactsMatchManifest(run2ManifestPath, run2ArtifactRoot));
  results.run2_github_artifact_hashes_valid = {
    ok: artifactEvidence.value !== null && artifactEvidence.value.exist === true && artifactEvidence.value.hashValid === true,
    error_code: artifactEvidence.error_code,
  };

  results.run2_github_selection_provenance_valid = tryCheck(() => checkRun2GithubSelectionProvenance(run2ManifestPath, run2SelectionResolvedPath));
  results.run2_github_selection_set_equal = tryCheck(() => checkRun2GithubSelectionSetEqual(run2ManifestPath, run2SelectionResolvedPath));

  const checks = {};
  for (const name of CHECK_NAMES) checks[name] = results[name].ok;
  const failedChecks = CHECK_NAMES.filter((name) => !results[name].ok);

  return Object.freeze({
    overall_pass: failedChecks.length === 0,
    checks: Object.freeze(checks),
    failed_checks: Object.freeze(failedChecks),
  });
}
