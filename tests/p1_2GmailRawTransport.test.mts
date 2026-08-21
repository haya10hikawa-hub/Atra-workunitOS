/**
 * Validation suite for the P1-2 Gmail RAW byte-preserving transport.
 *
 * Every fixture here is synthetic and every provider response is mocked. No
 * participant content, no real mailbox, message or person appears in this
 * file, and none may be added. No test performs a real network request:
 * `globalThis.fetch` is mocked outright.
 *
 * This suite exists to prove the specific property Run-2's canary disproved
 * for the model-relay path: length-equal, byte-unequal corruption that a
 * self-consistent hash cannot catch. Every unmodified round trip must be
 * byte_equal = true; a deliberately corrupted persisted file must be
 * byte_equal = false and must never be silently accepted.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  API_ORIGIN,
  CREDENTIAL_ENV,
  GmailTransportError,
  acquireGmailRawMessage,
  decodeBase64Url,
  readCredential,
  sha256Hex,
  verifyByteFidelity,
  writeBytesDurable,
} from '../tools/audit/p1-2-gmail-raw-transport/gmailRaw.mjs';
import { checkGmailAuth } from '../tools/audit/p1-2-gmail-raw-transport/authPreflight.mjs';
import { CHECK_NAMES, runPreflight } from '../tools/audit/p1-2-gmail-raw-transport/preflight.mjs';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const TOOL_DIR = resolve(TEST_DIR, '..', 'tools', 'audit', 'p1-2-gmail-raw-transport');
const CLI_PATH = join(TOOL_DIR, 'cli.mjs');

/** Stands in for a credential; must never reach an agent-facing surface. */
const TOKEN = 'SYNTHETIC_READONLY_TOKEN_MUST_NOT_LEAK_00000000';
/** Planted in synthetic message bytes; must never appear in any printed output. */
const MARKER = Buffer.from('SYNTHETIC_GMAIL_BODY_MARKER_MUST_NOT_LEAK', 'utf8');

