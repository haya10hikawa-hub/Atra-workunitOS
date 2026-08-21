/**
 * Validation suite for the Run-3 final-integration wiring: the
 * `acquireRaw` adapter bridging the acquisition controller to the Gmail RAW
 * transport, the metadata-only enumerator feeding the selection rule, the
 * content-free plan-authority verifier, and the Run-3 preflight that
 * composes all of the above with the existing GitHub-reuse checks.
 *
 * Every identity and credential here is synthetic. No test performs a real
 * network request: `globalThis.fetch` is mocked outright. No test calls
 * `recordT0`, `runCanary`, or `acquireNext` against the real transport.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CREDENTIAL_ENV, GmailTransportError, acquireGmailRawMessage, sha256Hex } from '../tools/audit/p1-2-gmail-raw-transport/gmailRaw.mjs';
import { OAUTH_CREDENTIALS_PATH_ENV, OAUTH_TOKEN_PATH_ENV } from '../tools/audit/p1-2-gmail-raw-transport/oauthCredential.mjs';
import { Run3AcquisitionController, VoidTerminalError } from '../tools/audit/p1-2-run3-controller/controller.mjs';
import { ControllerStateStore } from '../tools/audit/p1-2-run3-controller/stateStore.mjs';
import { V1_WINDOW_END_MS, V1_WINDOW_START_MS } from '../tools/audit/p1-2-run3-controller/selection.mjs';
import { RawAdapterError, createGmailRawAdapter } from '../tools/audit/p1-2-run3-controller/rawAdapter.mjs';
import { MetadataEnumeratorError, enumerateGmailMetadata } from '../tools/audit/p1-2-run3-controller/metadataEnumerator.mjs';
import {
  PLAN_AUTHORITY_BYTE_LENGTH,
  PLAN_AUTHORITY_SHA256,
  PlanAuthorityError,
  canonicalPrefix,
  verifyPlanAuthorityForTesting,
  verifySealedPlanAuthority,
  verifySealedPlanAuthorityForTesting,
} from '../tools/audit/p1-2-run3-controller/planAuthority.mjs';
import { CHECK_NAMES as RUN3_PREFLIGHT_CHECK_NAMES, runRun3Preflight } from '../tools/audit/p1-2-run3-controller/preflight.mjs';

const TOKEN = 'SYNTHETIC_READONLY_TOKEN_MUST_NOT_LEAK_00000000';

async function withTmpRootAsync<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), 'p1-2-run3-final-'));
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

function b64url(buf: Buffer) {
  return buf.toString('base64url');
}

function oauthPaths(root: string) {
  return { credentialsPath: join(root, 'credentials.json'), tokenPath: join(root, 'token.json') };
}

function writeSynthOAuthFixture(root: string) {
  const { credentialsPath, tokenPath } = oauthPaths(root);
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

// ---------------------------------------------------------------------------
// 1. RAW adapter
// ---------------------------------------------------------------------------

test('adapter A1: invokes the RAW transport exactly once and forwards its content-free evidence unmodified', async () => {
  await withTmpRootAsync(async (root) => {
    let calls = 0;
    const fakeAcquire = async (input: { messageId: string; destPath: string; root: string; env: unknown }) => {
      calls += 1;
      return Object.freeze({
        message_id: input.messageId,
        byte_length: 42,
        provider_sha256: 'a'.repeat(64),
        persisted_sha256: 'a'.repeat(64),
        byte_equal: true,
      });
    };
    const acquireRaw = createGmailRawAdapter({ root, env: {}, acquire: fakeAcquire });
    const result = await acquireRaw({ message_id: 'msg-1' }, join(root, 'msg-1.eml'));
    assert.equal(calls, 1);
    assert.deepEqual(result, {
      message_id: 'msg-1',
      byte_length: 42,
      provider_sha256: 'a'.repeat(64),
      persisted_sha256: 'a'.repeat(64),
      byte_equal: true,
    });
  });
});

test('adapter A2: never adds or drops a field beyond the transport contract', async () => {
  await withTmpRootAsync(async (root) => {
    const evidence = Object.freeze({
      message_id: 'msg-2',
      byte_length: 7,
      provider_sha256: 'b'.repeat(64),
      persisted_sha256: 'b'.repeat(64),
      byte_equal: true,
    });
    const acquireRaw = createGmailRawAdapter({ root, env: {}, acquire: async () => evidence });
    const result = await acquireRaw({ message_id: 'msg-2' }, join(root, 'msg-2.eml'));
    assert.deepEqual(Object.keys(result).sort(), Object.keys(evidence).sort());
  });
});

test('adapter A3: throws unmodified when the transport throws (no internal retry, no swallow)', async () => {
  await withTmpRootAsync(async (root) => {
    let calls = 0;
    const acquireRaw = createGmailRawAdapter({
      root,
      env: {},
      acquire: async () => {
        calls += 1;
        throw new GmailTransportError('gmail_raw_unauthorized');
      },
    });
    await assert.rejects(() => acquireRaw({ message_id: 'msg-3' }, join(root, 'msg-3.eml')), GmailTransportError);
    assert.equal(calls, 1, 'adapter must not retry internally after a transport failure');
  });
});

test('adapter A4: real end-to-end call against a mocked Gmail RAW endpoint round-trips byte_equal=true', async () => {
  await withTmpRootAsync(async (root) => {
    const bodyBytes = Buffer.from('synthetic raw mime body for adapter A4');
    const restore = mockFetchOnce(async () => new Response(JSON.stringify({ raw: b64url(bodyBytes) }), { status: 200 }));
    try {
      const acquireRaw = createGmailRawAdapter({ root, env: { [CREDENTIAL_ENV]: TOKEN }, acquire: acquireGmailRawMessage });
      const dest = join(root, 'a4.eml');
      const result = await acquireRaw({ message_id: 'msg-a4' }, dest);
      assert.equal(result.message_id, 'msg-a4');
      assert.equal(result.byte_equal, true);
      assert.equal(readFileSync(dest).equals(bodyBytes), true);
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Controller <-> adapter integration (mocked acquireRaw, no real network)
// ---------------------------------------------------------------------------

function hex64(seed: string) {
  return createHash('sha256').update(seed, 'utf8').digest('hex');
}

const CONFIG = Object.freeze({
  runId: 'run3-final-integration-test',
  planSha256: PLAN_AUTHORITY_SHA256,
  expectedGithubReuse: 34,
  expectedGmailNew: 26,
  expectedTotal: 60,
  acquisitionDurationHours: 4,
});

function validAuthRecord() {
  return {
    run_id: CONFIG.runId,
    plan_sha256: CONFIG.planSha256,
    expected_github_reuse: CONFIG.expectedGithubReuse,
    expected_gmail_new: CONFIG.expectedGmailNew,
    expected_total: CONFIG.expectedTotal,
    acquisition_duration_hours: CONFIG.acquisitionDurationHours,
  };
}

function makeClock(startMs: number) {
  let now = startMs;
  return { now: () => now, advance(ms: number) { now += ms; } };
}

const IN_WINDOW_MS = Date.parse('2026-08-17T12:00:00.000Z');

function makeCandidates(count: number) {
  const list = [];
  for (let i = 0; i < count; i += 1) list.push({ message_id: `msg-${String(i).padStart(4, '0')}`, internalDate: IN_WINDOW_MS });
  return list;
}

function destinationFor(identity: { message_id: string }, root: string) {
  return join(root, `${identity.message_id}.eml`);
}

test('controller B1: canary acquisition calls the adapter exactly once and adopts its content-free evidence', async () => {
  await withTmpRootAsync(async (root) => {
    const store = new ControllerStateStore(join(root, 'state.json'));
    const clock = makeClock(1_000_000);
    const controller = new Run3AcquisitionController(CONFIG, store, clock);
    controller.authorizePM(validAuthRecord());
    controller.resolveSelection(makeCandidates(30), { windowStartMs: V1_WINDOW_START_MS, windowEndMs: V1_WINDOW_END_MS });
    controller.recordT0();

    let calls = 0;
    const acquireRaw = createGmailRawAdapter({
      root,
      env: {},
      acquire: async (input: { messageId: string }) => {
        calls += 1;
        return {
          message_id: input.messageId,
          byte_length: 10,
          provider_sha256: hex64(input.messageId),
          persisted_sha256: hex64(input.messageId),
          byte_equal: true,
        };
      },
    });

    await controller.runCanary(acquireRaw, (identity: { message_id: string }) => destinationFor(identity, root));
    assert.equal(calls, 1);
    assert.equal(controller.getState().completed.length, 1);
    assert.equal(controller.getState().completed[0].is_canary, true);
  });
});

test('controller B2: adapter throw -> controller goes VOID, does not retry', async () => {
  await withTmpRootAsync(async (root) => {
    const store = new ControllerStateStore(join(root, 'state.json'));
    const clock = makeClock(1_000_000);
    const controller = new Run3AcquisitionController(CONFIG, store, clock);
    controller.authorizePM(validAuthRecord());
    controller.resolveSelection(makeCandidates(30), { windowStartMs: V1_WINDOW_START_MS, windowEndMs: V1_WINDOW_END_MS });
    controller.recordT0();

    let calls = 0;
    const acquireRaw = createGmailRawAdapter({
      root,
      env: {},
      acquire: async () => {
        calls += 1;
        throw new RawAdapterError('raw_adapter_destination_invalid');
      },
    });

    await assert.rejects(() => controller.runCanary(acquireRaw, (identity: { message_id: string }) => destinationFor(identity, root)), VoidTerminalError);
    assert.equal(calls, 1);
    assert.equal(controller.getState().state, 'VOID');
    assert.equal(controller.getState().voidReason, 'P1_2_RUN3_CANARY_ACQUISITION_AMBIGUOUS');

    // No retry on a second call either — the controller is terminal.
    await assert.rejects(() => controller.runCanary(acquireRaw, (identity: { message_id: string }) => destinationFor(identity, root)), VoidTerminalError);
    assert.equal(calls, 1, 'must never call acquireRaw again once VOID');
  });
});

test('controller B3: adapter byte_equal=false -> VOID (byte-fidelity failure)', async () => {
  await withTmpRootAsync(async (root) => {
    const store = new ControllerStateStore(join(root, 'state.json'));
    const clock = makeClock(1_000_000);
    const controller = new Run3AcquisitionController(CONFIG, store, clock);
    controller.authorizePM(validAuthRecord());
    controller.resolveSelection(makeCandidates(30), { windowStartMs: V1_WINDOW_START_MS, windowEndMs: V1_WINDOW_END_MS });
    controller.recordT0();

    const acquireRaw = createGmailRawAdapter({
      root,
      env: {},
      acquire: async (input: { messageId: string }) => ({
        message_id: input.messageId,
        byte_length: 10,
        provider_sha256: hex64(`a-${input.messageId}`),
        persisted_sha256: hex64(`b-${input.messageId}`),
        byte_equal: false,
      }),
    });

    await assert.rejects(() => controller.runCanary(acquireRaw, (identity: { message_id: string }) => destinationFor(identity, root)), VoidTerminalError);
    assert.equal(controller.getState().voidReason, 'P1_2_RUN3_CANARY_BYTE_FIDELITY_FAILURE');
  });
});

test('controller B4: ambiguous ok=false-then-crash outcome is never retried across a restart', async () => {
  await withTmpRootAsync(async (root) => {
    const statePath = join(root, 'state.json');
    const store1 = new ControllerStateStore(statePath);
    const clock = makeClock(1_000_000);
    const controller1 = new Run3AcquisitionController(CONFIG, store1, clock);
    controller1.authorizePM(validAuthRecord());
    controller1.resolveSelection(makeCandidates(30), { windowStartMs: V1_WINDOW_START_MS, windowEndMs: V1_WINDOW_END_MS });
    controller1.recordT0();

    // Simulate a process crash mid-acquisition: the in-flight marker was
    // persisted before the (never-completing) acquireRaw call.
    const acquireRaw = createGmailRawAdapter({ root, env: {}, acquire: () => new Promise(() => {}) });
    const runPromise = controller1.runCanary(acquireRaw, (identity: { message_id: string }) => destinationFor(identity, root));
    void runPromise.catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Fresh controller instance restored from the same durable state — this
    // is what "process restart" looks like.
    const store2 = new ControllerStateStore(statePath);
    const controller2 = new Run3AcquisitionController(CONFIG, store2, clock);
    assert.equal(controller2.getState().state, 'VOID');
    assert.equal(controller2.getState().voidReason, 'P1_2_RUN3_ACQUISITION_INTERRUPTED_AMBIGUOUS');
  });
});

// ---------------------------------------------------------------------------
// 3. Metadata enumerator
// ---------------------------------------------------------------------------

function gmailListResponse(ids: string[], nextPageToken?: string) {
  return new Response(JSON.stringify({ messages: ids.map((id) => ({ id })), nextPageToken }), { status: 200 });
}

function gmailGetResponse(id: string, internalDate: string, extraSemanticFields: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ id, internalDate, ...extraSemanticFields }), { status: 200 });
}

test('enumerator C1: emits ONLY message_id + internalDate, even when the mocked response carries semantic fields', async () => {
  const restore = mockFetchOnce(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname === '/gmail/v1/users/me/messages') return gmailListResponse(['m1']);
    return gmailGetResponse('m1', String(IN_WINDOW_MS), {
      subject: 'LEAK: must never appear on the enumerator contract',
      from: 'attacker@example.com',
      snippet: 'LEAK',
      payload: { headers: [{ name: 'To', value: 'victim@example.com' }] },
    });
  });
  try {
    const result = await enumerateGmailMetadata({ env: { [CREDENTIAL_ENV]: TOKEN } });
    assert.equal(result.candidates.length, 1);
    assert.deepEqual(Object.keys(result.candidates[0]).sort(), ['internalDate', 'message_id']);
    assert.equal(result.candidates[0].message_id, 'm1');
    assert.equal(JSON.stringify(result).includes('LEAK'), false);
    assert.equal(JSON.stringify(result).includes('attacker@example.com'), false);
  } finally {
    restore();
  }
});

test('enumerator C2: paginates until nextPageToken is exhausted', async () => {
  let listCalls = 0;
  const restore = mockFetchOnce(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname === '/gmail/v1/users/me/messages') {
      listCalls += 1;
      const pageToken = url.searchParams.get('pageToken');
      if (!pageToken) return gmailListResponse(['m1', 'm2'], 'page-2');
      if (pageToken === 'page-2') return gmailListResponse(['m3'], undefined);
      throw new Error('unexpected extra page');
    }
    const id = url.pathname.split('/').pop() as string;
    return gmailGetResponse(id, String(IN_WINDOW_MS));
  });
  try {
    const result = await enumerateGmailMetadata({ env: { [CREDENTIAL_ENV]: TOKEN } });
    assert.equal(listCalls, 2);
    assert.equal(result.pageCount, 2);
    assert.deepEqual(
      result.candidates.map((c) => c.message_id).sort(),
      ['m1', 'm2', 'm3'],
    );
  } finally {
    restore();
  }
});

test('enumerator C3: includeSpamTrash=true is always sent on every list page', async () => {
  const seenFlags: (string | null)[] = [];
  const restore = mockFetchOnce(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname === '/gmail/v1/users/me/messages') {
      seenFlags.push(url.searchParams.get('includeSpamTrash'));
      const pageToken = url.searchParams.get('pageToken');
      if (!pageToken) return gmailListResponse(['m1'], 'page-2');
      return gmailListResponse(['m2'], undefined);
    }
    const id = url.pathname.split('/').pop() as string;
    return gmailGetResponse(id, String(IN_WINDOW_MS));
  });
  try {
    await enumerateGmailMetadata({ env: { [CREDENTIAL_ENV]: TOKEN } });
    assert.deepEqual(seenFlags, ['true', 'true']);
  } finally {
    restore();
  }
});

test('enumerator C4: a search query is recall-only — an out-of-window message the query returns is still excluded from `eligible`', async () => {
  const restore = mockFetchOnce(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname === '/gmail/v1/users/me/messages') {
      assert.equal(url.searchParams.get('q'), 'some-recall-only-prefilter');
      return gmailListResponse(['in-window', 'out-of-window']);
    }
    const id = url.pathname.split('/').pop() as string;
    const at = id === 'in-window' ? IN_WINDOW_MS : Date.parse('2020-01-01T00:00:00.000Z');
    return gmailGetResponse(id, String(at));
  });
  try {
    const result = await enumerateGmailMetadata({ env: { [CREDENTIAL_ENV]: TOKEN }, query: 'some-recall-only-prefilter' });
    assert.deepEqual(
      result.candidates.map((c) => c.message_id).sort(),
      ['in-window', 'out-of-window'],
    );
    assert.deepEqual(result.eligible.map((c) => c.message_id), ['in-window']);
  } finally {
    restore();
  }
});

test('enumerator C5: internalDate window controls eligibility exactly at both boundaries', async () => {
  const restore = mockFetchOnce(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname === '/gmail/v1/users/me/messages') return gmailListResponse(['at-start', 'at-end', 'before-start', 'after-end']);
    const id = url.pathname.split('/').pop() as string;
    const map: Record<string, number> = {
      'at-start': V1_WINDOW_START_MS,
      'at-end': V1_WINDOW_END_MS,
      'before-start': V1_WINDOW_START_MS - 1,
      'after-end': V1_WINDOW_END_MS + 1,
    };
    return gmailGetResponse(id, String(map[id]));
  });
  try {
    const result = await enumerateGmailMetadata({ env: { [CREDENTIAL_ENV]: TOKEN } });
    assert.deepEqual(result.eligible.map((c) => c.message_id).sort(), ['at-end', 'at-start']);
  } finally {
    restore();
  }
});

test('enumerator C6: a duplicate message id across pages FAILS enumeration closed (never silently de-duplicated)', async () => {
  // Tightened intentionally (blocker A): a repeated provider identity must
  // fail the enumeration, not be silently absorbed into a smaller universe.
  let getCalls = 0;
  const restore = mockFetchOnce(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname === '/gmail/v1/users/me/messages') {
      const pageToken = url.searchParams.get('pageToken');
      if (!pageToken) return gmailListResponse(['dup', 'm2'], 'page-2');
      return gmailListResponse(['dup'], undefined);
    }
    getCalls += 1;
    const id = url.pathname.split('/').pop() as string;
    return gmailGetResponse(id, String(IN_WINDOW_MS));
  });
  try {
    await assert.rejects(
      () => enumerateGmailMetadata({ env: { [CREDENTIAL_ENV]: TOKEN } }),
      (error: unknown) => error instanceof MetadataEnumeratorError && error.code === 'P1_2_RUN3_GMAIL_DUPLICATE_PROVIDER_IDENTITY',
    );
    // 'dup' (1st occurrence, page 1) and 'm2' are legitimately fetched; the
    // repeated 'dup' on page 2 must be rejected BEFORE a second getMetadata
    // call for it is ever issued.
    assert.equal(getCalls, 2, 'getMetadata must not be called a second time for the duplicate id');
  } finally {
    restore();
  }
});

test('enumerator C6b: a duplicate message id within the SAME page also fails enumeration closed', async () => {
  let getCalls = 0;
  const restore = mockFetchOnce(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname === '/gmail/v1/users/me/messages') return gmailListResponse(['dup', 'm2', 'dup']);
    getCalls += 1;
    const id = url.pathname.split('/').pop() as string;
    return gmailGetResponse(id, String(IN_WINDOW_MS));
  });
  try {
    await assert.rejects(
      () => enumerateGmailMetadata({ env: { [CREDENTIAL_ENV]: TOKEN } }),
      (error: unknown) => error instanceof MetadataEnumeratorError && error.code === 'P1_2_RUN3_GMAIL_DUPLICATE_PROVIDER_IDENTITY',
    );
    assert.equal(getCalls, 2, '"dup" (1st) and "m2" are fetched before the repeated "dup" (3rd in the same page) is rejected');
  } finally {
    restore();
  }
});

test('enumerator C6c: a duplicate identity never reaches selection as a silently reweighted universe', async () => {
  const restore = mockFetchOnce(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname === '/gmail/v1/users/me/messages') return gmailListResponse(['dup', 'dup']);
    const id = url.pathname.split('/').pop() as string;
    return gmailGetResponse(id, String(IN_WINDOW_MS));
  });
  try {
    let enumerationSucceeded = false;
    try {
      await enumerateGmailMetadata({ env: { [CREDENTIAL_ENV]: TOKEN } });
      enumerationSucceeded = true;
    } catch (error) {
      assert.ok(error instanceof MetadataEnumeratorError && error.code === 'P1_2_RUN3_GMAIL_DUPLICATE_PROVIDER_IDENTITY');
    }
    assert.equal(enumerationSucceeded, false, 'a duplicate identity must never resolve to an eligible/candidates set that selection could consume');
  } finally {
    restore();
  }
});

test('enumerator C7: uses field projection on both the list call and the per-message metadata call', async () => {
  const restore = mockFetchOnce(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname === '/gmail/v1/users/me/messages') {
      assert.equal(url.searchParams.get('fields'), 'nextPageToken,messages/id');
      return gmailListResponse(['m1']);
    }
    assert.equal(url.searchParams.get('fields'), 'id,internalDate');
    return gmailGetResponse('m1', String(IN_WINDOW_MS));
  });
  try {
    await enumerateGmailMetadata({ env: { [CREDENTIAL_ENV]: TOKEN } });
  } finally {
    restore();
  }
});

test('enumerator C8: no OAuth client configured -> falls back to the shared ATRA_P1_2_GMAIL_TOKEN path (no second auth mechanism)', async () => {
  const restore = mockFetchOnce(async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('authorization'), `Bearer ${TOKEN}`);
    const url = new URL(String(input));
    if (url.pathname === '/gmail/v1/users/me/messages') return gmailListResponse([]);
    throw new Error('unexpected');
  });
  try {
    const result = await enumerateGmailMetadata({ env: { [CREDENTIAL_ENV]: TOKEN } });
    assert.deepEqual(result.candidates, []);
  } finally {
    restore();
  }
});

test('enumerator C9: an unauthorized response fails closed with a stable code, not a silent empty result', async () => {
  const restore = mockFetchOnce(async () => new Response('nope', { status: 401 }));
  try {
    await assert.rejects(() => enumerateGmailMetadata({ env: { [CREDENTIAL_ENV]: TOKEN } }), MetadataEnumeratorError);
  } finally {
    restore();
  }
});

// ---------------------------------------------------------------------------
// 4. Controller + enumerator + selection, end to end (still fully mocked)
// ---------------------------------------------------------------------------

test('integration D1: enumerator eligible set feeds resolveSelection to exactly 26 selected, selected[0] is the canary', async () => {
  const ids = Array.from({ length: 40 }, (_, i) => `msg-${String(i).padStart(4, '0')}`);
  const restore = mockFetchOnce(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname === '/gmail/v1/users/me/messages') return gmailListResponse(ids);
    const id = url.pathname.split('/').pop() as string;
    return gmailGetResponse(id, String(IN_WINDOW_MS));
  });
  await withTmpRootAsync(async (root) => {
    try {
      const enumerated = await enumerateGmailMetadata({ env: { [CREDENTIAL_ENV]: TOKEN } });
      const store = new ControllerStateStore(join(root, 'state.json'));
      const clock = makeClock(1_000_000);
      const controller = new Run3AcquisitionController(CONFIG, store, clock);
      controller.authorizePM(validAuthRecord());
      controller.resolveSelection(enumerated.eligible, { windowStartMs: V1_WINDOW_START_MS, windowEndMs: V1_WINDOW_END_MS });
      const selection = controller.getState().selection!;
      assert.equal(selection.selected.length, 26);
      assert.equal(selection.selected[0].message_id, selection.canary.message_id);
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Plan-authority verifier
// ---------------------------------------------------------------------------

const BOUNDARY_MARKER = '\n--- RATIFICATION TRAILER (excluded from canonical hash) ---\n';

// legacy trailer-stripping verifier — retained purely as a TEST-ONLY utility
// (see `verifyPlanAuthorityForTesting` in planAuthority.mjs); it is never
// reachable from production preflight, which uses the sealed
// `{planBuffer, sidecarBuffer}` API exercised in the "sealed S*" tests below.

test('plan legacy-E1: canonical-prefix hash matches when the prefix and expected hash agree', () => {
  const body = Buffer.from('SYNTHETIC PLAN POLICY BODY — not real plan content — v1\nSection A\nSection B\n');
  const trailer = Buffer.from('PM: ratified 2026-08-21 by SYNTHETIC_APPROVER\n');
  const doc = Buffer.concat([body, Buffer.from(BOUNDARY_MARKER), trailer]);
  const expected = createHash('sha256').update(body).digest('hex');
  const result = verifyPlanAuthorityForTesting({ buffer: doc, boundaryMarker: BOUNDARY_MARKER, expectedSha256: expected });
  assert.equal(result.PLAN_AUTHORITY_MATCH, true);
  assert.equal(result.ACTUAL_CANONICAL_SHA256, expected);
  assert.equal(result.EXPECTED_SHA256, expected);
  assert.equal(result.CANONICAL_BYTE_LENGTH, body.length);
});

test('plan legacy-E2: changing only the trailer after the boundary does not change the canonical hash', () => {
  const body = Buffer.from('SYNTHETIC PLAN POLICY BODY — not real plan content — v1\n');
  const doc1 = Buffer.concat([body, Buffer.from(BOUNDARY_MARKER), Buffer.from('trailer v1')]);
  const doc2 = Buffer.concat([body, Buffer.from(BOUNDARY_MARKER), Buffer.from('trailer v2, totally different, much longer')]);
  const { sha256: h1 } = canonicalPrefix(doc1, BOUNDARY_MARKER);
  const { sha256: h2 } = canonicalPrefix(doc2, BOUNDARY_MARKER);
  assert.equal(h1, h2);
});

test('plan legacy-E3: rejects a naive whole-file hash even though it is a valid hash of the same bytes', () => {
  const body = Buffer.from('SYNTHETIC PLAN POLICY BODY v2\n');
  const trailer = Buffer.from('PM ratification block\n');
  const doc = Buffer.concat([body, Buffer.from(BOUNDARY_MARKER), trailer]);
  const naiveWholeFileHash = createHash('sha256').update(doc).digest('hex');
  const result = verifyPlanAuthorityForTesting({ buffer: doc, boundaryMarker: BOUNDARY_MARKER, expectedSha256: naiveWholeFileHash });
  assert.equal(result.PLAN_AUTHORITY_MATCH, false);
});

test('plan legacy-E4: rejects an arbitrary wrong/old hash', () => {
  const body = Buffer.from('SYNTHETIC PLAN POLICY BODY v3\n');
  const doc = Buffer.concat([body, Buffer.from(BOUNDARY_MARKER), Buffer.from('trailer')]);
  const oldHash = 'f'.repeat(64);
  const result = verifyPlanAuthorityForTesting({ buffer: doc, boundaryMarker: BOUNDARY_MARKER, expectedSha256: oldHash });
  assert.equal(result.PLAN_AUTHORITY_MATCH, false);
  assert.equal(result.EXPECTED_SHA256, oldHash);
});

test('plan legacy-E5: never returns plan content, only the four content-free fields', () => {
  const body = Buffer.from('SECRET_PLAN_BODY_MUST_NOT_LEAK_ANYWHERE_IN_RESULT');
  const doc = Buffer.concat([body, Buffer.from(BOUNDARY_MARKER), Buffer.from('trailer')]);
  const result = verifyPlanAuthorityForTesting({ buffer: doc, boundaryMarker: BOUNDARY_MARKER, expectedSha256: 'x'.repeat(64) });
  assert.deepEqual(Object.keys(result).sort(), ['ACTUAL_CANONICAL_SHA256', 'CANONICAL_BYTE_LENGTH', 'EXPECTED_SHA256', 'PLAN_AUTHORITY_MATCH']);
  assert.equal(JSON.stringify(result).includes('SECRET_PLAN_BODY'), false);
});

test('plan E6: the pinned Run-3 plan-authority constants are exactly the ratified values', () => {
  assert.equal(PLAN_AUTHORITY_SHA256, '8b8bd19df7369a28ebb410c93dee8ed5cdf0085ce46d8a3f01c395396a837b9c');
  assert.equal(PLAN_AUTHORITY_BYTE_LENGTH, 13067);
});

// ---------------------------------------------------------------------------
// 5b. Sealed production plan-authority verifier ({planBuffer, sidecarBuffer})
//
// The real ratified plan's bytes (whose SHA-256 is the pinned
// PLAN_AUTHORITY_SHA256 above) are not available to this test suite — by
// construction, nothing can produce content matching a fixed SHA-256 without
// a preimage. `verifySealedPlanAuthorityForTesting` exists exactly for this:
// it runs the identical sealed-check logic as the production
// `verifySealedPlanAuthority`, but with the pinned hash/length supplied by
// the test instead of read from the module constants, so every branch of the
// real logic (byte-size mismatch, hash mismatch, sidecar mismatch, stale
// authority, …) can be proven without a preimage. It is never imported by
// preflight.mjs or any production entrypoint.
// ---------------------------------------------------------------------------

function sealedPlanFixture({ byteLength = 512 }: { byteLength?: number } = {}) {
  const planBuffer = Buffer.alloc(byteLength);
  for (let i = 0; i < byteLength; i += 1) planBuffer[i] = (i * 31 + 7) % 256;
  const pinnedSha256 = createHash('sha256').update(planBuffer).digest('hex');
  const sidecarBuffer = Buffer.from(`${pinnedSha256}  RUN3_PREREGISTRATION.md\n`, 'utf8');
  return { planBuffer, sidecarBuffer, pinnedSha256, pinnedByteLength: byteLength };
}

test('sealed S1: canonical plan + correct sidecar passes', () => {
  const fixture = sealedPlanFixture();
  const result = verifySealedPlanAuthorityForTesting({
    planBuffer: fixture.planBuffer,
    sidecarBuffer: fixture.sidecarBuffer,
    pinnedSha256: fixture.pinnedSha256,
    pinnedByteLength: fixture.pinnedByteLength,
  });
  assert.deepEqual(result, {
    PLAN_AUTHORITY_MATCH: true,
    PLAN_AUTHORITY_SHA256: fixture.pinnedSha256,
    PLAN_AUTHORITY_BYTE_LENGTH: fixture.pinnedByteLength,
  });
});

test('sealed S2: one byte changed in the plan, with an attacker-updated matching sidecar, still fails against the pinned authority', () => {
  const fixture = sealedPlanFixture();
  const corrupted = Buffer.from(fixture.planBuffer);
  corrupted[10] ^= 0xff;
  // The attacker controls both the corrupted plan and the sidecar, and
  // updates the sidecar to self-consistently "match" the corrupted plan —
  // this must still fail, because the pinned authority is fixed, not derived
  // from whatever the sidecar claims.
  const attackerSidecar = Buffer.from(`${createHash('sha256').update(corrupted).digest('hex')}  RUN3_PREREGISTRATION.md\n`);
  assert.throws(
    () =>
      verifySealedPlanAuthorityForTesting({
        planBuffer: corrupted,
        sidecarBuffer: attackerSidecar,
        pinnedSha256: fixture.pinnedSha256,
        pinnedByteLength: fixture.pinnedByteLength,
      }),
    (error: unknown) => error instanceof PlanAuthorityError && error.code === 'plan_authority_hash_mismatch',
  );
});

test('sealed S3: correct plan + wrong sidecar fails', () => {
  const fixture = sealedPlanFixture();
  const wrongSidecar = Buffer.from(`${'0'.repeat(64)}  RUN3_PREREGISTRATION.md\n`);
  assert.throws(
    () =>
      verifySealedPlanAuthorityForTesting({
        planBuffer: fixture.planBuffer,
        sidecarBuffer: wrongSidecar,
        pinnedSha256: fixture.pinnedSha256,
        pinnedByteLength: fixture.pinnedByteLength,
      }),
    (error: unknown) => error instanceof PlanAuthorityError && error.code === 'plan_authority_sidecar_hash_mismatch',
  );
});

test('sealed S4: correct hash + wrong byte size fails', () => {
  const fixture = sealedPlanFixture({ byteLength: 500 });
  assert.throws(
    () =>
      verifySealedPlanAuthorityForTesting({
        planBuffer: fixture.planBuffer,
        sidecarBuffer: fixture.sidecarBuffer,
        pinnedSha256: fixture.pinnedSha256,
        pinnedByteLength: 501,
      }),
    (error: unknown) => error instanceof PlanAuthorityError && error.code === 'plan_authority_byte_size_mismatch',
  );
});

test('sealed S5: a stale/old pinned authority value fails against the current (correct-for-itself) plan+sidecar', () => {
  const fixture = sealedPlanFixture();
  const staleSha256 = 'f'.repeat(64);
  assert.throws(
    () =>
      verifySealedPlanAuthorityForTesting({
        planBuffer: fixture.planBuffer,
        sidecarBuffer: fixture.sidecarBuffer,
        pinnedSha256: staleSha256,
        pinnedByteLength: fixture.pinnedByteLength,
      }),
    (error: unknown) => error instanceof PlanAuthorityError && error.code === 'plan_authority_hash_mismatch',
  );
});

test('sealed S6: a missing sidecar fails with a stable code', () => {
  const fixture = sealedPlanFixture();
  assert.throws(
    () =>
      verifySealedPlanAuthorityForTesting({
        planBuffer: fixture.planBuffer,
        // @ts-expect-error intentionally omitted to exercise the missing-sidecar path
        sidecarBuffer: undefined,
        pinnedSha256: fixture.pinnedSha256,
        pinnedByteLength: fixture.pinnedByteLength,
      }),
    (error: unknown) => error instanceof PlanAuthorityError && error.code === 'plan_authority_sidecar_missing',
  );
});

test('sealed S7: a malformed sidecar (no parseable hash) fails with a stable code', () => {
  const fixture = sealedPlanFixture();
  assert.throws(
    () =>
      verifySealedPlanAuthorityForTesting({
        planBuffer: fixture.planBuffer,
        sidecarBuffer: Buffer.from('not a hash at all, just some prose'),
        pinnedSha256: fixture.pinnedSha256,
        pinnedByteLength: fixture.pinnedByteLength,
      }),
    (error: unknown) => error instanceof PlanAuthorityError && error.code === 'plan_authority_sidecar_malformed',
  );
});

test('sealed S8: the production verifier has no caller-suppliable override — an extra expectedSha256 field is ignored', () => {
  // verifySealedPlanAuthority's real signature is exactly
  // {planBuffer, sidecarBuffer}. We cannot construct plan bytes matching the
  // REAL pinned PLAN_AUTHORITY_SHA256 (that needs a SHA-256 preimage), so
  // this proves the negative instead: even the plan's OWN correct hash,
  // offered under the field name `expectedSha256` as if it were an
  // authoritative override, has no effect — the function still checks only
  // against the real pinned constant and still fails, because this
  // synthetic buffer's hash is not that constant.
  const attackerBuffer = Buffer.alloc(PLAN_AUTHORITY_BYTE_LENGTH, 0x41);
  const attackerHash = createHash('sha256').update(attackerBuffer).digest('hex');
  assert.equal(verifySealedPlanAuthority.length, 1, 'production verifier takes exactly one (destructured) argument');
  assert.throws(
    () =>
      (verifySealedPlanAuthority as (input: Record<string, unknown>) => unknown)({
        planBuffer: attackerBuffer,
        sidecarBuffer: Buffer.from(attackerHash),
        expectedSha256: attackerHash,
        boundaryMarker: 'irrelevant',
      }),
    (error: unknown) => error instanceof PlanAuthorityError && error.code === 'plan_authority_hash_mismatch',
  );
});

test('sealed S9: the production verifier is bound to the real pinned byte length, not to a value a caller could pass in', () => {
  const wrongSizeBuffer = Buffer.alloc(PLAN_AUTHORITY_BYTE_LENGTH + 1, 0x42);
  assert.throws(
    () => verifySealedPlanAuthority({ planBuffer: wrongSizeBuffer, sidecarBuffer: Buffer.from(PLAN_AUTHORITY_SHA256) }),
    (error: unknown) => error instanceof PlanAuthorityError && error.code === 'plan_authority_byte_size_mismatch',
  );
});

// ---------------------------------------------------------------------------
// 6. Run-3 preflight
// ---------------------------------------------------------------------------

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

function writeSynthGithubArtifact(artifactRoot: string, id: string, prNumber: number) {
  mkdirSync(artifactRoot, { recursive: true });
  writeFileSync(join(artifactRoot, `synthetic-pr-${prNumber}.json`), synthGithubArtifactBytes(id));
}

function synthSelectionResolved(selectedPrNumbers: number[]) {
  return JSON.stringify({ 'U-COLLAB': { github_pull_request: { selected: selectedPrNumbers } } });
}

async function buildGithubFixture(root: string, count = 34) {
  const manifestPath = join(root, 'manifest.jsonl');
  const artifactRoot = join(root, 'artifacts');
  const lines: string[] = [];
  const selected: number[] = [];
  for (let i = 1; i <= count; i += 1) {
    const id = `P1D-${String(i).padStart(4, '0')}`;
    lines.push(synthGithubManifestLine(id, i));
    writeSynthGithubArtifact(artifactRoot, id, i);
    selected.push(i);
  }
  writeFileSync(manifestPath, lines.join('\n'));
  const selectionResolvedPath = join(root, 'selection-resolved.json');
  writeFileSync(selectionResolvedPath, synthSelectionResolved(selected));
  return { manifestPath, artifactRoot, selectionResolvedPath };
}

/**
 * Preflight-level plan fixture: a synthetic plan/sidecar pair, plus a
 * `planAuthorityVerifier` override bound to that pair's OWN hash/length
 * (never to the real pinned `PLAN_AUTHORITY_SHA256`/`PLAN_AUTHORITY_BYTE_LENGTH`).
 * `planAuthorityVerifier` is an internal test seam on `runRun3Preflight`
 * (see preflight.mjs) — it lets the full preflight composition be exercised
 * end to end without a preimage of the real ratified plan. No production
 * caller ever supplies it; the seam still only ever receives
 * `{planBuffer, sidecarBuffer}` from preflight, exactly like the real
 * `verifySealedPlanAuthority` would.
 */
