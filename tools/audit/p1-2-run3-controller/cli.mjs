#!/usr/bin/env node
/**
 * Canonical operator entry point for the Run-3 pre-T0 preflight.
 *
 * AUDIT-ONLY UTILITY. Not part of the Atra runtime.
 *
 *   node tools/audit/p1-2-run3-controller/cli.mjs run3-preflight \
 *     --run2-manifest /secure/local/p1-2-dataset/v1-run2/manifest.private.jsonl \
 *     --run2-artifact-root /secure/local/p1-2-dataset/v1-run2/sources \
 *     --run2-selection-resolved /secure/local/p1-2-dataset/v1-run2/selection-resolved.private.json
 *
 * This is the ONLY operator-facing Run-3 pre-T0 preflight command. It routes
 * through `runRun3Preflight` (`preflight.mjs`), which in turn routes plan
 * authority through the sealed `verifySealedPlanAuthority` (`planAuthority.mjs`)
 * — there is no `--plan-sha256` flag, or any equivalent, anywhere on this
 * path: the plan document and its sidecar are located by a FIXED convention
 * (below), and what counts as their authoritative hash is a pinned constant
 * baked into `planAuthority.mjs`, never a value this CLI reads from argv or
 * lets a caller override.
 *
 * Plan document and sidecar paths (fixed convention, env-overridable for
 * tests only — overriding *where* the file lives is not the same thing as
 * overriding *what hash counts as authoritative*, which remains pinned in
 * `planAuthority.mjs` regardless of either variable):
 *
 *   ATRA_P1_2_RUN3_PLAN_PATH          default: ~/atra-private/p1-2-dataset/RUN3_PREREGISTRATION.md
 *   ATRA_P1_2_RUN3_PLAN_SIDECAR_PATH  default: ~/atra-private/p1-2-dataset/RUN3_PREREGISTRATION.sha256
 *   ATRA_P1_2_RUN3_STATE_PATH         default: ~/atra-private/p1-2-dataset/v1-run3/controller-state/state.private.json
 *
 * `--run2-manifest`, `--run2-artifact-root`, and `--run2-selection-resolved`
 * remain operator-supplied flags: they point at already-integrity-checked
 * Run-2 evidence (byte-verified inside `runRun3Preflight` itself against its
 * own pinned reuse count and content hashes), not at anything that redefines
 * what counts as authoritative for the plan.
 *
 * Any flag that would let a caller supply or override an expected plan hash
 * (`--plan-sha256`, `--expected-plan-sha`, `--expectedSha256`,
 * `--authority-hash`, or any equivalent) is refused as an unknown/forbidden
 * argument — argument parsing fails outright, it is never silently ignored.
 *
 * READ-ONLY: this command never creates the private state root, never
 * constructs a `Run3AcquisitionController`, never records T0, never calls
 * the Gmail RAW transport. Missing prerequisites fail the gate; nothing is
 * auto-repaired.
 *
 * Prints only content-free results: check names, booleans, and the fixed
 * overall PASS/FAIL. Never plan contents, Gmail identities, subjects,
 * sender/recipient, snippets, RAW bytes, or any OAuth/refresh/client secret.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runRun3Preflight } from './preflight.mjs';

export const PLAN_PATH_ENV = 'ATRA_P1_2_RUN3_PLAN_PATH';
export const PLAN_SIDECAR_PATH_ENV = 'ATRA_P1_2_RUN3_PLAN_SIDECAR_PATH';
export const STATE_PATH_ENV = 'ATRA_P1_2_RUN3_STATE_PATH';

const DEFAULT_DATASET_ROOT = path.join(os.homedir(), 'atra-private', 'p1-2-dataset');
const DEFAULT_PLAN_PATH = path.join(DEFAULT_DATASET_ROOT, 'RUN3_PREREGISTRATION.md');
const DEFAULT_PLAN_SIDECAR_PATH = path.join(DEFAULT_DATASET_ROOT, 'RUN3_PREREGISTRATION.sha256');
const DEFAULT_STATE_PATH = path.join(DEFAULT_DATASET_ROOT, 'v1-run3', 'controller-state', 'state.private.json');

const USAGE = [
  'usage:',
  '  cli.mjs run3-preflight --run2-manifest <path> --run2-artifact-root <dir> \\',
  '    --run2-selection-resolved <path>',
  '',
  `  Plan document, sidecar, and controller state paths are fixed by convention`,
  `  (override only via ${PLAN_PATH_ENV} / ${PLAN_SIDECAR_PATH_ENV} / ${STATE_PATH_ENV}, never a flag).`,
].join('\n');

/**
 * Flags this command must refuse outright, even though none of them are in
 * the allowed flag map below — listed explicitly so a reader (and a test)
 * can see this is a deliberate refusal, not an accidental omission.
 */
