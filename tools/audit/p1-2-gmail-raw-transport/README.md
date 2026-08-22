# P1-2 Gmail RAW byte-preserving transport

Audit-only local utility. Not part of the Atra runtime; nothing here imports product
code and no product code imports it.

## Why this exists

Run-2's Gmail canary (`P1D-0001`) proved a specific failure: when a Gmail RAW payload
is relayed through a model's own context and hand-retyped back out, a single byte can
flip while length is preserved, and a self-consistent hash of the retyped bytes then
certifies the corruption as authentic. See
`~/atra-private/p1-2-dataset/v1-run2/acquisition-terminal-state.private.json` for the
recorded evidence (offset 4327, length 9222 both sides, digests differ).

This transport removes the model from the byte path entirely. `acquireGmailRawMessage`
fetches, decodes, writes and independently re-reads a message's RAW bytes in one
uninterrupted subprocess. The only thing that ever leaves the process is a
content-free result: message id, byte length, two hex digests, one boolean.

## Operator setup

The normal path is a dedicated OAuth lifecycle, so no manual token needs copying
into the shell for every run:

1. In Google Cloud Console, create an **OAuth 2.0 Client ID** of type **Desktop app**
   and download its JSON. Save it to `~/atra-private/p1-2-oauth/credentials.json`
   (override with `ATRA_P1_2_GMAIL_OAUTH_CREDENTIALS_PATH` if needed). This step is
   the one thing only a human can do — creating the client in the Cloud Console.
2. Run:
   ```bash
   node tools/audit/p1-2-gmail-raw-transport/cli.mjs oauth-authorize
   ```
   This starts a local loopback HTTP server, opens the consent URL in the default
   browser, and — once the human clicks **Allow** — exchanges the code and persists a
   refresh credential to `~/atra-private/p1-2-oauth/token.json` (override with
   `ATRA_P1_2_GMAIL_OAUTH_TOKEN_PATH`), mode `0600` in a mode-`0700` directory. This is
   the other thing only a human can do — clicking Allow in the browser. Everything
   mechanical (server, code exchange, persistence) is automatic.
3. Every subsequent run refreshes the access token automatically from the persisted
   refresh token — no further browser step, no manual token.

Scope is pinned to `https://www.googleapis.com/auth/gmail.readonly` in code
(`OAUTH_SCOPE` in `oauthCredential.mjs`) and requested with `prompt: 'consent'` so a
re-run of `oauth-authorize` always re-confirms it; it is never widened.

### Credential precedence

1. **OAuth** — used whenever `credentials.json` is present. This is the primary path
   described above.
2. **`ATRA_P1_2_GMAIL_TOKEN`** — read only when no OAuth client is configured at all
   (`credentials.json` absent). It exists for tests and for operating an
   *unconfigured* installation manually; once a Desktop OAuth client is present, this
   variable is never consulted, so it can never silently outrank or weaken the OAuth
   path. See `resolveGmailBearerToken` in `gmailRaw.mjs`.

