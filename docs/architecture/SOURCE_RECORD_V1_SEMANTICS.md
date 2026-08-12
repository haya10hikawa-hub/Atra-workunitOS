# SourceRecordV1 — Ratified Semantic Clarification

Status: Ratified semantic clarification of an already-declared record. Not an authority document.

Subordinate to:

- `docs/architecture/PHASE1_VALUE_GATE_PROGRAM.md` — Product / Roadmap Authority
- `docs/architecture/CANONICAL_WORKUNIT_PIPELINE_REFACTOR_PROGRAM.md` — subordinate Technical / Domain Architecture Authority

## 1. Authority Position

This document records what two already-declared `SourceRecordV1` fields mean. Both decisions
were ratified by the human PM as **clarifications**: they state what the record always had to
mean, and they change no field, no type, no validator behaviour and no runtime value.

```text
B1 (providerObjectKey identity) = B1-A,   change class = CLARIFICATION
B2 (contentDigest integrity)    = B2-P1,  change class = CLARIFICATION
```

What this document is not:

- It is not a Product / Roadmap Authority and it declares no roadmap.
- It is not an implementation authorization. Nothing here authorizes a producer, an adapter, a
  digest computation, a provider call or a persistence path.
- It is not a provider profile. It states the rules a per-provider profile must satisfy; it
  proves no provider's identity or content contract and asserts no provider field.

The clarified semantics live in `app/lib/domain/source/types.ts`. The generic validator at
`app/lib/domain/source/validateSourceRecord.ts` checks shape only, and deliberately does not
check provider nativeness or content provenance: it cannot know a provider's contract. These
semantics are therefore an obligation on whatever later, separately authorized WorkUnit produces
a record — not a property the generic validator can enforce.

P1-1 status is unchanged by this clarification: `PARTIAL`.

## 2. Identity Semantics

`providerObjectKey` is the provider's own native identity for the observed object.

Where a provider's identity is scoped rather than scalar, the key may be an **injective,
reversible, provider-scoped serialization** of provider-issued identity components, under a
reviewed per-provider identity profile. Every component must be:

- provider-issued;
- provider-immutable for the object's lifetime;
- a participant in the provider's own identity.

**Composition does not create identity.** Serializing several provider-issued components is a
representation of identity the provider already assigns. It never manufactures identity from
material the provider does not treat as identity, and there is no Atra-reminted identity: Atra
never mints, derives or substitutes the key.

### Forbidden identity material

None of the following may appear in `providerObjectKey`, alone or as a component:

- URL identity — a URL, permalink or any locator used as identity;
- mutable or display names — repository, channel, calendar or object display names, titles, or
  any other value the provider permits to change;
- Atra-generated ids, and acquisition-generated ids;
- array positions, indexes or ordinals of any kind;
- observation or clock values;
- any other value that is not provider-issued identity material.

### Forbidden transformation

The key is carried byte-for-byte. Normalization of provider identity is forbidden in every form:
no trimming, no case folding, no Unicode normalization, no re-encoding, no canonicalization of
any kind. Two keys that differ by one byte are two distinct sources.

`repository#number` is **not** a ratified GitHub identity profile. No composite shape anywhere in
this repository — including any test fixture — is a ratified profile for any provider.

## 3. Content Digest Semantics

`contentDigest` attests the integrity of the provider's own content for the referenced provider
object, canonicalized under a reviewed per-provider content-scope profile.

For the same provider and the same profile version:

```text
equal digest    = byte-identical canonicalized in-scope provider content
different digest = at least one in-scope provider-content byte differs
```

Any in-scope provider-content change must change the digest. A digest that can stay equal across
an in-scope content change does not satisfy this contract.

### Forbidden digest subjects

The digest must never be computed over an Atra-side representation. Specifically it is not a
digest of:

- a `NormalizedToolSignal`;
- an acquisition envelope, or any other acquisition representation;
- a normalized provider projection;
- `SourceRecord` fields;
- any other Atra-side artifact.

Hashing any of the above and presenting the result as `contentDigest` does not satisfy B2-P1,
however stable or deterministic that hash is.

The Source domain carries the digest and does not compute or verify the content. The digest is
attested by the caller; `validateSourceRecordV1` checks only that it is `sha256:` followed by 64
lowercase hexadecimal characters, and rejects every other shape without folding case.

## 4. Provider Profile Gates

A per-provider identity profile and a per-provider content-scope profile are **required** before
any provider may produce a `SourceRecordV1`. Each gate below is a record of an outstanding
obligation, never a permission:

```text
GitHub issue identity profile              = PROVEN
GitHub identity profile, other resources   = REQUIRED_UNPROVEN
Slack identity profile                     = REQUIRED_UNPROVEN
Google Calendar identity profile           = REQUIRED_UNPROVEN

GitHub issue content-scope profile             = PROVEN
GitHub content-scope profile, other resources  = REQUIRED_UNPROVEN
Slack content-scope profile                    = REQUIRED_UNPROVEN
Google Calendar content-scope profile          = REQUIRED_UNPROVEN
```

