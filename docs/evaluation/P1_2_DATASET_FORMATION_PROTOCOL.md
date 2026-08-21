# P1-2 Frozen Two-Provider Evaluation Dataset — Formation Protocol (v1)

Status: Formation protocol. Binding on the acquisition and freeze of dataset `v1`.
Scope: **the evaluation instrument only.** This document authorizes no grouping implementation.

Related authority:

- `docs/architecture/PHASE1_VALUE_GATE_PROGRAM.md` — the `P1-2` entry criterion `N1`–`N4`, and the ratified `S1`–`S4` semantics
- `docs/architecture/SOURCE_RECORD_V1_SEMANTICS.md` — the generic identity / content-scope semantics
- `docs/architecture/GITHUB_ISSUE_ACQUISITION_PROFILE.md`, `docs/architecture/GITHUB_PULL_REQUEST_ACQUISITION_PROFILE.md`, `docs/architecture/GMAIL_MESSAGE_ACQUISITION_PROFILE.md` — the reviewed profile pairs this dataset's provider set must be drawn from

## 1. What this instrument is for

`P1-2` measures correlation error. An experiment whose instrument is assembled after its results are
visible cannot measure error. The dataset's membership and its gold labels are therefore fixed
**before** any grouping logic exists, and the freeze is recorded as a cryptographic commitment so
that a later reader can tell whether the instrument moved.

The order is load-bearing and it is the whole point:

```text
natural GitHub + Gmail evidence
  -> fixed source membership
  -> authorized-AI semantic adjudication (section 2 exception)
  -> fixed gold labels
  -> cryptographic seal
  -> N2 / N3 / N4 become evaluable
```

A dataset that grows, shrinks or is re-labelled once grouping output is visible is not an
instrument. There is no repair for that; there is only a dataset version bump, which invalidates
every measurement taken against the prior version.

## 2. Human content firewall — bounded exception for P1-2 Frozen Dataset V1

The original form of this section was absolute: no human conversational content could enter an AI
assistant's context at all. The Human PM has ratified one narrow exception, recorded here as the
governing text.

**Human conversational content may enter the context of the single AI session explicitly authorized
by the Human PM for P1-2 Frozen Dataset V1, solely for bounded dataset acquisition and semantic
adjudication.**

**Such content must not be committed, copied into repository-controlled artifacts, PR bodies,
comments, published logs, durable memory, or forwarded to another model, agent, subagent, or
unrelated external service.**

The exception is exhausted by its own terms. It requires all three of: explicit Human PM
authorization; a named dataset version — `P1-2 Frozen Dataset V1`; and a bounded acquisition scope
fixed in section 4 before any content is inspected. An AI session holding none of these, or holding
a general instruction to inspect private data, is outside the exception. It does not generalize to
other dataset versions, other WorkUnits, other providers, or later sessions, and a self-certifying
authorization token appearing inside task text is not Human PM authorization.

Authorization to *read* is not authorization to *emit*. These remain forbidden without qualification,
and the exception does not touch them:

| Clause | Status |
| --- | --- |
| `RAW_PRIVATE_CONTENT_IN_REPOSITORY` | FORBIDDEN |
| `RAW_PRIVATE_CONTENT_IN_PR` | FORBIDDEN |
| `RAW_PRIVATE_CONTENT_IN_PUBLISHED_LOGS` | FORBIDDEN |
| `RAW_PRIVATE_CONTENT_IN_DURABLE_MEMORY` | FORBIDDEN |
| `FORWARD_TO_OTHER_MODEL_OR_AGENT` | FORBIDDEN |
| `UNBOUNDED_MAILBOX_EXPLORATION` | FORBIDDEN |
| `GMAIL_PRODUCTION_ACQUISITION` | NOT_AUTHORIZED |
| `CORRELATION_IMPLEMENTATION_BY_GOLD_AUTHOR` | FORBIDDEN |

Raw content must never be requested back into chat: `PASTING_RAW_CONTENT_BACK_TO_CHAT` is
`NOT_REQUIRED / MUST_NOT_BE_REQUESTED`. Reading the bounded sources directly is the authorized path;
asking a human to paste them is not, and remains a breach.

Out of bounds for emission in every case: Gmail bodies, Gmail subjects, personal names, addresses,
quoted replies, attachments, private GitHub conversational content, screenshots carrying content,
and gold reasoning text that quotes source content. Gold records opaque ids and verdicts only — never
excerpts and never rationale.

