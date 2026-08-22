/**
 * Validation suite for the Run-3 acquisition controller (experiment-integrity
 * control plane) and the P1_2_RUN3_GMAIL_METADATA_SELECTION_V1 selection
 * rule.
 *
 * Every identity here is synthetic (`msg-*`). No real Gmail message id, no
 * real content, and no OAuth/credential material appears in this file. No
 * test performs a real network request; `acquireRaw` is always a local
 * synthetic adapter.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SAMPLE_SIZE, SelectionError, V1_WINDOW_START_MS, V1_WINDOW_END_MS, resolveGmailSelection } from '../tools/audit/p1-2-run3-controller/selection.mjs';
import { ControllerError, STATES, VoidTerminalError, Run3AcquisitionController } from '../tools/audit/p1-2-run3-controller/controller.mjs';
import { ControllerStateStore } from '../tools/audit/p1-2-run3-controller/stateStore.mjs';
import {
  ACQUISITION_DURATION_HOURS,
  EXPECTED_GITHUB_REUSE,
  EXPECTED_GMAIL_NEW,
  EXPECTED_TOTAL,
  PLAN_AUTHORITY_SHA256,
} from '../tools/audit/p1-2-run3-controller/protocolConstants.mjs';

function hex64(seed: string) {
  return createHash('sha256').update(seed, 'utf8').digest('hex');
}

const WINDOW = { windowStartMs: V1_WINDOW_START_MS, windowEndMs: V1_WINDOW_END_MS };
const IN_WINDOW_MS = Date.parse('2026-08-17T12:00:00.000Z');

const CONFIG = Object.freeze({
  runId: 'run3-test',
  planSha256: PLAN_AUTHORITY_SHA256,
  expectedGithubReuse: EXPECTED_GITHUB_REUSE,
  expectedGmailNew: EXPECTED_GMAIL_NEW,
  expectedTotal: EXPECTED_TOTAL,
  acquisitionDurationHours: ACQUISITION_DURATION_HOURS,
});

function validAuthRecord(overrides = {}) {
  return {
    run_id: CONFIG.runId,
    plan_sha256: CONFIG.planSha256,
    expected_github_reuse: CONFIG.expectedGithubReuse,
    expected_gmail_new: CONFIG.expectedGmailNew,
    expected_total: CONFIG.expectedTotal,
    acquisition_duration_hours: CONFIG.acquisitionDurationHours,
    ...overrides,
  };
}

function candidate(id: string, atMs: number = IN_WINDOW_MS) {
  return { message_id: id, internalDate: atMs };
}

function makeCandidates(count: number, { outsideWindow = 0 }: { outsideWindow?: number } = {}) {
  const list = [];
  for (let i = 0; i < count; i += 1) {
    list.push(candidate(`msg-${String(i).padStart(4, '0')}`));
  }
  for (let i = 0; i < outsideWindow; i += 1) {
    list.push(candidate(`msg-outside-${i}`, Date.parse('2026-08-01T00:00:00.000Z')));
  }
  return list;
}

function makeClock(startMs: number) {
  let now = startMs;
  return {
    now: () => now,
    advance(ms: number) {
      now += ms;
    },
    set(ms: number) {
      now = ms;
    },
  };
}

function tmpStatePath() {
  const dir = mkdtempSync(join(tmpdir(), 'p1-2-run3-controller-test-'));
  return join(dir, 'state.private.json');
}

function syntheticAcquire({
  byteEqual = true,
  messageIdOverride = null,
  digestMismatch = false,
}: { byteEqual?: boolean; messageIdOverride?: string | null; digestMismatch?: boolean } = {}) {
  return async (identity: { message_id: string }, _destination?: string) => ({
    message_id: messageIdOverride ?? identity.message_id,
    byte_length: 1234,
    provider_sha256: hex64(`provider-${identity.message_id}`),
    persisted_sha256: byteEqual && !digestMismatch ? hex64(`provider-${identity.message_id}`) : hex64(`persisted-${identity.message_id}`),
    byte_equal: byteEqual,
  });
}

function destinationFor(identity: { message_id: string }) {
  return `/synthetic/dest/${identity.message_id}.eml`;
}

async function setUpThroughCanaryPassed(clock: ReturnType<typeof makeClock>, statePath: string, candidates = makeCandidates(30)) {
  const store = new ControllerStateStore(statePath);
  const controller = new Run3AcquisitionController(CONFIG, store, clock);
  controller.authorizePM(validAuthRecord());
  controller.resolveSelection(candidates, WINDOW);
  controller.recordT0();
  await controller.runCanary(syntheticAcquire(), destinationFor);
  return controller;
}

// ---------------------------------------------------------------------------
// Selection rule (A-K)
// ---------------------------------------------------------------------------

test('selection: A. same eligible universe -> same selected 26', () => {
  const candidates = makeCandidates(40);
  const r1 = resolveGmailSelection(candidates, WINDOW);
  const r2 = resolveGmailSelection([...candidates], WINDOW);
  assert.deepEqual(
    r1.selected.map((s) => s.message_id),
    r2.selected.map((s) => s.message_id),
  );
});

test('selection: B. input enumeration order changes -> selected result unchanged', () => {
  const candidates = makeCandidates(40);
  const shuffled = [...candidates].reverse();
  const r1 = resolveGmailSelection(candidates, WINDOW);
  const r2 = resolveGmailSelection(shuffled, WINDOW);
  assert.deepEqual(
    r1.selected.map((s) => s.message_id),
    r2.selected.map((s) => s.message_id),
  );
  assert.equal(r1.canary.message_id, r2.canary.message_id);
});

test('selection: C. message outside observation window -> ineligible', () => {
  const candidates = [...makeCandidates(30), candidate('msg-late', Date.parse('2026-08-21T00:00:00.001Z'))];
  const resolved = resolveGmailSelection(candidates, WINDOW);
  assert.equal(resolved.eligibleCount, 30);
  assert.ok(!resolved.selected.some((s) => s.message_id === 'msg-late'));
});

test('selection: D. 25 eligible -> hard failure', () => {
  const candidates = makeCandidates(25);
  assert.throws(() => resolveGmailSelection(candidates, WINDOW), (err) => err instanceof SelectionError && err.code === 'P1_2_RUN3_GMAIL_ELIGIBLE_UNIVERSE_TOO_SMALL');
});

test('selection: E. 27+ eligible -> exactly 26', () => {
  const candidates = makeCandidates(50);
  const resolved = resolveGmailSelection(candidates, WINDOW);
  assert.equal(resolved.selected.length, SAMPLE_SIZE);
  assert.equal(resolved.eligibleCount, 50);
});

test('selection: F. selection never reads semantic fields', () => {
  const candidates = makeCandidates(30).map((c) => ({ ...c, subject: 'IGNORE ME', from: 'ignore@example.com' }));
  const resolved = resolveGmailSelection(candidates, WINDOW);
  for (const s of resolved.selected) {
    assert.equal(Object.prototype.hasOwnProperty.call(s, 'subject'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(s, 'from'), false);
  }
});

test('selection: G. canary == canonical selected[0]', () => {
  const resolved = resolveGmailSelection(makeCandidates(30), WINDOW);
  assert.equal(resolved.canary.message_id, resolved.selected[0].message_id);
});

test('selection: H. selected set cannot be modified after commitment', () => {
  const resolved = resolveGmailSelection(makeCandidates(30), WINDOW);
  assert.throws(() => {
    // @ts-expect-error intentional mutation attempt for the test
    resolved.selected[0] = candidate('injected');
  });
  assert.throws(() => {
    // @ts-expect-error intentional mutation attempt for the test
    resolved.selected[0].message_id = 'mutated';
  });
});

test('selection: I. selection commitment survives controller restart', () => {
  const statePath = tmpStatePath();
  try {
    const clock = makeClock(IN_WINDOW_MS);
    const store1 = new ControllerStateStore(statePath);
    const controller1 = new Run3AcquisitionController(CONFIG, store1, clock);
    controller1.authorizePM(validAuthRecord());
    controller1.resolveSelection(makeCandidates(30), WINDOW);
    const commitmentBefore = controller1.getState().selection!.commitment;

    const store2 = new ControllerStateStore(statePath);
    const controller2 = new Run3AcquisitionController(CONFIG, store2, clock);
    assert.equal(controller2.getState().selection!.commitment, commitmentBefore);
  } finally {
    rmSync(statePath, { force: true });
  }
});

test('selection: J. T0 cannot be created before selection resolution exists', () => {
  const statePath = tmpStatePath();
  try {
    const clock = makeClock(IN_WINDOW_MS);
    const store = new ControllerStateStore(statePath);
    const controller = new Run3AcquisitionController(CONFIG, store, clock);
    controller.authorizePM(validAuthRecord());
    assert.throws(() => controller.recordT0(), ControllerError);
    assert.equal(controller.getState().state, STATES.PM_AUTHORIZED);
  } finally {
    rmSync(statePath, { force: true });
  }
});

test('selection: K. after T0, reselection rejected', () => {
  const statePath = tmpStatePath();
  try {
    const clock = makeClock(IN_WINDOW_MS);
    const store = new ControllerStateStore(statePath);
    const controller = new Run3AcquisitionController(CONFIG, store, clock);
    controller.authorizePM(validAuthRecord());
    controller.resolveSelection(makeCandidates(30), WINDOW);
    controller.recordT0();
    assert.throws(() => controller.resolveSelection(makeCandidates(30), WINDOW), ControllerError);
  } finally {
    rmSync(statePath, { force: true });
  }
});

// ---------------------------------------------------------------------------
// Controller invariants (A-R from the required test matrix)
// ---------------------------------------------------------------------------

test('controller: A. without PM authorization, T0 rejected', () => {
  const statePath = tmpStatePath();
  try {
    const clock = makeClock(IN_WINDOW_MS);
    const controller = new Run3AcquisitionController(CONFIG, new ControllerStateStore(statePath), clock);
    assert.throws(() => controller.recordT0(), ControllerError);
    assert.equal(controller.getState().state, STATES.PRE_T0);
  } finally {
    rmSync(statePath, { force: true });
  }
});

test('controller: B. authorization with wrong plan hash -> T0 rejected', () => {
  const statePath = tmpStatePath();
  try {
    const clock = makeClock(IN_WINDOW_MS);
    const controller = new Run3AcquisitionController(CONFIG, new ControllerStateStore(statePath), clock);
    assert.throws(() => controller.authorizePM(validAuthRecord({ plan_sha256: 'wrong-hash' })), ControllerError);
    assert.equal(controller.getState().state, STATES.PRE_T0);
    assert.throws(() => controller.recordT0(), ControllerError);
  } finally {
    rmSync(statePath, { force: true });
  }
});

test('controller: C. T0 exactly once', () => {
  const statePath = tmpStatePath();
  try {
    const clock = makeClock(IN_WINDOW_MS);
    const controller = new Run3AcquisitionController(CONFIG, new ControllerStateStore(statePath), clock);
    controller.authorizePM(validAuthRecord());
    controller.resolveSelection(makeCandidates(30), WINDOW);
    controller.recordT0();
    const t0First = controller.getState().t0;
    assert.throws(() => controller.recordT0(), ControllerError);
    assert.equal(controller.getState().t0, t0First);
  } finally {
    rmSync(statePath, { force: true });
  }
});

test('controller: D. deadline exactly T0 + 4h', () => {
  const statePath = tmpStatePath();
  try {
    const clock = makeClock(IN_WINDOW_MS);
    const controller = new Run3AcquisitionController(CONFIG, new ControllerStateStore(statePath), clock);
    controller.authorizePM(validAuthRecord());
    controller.resolveSelection(makeCandidates(30), WINDOW);
    controller.recordT0();
    const { t0, deadline } = controller.getState();
    assert.equal(deadline, t0! + 4 * 60 * 60 * 1000);
  } finally {
    rmSync(statePath, { force: true });
  }
});

test('controller: E. selection not resolved -> canary rejected', async () => {
  const statePath = tmpStatePath();
  try {
    const clock = makeClock(IN_WINDOW_MS);
    const controller = new Run3AcquisitionController(CONFIG, new ControllerStateStore(statePath), clock);
    controller.authorizePM(validAuthRecord());
    await assert.rejects(() => controller.runCanary(syntheticAcquire(), destinationFor), ControllerError);
  } finally {
    rmSync(statePath, { force: true });
  }
});

test('controller: F. canary is the first content-bearing acquisition (remaining blocked before it)', async () => {
  const statePath = tmpStatePath();
  try {
    const clock = makeClock(IN_WINDOW_MS);
    const controller = new Run3AcquisitionController(CONFIG, new ControllerStateStore(statePath), clock);
    controller.authorizePM(validAuthRecord());
    const candidates = makeCandidates(30);
    controller.resolveSelection(candidates, WINDOW);
    controller.recordT0();
    const firstRemaining = controller.getState().selection!.remaining[0].message_id;
    await assert.rejects(() => controller.acquireNext(firstRemaining, syntheticAcquire(), destinationFor), ControllerError);
  } finally {
    rmSync(statePath, { force: true });
  }
});

test('controller: G. canary byte_equal=false -> VOID', async () => {
  const statePath = tmpStatePath();
  try {
    const clock = makeClock(IN_WINDOW_MS);
    const controller = new Run3AcquisitionController(CONFIG, new ControllerStateStore(statePath), clock);
    controller.authorizePM(validAuthRecord());
    controller.resolveSelection(makeCandidates(30), WINDOW);
    controller.recordT0();
    await assert.rejects(() => controller.runCanary(syntheticAcquire({ byteEqual: false }), destinationFor), VoidTerminalError);
    assert.equal(controller.getState().state, STATES.VOID);
    assert.equal(controller.getState().voidReason, 'P1_2_RUN3_CANARY_BYTE_FIDELITY_FAILURE');
  } finally {
    rmSync(statePath, { force: true });
  }
});

test('controller: H. after canary failure, remaining acquisition impossible', async () => {
  const statePath = tmpStatePath();
  try {
    const clock = makeClock(IN_WINDOW_MS);
    const controller = new Run3AcquisitionController(CONFIG, new ControllerStateStore(statePath), clock);
    controller.authorizePM(validAuthRecord());
    const candidates = makeCandidates(30);
    controller.resolveSelection(candidates, WINDOW);
    controller.recordT0();
    await assert.rejects(() => controller.runCanary(syntheticAcquire({ byteEqual: false }), destinationFor), VoidTerminalError);
    const remainingId = controller.getState().selection!.remaining[0].message_id;
    await assert.rejects(() => controller.acquireNext(remainingId, syntheticAcquire(), destinationFor), VoidTerminalError);
  } finally {
    rmSync(statePath, { force: true });
  }
});

test('controller: I. canary PASS -> remaining acquisition becomes permitted', async () => {
  const statePath = tmpStatePath();
  try {
    const clock = makeClock(IN_WINDOW_MS);
    const controller = await setUpThroughCanaryPassed(clock, statePath);
    assert.equal(controller.getState().state, STATES.CANARY_PASSED);
    const remainingId = controller.getState().selection!.remaining[0].message_id;
    await controller.acquireNext(remainingId, syntheticAcquire(), destinationFor);
    assert.equal(controller.getState().completed.length, 2);
  } finally {
    rmSync(statePath, { force: true });
  }
});

test('controller: J. later Gmail fidelity failure -> VOID', async () => {
  const statePath = tmpStatePath();
  try {
    const clock = makeClock(IN_WINDOW_MS);
    const controller = await setUpThroughCanaryPassed(clock, statePath);
    const remainingId = controller.getState().selection!.remaining[0].message_id;
    await assert.rejects(() => controller.acquireNext(remainingId, syntheticAcquire({ byteEqual: false }), destinationFor), VoidTerminalError);
    assert.equal(controller.getState().state, STATES.VOID);
    assert.equal(controller.getState().voidReason, 'P1_2_RUN3_GMAIL_BYTE_FIDELITY_FAILURE');
  } finally {
    rmSync(statePath, { force: true });
  }
});

test('controller: K. 26/26 -> ACQUISITION_COMPLETE', async () => {
  const statePath = tmpStatePath();
  try {
    const clock = makeClock(IN_WINDOW_MS);
    const controller = await setUpThroughCanaryPassed(clock, statePath);
    const remaining = controller.getState().selection!.remaining;
    for (const identity of remaining) {
      await controller.acquireNext(identity.message_id, syntheticAcquire(), destinationFor);
    }
    assert.equal(controller.getState().state, STATES.ACQUISITION_COMPLETE);
    assert.equal(controller.getState().completed.length, 26);
    controller.completeToValidationPending();
    assert.equal(controller.getState().state, STATES.VALIDATION_PENDING);
    assert.deepEqual(controller.getState().validation, { github_reuse_expected: 34, gmail_acquired: 26, total_expected: 60 });
  } finally {
    rmSync(statePath, { force: true });
  }
});

test('controller: L. 25/26 -> cannot complete', async () => {
  const statePath = tmpStatePath();
  try {
    const clock = makeClock(IN_WINDOW_MS);
    const controller = await setUpThroughCanaryPassed(clock, statePath);
    const remaining = controller.getState().selection!.remaining.slice(0, -1);
    for (const identity of remaining) {
      await controller.acquireNext(identity.message_id, syntheticAcquire(), destinationFor);
    }
    assert.equal(controller.getState().completed.length, 25);
    assert.notEqual(controller.getState().state, STATES.ACQUISITION_COMPLETE);
    assert.throws(() => controller.completeToValidationPending(), ControllerError);
  } finally {
    rmSync(statePath, { force: true });
  }
});

test('controller: M. after deadline -> VOID', async () => {
  const statePath = tmpStatePath();
  try {
    const clock = makeClock(IN_WINDOW_MS);
    const controller = await setUpThroughCanaryPassed(clock, statePath);
    clock.advance(4 * 60 * 60 * 1000 + 1);
    const remainingId = controller.getState().selection!.remaining[0].message_id;
    await assert.rejects(() => controller.acquireNext(remainingId, syntheticAcquire(), destinationFor), VoidTerminalError);
    assert.equal(controller.getState().voidReason, 'P1_2_RUN3_DEADLINE_EXCEEDED');
  } finally {
    rmSync(statePath, { force: true });
  }
});

test('controller: N. duplicate identity rejected', async () => {
  const statePath = tmpStatePath();
  try {
    const clock = makeClock(IN_WINDOW_MS);
    const controller = await setUpThroughCanaryPassed(clock, statePath);
    const remainingId = controller.getState().selection!.remaining[0].message_id;
    await controller.acquireNext(remainingId, syntheticAcquire(), destinationFor);
    await assert.rejects(() => controller.acquireNext(remainingId, syntheticAcquire(), destinationFor), ControllerError);
  } finally {
    rmSync(statePath, { force: true });
  }
});

test('controller: O. VOID terminal across restart', async () => {
  const statePath = tmpStatePath();
  try {
    const clock = makeClock(IN_WINDOW_MS);
    const store1 = new ControllerStateStore(statePath);
    const controller1 = new Run3AcquisitionController(CONFIG, store1, clock);
    controller1.authorizePM(validAuthRecord());
    controller1.resolveSelection(makeCandidates(30), WINDOW);
    controller1.recordT0();
    await assert.rejects(() => controller1.runCanary(syntheticAcquire({ byteEqual: false }), destinationFor), VoidTerminalError);

    const store2 = new ControllerStateStore(statePath);
    const controller2 = new Run3AcquisitionController(CONFIG, store2, clock);
    assert.equal(controller2.getState().state, STATES.VOID);
    assert.equal(controller2.getState().voidReason, 'P1_2_RUN3_CANARY_BYTE_FIDELITY_FAILURE');
    assert.throws(() => controller2.recordT0(), VoidTerminalError);
  } finally {
    rmSync(statePath, { force: true });
  }
});

test('controller: P. T0 immutable across restart', () => {
  const statePath = tmpStatePath();
  try {
    const clock = makeClock(IN_WINDOW_MS);
    const store1 = new ControllerStateStore(statePath);
    const controller1 = new Run3AcquisitionController(CONFIG, store1, clock);
    controller1.authorizePM(validAuthRecord());
    controller1.resolveSelection(makeCandidates(30), WINDOW);
    controller1.recordT0();
    const t0Before = controller1.getState().t0;

    const store2 = new ControllerStateStore(statePath);
    const controller2 = new Run3AcquisitionController(CONFIG, store2, clock);
    assert.equal(controller2.getState().t0, t0Before);
    assert.throws(() => controller2.recordT0(), ControllerError);
    assert.equal(controller2.getState().t0, t0Before);
  } finally {
    rmSync(statePath, { force: true });
  }
});

test('controller: Q. crash/ambiguous acquisition -> no automatic retry', async () => {
  const statePath = tmpStatePath();
  try {
    const clock = makeClock(IN_WINDOW_MS);
    const controller = new Run3AcquisitionController(CONFIG, new ControllerStateStore(statePath), clock);
    controller.authorizePM(validAuthRecord());
    controller.resolveSelection(makeCandidates(30), WINDOW);
    controller.recordT0();

    let calls = 0;
    const crashingAcquire = async () => {
      calls += 1;
      throw new Error('simulated crash between provider call and state registration');
    };
    await assert.rejects(() => controller.runCanary(crashingAcquire, destinationFor), VoidTerminalError);
    assert.equal(calls, 1);
    assert.equal(controller.getState().state, STATES.VOID);
    assert.equal(controller.getState().voidReason, 'P1_2_RUN3_CANARY_ACQUISITION_AMBIGUOUS');

    // A second attempt must be rejected outright, not silently retried.
    await assert.rejects(() => controller.runCanary(crashingAcquire, destinationFor), VoidTerminalError);
    assert.equal(calls, 1, 'the provider capability must not be called again after VOID');
  } finally {
    rmSync(statePath, { force: true });
  }
});

test('controller: R. no semantic fields or RAW content in persisted controller state', async () => {
  const statePath = tmpStatePath();
  try {
    const clock = makeClock(IN_WINDOW_MS);
    const controller = await setUpThroughCanaryPassed(clock, statePath);
    const forbiddenAcquire = async (identity: { message_id: string }) => ({
      message_id: identity.message_id,
      byte_length: 10,
      provider_sha256: hex64('forbidden'),
      persisted_sha256: hex64('forbidden'),
      byte_equal: true,
      // A misbehaving/legacy adapter might return extra fields; the
      // controller must never persist them.
      raw_mime: 'From: attacker@example.com\r\nSubject: leaked\r\n\r\nBODY',
      credential: 'ya29.fake-oauth-token',
      snippet: 'leaked snippet text',
    });
    const remainingId = controller.getState().selection!.remaining[0].message_id;
    await controller.acquireNext(remainingId, forbiddenAcquire, destinationFor);

    const store = new ControllerStateStore(statePath);
    const persisted = store.load();
    const persistedText = JSON.stringify(persisted);
    assert.ok(!persistedText.includes('raw_mime'));
    assert.ok(!persistedText.includes('attacker@example.com'));
    assert.ok(!persistedText.includes('credential'));
    assert.ok(!persistedText.includes('ya29.fake-oauth-token'));
    assert.ok(!persistedText.includes('snippet'));
    assert.ok(!persistedText.includes('leaked'));
  } finally {
    rmSync(statePath, { force: true });
  }
});

// ---------------------------------------------------------------------------
// Additional VOID-terminal coverage (§11 required tests, beyond A-R)
// ---------------------------------------------------------------------------

test('controller: VOID -> acquire rejected', async () => {
  const statePath = tmpStatePath();
  try {
    const clock = makeClock(IN_WINDOW_MS);
    const controller = new Run3AcquisitionController(CONFIG, new ControllerStateStore(statePath), clock);
    controller.authorizePM(validAuthRecord());
    controller.resolveSelection(makeCandidates(30), WINDOW);
    controller.recordT0();
    await assert.rejects(() => controller.runCanary(syntheticAcquire({ byteEqual: false }), destinationFor), VoidTerminalError);
    const remainingId = controller.getState().selection!.remaining[0].message_id;
    await assert.rejects(() => controller.acquireNext(remainingId, syntheticAcquire(), destinationFor), VoidTerminalError);
  } finally {
    rmSync(statePath, { force: true });
  }
});

test('controller: VOID -> set T0 rejected', async () => {
  const statePath = tmpStatePath();
  try {
    const clock = makeClock(IN_WINDOW_MS);
    const controller = new Run3AcquisitionController(CONFIG, new ControllerStateStore(statePath), clock);
    controller.authorizePM(validAuthRecord());
    controller.resolveSelection(makeCandidates(30), WINDOW);
    controller.recordT0();
    await assert.rejects(() => controller.runCanary(syntheticAcquire({ byteEqual: false }), destinationFor), VoidTerminalError);
    assert.throws(() => controller.recordT0(), VoidTerminalError);
  } finally {
    rmSync(statePath, { force: true });
  }
});

test('controller: VOID -> change selection rejected', async () => {
  const statePath = tmpStatePath();
  try {
    const clock = makeClock(IN_WINDOW_MS);
    const controller = new Run3AcquisitionController(CONFIG, new ControllerStateStore(statePath), clock);
    controller.authorizePM(validAuthRecord());
    controller.resolveSelection(makeCandidates(30), WINDOW);
    controller.recordT0();
    await assert.rejects(() => controller.runCanary(syntheticAcquire({ byteEqual: false }), destinationFor), VoidTerminalError);
    assert.throws(() => controller.resolveSelection(makeCandidates(30), WINDOW), VoidTerminalError);
  } finally {
    rmSync(statePath, { force: true });
  }
});

test('controller: VOID -> retry canary rejected', async () => {
  const statePath = tmpStatePath();
  try {
    const clock = makeClock(IN_WINDOW_MS);
    const controller = new Run3AcquisitionController(CONFIG, new ControllerStateStore(statePath), clock);
    controller.authorizePM(validAuthRecord());
    controller.resolveSelection(makeCandidates(30), WINDOW);
    controller.recordT0();
    await assert.rejects(() => controller.runCanary(syntheticAcquire({ byteEqual: false }), destinationFor), VoidTerminalError);
    await assert.rejects(() => controller.runCanary(syntheticAcquire(), destinationFor), VoidTerminalError);
  } finally {
    rmSync(statePath, { force: true });
  }
});

test('controller: VOID -> replace sample (acquire an unselected identity) rejected', async () => {
  const statePath = tmpStatePath();
  try {
    const clock = makeClock(IN_WINDOW_MS);
    const controller = new Run3AcquisitionController(CONFIG, new ControllerStateStore(statePath), clock);
    controller.authorizePM(validAuthRecord());
    controller.resolveSelection(makeCandidates(30), WINDOW);
    controller.recordT0();
    await assert.rejects(() => controller.runCanary(syntheticAcquire({ byteEqual: false }), destinationFor), VoidTerminalError);
    await assert.rejects(() => controller.acquireNext('msg-not-selected', syntheticAcquire(), destinationFor), VoidTerminalError);
  } finally {
    rmSync(statePath, { force: true });
  }
});

test('controller: VOID -> extend deadline is impossible (no such operation exists, and mutation is rejected)', async () => {
  const statePath = tmpStatePath();
  try {
    const clock = makeClock(IN_WINDOW_MS);
    const controller = new Run3AcquisitionController(CONFIG, new ControllerStateStore(statePath), clock);
    controller.authorizePM(validAuthRecord());
    controller.resolveSelection(makeCandidates(30), WINDOW);
    controller.recordT0();
    const deadlineBefore = controller.getState().deadline;
    await assert.rejects(() => controller.runCanary(syntheticAcquire({ byteEqual: false }), destinationFor), VoidTerminalError);
    assert.equal(controller.getState().deadline, deadlineBefore);
    assert.equal(typeof (controller as unknown as { extendDeadline?: unknown }).extendDeadline, 'undefined');
  } finally {
    rmSync(statePath, { force: true });
  }
});

test('controller: destination collision fails closed before any provider call', async () => {
  const statePath = tmpStatePath();
  try {
    const clock = makeClock(IN_WINDOW_MS);
    const controller = await setUpThroughCanaryPassed(clock, statePath);
    const remaining = controller.getState().selection!.remaining;
    const collidingDestinationFor = () => destinationFor(controller.getState().selection!.canary);
    let calls = 0;
    const countingAcquire = async (identity: { message_id: string }, destination: string) => {
      calls += 1;
      return syntheticAcquire()(identity, destination);
    };
    await assert.rejects(() => controller.acquireNext(remaining[0].message_id, countingAcquire, collidingDestinationFor), ControllerError);
    assert.equal(calls, 0);
  } finally {
    rmSync(statePath, { force: true });
  }
});

// ---------------------------------------------------------------------------
// Final integrity closure (§11 A-I of the closure directive)
// ---------------------------------------------------------------------------

test('closure: A. restart with acquisition_in_flight -> VOID, zero provider calls', async () => {
  const statePath = tmpStatePath();
  try {
    const clock = makeClock(IN_WINDOW_MS);
    const store1 = new ControllerStateStore(statePath);
    const controller1 = new Run3AcquisitionController(CONFIG, store1, clock);
    controller1.authorizePM(validAuthRecord());
    controller1.resolveSelection(makeCandidates(30), WINDOW);
    controller1.recordT0();

    // Simulate a process crash exactly between "persist in-flight marker"
    // and "call acquireRaw": acquireRaw hangs forever and the process is
    // killed before it resolves or rejects. We can't literally kill this
    // process mid-`await`, so instead we assert the marker was durably
    // persisted before the call by reconstructing a fresh controller from
    // disk at that exact moment (a never-resolving promise stands in for
    // "the process died here").
    let acquireCalls = 0;
    const neverResolves = async (_identity: { message_id: string }, _destination: string): Promise<never> => {
      acquireCalls += 1;
      return new Promise<never>(() => {}); // never settles: models the crash window
    };
    // Fire-and-forget: we don't await this call, we only care that it
    // persisted the in-flight marker before hanging.
    void controller1.runCanary(neverResolves, destinationFor);
    // Give the persisted-before-call write a turn of the microtask queue.
    await new Promise((resolve) => setImmediate(resolve));

    const persistedDuringCrash = new ControllerStateStore(statePath).load() as { acquisitionInFlight: unknown };
    assert.ok(persistedDuringCrash.acquisitionInFlight, 'in-flight marker must be durably persisted before acquireRaw is called');

    const store2 = new ControllerStateStore(statePath);
    const controller2 = new Run3AcquisitionController(CONFIG, store2, clock);
    assert.equal(controller2.getState().state, STATES.VOID);
    assert.equal(controller2.getState().voidReason, 'P1_2_RUN3_ACQUISITION_INTERRUPTED_AMBIGUOUS');
    assert.equal(controller2.getState().acquisitionInFlight, null);
    assert.equal(acquireCalls, 1, 'the hung original call is not a second call; reconstruction must never call acquireRaw again');
  } finally {
    rmSync(statePath, { force: true });
  }
});

test('closure: B. byte_equal true + digest mismatch -> VOID', async () => {
  const statePath = tmpStatePath();
  try {
    const clock = makeClock(IN_WINDOW_MS);
    const controller = new Run3AcquisitionController(CONFIG, new ControllerStateStore(statePath), clock);
    controller.authorizePM(validAuthRecord());
    controller.resolveSelection(makeCandidates(30), WINDOW);
    controller.recordT0();
    await assert.rejects(() => controller.runCanary(syntheticAcquire({ byteEqual: true, digestMismatch: true }), destinationFor), VoidTerminalError);
    assert.equal(controller.getState().state, STATES.VOID);
    assert.equal(controller.getState().voidReason, 'P1_2_RUN3_CANARY_BYTE_FIDELITY_FAILURE');
  } finally {
    rmSync(statePath, { force: true });
  }
});

test('closure: C. canary crosses deadline during acquireRaw -> VOID', async () => {
  const statePath = tmpStatePath();
  try {
    const clock = makeClock(IN_WINDOW_MS);
    const controller = new Run3AcquisitionController(CONFIG, new ControllerStateStore(statePath), clock);
    controller.authorizePM(validAuthRecord());
    controller.resolveSelection(makeCandidates(30), WINDOW);
    controller.recordT0();
    const acquireThatCrossesDeadline = async (identity: { message_id: string }) => {
      clock.advance(4 * 60 * 60 * 1000 + 1);
      return {
        message_id: identity.message_id,
        byte_length: 10,
        provider_sha256: hex64(identity.message_id),
        persisted_sha256: hex64(identity.message_id),
        byte_equal: true,
      };
    };
    await assert.rejects(() => controller.runCanary(acquireThatCrossesDeadline, destinationFor), VoidTerminalError);
    assert.equal(controller.getState().state, STATES.VOID);
    assert.equal(controller.getState().voidReason, 'P1_2_RUN3_DEADLINE_EXCEEDED');
    assert.equal(controller.getState().completed.length, 0);
  } finally {
    rmSync(statePath, { force: true });
  }
});

test('closure: D. remaining item crosses deadline during acquireRaw -> VOID', async () => {
  const statePath = tmpStatePath();
  try {
    const clock = makeClock(IN_WINDOW_MS);
    const controller = await setUpThroughCanaryPassed(clock, statePath);
    const remainingId = controller.getState().selection!.remaining[0].message_id;
    const completedBefore = controller.getState().completed.length;
    const acquireThatCrossesDeadline = async (identity: { message_id: string }) => {
      clock.advance(4 * 60 * 60 * 1000 + 1);
      return {
        message_id: identity.message_id,
        byte_length: 10,
        provider_sha256: hex64(identity.message_id),
        persisted_sha256: hex64(identity.message_id),
        byte_equal: true,
      };
    };
    await assert.rejects(() => controller.acquireNext(remainingId, acquireThatCrossesDeadline, destinationFor), VoidTerminalError);
    assert.equal(controller.getState().state, STATES.VOID);
    assert.equal(controller.getState().voidReason, 'P1_2_RUN3_DEADLINE_EXCEEDED');
    assert.equal(controller.getState().completed.length, completedBefore);
  } finally {
    rmSync(statePath, { force: true });
  }
});

test('closure: E. wrong observation start -> rejected', () => {
  const statePath = tmpStatePath();
  try {
    const clock = makeClock(IN_WINDOW_MS);
    const controller = new Run3AcquisitionController(CONFIG, new ControllerStateStore(statePath), clock);
    controller.authorizePM(validAuthRecord());
    const wrongWindow = { windowStartMs: V1_WINDOW_START_MS + 1, windowEndMs: V1_WINDOW_END_MS };
    assert.throws(() => controller.resolveSelection(makeCandidates(30), wrongWindow), (err: unknown) => err instanceof ControllerError && err.code === 'P1_2_RUN3_OBSERVATION_WINDOW_MISMATCH');
    assert.equal(controller.getState().state, STATES.PM_AUTHORIZED);
  } finally {
    rmSync(statePath, { force: true });
  }
});

test('closure: F. wrong observation end -> rejected', () => {
  const statePath = tmpStatePath();
  try {
    const clock = makeClock(IN_WINDOW_MS);
    const controller = new Run3AcquisitionController(CONFIG, new ControllerStateStore(statePath), clock);
    controller.authorizePM(validAuthRecord());
    const wrongWindow = { windowStartMs: V1_WINDOW_START_MS, windowEndMs: V1_WINDOW_END_MS - 1 };
    assert.throws(() => controller.resolveSelection(makeCandidates(30), wrongWindow), (err: unknown) => err instanceof ControllerError && err.code === 'P1_2_RUN3_OBSERVATION_WINDOW_MISMATCH');
    assert.equal(controller.getState().state, STATES.PM_AUTHORIZED);
  } finally {
    rmSync(statePath, { force: true });
  }
});

test('closure: G. duplicate eligible message id -> rejected', () => {
  const candidates = [...makeCandidates(30), candidate('msg-0005')]; // msg-0005 already exists in makeCandidates(30)
  assert.throws(() => resolveGmailSelection(candidates, WINDOW), (err: unknown) => err instanceof SelectionError && err.code === 'P1_2_RUN3_GMAIL_DUPLICATE_ELIGIBLE_IDENTITY');
});

test('closure: G2. duplicate eligible message id rejected through the controller path', () => {
  const statePath = tmpStatePath();
  try {
    const clock = makeClock(IN_WINDOW_MS);
    const controller = new Run3AcquisitionController(CONFIG, new ControllerStateStore(statePath), clock);
    controller.authorizePM(validAuthRecord());
    const candidates = [...makeCandidates(30), candidate('msg-0005')];
    assert.throws(() => controller.resolveSelection(candidates, WINDOW), (err: unknown) => err instanceof SelectionError && err.code === 'P1_2_RUN3_GMAIL_DUPLICATE_ELIGIBLE_IDENTITY');
    assert.equal(controller.getState().state, STATES.PM_AUTHORIZED);
  } finally {
    rmSync(statePath, { force: true });
  }
});

test('closure: H. state file POSIX mode = 0600', () => {
  const statePath = tmpStatePath();
  try {
    const clock = makeClock(IN_WINDOW_MS);
    const controller = new Run3AcquisitionController(CONFIG, new ControllerStateStore(statePath), clock);
    controller.authorizePM(validAuthRecord());
    const mode = statSync(statePath).mode & 0o777;
    assert.equal(mode.toString(8), '600');
  } finally {
    rmSync(statePath, { force: true });
  }
});

test('closure: I. restart with different plan/config -> rejected', () => {
  const statePath = tmpStatePath();
  try {
    const clock = makeClock(IN_WINDOW_MS);
    const store1 = new ControllerStateStore(statePath);
    const controller1 = new Run3AcquisitionController(CONFIG, store1, clock);
    controller1.authorizePM(validAuthRecord());

    // `runId` is the one field the protocol contract leaves free (every
    // other field is now pinned to the ratified constants, so it is no
    // longer possible to construct a second *protocol-valid* config that
    // differs from CONFIG in any of those pinned fields — see the C1-C9
    // protocol-pinning tests below for that). Restarting under a config
    // whose runId differs from what the persisted PM-authorization record
    // actually recorded must still VOID via the restart-binding check.
    const DIFFERENT_CONFIG = { ...CONFIG, runId: 'run3-test-a-different-run' };
    const store2 = new ControllerStateStore(statePath);
    const controller2 = new Run3AcquisitionController(DIFFERENT_CONFIG, store2, clock);
    assert.equal(controller2.getState().state, STATES.VOID);
    assert.equal(controller2.getState().voidReason, 'P1_2_RUN3_RESTART_CONFIG_MISMATCH');
  } finally {
    rmSync(statePath, { force: true });
  }
});

// ---------------------------------------------------------------------------
// Controller protocol-contract pinning (closes
// P1_2_RUN3_UNSEALED_PLAN_AUTHORITY_ON_OPERATOR_PATH, controller half): a
// controller `config` must match the ratified Run-3 protocol constants
// (plan hash, GitHub reuse, Gmail new, total, acquisition duration) BEFORE
// any PM-authorization record is ever consulted. A matching PM-authorization
// record must never be able to rescue an off-contract config.
// ---------------------------------------------------------------------------

test('protocol C1: the exact ratified contract construction passes', () => {
  const statePath = tmpStatePath();
  try {
    const clock = makeClock(IN_WINDOW_MS);
    assert.doesNotThrow(() => new Run3AcquisitionController(CONFIG, new ControllerStateStore(statePath), clock));
  } finally {
    rmSync(statePath, { force: true });
  }
});

test('protocol C2: a wrong plan SHA-256 is rejected before PM authorization is ever consulted', () => {
  const statePath = tmpStatePath();
  try {
    const clock = makeClock(IN_WINDOW_MS);
    const badConfig = { ...CONFIG, planSha256: 'a'.repeat(64) };
    assert.throws(
      () => new Run3AcquisitionController(badConfig, new ControllerStateStore(statePath), clock),
      (error: unknown) => error instanceof ControllerError && error.code === 'P1_2_RUN3_CONFIG_PROTOCOL_MISMATCH:planSha256',
    );
  } finally {
    rmSync(statePath, { force: true });
  }
});

test('protocol C3: a GitHub reuse count of 33 or 35 is rejected', () => {
  for (const expectedGithubReuse of [33, 35]) {
    const statePath = tmpStatePath();
    try {
      const clock = makeClock(IN_WINDOW_MS);
      const badConfig = { ...CONFIG, expectedGithubReuse };
      assert.throws(
        () => new Run3AcquisitionController(badConfig, new ControllerStateStore(statePath), clock),
        (error: unknown) => error instanceof ControllerError && error.code === 'P1_2_RUN3_CONFIG_PROTOCOL_MISMATCH:expectedGithubReuse',
      );
    } finally {
      rmSync(statePath, { force: true });
    }
  }
});

test('protocol C4: a Gmail-new count other than 26 is rejected', () => {
  const statePath = tmpStatePath();
  try {
    const clock = makeClock(IN_WINDOW_MS);
    const badConfig = { ...CONFIG, expectedGmailNew: 25 };
    assert.throws(
      () => new Run3AcquisitionController(badConfig, new ControllerStateStore(statePath), clock),
      (error: unknown) => error instanceof ControllerError && error.code === 'P1_2_RUN3_CONFIG_PROTOCOL_MISMATCH:expectedGmailNew',
    );
  } finally {
    rmSync(statePath, { force: true });
  }
});

test('protocol C5: a total other than 60 is rejected', () => {
  const statePath = tmpStatePath();
  try {
    const clock = makeClock(IN_WINDOW_MS);
    const badConfig = { ...CONFIG, expectedTotal: 59 };
    assert.throws(
      () => new Run3AcquisitionController(badConfig, new ControllerStateStore(statePath), clock),
      (error: unknown) => error instanceof ControllerError && error.code === 'P1_2_RUN3_CONFIG_PROTOCOL_MISMATCH:expectedTotal',
    );
  } finally {
    rmSync(statePath, { force: true });
  }
});

test('protocol C6: an acquisition duration other than 4 hours is rejected', () => {
  const statePath = tmpStatePath();
  try {
    const clock = makeClock(IN_WINDOW_MS);
    const badConfig = { ...CONFIG, acquisitionDurationHours: 5 };
    assert.throws(
      () => new Run3AcquisitionController(badConfig, new ControllerStateStore(statePath), clock),
      (error: unknown) => error instanceof ControllerError && error.code === 'P1_2_RUN3_CONFIG_PROTOCOL_MISMATCH:acquisitionDurationHours',
    );
  } finally {
    rmSync(statePath, { force: true });
  }
});

test('protocol C7: a PM-authorization record that internally matches an off-contract config cannot rescue it', () => {
  const statePath = tmpStatePath();
  try {
    const clock = makeClock(IN_WINDOW_MS);
    const badConfig = { ...CONFIG, expectedTotal: 61, expectedGmailNew: 27 };
    // This "authorization" record is internally self-consistent with
    // badConfig (pmAuthMatchesConfig would accept it) — proving that the
    // gate here is genuinely the protocol-constant check, not merely
    // PM-authorization matching, which this record would otherwise satisfy.
    const selfConsistentAuthRecord = {
      run_id: badConfig.runId,
      plan_sha256: badConfig.planSha256,
      expected_github_reuse: badConfig.expectedGithubReuse,
      expected_gmail_new: badConfig.expectedGmailNew,
      expected_total: badConfig.expectedTotal,
      acquisition_duration_hours: badConfig.acquisitionDurationHours,
    };
    let controller: Run3AcquisitionController | null = null;
    assert.throws(
      () => {
        controller = new Run3AcquisitionController(badConfig, new ControllerStateStore(statePath), clock);
      },
      (error: unknown) => error instanceof ControllerError && error.code === 'P1_2_RUN3_CONFIG_PROTOCOL_MISMATCH:expectedGmailNew',
    );
    assert.equal(controller, null, 'construction must never succeed, so authorizePM can never even be reached');
    // Never reachable — documented, not executed, since `controller` stayed null:
    // controller.authorizePM(selfConsistentAuthRecord)
    assert.ok(selfConsistentAuthRecord.expected_total === 61, 'sanity: the record really was self-consistent with the rejected config');
  } finally {
    rmSync(statePath, { force: true });
  }
});

test('protocol C8: a protocol-valid config with a mismatching PM-authorization record still fails (prior behavior preserved)', () => {
  const statePath = tmpStatePath();
  try {
    const clock = makeClock(IN_WINDOW_MS);
    const controller = new Run3AcquisitionController(CONFIG, new ControllerStateStore(statePath), clock);
    assert.throws(
      () => controller.authorizePM(validAuthRecord({ expected_total: 999 })),
      (error: unknown) => error instanceof ControllerError && error.code === 'P1_2_RUN3_PM_AUTHORIZATION_INVALID',
    );
  } finally {
    rmSync(statePath, { force: true });
  }
});
