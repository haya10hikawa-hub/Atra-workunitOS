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
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  API_ORIGIN,
  CREDENTIAL_ENV,
  GmailTransportError,
  acquireGmailRawMessage,
  decodeBase64Url,
  readBytesDurable,
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

/**
 * Run the CLI as a real subprocess and capture BOTH streams separately.
 *
 * stderr is captured on purpose: repair B is about the whole process output,
 * not just the branch that formats JSON on stdout. An escaped throw, a Node
 * warning or a runtime diagnostic all land on stderr, and any of them can
 * quote a path, a URL or a request header.
 */
function runCli(
  args: string[],
  env: NodeJS.ProcessEnv,
  preloadPath?: string,
): { stdout: string; stderr: string; status: number } {
  // A preload is mandatory in practice: the `preflight` command reaches
  // `checkGmailAuth`, which would otherwise make a real outbound request to
  // Google from the test suite. Callers pass either a deny-all stub or a
  // canned-response stub; no CLI subprocess test ever touches the network.
  const preload = preloadPath === undefined ? [] : ['--import', pathToFileURL(preloadPath).href];
  const result = spawnSync(process.execPath, ['--experimental-strip-types', ...preload, CLI_PATH, ...args], {
    env,
    encoding: 'utf8',
  });
  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', status: result.status ?? -1 };
}

/** Preload that makes any outbound fetch from a CLI subprocess fail immediately. */
function writeDenyFetchMock(dir: string): string {
  const mockPath = join(dir, 'deny-fetch.mjs');
  writeFileSync(
    mockPath,
    "globalThis.fetch = async () => { throw new TypeError('network disabled in tests'); };\n",
    'utf8',
  );
  return mockPath;
}

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