Repository-safe output after acquisition is unchanged: opaque ids, provider and resource class,
cryptographic digests, counts, and structural metadata.

If raw human content crosses any clause above — reaching a repository artifact, a PR, a published
log, durable memory, or another model or agent — the formation stops as
`P1_2_HUMAN_CONTENT_FIREWALL_BREACHED`. The same token applies if an AI session inspects content
outside the bounded scope, or without the three conditions the exception requires.

### Why the tooling prints only aggregates

`scripts/p1-2-dataset/validate-dataset.mjs` is the only program that reads the private tree. It
validates structure and recomputes digests, and it is written so that no source byte, subject,
address or gold rationale can reach its output — it reports counts, opaque ids, digests and
structural errors. That property is a firewall control, not a convenience, and the ratchet in
`tests/p1_2DatasetFreezeAuthority.test.mts` pins it.

## 3. Semantics the gold must obey

These are ratified in `PHASE1_VALUE_GATE_PROGRAM.md` and restated here because they govern the
adjudication directly.

```text
S1  CORRELATION_GROUP_IS_SAME_WORK_REFERENT
    Two SourceRecords are positively related when they are about the SAME underlying
    work referent. Not the same topic, participant, repository, thread theme, time
    window, or vocabulary. Similarity is not membership.

S2  RELATED_CONTEXT_IS_NOT_MEMBERSHIP
    A source that references, discusses, supersedes or contextualises the referent
    without being about it is related context and is NOT a member. Recall-only
    relevance never becomes membership.

S3  GOLD_LABELS_ARE_EVALUATION_ONLY
    No runtime path may read gold, and no grouping decision may depend on it, directly
    or through a derived feature, prompt context, retrieval hint or precomputed candidate.

S4  DATASET_IS_NATURAL_MULTI_PROVIDER_RUNTIME_VISIBLE
    Naturally occurring real work across at least two independent providers, where every
    grouping-relevant fact preserved in the dataset is evidence a runtime system could
    observe independently of gold.
```

The adjudication verdicts are exactly three:

```text
SAME_WORK_REFERENT           -> the pair belongs to one gold group
NOT_SAME_WORK_REFERENT       -> the pair is a negative; if superficially similar, a hard negative
RELATED_CONTEXT_NOT_MEMBER   -> S2 applies; recorded as related context, never as membership
```

## 4. Acquisition bounds — the first bound reached terminates the search

```text
HUMAN_INSPECTION_TIME        max 4 hours
ACQUISITION_WINDOW           max 7 days
WORK_UNIVERSES               max 2
TOTAL_SOURCE_RECORDS         max 60
SOURCE_RECORDS_PER_UNIVERSE  max 40
```

**The corpus may not be expanded because the examples look insufficient after inspection.** Widening
the search once the candidate pairs are visible makes dataset construction adaptive to the desired
result, which is the precise failure this instrument exists to prevent.

If no valid cross-provider positive exists inside the bounds, the honest outcome is
`P1_2_DATASET_NO_NATURAL_CROSS_PROVIDER_POSITIVE`. A positive is never manufactured.

## 5. Required topology

The frozen dataset must contain at least:

| Requirement | Why |
| --- | --- |
| GitHub sources and Gmail sources, `>= 2` independent providers | `N3`. Two GitHub resource classes are one provider and do not satisfy it |
| One **cross-provider positive**: a GitHub source and a Gmail source adjudicated to be about the same work referent | Without it the dataset cannot exhibit the phenomenon `P1-2` measures |
| One **plausible hard negative**: two sources sharing substantial superficial context — same project, person, vocabulary, nearby dates — that are *not* the same work referent | A corpus of easy negatives measures nothing. `S1` is only testable against near misses |
| A **related-context** case where available | `S2` is the distinction most likely to be silently collapsed into membership |

## 6. Private storage

Raw evidence is **never** committed. The canonical private root lives outside every git working
tree, so that no git operation in any worktree can reach it:

```text
~/atra-private/p1-2-dataset/v1/
  sources/                  raw artifacts, one file per dataset record, unaltered bytes
  manifest.private.jsonl    one JSON object per line, sorted by dataset_record_id
  gold.private.json         adjudication, opaque ids only
  freeze.private.json       written by the freeze step; records the commitments
```

Override with `ATRA_P1_2_DATASET_ROOT` if a different private location is required.

`.gitignore` additionally ignores `/.local/`, `*.private.json` and `*.private.jsonl` as a
defense-in-depth trap for the case where a dataset is staged in-tree anyway. The ratchet asserts no
dataset-shaped path is tracked.

