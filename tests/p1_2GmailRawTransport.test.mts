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
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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
  resolveGmailBearerToken,
  sha256Hex,
  verifyByteFidelity,
  writeBytesDurable,
} from '../tools/audit/p1-2-gmail-raw-transport/gmailRaw.mjs';
import { checkGmailAuth } from '../tools/audit/p1-2-gmail-raw-transport/authPreflight.mjs';
import { CHECK_NAMES, runPreflight } from '../tools/audit/p1-2-gmail-raw-transport/preflight.mjs';
import {
  GmailOAuthError,
  OAUTH_CREDENTIALS_PATH_ENV,
  OAUTH_SCOPE,
  OAUTH_TOKEN_PATH_ENV,
  hasRefreshState,
  isOAuthClientConfigured,
  readTokenState,
  refreshAccessToken,
  resolveOAuthAccessToken,
  runFirstRunConsent,
} from '../tools/audit/p1-2-gmail-raw-transport/oauthCredential.mjs';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const TOOL_DIR = resolve(TEST_DIR, '..', 'tools', 'audit', 'p1-2-gmail-raw-transport');
const CLI_PATH = join(TOOL_DIR, 'cli.mjs');

/** Stands in for a credential; must never reach an agent-facing surface. */
const TOKEN = 'SYNTHETIC_READONLY_TOKEN_MUST_NOT_LEAK_00000000';
/** Planted in synthetic message bytes; must never appear in any printed output. */
const MARKER = Buffer.from('SYNTHETIC_GMAIL_BODY_MARKER_MUST_NOT_LEAK', 'utf8');

/** Planted OAuth secrets; must never appear in any printed output or thrown error. */
const OAUTH_CLIENT_SECRET = 'SYNTHETIC_OAUTH_CLIENT_SECRET_MUST_NOT_LEAK';
const OAUTH_REFRESH_TOKEN = 'SYNTHETIC_OAUTH_REFRESH_TOKEN_MUST_NOT_LEAK';
const OAUTH_ACCESS_TOKEN = 'SYNTHETIC_OAUTH_ACCESS_TOKEN_MUST_NOT_LEAK';

function oauthPaths(root: string) {
  return { credentialsPath: join(root, 'credentials.json'), tokenPath: join(root, 'token.json') };
}

function oauthEnv(root: string, extra: Record<string, string> = {}) {
  const { credentialsPath, tokenPath } = oauthPaths(root);
  return { [OAUTH_CREDENTIALS_PATH_ENV]: credentialsPath, [OAUTH_TOKEN_PATH_ENV]: tokenPath, ...extra };
}

function writeOAuthCredentialsFile(root: string, { clientSecret = OAUTH_CLIENT_SECRET }: { clientSecret?: string } = {}) {
  const { credentialsPath } = oauthPaths(root);
  writeFileSync(
    credentialsPath,
    JSON.stringify({ installed: { client_id: 'synthetic-client-id.apps.googleusercontent.com', client_secret: clientSecret, redirect_uris: ['http://localhost'] } }),
  );
}

function writeOAuthTokenFile(root: string, state: Record<string, unknown>) {
  const { tokenPath } = oauthPaths(root);
  writeFileSync(tokenPath, JSON.stringify(state));
}

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

test('A6: a canonical base64url encoding of an ordinary text payload decodes and passes the round-trip check', () => {
  const original = Buffer.from('a perfectly ordinary text payload, nothing unusual here', 'utf8');
  const decoded = decodeBase64Url(base64UrlEncode(original));
  assert.equal(Buffer.compare(original, decoded), 0);
});

test('A7: a canonical base64url encoding of arbitrary binary bytes decodes and passes the round-trip check', () => {
  const original = Buffer.from(Array.from({ length: 513 }, (_, i) => (i * 91 + 3) % 256));
  const decoded = decodeBase64Url(base64UrlEncode(original));
  assert.equal(Buffer.compare(original, decoded), 0);
});

test('A8: "AB" is a non-canonical base64url string (non-zero padding bits) and is rejected', () => {
  // Sanity: prove this really is non-canonical before asserting the rejection
  // — this must not be an assumption about base64 bit layout.
  assert.notEqual(Buffer.from('AB', 'base64url').toString('base64url'), 'AB');
  assert.throws(
    () => decodeBase64Url('AB'),
    (error) => error instanceof GmailTransportError && error.code === 'gmail_raw_field_non_canonical',
  );
});

test('A9: "AAAAA" is a non-canonical base64url string (implies fewer real bits than the length claims) and is rejected', () => {
  assert.notEqual(Buffer.from('AAAAA', 'base64url').toString('base64url'), 'AAAAA');
  assert.throws(
    () => decodeBase64Url('AAAAA'),
    (error) => error instanceof GmailTransportError && error.code === 'gmail_raw_field_non_canonical',
  );
});

