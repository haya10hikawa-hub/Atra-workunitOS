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

Offline and read-only: it reads one archive, runs the same production modules the test suite runs,
prints the provenance, and writes nothing.

## Current contents

| Archive | Provider object | Profile |
| --- | --- | --- |
| `github/issue-4968607486.capture.json` | GitHub issue, database primary key `4968607486` — `haya10hikawa-hub/Atra-workunitOS` issue 207, a real project-planning issue that predates this slice | `docs/architecture/GITHUB_ISSUE_ACQUISITION_PROFILE.md` |
