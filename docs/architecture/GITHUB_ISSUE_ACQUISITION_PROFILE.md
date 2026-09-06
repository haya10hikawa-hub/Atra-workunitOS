# GitHub Issue — Identity and Content-Scope Profile

Status: Reviewed per-provider profile. Scope: **GitHub issues only**.

Subordinate to:

- `docs/archive/v0/PHASE1_VALUE_GATE_PROGRAM.md` — Product / Roadmap Authority
- `docs/architecture/SOURCE_RECORD_V1_SEMANTICS.md` — the generic B1-A / B2-P1 semantics this profile must satisfy

This document addresses exactly two of the six provider profile gates named in
`SOURCE_RECORD_V1_SEMANTICS.md` §4, for one provider and one resource type. It proves nothing
about Slack, about Google Calendar, about GitHub pull requests, comments, reviews, commits or
repositories, or about any other GitHub resource. Those gates stay `REQUIRED_UNPROVEN`.

The two gates did not move to the same state, and this document does not pretend they did. The
content-scope gate is proven. The identity gate is **not** proven: the human PM accepted it for
Phase-1 bounded experimental use with named requirements left unproven, and §2.1 records those
residuals rather than arguing them away.

```text
GitHub ISSUE identity profile      = PHASE1_SCOPED_ACCEPTED_WITH_UNPROVEN_RESIDUAL,
                                     github.issue.rest.database-primary-key v1
GitHub ISSUE content-scope profile = PROVEN, github.issue.rest.retained-response-body v1
```

## 1. Provider authority used

Every claim below is checked against GitHub's own published contract, not against a third-party
description and not against the shape of a payload that happened to be convenient.

- GitHub's published GraphQL schema, read by introspection against `api.github.com` — the
  provider's own machine-readable documentation of its own types.
- GitHub's REST API reference for the issue resource, `docs.github.com/en/rest/issues/issues`.
- GitHub's global node ID migration documentation,
  `docs.github.com/en/graphql/guides/migrating-graphql-global-node-ids`, and the accompanying
  GitHub Blog announcements.
- The provider's own response bytes for the acquired object, retained verbatim by the capture.

## 2. Identity profile — `github.issue.rest.database-primary-key` v1

```text
providerNamespace  github.com/rest/issues
providerObjectKey  the exact decimal digits of the issue resource's `id`
```

### Why `id`

GitHub's own schema documents the value directly. Introspecting the `Issue` type returns:

```text
Issue.databaseId      "Identifies the primary key from the database."
Issue.fullDatabaseId  "Identifies the primary key from the database as a BigInt."
Issue.id              "The Node ID of the Issue object"
Issue.number          "Identifies the issue number."
```

For the object acquired by this slice, REST returned `"id": 4968607486` and GraphQL returned
`databaseId: 4968607486` and `fullDatabaseId: "4968607486"`. That is an **observation about one
object on one day**, not a provider commitment. GitHub publishes no contract stating that the REST
`id` and the GraphQL `databaseId` are the same value for every issue, and this document asserts no
such equivalence. It is residual **R5** in §2.1.

Against the four requirements the semantics place on identity material, the honest reading is:

| Requirement | Status | Basis |
| --- | --- | --- |
| provider-issued | **PROVEN** | It is a member of GitHub's own representation of the resource, present in the retained response bytes. Atra neither mints, derives nor substitutes it |
| identity-participating | **supported at the Phase-1 acceptance level** | GitHub's own schema calls it *the primary key from the database*, and the node ID decoding below shows GitHub composing references out of it. That is provider-stated support for identity participation; it is not a published guarantee, so it is accepted at Phase-1 level rather than recorded as proven |
| lifetime-immutable | **UNPROVEN** | GitHub publishes no lifetime-immutability commitment for the issue `id`. "It is a primary key" describes a database column, not a provider guarantee to consumers, and no number of unchanged observations is a proof. Residual **R1** |
| collision-safe in namespace | **UNPROVEN** | GitHub publishes no uniqueness or non-reuse guarantee for `github.com/rest/issues` to consumers. Uniqueness of a key inside GitHub's own table is an inference about their storage, not a provider-backed contract Atra may rely on. Residuals **R2** and **R4** |