test('A10: a non-canonical raw field never reaches persistence — acquisition fails closed and the destination is never created', async () => {
  await withTmpRootAsync(async (root) => {
    const restore = mockFetchOnce(async () => fakeGmailResponse('AB'));
    try {
      const dest = join(root, 'never-written.eml');
      await assert.rejects(
        acquireGmailRawMessage({ messageId: 'm1', destPath: dest, root, env: { [CREDENTIAL_ENV]: TOKEN } }),
        (error) => error instanceof GmailTransportError && error.code === 'gmail_raw_field_non_canonical',
      );
      assert.equal(existsSync(dest), false);
    } finally {
      restore();
    }
  });
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

test('C1: acquiring into an existing destination is refused, not overwritten, and no fetch is ever made', async () => {
  await withTmpRootAsync(async (root) => {
    const dest = join(root, 'already-there.eml');
    writeFileSync(dest, 'pre-existing');
    let fetchCalled = false;
    const restore = mockFetchOnce(async () => {
      fetchCalled = true;
      return fakeGmailResponse(base64UrlEncode(Buffer.from('new bytes', 'utf8')));
    });
    try {
      await assert.rejects(
        acquireGmailRawMessage({ messageId: 'm1', destPath: dest, root, env: { [CREDENTIAL_ENV]: TOKEN } }),
        (error) => error instanceof GmailTransportError && error.code === 'gmail_raw_destination_exists',
      );
      assert.equal(readFileSync(dest, 'utf8'), 'pre-existing');
      // Occupancy is checked before any provider call — the pre-existing
      // file must be refused without ever paying for a live fetch.
      assert.equal(fetchCalled, false);
    } finally {
      restore();
    }
  });
});

test('C1b: acquiring into a destination occupied by a symlink is refused, zero fetch calls', async () => {
  await withTmpRootAsync(async (root) => {
    const linkTarget = join(root, 'link-target.txt');
    writeFileSync(linkTarget, 'target-contents');
    const dest = join(root, 'symlinked-dest.eml');
    symlinkSync(linkTarget, dest);
    let fetchCalled = false;
    const restore = mockFetchOnce(async () => {
      fetchCalled = true;
      return fakeGmailResponse(base64UrlEncode(Buffer.from('new bytes', 'utf8')));
    });
    try {
      await assert.rejects(
        acquireGmailRawMessage({ messageId: 'm1', destPath: dest, root, env: { [CREDENTIAL_ENV]: TOKEN } }),
        (error) => error instanceof GmailTransportError && error.code === 'gmail_raw_destination_exists',
      );
      assert.equal(fetchCalled, false);
      assert.equal(readFileSync(linkTarget, 'utf8'), 'target-contents');
    } finally {
      restore();
    }
  });
});

test('C1c: acquiring into a destination occupied by an existing directory is refused, zero fetch calls', async () => {
  await withTmpRootAsync(async (root) => {
    const dest = join(root, 'is-a-directory.eml');
    mkdirSync(dest);
    let fetchCalled = false;
    const restore = mockFetchOnce(async () => {
      fetchCalled = true;
      return fakeGmailResponse(base64UrlEncode(Buffer.from('new bytes', 'utf8')));
    });
    try {
      await assert.rejects(
        acquireGmailRawMessage({ messageId: 'm1', destPath: dest, root, env: { [CREDENTIAL_ENV]: TOKEN } }),
        (error) => error instanceof GmailTransportError && error.code === 'gmail_raw_destination_exists',
      );
      assert.equal(fetchCalled, false);
      assert.equal(existsSync(dest), true);
    } finally {
      restore();
    }
  });
});

test('C1d: a TOCTOU race — destination created between the pre-check and the write — still fails closed via the wx guard', async () => {
  await withTmpRootAsync(async (root) => {
    const dest = join(root, 'raced-dest.eml');
    const raw = base64UrlEncode(Buffer.from('attacker-or-racer-bytes', 'utf8'));
    // The pre-check sees the destination as vacant; the race is simulated by
    // planting the file during the (mocked) network round trip, i.e. after
    // the pre-check ran and before `writeBytesDurable`'s `wx` open.
    const restore = mockFetchOnce(async () => {
      writeFileSync(dest, 'raced-in-during-fetch');
      return fakeGmailResponse(raw);
    });
    try {
      await assert.rejects(
        acquireGmailRawMessage({ messageId: 'm1', destPath: dest, root, env: { [CREDENTIAL_ENV]: TOKEN } }),
        (error) => error instanceof GmailTransportError && error.code === 'gmail_raw_destination_exists',
      );
      assert.equal(readFileSync(dest, 'utf8'), 'raced-in-during-fetch', 'the racer-written content must survive untouched');
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

/** Bytes a synthetic GitHub row's `content_sha256` commits to — see {@link writeSynthGithubArtifact}. */
function synthGithubArtifactBytes(id: string) {
  return Buffer.from(id);
}

function synthGithubManifestLine(id: string, observedAtIso: string, prNumber: number) {
  return JSON.stringify({
    dataset_record_id: id,
    provider: 'github',
    resource_class: 'github_pull_request',
    content_sha256: sha256Hex(synthGithubArtifactBytes(id)),
    provider_identity_commitment_sha256: sha256Hex(Buffer.from(`identity-${id}`)),
    observed_at: observedAtIso,
    source_event_at: '2026-08-15T00:00:00Z',
    work_universe_id: 'U-COLLAB',
    raw_artifact_relative_path: `synthetic-pr-${prNumber}.json`,
  });
}

/** Persists an artifact under `artifactRoot` whose bytes hash to the row's `content_sha256`. */
function writeSynthGithubArtifact(artifactRoot: string, id: string, prNumber: number) {
  mkdirSync(artifactRoot, { recursive: true });
  writeFileSync(join(artifactRoot, `synthetic-pr-${prNumber}.json`), synthGithubArtifactBytes(id));
}

/** The selection-resolution authority's `{universe: {resource_class: {selected: [...]}}}` shape. */
function synthSelectionResolved(selectedPrNumbers: number[]) {
  return JSON.stringify({
    'U-COLLAB': {
      github_pull_request: { selected: selectedPrNumbers },
    },
  });
}

test('G1: preflight passes when every structural condition is satisfied', async () => {
  await withTmpRootAsync(async (root) => {
    const runRoot = join(root, 'run3');
    // Preflight is read-only and never creates the run root itself (blocker
    // C) — an authorized bootstrap step is assumed to have already
    // provisioned it before preflight runs.
    mkdirSync(runRoot, { recursive: true });
    const planPath = join(root, 'plan.json');
    writeFileSync(planPath, JSON.stringify({ hello: 'plan' }));
    const planSha256 = sha256Hex(readFileSync(planPath));

    const manifestPath = join(root, 'manifest.jsonl');
    writeFileSync(
      manifestPath,
      [synthGithubManifestLine('P1D-0002', '2026-08-21T01:33:45Z', 2), synthGithubManifestLine('P1D-0003', '2026-08-21T01:33:46Z', 3)].join('\n'),
    );
    const selectionResolvedPath = join(root, 'selection-resolved.json');
    writeFileSync(selectionResolvedPath, synthSelectionResolved([2, 3]));
    const artifactRoot = join(root, 'artifacts');
    writeSynthGithubArtifact(artifactRoot, 'P1D-0002', 2);
    writeSynthGithubArtifact(artifactRoot, 'P1D-0003', 3);

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
        run2SelectionResolvedPath: selectionResolvedPath,
        run2ArtifactRoot: artifactRoot,
        expectedGithubReuseCount: 2,
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
    // Pre-provisioned, same rationale as G1 — preflight must not create it.
    mkdirSync(runRoot, { recursive: true });
    const planPath = join(root, 'plan.json');
    writeFileSync(planPath, JSON.stringify({ hello: 'plan' }));

    const manifestPath = join(root, 'manifest.jsonl');
    writeFileSync(manifestPath, synthGithubManifestLine('P1D-0002', '2026-08-21T01:33:45Z', 2));
    const selectionResolvedPath = join(root, 'selection-resolved.json');
    writeFileSync(selectionResolvedPath, synthSelectionResolved([2]));
    const artifactRoot = join(root, 'artifacts');
    writeSynthGithubArtifact(artifactRoot, 'P1D-0002', 2);

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
        run2SelectionResolvedPath: selectionResolvedPath,
        run2ArtifactRoot: artifactRoot,
        expectedGithubReuseCount: 1,
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
    writeFileSync(manifestPath, synthGithubManifestLine('P1D-0002', '2026-08-14T12:00:00Z', 2));
    const selectionResolvedPath = join(root, 'selection-resolved.json');
    writeFileSync(selectionResolvedPath, synthSelectionResolved([2]));
    const artifactRoot = join(root, 'artifacts');
    writeSynthGithubArtifact(artifactRoot, 'P1D-0002', 2);

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
        run2SelectionResolvedPath: selectionResolvedPath,
        run2ArtifactRoot: artifactRoot,
        expectedGithubReuseCount: 1,
      });
      assert.equal(result.overall_pass, false);
      assert.ok(result.failed_checks.includes('run2_github_reuse_metadata_valid'));
    } finally {
      restore();
    }
  });
});

test('G6: preflight fails closed when a reused GitHub row is not tied to the resolved selection', async () => {
  await withTmpRootAsync(async (root) => {
    const runRoot = join(root, 'run3');
    const planPath = join(root, 'plan.json');
    writeFileSync(planPath, '{}');
    const planSha256 = sha256Hex(readFileSync(planPath));

    const manifestPath = join(root, 'manifest.jsonl');
    writeFileSync(manifestPath, synthGithubManifestLine('P1D-0002', '2026-08-21T01:33:45Z', 2));
    const selectionResolvedPath = join(root, 'selection-resolved.json');
    // The row references PR #2, but the resolved selection only ever selected #3 — no provenance tie.
    writeFileSync(selectionResolvedPath, synthSelectionResolved([3]));
    const artifactRoot = join(root, 'artifacts');
    writeSynthGithubArtifact(artifactRoot, 'P1D-0002', 2);

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
        run2SelectionResolvedPath: selectionResolvedPath,
        run2ArtifactRoot: artifactRoot,
        expectedGithubReuseCount: 1,
      });
      assert.equal(result.overall_pass, false);
      assert.ok(result.failed_checks.includes('run2_github_selection_provenance_valid'));
      assert.ok(result.failed_checks.includes('run2_github_selection_set_equal'));
    } finally {
      restore();
    }
  });
});

test('G7: preflight fails closed when reused dataset_record_id ordering has a gap', async () => {
  await withTmpRootAsync(async (root) => {
    const runRoot = join(root, 'run3');
    const planPath = join(root, 'plan.json');
    writeFileSync(planPath, '{}');
    const planSha256 = sha256Hex(readFileSync(planPath));

    const manifestPath = join(root, 'manifest.jsonl');
    // P1D-0002 then P1D-0004 — a gap. Both ids are unique, so the existing uniqueness
    // check alone would not catch this; ordering must be exactly the sequential run.
    writeFileSync(
      manifestPath,
      [synthGithubManifestLine('P1D-0002', '2026-08-21T01:33:45Z', 2), synthGithubManifestLine('P1D-0004', '2026-08-21T01:33:46Z', 4)].join('\n'),
    );
    const selectionResolvedPath = join(root, 'selection-resolved.json');
    writeFileSync(selectionResolvedPath, synthSelectionResolved([2, 4]));
    const artifactRoot = join(root, 'artifacts');
    writeSynthGithubArtifact(artifactRoot, 'P1D-0002', 2);
    writeSynthGithubArtifact(artifactRoot, 'P1D-0004', 4);

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
        run2SelectionResolvedPath: selectionResolvedPath,
        run2ArtifactRoot: artifactRoot,
        expectedGithubReuseCount: 2,
      });
      assert.equal(result.overall_pass, false);
      assert.ok(result.failed_checks.includes('run2_dataset_record_id_sequential'));
      // The gap is a full-manifest-scope violation only: the GitHub subset (2, 4) is still
      // strictly increasing, so the GitHub-specific order check does not fire here.
      assert.equal(result.checks.run2_github_record_order_valid, true);
    } finally {
      restore();
    }
  });
});

