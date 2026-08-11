# Acquisition Evidence Contract — revised neutral declaration

Status: Neutral contract declaration. Not an authority document, not an implementation
authorization, not a provider profile.

Subordinate to:

- `docs/architecture/PHASE1_VALUE_GATE_PROGRAM.md` — Product / Roadmap Authority
- `docs/architecture/SOURCE_RECORD_V1_SEMANTICS.md` — ratified `SourceRecordV1` semantics

The contract itself is `app/lib/ports/acquisitionEvidence/types.ts`. That module's own comments
carry the per-field reasoning; this document records what the contract is *for*, which capability
each declaration serves, and what was deliberately left out.

## 1. Why the first declaration was revised

The first version declared `AcquisitionEvidence` as four attested strings — `providerObjectKey`,
`observedAt`, `sourceEventAt`, `contentDigest` — and `AcquiredSignalObservation` as that record
paired with a `NormalizedToolSignal`.

It carried four attestations and nothing that made any of them checkable. The decisive case is
`contentDigest`: no digest subject was retained anywhere in the contract, so a conforming value was
indistinguishable from a hash of the `NormalizedToolSignal` in the same envelope — which is both a
forbidden subject under B2-P1 and the only material actually present to hash. B2-P1's operative
clause, "any in-scope provider-content change must change the digest", was untestable rather than
merely unenforced.

The pairing had two further consequences. The projection became the most available source of
provider identity, and `NormalizedToolProvider` (`github | slack | calendar`) the most available
provider namespace — but that vocabulary is an Atra projection with its own spelling, and mapping it
onto a provider namespace is provider relabelling. And tenancy was reachable only as
`NormalizedToolSignal.tenantId: string`, deliberately unbranded because every mapper copies it
through unvalidated.

The revision therefore removes both types and keeps no dependency on `NormalizedToolSignal`.
`NormalizedToolSignal` is itself unchanged.

## 2. Capability mapping

Each capability below is expressed by exactly the declarations named.

```text
C1 CAPTURE_EVENT              AcquisitionCaptureId (branded)
                              AcquisitionCapture.kind = "CAPTURE"
                              AcquisitionCapture.captureId

C2 RETAINED_PROVIDER_CONTENT  RetainedProviderContent (closed 2-arm union)
                              AcquisitionCapture.retainedContent (required)

C3 CONTENT_SCOPE_BINDING      ContentScopeBinding
                              AcquisitionCapture.contentScope (required)

C4 IDENTITY_PROVENANCE        ProviderIdentityProvenance
                              AcquisitionCapture.identity (required)

C5 TIME_PROVENANCE            AcquisitionCapture.observedAt
                              AcquisitionCapture.sourceEventAt
                              recordedAt — absent by contract
                              AcquisitionCaptureReplay carries no observedAt

C6 ACQUISITION_MODE_EVIDENCE  AcquisitionMode (closed 3-member union)
                              AcquisitionCapture.acquisitionMode (required)

C7 REPLAY_PROVENANCE          AcquisitionCapture vs AcquisitionCaptureReplay,
                              disjoint kind literals
                              AcquisitionEvidence (closed union of the two)

C8 TENANT_PARTITION_EVIDENCE  AcquisitionTenantPartition (branded)
                              AcquisitionCapture.tenantPartition (required)
```

## 3. The separations the shape enforces

```text
SOURCE_IDENTITY        != CAPTURE_IDENTITY
CAPTURE                != REPLAY
RAW_PROVIDER_CONTENT   != ATRA_PROJECTION
CONTENT_DIGEST         != RAW_CONTENT
ACQUISITION_EVIDENCE   != SOURCE_RECORD
```

Two of these are enforced by branding rather than by comment. `AcquisitionCaptureId` and
`AcquisitionTenantPartition` are branded strings, so a source identity cannot be used as a capture
identity and an unvalidated projection string cannot be used as a tenant partition. Branding blocks
the dangerous direction — plain `string` into the branded slot — and not its converse; a cast still
defeats it. It is a declaration, not a validator.

`CAPTURE != REPLAY` is enforced by disjoint `kind` literals, which make the two types mutually
unassignable. Without them a capture would be assignable wherever a replay is expected, since a
capture has every field a replay has.

`CONTENT_DIGEST != RAW_CONTENT` is enforced by the two digests having distinct subjects and distinct
names: `contentDigest` attests the canonicalized in-scope portion selected by a content-scope
profile, `retainedContentDigest` attests the whole retained raw byte stream.

## 4. What was deliberately excluded

Rejected as convenience, speculation or as belonging to another owner:

- **`recordedAt`** — not acquisition-owned. Recording is a later producer's act.
- **`replayedAt` on a replay** — a replay creates no new observation, so it states no new instant.
  Its absence is what makes "no new observation" structural rather than advisory.
- **A raw digest on the inline retention arm** — derivable from bytes that are present.
- **An `encoding` member on the inline arm** — the encoding is in the field name, `bytesBase64`.
- **A provider vocabulary for `providerNamespace`** — enumerating providers is provider selection,
  which this contract may not make.
- **A `LIVE_PROVIDER` acquisition mode** — deferred and unauthorized. Its absence from the closed
  `AcquisitionMode` union means authorizing it is a visible contract change.
- **A `FIXTURE` acquisition mode** — a hand-authored payload is never a capture.
- **Any evaluation metadata** — dataset identity, gold labels, hard-negative marks, train/test
  split, correlation results and WorkUnit candidate identity are separate from runtime source
  evidence and never reachable from it.
- **Any `SourceRecordV1` pointer** — capture to record is a one-directional join from the capture
  side. `SourceRecordV1` is unchanged, and `declaredSourceRef` is not repurposed as a capture
  pointer.

## 5. Known residual, recorded not fixed

`sourceEventAt: string | null` cannot separate "the provider stated no event time" from "acquisition
never examined one". The ratified capability specifies exactly `string | null`, so this contract
declares exactly that. Closing the gap would need a provenance discriminant on the field and is a
separate ratified decision, not a change this declaration may make on its own.

## 6. What this contract does not do

- It authorizes and implements no producer, adapter, consumer or persistence path.
- It authorizes and implements no retention store, canonicalization or hashing.
- It authorizes and implements no provider profile, provider call or credential flow.
- It proves no GitHub, Slack or Google Calendar provider contract. All six identity and
  content-scope gates stay `REQUIRED_UNPROVEN`.
- It does not prove provider authenticity, and no test of it can. A structural lookalike remains a
  lookalike; conformance is established by reviewed profiles, not by field shape.
- It does not satisfy the acquisition scope change. `ACQUISITION_SCOPE_CHANGE_REQUIRED = YES`.
- It does not start P1-2, and introduces no `CorrelationGroupV1`, `WorkUnitCandidateV1` or
  `WorkUnitCorrectionV1`.
- It does not mark P1-1 complete. P1-1 remains `PARTIAL`, and the `SourceRecordV1` runtime producer
  remains absent.
