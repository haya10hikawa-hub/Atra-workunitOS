# GitHub Pull Request — Identity and Content-Scope Profile

Status: Reviewed per-provider profile. Scope: **GitHub pull requests only**.

Subordinate to:

- `docs/architecture/PHASE1_VALUE_GATE_PROGRAM.md` — Product / Roadmap Authority
- `docs/architecture/SOURCE_RECORD_V1_SEMANTICS.md` — the generic B1-A / B2-P1 semantics this profile must satisfy

This document addresses two of the provider profile gates named in `SOURCE_RECORD_V1_SEMANTICS.md`
§4, for one provider and one resource type. It proves nothing about Slack, about Google Calendar, or
about GitHub comments, reviews, commits or repositories. Those gates stay `REQUIRED_UNPROVEN`.

It is a **sibling** of `docs/architecture/GITHUB_ISSUE_ACQUISITION_PROFILE.md`, not a descendant of
it. The issue profile's Phase-1 acceptance granted nothing to this resource and is not cited as
precedent here — that document says so explicitly, and this one is a separate reviewed decision with
its own residuals and its own acceptance.

The two gates did not move to the same state, and this document does not pretend they did. The
content-scope gate is proven. The identity gate is **not** proven: the human PM accepted it for
Phase-1 bounded experimental use with named requirements left unproven, and §2.1 records those
residuals rather than arguing them away.

```text
GitHub PULL REQUEST identity profile      = PHASE1_SCOPED_ACCEPTED_WITH_UNPROVEN_RESIDUAL,
                                            github.pull-request.rest.database-primary-key v1
GitHub PULL REQUEST content-scope profile = PROVEN, github.pull-request.rest.retained-response-body v1
```

## 1. Provider authority used, and not used

Stating this precisely matters more here than anywhere else in the document, because the identity
half rests on an acceptance rather than on evidence.

Used:

- The provider's own response bytes for the acquired object, retained verbatim by the capture. Every
  claim below marked *byte-backed* is checkable by any reviewer holding those bytes, offline.
- GitHub's REST API reference for the pull request resource, `docs.github.com/en/rest/pulls/pulls`,
  and its global node ID migration documentation,
  `docs.github.com/en/graphql/guides/migrating-graphql-global-node-ids`.

**Not used, and deliberately so.** No new provider-contract verification was performed for this
resource. In particular, this profile did **not** introspect GitHub's GraphQL schema for the
`PullRequest` type, and it does not carry over the introspection the issue profile performed against
the `Issue` type: those are different types, and a result about one is not a result about the other.

That absence is the whole reason §2.1 exists. Every requirement that would need provider authority to
close is recorded there as unproven, and the profile proceeds on an explicit PM acceptance instead of
on an argument that the missing authority did not matter.

## 2. Identity profile — `github.pull-request.rest.database-primary-key` v1

```text
providerNamespace  github.com/rest/pulls
providerObjectKey  the exact decimal digits of the pull request resource's `id`
```

`providerNamespace` is **not** `github.com/rest/issues`. GitHub addresses the two resources at
different paths and returns different `id` values for them, so a shared namespace would be Atra
asserting an equivalence GitHub does not make. See §5.

Against the requirements the semantics place on identity material, the honest reading is:

| Requirement | Status | Basis |
| --- | --- | --- |
| provider-issued | **PROVEN** | It is a member of GitHub's own representation of the resource, present in the retained response bytes. Atra neither mints, derives nor substitutes it. *Byte-backed* |
| identity-participating | **accepted at the Phase-1 level** | GitHub names the corresponding value the primary key from the database for its resources, and addresses the object's own REST representation by it. This profile performed no introspection of the `PullRequest` type, so this is accepted rather than recorded as proven |
| lifetime-immutable | **UNPROVEN** | GitHub publishes no lifetime-immutability commitment for a pull request `id`. Residual **P-R1** |
| collision-safe in namespace | **UNPROVEN** | GitHub publishes no uniqueness or non-reuse guarantee for `github.com/rest/pulls` to consumers. Residuals **P-R2** and **P-R4** |

### Why not `number` — byte-backed

`number` is repository-scoped, and for this resource it is worse than that: GitHub **shares one
ordinal space between a repository's issues and its pull requests**. The retained bytes say so in the
provider's own words. The acquired object carries both of these members:

```text
url        https://api.github.com/repos/haya10hikawa-hub/Atra-workunitOS/pulls/229
issue_url  https://api.github.com/repos/haya10hikawa-hub/Atra-workunitOS/issues/229
```

The provider itself states that ordinal 229 is addressable under **both** resources in this
repository. A key built on `number` would therefore not distinguish a pull request from an issue even
inside a single repository, before any cross-repository concern arises. It is excluded, and excluded
on the provider's own statement rather than on an inference.