`REQUIRED_UNPROVEN` means: the generic semantics in sections 2 and 3 are ratified, and that
provider has not been shown to satisfy them. This document asserts no provider identity field and
no provider content scope for any of them. Establishing either requires external
provider-contract verification against the provider's own published contract, reviewed and
ratified in a separately authorized profile WorkUnit. Until such a WorkUnit lands, a gate moving
out of `REQUIRED_UNPROVEN` is a defect.

The two `PROVEN` gates were closed by exactly such a WorkUnit, against GitHub's own published
contract, and are recorded in `docs/architecture/GITHUB_ISSUE_ACQUISITION_PROFILE.md`. Their scope
is **GitHub issues only**, under the exact profile versions named there. They prove nothing about
GitHub pull requests, comments, reviews, commits or repositories, nothing about Slack or Google
Calendar, and nothing about any other profile version. A gate widening beyond its recorded scope
without a further reviewed profile is the same defect as a gate moving out of
`REQUIRED_UNPROVEN`.

## 5. Acquisition Consequence

```text
ACQUISITION_SCOPE_CHANGE_REQUIRED = YES, except for GitHub issues, where it has been made
```

The current `NormalizedToolSignal` carries neither enough provider-native identity to satisfy
section 2 nor the full provider content required to satisfy section 3. Acquisition scope must
therefore change before a conforming `SourceRecordV1` can be produced.

That consequence is the whole of what is recorded here. This document specifies no acquisition
architecture, no new type, no field, no module and no sequencing beyond it, and does not
authorize the change it names.

A separately authorized WorkUnit has since declared a neutral acquisition-evidence contract at
`app/lib/ports/acquisitionEvidence/types.ts`. That declaration did not satisfy the acquisition
scope change by itself, because a declared contract shape is not a capability.

A further separately authorized WorkUnit has since made that change for one provider resource.
Acquisition now captures provider-native identity and in-scope provider content for GitHub issues,
under the reviewed profiles in `docs/architecture/GITHUB_ISSUE_ACQUISITION_PROFILE.md`, and a
canonical `SourceRecordV1` is produced from a retained real capture. For every other provider and
every other GitHub resource, acquisition scope is unchanged and
`ACQUISITION_SCOPE_CHANGE_REQUIRED` stays `YES`.

## 6. Explicit Non-Goals

This list is the boundary of **this clarification**, stated at the head it was ratified at. It
records what ratifying B1-A and B2-P1 did not by itself authorize. It is not a standing prohibition
on every later WorkUnit: a boundary that a separately authorized WorkUnit later crosses, under its
own review, is crossed by that WorkUnit and not by this document. Section 7 records which of these
have since been crossed and by what.

This clarification does not do, and must not be read as doing, any of the following:

- authorizing or implementing a `SourceRecordV1` producer, adapter, consumer or persistence path;
- authorizing or implementing content canonicalization or digest computation;
- authorizing or implementing any provider profile, provider call or provider credential flow;
- proving any GitHub, Slack or Google Calendar provider contract;
- introducing provider-native id fields or raw provider payload retention;
- introducing acquisition evidence types. This semantic clarification itself did not authorize or
  introduce acquisition evidence types. Such a neutral contract may be declared only by a
  separately authorized WorkUnit, and its existence does not prove any provider identity profile,
  provider content-scope profile, SourceRecord producer, or runtime acquisition path;
- starting P1-2, or introducing `CorrelationGroupV1`, `WorkUnitCandidateV1` or
  `WorkUnitCorrectionV1`;
- expanding the authorized canonical record declaration allowlist;
- marking P1-1 complete. P1-1 remains `PARTIAL`, and the `SourceRecordV1` runtime producer remains
  absent.

## 7. What later WorkUnits have since crossed

Recorded here so section 6 stays readable as the historical boundary it is, without decaying into a
claim about the current tree.

| Section 6 item | Current state |
| --- | --- |
| a `SourceRecordV1` producer, adapter, consumer or persistence path | A **producer and one consumer of it** exist: `app/lib/application/source/sourceRecordProduction.ts` produces the record from an acquisition capture, and it is the only production module that imports `app/lib/domain/source/`. No persistence path exists |
| content canonicalization or digest computation | A digest is computed at `app/lib/infrastructure/external/github/recordedIssueCapture.ts`, over retained provider bytes under the identity canonicalization |
| any provider profile, provider call or provider credential flow | Two GitHub **issue** profiles are proven. No provider call and no credential flow exists in `app/**`: acquisition reads a retained capture and never the network |
| proving any GitHub, Slack or Google Calendar provider contract | GitHub's issue identity and content contracts are proven, for issues only. Slack and Google Calendar remain unproven |
| raw provider payload retention | Retention exists, inline and immutable, under `acquisitions/` |
| expanding the canonical record declaration allowlist | Unchanged. No new canonical record was declared |
| starting P1-2, or `CorrelationGroupV1` / `WorkUnitCandidateV1` / `WorkUnitCorrectionV1` | Unchanged. None exists |
| marking P1-1 complete | Unchanged. **P1-1 remains `PARTIAL`** — one provider resource, one acquisition mode, no persistence and no consumer beyond production |