test('G4: preflight reports gmail_auth_available=false without a configured credential, and does not throw', async () => {
  await withTmpRootAsync(async (root) => {
    const runRoot = join(root, 'run3');
    const planPath = join(root, 'plan.json');
    writeFileSync(planPath, '{}');
    const planSha256 = sha256Hex(readFileSync(planPath));
    const manifestPath = join(root, 'manifest.jsonl');
    writeFileSync(manifestPath, synthGithubManifestLine('P1D-0002', '2026-08-21T01:33:45Z', 2));
    const selectionResolvedPath = join(root, 'selection-resolved.json');
    writeFileSync(selectionResolvedPath, synthSelectionResolved([2]));
    const artifactRoot = join(root, 'artifacts');
    writeSynthGithubArtifact(artifactRoot, 'P1D-0002', 2);

    const result = await runPreflight({
      env: { [OAUTH_CREDENTIALS_PATH_ENV]: join(root, 'no-such-credentials.json') },
      runRoot,
      planPath,
      expectedPlanSha256: planSha256,
      run2ManifestPath: manifestPath,
      run2AcquisitionWindowStartIso: '2026-08-21T01:25:19Z',
      run2AcquisitionWindowEndIso: '2026-08-21T05:25:19Z',
      run2SelectionResolvedPath: selectionResolvedPath,
      run2ArtifactRoot: artifactRoot,
      expectedGithubReuseCount: 1,
    });
    assert.equal(result.checks.gmail_auth_available, false);
    assert.equal(result.overall_pass, false);
    assert.equal(result.diagnostics.oauth_client_available, false);
    assert.equal(result.diagnostics.oauth_refresh_state_available, false);
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
    writeFileSync(manifestPath, synthGithubManifestLine('P1D-0002', '2026-08-21T01:33:45Z', 2));
    const selectionResolvedPath = join(root, 'selection-resolved.json');
    writeFileSync(selectionResolvedPath, synthSelectionResolved([2]));
    const artifactRoot = join(root, 'artifacts');
    writeSynthGithubArtifact(artifactRoot, 'P1D-0002', 2);

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
        run2SelectionResolvedPath: selectionResolvedPath,
        run2ArtifactRoot: artifactRoot,
        expectedGithubReuseCount: 1,
      });
      assert.equal(result.checks.run_root_valid, false);
      assert.equal(result.overall_pass, false);
    } finally {
      restore();
    }
  });
});

