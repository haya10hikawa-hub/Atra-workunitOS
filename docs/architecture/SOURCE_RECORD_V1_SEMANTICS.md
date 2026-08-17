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
GitHub issue identity profile              = PHASE1_SCOPED_ACCEPTED_WITH_UNPROVEN_RESIDUAL
GitHub pull request identity profile       = PHASE1_SCOPED_ACCEPTED_WITH_UNPROVEN_RESIDUAL
GitHub identity profile, other resources   = REQUIRED_UNPROVEN
Slack identity profile                     = REQUIRED_UNPROVEN
Google Calendar identity profile           = REQUIRED_UNPROVEN

GitHub issue content-scope profile             = PROVEN
GitHub pull request content-scope profile      = PROVEN
GitHub content-scope profile, other resources  = REQUIRED_UNPROVEN
Slack content-scope profile                    = REQUIRED_UNPROVEN
Google Calendar content-scope profile          = REQUIRED_UNPROVEN
```

`other resources` means every GitHub resource except issues and pull requests — comments, reviews,
commits, repositories and the rest. Two reviewed resources do not make a third one reviewed, and the
gate above is the record of that.

`REQUIRED_UNPROVEN` means: the generic semantics in sections 2 and 3 are ratified, and that
provider has not been shown to satisfy them. This document asserts no provider identity field and
no provider content scope for any of them. Establishing either requires external
provider-contract verification against the provider's own published contract, reviewed and
ratified in a separately authorized profile WorkUnit. Until such a WorkUnit lands, a gate moving
out of `REQUIRED_UNPROVEN` is a defect.

The two issue gates are recorded in `docs/architecture/GITHUB_ISSUE_ACQUISITION_PROFILE.md`, and their
scope is **GitHub issues only**, under the exact profile versions named there. The two pull request
gates are recorded in `docs/architecture/GITHUB_PULL_REQUEST_ACQUISITION_PROFILE.md`, and their scope
is **GitHub pull requests only**. Neither document says anything about the other's resource: they are
siblings, and the second was reviewed on its own evidence rather than admitted on the first's
precedent. Together they say nothing about GitHub comments, reviews, commits or repositories, nothing
about Slack or Google Calendar, and nothing about any other profile version. A gate widening beyond
its recorded scope without a further reviewed profile is the same defect as a gate moving out of
`REQUIRED_UNPROVEN`.

Within each resource the two gates did not move to the same state, and the difference is
load-bearing. The content-scope gates are `PROVEN`. The identity gates are **not proven** and read
`PHASE1_SCOPED_ACCEPTED_WITH_UNPROVEN_RESIDUAL`, which is the scoped exception recorded in §4.1 for
issues and in §4.2 for pull requests.

There are now two exceptions of that kind, and each required its own ratified decision. A third
requires a third; none of them is a template the next resource may fill in.

### 4.1 Scoped exception — GitHub Issue, identity profile v1, Phase-1 only

This was the first exception of its kind in this document, and each further one requires a further
ratified decision. §4.2 records the second.

```text
scope       GitHub Issues only, profile github.issue.rest.database-primary-key v1,
            Phase-1 bounded experimental use only