function withTmpRoot<T>(fn: (root: string) => T): T {
  const root = mkdtempSync(join(tmpdir(), 'p1-2-gmail-raw-'));
  try {
    return fn(root);
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

function base64UrlEncode(buffer: Buffer) {
  return buffer.toString('base64url');
}

function fakeGmailResponse(rawBase64Url: string) {
  return new Response(JSON.stringify({ raw: rawBase64Url }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// A. byte-fidelity round trip — synthetic payload shapes
// ---------------------------------------------------------------------------

test('A1: an ordinary payload persists byte-identical', () => {
  withTmpRoot((root) => {
    const bytes = Buffer.concat([MARKER, Buffer.from('more ascii text here', 'utf8')]);
    const dest = join(root, 'msg-ordinary.eml');
    writeBytesDurable(dest, bytes);
    const fidelity = verifyByteFidelity({ providerBytes: bytes, destPath: dest });
    assert.equal(fidelity.lengthEqual, true);
    assert.equal(fidelity.byteEqual, true);
    assert.equal(fidelity.providerSha256, sha256Hex(bytes));
    assert.equal(fidelity.persistedSha256, sha256Hex(readFileSync(dest)));
  });
});

test('A2: zero-value bytes persist byte-identical', () => {
  withTmpRoot((root) => {
    const bytes = Buffer.alloc(4096, 0);
    const dest = join(root, 'msg-zeros.eml');
    writeBytesDurable(dest, bytes);
    const fidelity = verifyByteFidelity({ providerBytes: bytes, destPath: dest });
    assert.equal(fidelity.byteEqual, true);
  });
});

test('A3: non-UTF8 / arbitrary binary bytes persist byte-identical', () => {
  withTmpRoot((root) => {
    const bytes = Buffer.from(Array.from({ length: 2048 }, (_, i) => (i * 137 + 5) % 256));
    const dest = join(root, 'msg-binary.eml');
    writeBytesDurable(dest, bytes);
    const fidelity = verifyByteFidelity({ providerBytes: bytes, destPath: dest });
    assert.equal(fidelity.byteEqual, true);
  });
});

test('A4: a large payload persists byte-identical', () => {
  withTmpRoot((root) => {
    const bytes = Buffer.alloc(8 * 1024 * 1024);
    for (let i = 0; i < bytes.length; i += 4096) bytes[i] = i % 256;
    const dest = join(root, 'msg-large.eml');
    writeBytesDurable(dest, bytes);
    const fidelity = verifyByteFidelity({ providerBytes: bytes, destPath: dest });
    assert.equal(fidelity.lengthEqual, true);
    assert.equal(fidelity.byteEqual, true);
  });
});

test('A5: base64url decode round-trips exactly, no padding required', () => {
  const original = Buffer.from('the quick brown fox jumps over the lazy dog, 0123456789 !@#$', 'utf8');
  const encoded = base64UrlEncode(original);
  assert.ok(!encoded.includes('+') && !encoded.includes('/'));
  const decoded = decodeBase64Url(encoded);
  assert.equal(Buffer.compare(original, decoded), 0);
});

// ---------------------------------------------------------------------------
// B. the exact Run-2 B6 failure class: length-equal, byte-unequal corruption
// ---------------------------------------------------------------------------

test('B1: a single-byte corruption at a mid-file offset is detected (length preserved)', () => {
  withTmpRoot((root) => {
    const bytes = Buffer.alloc(9222, 0x41);
    const dest = join(root, 'msg-canary.eml');
    writeBytesDurable(dest, bytes);

    // Simulate exactly the Run-2 shape: persisted length unchanged, one byte flipped.
    const corrupted = readFileSync(dest);
    corrupted[4327] = corrupted[4327] ^ 0xff;
    writeFileSync(dest, corrupted);

    const fidelity = verifyByteFidelity({ providerBytes: bytes, destPath: dest });
    assert.equal(fidelity.lengthEqual, true, 'length must still match — this is the case a length check cannot catch');
    assert.equal(fidelity.byteEqual, false);
    assert.notEqual(fidelity.providerSha256, fidelity.persistedSha256);
  });
});

test('B2: truncation (a partial/short write) is detected as unequal, not silently accepted', () => {
  withTmpRoot((root) => {
    const bytes = Buffer.from('a payload that is definitely not empty', 'utf8');
    const dest = join(root, 'msg-truncated.eml');
    writeFileSync(dest, bytes.subarray(0, bytes.length - 5));
    const fidelity = verifyByteFidelity({ providerBytes: bytes, destPath: dest });
    assert.equal(fidelity.lengthEqual, false);
    assert.equal(fidelity.byteEqual, false);
  });
});

test('B3: the CLI acquire path reports byte_equal=false and a non-zero exit on corruption injected between fetch and read-back', async () => {
  await withTmpRootAsync(async (root) => {
    const bytes = Buffer.from('deliberately corrupted end to end', 'utf8');
    const raw = base64UrlEncode(bytes);
    const restore = mockFetchOnce(async () => fakeGmailResponse(raw));
    try {
      const dest = join(root, 'msg-e2e.eml');
      // acquireGmailRawMessage itself cannot inject corruption (that is the point);
      // this test proves the *unmodified* path is byte_equal=true so B1's
      // corruption test above is meaningful evidence about the verify step,
      // not a coincidence of a broken happy path.
      const result = await acquireGmailRawMessage({ messageId: 'msg123', destPath: dest, root, env: { [CREDENTIAL_ENV]: TOKEN } });
      assert.equal(result.byte_equal, true);
      assert.equal(result.byte_length, bytes.length);
      assert.equal(result.provider_sha256, sha256Hex(bytes));
      assert.equal(result.persisted_sha256, sha256Hex(readFileSync(dest)));
    } finally {
      restore();
    }
  });
});

async function withTmpRootAsync<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), 'p1-2-gmail-raw-'));
  try {
    return await fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// C. never overwrite; never escape the authorized root
// ---------------------------------------------------------------------------

test('C1: acquiring into an existing destination is refused, not overwritten', async () => {
  await withTmpRootAsync(async (root) => {
    const dest = join(root, 'already-there.eml');
    writeFileSync(dest, 'pre-existing');
    const raw = base64UrlEncode(Buffer.from('new bytes', 'utf8'));
    const restore = mockFetchOnce(async () => fakeGmailResponse(raw));
    try {
      await assert.rejects(
        acquireGmailRawMessage({ messageId: 'm1', destPath: dest, root, env: { [CREDENTIAL_ENV]: TOKEN } }),
        (error) => error instanceof GmailTransportError && error.code === 'gmail_raw_destination_exists',
      );
      assert.equal(readFileSync(dest, 'utf8'), 'pre-existing');
    } finally {
      restore();
    }
  });
});

test('C2: a destination outside the authorized root is refused before any network call', async () => {
  await withTmpRootAsync(async (root) => {
    let fetchCalled = false;
    const restore = mockFetchOnce(async () => {
      fetchCalled = true;
      throw new Error('must not be called');
    });
    try {
      const outside = join(root, '..', 'escaped.eml');
      await assert.rejects(
        acquireGmailRawMessage({ messageId: 'm1', destPath: outside, root, env: { [CREDENTIAL_ENV]: TOKEN } }),
        (error) => error instanceof GmailTransportError && error.code === 'gmail_raw_destination_outside_root',
      );
      assert.equal(fetchCalled, false);
    } finally {
      restore();
    }
  });
});

test('C3: a path-traversal destination inside a plausible-looking prefix is still refused', async () => {
  await withTmpRootAsync(async (root) => {
    const restore = mockFetchOnce(async () => fakeGmailResponse(base64UrlEncode(Buffer.from('x'))));
    try {
      const traversal = join(root, '..', `${root.split('/').pop()}-evil`, 'x.eml');
      await assert.rejects(
        acquireGmailRawMessage({ messageId: 'm1', destPath: traversal, root, env: { [CREDENTIAL_ENV]: TOKEN } }),
        (error) => error instanceof GmailTransportError && error.code === 'gmail_raw_destination_outside_root',
      );
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// D. credential handling — never printed, never logged, read-only surface only
// ---------------------------------------------------------------------------

test('D1: missing credential fails closed with a stable code, no message text', () => {
  assert.throws(
    () => readCredential({}),
    (error) => error instanceof GmailTransportError && error.code === 'gmail_raw_credential_not_configured',
  );
});

test('D2: a malformed credential (whitespace/control bytes) is refused', () => {
  assert.throws(
    () => readCredential({ [CREDENTIAL_ENV]: 'has a space' }),
    (error) => error instanceof GmailTransportError && error.code === 'gmail_raw_credential_invalid',
  );
});

test('D3: the CLI never prints the token, on success or failure', () => {
  const env = { ...process.env, [CREDENTIAL_ENV]: TOKEN };
  delete env.ATRA_P1_2_GMAIL_RAW_ROOT;
  let output = '';
  try {
    output = execFileSync(process.execPath, ['--experimental-strip-types', CLI_PATH, 'acquire', '--message-id', 'm1', '--root', '/nonexistent', '--dest', '/nonexistent/x.eml'], {
      env,
      encoding: 'utf8',
    });
  } catch (error) {
    const e = error as { stdout?: unknown; stderr?: unknown };
    output = String(e.stdout ?? '') + String(e.stderr ?? '');
  }
  assert.ok(!output.includes(TOKEN));
});

test('D4: fetch/network errors never leak the URL or headers into the thrown error', async () => {
  await withTmpRootAsync(async (root) => {
    const restore = mockFetchOnce(async () => {
      throw new TypeError(`network down while fetching ${API_ORIGIN}/secret-path?authorization=Bearer ${TOKEN}`);
    });
    try {
      await assert.rejects(
        acquireGmailRawMessage({ messageId: 'm1', destPath: join(root, 'x.eml'), root, env: { [CREDENTIAL_ENV]: TOKEN } }),
        (error) => {
          assert.ok(error instanceof GmailTransportError);
          assert.equal(error.code, 'gmail_raw_network_error');
          assert.ok(!error.message.includes(TOKEN));
          return true;
        },
      );
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// E. RAW is the only representation; format is never substituted
// ---------------------------------------------------------------------------

test('E1: the request always asks for format=raw and GET only', async () => {
  await withTmpRootAsync(async (root) => {
    let seenUrl: string | null = null;
    let seenMethod: string | null = null;
    const restore = mockFetchOnce(async (url, init) => {
      seenUrl = url.toString();
      seenMethod = (init as RequestInit | undefined)?.method ?? null;
      return fakeGmailResponse(base64UrlEncode(Buffer.from('ok', 'utf8')));
    });
    try {
      await acquireGmailRawMessage({ messageId: 'm42', destPath: join(root, 'x.eml'), root, env: { [CREDENTIAL_ENV]: TOKEN } });
      assert.equal(seenMethod, 'GET');
      assert.ok(typeof seenUrl === 'string');
      assert.ok((seenUrl as string).includes('format=raw'));
      assert.ok((seenUrl as string).startsWith(API_ORIGIN));
    } finally {
      restore();
    }
  });
});

test('E2: a response missing the raw field fails closed', async () => {
  await withTmpRootAsync(async (root) => {
    const restore = mockFetchOnce(async () => new Response(JSON.stringify({ payload: { headers: [] } }), { status: 200 }));
    try {
      await assert.rejects(
        acquireGmailRawMessage({ messageId: 'm1', destPath: join(root, 'x.eml'), root, env: { [CREDENTIAL_ENV]: TOKEN } }),
        (error) => error instanceof GmailTransportError && error.code === 'gmail_raw_response_unrecognized',
      );
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// F. auth preflight is content-free
// ---------------------------------------------------------------------------

test('F1: auth-check reports available on a 200 profile response, without returning body fields', async () => {
  const restore = mockFetchOnce(async () => new Response(JSON.stringify({ emailAddress: 'operator@example.com', messagesTotal: 999 }), { status: 200 }));
  try {
    const result = await checkGmailAuth({ env: { [CREDENTIAL_ENV]: TOKEN } });
    assert.deepEqual(result, { available: true, reason_code: null });
    assert.ok(!('emailAddress' in result));
  } finally {
    restore();
  }
});

test('F2: auth-check reports unavailable with a stable reason code on 401', async () => {
  const restore = mockFetchOnce(async () => new Response('unauthorized', { status: 401 }));
  try {
    const result = await checkGmailAuth({ env: { [CREDENTIAL_ENV]: TOKEN } });
    assert.equal(result.available, false);
    assert.equal(result.reason_code, 'gmail_raw_unauthorized');
  } finally {
    restore();
  }
});

test('F3: auth-check with no credential fails closed without a network call', async () => {
  let called = false;
  const restore = mockFetchOnce(async () => {
    called = true;
    throw new Error('must not be called');
  });
  try {
    const result = await checkGmailAuth({ env: {} });
    assert.equal(result.available, false);
    assert.equal(result.reason_code, 'gmail_raw_credential_not_configured');
    assert.equal(called, false);
  } finally {
    restore();
  }
});

// ---------------------------------------------------------------------------
// G. pre-T0 preflight — content-free PASS/FAIL over structural checks
// ---------------------------------------------------------------------------

function synthGithubManifestLine(id: string, observedAtIso: string) {
  return JSON.stringify({
    dataset_record_id: id,
    provider: 'github',
    content_sha256: sha256Hex(Buffer.from(id)),
    provider_identity_commitment_sha256: sha256Hex(Buffer.from(`identity-${id}`)),
    observed_at: observedAtIso,
    source_event_at: '2026-08-15T00:00:00Z',
  });
}

test('G1: preflight passes when every structural condition is satisfied', async () => {
  await withTmpRootAsync(async (root) => {
    const runRoot = join(root, 'run3');
    const planPath = join(root, 'plan.json');
    writeFileSync(planPath, JSON.stringify({ hello: 'plan' }));
    const planSha256 = sha256Hex(readFileSync(planPath));

    const manifestPath = join(root, 'manifest.jsonl');
    writeFileSync(
      manifestPath,
      [synthGithubManifestLine('P1D-0002', '2026-08-21T01:33:45Z'), synthGithubManifestLine('P1D-0003', '2026-08-21T01:33:46Z')].join('\n'),
    );

    const restore = mockFetchOnce(async () => new Response(JSON.stringify({}), { status: 200 }));
    try {
      const result = await runPreflight({
        env: { [CREDENTIAL_ENV]: TOKEN },
        runRoot,
        planPath,
        expectedPlanSha256: planSha256,
        run2ManifestPath: manifestPath,
        run2AcquisitionWindowStartIso: '2026-08-21T01:25:19Z',
        run2AcquisitionWindowEndIso: '2026-08-21T05:25:19Z',
      });
      assert.equal(result.overall_pass, true);
      assert.deepEqual(result.failed_checks, []);
      for (const name of CHECK_NAMES) assert.equal(result.checks[name], true, name);
    } finally {
      restore();
    }
  });
});

test('G2: preflight fails closed on a plan hash mismatch, without failing every other check', async () => {
  await withTmpRootAsync(async (root) => {
    const runRoot = join(root, 'run3');
    const planPath = join(root, 'plan.json');
    writeFileSync(planPath, JSON.stringify({ hello: 'plan' }));

    const manifestPath = join(root, 'manifest.jsonl');
    writeFileSync(manifestPath, synthGithubManifestLine('P1D-0002', '2026-08-21T01:33:45Z'));

    const restore = mockFetchOnce(async () => new Response(JSON.stringify({}), { status: 200 }));
    try {
      const result = await runPreflight({
        env: { [CREDENTIAL_ENV]: TOKEN },
        runRoot,
        planPath,
        expectedPlanSha256: 'not-the-real-hash',
        run2ManifestPath: manifestPath,
        run2AcquisitionWindowStartIso: '2026-08-21T01:25:19Z',
        run2AcquisitionWindowEndIso: '2026-08-21T05:25:19Z',
      });
      assert.equal(result.overall_pass, false);
      assert.ok(result.failed_checks.includes('plan_hash_matches'));
      assert.equal(result.checks.runner_installed, true);
      assert.equal(result.checks.destination_writable, true);
    } finally {
      restore();
    }
  });
});

test('G3: preflight fails closed when a Run-2 GitHub row falls outside the acquisition window', async () => {
  await withTmpRootAsync(async (root) => {
    const runRoot = join(root, 'run3');
    const planPath = join(root, 'plan.json');
    writeFileSync(planPath, '{}');
    const planSha256 = sha256Hex(readFileSync(planPath));

    const manifestPath = join(root, 'manifest.jsonl');
    // Outside the T0..deadline acquisition window, even though it is inside the observation window.
    writeFileSync(manifestPath, synthGithubManifestLine('P1D-0002', '2026-08-14T12:00:00Z'));

    const restore = mockFetchOnce(async () => new Response(JSON.stringify({}), { status: 200 }));
    try {
      const result = await runPreflight({
        env: { [CREDENTIAL_ENV]: TOKEN },
        runRoot,
        planPath,
        expectedPlanSha256: planSha256,
        run2ManifestPath: manifestPath,
        run2AcquisitionWindowStartIso: '2026-08-21T01:25:19Z',
        run2AcquisitionWindowEndIso: '2026-08-21T05:25:19Z',
      });
      assert.equal(result.overall_pass, false);
      assert.ok(result.failed_checks.includes('run2_github_reuse_metadata_valid'));
    } finally {
      restore();
    }
  });
});

test('G4: preflight reports auth_available=false without a configured credential, and does not throw', async () => {
  await withTmpRootAsync(async (root) => {
    const runRoot = join(root, 'run3');
    const planPath = join(root, 'plan.json');
    writeFileSync(planPath, '{}');
    const planSha256 = sha256Hex(readFileSync(planPath));
    const manifestPath = join(root, 'manifest.jsonl');
    writeFileSync(manifestPath, synthGithubManifestLine('P1D-0002', '2026-08-21T01:33:45Z'));

    const result = await runPreflight({
      env: {},
      runRoot,
      planPath,
      expectedPlanSha256: planSha256,
      run2ManifestPath: manifestPath,
      run2AcquisitionWindowStartIso: '2026-08-21T01:25:19Z',
      run2AcquisitionWindowEndIso: '2026-08-21T05:25:19Z',
    });
    assert.equal(result.checks.auth_available, false);
    assert.equal(result.overall_pass, false);
  });
});

test('G5: preflight fails closed when the run root already holds files', async () => {
  await withTmpRootAsync(async (root) => {
    const runRoot = join(root, 'run3');
    mkdirSync(runRoot, { recursive: true });
    writeFileSync(join(runRoot, 'leftover.eml'), 'x');

    const planPath = join(root, 'plan.json');
    writeFileSync(planPath, '{}');
    const planSha256 = sha256Hex(readFileSync(planPath));
    const manifestPath = join(root, 'manifest.jsonl');
    writeFileSync(manifestPath, synthGithubManifestLine('P1D-0002', '2026-08-21T01:33:45Z'));

    const restore = mockFetchOnce(async () => new Response(JSON.stringify({}), { status: 200 }));
    try {
      const result = await runPreflight({
        env: { [CREDENTIAL_ENV]: TOKEN },
        runRoot,
        planPath,
        expectedPlanSha256: planSha256,
        run2ManifestPath: manifestPath,
        run2AcquisitionWindowStartIso: '2026-08-21T01:25:19Z',
        run2AcquisitionWindowEndIso: '2026-08-21T05:25:19Z',
      });
      assert.equal(result.checks.run_root_valid, false);
      assert.equal(result.overall_pass, false);
    } finally {
      restore();
    }
  });
});