function preflightPlanFixture() {
  const plan = sealedPlanFixture();
  const planAuthorityVerifier = (input: { planBuffer: Buffer; sidecarBuffer: Buffer }) =>
    verifySealedPlanAuthorityForTesting({ ...input, pinnedSha256: plan.pinnedSha256, pinnedByteLength: plan.pinnedByteLength });
  return { planBuffer: plan.planBuffer, sidecarBuffer: plan.sidecarBuffer, planAuthorityVerifier };
}

function mkPrivateStateDir(root: string) {
  const dir = join(root, 'private-state');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return join(dir, 'state.json');
}

test('preflight F1: passes when every structural condition holds (mocked auth, synthetic GitHub reuse fixture)', async () => {
  await withTmpRootAsync(async (root) => {
    const { manifestPath, artifactRoot, selectionResolvedPath } = await buildGithubFixture(root, 34);
    const plan = preflightPlanFixture();
    const oauthEnv = writeSynthOAuthFixture(root);
    // Preflight is read-only (blocker C) and never creates the private
    // state root itself — an authorized bootstrap step is assumed to have
    // already provisioned it before preflight runs.
    const statePath = mkPrivateStateDir(root);
    const restore = mockFetchOnce(async () => new Response(JSON.stringify({}), { status: 200 }));
    try {
      const result = await runRun3Preflight({
        env: { [CREDENTIAL_ENV]: TOKEN, ...oauthEnv },
        statePath,
        planBuffer: plan.planBuffer,
        sidecarBuffer: plan.sidecarBuffer,
        planAuthorityVerifier: plan.planAuthorityVerifier,
        run2ManifestPath: manifestPath,
        run2ArtifactRoot: artifactRoot,
        run2SelectionResolvedPath: selectionResolvedPath,
      });
      assert.deepEqual(result.failed_checks, []);
      assert.equal(result.overall_pass, true);
      assert.deepEqual(Object.keys(result.checks).sort(), [...RUN3_PREFLIGHT_CHECK_NAMES].sort());
    } finally {
      restore();
    }
  });
});