`repository#number` remains what the semantics say it is: **not** a ratified GitHub identity profile.
Nothing here revives it.

### Why not `node_id`

GitHub documents that global node IDs have already changed: the legacy format "will be closing down
and replaced with a new format", and GitHub's guidance is that consumers "should migrate [their]
service to treat these IDs as opaque strings". A value the provider has re-issued once, in a
documented migration, cannot be asserted as lifetime-immutable identity material.

The contrast is narrower than it looks, and stating it precisely matters: `node_id` is **known to
have changed**, while `id` is **not known either way** (P-R1). Choosing `id` avoids a demonstrated
re-issue; it does not acquire a guarantee `node_id` lacks.

The retained bytes show the node ID for this object carries a `PR_` prefix where the acquired issue's
carries `I_`. That is an observation about an encoding GitHub tells consumers to treat as opaque. It
is recorded in §6 as an observation and is **not** part of this profile: no Atra code decodes,
compares or reads a node ID, and it never participates in identity.

### Forbidden material, explicitly absent

No URL, permalink, `html_url`, `issue_url`, `merge_commit_sha`, head or base ref name, display name,
repository name, login, title, array position, index, observation instant or Atra-generated value
participates in `providerObjectKey`. The key is carried byte-for-byte from the provider's digits: not
trimmed, not case-folded, not re-encoded, not padded.

`merge_commit_sha` deserves its own mention because it is the most tempting wrong answer available in
this payload: it is provider-issued, stable-looking and unique. It identifies a **commit**, not the
pull request, it is absent for an unmerged pull request, and it changes as the branch moves. It is
not identity for this resource.

### The resource is bound to the bytes — PROVEN, fail-closed

Everything above is *derived* from the retained bytes. The canonical identity namespace a record
lands in is not: it follows from which acquisition module ran, and that is the operator's choice. Left
unchecked, that would make half of canonical identity — `provider`, one of the three identity
components — an operator assertion rather than evidence. Handing an issue export to this module would
mint the issue's own primary key into the pull request namespace, and the resulting record would look
perfectly well-formed to any later reader.

So the resource is **bound** to the bytes. Acquisition refuses a retained payload that does not carry
pull request structure (`provider_resource_mismatch`), and the issue module refuses the mirror case.

```text
check     the retained payload carries both `head` and `base` as objects
rationale a pull request proposes merging one ref into another; the pulls representation
          carries both and the issues representation carries neither
verified  in both retained captures, in this repository, offline
```

`head` and `base` are used because they are **definitional** of the resource rather than incidental
members that happened to be present on the day of capture. The guard is stated as structure the other
reviewed resource does not have, which is why it needs no claim about which members GitHub guarantees
on every pull request — a claim this profile has no authority to make.

**Bound, not derived, and the distinction is kept deliberately.** This guard establishes that the
retained payload is not the other reviewed resource. It does not establish that the payload came from
GitHub, that it is a pull request at all, or that some third resource could not satisfy it. It closes
a specific, demonstrated relabelling path; it is not a provider proof and adds nothing to §2.1.

### Representability — PROVEN, fail-closed

`id` is parsed from JSON as a number. A value outside the exactly-representable integer range would be
rounded by any JSON parser, so the digits produced would not be GitHub's. Acquisition refuses such a
value (`provider_identity_unrepresentable`) rather than emitting an approximation, and refuses a
non-integer or non-positive value on the same path.

This one is proven, and it is proven the only way a property of this kind can be: the failing case
refuses. The refusal is a code path in the acquisition module, not a claim about GitHub.

## 2.1 Unproven residuals, and the acceptance that stands over them

The identity profile is used at Phase 1 with the following requirements **not proven**. They are
listed so that no later reader has to reconstruct what was known; none of them may be rewritten as
proven without new provider authority.

```text
P-R1  REST pull request `id` lifetime immutability ......................... UNPROVEN
P-R2  non-reuse of a REST pull request `id` after deletion ................. UNPROVEN
P-R3  persistence of a REST pull request `id` across repository transfer ... UNPROVEN
P-R4  provider-backed collision guarantee for github.com/rest/pulls ........ UNPROVEN
P-R5  normative REST `id` = GraphQL `databaseId` equivalence ............... UNPROVEN
```

What each one means, and why observation does not close it:

- **P-R1 — lifetime immutability.** GitHub publishes no statement that a pull request's `id` will not
  change. A schema description of what the value *is* today is not a commitment about what it remains.
- **P-R2 — non-reuse after deletion.** Nothing published says a freed identifier is never assigned to
  a later object, so a key seen once is not guaranteed to still denote the same object.