state       PHASE1_SCOPED_ACCEPTED_WITH_UNPROVEN_RESIDUAL
```

**What is not proven.** Section 2 requires every identity component to be provider-immutable for
the object's lifetime, and a per-provider profile to establish that from provider authority. For
the GitHub issue identifier, that requirement is **not** met. Five requirements stay unproven, and
they are stated in full in the profile document:

```text
R1  REST issue `id` lifetime immutability
R2  non-reuse of a REST issue `id` after deletion
R3  persistence of a REST issue `id` across repository transfer
R4  provider-backed collision guarantee for github.com/rest/issues
R5  normative REST `id` = GraphQL `databaseId` equivalence
```

**Who accepted it.** The human PM reviewed R1–R5 and accepted the residual explicitly, as a product
decision to proceed at Phase 1 while knowing what is not known. Acceptance is not evidence: it
discharges none of R1–R5, and none of them may be rewritten as proven on its strength.

**What it is not.** It is not a lifetime-immutability proof, a non-reuse proof, a production
identity certification, an authorization for any other GitHub resource, an authorization for live
provider reads, or a precedent any second provider or profile may claim.

**Expiration and revisit.** The exception expires when Phase-1 bounded experimental use ends, and
is reopened before then by: persisting, correlating or deduplicating on `providerObjectKey` beyond
Phase-1 experimental use; a second GitHub resource or a second provider seeking the same treatment;
an identity profile version bump; or GitHub publishing authority that closes any of R1–R5. Closing
a residual requires provider authority reviewed in a separately authorized WorkUnit.

**What is unchanged.** The generic semantics in sections 2 and 3 are untouched by this exception.
The lifetime-immutability requirement in section 2 remains the rule for every provider, including
every future GitHub resource; a second exception requires its own ratified decision recorded here.
Every gate still reading `REQUIRED_UNPROVEN` is unaffected, and the GitHub issue content-scope gate
stays `PROVEN` — the residuals are statements about identity and touch no digest.

**This exception was reopened, reviewed and left standing.** Its revisit condition names "a second
GitHub resource … seeking the same treatment", and that happened: the GitHub resource namespace split
brought pull requests forward as a second canonical resource. The human PM reviewed the reopened
exception and left it in force, unchanged and un-widened, under decision token
`ATRA_PM_P1_1_GITHUB_RESOURCE_NAMESPACE_SPLIT_ACCEPTED`. R1–R5 were not discharged, not re-argued and
not narrowed. Pull requests did **not** enter under this exception; they carry their own, in §4.2.

**What the split did and did not change here.** It changed Atra's outer canonical identity namespace
for issue records from the generic `github` to the resource-scoped `github_issue`. It did **not**
change this profile: the provider-native identity is still the issue resource's REST `id`, the
provider namespace is still `github.com/rest/issues`, and neither profile version moved. No version
bump was required, because nothing this profile asserts about GitHub changed — see §4.3.

### 4.2 Scoped exception — GitHub Pull Request, identity profile v1, Phase-1 only

The second exception of its kind, ratified separately from §4.1 and resting on its own review.

```text
scope       GitHub Pull Requests only, profile github.pull-request.rest.database-primary-key v1,
            Phase-1 bounded experimental use only
state       PHASE1_SCOPED_ACCEPTED_WITH_UNPROVEN_RESIDUAL
```

**What is not proven.** Section 2 requires every identity component to be provider-immutable for the
object's lifetime, and a per-provider profile to establish that from provider authority. For the
GitHub pull request identifier, that requirement is **not** met. Five requirements stay unproven, and
they are stated in full in `docs/architecture/GITHUB_PULL_REQUEST_ACQUISITION_PROFILE.md`:

```text
P-R1  REST pull request `id` lifetime immutability
P-R2  non-reuse of a REST pull request `id` after deletion
P-R3  persistence of a REST pull request `id` across repository transfer
P-R4  provider-backed collision guarantee for github.com/rest/pulls
P-R5  normative REST `id` = GraphQL `databaseId` equivalence
```

**Who accepted it.** The human PM reviewed P-R1–P-R5 and accepted the residual explicitly, as a
product decision to proceed at Phase 1 while knowing what is not known, under decision token
`ATRA_PM_P1_1_GITHUB_RESOURCE_NAMESPACE_SPLIT_ACCEPTED`. Acceptance is not evidence: it discharges
none of P-R1–P-R5, and none of them may be rewritten as proven on its strength.

**It did not inherit §4.1.** The issue exception explicitly grants nothing to any other GitHub
resource and is no precedent. This exception was reviewed on the pull request resource's own terms,
and it is weaker in one respect that is recorded rather than smoothed over: no GraphQL introspection
was performed for this type, so P-R5 here is not merely unproven but unobserved.

**What it is not.** It is not a lifetime-immutability proof, a non-reuse proof, a production identity
certification, an authorization for any third GitHub resource, an authorization for live provider
reads, or a precedent any further provider or profile may claim.

**Expiration and revisit.** The exception expires when Phase-1 bounded experimental use ends, and is
reopened before then by: persisting, correlating or deduplicating on `providerObjectKey` beyond
Phase-1 experimental use; a third GitHub resource or a second provider seeking the same treatment; an
identity profile version bump; or GitHub publishing authority that closes any of P-R1–P-R5. Closing a
residual requires provider authority reviewed in a separately authorized WorkUnit.

### 4.3 Canonical identity namespaces are per resource, not per provider

Ratified as part of the same decision, and recorded here because it governs the record and not any
one provider profile.

**The decision.** GitHub issues and GitHub pull requests occupy **distinct canonical identity
namespaces**, spelled `github_issue` and `github_pull_request`. The single `"github"` canonical
identity namespace is **rejected** and is not a member of the record's namespace vocabulary at all: a
record cannot fall back to it, and a producer cannot bind a reviewed GitHub resource to it.

**Why.** GitHub draws an object's REST `id` from a different table per resource, and the two acquired
objects show numeric ranges that overlap. Under one namespace, an issue key and a pull request key
that happen to be numerically equal would become one canonical identity — a false merge manufactured
by Atra's vocabulary, not by anything the provider stated. Identity is exactly
`(tenantId, provider, providerObjectKey)`, so the only place that resource distinction can live is
the namespace component.

There is a second reason, and it is about measurement rather than correctness. P1-2 exists to measure
correlation error. A canonical identity error that merges two unrelated sources would arrive at that
experiment disguised as a correlation result, and no analysis downstream could separate the two. The
namespace must be right *before* correlation is attempted, or the experiment cannot be interpreted.

**What was not introduced.** No generalized namespace model. `SourceRecordV1` gains no
`providerNamespace` field and no fourth identity component; the record's field set, order and
optionality are unchanged, and identity remains exactly the three values above. The namespace
vocabulary is a closed union, and the only members that are resource-scoped are the two that a
reviewed profile actually covers. Members for providers with no ratified profile stay provider-level
and are unreachable by any producer — they are resolved by the WorkUnit that reviews that provider,
not by analogy with GitHub.

**Revisit trigger.** The generalized namespace model is reconsidered at the earlier of: a third
canonical GitHub resource becoming necessary, or canonical persistence beginning. Until one of those
happens, adding a namespace field is out of scope, and a WorkUnit that finds it necessary must stop
and obtain a decision rather than introduce it.

**Observation never upgrades authority.** Identifier stability — of a REST `id`, an ordinal, or any
other provider member — may be measured at Phase 1 as a **non-canonical observation**, and both
profile documents record such observations. `OBSERVED_STABILITY` is not `PROVIDER_PROOF`. No number of
consistent observations closes a residual, and no provider-specific observation field may be added to
`SourceRecordV1` to hold one.

## 5. Acquisition Consequence

```text
ACQUISITION_SCOPE_CHANGE_REQUIRED = YES, except for GitHub issues and GitHub pull requests,
                                    where it has been made
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