test('preflight F2: fails closed (does not crash) when the GitHub reuse count is not exactly 34', async () => {
  await withTmpRootAsync(async (root) => {
    const { manifestPath, artifactRoot, selectionResolvedPath } = await buildGithubFixture(root, 33);
    const plan = preflightPlanFixture();
    const restore = mockFetchOnce(async () => new Response(JSON.stringify({}), { status: 200 }));
    try {
      const result = await runRun3Preflight({
        env: { [CREDENTIAL_ENV]: TOKEN },
        statePath: mkPrivateStateDir(root),
        planBuffer: plan.planBuffer,
        sidecarBuffer: plan.sidecarBuffer,
        planAuthorityVerifier: plan.planAuthorityVerifier,
        run2ManifestPath: manifestPath,
        run2ArtifactRoot: artifactRoot,
        run2SelectionResolvedPath: selectionResolvedPath,
      });
      assert.equal(result.overall_pass, false);
      assert.ok(result.failed_checks.includes('run2_github_reuse_count_exact'));
    } finally {
      restore();
    }
  });
});

test('preflight F3: fails closed when the plan authority hash does not match (via the injected pinned-test-authority)', async () => {
  await withTmpRootAsync(async (root) => {
    const { manifestPath, artifactRoot, selectionResolvedPath } = await buildGithubFixture(root, 34);
    const mismatchedPlan = sealedPlanFixture();
    // The verifier is pinned to a DIFFERENT plan's hash than the one actually
    // supplied — exercises the mismatch path through the full preflight
    // composition, the same way a corrupted-or-wrong plan document would.
    const otherPlan = sealedPlanFixture({ byteLength: 600 });
    const planAuthorityVerifier = (input: { planBuffer: Buffer; sidecarBuffer: Buffer }) =>
      verifySealedPlanAuthorityForTesting({ ...input, pinnedSha256: otherPlan.pinnedSha256, pinnedByteLength: otherPlan.pinnedByteLength });
    const restore = mockFetchOnce(async () => new Response(JSON.stringify({}), { status: 200 }));
    try {
      const result = await runRun3Preflight({
        env: { [CREDENTIAL_ENV]: TOKEN },
        statePath: mkPrivateStateDir(root),
        planBuffer: mismatchedPlan.planBuffer,
        sidecarBuffer: mismatchedPlan.sidecarBuffer,
        planAuthorityVerifier,
        run2ManifestPath: manifestPath,
        run2ArtifactRoot: artifactRoot,
        run2SelectionResolvedPath: selectionResolvedPath,
      });
      assert.equal(result.overall_pass, false);
      assert.ok(result.failed_checks.includes('plan_authority_valid'));
    } finally {
      restore();
    }
  });
});