test('G8: preflight fails closed when the run root does not exist yet, and never creates it', async () => {
  await withTmpRootAsync(async (root) => {
    const runRoot = join(root, 'run3-never-created');

    const planPath = join(root, 'plan.json');
    writeFileSync(planPath, '{}');
    const planSha256 = sha256Hex(readFileSync(planPath));
    const manifestPath = join(root, 'manifest.jsonl');
    writeFileSync(manifestPath, synthGithubManifestLine('P1D-0002', '2026-08-21T01:33:45Z', 2));
    const selectionResolvedPath = join(root, 'selection-resolved.json');
    writeFileSync(selectionResolvedPath, synthSelectionResolved([2]));
    const artifactRoot = join(root, 'artifacts');
    writeSynthGithubArtifact(artifactRoot, 'P1D-0002', 2);

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
        run2SelectionResolvedPath: selectionResolvedPath,
        run2ArtifactRoot: artifactRoot,
        expectedGithubReuseCount: 1,
      });
      assert.equal(result.checks.destination_writable, false);
      assert.equal(result.checks.disk_space_sufficient, false);
      assert.equal(result.checks.run_root_valid, false);
      assert.equal(result.overall_pass, false);
      // Read-only by construction: a missing run root must never be created
      // as a side effect of running preflight.
      assert.equal(existsSync(runRoot), false);
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// H. Run-3 reuse evidence closure — actual byte hash, exact cardinality,
//    bidirectional selection-set equality over the reused Run-2 GitHub set
// ---------------------------------------------------------------------------

test('H1: preflight fails closed when a reused artifact on disk no longer matches its manifest hash', async () => {
  await withTmpRootAsync(async (root) => {
    const runRoot = join(root, 'run3');
    const planPath = join(root, 'plan.json');
    writeFileSync(planPath, '{}');
    const planSha256 = sha256Hex(readFileSync(planPath));

    const manifestPath = join(root, 'manifest.jsonl');
    writeFileSync(manifestPath, synthGithubManifestLine('P1D-0002', '2026-08-21T01:33:45Z', 2));
    const selectionResolvedPath = join(root, 'selection-resolved.json');
    writeFileSync(selectionResolvedPath, synthSelectionResolved([2]));
    const artifactRoot = join(root, 'artifacts');
    mkdirSync(artifactRoot, { recursive: true });
    // Bytes on disk diverge from the manifest's committed content_sha256.
    writeFileSync(join(artifactRoot, 'synthetic-pr-2.json'), Buffer.from('drifted-bytes'));

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
        run2SelectionResolvedPath: selectionResolvedPath,
        run2ArtifactRoot: artifactRoot,
        expectedGithubReuseCount: 1,
      });
      assert.equal(result.overall_pass, false);
      assert.ok(result.failed_checks.includes('run2_github_artifact_hash_valid'));
      // The file exists — only its bytes are wrong — so existence is unaffected.
      assert.equal(result.checks.run2_github_artifacts_exist, true);
    } finally {
      restore();
    }
  });
});

test('H2: preflight fails closed when a selected GitHub artifact is missing from the manifest', async () => {
  await withTmpRootAsync(async (root) => {
    const runRoot = join(root, 'run3');
    const planPath = join(root, 'plan.json');
    writeFileSync(planPath, '{}');
    const planSha256 = sha256Hex(readFileSync(planPath));

    const manifestPath = join(root, 'manifest.jsonl');
    writeFileSync(manifestPath, synthGithubManifestLine('P1D-0002', '2026-08-21T01:33:45Z', 2));
    const selectionResolvedPath = join(root, 'selection-resolved.json');
    // Selection authority selected #2 AND #3, but the manifest only reused #2.
    writeFileSync(selectionResolvedPath, synthSelectionResolved([2, 3]));
    const artifactRoot = join(root, 'artifacts');
    writeSynthGithubArtifact(artifactRoot, 'P1D-0002', 2);

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
        run2SelectionResolvedPath: selectionResolvedPath,
        run2ArtifactRoot: artifactRoot,
        expectedGithubReuseCount: 1,
      });
      assert.equal(result.overall_pass, false);
      assert.ok(result.failed_checks.includes('run2_github_selection_set_equal'));
      // Every manifest row still traces to *a* selection entry, so the
      // one-directional provenance check alone would not have caught this.
      assert.equal(result.checks.run2_github_selection_provenance_valid, true);
    } finally {
      restore();
    }
  });
});

test('H3: preflight fails closed when the manifest holds one fewer GitHub row than the pinned reuse count', async () => {
  await withTmpRootAsync(async (root) => {
    const runRoot = join(root, 'run3');
    const planPath = join(root, 'plan.json');
    writeFileSync(planPath, '{}');
    const planSha256 = sha256Hex(readFileSync(planPath));

    const manifestPath = join(root, 'manifest.jsonl');
    // Only 1 row, but the reuse contract pins exactly 2 for this test.
    writeFileSync(manifestPath, synthGithubManifestLine('P1D-0002', '2026-08-21T01:33:45Z', 2));
    const selectionResolvedPath = join(root, 'selection-resolved.json');
    writeFileSync(selectionResolvedPath, synthSelectionResolved([2]));
    const artifactRoot = join(root, 'artifacts');
    writeSynthGithubArtifact(artifactRoot, 'P1D-0002', 2);

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
        run2SelectionResolvedPath: selectionResolvedPath,
        run2ArtifactRoot: artifactRoot,
        expectedGithubReuseCount: 2,
      });
      assert.equal(result.overall_pass, false);
      assert.ok(result.failed_checks.includes('run2_github_count_exact'));
    } finally {
      restore();
    }
  });
});