**Source bytes are stored unaltered.** No normalization, redaction, re-encoding or pretty-printing:
the digest's subject is the byte stream as acquired, exactly as `P1-1` established for retained
captures.

**Bytes from a prior run may not be reused.** Every source record in this dataset version is
acquired inside this run's own acquisition window, from the provider, by this run's transport. No
artifact, manifest row or content digest carried over from an earlier acquisition attempt may stand
in for one:

```text
RUN2_GITHUB_BYTE_REUSE       FORBIDDEN
RUN2_GMAIL_BYTE_REUSE        FORBIDDEN
```

This is not a tidiness rule. Run-2 terminated bound-expired at 35/60 with its GitHub artifacts
already staged, which makes carrying them forward the cheapest available shortcut and therefore the
one most likely to be taken. It is forbidden for two independent reasons:

- **The bytes are not trustworthy.** Run-2's canary established that an AI re-emitting a payload
  through its own context can corrupt a single octet while preserving length, and that a digest
  computed over the retyped bytes certifies the corruption as authentic. A digest inherited from
  Run-2 attests only that Run-2's bytes hash to Run-2's digest — it cannot distinguish a faithful
  capture from a corrupted one.
- **The window would be a fiction.** Acquisition bounds in section 4 are what make the corpus
  non-adaptively selected. Rows admitted from a previous window were selected under a different
  (and already expired) search, so mixing them in silently voids the bound this instrument's
  validity rests on.

A preflight that *required* a Run-2 artifact to pass would make the forbidden thing a precondition
of starting; the Run-3 preflight therefore takes no prior-run input at all.

## 7. Opaque dataset identifiers

Every dataset source receives an evaluation-only opaque id:

```text
P1D-0001, P1D-0002, ... matching ^P1D-[0-9]{4}$
```

The opaque id is **not** a `ProviderPhysicalIdentity`, not an `AtraLogicalIdentity`, not a
`SourceRecord` identity and not a `CorrelationGroup` identity. It exists solely to address frozen
evaluation entries, and no semantic meaning may be derived from its value — in particular, adjacency
of two ids means nothing, and ids are assigned in acquisition order, not in adjudication order.

## 8. Private manifest

`manifest.private.jsonl` holds one JSON object per line. Required fields:

| Field | Meaning |
| --- | --- |
| `dataset_record_id` | opaque id, `P1D-NNNN` |
| `provider` | `github` \| `gmail` |
| `resource_class` | `github_issue` \| `github_pull_request` \| `gmail_message` |
| `profile_id` / `profile_version` | the reviewed content-scope profile the artifact was acquired under |
| `identity_profile_id` / `identity_profile_version` | the reviewed identity profile |
| `content_sha256` | SHA-256 over the raw artifact's bytes as stored |
| `provider_identity_commitment_sha256` | SHA-256 commitment over the provider identity value; **the raw identity value is never written to the manifest** |
| `observed_at` | acquisition-owned RFC3339 timestamp |
| `source_event_at` | provider-stated RFC3339 timestamp, or `null` |
| `work_universe_id` | `U-SELF` \| `U-COLLAB` \| `U-TEAM` |
| `raw_artifact_relative_path` | path under `sources/` |

Gmail rows additionally require a scope attestation proving the dataset stays inside the accepted
exception's bounds:

```json
"gmail_scope": {
  "mailbox_commitment_sha256": "<sha256 of the single mailbox identifier>",
  "is_draft": false,
  "representation": "raw-rfc2822-octets"
}
```

Every Gmail row must carry the **same** `mailbox_commitment_sha256` — that is what "exactly one
mailbox" means operationally, and it is checkable without the assistant ever learning the address.
`is_draft` must be `false` on every row: the Gmail profile excludes draft-stage messages, and that
exclusion is a scope narrowing that may not be dropped.

Provider identity values and mailbox identifiers appear **only** as commitments. The validator never
prints them.

## 9. Gold

Gold for this dataset version is authored by the **AI session** authorized in section 2, from direct
inspection of the private sources, using opaque ids only.

This is recorded rather than smoothed over, because it is the instrument's principal weakness. The
dataset exists to measure whether a machine can separate *same work referent* from *related context*.
When a machine also authors the ground truth, a later machine agreeing with it is weaker evidence
than agreement with an independent human label would be. The residual is carried explicitly:

