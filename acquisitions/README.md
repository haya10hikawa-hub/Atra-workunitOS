# Retained Acquisition Captures

This directory holds **verbatim provider exports**, retained with the capture facts needed to read
them. It is a retention store, not a fixture directory, and the difference is not a naming
convention:

- a fixture is authored by us to make a test pass;
- a capture here is the provider's own response bytes from one real read of one real provider
  object, kept exactly as received.

Nothing in here is hand-written content. The `bytesBase64` member of each archive is a lossless
encoding of the provider's response body; base64 is transport, not normalization.

## Rules

- **Immutable and append-only.** A retained capture is never edited, re-serialized, reformatted,
  pretty-printed or redacted. Correcting a capture means taking a new one.
- **No re-fetch.** Verifying a capture re-reads these bytes. Re-requesting the object from the
  provider is a new observation of a possibly-changed object and is not verification.
- **Evidence is derived, not declared.** The archive states only what the provider cannot: which
  capture this was, its tenant partition, its acquisition mode, and when Atra observed it. The
  provider object's identity, its content digest and its provider-stated event time are computed
  from the retained bytes by the provider profile, so the archive cannot assert them.

## Archive shape

```jsonc
{
  "archiveVersion": "1",
  "captureId": "…",              // acquisition-minted; never provider identity
  "tenantPartition": "…",        // partition, never permission
  "acquisitionMode": "HUMAN_TRIGGERED_PROVIDER_EXPORT",
  "observedAt": "…Z",            // when Atra actually observed the provider state
  "capturedFrom": {              // human-readable provenance; only `requestMethod` is enforced
    "requestMethod": "GET",      // read-only, checked — never re-issued by any code path
    "requestUrl": "…",
    "providerApiVersion": "…",
    "acceptHeader": "…"
  },
  "retainedContent": { "retention": "INLINE_BYTES", "bytesBase64": "…" }
}
```

`capturedFrom.requestUrl` is provenance for a reader. It is never an identity, never a digest
subject, and no code follows it.

## Reading a capture

```bash
npm run source:acquire-recorded
```

Offline and read-only: it reads each archive, runs the same production modules the test suite runs,
prints the provenance, and writes nothing. Pass a resource name (`issue`, `pull-request`) to inspect
one, and optionally an archive path after it. The resource is chosen by the operator and is never
sniffed from the archive — `capturedFrom.requestUrl` is provenance for a reader and is not parsed for
a decision.

## Current contents

| Archive | Provider object | Profile |
| --- | --- | --- |
| `github/issue-4968607486.capture.json` | GitHub issue, database primary key `4968607486` — `haya10hikawa-hub/Atra-workunitOS` issue 207, a real project-planning issue that predates this slice | `docs/architecture/GITHUB_ISSUE_ACQUISITION_PROFILE.md` |
| `github/pull-request-4258276579.capture.json` | GitHub pull request, database primary key `4258276579` — `haya10hikawa-hub/Atra-workunitOS` pull request 229, a real merged pull request that predates the slice that reads it | `docs/architecture/GITHUB_PULL_REQUEST_ACQUISITION_PROFILE.md` |

The two are **different provider resources**, not two captures of one. Their REST identifiers come
from different provider tables and their observed values overlap in range, so they are read by
different acquisition modules and produce records in different canonical identity namespaces
(`github_issue` and `github_pull_request`).

An archive read under the wrong resource's module is refused, never reinterpreted. That refusal is
enforced on the **retained bytes** and never on the envelope. Each module checks that the payload
carries — or does not carry — pull request structure, and fails closed otherwise. Without that check
the canonical namespace would be asserted by whichever module the operator happened to call, which is
the one part of canonical identity the retained bytes cannot state for themselves.

The guard does not depend on the envelope being indistinguishable, and it would be a byte-level check
either way. It is worth being exact about what the envelope does and does not carry, because an
earlier revision of this file overstated it: the two archives are **not** byte-identical in
`capturedFrom`. Their `requestUrl` members differ (`…/issues/207` versus `…/pulls/229`). What is
identical is every enforced member — `requestMethod`, `acceptHeader` and `providerApiVersion` — and
`requestUrl` is unenforced provenance that no code path parses for a decision. So nothing acquisition
*acts on* in `capturedFrom` distinguishes the two archives, and a reader must not treat the differing
URL as the resource discriminator.

The two retained streams are also formatted differently — the pull request response is pretty-printed
and the issue response is compact. Neither was touched. That difference is the provider's, it is
inside the digest scope for each, and it is the clearest available illustration of why the digest is
taken over the retained bytes rather than over a reserialization of them.