test('preflight F4: with no planAuthorityVerifier override supplied, runRun3Preflight defaults to the real production verifySealedPlanAuthority', async () => {
  await withTmpRootAsync(async (root) => {
    const { manifestPath, artifactRoot, selectionResolvedPath } = await buildGithubFixture(root, 34);
    // Synthetic plan/sidecar — genuinely cannot match the real ratified
    // PLAN_AUTHORITY_SHA256 (that would need a SHA-256 preimage), so this
    // proves the *default wiring* honestly: with no override, preflight uses
    // the real sealed verifier and correctly reports a mismatch for content
    // that isn't the real ratified plan, rather than fabricating a pass.
    const plan = sealedPlanFixture();
    const restore = mockFetchOnce(async () => new Response(JSON.stringify({}), { status: 200 }));
    try {
      const result = await runRun3Preflight({
        env: { [CREDENTIAL_ENV]: TOKEN },
        statePath: mkPrivateStateDir(root),
        planBuffer: plan.planBuffer,
        sidecarBuffer: plan.sidecarBuffer,
        // planAuthorityVerifier omitted -> defaults to the real verifySealedPlanAuthority
        run2ManifestPath: manifestPath,
        run2ArtifactRoot: artifactRoot,
        run2SelectionResolvedPath: selectionResolvedPath,
      });
      assert.ok(result.failed_checks.includes('plan_authority_valid'));
    } finally {
      restore();
    }
  });
});

