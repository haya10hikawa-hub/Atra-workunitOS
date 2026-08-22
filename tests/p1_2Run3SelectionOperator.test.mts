/**
 * Validation suite for the canonical Run-3 metadata-selection operator
 * entrypoint (`tools/audit/p1-2-run3-controller/cli.mjs run3-select`, and the
 * composition it delegates to, `selectOperator.mjs`).
 *
 * This closes P1_2_RUN3_NO_CANONICAL_SELECTION_ENTRYPOINT: every underlying
 * mechanism (controller, state store, metadata enumerator, selection rule,
 * pinned protocol constants) was already merged and reviewed, but no
 * operator-facing command composed them, so the only way to move a run from
 * PRE_T0 to METADATA_SELECTION_RESOLVED was an ad-hoc script — i.e. an
 * unreviewed second implementation of Run-3 authority.
 *
 * ABSOLUTE TEST BOUNDARY. Nothing here contacts Gmail: `globalThis.fetch` is
 * replaced for the whole file with a function that throws, so a live request
 * cannot be made even by accident, and every enumeration is injected
 * synthetically. Nothing here writes to the real private Run-3 state root —
 * every state path is inside a per-test temporary directory. No test calls
 * `recordT0`, `runCanary`, `acquireNext`, or the Gmail RAW transport; the
 * suite proves those are unreachable rather than exercising them.
 */

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { Run3AcquisitionController, STATES } from '../tools/audit/p1-2-run3-controller/controller.mjs';
import { MetadataEnumeratorError } from '../tools/audit/p1-2-run3-controller/metadataEnumerator.mjs';
import {
  ACQUISITION_DURATION_HOURS,
  EXPECTED_GITHUB_REUSE,
  EXPECTED_GMAIL_NEW,
  EXPECTED_TOTAL,
  PLAN_AUTHORITY_SHA256,
} from '../tools/audit/p1-2-run3-controller/protocolConstants.mjs';
import { RULE_ID, SAMPLE_SIZE, V1_WINDOW_END_MS, V1_WINDOW_START_MS } from '../tools/audit/p1-2-run3-controller/selection.mjs';
import {
  STATUS_ALREADY_RESOLVED,
  STATUS_RESOLVED,
  buildPinnedAuthorizationRecord,
  buildPinnedConfig,
  runRun3Select,
  toStableErrorCode,
  validateRunId,
} from '../tools/audit/p1-2-run3-controller/selectOperator.mjs';
import { main } from '../tools/audit/p1-2-run3-controller/cli.mjs';

/* ------------------------------------------------------------------ *
 * Absolute no-live-network guard for this entire file.
 * ------------------------------------------------------------------ */

const originalFetch = globalThis.fetch;
globalThis.fetch = (() => {
  throw new Error('P1_2_RUN3_TEST_LIVE_NETWORK_FORBIDDEN');
}) as unknown as typeof fetch;
after(() => {
  globalThis.fetch = originalFetch;
});

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

const RUN_ID = 'run3-v1-test';

type Candidate = { message_id: string; internalDate: string };
type Enumerate = Parameters<typeof runRun3Select>[0]['enumerate'];

/** Creates a temp state root at the requested mode and returns its state path. */
function makeStateRoot(mode = 0o700): { statePath: string; root: string } {
  const root = mkdtempSync(join(tmpdir(), 'p1-2-run3-select-'));
  const dir = join(root, 'controller-state');
  mkdirSync(dir);
  chmodSync(dir, mode);
  return { statePath: join(dir, 'state.private.json'), root };
}

function cleanup(root: string): void {
  try {
    // Restore a traversable mode first so rm can descend into 0500-style roots.
    chmodSync(join(root, 'controller-state'), 0o700);
  } catch {
    // The directory legitimately may not exist in absent-root tests.
  }
  rmSync(root, { recursive: true, force: true });
}

async function withStateRoot<T>(mode: number, fn: (statePath: string) => Promise<T>): Promise<T> {
  const { statePath, root } = makeStateRoot(mode);
  try {
    return await fn(statePath);
  } finally {
    cleanup(root);
  }
}

/** Synthetic in-window `{message_id, internalDate}` universe. Never a real identity. */
function syntheticCandidates(count: number, prefix = 'synthetic-msg-'): Candidate[] {
  const span = V1_WINDOW_END_MS - V1_WINDOW_START_MS;
  return Array.from({ length: count }, (_unused, i) => ({
    message_id: `${prefix}${i}`,
    internalDate: String(V1_WINDOW_START_MS + Math.floor((span * i) / Math.max(count, 1))),
  }));
}

/** An enumerator that returns a fixed synthetic universe and records its calls. */
function fakeEnumerator(candidates: Candidate[]): { enumerate: Enumerate; calls: unknown[] } {
  const calls: unknown[] = [];
  const enumerate = async (input: unknown) => {
    calls.push(input);
    return Object.freeze({
      candidates: Object.freeze([...candidates]),
      eligible: Object.freeze([...candidates]),
      pageCount: 1,
    });
  };
  return { enumerate: enumerate as unknown as Enumerate, calls };
}

/** An enumerator that fails the test if it is ever called. */
function forbiddenEnumerator(): { enumerate: Enumerate; calls: unknown[] } {
  const calls: unknown[] = [];
  const enumerate = async (input: unknown) => {
    calls.push(input);
    throw new Error('P1_2_RUN3_TEST_ENUMERATION_MUST_NOT_HAPPEN');
  };
  return { enumerate: enumerate as unknown as Enumerate, calls };
}

