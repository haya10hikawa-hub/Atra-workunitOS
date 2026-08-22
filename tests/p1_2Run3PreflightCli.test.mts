/**
 * Validation suite for the canonical Run-3 pre-T0 preflight operator
 * entrypoint (`tools/audit/p1-2-run3-controller/cli.mjs run3-preflight`).
 *
 * This closes P1_2_RUN3_UNSEALED_PLAN_AUTHORITY_ON_OPERATOR_PATH: before this
 * repair, the only real operator-facing preflight command
 * (`p1-2-gmail-raw-transport/cli.mjs preflight`) accepted an
 * operator-supplied `--plan-sha256` and self-certified against it, while the
 * properly-sealed `runRun3Preflight` had no CLI caller at all. This suite
 * exercises the real exported command handler (`main`, from `cli.mjs`) end
 * to end — argument parsing, fixed-path plan/sidecar resolution, and content
 * -free output — not just internal helper functions.
 *
 * Every identity and credential here is synthetic. No test performs a real
 * network request: `globalThis.fetch` is mocked outright. No test calls
 * `recordT0`, `runCanary`, `acquireNext`, or constructs a
 * `Run3AcquisitionController`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CREDENTIAL_ENV, sha256Hex } from '../tools/audit/p1-2-gmail-raw-transport/gmailRaw.mjs';
import { OAUTH_CREDENTIALS_PATH_ENV, OAUTH_TOKEN_PATH_ENV } from '../tools/audit/p1-2-gmail-raw-transport/oauthCredential.mjs';
import { CHECK_NAMES } from '../tools/audit/p1-2-run3-controller/preflight.mjs';
import { PLAN_AUTHORITY_BYTE_LENGTH, PLAN_AUTHORITY_SHA256 } from '../tools/audit/p1-2-run3-controller/planAuthority.mjs';
import { PLAN_PATH_ENV, PLAN_SIDECAR_PATH_ENV, STATE_PATH_ENV, main } from '../tools/audit/p1-2-run3-controller/cli.mjs';

// The two specific historical/superseded plan-authority values that must
// stay rejected even by a self-consistent sidecar claim — see the PR
// description / ratified Run-3 contract. Recorded here purely as literal
// test data; production code never references them (there is no fallback
// list anywhere in `planAuthority.mjs` — `verifySealedPlanAuthority` has
// exactly one accepted value, so any string other than the current pinned
// `PLAN_AUTHORITY_SHA256` is rejected by construction, these two included).
const HISTORICAL_STALE_HASH_A = 'a9264c5f1bab6b42a29bcfd8190d58770010bde75bb3d536ee1dd1267ed38e2e2';
const HISTORICAL_STALE_HASH_B = 'f99b80f1891f1a6d1a283a07b2bb57895e9078894538b932a035d8affd9ef0b3';

async function withTmpRoot<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), 'p1-2-run3-cli-'));
  try {
    return await fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function mockFetchOnce(handler: typeof fetch) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return () => {
    globalThis.fetch = original;
  };
}

/** Captures everything `main` writes to stdout, without ever printing it. */
async function runCli(argv: string[], env: Record<string, string | undefined>) {
  const original = process.stdout.write.bind(process.stdout);
  const chunks: string[] = [];
  process.stdout.write = (chunk: string) => {
    chunks.push(String(chunk));
    return true;
  };
  let exitCode: number;
  try {
    exitCode = await main(argv, env);
  } finally {
    process.stdout.write = original;
  }
  const stdout = chunks.join('');
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    // some paths (bare USAGE) are not JSON — callers that need JSON assert on `parsed`
  }
  return { exitCode, stdout, parsed };
}

function writeSynthOAuthFixture(root: string) {
  const credentialsPath = join(root, 'credentials.json');
  const tokenPath = join(root, 'token.json');
  writeFileSync(
    credentialsPath,
    JSON.stringify({ installed: { client_id: 'synthetic-client-id.apps.googleusercontent.com', client_secret: 'SYNTHETIC_SECRET_MUST_NOT_LEAK', redirect_uris: ['http://localhost'] } }),
  );
  writeFileSync(
    tokenPath,
    JSON.stringify({ refresh_token: 'SYNTHETIC_REFRESH_TOKEN_MUST_NOT_LEAK', access_token: 'SYNTHETIC_ACCESS_TOKEN', expiry_date: Date.now() + 3_600_000, scope: 'https://www.googleapis.com/auth/gmail.readonly' }),
  );
  return { [OAUTH_CREDENTIALS_PATH_ENV]: credentialsPath, [OAUTH_TOKEN_PATH_ENV]: tokenPath };
}