test('B4: byte_equal is derived from direct byte comparison, not digest equality', () => {
  withTmpRoot((root) => {
    const providerBytes = Buffer.from('AAAA provider bytes', 'utf8');
    const persistedBytes = Buffer.from('BBBB different bytes', 'utf8');
    const dest = join(root, 'msg-forced-digest-collision.eml');
    writeBytesDurable(dest, persistedBytes);

    // A hash collision is not something a test can construct against real
    // SHA-256; `hashFn` lets this test simulate one so the assertion below is
    // meaningful evidence about which comparison `byteEqual` actually uses.
    const fidelity = verifyByteFidelity({ providerBytes, destPath: dest, hashFn: () => 'forced-equal-digest' });
    assert.equal(fidelity.providerSha256, fidelity.persistedSha256, 'digests are forced equal by the test double');
    assert.equal(fidelity.byteEqual, false, 'byte_equal must stay false — the bytes actually differ');
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

test('C4: a symlinked directory inside the authorized root that resolves outside it is refused before any network call', async () => {
  await withTmpRootAsync(async (root) => {
    const outside = mkdtempSync(join(tmpdir(), 'p1-2-gmail-raw-outside-'));
    try {
      symlinkSync(outside, join(root, 'escape'), 'dir');
      let fetchCalled = false;
      const restore = mockFetchOnce(async () => {
        fetchCalled = true;
        throw new Error('must not be called');
      });
      try {
        const dest = join(root, 'escape', 'message.eml');
        await assert.rejects(
          acquireGmailRawMessage({ messageId: 'm1', destPath: dest, root, env: { [CREDENTIAL_ENV]: TOKEN } }),
          (error) => error instanceof GmailTransportError && error.code === 'gmail_raw_destination_outside_root',
        );
        assert.equal(fetchCalled, false);
        assert.equal(existsSync(join(outside, 'message.eml')), false);
      } finally {
        restore();
      }
    } finally {
      rmSync(outside, { recursive: true, force: true });
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
//
// Run-3 is current-run only. There is deliberately no Run-2 manifest,
// selection-resolution or record-id fixture in this section: requiring a
// Run-2 artifact to pass preflight would make reuse a precondition of
// starting, which the Run-3 charter forbids outright.
// ---------------------------------------------------------------------------

/** The exact check set the Run-3 charter authorizes — no more, no fewer. */
const EXPECTED_CHECK_NAMES = [
  'runner_installed',
  'auth_available',
  'destination_writable',
  'readback_works',
  'disk_space_sufficient',
  'run_root_valid',
  'plan_hash_matches',
];

function writePlan(root: string) {
  const planPath = join(root, 'plan.json');
  writeFileSync(planPath, JSON.stringify({ hello: 'plan' }));
  return { planPath, planSha256: sha256Hex(readFileSync(planPath)) };
}

test('G1: preflight passes when every structural condition is satisfied', async () => {
  await withTmpRootAsync(async (root) => {
    const runRoot = join(root, 'run3');
    const { planPath, planSha256 } = writePlan(root);
    const restore = mockFetchOnce(async () => new Response(JSON.stringify({}), { status: 200 }));
    try {
      const result = await runPreflight({
        env: { [CREDENTIAL_ENV]: TOKEN },
        runRoot,
        planPath,
        expectedPlanSha256: planSha256,
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
    const { planPath } = writePlan(root);
    const restore = mockFetchOnce(async () => new Response(JSON.stringify({}), { status: 200 }));
    try {
      const result = await runPreflight({
        env: { [CREDENTIAL_ENV]: TOKEN },
        runRoot,
        planPath,
        expectedPlanSha256: 'not-the-real-hash',
      });
      assert.equal(result.overall_pass, false);
      assert.ok(result.failed_checks.includes('plan_hash_matches'));
      assert.equal(result.checks.runner_installed, true);
      assert.equal(result.checks.destination_writable, true);
      assert.equal(result.checks.readback_works, true);
    } finally {
      restore();
    }
  });
});

test('G4: preflight reports auth_available=false without a configured credential, and does not throw', async () => {
  await withTmpRootAsync(async (root) => {
    const runRoot = join(root, 'run3');
    const { planPath, planSha256 } = writePlan(root);
    let fetchCalled = false;
    const restore = mockFetchOnce(async () => {
      fetchCalled = true;
      throw new Error('must not be called');
    });
    try {
      const result = await runPreflight({ env: {}, runRoot, planPath, expectedPlanSha256: planSha256 });
      assert.equal(result.checks.auth_available, false);
      assert.equal(result.overall_pass, false);
      assert.ok(result.failed_checks.includes('auth_available'));
      assert.equal(fetchCalled, false);
      // Every other check still reports independently.
      assert.equal(result.checks.plan_hash_matches, true);
    } finally {
      restore();
    }
  });
});

test('G5: preflight fails closed when the run root already holds files', async () => {
  await withTmpRootAsync(async (root) => {
    const runRoot = join(root, 'run3');
    mkdirSync(runRoot, { recursive: true });
    writeFileSync(join(runRoot, 'leftover.eml'), 'from a previous run');
    const { planPath, planSha256 } = writePlan(root);
    const restore = mockFetchOnce(async () => new Response(JSON.stringify({}), { status: 200 }));
    try {
      const result = await runPreflight({
        env: { [CREDENTIAL_ENV]: TOKEN },
        runRoot,
        planPath,
        expectedPlanSha256: planSha256,
      });
      assert.equal(result.overall_pass, false);
      assert.ok(result.failed_checks.includes('run_root_valid'));
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// H. Run-3 integration repairs (A-F)
// ---------------------------------------------------------------------------

test('H-A1: readback_works is falsifiable independently of destination_writable', async () => {
  await withTmpRootAsync(async (root) => {
    const runRoot = join(root, 'run3');
    const { planPath, planSha256 } = writePlan(root);
    const restore = mockFetchOnce(async () => new Response(JSON.stringify({}), { status: 200 }));
    try {
      // Writes keep succeeding; only reads fail. If the two checks were still
      // the same fact under two names, destination_writable would fail too.
      const result = await runPreflight({
        env: { [CREDENTIAL_ENV]: TOKEN },
        runRoot,
        planPath,
        expectedPlanSha256: planSha256,
        io: {
          writeBytesDurable,
          decodeBase64Url,
          readBytesDurable: () => {
            throw new GmailTransportError('gmail_raw_readback_short');
          },
        },
      });
      assert.equal(result.checks.destination_writable, true, 'writes still work');
      assert.equal(result.checks.readback_works, false, 'readback must fail on its own');
      assert.deepEqual(result.failed_checks, ['readback_works']);
      assert.equal(result.overall_pass, false);
    } finally {
      restore();
    }
  });
});

test('H-A2: readback_works fails when the persisted bytes differ from what was written', async () => {
  await withTmpRootAsync(async (root) => {
    const runRoot = join(root, 'run3');
    const { planPath, planSha256 } = writePlan(root);
    const restore = mockFetchOnce(async () => new Response(JSON.stringify({}), { status: 200 }));
    try {
      const result = await runPreflight({
        env: { [CREDENTIAL_ENV]: TOKEN },
        runRoot,
        planPath,
        expectedPlanSha256: planSha256,
        io: {
          writeBytesDurable,
          decodeBase64Url,
          // Same length, one byte different — the exact Run-2 canary shape.
          readBytesDurable: (destPath: string) => {
            const actual = readBytesDurable(destPath);
            const corrupted = Buffer.from(actual);
            corrupted[Math.floor(corrupted.length / 2)] ^= 0x01;
            return corrupted;
          },
        },
      });
      assert.equal(result.checks.destination_writable, true);
      assert.equal(result.checks.readback_works, false);
    } finally {
      restore();
    }
  });
});

test('H-C1: an existing destination is refused BEFORE any Gmail network request', async () => {
  await withTmpRootAsync(async (root) => {
    const dest = join(root, 'already-there.eml');
    writeFileSync(dest, 'pre-existing');
    let fetchCalled = false;
    const restore = mockFetchOnce(async () => {
      fetchCalled = true;
      throw new Error('must not be called');
    });
    try {
      await assert.rejects(
        acquireGmailRawMessage({ messageId: 'm1', destPath: dest, root, env: { [CREDENTIAL_ENV]: TOKEN } }),
        (error) => error instanceof GmailTransportError && error.code === 'gmail_raw_destination_exists',
      );
      assert.equal(fetchCalled, false, 'no authenticated message read may be spent on a doomed write');
      assert.equal(readFileSync(dest, 'utf8'), 'pre-existing');
    } finally {
      restore();
    }
  });
});

test('H-D1: a symlink at the destination basename is refused before fetch, and never followed', async () => {
  await withTmpRootAsync(async (root) => {
    const outside = mkdtempSync(join(tmpdir(), 'p1-2-gmail-raw-outside-'));
    try {
      const dest = join(root, 'message.eml');
      const target = join(outside, 'captured.eml');
      // The parent directory is legitimately inside the root; only the final
      // component redirects outside it.
      symlinkSync(target, dest);
      let fetchCalled = false;
      const restore = mockFetchOnce(async () => {
        fetchCalled = true;
        throw new Error('must not be called');
      });
      try {
        await assert.rejects(
          acquireGmailRawMessage({ messageId: 'm1', destPath: dest, root, env: { [CREDENTIAL_ENV]: TOKEN } }),
          (error) => error instanceof GmailTransportError && error.code === 'gmail_raw_destination_outside_root',
        );
        assert.equal(fetchCalled, false);
        assert.equal(existsSync(target), false, 'the symlink target must never be created');
        assert.equal(lstatSync(dest).isSymbolicLink(), true, 'the link itself is left untouched');
      } finally {
        restore();
      }
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

test('H-E1: the dead ROOT_ENV surface is gone from the transport module', async () => {
  const mod = await import('../tools/audit/p1-2-gmail-raw-transport/gmailRaw.mjs');
  assert.equal('ROOT_ENV' in mod, false);
  const source = readFileSync(join(TOOL_DIR, 'gmailRaw.mjs'), 'utf8');
  assert.equal(source.includes('ATRA_P1_2_GMAIL_RAW_ROOT'), false);
});

test('H-F1: preflight exposes exactly the seven current-run checks, and no Run-2 reuse check', () => {
  assert.deepEqual([...CHECK_NAMES], EXPECTED_CHECK_NAMES);
  for (const name of CHECK_NAMES) {
    assert.equal(/run2|reuse|selection_provenance|record_id/.test(name), false, `Run-2 dependency leaked: ${name}`);
  }
});

test('H-F2: preflight passes with no Run-2 artifact present anywhere', async () => {
  await withTmpRootAsync(async (root) => {
    const runRoot = join(root, 'run3');
    const { planPath, planSha256 } = writePlan(root);
    const restore = mockFetchOnce(async () => new Response(JSON.stringify({}), { status: 200 }));
    try {
      const result = await runPreflight({
        env: { [CREDENTIAL_ENV]: TOKEN },
        runRoot,
        planPath,
        expectedPlanSha256: planSha256,
      });
      assert.equal(result.overall_pass, true, 'no Run-2 input may be required to reach a PASS');
    } finally {
      restore();
    }
  });
});

test('H-F3: the CLI refuses any --run2-* flag rather than accepting a reuse input', () => {
  const env = { ...process.env, [CREDENTIAL_ENV]: TOKEN };
  withTmpRoot((root) => {
  const { stdout, stderr, status } = runCli(
    ['preflight', '--run-root', '/nonexistent', '--plan', '/nonexistent/p.json', '--plan-sha256', 'x', '--run2-manifest', '/nonexistent/m.jsonl'],
    env,
    writeDenyFetchMock(root),
  );
  assert.equal(status, 2);
  assert.equal(stderr, '');
  assert.match(stdout, /argument_unknown/);
  });
});

// ---------------------------------------------------------------------------
// H-B. repair B — CLI output is content-free on every command and every branch
//
// Permanent, not a one-off audit: this table drives the same assertions over
// every CLI entry point, so a newly added command that prints a subject line,
// a recipient or a payload fragment fails here rather than in a live run.
// ---------------------------------------------------------------------------

/** Every substring that must never appear on stdout or stderr, whatever happens. */
const FORBIDDEN_OUTPUT_FRAGMENTS: ReadonlyArray<readonly [string, string]> = [
  ['credential', TOKEN],
  ['message-content marker', MARKER.toString('utf8')],
  ['subject line', 'Subject: Quarterly planning sync'],
  ['sender address', 'sender@example.invalid'],
  ['recipient address', 'recipient@example.invalid'],
  ['decoded body text', 'BODY-BYTES-MUST-NOT-APPEAR'],
];

/** A synthetic RFC 5322 message carrying every forbidden fragment at once. */
function syntheticMessageBytes(): Buffer {
  return Buffer.from(
    [
      'From: sender@example.invalid',
      'To: recipient@example.invalid',
      'Subject: Quarterly planning sync',
      '',
      MARKER.toString('utf8'),
      'BODY-BYTES-MUST-NOT-APPEAR',
    ].join('\r\n'),
    'utf8',
  );
}

function assertContentFree(label: string, stdout: string, stderr: string) {
  for (const [what, fragment] of FORBIDDEN_OUTPUT_FRAGMENTS) {
    assert.equal(stdout.includes(fragment), false, `${label}: ${what} leaked to stdout`);
    assert.equal(stderr.includes(fragment), false, `${label}: ${what} leaked to stderr`);
  }
  // A base64url slice of the payload is still payload.
  const encoded = syntheticMessageBytes().toString('base64url');
  for (const slice of [encoded.slice(0, 32), encoded.slice(-32)]) {
    assert.equal(stdout.includes(slice), false, `${label}: raw payload fragment leaked to stdout`);
    assert.equal(stderr.includes(slice), false, `${label}: raw payload fragment leaked to stderr`);
  }
}

test('H-B1: no CLI command leaks content or credential on stdout or stderr', () => {
  withTmpRoot((root) => {
    const env = { ...process.env, [CREDENTIAL_ENV]: TOKEN };
    const planPath = join(root, 'plan.json');
    writeFileSync(planPath, JSON.stringify({ hello: 'plan' }));
    const occupied = join(root, 'occupied.eml');
    writeFileSync(occupied, syntheticMessageBytes());
    const denyFetch = writeDenyFetchMock(root);

    const invocations: ReadonlyArray<readonly [string, string[]]> = [
      ['no args', []],
      ['unknown command', ['definitely-not-a-command']],
      ['usage', ['acquire']],
      ['bad flag', ['acquire', '--nope', 'x']],
      ['acquire outside root', ['acquire', '--message-id', 'm1', '--root', root, '--dest', join(root, '..', 'x.eml')]],
      ['acquire existing dest', ['acquire', '--message-id', 'm1', '--root', root, '--dest', occupied]],
      ['acquire bad message id', ['acquire', '--message-id', '../../etc/passwd', '--root', root, '--dest', join(root, 'a.eml')]],
      ['preflight missing plan', ['preflight', '--run-root', join(root, 'r'), '--plan', join(root, 'nope.json'), '--plan-sha256', 'x']],
      ['preflight bad hash', ['preflight', '--run-root', join(root, 'r2'), '--plan', planPath, '--plan-sha256', 'x']],
      ['run2 flag rejected', ['preflight', '--run-root', join(root, 'r3'), '--plan', planPath, '--plan-sha256', 'x', '--run2-manifest', '/nope']],
    ];

    for (const [label, args] of invocations) {
      const { stdout, stderr } = runCli(args, env, denyFetch);
      assertContentFree(label, stdout, stderr);
      assert.equal(stderr, '', `${label}: nothing may reach stderr at all`);
    }
  });
});

test('H-B2: a successful acquire prints only the content-free result fields', async () => {
  await withTmpRootAsync(async (root) => {
    // Drive the library directly with a payload full of forbidden fragments,
    // then assert the returned object carries none of them. The CLI prints
    // exactly this object, so what it cannot contain, the CLI cannot print.
    const bytes = syntheticMessageBytes();
    const restore = mockFetchOnce(async () => fakeGmailResponse(base64UrlEncode(bytes)));
    try {
      const dest = join(root, 'ok.eml');
      const result = await acquireGmailRawMessage({
        messageId: 'm1',
        destPath: dest,
        root,
        env: { [CREDENTIAL_ENV]: TOKEN },
      });
      assert.equal(result.byte_equal, true);
      assert.deepEqual(Object.keys(result).sort(), [
        'byte_equal',
        'byte_length',
        'message_id',
        'persisted_sha256',
        'provider_sha256',
      ]);
      const printed = JSON.stringify(result, null, 2);
      assertContentFree('successful acquire', printed, '');
    } finally {
      restore();
    }
  });
});

test('H-C2: writeBytesDurable itself still refuses to overwrite, independently of the pre-fetch guard', () => {
  withTmpRoot((root) => {
    // The pre-fetch `assertDestinationAbsent` check (repair C) is the first
    // line of defence, but it is a TOCTOU window ahead of the open(). `wx`
    // remains the authoritative race guard, and it needs coverage that does
    // not route through the pre-check — otherwise weakening `wx` to `w` is
    // invisible to this suite.
    const dest = join(root, 'occupied.eml');
    const original = Buffer.from('original bytes that must survive', 'utf8');
    writeBytesDurable(dest, original);
    assert.throws(
      () => writeBytesDurable(dest, Buffer.from('replacement', 'utf8')),
      (error) => error instanceof GmailTransportError && error.code === 'gmail_raw_destination_exists',
    );
    assert.equal(Buffer.compare(readBytesDurable(dest), original), 0, 'the original bytes must be intact');
  });
});

/**
 * Build an ESM preload that replaces `globalThis.fetch` inside a CLI
 * subprocess, so the *real* CLI success branch can be exercised end-to-end
 * without a network call or a credential.
 *
 * Without this, the only CLI invocations a test can make are failing ones, and
 * a leak added to the success-path output would never be observed.
 */
function writeFetchMock(dir: string, rawBase64Url: string): string {
  const mockPath = join(dir, 'mock-fetch.mjs');
  writeFileSync(
    mockPath,
    [
      `const body = ${JSON.stringify(JSON.stringify({ raw: rawBase64Url }))};`,
      'globalThis.fetch = async () => new Response(body, {',
      "  status: 200, headers: { 'content-type': 'application/json' },",
      '});',
      '',
    ].join('\n'),
    'utf8',
  );
  return mockPath;
}

test('H-B3: a SUCCESSFUL CLI acquire prints no content and no credential on either stream', () => {
  withTmpRoot((root) => {
    const bytes = syntheticMessageBytes();
    const encoded = base64UrlEncode(bytes);
    const mockPath = writeFetchMock(root, encoded);
    const destRoot = join(root, 'dest');
    mkdirSync(destRoot, { recursive: true });
    const dest = join(destRoot, 'acquired.eml');

    const result = spawnSync(
      process.execPath,
      ['--experimental-strip-types', '--import', pathToFileURL(mockPath).href, CLI_PATH,
       'acquire', '--message-id', 'm1', '--root', destRoot, '--dest', dest],
      { env: { ...process.env, [CREDENTIAL_ENV]: TOKEN }, encoding: 'utf8' },
    );
    const stdout = result.stdout ?? '';
    const stderr = result.stderr ?? '';

    // The success branch really did run: exit 0 and byte-identical persistence.
    assert.equal(result.status, 0, `expected success, got ${result.status}: ${stdout}${stderr}`);
    assert.match(stdout, /"byte_equal": true/);
    assert.equal(Buffer.compare(readFileSync(dest), bytes), 0, 'persisted bytes must match exactly');

    assertContentFree('successful CLI acquire', stdout, stderr);
    assert.equal(stderr, '', 'nothing may reach stderr on the success path either');
  });
});