/** An enumerator that always throws the given stable audit error. */
function throwingEnumerator(code: string): Enumerate {
  const enumerate = async () => {
    throw new MetadataEnumeratorError(code);
  };
  return enumerate as unknown as Enumerate;
}

/**
 * Wraps the REAL controller and records every externally-invoked method, so a
 * test can assert both what was called (authorizePM/resolveSelection) and —
 * more importantly — what was NOT (recordT0/runCanary/acquireNext).
 *
 * Methods are applied to the raw target, so the controller's own internal
 * calls never appear: `calls` is exactly the operator-path call graph.
 */
function spyControllerFactory(): {
  factory: NonNullable<Parameters<typeof runRun3Select>[0]['controllerFactory']>;
  calls: string[];
  configs: unknown[];
} {
  const calls: string[] = [];
  const configs: unknown[] = [];
  const factory = (config: unknown, stateStore: unknown, clock: unknown) => {
    configs.push(config);
    const real = new Run3AcquisitionController(config as never, stateStore as never, clock as never);
    return new Proxy(real, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        if (typeof value !== 'function') return value;
        return (...args: unknown[]) => {
          calls.push(String(prop));
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      },
    });
  };
  return {
    factory: factory as unknown as NonNullable<Parameters<typeof runRun3Select>[0]['controllerFactory']>,
    calls,
    configs,
  };
}

function readState(statePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(statePath, 'utf8')) as Record<string, unknown>;
}

/** Seeds a persisted controller state record directly, bypassing the controller. */
function seedState(statePath: string, record: object): void {
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, JSON.stringify(record, null, 2), { mode: 0o600 });
}

function pmAuthorizedRecord(runId = RUN_ID): Record<string, unknown> {
  return {
    state: STATES.PM_AUTHORIZED,
    pmAuthorization: buildPinnedAuthorizationRecord(runId),
    selection: null,
    t0: null,
    deadline: null,
    completed: [],
    destinationsUsed: [],
    voidReason: null,
    validation: null,
    acquisitionInFlight: null,
  };
}

/** Runs `main` with stdout captured, never printed. */
async function runCli(argv: string[], env: Record<string, string | undefined> = {}): Promise<{ code: number; out: string }> {
  const stdout = process.stdout as unknown as { write: (chunk: string) => boolean };
  const originalWrite = stdout.write;
  let out = '';
  stdout.write = (chunk: string) => {
    out += chunk;
    return true;
  };
  try {
    const code = await main(argv, env);
    return { code, out };
  } finally {
    stdout.write = originalWrite;
  }
}

async function expectCode(promise: Promise<unknown>, expected: string): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.equal((error as { code?: string }).code, expected);
    return true;
  });
}

/* ================================================================== *
 * A. CLI SURFACE
 * ================================================================== */

test('A1: run3-select is a recognized command, not the usage fallback', async () => {
  // A missing --run-id must be an ARGUMENT error from the run3-select
  // handler rather than the generic usage text — that is what proves the
  // command is actually wired in.
  const { code, out } = await runCli(['run3-select']);
  assert.equal(code, 2);
  assert.deepEqual(JSON.parse(out), { error_code: 'argument_invalid' });
});

test('A2: missing --run-id is rejected', async () => {
  const { code, out } = await runCli(['run3-select', '--authorize-pm']);
  assert.equal(code, 2);
  assert.deepEqual(JSON.parse(out), { error_code: 'argument_invalid' });
});

test('A3: missing --authorize-pm is rejected before any state or Gmail access', async () => {
  const { code, out } = await runCli(['run3-select', '--run-id', RUN_ID]);
  assert.equal(code, 2);
  assert.deepEqual(JSON.parse(out), { error_code: 'pm_authorization_required' });
});

test('A4: run-id validation is bounded and non-secret', async () => {
  const rejected = ['', ' ', 'has space', '../escape', 'a/b', 'a\\b', 'tab\there', 'nl\nhere', 'x'.repeat(65), 'emoji-\u{1F642}'];
  for (const bad of rejected) {
    assert.throws(
      () => validateRunId(bad),
      (error: unknown) => (error as { code?: string }).code === 'run_id_invalid',
      `expected rejection of ${JSON.stringify(bad)}`,
    );
  }
  for (const good of ['a', 'run3-v1', 'RUN_3.v1-2026', 'x'.repeat(64)]) {
    assert.equal(validateRunId(good), good);
  }
});

test('A5: unknown flags fail closed', async () => {
  for (const unknown of ['--nope', '--run', '--authorize', '--verbose']) {
    const { code, out } = await runCli(['run3-select', '--run-id', RUN_ID, '--authorize-pm', unknown, 'v']);
    assert.equal(code, 2);
    assert.equal(JSON.parse(out).error_code, 'argument_unknown', `expected unknown-flag refusal for ${unknown}`);
  }
});