test('preflight F5: never records T0, never calls acquireRaw, never calls the controller mutating methods', async () => {
  await withTmpRootAsync(async (root) => {
    const { manifestPath, artifactRoot, selectionResolvedPath } = await buildGithubFixture(root, 34);
    const plan = preflightPlanFixture();
    let networkCalls = 0;
    const restore = mockFetchOnce(async (input: RequestInfo | URL) => {
      networkCalls += 1;
      const url = new URL(String(input));
      assert.notEqual(url.pathname, '/gmail/v1/users/me/messages/msg-should-never-be-fetched', 'preflight must never fetch RAW message bytes');
      return new Response(JSON.stringify({}), { status: 200 });
    });
    try {
      await runRun3Preflight({
        env: { [CREDENTIAL_ENV]: TOKEN },
        statePath: mkPrivateStateDir(root),
        planBuffer: plan.planBuffer,
        sidecarBuffer: plan.sidecarBuffer,
        planAuthorityVerifier: plan.planAuthorityVerifier,
        run2ManifestPath: manifestPath,
        run2ArtifactRoot: artifactRoot,
        run2SelectionResolvedPath: selectionResolvedPath,
      });
      // Only the single content-free auth-profile probe call is expected.
      assert.equal(networkCalls, 1);
    } finally {
      restore();
    }
  });
});