const FORBIDDEN_AUTHORITY_FLAGS = Object.freeze(['--plan-sha256', '--expected-plan-sha', '--expectedSha256', '--authority-hash']);

const RUN3_PREFLIGHT_FLAG_MAP = Object.freeze({
  '--run2-manifest': 'run2ManifestPath',
  '--run2-artifact-root': 'run2ArtifactRoot',
  '--run2-selection-resolved': 'run2SelectionResolvedPath',
});

function parseRun3PreflightArgs(argv) {
  const options = { run2ManifestPath: null, run2ArtifactRoot: null, run2SelectionResolvedPath: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (FORBIDDEN_AUTHORITY_FLAGS.includes(arg)) return { invalid: 'argument_forbidden_authority_override' };
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) return { invalid: 'argument_invalid' };
    i += 1;
    const key = RUN3_PREFLIGHT_FLAG_MAP[arg];
    // Unknown flags (including any not-yet-imagined spelling of an
    // authority-hash override) are refused, not ignored.
    if (key === undefined) return { invalid: 'argument_unknown' };
    options[key] = value;
  }
  if (Object.values(options).some((value) => value === null)) return { invalid: 'argument_invalid' };
  return options;
}

/**
 * Reads a fixed-path file into a Buffer, or returns `undefined` if it is
 * absent/unreadable. `undefined` is deliberate, not `Buffer.alloc(0)`: it
 * lets the sealed plan-authority verifier's own `Buffer.isBuffer` guard
 * produce its normal stable "missing" failure code, exactly as it does for
 * any other caller that never had the file to begin with — no special
 * casing needed here for "file absent" versus "file present but wrong".
 */
function readOptionalBuffer(filePath) {
  try {
    return fs.readFileSync(filePath);
  } catch {
    return undefined;
  }
}

/**
 * @param {ReadonlyArray<string>} argv
 * @param {Record<string, string|undefined>} env
 * @returns {Promise<number>} process exit code
 */
export async function main(argv, env) {
  const [command, ...rest] = argv;

  if (command === 'run3-preflight') {
    const options = parseRun3PreflightArgs(rest);
    if (options.invalid) {
      process.stdout.write(`${JSON.stringify({ error_code: options.invalid }, null, 2)}\n`);
      return 2;
    }

    const planPath = (env && env[PLAN_PATH_ENV]) || DEFAULT_PLAN_PATH;
    const sidecarPath = (env && env[PLAN_SIDECAR_PATH_ENV]) || DEFAULT_PLAN_SIDECAR_PATH;
    const statePath = (env && env[STATE_PATH_ENV]) || DEFAULT_STATE_PATH;

    const planBuffer = readOptionalBuffer(planPath);
    const sidecarBuffer = readOptionalBuffer(sidecarPath);

    // No `planAuthorityVerifier` override is ever passed here — this always
    // exercises the real, pinned-constant-bound `verifySealedPlanAuthority`.
    const result = await runRun3Preflight({
      env,
      statePath,
      planBuffer,
      sidecarBuffer,
      run2ManifestPath: options.run2ManifestPath,
      run2ArtifactRoot: options.run2ArtifactRoot,
      run2SelectionResolvedPath: options.run2SelectionResolvedPath,
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