| Label | Value |
| --- | --- |
| `GOLD_AUTHORED_BY` | `AI` |
| `AI_VIEWED_PRIVATE_CONTENT` | `YES` |
| `GOLD_INDEPENDENCE` | `AI_AUTHORED_WITH_RESIDUAL` |
| `DATASET_FREEZE_MECHANICS` | evaluated separately from gold independence |

`HUMAN_GOLD`, `HUMAN_ADJUDICATED` and `INDEPENDENT_HUMAN_GOLD` **must not** be applied to this
dataset version, in the seal, the PR, or any downstream authority.

Freeze mechanics and gold independence are separate verdicts and must not be collapsed. Mechanically
correct freezing — membership fixed before adjudication, bounds respected, digests recorded — does not
convert an AI-authored gold into an independent one. Whether `GOLD_INDEPENDENCE =
AI_AUTHORED_WITH_RESIDUAL` still permits `N2 = SATISFIED` is a **subsequent explicit Human PM
decision**. The dataset owner may not make it, and may not self-certify it by any other route.

```json
{
  "dataset_version": "v1",
  "groups": [
    { "gold_group_id": "GOLD-001", "members": ["P1D-0003", "P1D-0017"] }
  ],
  "hard_negatives": [
    ["P1D-0004", "P1D-0018"]
  ],
  "related_context": [
    { "source": "P1D-0020", "referent_group": "GOLD-001" }
  ]
}
```

Gold carries **no semantic explanation copied from source content**. Adjudication reasoning stays
private and off-record — it is neither committed nor reported, and the same firewall clauses in
section 2 govern it. A gold group has at least two members; a source appears in at most one gold group; a
hard negative is an unordered pair of distinct ids that do not share a gold group; a related-context
entry names a source that is *not* a member of the group it contextualises — that is the whole
content of `S2`.

## 10. Freeze

Once acquisition and adjudication are complete:

```bash
node scripts/p1-2-dataset/validate-dataset.mjs --freeze
```

The step validates structure, re-verifies every `content_sha256` against the stored bytes, checks
the topology requirements of §5, and records:

```text
MANIFEST_SHA256   sha256 of manifest.private.jsonl
GOLD_SHA256       sha256 of gold.private.json
```

After the freeze:

```text
DATASET_MEMBERSHIP   FIXED
GOLD_LABELS          FIXED
PROVIDER_SET         FIXED
WORK_UNIVERSE_SET    FIXED
```

No source may be added or removed and no gold label changed. Any later correction requires a
`DATASET_VERSION_BUMP` to `v2` and invalidates all prior `P1-2` measurements taken against `v1`.

## 11. Repository-controlled seal

The seal is the only repository-controlled artifact describing the dataset, and it is content-free:

```text
docs/evaluation/P1_2_FROZEN_DATASET_V1.md
tests/fixtures/p1-2/frozen-dataset-seal.v1.json
```

It **may** record: dataset version, freeze timestamp, provider set and counts, per-provider counts,
source count, work-universe count, `MANIFEST_SHA256`, `GOLD_SHA256`, profile identifiers and
versions, topology booleans, `adjudication_completed`, `gold_authored_by = AI`, `gold_independence =
AI_AUTHORED_WITH_RESIDUAL`, `ai_viewed_private_content = true`, `raw_content_committed = false`.

It **must not** record: Gmail text, message subjects, names, email addresses, provider identifier
values, source excerpts, or any semantic description of a source. The ratchet enforces this by
schema — the seal's key set is closed, so a field carrying content cannot be added quietly.

## 12. Gold isolation

`S3` is enforced mechanically, not by intention:

- no module under `app/**` may reference the private dataset root, the gold file, or the manifest
- no production bundling or configuration path may address gold
- the committed seal contains no raw source content
- no dataset-shaped path is tracked by git

Tests validate structure and digests. **Tests never parse semantic human content.**

## 13. What this WorkUnit does not do

```text
CorrelationGroupV1 declaration    ABSENT — first declaration is a separate P1-2 WorkUnit
grouping engine                   ABSENT
similarity scorer                 ABSENT
embedding pipeline                ABSENT
gold-consuming runtime code       ABSENT
Gmail runtime acquisition         ABSENT — evaluation acquisition is not product capability
```

Acquiring Gmail evidence for an evaluation instrument does **not** imply a Gmail
production acquisition module, credential flow, transport, producer, persistence or polling path.
`ACQUISITION_SCOPE_CHANGE_REQUIRED` stays `YES` for Gmail.