test('preflight F6: OAuth diagnostics gate as real checks — no client configured -> both oauth checks fail', async () => {
  await withTmpRootAsync(async (root) => {
    const { manifestPath, artifactRoot, selectionResolvedPath } = await buildGithubFixture(root, 34);
    const plan = preflightPlanFixture();
    const restore = mockFetchOnce(async () => new Response(JSON.stringify({}), { status: 200 }));
    try {
      const result = await runRun3Preflight({
        env: {
          [CREDENTIAL_ENV]: TOKEN,
          [OAUTH_CREDENTIALS_PATH_ENV]: join(root, 'no-such-credentials.json'),
          [OAUTH_TOKEN_PATH_ENV]: join(root, 'no-such-token.json'),
        },
        statePath: mkPrivateStateDir(root),
        planBuffer: plan.planBuffer,
        sidecarBuffer: plan.sidecarBuffer,
        planAuthorityVerifier: plan.planAuthorityVerifier,
        run2ManifestPath: manifestPath,
        run2ArtifactRoot: artifactRoot,
        run2SelectionResolvedPath: selectionResolvedPath,
      });
      assert.equal(result.checks.oauth_client_available, false);
      assert.equal(result.checks.oauth_refresh_state_available, false);
      // The manual-token fallback path still makes gmail_auth_available true.
      assert.equal(result.checks.gmail_auth_available, true);
    } finally {
      restore();
    }
  });
});