test('A6: authority override flags are refused outright', async () => {
  const authorityFlags = [
    '--plan-sha256',
    '--expected-plan-sha',
    '--authority-hash',
    '--expected-github-reuse',
    '--expected-gmail-new',
    '--expected-total',
    '--total',
    '--acquisition-duration-hours',
    '--duration',
    '--pm-authorization',
    '--authorization-record',
    '--force',
    '--reset',
    '--reselect',
    '--state-machine-state',
  ];
  for (const flag of authorityFlags) {
    const { code, out } = await runCli(['run3-select', '--run-id', RUN_ID, '--authorize-pm', flag, 'x']);
    assert.equal(code, 2);
    assert.equal(JSON.parse(out).error_code, 'argument_forbidden_authority_override', `expected refusal for ${flag}`);
  }
});

test('A7: window / query / page-size / state-path override flags are refused', async () => {
  const scopeFlags = [
    '--window-start',
    '--window-end',
    '--start-date',
    '--end-date',
    '--observation-window',
    '--rule-id',
    '--sample-size',
    '--canary-count',
    '--query',
    '-q',
    '--page-size',
    '--max-results',
    '--include-spam-trash',
    '--state',
    '--state-path',
    '--state-file',
  ];
  for (const flag of scopeFlags) {
    const { code, out } = await runCli(['run3-select', '--run-id', RUN_ID, '--authorize-pm', flag, 'x']);
    assert.equal(code, 2);
    assert.equal(JSON.parse(out).error_code, 'argument_forbidden_authority_override', `expected refusal for ${flag}`);
  }
});

test('A8: duplicate --run-id or --authorize-pm is rejected', async () => {
  const dupRunId = await runCli(['run3-select', '--run-id', 'a', '--run-id', 'b', '--authorize-pm']);
  assert.equal(JSON.parse(dupRunId.out).error_code, 'argument_invalid');
  const dupFlag = await runCli(['run3-select', '--run-id', 'a', '--authorize-pm', '--authorize-pm']);
  assert.equal(JSON.parse(dupFlag.out).error_code, 'argument_invalid');
});

test('A9: run3-preflight is unchanged and run3-select did not become the fallback', async () => {
  const missing = await runCli(['run3-preflight']);
  assert.equal(missing.code, 2);
  assert.deepEqual(JSON.parse(missing.out), { error_code: 'argument_invalid' });

  const forbidden = await runCli(['run3-preflight', '--plan-sha256', 'x']);
  assert.equal(forbidden.code, 2);
  assert.deepEqual(JSON.parse(forbidden.out), { error_code: 'argument_forbidden_authority_override' });

  const usage = await runCli(['not-a-command']);
  assert.equal(usage.code, 2);
  assert.match(usage.out, /usage:/);
  assert.match(usage.out, /run3-select --run-id <run-id> --authorize-pm/);
});