Further separately authorized WorkUnits have since made that change for two provider resources.
Acquisition now captures provider-native identity and in-scope provider content for GitHub issues,
under the reviewed profiles in `docs/architecture/GITHUB_ISSUE_ACQUISITION_PROFILE.md`, and for GitHub
pull requests, under the reviewed profiles in
`docs/architecture/GITHUB_PULL_REQUEST_ACQUISITION_PROFILE.md`. A canonical `SourceRecordV1` is
produced from a retained real capture of each, in two distinct canonical identity namespaces. Each
resource has its own acquisition module: acquisition was extended by review, not generalized into a
provider plugin surface a caller could parameterize. For every other provider and every remaining
GitHub resource, acquisition scope is unchanged and `ACQUISITION_SCOPE_CHANGE_REQUIRED` stays `YES`.

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
| content canonicalization or digest computation | A digest is computed at `app/lib/infrastructure/external/github/recordedIssueCapture.ts` and at `app/lib/infrastructure/external/github/recordedPullRequestCapture.ts`, over retained provider bytes under the identity canonicalization |
| any provider profile, provider call or provider credential flow | Four GitHub profiles are reviewed and in use, two per resource: for **issues** and for **pull requests**, content-scope is proven and identity carries a scoped exception — §4.1 and §4.2 respectively. No provider call and no credential flow exists in `app/**`: acquisition reads a retained capture and never the network |
| proving any GitHub, Slack or Google Calendar provider contract | GitHub's **content** contract is proven for issues and for pull requests. GitHub's **identity** contract is **not** proven for either — issues are accepted under §4.1 with R1–R5 unproven, pull requests under §4.2 with P-R1–P-R5 unproven. Slack and Google Calendar remain unproven |
| raw provider payload retention | Retention exists, inline and immutable, under `acquisitions/` |
| expanding the canonical record declaration allowlist | Unchanged. No new canonical record was declared. The record's `provider` field changed type — from the application `SourceType` to the canonical `SourceIdentityNamespace` — under §4.3; the field set, order, optionality and identity tuple are unchanged, and no field was added |
| starting P1-2, or `CorrelationGroupV1` / `WorkUnitCandidateV1` / `WorkUnitCorrectionV1` | Unchanged. None exists |
| marking P1-1 complete | Unchanged. **P1-1 remains `PARTIAL`** — two provider resources of one provider, one acquisition mode, no persistence and no consumer beyond production |
