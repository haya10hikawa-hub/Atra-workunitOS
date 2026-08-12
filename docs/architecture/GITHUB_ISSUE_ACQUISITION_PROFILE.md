# GitHub Issue — Identity and Content-Scope Profile

Status: Reviewed per-provider profile. Scope: **GitHub issues only**.

Subordinate to:

- `docs/architecture/PHASE1_VALUE_GATE_PROGRAM.md` — Product / Roadmap Authority
- `docs/architecture/SOURCE_RECORD_V1_SEMANTICS.md` — the generic B1-A / B2-P1 semantics this profile must satisfy

This document closes exactly two of the six provider profile gates named in
`SOURCE_RECORD_V1_SEMANTICS.md` §4, for one provider and one resource type. It proves nothing
about Slack, about Google Calendar, about GitHub pull requests, comments, reviews, commits or
repositories, or about any other GitHub resource. Those gates stay `REQUIRED_UNPROVEN`.

```text
GitHub ISSUE identity profile      = PROVEN, github.issue.rest.database-primary-key v1
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

The REST `id` and the GraphQL `databaseId` are the same value for the same object. For the object
acquired by this slice, REST returned `"id": 4968607486` and GraphQL returned
`databaseId: 4968607486` and `fullDatabaseId: "4968607486"` — the provider stating one identity
across two of its own surfaces.

That satisfies the four requirements the semantics place on identity material:

| Requirement | Evidence |
| --- | --- |
| provider-native | It is a member of GitHub's own representation of the resource, present in the retained response bytes. Atra neither mints nor derives it |
| identity-participating | GitHub calls it *the primary key from the database*. GitHub's own durable global reference is built from it — see below |
| lifetime-immutable | A primary key identifies the row for the row's lifetime; GitHub has never re-issued one, and the value is the input its node IDs are constructed from. The one identifier GitHub *has* changed is `node_id`, not this |
| collision-safe in namespace | A primary key is unique within the table it keys. The namespace `github.com/rest/issues` is exactly that scope, and the profile claims uniqueness nowhere wider |

GitHub's next-format global node ID for the acquired object decodes to the provider's own
composition of two primary keys:

```text
node_id  I_kwDOR1Wbq88AAAABKCbu_g
payload  93 00 ce 47559bab cf 000000012826eefe
             ^ 1196792747 = repository databaseId
                            ^ 4968607486 = issue databaseId
```

Both values were confirmed against GraphQL independently (`repository.databaseId` = 1196792747,
`issue.databaseId` = 4968607486). GitHub therefore treats the issue's database primary key as the
identity material its own reference identifiers are made of. This decoding is corroboration of
that claim; it is not the profile, and no Atra code decodes a node ID.

### Why not `node_id`

GitHub documents that global node IDs have already changed. The legacy format "will be closing
down and replaced with a new format", and GitHub's own guidance is that consumers "should migrate
[their] service to treat these IDs as opaque strings". A value the provider has re-issued once, in
a documented migration, cannot be asserted as lifetime-immutable identity material — so it is
excluded, and excluded for a reason recorded here rather than by omission.

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

### Representability

`id` is parsed from JSON as a number. A value outside the exactly-representable integer range would
be rounded by any JSON parser, so the digits produced would not be GitHub's. Acquisition refuses
such a value (`provider_identity_unrepresentable`) rather than emitting an approximation. GitHub
issue ids are far below that bound today; the check exists so the day they are not is a refusal and
not a silent corruption.

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

## 6. Scope boundary

This profile authorizes production from GitHub **issues** only, under the two profile versions
named above, and only through the module pair recorded in the slice. It grants nothing to any other
provider, resource, profile version or acquisition mode. Widening any of those is a separate
reviewed change.