GitHub's next-format global node ID for the acquired object decodes to a composition that includes
two database primary keys:

```text
node_id  I_kwDOR1Wbq88AAAABKCbu_g
payload  93 00 ce 47559bab cf 000000012826eefe
             ^ 1196792747 = repository databaseId
                            ^ 4968607486 = issue databaseId
```

Both values were confirmed against GraphQL independently (`repository.databaseId` = 1196792747,
`issue.databaseId` = 4968607486). For this object, GitHub's own reference identifier is built out
of the issue's database primary key. That is corroboration for identity participation, at the level
§2.1 records: it is one decoded example of an encoding GitHub tells consumers to treat as opaque,
not a published commitment about every issue or about the future. It is not the profile, and no
Atra code decodes a node ID.

### Why not `node_id`

GitHub documents that global node IDs have already changed. The legacy format "will be closing
down and replaced with a new format", and GitHub's own guidance is that consumers "should migrate
[their] service to treat these IDs as opaque strings". A value the provider has re-issued once, in
a documented migration, cannot be asserted as lifetime-immutable identity material — so it is
excluded, and excluded for a reason recorded here rather than by omission.

The contrast is narrower than it looks, and stating it precisely matters: `node_id` is **known to
have changed**, while `id` is **not known either way** (R1). Choosing `id` therefore avoids a
demonstrated re-issue; it does not acquire a guarantee `node_id` lacks.

### Why not `number`, and not a composite

`number` is repository-scoped: GitHub addresses it as `/repos/{owner}/{repo}/issues/{issue_number}`,
so it is not collision-safe on its own. Making it safe would require composing it with a repository
identifier, and the only admissible repository identifier is that repository's own primary key —
which produces a composite that identifies exactly what the issue's primary key already identifies
alone. Composition is permitted by the semantics but is not free: it adds a serialization whose
injectivity must itself be proven. A scalar provider-issued key needs no such proof, so v1 uses one.

`repository#number` in particular remains what the semantics say it is: **not** a ratified GitHub
identity profile. Nothing here revives it.

### Forbidden material, explicitly absent

No URL, permalink, `html_url`, display name, repository name, login, title, array position, index,
observation instant or Atra-generated value participates in `providerObjectKey`. The key is carried
byte-for-byte from the provider's digits: not trimmed, not case-folded, not re-encoded, not padded.

### Representability — PROVEN, fail-closed

`id` is parsed from JSON as a number. A value outside the exactly-representable integer range would
be rounded by any JSON parser, so the digits produced would not be GitHub's. Acquisition refuses
such a value (`provider_identity_unrepresentable`) rather than emitting an approximation. GitHub
issue ids are far below that bound today; the check exists so the day they are not is a refusal and
not a silent corruption.

This one is proven, and it is proven the only way a property of this kind can be: the failing case
refuses. The refusal is a code path in the acquisition module, not a claim about GitHub.

## 2.1 Unproven residuals, and the acceptance that stands over them

The identity profile is used at Phase 1 with the following requirements **not proven**. They are
listed so that no later reader has to reconstruct what was known; none of them may be rewritten as
proven without new provider authority.

```text
R1  REST issue `id` lifetime immutability ......................... UNPROVEN
R2  non-reuse of a REST issue `id` after deletion ................. UNPROVEN
R3  persistence of a REST issue `id` across repository transfer ... UNPROVEN
R4  provider-backed collision guarantee for github.com/rest/issues  UNPROVEN
R5  normative REST `id` = GraphQL `databaseId` equivalence ........ UNPROVEN
```

What each one means, and why observation does not close it:

- **R1 — lifetime immutability.** GitHub publishes no statement that an issue's `id` will not
  change. The schema describes what the value *is* today, not what GitHub commits it will remain.
- **R2 — non-reuse after deletion.** GitHub issues can be deleted. Nothing published says the
  freed identifier is never assigned to a later object, so a key that has been seen once is not
  guaranteed to still denote the same object.
- **R3 — repository transfer.** Issues move with a transferred repository, and GitHub publishes no
  statement about whether the issue's `id` survives that move unchanged.