test('A10: the PM acknowledgement is enforced by the COMPOSITION, not only the parser', async () => {
  // Regression guard for a real defect this WorkUnit's mutation testing
  // exposed: with the check living only in `parseRun3SelectArgs`, removing
  // that one line let `run3-select` reach `authorizePM` and write durable
  // state on the canonical path with no operator intent anywhere. The
  // acknowledgement is a precondition of the MUTATION, so it is enforced on
  // the layer that mutates — before the state root is read, before Gmail.
  await withStateRoot(0o700, async (statePath) => {
    const enumerator = forbiddenEnumerator();
    for (const value of [undefined, false, null, 0, '', 'true', 1]) {
      const input: Record<string, unknown> = { env: {}, statePath, runId: RUN_ID, enumerate: enumerator.enumerate };
      if (value !== undefined) input.pmAcknowledged = value;
      await expectCode(runRun3Select(input as never), 'pm_authorization_required');
    }
    assert.equal(enumerator.calls.length, 0);
  });

  // It must also fail before the state-root gate, so an absent root cannot
  // mask a missing acknowledgement.
  const root = mkdtempSync(join(tmpdir(), 'p1-2-run3-select-noack-'));
  try {
    await expectCode(
      runRun3Select({
        env: {},
        statePath: join(root, 'controller-state', 'state.private.json'),
        runId: RUN_ID,
        enumerate: forbiddenEnumerator().enumerate,
      } as never),
      'pm_authorization_required',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('A11: no state file is ever created when the acknowledgement is missing', async () => {
  await withStateRoot(0o700, async (statePath) => {
    await expectCode(
      runRun3Select({ env: {}, statePath, runId: RUN_ID, enumerate: forbiddenEnumerator().enumerate } as never),
      'pm_authorization_required',
    );
    assert.throws(() => readFileSync(statePath, 'utf8'), 'no durable state may be written without explicit PM intent');
  });
});

/* ================================================================== *
 * B. PROTOCOL BINDING
 * ================================================================== */

test('B1: pinned protocol values reach the controller; run-id is the only free field', async () => {
  await withStateRoot(0o700, async (statePath) => {
    const spy = spyControllerFactory();
    const enumerator = fakeEnumerator(syntheticCandidates(30));
    await runRun3Select({ env: {}, statePath, runId: RUN_ID, pmAcknowledged: true, enumerate: enumerator.enumerate, controllerFactory: spy.factory });

    assert.equal(spy.configs.length, 1);
    assert.deepEqual(spy.configs[0], {
      runId: RUN_ID,
      planSha256: PLAN_AUTHORITY_SHA256,
      expectedGithubReuse: EXPECTED_GITHUB_REUSE,
      expectedGmailNew: EXPECTED_GMAIL_NEW,
      expectedTotal: EXPECTED_TOTAL,
      acquisitionDurationHours: ACQUISITION_DURATION_HOURS,
    });
    // The ratified numbers themselves, asserted here so a silent change to
    // any pinned constant breaks this WorkUnit's suite too.
    assert.equal(EXPECTED_GITHUB_REUSE, 34);
    assert.equal(EXPECTED_GMAIL_NEW, 26);
    assert.equal(EXPECTED_TOTAL, 60);
    assert.equal(ACQUISITION_DURATION_HOURS, 4);
    assert.match(PLAN_AUTHORITY_SHA256, /^[0-9a-f]{64}$/);
  });
});

test('B2: the persisted PM authorization record is built from pinned constants only', async () => {
  await withStateRoot(0o700, async (statePath) => {
    const enumerator = fakeEnumerator(syntheticCandidates(30));
    await runRun3Select({ env: {}, statePath, runId: RUN_ID, pmAcknowledged: true, enumerate: enumerator.enumerate });
    assert.deepEqual(readState(statePath).pmAuthorization, {
      run_id: RUN_ID,
      plan_sha256: PLAN_AUTHORITY_SHA256,
      expected_github_reuse: EXPECTED_GITHUB_REUSE,
      expected_gmail_new: EXPECTED_GMAIL_NEW,
      expected_total: EXPECTED_TOTAL,
      acquisition_duration_hours: ACQUISITION_DURATION_HOURS,
    });
  });
});

test('B3: extra caller-supplied protocol keys cannot override the pinned config', async () => {
  await withStateRoot(0o700, async (statePath) => {
    const spy = spyControllerFactory();
    const enumerator = fakeEnumerator(syntheticCandidates(30));
    // Every key below is an authority value a caller must never be able to
    // move. `runRun3Select` has no such parameters, so all of them are inert.
    const attackerInput: Record<string, unknown> = {
      env: {},
      statePath,
      runId: RUN_ID,
      pmAcknowledged: true,
      enumerate: enumerator.enumerate,
      controllerFactory: spy.factory,
      planSha256: 'f'.repeat(64),
      expectedGmailNew: 3,
      expectedTotal: 3,
      expectedGithubReuse: 0,
      acquisitionDurationHours: 999,
      windowStartMs: 0,
      windowEndMs: 1,
      query: 'in:anywhere',
      pageSize: 1,
      sampleSize: 1,
      ruleId: 'ATTACKER_RULE',
    };
    await runRun3Select(attackerInput as never);

    assert.deepEqual(spy.configs[0], buildPinnedConfig(RUN_ID));
    const selection = readState(statePath).selection as { ruleId: string; selected: unknown[] };
    assert.equal(selection.ruleId, RULE_ID);
    assert.equal(selection.selected.length, SAMPLE_SIZE);
  });
});

test('B4: the enumerator receives no query, page-size, or window override', async () => {
  await withStateRoot(0o700, async (statePath) => {
    const enumerator = fakeEnumerator(syntheticCandidates(30));
    await runRun3Select({ env: { SOME_ENV: 'x' }, statePath, runId: RUN_ID, pmAcknowledged: true, enumerate: enumerator.enumerate });
    assert.equal(enumerator.calls.length, 1);
    // `env` is the ONLY key handed to the enumerator: its own defaults ARE
    // the ratified universe (includeSpamTrash, full pagination, V1 window).
    assert.deepEqual(Object.keys(enumerator.calls[0] as object), ['env']);
  });
});

test('B5: the fixed V1 observation window decides eligibility', async () => {
  assert.equal(V1_WINDOW_START_MS, Date.parse('2026-08-14T00:00:00.000Z'));
  assert.equal(V1_WINDOW_END_MS, Date.parse('2026-08-20T23:59:59.999Z'));

  await withStateRoot(0o700, async (statePath) => {
    const inWindow = syntheticCandidates(26, 'in-');
    const outOfWindow: Candidate[] = [
      { message_id: 'out-before', internalDate: String(V1_WINDOW_START_MS - 1) },
      { message_id: 'out-after', internalDate: String(V1_WINDOW_END_MS + 1) },
    ];
    const enumerator = fakeEnumerator([...inWindow, ...outOfWindow]);
    const result = await runRun3Select({ env: {}, statePath, runId: RUN_ID, pmAcknowledged: true, enumerate: enumerator.enumerate });
    assert.equal(result.eligible_count, 26);
  });
});

/* ================================================================== *
 * C. STATE-ROOT GATE (every failure must precede enumeration)
 * ================================================================== */

test('C1: absent state root fails closed before enumeration', async () => {
  const root = mkdtempSync(join(tmpdir(), 'p1-2-run3-select-absent-'));
  try {
    const enumerator = forbiddenEnumerator();
    await expectCode(
      runRun3Select({
        env: {},
        statePath: join(root, 'controller-state', 'state.private.json'),
        runId: RUN_ID,
        pmAcknowledged: true,
        enumerate: enumerator.enumerate,
      }),
      'state_root_absent',
    );
    assert.equal(enumerator.calls.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('C2: a 0755 state root fails closed before enumeration', async () => {
  await withStateRoot(0o755, async (statePath) => {
    const enumerator = forbiddenEnumerator();
    await expectCode(runRun3Select({ env: {}, statePath, runId: RUN_ID, pmAcknowledged: true, enumerate: enumerator.enumerate }), 'state_root_not_private');
    assert.equal(enumerator.calls.length, 0);
  });
});

test('C3: any group- or other-accessible state root fails closed', async () => {
  for (const mode of [0o750, 0o705, 0o770, 0o777, 0o701]) {
    await withStateRoot(mode, async (statePath) => {
      const enumerator = forbiddenEnumerator();
      await expectCode(runRun3Select({ env: {}, statePath, runId: RUN_ID, pmAcknowledged: true, enumerate: enumerator.enumerate }), 'state_root_not_private');
      assert.equal(enumerator.calls.length, 0);
    });
  }
});

test('C4: a symlinked state root is refused even when its target would qualify', async () => {
  const root = mkdtempSync(join(tmpdir(), 'p1-2-run3-select-link-'));
  try {
    const realDir = join(root, 'real-state');
    mkdirSync(realDir);
    chmodSync(realDir, 0o700);
    const linkDir = join(root, 'controller-state');
    symlinkSync(realDir, linkDir);

    const enumerator = forbiddenEnumerator();
    await expectCode(
      runRun3Select({ env: {}, statePath: join(linkDir, 'state.private.json'), runId: RUN_ID, pmAcknowledged: true, enumerate: enumerator.enumerate }),
      'state_root_not_directory',
    );
    assert.equal(enumerator.calls.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('C5: a non-directory state root is refused', async () => {
  const root = mkdtempSync(join(tmpdir(), 'p1-2-run3-select-file-'));
  try {
    const asFile = join(root, 'controller-state');
    writeFileSync(asFile, 'not a directory', { mode: 0o600 });
    const enumerator = forbiddenEnumerator();
    await expectCode(
      runRun3Select({ env: {}, statePath: join(asFile, 'state.private.json'), runId: RUN_ID, pmAcknowledged: true, enumerate: enumerator.enumerate }),
      'state_root_not_directory',
    );
    assert.equal(enumerator.calls.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('C6: a valid 0700 root is allowed, and the command never creates or chmods it', async () => {
  await withStateRoot(0o700, async (statePath) => {
    const dir = dirname(statePath);
    const before = statSync(dir).mode;
    const enumerator = fakeEnumerator(syntheticCandidates(30));
    const result = await runRun3Select({ env: {}, statePath, runId: RUN_ID, pmAcknowledged: true, enumerate: enumerator.enumerate });
    assert.equal(result.status, STATUS_RESOLVED);
    assert.equal(statSync(dir).mode, before);
    // The private state file itself must be owner-only.
    assert.equal(statSync(statePath).mode & 0o777, 0o600);
  });
});

/* ================================================================== *
 * D. PRIVACY
 * ================================================================== */

const ALLOWED_RESULT_KEYS = [
  'status',
  'state',
  'rule_id',
  'eligible_count',
  'selected_count',
  'canary_count',
  'remaining_count',
  'selection_commitment',
];

test('D1: successful output carries exactly the allowed content-free fields', async () => {
  await withStateRoot(0o700, async (statePath) => {
    const candidates = syntheticCandidates(40, 'privacy-id-');
    const enumerator = fakeEnumerator(candidates);
    const result = await runRun3Select({ env: {}, statePath, runId: RUN_ID, pmAcknowledged: true, enumerate: enumerator.enumerate });

    assert.deepEqual(Object.keys(result).sort(), [...ALLOWED_RESULT_KEYS].sort());
    const serialized = JSON.stringify(result);
    for (const candidate of candidates) {
      assert.ok(!serialized.includes(candidate.message_id), `leaked message id: ${candidate.message_id}`);
      assert.ok(!serialized.includes(candidate.internalDate), `leaked internalDate: ${candidate.internalDate}`);
    }
    assert.equal(result.state, STATES.METADATA_SELECTION_RESOLVED);
    assert.equal(result.rule_id, RULE_ID);
    assert.match(result.selection_commitment, /^[0-9a-f]{64}$/);
  });
});

test('D2: the private selection stays in the private state file and never in the result', async () => {
  await withStateRoot(0o700, async (statePath) => {
    const enumerator = fakeEnumerator(syntheticCandidates(30, 'private-id-'));
    const result = await runRun3Select({ env: {}, statePath, runId: RUN_ID, pmAcknowledged: true, enumerate: enumerator.enumerate });

    // The projection is a real narrowing: identities DO exist on disk...
    assert.ok(readFileSync(statePath, 'utf8').includes('private-id-'), 'state file should hold the private selection');
    // ...and DO NOT exist in the operator-visible result.
    assert.ok(!JSON.stringify(result).includes('private-id-'));
    // Serializing the controller snapshot naively WOULD have leaked them,
    // which is exactly why the explicit projection exists.
    assert.ok(JSON.stringify(readState(statePath).selection).includes('private-id-'));
  });
});

test('D3: an enumeration failure surfaces only a stable code, not provider detail', async () => {
  await withStateRoot(0o700, async (statePath) => {
    const leaky = async () => {
      const error = new MetadataEnumeratorError('gmail_metadata_unauthorized') as MetadataEnumeratorError & { body?: string };
      error.body = 'secret-provider-body-with-user@example.com';
      throw error;
    };
    await expectCode(
      runRun3Select({ env: {}, statePath, runId: RUN_ID, pmAcknowledged: true, enumerate: leaky as unknown as Enumerate }),
      'gmail_metadata_unauthorized',
    );
  });
});

test('D4: an unknown failure collapses to internal_error, never a path or provider string', () => {
  const fsError = Object.assign(new Error('ENOENT: no such file /Users/someone/atra-private/secret'), { code: 'ENOENT' });
  assert.equal(toStableErrorCode(fsError), 'internal_error');
  assert.equal(toStableErrorCode(new Error('boom')), 'internal_error');
  assert.equal(toStableErrorCode({ code: 'looks_like_a_code' }), 'internal_error');
  // Known audit error types keep their stable, content-free codes.
  assert.equal(toStableErrorCode(new MetadataEnumeratorError('gmail_metadata_forbidden')), 'gmail_metadata_forbidden');
});

/* ================================================================== *
 * E. SELECTION
 * ================================================================== */

test('E1: a >=26 synthetic universe resolves to 26 selected / 1 canary / 25 remaining', async () => {
  await withStateRoot(0o700, async (statePath) => {
    const enumerator = fakeEnumerator(syntheticCandidates(40));
    const result = await runRun3Select({ env: {}, statePath, runId: RUN_ID, pmAcknowledged: true, enumerate: enumerator.enumerate });
    assert.equal(result.eligible_count, 40);
    assert.equal(result.selected_count, 26);
    assert.equal(result.canary_count, 1);
    assert.equal(result.remaining_count, 25);
    assert.equal(result.selected_count, SAMPLE_SIZE);
    assert.equal(result.selected_count, EXPECTED_GMAIL_NEW);
  });
});

test('E2: a <26 eligible universe fails closed without resolving', async () => {
  await withStateRoot(0o700, async (statePath) => {
    const enumerator = fakeEnumerator(syntheticCandidates(25));
    await expectCode(
      runRun3Select({ env: {}, statePath, runId: RUN_ID, pmAcknowledged: true, enumerate: enumerator.enumerate }),
      'P1_2_RUN3_GMAIL_ELIGIBLE_UNIVERSE_TOO_SMALL',
    );
    // The run stays recoverable at PM_AUTHORIZED — no selection was committed.
    const state = readState(statePath);
    assert.equal(state.state, STATES.PM_AUTHORIZED);
    assert.equal(state.selection, null);
  });
});

test('E3: a duplicate provider identity fails closed', async () => {
  await withStateRoot(0o700, async (statePath) => {
    const candidates = syntheticCandidates(30);
    candidates[10] = { ...candidates[3] };
    const enumerator = fakeEnumerator(candidates);
    await expectCode(
      runRun3Select({ env: {}, statePath, runId: RUN_ID, pmAcknowledged: true, enumerate: enumerator.enumerate }),
      'P1_2_RUN3_GMAIL_DUPLICATE_ELIGIBLE_IDENTITY',
    );
    assert.equal(readState(statePath).state, STATES.PM_AUTHORIZED);
  });
});

test('E4: input order does not alter the selection commitment', async () => {
  const candidates = syntheticCandidates(40, 'order-');
  const orderings = [candidates, [...candidates].reverse(), [...candidates.slice(17), ...candidates.slice(0, 17)]];

  const commitments: string[] = [];
  for (const ordering of orderings) {
    const commitment = await withStateRoot(0o700, async (statePath) => {
      const enumerator = fakeEnumerator(ordering);
      const result = await runRun3Select({ env: {}, statePath, runId: RUN_ID, pmAcknowledged: true, enumerate: enumerator.enumerate });
      return result.selection_commitment;
    });
    commitments.push(commitment);
  }
  assert.equal(commitments[0], commitments[1]);
  assert.equal(commitments[1], commitments[2]);
});

/* ================================================================== *
 * F. RESTART / RECOVERY
 * ================================================================== */

test('F1: a resolved run re-reports without enumerating Gmail again', async () => {
  await withStateRoot(0o700, async (statePath) => {
    const first = await runRun3Select({
      env: {},
      statePath,
      runId: RUN_ID,
      pmAcknowledged: true,
      enumerate: fakeEnumerator(syntheticCandidates(40)).enumerate,
    });
    assert.equal(first.status, STATUS_RESOLVED);

    const before = readFileSync(statePath, 'utf8');
    const enumerator = forbiddenEnumerator();
    const second = await runRun3Select({ env: {}, statePath, runId: RUN_ID, pmAcknowledged: true, enumerate: enumerator.enumerate });

    assert.equal(enumerator.calls.length, 0, 'must not re-enumerate a resolved run');
    assert.equal(second.status, STATUS_ALREADY_RESOLVED);
    assert.equal(second.state, STATES.METADATA_SELECTION_RESOLVED);
    assert.equal(second.selection_commitment, first.selection_commitment);
    assert.equal(second.eligible_count, first.eligible_count);
    assert.equal(second.rule_id, first.rule_id);
    assert.equal(second.selected_count, 26);
    assert.equal(second.canary_count, 1);
    assert.equal(second.remaining_count, 25);
    // No reselection, no overwrite: the state file is byte-identical.
    assert.equal(readFileSync(statePath, 'utf8'), before);
  });
});

test('F2: PM_AUTHORIZED after a failed enumeration resumes without re-authorizing', async () => {
  await withStateRoot(0o700, async (statePath) => {
    // First attempt: authorizePM persists, then enumeration fails. This is
    // the legitimate intermediate state the recovery contract must cover.
    await expectCode(
      runRun3Select({ env: {}, statePath, runId: RUN_ID, pmAcknowledged: true, enumerate: throwingEnumerator('gmail_metadata_network_error') }),
      'gmail_metadata_network_error',
    );
    const stranded = readState(statePath);
    assert.equal(stranded.state, STATES.PM_AUTHORIZED);
    assert.equal(stranded.selection, null);
    assert.equal(stranded.t0, null);

    // Resume: the SAME command, SAME run-id, SAME pinned config.
    const spy = spyControllerFactory();
    const result = await runRun3Select({
      env: {},
      statePath,
      runId: RUN_ID,
      pmAcknowledged: true,
      enumerate: fakeEnumerator(syntheticCandidates(40)).enumerate,
      controllerFactory: spy.factory,
    });

    assert.equal(result.status, STATUS_RESOLVED);
    assert.ok(!spy.calls.includes('authorizePM'), 'must NOT re-authorize an already-authorized run');
    assert.ok(spy.calls.includes('resolveSelection'), 'resume must enumerate and resolve');
    assert.equal(readState(statePath).state, STATES.METADATA_SELECTION_RESOLVED);
  });
});

test('F3: a wrong run-id against an existing authorization fails closed WITHOUT voiding the run', async () => {
  await withStateRoot(0o700, async (statePath) => {
    seedState(statePath, pmAuthorizedRecord(RUN_ID));
    const before = readFileSync(statePath, 'utf8');

    const enumerator = forbiddenEnumerator();
    await expectCode(
      runRun3Select({ env: {}, statePath, runId: 'a-different-run-id', pmAcknowledged: true, enumerate: enumerator.enumerate }),
      'state_authorization_mismatch',
    );
    assert.equal(enumerator.calls.length, 0);
    // The load-bearing property: a mistyped run-id must not permanently VOID
    // a live authorized run. Constructing the controller first would have.
    assert.equal(readFileSync(statePath, 'utf8'), before);
    assert.equal(readState(statePath).state, STATES.PM_AUTHORIZED);
  });
});

test('F4: a resolved run under a different run-id fails closed and is not overwritten', async () => {
  await withStateRoot(0o700, async (statePath) => {
    await runRun3Select({ env: {}, statePath, runId: RUN_ID, pmAcknowledged: true, enumerate: fakeEnumerator(syntheticCandidates(40)).enumerate });
    const before = readFileSync(statePath, 'utf8');

    const enumerator = forbiddenEnumerator();
    await expectCode(
      runRun3Select({ env: {}, statePath, runId: 'other-run', pmAcknowledged: true, enumerate: enumerator.enumerate }),
      'state_authorization_mismatch',
    );
    assert.equal(enumerator.calls.length, 0);
    assert.equal(readFileSync(statePath, 'utf8'), before);
  });
});

test('F5: acquisition / T0 / VOID / unknown states all fail closed and are never reset', async () => {
  const nonResumable = [
    STATES.T0_RECORDED,
    STATES.CANARY_PENDING,
    STATES.CANARY_PASSED,
    STATES.GMAIL_ACQUIRING,
    STATES.ACQUISITION_COMPLETE,
    STATES.VALIDATION_PENDING,
    STATES.VOID,
    'SOMETHING_ELSE',
  ];

  for (const state of nonResumable) {
    await withStateRoot(0o700, async (statePath) => {
      seedState(statePath, { ...pmAuthorizedRecord(RUN_ID), state });
      const before = readFileSync(statePath, 'utf8');
      const enumerator = forbiddenEnumerator();
      await expectCode(runRun3Select({ env: {}, statePath, runId: RUN_ID, pmAcknowledged: true, enumerate: enumerator.enumerate }), 'state_not_resumable');
      assert.equal(enumerator.calls.length, 0, `${state} must not enumerate`);
      assert.equal(readFileSync(statePath, 'utf8'), before, `${state} must not be rewritten`);
    });
  }
});

test('F6: a durable in-flight acquisition marker fails closed before the controller can void it', async () => {
  await withStateRoot(0o700, async (statePath) => {
    seedState(statePath, {
      ...pmAuthorizedRecord(RUN_ID),
      acquisitionInFlight: { kind: 'GMAIL', message_id: 'synthetic-inflight', destination: '/tmp/synthetic', started_at: 1 },
    });
    const before = readFileSync(statePath, 'utf8');
    const enumerator = forbiddenEnumerator();
    await expectCode(runRun3Select({ env: {}, statePath, runId: RUN_ID, pmAcknowledged: true, enumerate: enumerator.enumerate }), 'state_not_resumable');
    assert.equal(enumerator.calls.length, 0);
    assert.equal(readFileSync(statePath, 'utf8'), before);
  });
});

test('F7: a corrupt or structurally unrecognized state record is never overwritten', async () => {
  await withStateRoot(0o700, async (statePath) => {
    writeFileSync(statePath, '{ not json', { mode: 0o600 });
    const before = readFileSync(statePath, 'utf8');
    const enumerator = forbiddenEnumerator();
    await expectCode(runRun3Select({ env: {}, statePath, runId: RUN_ID, pmAcknowledged: true, enumerate: enumerator.enumerate }), 'state_unreadable');
    assert.equal(enumerator.calls.length, 0);
    assert.equal(readFileSync(statePath, 'utf8'), before);
  });

  await withStateRoot(0o700, async (statePath) => {
    // A PRE_T0 record carrying an authorization is a shape the controller never writes.
    seedState(statePath, { ...pmAuthorizedRecord(RUN_ID), state: STATES.PRE_T0 });
    const enumerator = forbiddenEnumerator();
    await expectCode(runRun3Select({ env: {}, statePath, runId: RUN_ID, pmAcknowledged: true, enumerate: enumerator.enumerate }), 'state_unrecognized');
    assert.equal(enumerator.calls.length, 0);
  });

  await withStateRoot(0o700, async (statePath) => {
    // A resolved state whose selection is missing must not be re-reported.
    seedState(statePath, { ...pmAuthorizedRecord(RUN_ID), state: STATES.METADATA_SELECTION_RESOLVED });
    const enumerator = forbiddenEnumerator();
    await expectCode(runRun3Select({ env: {}, statePath, runId: RUN_ID, pmAcknowledged: true, enumerate: enumerator.enumerate }), 'state_unrecognized');
    assert.equal(enumerator.calls.length, 0);
  });
});

test('F8: a genuinely fresh PRE_T0 record is a valid starting point', async () => {
  await withStateRoot(0o700, async (statePath) => {
    seedState(statePath, {
      state: STATES.PRE_T0,
      pmAuthorization: null,
      selection: null,
      t0: null,
      deadline: null,
      completed: [],
      destinationsUsed: [],
      voidReason: null,
      validation: null,
      acquisitionInFlight: null,
    });
    const spy = spyControllerFactory();
    const result = await runRun3Select({
      env: {},
      statePath,
      runId: RUN_ID,
      pmAcknowledged: true,
      enumerate: fakeEnumerator(syntheticCandidates(40)).enumerate,
      controllerFactory: spy.factory,
    });
    assert.equal(result.status, STATUS_RESOLVED);
    assert.ok(spy.calls.includes('authorizePM'));
  });
});

/* ================================================================== *
 * G. ABSOLUTE BOUNDARY — T0 / RAW / CANARY UNREACHABLE
 * ================================================================== */

test('G1: a full successful run invokes zero T0, canary, or RAW-acquisition transitions', async () => {
  await withStateRoot(0o700, async (statePath) => {
    const spy = spyControllerFactory();
    const result = await runRun3Select({
      env: {},
      statePath,
      runId: RUN_ID,
      pmAcknowledged: true,
      enumerate: fakeEnumerator(syntheticCandidates(40)).enumerate,
      controllerFactory: spy.factory,
    });

    assert.equal(result.state, STATES.METADATA_SELECTION_RESOLVED);
    assert.equal(spy.calls.filter((c) => c === 'recordT0').length, 0);
    assert.equal(spy.calls.filter((c) => c === 'runCanary').length, 0);
    assert.equal(spy.calls.filter((c) => c === 'acquireNext').length, 0);
    assert.equal(spy.calls.filter((c) => c === 'completeToValidationPending').length, 0);
    // The complete operator-path call graph, exhaustively.
    assert.deepEqual([...new Set(spy.calls)].sort(), ['authorizePM', 'getState', 'resolveSelection']);

    // The durable record confirms the run terminated pre-T0.
    const state = readState(statePath);
    assert.equal(state.t0, null);
    assert.equal(state.deadline, null);
    assert.deepEqual(state.completed, []);
  });
});

test('G2: the run3-select composition never references T0 / canary / RAW acquisition', () => {
  const source = readFileSync(new URL('../tools/audit/p1-2-run3-controller/selectOperator.mjs', import.meta.url), 'utf8');
  // Strip comments: the module documents what it must NOT do, and that prose
  // must not be mistaken for a call site.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  const forbidden = ['recordT0', 'runCanary', 'acquireNext', 'acquireGmailRawMessage', 'completeToValidationPending', 'rawAdapter'];
  for (const symbol of forbidden) {
    assert.ok(!code.includes(symbol), `run3-select composition must not reference ${symbol}`);
  }
  assert.ok(!code.includes('p1-2-gmail-raw-transport'), 'run3-select must not import the Gmail RAW transport');
});

test('G3: the cli run3-select branch composes only the sealed selection path', () => {
  const source = readFileSync(new URL('../tools/audit/p1-2-run3-controller/cli.mjs', import.meta.url), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  for (const symbol of ['recordT0', 'runCanary', 'acquireNext', 'acquireGmailRawMessage']) {
    assert.ok(!code.includes(symbol), `cli must not reference ${symbol}`);
  }
  // The handler must route through the reviewed composition, not reimplement it.
  assert.ok(code.includes('runRun3Select'), 'cli must delegate to runRun3Select');
  // ...and bind the fixed canonical state path, never a flag or env var.
  assert.ok(
    /runRun3Select\(\{\s*env,\s*statePath:\s*DEFAULT_STATE_PATH,\s*runId:\s*options\.runId,\s*pmAcknowledged:\s*options\.authorizePm\s*\}\)/.test(code),
    'cli must bind the canonical state path and thread the PM acknowledgement',
  );
  // The state-path env override stays confined to the read-only preflight.
  const selectBranch = code.slice(code.indexOf("command === 'run3-select'"));
  assert.ok(!selectBranch.includes('STATE_PATH_ENV'), 'run3-select must not honour a state-path env override');
});