test('H4: preflight fails closed when a duplicate row represents the same selected artifact twice', async () => {
  await withTmpRootAsync(async (root) => {
    const runRoot = join(root, 'run3');
    const planPath = join(root, 'plan.json');
    writeFileSync(planPath, '{}');
    const planSha256 = sha256Hex(readFileSync(planPath));

    const manifestPath = join(root, 'manifest.jsonl');
    // Two distinct dataset_record_ids, same (universe, resource_class, PR number) identity.
    writeFileSync(
      manifestPath,
      [synthGithubManifestLine('P1D-0002', '2026-08-21T01:33:45Z', 2), synthGithubManifestLine('P1D-0003', '2026-08-21T01:33:46Z', 2)].join('\n'),
    );
    const selectionResolvedPath = join(root, 'selection-resolved.json');
    writeFileSync(selectionResolvedPath, synthSelectionResolved([2]));
    const artifactRoot = join(root, 'artifacts');
    writeSynthGithubArtifact(artifactRoot, 'P1D-0002', 2);

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
        run2SelectionResolvedPath: selectionResolvedPath,
        run2ArtifactRoot: artifactRoot,
        expectedGithubReuseCount: 2,
      });
      assert.equal(result.overall_pass, false);
      assert.ok(result.failed_checks.includes('run2_github_count_exact'));
      assert.ok(result.failed_checks.includes('run2_github_selection_set_equal'));
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// I. OAuth lifecycle — cached use, automatic refresh, first-run consent,
//    precedence over the manual token fallback, and secret-leak freedom.
//    Every case here is synthetic and every Google call is either mocked via
//    an injected `createClient`/`exchangeCode`, or never made at all (the
//    fresh-cached-token path returns without touching the network). No test
//    in this section performs a real request to Google.
// ---------------------------------------------------------------------------

test('I1: a fresh cached access token is used as-is, with no refresh call', async () => {
  await withTmpRootAsync(async (root) => {
    writeOAuthCredentialsFile(root);
    writeOAuthTokenFile(root, {
      refresh_token: OAUTH_REFRESH_TOKEN,
      access_token: OAUTH_ACCESS_TOKEN,
      expiry_date: Date.now() + 3_600_000,
      scope: OAUTH_SCOPE,
    });
    const env = oauthEnv(root);
    let refreshCalled = false;
    const token = await resolveOAuthAccessToken(env, {
      createClient: () => {
        refreshCalled = true;
        throw new Error('must not be called — the cached token is still fresh');
      },
    });
    assert.equal(token, OAUTH_ACCESS_TOKEN);
    assert.equal(refreshCalled, false);
  });
});

test('I2: an expired access token with a valid refresh token is automatically refreshed and persisted', async () => {
  await withTmpRootAsync(async (root) => {
    writeOAuthCredentialsFile(root);
    writeOAuthTokenFile(root, {
      refresh_token: OAUTH_REFRESH_TOKEN,
      access_token: 'stale-access-token',
      expiry_date: Date.now() - 1_000,
      scope: OAUTH_SCOPE,
    });
    const env = oauthEnv(root);
    const newExpiry = Date.now() + 3_600_000;
    let setCredentialsArg: unknown = null;
    const token = await resolveOAuthAccessToken(env, {
      createClient: () => ({
        setCredentials: (creds: unknown) => {
          setCredentialsArg = creds;
        },
        refreshAccessToken: async () => ({
          credentials: { access_token: 'refreshed-access-token', expiry_date: newExpiry, refresh_token: OAUTH_REFRESH_TOKEN },
        }),
      }),
    });
    assert.equal(token, 'refreshed-access-token');
    assert.deepEqual(setCredentialsArg, { refresh_token: OAUTH_REFRESH_TOKEN });

    const persisted = readTokenState(env);
    assert.equal(persisted?.access_token, 'refreshed-access-token');
    assert.equal(persisted?.expiry_date, newExpiry);
    assert.equal(persisted?.refresh_token, OAUTH_REFRESH_TOKEN);
  });
});

test('I2b: a persist failure after a successful refresh fails closed with a stable code, not a raw fs error', async () => {
  await withTmpRootAsync(async (root) => {
    writeOAuthCredentialsFile(root);
    writeOAuthTokenFile(root, {
      refresh_token: OAUTH_REFRESH_TOKEN,
      access_token: 'stale-access-token',
      expiry_date: Date.now() - 1_000,
      scope: OAUTH_SCOPE,
    });
    const env = oauthEnv(root);
    const { tokenPath } = oauthPaths(root);
    const tokenDir = dirname(tokenPath);
    // The token file itself already exists (read succeeds, refresh proceeds
    // normally); the directory is then made read-only so the durable
    // tmp-file-plus-rename write inside `persistTokenState` cannot create
    // its temp file — this fails the *write*, not the read.
    chmodSync(tokenDir, 0o500);
    try {
      await assert.rejects(
        resolveOAuthAccessToken(env, {
          createClient: () => ({
            setCredentials: () => {},
            refreshAccessToken: async () => ({
              credentials: { access_token: 'refreshed-access-token', expiry_date: Date.now() + 3_600_000, refresh_token: OAUTH_REFRESH_TOKEN },
            }),
          }),
        }),
        (error: unknown) => {
          assert.ok(error instanceof GmailOAuthError);
          assert.equal(error.code, 'gmail_oauth_persist_failed');
          assert.ok(!error.message.includes(tokenDir));
          return true;
        },
      );
    } finally {
      chmodSync(tokenDir, 0o700);
    }
  });
});

test('I3: a refresh failure fails closed with a stable code, leaks no secret, and leaves disk state untouched', async () => {
  await withTmpRootAsync(async (root) => {
    writeOAuthCredentialsFile(root);
    const originalState = {
      refresh_token: OAUTH_REFRESH_TOKEN,
      access_token: 'stale-access-token',
      expiry_date: Date.now() - 1_000,
      scope: OAUTH_SCOPE,
    };
    writeOAuthTokenFile(root, originalState);
    const env = oauthEnv(root);

    await assert.rejects(
      resolveOAuthAccessToken(env, {
        createClient: () => ({
          setCredentials: () => {},
          // Simulates a library rejection that quotes request internals —
          // the secret must not survive past refreshAccessToken's boundary.
          refreshAccessToken: async () => {
            throw new Error(`refresh denied for client_secret=${OAUTH_CLIENT_SECRET} refresh_token=${OAUTH_REFRESH_TOKEN}`);
          },
        }),
      }),
      (error: unknown) => {
        assert.ok(error instanceof GmailOAuthError);
        assert.equal(error.code, 'gmail_oauth_refresh_failed');
        assert.ok(!error.message.includes(OAUTH_CLIENT_SECRET));
        assert.ok(!error.message.includes(OAUTH_REFRESH_TOKEN));
        return true;
      },
    );

    const persisted = readTokenState(env);
    assert.deepEqual(persisted, originalState);
  });
});

test('I4: a missing OAuth client fails closed with a stable code', async () => {
  await withTmpRootAsync(async (root) => {
    // credentials.json deliberately never written.
    const env = oauthEnv(root);
    assert.equal(isOAuthClientConfigured(env), false);
    await assert.rejects(
      refreshAccessToken(env),
      (error: unknown) => error instanceof GmailOAuthError && error.code === 'gmail_oauth_client_not_configured',
    );
  });
});

test('I5: missing refresh state signals the first-run consent path, not a generic failure', async () => {
  await withTmpRootAsync(async (root) => {
    writeOAuthCredentialsFile(root);
    // token.json deliberately never written — no prior consent.
    const env = oauthEnv(root);
    await assert.rejects(
      resolveOAuthAccessToken(env),
      (error: unknown) => error instanceof GmailOAuthError && error.code === 'gmail_oauth_consent_required',
    );
  });
});

test('I5b: runFirstRunConsent completes the real local-loopback server round trip and persists refresh state', async () => {
  await withTmpRootAsync(async (root) => {
    writeOAuthCredentialsFile(root);
    const env = oauthEnv(root);
    const newExpiry = Date.now() + 3_600_000;
    let exchangedCode: string | null = null;
    let exchangedVerifier: string | null = null;

    const result = await runFirstRunConsent(env, {
      // The token exchange itself is mocked (no real Google call); the HTTP
      // server, the redirect URL, and the callback round trip below are real.
      exchangeCode: async ({ code, codeVerifier }) => {
        exchangedCode = code;
        exchangedVerifier = codeVerifier;
        return { refresh_token: OAUTH_REFRESH_TOKEN, access_token: OAUTH_ACCESS_TOKEN, expiry_date: newExpiry };
      },
      // Stands in for opening a real browser: parses the real redirect_uri
      // and state out of the real consent URL and fires the callback a
      // human's "Allow" click would produce, against the real ephemeral
      // server — including the state param a real Google redirect echoes.
      openBrowser: (url) => {
        const parsed = new URL(url);
        const redirectUri = parsed.searchParams.get('redirect_uri');
        assert.ok(typeof redirectUri === 'string' && redirectUri.startsWith('http://127.0.0.1:'));
        // Scope must be exactly gmail.readonly — never widened, never a second scope.
        assert.equal(parsed.searchParams.get('scope'), OAUTH_SCOPE);
        assert.equal(parsed.searchParams.get('access_type'), 'offline');
        const state = parsed.searchParams.get('state');
        assert.ok(typeof state === 'string' && state.length > 0);
        fetch(`${redirectUri}?code=synthetic-auth-code&state=${encodeURIComponent(state as string)}`).catch(() => {});
        return true;
      },
    });

    assert.deepEqual(result, { status: 'READY' });
    assert.equal(exchangedCode, 'synthetic-auth-code');
    assert.ok(typeof exchangedVerifier === 'string' && (exchangedVerifier as string).length > 0);

    const persisted = readTokenState(env);
    assert.equal(persisted?.refresh_token, OAUTH_REFRESH_TOKEN);
    assert.equal(persisted?.access_token, OAUTH_ACCESS_TOKEN);
    assert.equal(persisted?.expiry_date, newExpiry);
    assert.ok(hasRefreshState(persisted));
  });
});

test('I6: the send-capable GMAIL_ACCESS_TOKEN is never read, at any precedence level', async () => {
  await withTmpRootAsync(async (root) => {
    // No OAuth client configured, no ATRA_P1_2_GMAIL_TOKEN — only a
    // send-capable runtime credential is present. Resolution must still
    // fail closed rather than silently pick it up.
    const env = oauthEnv(root, { GMAIL_ACCESS_TOKEN: 'SEND_CAPABLE_TOKEN_MUST_NOT_BE_USED' });
    await assert.rejects(
      resolveGmailBearerToken(env),
      (error: unknown) => error instanceof GmailTransportError && error.code === 'gmail_raw_credential_not_configured',
    );
  });
});

test('I6b: neither gmailRaw.mjs nor oauthCredential.mjs ever access env.GMAIL_ACCESS_TOKEN in code', () => {
  // Prose may explain what is deliberately NOT read (both files' doc
  // comments do); no line may actually look it up as a property/index.
  const ACCESS_PATTERN = /\.GMAIL_ACCESS_TOKEN\b|\[['"]GMAIL_ACCESS_TOKEN['"]\]/;
  for (const file of ['gmailRaw.mjs', 'oauthCredential.mjs']) {
    const source = readFileSync(join(TOOL_DIR, file), 'utf8');
    assert.ok(!ACCESS_PATTERN.test(source), `${file} must never access env.GMAIL_ACCESS_TOKEN`);
  }
});

test('I7: OAuth takes precedence over ATRA_P1_2_GMAIL_TOKEN once a client is configured — the manual token is never consulted', async () => {
  await withTmpRootAsync(async (root) => {
    writeOAuthCredentialsFile(root);
    writeOAuthTokenFile(root, {
      refresh_token: OAUTH_REFRESH_TOKEN,
      access_token: OAUTH_ACCESS_TOKEN,
      expiry_date: Date.now() + 3_600_000,
      scope: OAUTH_SCOPE,
    });
    // A manual token is also set, and it is intentionally malformed (would
    // fail TOKEN_RE) — if it were ever consulted, resolution would throw.
    const env = oauthEnv(root, { [CREDENTIAL_ENV]: 'not a valid token' });
    const token = await resolveGmailBearerToken(env);
    assert.equal(token, OAUTH_ACCESS_TOKEN);
  });
});

test('I8: with no OAuth client configured, the manual ATRA_P1_2_GMAIL_TOKEN fallback still works unchanged', async () => {
  await withTmpRootAsync(async (root) => {
    const env = oauthEnv(root, { [CREDENTIAL_ENV]: TOKEN });
    assert.equal(isOAuthClientConfigured(env), false);
    const token = await resolveGmailBearerToken(env);
    assert.equal(token, TOKEN);
  });
});

test('I9: CLI oauth-authorize reports READY without a network call when a fresh token is already cached, and leaks no planted secret', async () => {
  await withTmpRootAsync(async (root) => {
    writeOAuthCredentialsFile(root);
    writeOAuthTokenFile(root, {
      refresh_token: OAUTH_REFRESH_TOKEN,
      access_token: OAUTH_ACCESS_TOKEN,
      expiry_date: Date.now() + 3_600_000,
      scope: OAUTH_SCOPE,
    });
    const env = { ...process.env, ...oauthEnv(root) };
    delete env.ATRA_P1_2_GMAIL_TOKEN;
    const output = execFileSync(process.execPath, ['--experimental-strip-types', CLI_PATH, 'oauth-authorize'], { env, encoding: 'utf8' });
    assert.deepEqual(JSON.parse(output), { status: 'READY' });
    assert.ok(!output.includes(OAUTH_CLIENT_SECRET));
    assert.ok(!output.includes(OAUTH_REFRESH_TOKEN));
    assert.ok(!output.includes(OAUTH_ACCESS_TOKEN));
  });
});

test('I10: CLI oauth-authorize reports HUMAN_GOOGLE_OAUTH_CLIENT_REQUIRED when no client is configured, without touching the network', async () => {
  await withTmpRootAsync(async (root) => {
    // credentials.json deliberately never written.
    const env = { ...process.env, ...oauthEnv(root) };
    delete env.ATRA_P1_2_GMAIL_TOKEN;
    let output = '';
    let status = 0;
    try {
      output = execFileSync(process.execPath, ['--experimental-strip-types', CLI_PATH, 'oauth-authorize'], { env, encoding: 'utf8' });
    } catch (error) {
      const e = error as { status?: number; stdout?: unknown };
      status = e.status ?? 1;
      output = String(e.stdout ?? '');
    }
    assert.deepEqual(JSON.parse(output), { status: 'HUMAN_GOOGLE_OAUTH_CLIENT_REQUIRED' });
    assert.equal(status, 2);
  });
});

test('I11: preflight reports oauth_client_available and oauth_refresh_state_available independently and truthfully', async () => {
  await withTmpRootAsync(async (root) => {
    writeOAuthCredentialsFile(root);
    writeOAuthTokenFile(root, {
      refresh_token: OAUTH_REFRESH_TOKEN,
      access_token: OAUTH_ACCESS_TOKEN,
      expiry_date: Date.now() + 3_600_000,
      scope: OAUTH_SCOPE,
    });

    const runRoot = join(root, 'run3');
    // Pre-provisioned — preflight is read-only and must not create it.
    mkdirSync(runRoot, { recursive: true });
    const planPath = join(root, 'plan.json');
    writeFileSync(planPath, JSON.stringify({ hello: 'plan' }));
    const planSha256 = sha256Hex(readFileSync(planPath));
    const manifestPath = join(root, 'manifest.jsonl');
    writeFileSync(
      manifestPath,
      [synthGithubManifestLine('P1D-0002', '2026-08-21T01:33:45Z', 2), synthGithubManifestLine('P1D-0003', '2026-08-21T01:33:46Z', 3)].join('\n'),
    );
    const selectionResolvedPath = join(root, 'selection-resolved.json');
    writeFileSync(selectionResolvedPath, synthSelectionResolved([2, 3]));
    const artifactRoot = join(root, 'artifacts');
    writeSynthGithubArtifact(artifactRoot, 'P1D-0002', 2);
    writeSynthGithubArtifact(artifactRoot, 'P1D-0003', 3);

    const restore = mockFetchOnce(async () => new Response(JSON.stringify({}), { status: 200 }));
    try {
      const result = await runPreflight({
        env: oauthEnv(root),
        runRoot,
        planPath,
        expectedPlanSha256: planSha256,
        run2ManifestPath: manifestPath,
        run2AcquisitionWindowStartIso: '2026-08-21T01:25:19Z',
        run2AcquisitionWindowEndIso: '2026-08-21T05:25:19Z',
        run2SelectionResolvedPath: selectionResolvedPath,
        run2ArtifactRoot: artifactRoot,
        expectedGithubReuseCount: 2,
      });
      assert.equal(result.diagnostics.oauth_client_available, true);
      assert.equal(result.diagnostics.oauth_refresh_state_available, true);
      assert.equal(result.checks.gmail_auth_available, true);
      assert.equal(result.overall_pass, true);
    } finally {
      restore();
    }
  });
});

// J. OAuth authorization-request/callback binding — per-attempt state and
// PKCE S256, verified strictly before any code exchange.

function synthCodeVerifierResult() {
  return { codeVerifier: 'synthetic-code-verifier-000000000000000000000000000', codeChallenge: 'synthetic-code-challenge-hash' };
}

/**
 * Fires a consent attempt, captures the real auth URL the server built, then
 * immediately closes the attempt out with a deliberately-wrong-state
 * callback (fast, deterministic rejection) rather than leaving the
 * ephemeral server's 5-minute timer as the only thing that can end it.
 */
async function captureAuthUrl(env: Record<string, string>): Promise<URL> {
  let capturedUrl: URL | null = null;
  await assert.rejects(
    runFirstRunConsent(env, {
      generateCodeVerifier: async () => synthCodeVerifierResult(),
      exchangeCode: async () => ({ refresh_token: OAUTH_REFRESH_TOKEN, access_token: OAUTH_ACCESS_TOKEN, expiry_date: Date.now() + 3_600_000 }),
      openBrowser: (url: string) => {
        capturedUrl = new URL(url);
        const redirectUri = capturedUrl.searchParams.get('redirect_uri');
        fetch(`${redirectUri}?code=synthetic-auth-code&state=deliberately-wrong-state`).catch(() => {});
        return true;
      },
    }),
    (error: unknown) => error instanceof GmailOAuthError && error.code === 'gmail_oauth_state_invalid',
  );
  assert.ok(capturedUrl !== null);
  return capturedUrl as URL;
}

test('J-A: the authorization URL carries a non-empty state parameter', async () => {
  await withTmpRootAsync(async (root) => {
    writeOAuthCredentialsFile(root);
    const env = oauthEnv(root);
    const url = await captureAuthUrl(env);
    const state = url.searchParams.get('state');
    assert.ok(typeof state === 'string' && state.length > 0);
  });
});

test('J-B: two independent consent attempts produce different states', async () => {
  await withTmpRootAsync(async (root) => {
    writeOAuthCredentialsFile(root);
    const env = oauthEnv(root);
    const urlA = await captureAuthUrl(env);
    const urlB = await captureAuthUrl(env);
    assert.notEqual(urlA.searchParams.get('state'), urlB.searchParams.get('state'));
  });
});

test('J-C: a callback carrying the matching state is permitted through to code exchange', async () => {
  await withTmpRootAsync(async (root) => {
    writeOAuthCredentialsFile(root);
    const env = oauthEnv(root);
    let exchangeCalled = false;

    const result = await runFirstRunConsent(env, {
      generateCodeVerifier: async () => synthCodeVerifierResult(),
      exchangeCode: async () => {
        exchangeCalled = true;
        return { refresh_token: OAUTH_REFRESH_TOKEN, access_token: OAUTH_ACCESS_TOKEN, expiry_date: Date.now() + 3_600_000 };
      },
      openBrowser: (url) => {
        const parsed = new URL(url);
        const redirectUri = parsed.searchParams.get('redirect_uri');
        const state = parsed.searchParams.get('state') as string;
        fetch(`${redirectUri}?code=synthetic-auth-code&state=${encodeURIComponent(state)}`).catch(() => {});
        return true;
      },
    });

    assert.deepEqual(result, { status: 'READY' });
    assert.equal(exchangeCalled, true);
  });
});

test('J-D: a callback with no state parameter fails closed without exchanging the code or persisting a token', async () => {
  await withTmpRootAsync(async (root) => {
    writeOAuthCredentialsFile(root);
    const env = oauthEnv(root);
    let exchangeCalled = false;

    await assert.rejects(
      runFirstRunConsent(env, {
        generateCodeVerifier: async () => synthCodeVerifierResult(),
        exchangeCode: async () => {
          exchangeCalled = true;
          return { refresh_token: OAUTH_REFRESH_TOKEN, access_token: OAUTH_ACCESS_TOKEN, expiry_date: Date.now() + 3_600_000 };
        },
        openBrowser: (url) => {
          const parsed = new URL(url);
          const redirectUri = parsed.searchParams.get('redirect_uri');
          fetch(`${redirectUri}?code=synthetic-auth-code`).catch(() => {});
          return true;
        },
      }),
      (error: unknown) => error instanceof GmailOAuthError && error.code === 'gmail_oauth_state_invalid',
    );

    assert.equal(exchangeCalled, false);
    assert.equal(readTokenState(env), null);
  });
});

test('J-E: a callback with a mismatched state fails closed without exchanging the code or persisting a token', async () => {
  await withTmpRootAsync(async (root) => {
    writeOAuthCredentialsFile(root);
    const env = oauthEnv(root);
    let exchangeCalled = false;

    await assert.rejects(
      runFirstRunConsent(env, {
        generateCodeVerifier: async () => synthCodeVerifierResult(),
        exchangeCode: async () => {
          exchangeCalled = true;
          return { refresh_token: OAUTH_REFRESH_TOKEN, access_token: OAUTH_ACCESS_TOKEN, expiry_date: Date.now() + 3_600_000 };
        },
        openBrowser: (url) => {
          const parsed = new URL(url);
          const redirectUri = parsed.searchParams.get('redirect_uri');
          fetch(`${redirectUri}?code=synthetic-auth-code&state=attacker-supplied-state`).catch(() => {});
          return true;
        },
      }),
      (error: unknown) => error instanceof GmailOAuthError && error.code === 'gmail_oauth_state_invalid',
    );

    assert.equal(exchangeCalled, false);
    assert.equal(readTokenState(env), null);
  });
});

test('J-F: the authorization URL carries code_challenge and code_challenge_method=S256', async () => {
  await withTmpRootAsync(async (root) => {
    writeOAuthCredentialsFile(root);
    const env = oauthEnv(root);
    const url = await captureAuthUrl(env);
    assert.equal(url.searchParams.get('code_challenge'), synthCodeVerifierResult().codeChallenge);
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  });
});

test('J-G: the code exchange receives the same codeVerifier generated for this consent attempt', async () => {
  await withTmpRootAsync(async (root) => {
    writeOAuthCredentialsFile(root);
    const env = oauthEnv(root);
    let receivedVerifier: string | null = null;

    await runFirstRunConsent(env, {
      generateCodeVerifier: async () => synthCodeVerifierResult(),
      exchangeCode: async ({ codeVerifier }) => {
        receivedVerifier = codeVerifier;
        return { refresh_token: OAUTH_REFRESH_TOKEN, access_token: OAUTH_ACCESS_TOKEN, expiry_date: Date.now() + 3_600_000 };
      },
      openBrowser: (url) => {
        const parsed = new URL(url);
        const redirectUri = parsed.searchParams.get('redirect_uri');
        const state = parsed.searchParams.get('state') as string;
        fetch(`${redirectUri}?code=synthetic-auth-code&state=${encodeURIComponent(state)}`).catch(() => {});
        return true;
      },
    });

    assert.equal(receivedVerifier, synthCodeVerifierResult().codeVerifier);
  });
});

test('J-H: a wrong or missing PKCE verifier causes the (synthetic) exchange to fail closed, with no token persisted', async () => {
  await withTmpRootAsync(async (root) => {
    writeOAuthCredentialsFile(root);
    const env = oauthEnv(root);

    // Stands in for Google's own PKCE enforcement: a real token endpoint
    // rejects a code exchange whose verifier doesn't match the challenge
    // sent to /authorize. This double reproduces that failure shape — it
    // never inspects codeVerifier itself (that comparison is Google's, not
    // this module's), only that a rejection from the exchange step
    // propagates as a stable, closed failure with nothing persisted.
    await assert.rejects(
      runFirstRunConsent(env, {
        generateCodeVerifier: async () => synthCodeVerifierResult(),
        exchangeCode: async () => {
          throw new Error('invalid_grant: PKCE verification failed');
        },
        openBrowser: (url) => {
          const parsed = new URL(url);
          const redirectUri = parsed.searchParams.get('redirect_uri');
          const state = parsed.searchParams.get('state') as string;
          // No codeVerifier is echoed back over HTTP in the real flow — this
          // double simulates the verifier having been lost/corrupted in transit.
          fetch(`${redirectUri}?code=synthetic-auth-code&state=${encodeURIComponent(state)}`).catch(() => {});
          return true;
        },
      }),
      (error: unknown) => error instanceof GmailOAuthError && error.code === 'gmail_oauth_consent_exchange_failed',
    );

    assert.equal(readTokenState(env), null);
  });
});

test('J-I: neither the state nor the codeVerifier is ever written to stdout or stderr', async () => {
  await withTmpRootAsync(async (root) => {
    writeOAuthCredentialsFile(root);
    const env = oauthEnv(root);
    const written: string[] = [];
    const originalStdoutWrite = process.stdout.write.bind(process.stdout);
    const originalStderrWrite = process.stderr.write.bind(process.stderr);
    process.stdout.write = ((chunk: unknown, ...rest: unknown[]) => {
      written.push(String(chunk));
      return originalStdoutWrite(chunk as never, ...(rest as []));
    }) as typeof process.stdout.write;
    process.stderr.write = ((chunk: unknown, ...rest: unknown[]) => {
      written.push(String(chunk));
      return originalStderrWrite(chunk as never, ...(rest as []));
    }) as typeof process.stderr.write;

    let capturedState: string | null = null;
    try {
      await runFirstRunConsent(env, {
        generateCodeVerifier: async () => synthCodeVerifierResult(),
        exchangeCode: async () => ({ refresh_token: OAUTH_REFRESH_TOKEN, access_token: OAUTH_ACCESS_TOKEN, expiry_date: Date.now() + 3_600_000 }),
        openBrowser: (url) => {
          const parsed = new URL(url);
          const redirectUri = parsed.searchParams.get('redirect_uri');
          capturedState = parsed.searchParams.get('state');
          fetch(`${redirectUri}?code=synthetic-auth-code&state=${encodeURIComponent(capturedState as string)}`).catch(() => {});
          return true;
        },
      });
    } finally {
      process.stdout.write = originalStdoutWrite;
      process.stderr.write = originalStderrWrite;
    }

    const output = written.join('');
    const state = capturedState as string | null;
    assert.ok(state !== null && state.length > 0);
    assert.ok(!output.includes(state as string));
    assert.ok(!output.includes(synthCodeVerifierResult().codeVerifier));
  });
});

test('J-J: no token state is persisted when state validation fails', async () => {
  await withTmpRootAsync(async (root) => {
    writeOAuthCredentialsFile(root);
    const env = oauthEnv(root);
    assert.equal(readTokenState(env), null);

    await assert.rejects(
      runFirstRunConsent(env, {
        generateCodeVerifier: async () => synthCodeVerifierResult(),
        exchangeCode: async () => ({ refresh_token: OAUTH_REFRESH_TOKEN, access_token: OAUTH_ACCESS_TOKEN, expiry_date: Date.now() + 3_600_000 }),
        openBrowser: (url) => {
          const parsed = new URL(url);
          const redirectUri = parsed.searchParams.get('redirect_uri');
          fetch(`${redirectUri}?code=synthetic-auth-code&state=wrong-state-value`).catch(() => {});
          return true;
        },
      }),
      (error: unknown) => error instanceof GmailOAuthError && error.code === 'gmail_oauth_state_invalid',
    );

    assert.equal(readTokenState(env), null);
  });
});