- **R4 — collision guarantee.** Uniqueness within GitHub's own table is an inference about their
  storage. It is not a guarantee GitHub extends to consumers of `github.com/rest/issues`, and this
  profile relies on it, so it is recorded as relied-upon and unproven rather than as proven.
- **R5 — surface equivalence.** REST `id` and GraphQL `databaseId` matched for the acquired object.
  One matching pair is not a normative equivalence, and GitHub publishes none.

### Status, and the acceptance it rests on

```text
provider-issued .......................... PROVEN
representability ......................... PROVEN / fail-closed
identity-participating ................... supported at the Phase-1 acceptance level
lifetime immutability .................... UNPROVEN   (R1)
non-reuse ................................ UNPROVEN   (R2)
transfer persistence ..................... UNPROVEN   (R3)
collision guarantee ...................... UNPROVEN   (R4)
surface equivalence ...................... UNPROVEN   (R5)

overall  PHASE1_SCOPED_ACCEPTED_WITH_UNPROVEN_RESIDUAL
```

The human PM reviewed R1–R5 and accepted them **explicitly**, for Phase-1 bounded experimental use
of GitHub issues under this profile version and nothing else. The acceptance is a product decision
to proceed while knowing what is not known. It is not evidence, it does not discharge R1–R5, and it
grants nothing to any other provider, any other GitHub resource, any other profile version or any
production identity certification.

**Revisit condition.** The acceptance expires when Phase-1 bounded experimental use ends. Any of
the following also reopens it before then: a proposal to persist, correlate or deduplicate on
`providerObjectKey` beyond Phase-1 experimental use; a second GitHub resource or a second provider
seeking the same treatment; a bump of the identity profile version; or GitHub publishing authority
that would close any of R1–R5. Closing a residual requires provider authority reviewed in a
separately authorized WorkUnit — never an accumulation of observations, and never this document
edited in place.

## 3. Content-scope profile — `github.issue.rest.retained-response-body` v1

```text
in-scope content   the complete retained provider response byte stream
canonicalization   identity — no transformation of any kind
contentDigest      sha256:<64 lowercase hex> over exactly those bytes
```

The capture retains the provider's own response bytes inline, base64-encoded. Base64 is a lossless
reversible transport encoding, and acquisition rejects any non-canonical encoding by re-encoding the
decoded bytes and requiring an exact match — so one retained stream has exactly one admissible
spelling.

### Why this satisfies B2-P1

B2-P1 requires, for one provider and one profile version:

```text
equal digest     = byte-identical canonicalized in-scope provider content
different digest = at least one in-scope provider-content byte differs
any in-scope provider-content change must change the digest
```

With the identity canonicalization, the digest's subject *is* the retained byte stream. All three
statements are then properties of SHA-256 over that stream, and there is no selection step, no
serialization step and no projection step between the provider's bytes and the hash function in
which a change could be lost. A narrower scope would need each of those steps proven; version 1
deliberately has none of them to prove.

The digest is never computed over a `NormalizedToolSignal`, an acquisition envelope, a normalized
provider projection, `SourceRecord` fields or any other Atra-side representation. The only bytes
that reach the hash function are the bytes the provider sent.

### What this profile does not claim

It does not claim the scope is *minimal*, or that every in-scope byte is semantically interesting.
A GitHub issue response carries provider-authored content alongside provider-authored metadata and
viewer-dependent members, and all of it is in scope at v1. The consequence is honest and stated:
two captures of an unchanged issue can carry different digests if GitHub's representation of it
changed at all. That is a true statement about the provider's content, not a defect in the digest.

Narrowing the scope is a **new profile version**, never an edit to this one. Digests are comparable
only within a version, which is why the version travels with every digest in
`ContentScopeBinding`.

## 4. Provider-stated event time

```text
sourceEventAt  the issue resource's `created_at`
```

GitHub's schema documents the corresponding field as "Identifies the date and time when the object
was created", and states it in the pinned ISO-8601 UTC shape the Source domain accepts. It is
provider-stated, so it is carried. Nothing is substituted when a provider does not state an event
time: acquisition reads no other field in its place, and `null` would stay `null`.