`GMAIL_ACCESS_TOKEN` (the runtime's send-capable credential) is never read at either
level — this transport intentionally uses its own environment variables and its own
private credential files, so the two credentials are never the same value.

```bash
node tools/audit/p1-2-gmail-raw-transport/cli.mjs auth-check

node tools/audit/p1-2-gmail-raw-transport/cli.mjs acquire \
  --message-id <gmail message id> \
  --root /secure/local/p1-2-dataset/sources/gmail \
  --dest /secure/local/p1-2-dataset/sources/gmail/<message-id>.eml
```

This CLI has no `preflight` command. The Run-3 pre-T0 preflight — the
content-free PASS/FAIL gate that must hold before T0 may be recorded — is a
separate, canonical command:

```bash
node tools/audit/p1-2-run3-controller/cli.mjs run3-preflight \
  --run2-manifest /secure/local/p1-2-dataset/v1-run2/manifest.private.jsonl \
  --run2-artifact-root /secure/local/p1-2-dataset/v1-run2/sources \
  --run2-selection-resolved /secure/local/p1-2-dataset/v1-run2/selection-resolved.private.json
```

See `../p1-2-run3-controller/README.md` for the full contract. It has no
`--plan-sha256` (or equivalent) flag: the plan document and its sidecar are
located by a fixed convention, and the hash that counts as authoritative is a
pinned constant in `planAuthority.mjs`, never an operator-suppliable value.

`auth-check` calls `users/me/profile` and reports only `{available, reason_code}` —
never the mailbox address or counts the endpoint returns. `acquire` refuses to
overwrite an existing destination and refuses any destination outside `--root`.

## Content-free output

```json
{
  "message_id": "19ffec83ddb98f6c",
  "byte_length": 9222,
  "provider_sha256": "4c05cf8c…",
  "persisted_sha256": "4c05cf8c…",
  "byte_equal": true
}
```

A caller (human or script) registers the artifact only when `byte_equal` is `true`. A
`false` result means the persisted file failed independent verification; it must be
treated the same way Run-2's canary was — quarantined, not deleted, never registered,
never inspected.

## Error codes

| code | meaning |
| --- | --- |
| `gmail_raw_credential_not_configured` / `_invalid` | no token, or one that is not header-safe |
| `gmail_raw_destination_exists` | refuses to overwrite an existing file |
| `gmail_raw_destination_outside_root` | destination resolves outside `--root` |
| `gmail_raw_message_id_invalid` | message id fails the id charset check |
| `gmail_raw_unauthorized` / `_forbidden` / `_not_found` / `_rate_limited` | 401 / 403 / 404 / 429 |
| `gmail_raw_upstream_error` / `_http_error` | 5xx / any other non-2xx |
| `gmail_raw_network_error` | the request never completed |
| `gmail_raw_field_missing` / `_field_malformed` | the `raw` field was absent or not valid base64url |
| `gmail_raw_response_unrecognized` / `_response_too_large` | payload was not `{raw: string}`, or exceeded the response cap |
| `gmail_raw_write_failed` / `_readback_short` | the durable write or independent read-back failed |

OAuth-specific codes (`GmailOAuthError`, from `oauthCredential.mjs`):

| code | meaning |
| --- | --- |
| `gmail_oauth_client_not_configured` | `credentials.json` is absent |
| `gmail_oauth_client_invalid` | `credentials.json` exists but is not a valid `{installed: {...}}` Desktop client |
| `gmail_oauth_consent_required` | no refresh token has ever been persisted — run `oauth-authorize` |
| `gmail_oauth_refresh_failed` | the refresh call failed or returned no access token |
| `gmail_oauth_persist_failed` | the refreshed token could not be written to `token.json` |
| `gmail_oauth_consent_denied` / `_no_refresh_token` / `_consent_exchange_failed` | the human declined consent, Google granted no refresh token, or the code exchange failed |
| `gmail_oauth_consent_server_failed` | the local loopback server could not start |

## Validation

`tests/p1_2GmailRawTransport.test.mts`, synthetic fixtures and mocked `fetch` only, no
real network call:

- **A** ordinary / all-zero / arbitrary-binary / large (8MB) synthetic payloads persist
  byte-identical; base64url round-trips exactly
- **B** the exact Run-2 shape — a single flipped byte at a mid-file offset with length
  preserved — is detected by `verifyByteFidelity`; a truncated write is also detected;
  the unmodified CLI acquire path is proven `byte_equal: true` end to end
- **C** an existing destination is never overwritten; a destination outside the
  authorized root — including a path-traversal attempt and a symlink planted inside
  the root that resolves outside it — is refused before any fetch
- **D** a missing or malformed credential fails closed with a stable code; the token
  never appears in CLI stdout/stderr or in a thrown error's message
- **E** every request is `GET` to the pinned origin with `format=raw`; a response
  missing the `raw` field fails closed
- **F** `auth-check` reports `available` without ever returning profile body fields,
  fails closed with a stable code on 401, and makes no network call when no
  credential is configured
- **G** the pre-T0 preflight is content-free PASS/FAIL over structural checks,
  including that every reused Run-2 GitHub row traces to the resolved selection
  authority and that the full manifest's `dataset_record_id` ordering is exactly
  sequential — not just present-and-unique
- **H** the reused Run-2 GitHub set is byte-verified, not just metadata-verified: a
  reused artifact whose on-disk bytes no longer match its manifest `content_sha256`
  fails closed (hashing happens inside a local function only — bytes are never
  returned or logged); the pinned `EXPECTED_RUN2_GITHUB_REUSE_COUNT` cardinality is
  exact, not "at least"; the manifest's reused-identity set and the resolved
  selection authority's selected-identity set must match in both directions, not
  just manifest-row-traces-to-selection; a duplicate row representing the same
  selected artifact twice is refused
- **I** the OAuth lifecycle: a fresh cached access token is used with no refresh
  call; an expired one is automatically refreshed and persisted; a refresh failure
  fails closed with a stable code and leaves `token.json` untouched; a persist
  failure *after* a successful refresh also fails closed (not a raw filesystem
  error); a missing client and missing refresh state each produce their own stable
  code, the latter being exactly the signal `oauth-authorize` turns into first-run
  consent; `runFirstRunConsent` is exercised end to end against its real local
  loopback server (only the token exchange itself is mocked); `GMAIL_ACCESS_TOKEN`
  is proven unread both behaviorally and by a source-level regression guard; OAuth
  is proven to take precedence over a simultaneously-configured
  `ATRA_P1_2_GMAIL_TOKEN`, and the fallback is proven to still work when no OAuth
  client exists; the CLI's `oauth-authorize` command is proven not to print planted
  secrets even when real secret material sits on disk next to it; and the preflight
  diagnostics (`oauth_client_available`, `oauth_refresh_state_available`) are proven
  to reflect real state independently of each other and of `gmail_auth_available`

47/47 pass. `byteEqual` is a direct binary comparison of provider vs. persisted
bytes, not a digest comparison — B4 proves this with a forced digest collision.
`assertInsideRoot` resolves both the root and the destination's parent through
`realpathSync` before any fetch, so a symlink cannot lexically pass containment while
resolving outside the root — C4 proves this. `resolveRun2ArtifactRealPath` in
`preflight.mjs` applies the same realpath-containment pattern to reads of already-
persisted Run-2 artifacts. Six hand-written mutations were replayed across two
review passes to confirm the suite actually exercises these properties rather than
passing vacuously: forcing `byteEqual` back to digest equality (B4 fails, as
required), removing the realpath containment check (C4 fails, as required),
accepting unselected/non-sequential Run-2 GitHub reuse metadata (G6/G7 fail, as
required), disabling the actual-artifact hash comparison (H1 fails, as required),
dropping the duplicate-identity guard from the exact-count check (H4 fails, as
required), and loosening the exact-count comparison to accept a subset (H3 fails,
as required). Four further adversarial probes were run against the OAuth addition:
requesting a broader scope than `gmail.readonly` (no test caught this — closed by
adding an explicit scope assertion inside I5b rather than leaving it unverified),
silently reading `GMAIL_ACCESS_TOKEN` as a fallback (I6/I6b fail, as required),
printing a caught error's raw `.message` from the CLI (this mutation was inert
against the current design — `GmailOAuthError.message` is always exactly its `code`
by construction, so there was nothing to leak at that call site; the same probe did
surface a real, previously-unguarded gap one layer down — `persistTokenState`
running outside any try/catch inside `refreshAccessToken` could let a raw filesystem
error, and the private token path it quotes, escape uncaught — which is now wrapped
and covered by I2b), and silently swallowing a refresh failure to return a stale
token (I3 fails, as required).

`run2_github_count_exact` pins reuse to exactly `EXPECTED_RUN2_GITHUB_REUSE_COUNT`
(34, see `RUN3_PREREGISTRATION.md` §2) GitHub rows with distinct
`(work_universe_id, resource_class, artifact number)` identities —
`expectedGithubReuseCount` in `runPreflight` overrides this for tests against
smaller synthetic fixtures; every operator-facing path (the canonical
`p1-2-run3-controller/cli.mjs run3-preflight`) always uses the pinned
constant, re-exported as `EXPECTED_GITHUB_REUSE` from
`../p1-2-run3-controller/protocolConstants.mjs`. `runPreflight` itself is no
longer wired to any CLI command in this directory — see the note at the top
of `cli.mjs`.

## Not built

- Scope introspection for the Gmail token (Gmail has no equivalent of GitHub's
  `x-oauth-scopes` response header). Documented as an operator responsibility above.
- Message enumeration/listing. This module acquires one already-identified message id
  at a time; selection is a separate, metadata-only step (see
  `selection-resolved.private.json` in the P1-2 dataset root).