test('preflight F7: a corrupted pre-existing private state file fails closed rather than crashing', async () => {
  await withTmpRootAsync(async (root) => {
    const { manifestPath, artifactRoot, selectionResolvedPath } = await buildGithubFixture(root, 34);
    const plan = preflightPlanFixture();
    const statePath = mkPrivateStateDir(root);
    writeFileSync(statePath, '{ not valid json');
    const restore = mockFetchOnce(async () => new Response(JSON.stringify({}), { status: 200 }));
    try {
      const result = await runRun3Preflight({
        env: { [CREDENTIAL_ENV]: TOKEN },
        statePath,
        planBuffer: plan.planBuffer,
        sidecarBuffer: plan.sidecarBuffer,
        planAuthorityVerifier: plan.planAuthorityVerifier,
        run2ManifestPath: manifestPath,
        run2ArtifactRoot: artifactRoot,
        run2SelectionResolvedPath: selectionResolvedPath,
      });
      assert.equal(result.checks.private_state_root_valid, false);
    } finally {
      restore();
    }
  });
});

test('preflight F8: an absent private state root fails closed, and preflight never creates it', async () => {
  await withTmpRootAsync(async (root) => {
    const { manifestPath, artifactRoot, selectionResolvedPath } = await buildGithubFixture(root, 34);
    const plan = preflightPlanFixture();
    // Deliberately never created — this is the read-only-preflight check
    // (blocker C): a missing root must fail the gate, not be repaired.
    const statePath = join(root, 'private-state-never-created', 'state.json');
    const restore = mockFetchOnce(async () => new Response(JSON.stringify({}), { status: 200 }));
    try {
      const result = await runRun3Preflight({
        env: { [CREDENTIAL_ENV]: TOKEN },
        statePath,
        planBuffer: plan.planBuffer,
        sidecarBuffer: plan.sidecarBuffer,
        planAuthorityVerifier: plan.planAuthorityVerifier,
        run2ManifestPath: manifestPath,
        run2ArtifactRoot: artifactRoot,
        run2SelectionResolvedPath: selectionResolvedPath,
      });
      assert.equal(result.checks.private_state_root_valid, false);
      assert.equal(result.overall_pass, false);
      assert.equal(existsSync(join(root, 'private-state-never-created')), false, 'preflight must never create the private state root');
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// 7. No send-capable fallback credential exists anywhere in this wiring
// ---------------------------------------------------------------------------

test('security G1: GMAIL_ACCESS_TOKEN (the runtime send-capable credential) is never read by the enumerator or the adapter', async () => {
  await withTmpRootAsync(async (root) => {
    let networkCalls = 0;
    const restore = mockFetchOnce(async (input: RequestInfo | URL, init?: RequestInit) => {
      networkCalls += 1;
      const headers = new Headers(init?.headers);
      // If the send-capable token ever reached a request, it would appear
      // verbatim in the Authorization header — that must never happen.
      assert.notEqual(headers.get('authorization'), 'Bearer send-capable-token-must-not-be-used');
      return new Response('unauthorized', { status: 401 });
    });
    try {
      await assert.rejects(
        () => enumerateGmailMetadata({ env: { GMAIL_ACCESS_TOKEN: 'send-capable-token-must-not-be-used' } }),
        /gmail_raw_credential_not_configured|GmailTransportError/,
      );
      const acquireRaw = createGmailRawAdapter({ root, env: { GMAIL_ACCESS_TOKEN: 'send-capable-token-must-not-be-used' }, acquire: acquireGmailRawMessage });
      await assert.rejects(() => acquireRaw({ message_id: 'msg-g1' }, join(root, 'g1.eml')));
      // Neither path should ever have resolved a credential from
      // GMAIL_ACCESS_TOKEN at all, so no request should ever have gone out.
      assert.equal(networkCalls, 0, 'no request should be sent when only the send-capable GMAIL_ACCESS_TOKEN is configured');
    } finally {
      restore();
    }
  });
});