- **P-R3 — repository transfer.** Pull requests move with a transferred repository, and GitHub
  publishes no statement about whether the `id` survives that move unchanged.
- **P-R4 — collision guarantee.** Uniqueness within GitHub's own table is an inference about their
  storage. It is not a guarantee GitHub extends to consumers of `github.com/rest/pulls`, and this
  profile relies on it, so it is recorded as relied-upon and unproven rather than as proven.
- **P-R5 — surface equivalence.** This profile performed no GraphQL introspection for this type, so
  it does not even have the single matching observation the issue profile had. It is unproven and
  unobserved.

### There is no sixth residual, and that is not a promotion

An earlier framing of this work carried a further residual about a **cross-resource** collision:
GitHub issue and pull request identifiers landing in one Atra namespace and denoting one source. That
residual is absent here because it was never a statement about GitHub. It described a defect in
Atra's own canonical vocabulary, which collapsed both resources onto a single `github` namespace.

The accepted namespace split removes it structurally: the resource is part of the canonical identity
namespace, so a numerically equal issue key and pull request key are two identities by construction
(§5). Removing an Atra-side defect proves nothing about the provider. **P-R1–P-R5 are exactly as
unproven as they were**, and none of them may be read as weakened by the split.

### Status, and the acceptance it rests on

```text
provider-issued .......................... PROVEN      (byte-backed)
representability ......................... PROVEN / fail-closed
identity-participating ................... accepted at the Phase-1 level
lifetime immutability .................... UNPROVEN   (P-R1)
non-reuse ................................ UNPROVEN   (P-R2)
transfer persistence ..................... UNPROVEN   (P-R3)
collision guarantee ...................... UNPROVEN   (P-R4)
surface equivalence ...................... UNPROVEN   (P-R5)

overall  PHASE1_SCOPED_ACCEPTED_WITH_UNPROVEN_RESIDUAL
```

The human PM reviewed P-R1–P-R5 and accepted them **explicitly**, for Phase-1 bounded experimental use
of GitHub pull requests under this profile version and nothing else, as decision
`ATRA_PM_P1_1_GITHUB_RESOURCE_NAMESPACE_SPLIT_ACCEPTED`. The acceptance is a product decision to
proceed while knowing what is not known. It is not evidence, it does not discharge P-R1–P-R5, and it
grants nothing to any other provider, any other GitHub resource, any other profile version or any
production identity certification.

**Revisit condition.** The acceptance expires when Phase-1 bounded experimental use ends. Any of the
following also reopens it before then: a proposal to persist, correlate or deduplicate on
`providerObjectKey` beyond Phase-1 experimental use; a third GitHub resource or a second provider
seeking the same treatment; a bump of the identity profile version; or GitHub publishing authority
that would close any of P-R1–P-R5. Closing a residual requires provider authority reviewed in a
separately authorized WorkUnit — never an accumulation of observations, and never this document
edited in place.

## 3. Content-scope profile — `github.pull-request.rest.retained-response-body` v1

```text
request            GET /repos/{owner}/{repo}/pulls/{pull_number}
                   Accept: application/vnd.github+json
                   X-GitHub-Api-Version: 2022-11-28
in-scope content   the complete retained provider response byte stream
canonicalization   identity — no transformation of any kind
contentDigest      sha256:<64 lowercase hex> over exactly those bytes
```

### Why the request is part of the profile

This is the one place this profile is stricter than its issue sibling, and the reason is a provider
fact rather than a preference. GitHub returns **entirely different bytes for the same pull request**
depending on the requested media type: `application/vnd.github.diff` and
`application/vnd.github.patch` return a diff and a patch, not a JSON object. "The retained response
body" is therefore not a well-defined scope until the request that produced it is pinned.

So the media type and API version are checked by acquisition, not merely recorded for a reader. An
archive whose `capturedFrom` records any other method, media type or API version is refused
(`unauthorized_request_method`, `unauthorized_accept_profile`,
`unauthorized_provider_api_version`) rather than reinterpreted under this profile.

### Why this satisfies B2-P1

B2-P1 requires, for one provider and one profile version:

```text
equal digest     = byte-identical canonicalized in-scope provider content
different digest = at least one in-scope provider-content byte differs
any in-scope provider-content change must change the digest
```

With the identity canonicalization, the digest's subject *is* the retained byte stream. All three
statements are then properties of SHA-256 over that stream, and there is no selection step, no
serialization step and no projection step between the provider's bytes and the hash function in which
a change could be lost. A narrower scope would need each of those steps proven; version 1
deliberately has none of them to prove.

The capture retains the provider's own response bytes inline, base64-encoded. Base64 is a lossless
reversible transport encoding, and acquisition rejects any non-canonical encoding by re-encoding the
decoded bytes and requiring an exact match — so one retained stream has exactly one admissible
spelling.