function synthGithubArtifactBytes(id: string) {
  return Buffer.from(id);
}

function synthGithubManifestLine(id: string, prNumber: number) {
  return JSON.stringify({
    dataset_record_id: id,
    provider: 'github',
    resource_class: 'github_pull_request',
    content_sha256: sha256Hex(synthGithubArtifactBytes(id)),
    provider_identity_commitment_sha256: sha256Hex(Buffer.from(`identity-${id}`)),
    observed_at: '2026-08-21T01:33:45Z',
    source_event_at: '2026-08-15T00:00:00Z',
    work_universe_id: 'U-COLLAB',
    raw_artifact_relative_path: `synthetic-pr-${prNumber}.json`,
  });
}

function buildGithubFixture(root: string, count = 34) {
  const manifestPath = join(root, 'manifest.jsonl');
  const artifactRoot = join(root, 'artifacts');
  mkdirSync(artifactRoot, { recursive: true });
  const lines: string[] = [];
  const selected: number[] = [];
  for (let i = 1; i <= count; i += 1) {
    const id = `P1D-${String(i).padStart(4, '0')}`;
    lines.push(synthGithubManifestLine(id, i));
    writeFileSync(join(artifactRoot, `synthetic-pr-${i}.json`), synthGithubArtifactBytes(id));
    selected.push(i);
  }
  writeFileSync(manifestPath, lines.join('\n'));
  const selectionResolvedPath = join(root, 'selection-resolved.json');
  writeFileSync(selectionResolvedPath, JSON.stringify({ 'U-COLLAB': { github_pull_request: { selected } } }));
  return { manifestPath, artifactRoot, selectionResolvedPath };
}

function run2Flags(fixture: { manifestPath: string; artifactRoot: string; selectionResolvedPath: string }) {
  return ['--run2-manifest', fixture.manifestPath, '--run2-artifact-root', fixture.artifactRoot, '--run2-selection-resolved', fixture.selectionResolvedPath];
}

/** A synthetic plan buffer of exactly the pinned byte length, deterministic but not the real ratified plan's bytes. */
function syntheticPlanBuffer(byteLength = PLAN_AUTHORITY_BYTE_LENGTH) {
  const buffer = Buffer.alloc(byteLength);
  for (let i = 0; i < byteLength; i += 1) buffer[i] = (i * 31 + 7) % 256;
  return buffer;
}

function sidecarFor(hash: string) {
  return Buffer.from(`${hash}  RUN3_PREREGISTRATION.md\n`, 'utf8');
}