`updated_at`, `closed_at` and `due` values are not read. `observedAt` is the acquisition's own
instant and is never taken from the payload.

## 5. Acquisition mode

```text
HUMAN_TRIGGERED_PROVIDER_EXPORT
```

One human-triggered read-only `GET` against GitHub's REST API, whose response bytes were retained.
No provider write, no scheduled or autonomous execution, and no live read at verification time —
verification re-reads the retained bytes, never the provider. Acquisition refuses an archive whose
recorded request method is anything but `GET`.

## 5.1 Canonical namespace consequence — no version bump

A later reviewed WorkUnit split Atra's canonical identity namespaces by GitHub resource, so records
produced under this profile now carry the canonical namespace `github_issue` where they previously
carried the generic `github`. That is a change to **Atra's** vocabulary, and this section states
precisely why it is not a change to **this profile**.

```text
provider namespace       github.com/rest/issues                       unchanged
provider identity        the issue resource's REST `id`               unchanged
identity profile         github.issue.rest.database-primary-key v1    NOT bumped
content-scope profile    github.issue.rest.retained-response-body v1  NOT bumped
canonical namespace      github  ->  github_issue                     changed, outside this profile
```

A profile version bump is required when what the profile asserts about the **provider** changes: a
different provider-native identity member, a different provider namespace, a different in-scope byte
stream, or a different canonicalization. None of those moved. The key derived from the retained
capture is the same digits it was before the split, and the digest over the same retained bytes is
the same digest — the slice's regression asserts both against the original real capture.

What moved is the outer namespace Atra interprets that key in, which this document never named: the
provider namespace here was already resource-scoped, and the collapse was entirely on Atra's side,
where two resource-scoped provider namespaces were both bound to one canonical `github`. Bumping this
profile's version would have asserted that GitHub's issue identity contract changed, which is false,
and would have made digests produced before and after the split incomparable for no provider reason.

The residuals in §2.1 are unaffected in both directions. R1–R5 are neither closed nor widened by the
split, and R4 in particular remains **exactly** as unproven as before: it is a statement about
collision guarantees *within* `github.com/rest/issues`, and separating issues from pull requests in
Atra's vocabulary says nothing about uniqueness inside GitHub's own issue table.

### One behaviour change: the resource is bound to the bytes

The split added a fail-closed guard to this module, and it is recorded here rather than left to the
diff. Acquisition now refuses a retained payload carrying pull request structure — both `head` and
`base` as objects — with `provider_resource_mismatch`.

It exists because the canonical namespace follows from which acquisition module ran, so without it a
pull request export handed to this module would mint the pull request's own primary key into the
issue namespace, producing a well-formed record no reviewer could identify as wrong. The mirror guard
lives in the pull request profile.

This is a refusal added to the module, not a change to the profile:

```text
provider namespace / identity member / in-scope bytes / canonicalization   all unchanged
failure vocabulary                                                          one code added
identity or content-scope profile version                                   NOT bumped
```

The set of payloads that produce a key is narrowed, never widened, and no payload that produced a key
before produces a different one now. It asserts nothing about GitHub: it says the retained payload is
not the other reviewed resource, and R1–R5 are untouched by it.

## 6. Scope boundary

This profile authorizes production from GitHub **issues** only, under the two profile versions
named above, and only through the module pair recorded in the slice. It grants nothing to any other
provider, resource, profile version or acquisition mode. Widening any of those is a separate
reviewed change.

The identity half of that authorization carries R1–R5 with it. It is Phase-1 bounded experimental
use, not a production identity certification, and it is not a licence for any other GitHub resource
to be treated the same way on the grounds that issues were. The content-scope profile is unaffected
by the residuals: they are statements about identity, and §3 rests on the retained bytes.

GitHub pull requests are now covered by a separate reviewed profile,
`docs/architecture/GITHUB_PULL_REQUEST_ACQUISITION_PROFILE.md`. It is a sibling document, reviewed on
its own evidence: nothing in it was admitted on the strength of this one, and the Phase-1 acceptance
recorded in §2.1 remains non-transferable.