The digest is never computed over a `NormalizedToolSignal`, an acquisition envelope, a normalized
provider projection, `SourceRecord` fields or any other Atra-side representation. The only bytes that
reach the hash function are the bytes the provider sent.

That distinction is observable in this capture rather than merely asserted: GitHub returned this
response **pretty-printed**, with newlines and two-space indentation. A digest computed over a
parsed-and-reserialized object would differ from the digest of the retained stream in thousands of
bytes, and the slice's tests assert both that the indentation survived and that the two digests
differ.

### What this profile does not claim

It does not claim the scope is *minimal*, or that every in-scope byte is semantically interesting. A
pull request response carries provider-authored content alongside provider-authored metadata, merge
state and viewer-dependent members, and all of it is in scope at v1. The consequence is honest and
stated: two captures of an unchanged pull request can carry different digests if GitHub's
representation of it changed at all — and for this resource that is more likely than for an issue,
because members such as `mergeable` and `mergeable_state` are computed by the provider and can change
without any human touching the object. That is a true statement about the provider's content, not a
defect in the digest.

Narrowing the scope is a **new profile version**, never an edit to this one. Digests are comparable
only within a version, which is why the version travels with every digest in `ContentScopeBinding`.

## 4. Provider-stated event time

```text
sourceEventAt  the pull request resource's `created_at`
```

It is provider-stated, so it is carried. Nothing is substituted when a provider does not state an
event time: acquisition reads no other field in its place and refuses instead.

`updated_at`, `merged_at` and `closed_at` are **not** read. `merged_at` is the most plausible wrong
choice for this resource and is worth naming: it is the time of a different event, it is `null` for
every unmerged pull request, and using it would make `sourceEventAt` mean different things for
different objects under one profile. `observedAt` is the acquisition's own instant and is never taken
from the payload.

## 5. Canonical namespace consequence

This profile names a **provider** namespace, `github.com/rest/pulls`. Atra's **canonical identity**
namespace for records produced under it is `github_pull_request`, and the binding between the two is
made by the canonical producer, in review, as a stated literal.

The two must not be confused. The provider namespace is GitHub's; the canonical namespace is Atra's
closed vocabulary. Neither is derived from the other by string manipulation — deriving a canonical
namespace from a provider path would let any new provider path mint canonical vocabulary by itself.

Why the binding cannot be the generic `github`: the pull request `id` and the issue `id` are drawn
from different provider tables, and the two acquired objects show ranges that overlap
(`4258276579` and `4968607486`). Under one canonical namespace a numerically equal pair would become
one canonical identity — a false merge manufactured by Atra's vocabulary, not by anything GitHub
stated. The observed overlap is an *illustration* of the risk, not its basis: the split would be
required even if the ranges had looked disjoint on the day they were read, because disjointness on one
day is not a provider guarantee.

## 6. Non-canonical observations

Recorded because they were seen, and bounded because seeing is not proving. Nothing in this section
feeds a canonical value, and none of it is added to `SourceRecordV1`.

```text
REST id     4258276579   canonical identity material under §2
number      229          NOT identity — shared with the issues resource (byte-backed, §2)
node_id     PR_…         NOT identity — resource-prefixed, provider-declared opaque
issue_url   …/issues/229 NOT identity — a locator, and the evidence that `number` is shared
```

The strongest statement any of these supports is
`EMPIRICALLY_NOT_FALSIFIED_IN_OBSERVED_CAPTURES`. No accumulation of observations closes P-R1–P-R5:
provider contract authority is the only thing that does.

## 7. Acquisition mode

```text
HUMAN_TRIGGERED_PROVIDER_EXPORT
```

One human-triggered read-only `GET` against GitHub's REST API, whose response bytes were retained. No
provider write, no scheduled or autonomous execution, and no live read at verification time —
verification re-reads the retained bytes, never the provider. No credential is committed, retained in
the archive, or recorded in any capture field: `capturedFrom` carries the method, the URL, the API
version and the media type, and there is no slot in which an `Authorization` header could be kept.

## 8. Scope boundary

This profile authorizes production from GitHub **pull requests** only, under the two profile versions
named above, and only through the module pair recorded in the slice. It grants nothing to any other
provider, resource, profile version or acquisition mode. Widening any of those is a separate reviewed
change.

The identity half of that authorization carries P-R1–P-R5 with it. It is Phase-1 bounded experimental
use, not a production identity certification, and it is not a licence for any third GitHub resource to
be treated the same way on the grounds that issues and pull requests were. The content-scope profile
is unaffected by the residuals: they are statements about identity, and §3 rests on the retained bytes.