function baseEnv(root: string, overrides: Record<string, string | undefined> = {}) {
  return {
    [CREDENTIAL_ENV]: 'SYNTHETIC_READONLY_TOKEN',
    [PLAN_PATH_ENV]: join(root, 'RUN3_PREREGISTRATION.md'),
    [PLAN_SIDECAR_PATH_ENV]: join(root, 'RUN3_PREREGISTRATION.sha256'),
    [STATE_PATH_ENV]: (() => {
      const dir = join(root, 'private-state');
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      return join(dir, 'state.private.json');
    })(),
    ...writeSynthOAuthFixture(root),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// O1 — canonical synthetic-equivalent valid sealed authority
//
// `verifySealedPlanAuthority`'s pinned hash (`PLAN_AUTHORITY_SHA256`) cannot
// be matched by any buffer this test can construct without a SHA-256
// preimage, so this cannot literally drive the real CLI to overall_pass:
// true the way it would with the real private ratified plan file. Instead
// this proves the CLI's own wiring — argument parsing, fixed-path
// plan/sidecar resolution, and every OTHER structural check — is fully
// correct by showing `plan_authority_valid` is the ONLY failing check when a
// self-consistent, correctly-sized synthetic plan/sidecar pair is supplied:
// if this fixture's bytes happened to be the real ratified plan (matching
// hash), overall_pass would be true. The full pinned-authority PASS path
// itself (the logic `plan_authority_valid` gates on) is separately proven
// end to end at the `runRun3Preflight` composition layer — one level below
// this CLI wrapper, which adds no logic beyond "read fixed paths, call
// runRun3Preflight with no override, print" — by
// `tests/p1_2Run3FinalIntegration.test.mts` "preflight F1", using the
// documented `planAuthorityVerifier` test seam (never reachable from this
// CLI or any production caller).
// ---------------------------------------------------------------------------

test('O1: every check EXCEPT plan_authority_valid passes for an otherwise-correct fixture (see comment: full PASS proven at the composition layer, F1)', async () => {
  await withTmpRoot(async (root) => {
    const github = buildGithubFixture(root, 34);
    const plan = syntheticPlanBuffer();
    const planHash = createHash('sha256').update(plan).digest('hex');
    writeFileSync(join(root, 'RUN3_PREREGISTRATION.md'), plan);
    writeFileSync(join(root, 'RUN3_PREREGISTRATION.sha256'), sidecarFor(planHash));
    const env = baseEnv(root);
    const restore = mockFetchOnce(async () => new Response(JSON.stringify({}), { status: 200 }));
    try {
      const { exitCode, parsed } = await runCli(['run3-preflight', ...run2Flags(github)], env);
      const result = parsed as { overall_pass: boolean; failed_checks: string[]; checks: Record<string, boolean> };
      assert.deepEqual(result.failed_checks, ['plan_authority_valid']);
      assert.equal(result.overall_pass, false);
      assert.equal(exitCode, 2);
      for (const name of CHECK_NAMES) {
        if (name === 'plan_authority_valid') continue;
        assert.equal(result.checks[name], true, `expected ${name} to pass`);
      }
    } finally {
      restore();
    }
  });
});

test('O2: a wrong plan hash fails plan_authority_valid', async () => {
  await withTmpRoot(async (root) => {
    const github = buildGithubFixture(root, 34);
    const plan = syntheticPlanBuffer();
    writeFileSync(join(root, 'RUN3_PREREGISTRATION.md'), plan);
    // Sidecar claims a hash that matches neither the plan's real hash nor the pinned authority.
    writeFileSync(join(root, 'RUN3_PREREGISTRATION.sha256'), sidecarFor('0'.repeat(64)));
    const env = baseEnv(root);
    const restore = mockFetchOnce(async () => new Response(JSON.stringify({}), { status: 200 }));
    try {
      const { parsed } = await runCli(['run3-preflight', ...run2Flags(github)], env);
      const result = parsed as { overall_pass: boolean; failed_checks: string[] };
      assert.ok(result.failed_checks.includes('plan_authority_valid'));
      assert.equal(result.overall_pass, false);
    } finally {
      restore();
    }
  });
});

test('O3: a correctly self-consistent attacker plan + sidecar (rewritten to match each other) still fails — proves this is not just self-consistency checking', async () => {
  await withTmpRoot(async (root) => {
    const github = buildGithubFixture(root, 34);
    const attackerPlan = Buffer.alloc(PLAN_AUTHORITY_BYTE_LENGTH, 0x41);
    const attackerHash = createHash('sha256').update(attackerPlan).digest('hex');
    assert.notEqual(attackerHash, PLAN_AUTHORITY_SHA256, 'sanity: the attacker plan must not accidentally be the real ratified plan');
    writeFileSync(join(root, 'RUN3_PREREGISTRATION.md'), attackerPlan);
    // The attacker rewrote the sidecar to self-consistently match their own plan's hash.
    writeFileSync(join(root, 'RUN3_PREREGISTRATION.sha256'), sidecarFor(attackerHash));
    const env = baseEnv(root);
    const restore = mockFetchOnce(async () => new Response(JSON.stringify({}), { status: 200 }));
    try {
      const { parsed } = await runCli(['run3-preflight', ...run2Flags(github)], env);
      const result = parsed as { overall_pass: boolean; failed_checks: string[] };
      assert.ok(result.failed_checks.includes('plan_authority_valid'));
      assert.equal(result.overall_pass, false);
    } finally {
      restore();
    }
  });
});

test('O4: a wrong plan byte size fails plan_authority_valid', async () => {
  await withTmpRoot(async (root) => {
    const github = buildGithubFixture(root, 34);
    const plan = syntheticPlanBuffer(PLAN_AUTHORITY_BYTE_LENGTH - 1);
    const planHash = createHash('sha256').update(plan).digest('hex');
    writeFileSync(join(root, 'RUN3_PREREGISTRATION.md'), plan);
    writeFileSync(join(root, 'RUN3_PREREGISTRATION.sha256'), sidecarFor(planHash));
    const env = baseEnv(root);
    const restore = mockFetchOnce(async () => new Response(JSON.stringify({}), { status: 200 }));
    try {
      const { parsed } = await runCli(['run3-preflight', ...run2Flags(github)], env);
      const result = parsed as { overall_pass: boolean; failed_checks: string[] };
      assert.ok(result.failed_checks.includes('plan_authority_valid'));
      assert.equal(result.overall_pass, false);
    } finally {
      restore();
    }
  });
});

test('O5: a sidecar claiming the historical stale hash A fails (never accepted, even as a self-consistency claim)', async () => {
  await withTmpRoot(async (root) => {
    const github = buildGithubFixture(root, 34);
    const plan = syntheticPlanBuffer();
    writeFileSync(join(root, 'RUN3_PREREGISTRATION.md'), plan);
    writeFileSync(join(root, 'RUN3_PREREGISTRATION.sha256'), sidecarFor(HISTORICAL_STALE_HASH_A));
    const env = baseEnv(root);
    const restore = mockFetchOnce(async () => new Response(JSON.stringify({}), { status: 200 }));
    try {
      assert.notEqual(HISTORICAL_STALE_HASH_A, PLAN_AUTHORITY_SHA256);
      const { parsed } = await runCli(['run3-preflight', ...run2Flags(github)], env);
      const result = parsed as { overall_pass: boolean; failed_checks: string[] };
      assert.ok(result.failed_checks.includes('plan_authority_valid'));
      assert.equal(result.overall_pass, false);
    } finally {
      restore();
    }
  });
});

test('O6: a sidecar claiming the historical stale hash B fails (never accepted, even as a self-consistency claim)', async () => {
  await withTmpRoot(async (root) => {
    const github = buildGithubFixture(root, 34);
    const plan = syntheticPlanBuffer();
    writeFileSync(join(root, 'RUN3_PREREGISTRATION.md'), plan);
    writeFileSync(join(root, 'RUN3_PREREGISTRATION.sha256'), sidecarFor(HISTORICAL_STALE_HASH_B));
    const env = baseEnv(root);
    const restore = mockFetchOnce(async () => new Response(JSON.stringify({}), { status: 200 }));
    try {
      assert.notEqual(HISTORICAL_STALE_HASH_B, PLAN_AUTHORITY_SHA256);
      const { parsed } = await runCli(['run3-preflight', ...run2Flags(github)], env);
      const result = parsed as { overall_pass: boolean; failed_checks: string[] };
      assert.ok(result.failed_checks.includes('plan_authority_valid'));
      assert.equal(result.overall_pass, false);
    } finally {
      restore();
    }
  });
});

test('O7: a missing sidecar fails plan_authority_valid, not a crash', async () => {
  await withTmpRoot(async (root) => {
    const github = buildGithubFixture(root, 34);
    const plan = syntheticPlanBuffer();
    writeFileSync(join(root, 'RUN3_PREREGISTRATION.md'), plan);
    // Sidecar deliberately never written.
    const env = baseEnv(root);
    const restore = mockFetchOnce(async () => new Response(JSON.stringify({}), { status: 200 }));
    try {
      const { parsed, exitCode } = await runCli(['run3-preflight', ...run2Flags(github)], env);
      const result = parsed as { overall_pass: boolean; failed_checks: string[] };
      assert.ok(result.failed_checks.includes('plan_authority_valid'));
      assert.equal(result.overall_pass, false);
      assert.equal(exitCode, 2);
    } finally {
      restore();
    }
  });
});

test('O8: a malformed sidecar (no parseable hash) fails plan_authority_valid, not a crash', async () => {
  await withTmpRoot(async (root) => {
    const github = buildGithubFixture(root, 34);
    const plan = syntheticPlanBuffer();
    writeFileSync(join(root, 'RUN3_PREREGISTRATION.md'), plan);
    writeFileSync(join(root, 'RUN3_PREREGISTRATION.sha256'), 'not a hash at all, just some prose');
    const env = baseEnv(root);
    const restore = mockFetchOnce(async () => new Response(JSON.stringify({}), { status: 200 }));
    try {
      const { parsed } = await runCli(['run3-preflight', ...run2Flags(github)], env);
      const result = parsed as { overall_pass: boolean; failed_checks: string[] };
      assert.ok(result.failed_checks.includes('plan_authority_valid'));
      assert.equal(result.overall_pass, false);
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// O9 — forbidden operator-controlled authority flags
// ---------------------------------------------------------------------------

test('O9: --plan-sha256 fails argument parsing outright, not silently ignored', async () => {
  await withTmpRoot(async (root) => {
    const github = buildGithubFixture(root, 34);
    const env = baseEnv(root);
    const { exitCode, parsed } = await runCli(['run3-preflight', ...run2Flags(github), '--plan-sha256', 'a'.repeat(64)], env);
    assert.equal(exitCode, 2);
    assert.equal((parsed as { error_code: string }).error_code, 'argument_forbidden_authority_override');
  });
});

test('O9b: --expected-plan-sha, --expectedSha256, and --authority-hash are all refused the same way', async () => {
  await withTmpRoot(async (root) => {
    const github = buildGithubFixture(root, 34);
    const env = baseEnv(root);
    for (const flag of ['--expected-plan-sha', '--expectedSha256', '--authority-hash']) {
      const { exitCode, parsed } = await runCli(['run3-preflight', ...run2Flags(github), flag, 'a'.repeat(64)], env);
      assert.equal(exitCode, 2, `expected ${flag} to be refused`);
      assert.equal((parsed as { error_code: string }).error_code, 'argument_forbidden_authority_override');
    }
  });
});

test('O9c: an entirely unrecognized flag is also refused, not ignored', async () => {
  await withTmpRoot(async (root) => {
    const github = buildGithubFixture(root, 34);
    const env = baseEnv(root);
    const { exitCode, parsed } = await runCli(['run3-preflight', ...run2Flags(github), '--some-made-up-flag', 'value'], env);
    assert.equal(exitCode, 2);
    assert.equal((parsed as { error_code: string }).error_code, 'argument_unknown');
  });
});

// ---------------------------------------------------------------------------
// O10 — content-free output
// ---------------------------------------------------------------------------

test('O10: operator output never contains plan bytes, Gmail identities, tokens, or secrets', async () => {
  await withTmpRoot(async (root) => {
    const github = buildGithubFixture(root, 34);
    const plan = syntheticPlanBuffer();
    const planHash = createHash('sha256').update(plan).digest('hex');
    writeFileSync(join(root, 'RUN3_PREREGISTRATION.md'), plan);
    writeFileSync(join(root, 'RUN3_PREREGISTRATION.sha256'), sidecarFor(planHash));
    const env = baseEnv(root, { GMAIL_ACCESS_TOKEN: 'SEND_CAPABLE_TOKEN_MUST_NOT_LEAK' });
    const restore = mockFetchOnce(async () => new Response(JSON.stringify({ id: 'me', emailAddress: 'victim@example.com' }), { status: 200 }));
    try {
      const { stdout } = await runCli(['run3-preflight', ...run2Flags(github)], env);
      assert.equal(stdout.includes('victim@example.com'), false);
      assert.equal(stdout.includes('SYNTHETIC_READONLY_TOKEN'), false);
      assert.equal(stdout.includes('SYNTHETIC_SECRET_MUST_NOT_LEAK'), false);
      assert.equal(stdout.includes('SYNTHETIC_REFRESH_TOKEN_MUST_NOT_LEAK'), false);
      assert.equal(stdout.includes('SEND_CAPABLE_TOKEN_MUST_NOT_LEAK'), false);
      // The plan's own bytes must never appear either — spot-check a slice of them.
      assert.equal(stdout.includes(plan.subarray(0, 32).toString('latin1')), false);
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// Read-only / purity
// ---------------------------------------------------------------------------

test('purity: run3-preflight never creates the private state root or writes anything under the dataset root', async () => {
  await withTmpRoot(async (root) => {
    const github = buildGithubFixture(root, 34);
    const plan = syntheticPlanBuffer();
    const planHash = createHash('sha256').update(plan).digest('hex');
    writeFileSync(join(root, 'RUN3_PREREGISTRATION.md'), plan);
    writeFileSync(join(root, 'RUN3_PREREGISTRATION.sha256'), sidecarFor(planHash));
    // Deliberately point STATE_PATH_ENV at a directory that is never created.
    const neverCreatedStatePath = join(root, 'private-state-never-created', 'state.private.json');
    const env = { ...baseEnv(root), [STATE_PATH_ENV]: neverCreatedStatePath };
    const restore = mockFetchOnce(async () => new Response(JSON.stringify({}), { status: 200 }));
    try {
      const { parsed } = await runCli(['run3-preflight', ...run2Flags(github)], env);
      const result = parsed as { checks: Record<string, boolean> };
      assert.equal(result.checks.private_state_root_valid, false);
      assert.equal(existsSync(join(root, 'private-state-never-created')), false);
    } finally {
      restore();
    }
  });
});

test('usage: with no command, prints usage and never mentions a --plan-sha256-style flag', async () => {
  const { exitCode, stdout } = await runCli([], {});
  assert.equal(exitCode, 0);
  assert.equal(stdout.includes('--plan-sha256'), false);
  assert.ok(stdout.includes('run3-preflight'));
});
