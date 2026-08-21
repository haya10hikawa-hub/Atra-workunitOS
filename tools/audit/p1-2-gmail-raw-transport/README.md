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

```bash
export ATRA_P1_2_GMAIL_TOKEN=<gmail.readonly-scoped OAuth access token>
```

Provision a token scoped to `https://www.googleapis.com/auth/gmail.readonly` (or
narrower, if a profile ever needs less than RAW). This module cannot verify the
token's granted scope itself — Gmail's API does not echo scopes on a response the way
GitHub's does — so the read-only guarantee here is operator-provisioned, not
code-enforced. Do not reuse a send-capable token (e.g. the runtime's
`GMAIL_ACCESS_TOKEN`, which has `gmail.send`); this transport intentionally reads a
separate environment variable so the two credentials are never the same value.

```bash
node tools/audit/p1-2-gmail-raw-transport/cli.mjs auth-check

node tools/audit/p1-2-gmail-raw-transport/cli.mjs acquire \
  --message-id <gmail message id> \
  --root /secure/local/p1-2-dataset/sources/gmail \
  --dest /secure/local/p1-2-dataset/sources/gmail/<message-id>.eml
```

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

## Validation

`tests/p1_2GmailRawTransport.test.mts`, synthetic fixtures and mocked `fetch` only, no
real network call:

- **A** ordinary / all-zero / arbitrary-binary / large (8MB) synthetic payloads persist
  byte-identical; base64url round-trips exactly
- **B** the exact Run-2 shape — a single flipped byte at a mid-file offset with length
  preserved — is detected by `verifyByteFidelity`; a truncated write is also detected;
  the unmodified CLI acquire path is proven `byte_equal: true` end to end
- **C** an existing destination is never overwritten; a destination outside the
  authorized root (including a path-traversal attempt) is refused before any fetch
- **D** a missing or malformed credential fails closed with a stable code; the token
  never appears in CLI stdout/stderr or in a thrown error's message
- **E** every request is `GET` to the pinned origin with `format=raw`; a response
  missing the `raw` field fails closed
- **F** `auth-check` reports `available` without ever returning profile body fields,
  fails closed with a stable code on 401, and makes no network call when no
  credential is configured

20/20 pass. Two hand-written mutations were replayed to confirm the suite actually
exercises the properties above rather than passing vacuously: forcing
`byteEqual: true` unconditionally (B1/B2 fail, as required), and removing the root
containment check (C2/C3 fail, as required).

## Not built

- Scope introspection for the Gmail token (Gmail has no equivalent of GitHub's
  `x-oauth-scopes` response header). Documented as an operator responsibility above.
- Message enumeration/listing. This module acquires one already-identified message id
  at a time; selection is a separate, metadata-only step (see
  `selection-resolved.private.json` in the P1-2 dataset root).
