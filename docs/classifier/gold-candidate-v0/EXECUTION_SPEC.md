# Atra Work Reconstruction
# Gold Candidate v0 — 1,000 Episode Build Plan

> Status: EXECUTION SPEC
>
> Purpose: Build the first **1,000 external, real-data-based Gold Candidate Episodes**
> for Atra's Work Reconstruction Engine.
>
> Important:
>
> **These are NOT final Gold examples yet.**
>
> They are:
>
> ```text
> Real public data
>     ↓
> Episode extraction
>     ↓
> GPT annotation
>     ↓
> Independent verification
>     ↓
> Gold Candidate v0
>     ↓
> Human review
>     ↓
> Final Gold
> ```
>
> The benchmark must be grounded in real development/work evidence.
> GPT may reconstruct and propose the answer, but must not invent the underlying work history.

---

# 1. Primary Goal

Create:

```text
1,000 Gold Candidate Episodes
```

from external open/public datasets.

Each Episode must attempt to reconstruct:

```text
SourceRecords
    ↓
SemanticAtoms
    ↓
Work Nodes
    ↓
Granularity
    ↓
Relations
    ↓
Work Graph
    ↓
Evidence mapping
```

The first 1,000 Episodes are for:

1. discovering the real structure of work,
2. testing the provisional 4-level ontology,
3. finding missing relation types,
4. building the future evaluation benchmark,
5. preparing a clean split between evaluation data and future fine-tuning data.

---

# 2. Golden Set First Principle

Do NOT begin by freezing the ontology.

The order is:

```text
EXTERNAL REAL DATA
      ↓
1,000 GOLD CANDIDATES
      ↓
OBSERVE REAL WORK STRUCTURES
      ↓
ONTOLOGY REVISION
      ↓
HUMAN-VERIFIED GOLD
      ↓
MODEL EVALUATION
      ↓
FINE-TUNING DECISION
```

Do NOT:

```text
design ontology
↓
force all examples into it
```

---

# 3. Terminology

## 3.1 Raw Candidate

A source neighborhood extracted from a public dataset.

It may contain noise and may not be usable.

---

## 3.2 Silver Episode

An episode whose relationships are partially inferred from explicit metadata.

Examples:

```text
"Fixes #123"
parent/sub-task link
duplicate link
blocking relation
PR contains commit
same milestone
explicit URL/reference
```

Silver is NOT final truth.

---

## 3.3 Gold Candidate

A real-data Episode that has:

- source provenance,
- reconstructed work graph,
- GPT annotation,
- annotation reasoning,
- uncertainty representation,
- validation pass,
- no unsupported invented facts.

It is ready for human review.

---

## 3.4 Final Gold

A Gold Candidate promoted after human review.

The initial task stops at:

```text
Gold Candidate v0 = 1,000 Episodes
```

---

# 4. Data Source Policy

The first 1,000 must be built from **external public/open data**.

Atra's own internal development history must NOT be part of the primary 1,000.

Atra data can later become a separate:

```text
Atra Private Validation Pack
```

---

# 5. Approved Source Families

Use the following source families.

The exact version, URL, license, checksum, and retrieval date MUST be recorded
in `MANIFEST.yaml`.

---

## A. Public Jira Dataset

Primary purpose:

```text
Issue hierarchy
Project structure
Issue links
Dependencies
Duplicates
Comments
Status transitions
Historical changes
Timeline
```

Target allocation:

```text
200 Episodes
```

Preferred episode types:

- parent issue + child tasks,
- linked issues,
- blocker / dependency,
- duplicate,
- reopened issue,
- milestone/release-related work,
- long-running issue with changing status,
- requirement → implementation task decomposition.

Do not assume a Jira link is automatically Gold truth.

Use it as evidence.

---

## B. SmartSHARK

Primary purpose:

```text
Issue
Commit
Mailing list
Pull request
Code review
CI
Software change
```

Target allocation:

```text
180 Episodes
```

This is one of the highest-value sources because it supports cross-source
software work reconstruction.

Preferred episode types:

```text
mail discussion → issue → commit
issue → commit → review
issue → PR → CI
discussion → implementation
bug → fix → verification
```

Use manually validated link information when available.

Still preserve provenance.

---

## C. Software-related Slack Chats Dataset

Primary purpose:

```text
informal discussion
question → hypothesis → action → resolution
task emergence
progress updates
technical coordination
```

Target allocation:

```text
120 Episodes
```

Prefer conversations where work evolves, not simple one-shot Q&A.

Episode examples:

```text
problem reported
↓
debug hypothesis
↓
suggested action
↓
confirmation
```

This source is mainly useful for:

```text
L3 Task
Decision
Progress
Evidence
UNCERTAIN
```

---

## D. DISCO / Public Software Discord Dataset

Primary purpose:

```text
real-time technical discussion
informal work formation
multi-participant reasoning
task emergence
ambiguity
```

Target allocation:

```text
80 Episodes
```

Avoid overrepresenting basic support questions.

Prefer multi-message threads with a meaningful work lifecycle.

---

## E. Wikimedia Ecosystem

Use as a public approximation of collaborative Docs + structured tasks +
code review.

Possible evidence sources:

```text
MediaWiki revisions
Talk/discussion pages
Phabricator tasks
Gerrit changes/reviews
Git repositories
```

Target allocation:

```text
120 Episodes
```

Language allocation inside this source:

```text
60 English
60 Japanese
```

Preferred structures:

```text
document/page change
↓
discussion
↓
task
↓
code/review
```

and:

```text
proposal
↓
revision
↓
review
↓
follow-up task
```

This source is important for:

```text
Docs-like collaborative editing
revision history
discussion
task linkage
Japanese work evidence
```

---

## F. Japanese Public OSS Repositories

Primary purpose:

```text
native Japanese engineering language
Japanese issue / PR / review / task structure
mixed Japanese-English technical vocabulary
```

Target allocation:

```text
160 Episodes
```

Use several projects.

No single repository may provide more than:

```text
40 Episodes
```

Initial candidate families:

```text
VOICEVOX ecosystem
sakura-editor
Vivliostyle
KazumaProject/JapaneseKeyboard
Project PLATEAU
other license-compatible Japanese OSS projects
```

Do NOT assume all repositories listed above automatically permit benchmark
redistribution.

For each repository:

1. record repository license,
2. record content source URL,
3. preserve attribution,
4. if redistribution of raw issue/comment text is unclear, store references
   and derived annotations instead of redistributing full text.

Preferred episode types:

```text
issue → discussion → PR
Japanese requirement → implementation
bug report → fix
feature request → design/implementation
documentation work
release coordination
```

---

## G. Figma Community / Public Design Artifacts

Primary purpose:

```text
design hierarchy
page / frame / component relationships
design artifact structure
presentation/design direction
```

Target allocation:

```text
60 Episodes
```

Important:

Figma Community is NOT expected to provide rich work-history traces equivalent
to internal Figma comments/version history.

Use it mainly for:

```text
Design artifact decomposition
L0/L1/L2/L3 hypothesis testing
screen/component hierarchy
design direction evidence
presentation artifacts
```

If public Figma Slides templates or design decks are used:

- record original creator,
- record source,
- record license,
- preserve attribution,
- do not infer missing discussion history.

---

## H. Apache Public Mailing Lists

Primary purpose:

```text
long-form technical discussion
proposal
decision
vote
direction
coordination
```

Target allocation:

```text
80 Episodes
```

Prefer threads such as:

```text
[DISCUSS]
[PROPOSAL]
[VOTE]
release planning
architecture discussion
migration planning
```

These are especially useful for:

```text
L0 Direction
L1 Project
L2 Milestone / Coordination
Decision relations
```

---

# 6. Episode Allocation

The first 1,000 Gold Candidates must follow this approximate distribution:

| Source family | Episodes |
|---|---:|
| Public Jira Dataset | 200 |
| SmartSHARK | 180 |
| Slack Chats | 120 |
| DISCO | 80 |
| Wikimedia | 120 |
| Japanese OSS | 160 |
| Figma Community / public design | 60 |
| Apache Mailing Lists | 80 |
| **Total** | **1,000** |

Deviation of ±10% per source is allowed if data quality requires it.

The total must remain:

```text
>= 1,000 valid Gold Candidates
```

---

# 7. Language Targets

Target minimum:

```text
English       700
Japanese      220
Mixed          80
-----------------
Total        1000
```

"Mixed" means the Episode naturally contains both Japanese and English.

Do NOT create mixed examples by artificial translation only.

---

# 8. Work-Type Distribution

Try to cover:

| Work Type | Target |
|---|---:|
| Bug / incident | 180 |
| Feature | 180 |
| Refactor / architecture | 120 |
| Documentation | 80 |
| Testing / verification | 80 |
| Infrastructure / CI | 80 |
| Release / coordination | 100 |
| Performance | 50 |
| Migration | 50 |
| Design / UX | 50 |
| Research / proposal / decision | 30 |

Approximate balance is acceptable.

Do not sacrifice quality to exactly match counts.

---

# 9. Difficulty Distribution

Target:

```text
Easy          150
Medium        300
Hard          350
Adversarial   200
```

At least 55% of the benchmark must NOT be trivial explicit-reference cases.

---

# 10. Provisional 4-Level Work Ontology

Use this as a hypothesis, not a fixed truth.

```text
L0 — DIRECTION
L1 — PROJECT / OUTCOME
L2 — MILESTONE / COORDINATION
L3 — TASK / ACTION
```

---

## L0 — Direction

Question:

```text
Why / in what broad direction is the work moving?
```

Examples:

```text
Improve reliability
Move to local-first architecture
Reduce onboarding friction
Support Japanese input better
```

---

## L1 — Project / Outcome

Question:

```text
What major outcome is being pursued?
```

Examples:

```text
Ship authentication redesign
Add ARM support
Complete migration to new storage system
Release v3
```

---

## L2 — Milestone / Coordination

Question:

```text
What intermediate state, deadline, dependency checkpoint,
or coordination objective exists?
```

Examples:

```text
Finish schema before beta
Resolve blockers before release candidate
Complete design review
Synchronize frontend and backend rollout
```

---

## L3 — Task / Action

Question:

```text
What concrete work can be performed and finished?
```

Examples:

```text
Fix redirect URI validation
Write test
Update docs
Review PR
Change component state
```

---

# 11. Ontology Failure Is Valid

If a real work node does not fit cleanly into L0–L3, use:

```text
UNKNOWN_LEVEL
ONTOLOGY_MISMATCH
```

and record:

```text
why it does not fit
what new category may be needed
```

Do NOT force it into the closest class.

The first 1,000 are partly intended to discover whether the 4-level ontology
is actually correct.

---

# 12. Relation Types

Keep both pairwise and structural relations.

---

## 12.1 Pairwise relation

```text
SAME_WORK
RELATED_DIFFERENT_WORK
UNRELATED
UNCERTAIN
```

These answer:

```text
Are two pieces of evidence about the same work?
```

---

## 12.2 Structural graph relations

Initial candidates:

```text
PARENT_OF
CHILD_OF
CONTRIBUTES_TO
IMPLEMENTS
VERIFIES
REVIEWS
DEPENDS_ON
BLOCKS
PRECEDES
FOLLOWS
DUPLICATE_OF
EVIDENCE_FOR
CONTRADICTS
SUPERSEDES
SPLIT_FROM
MERGED_INTO
```

Allow:

```text
UNKNOWN_RELATION
```

if reality does not fit.

Do not create an edge without supporting evidence.

---

# 13. Required Episode Output Schema

Each Episode should be stored as JSON.

Suggested path:

```text
eval/classifier/gold_candidate_v0/episodes/
```

Example:

```json
{
  "episode_id": "GC-000001",
  "dataset_id": "smartshark",
  "project_id": "example-project",
  "language": "en",
  "difficulty": "hard",
  "work_type": "bug",
  "provenance": {
    "source_family": "SmartSHARK",
    "dataset_version": "...",
    "source_urls": [],
    "license": "...",
    "retrieved_at": "...",
    "raw_hashes": []
  },
  "sources": [],
  "semantic_atoms": [],
  "work_nodes": [],
  "relations": [],
  "evidence_map": [],
  "timeline": [],
  "ambiguities": [],
  "negative_candidates": [],
  "annotation": {
    "proposed_by": "gpt",
    "independent_review": null,
    "human_verified": false,
    "confidence": "medium",
    "rationale": ""
  }
}
```

---

# 14. SourceRecord Schema

Each source record should include:

```text
source_id
provider
dataset
project
source_type
external_id
source_url/reference
timestamp
author_anonymized
title
content
explicit_refs
structured_relations
metadata
license
provenance
```

Do not include secrets or credentials.

---

# 15. Semantic Atom Extraction

A single SourceRecord may produce multiple atoms.

Example:

```text
"OAuth callback is still failing. I'll patch the redirect validation today."
```

Atoms:

```text
A1:
OAuth callback is failing.

A2:
The author intends to patch redirect validation.

A3:
The planned time is today.
```

Each atom must preserve:

```text
atom_id
source_id
exact_evidence_span
normalized_statement
semantic_type
certainty
time_reference
actor/entity refs
```

Do not hallucinate implicit facts.

---

# 16. Work Node Reconstruction

The annotator/GPT should identify candidate work nodes from atoms.

Each node:

```text
node_id
title
level
goal
done_condition
status
time_window
evidence_refs
confidence
```

If done condition is not observable:

```text
done_condition: null
```

Do not invent one.

---

# 17. Evidence Rules

Every important node and relation must have evidence.

Valid evidence:

```text
explicit issue/PR reference
parent-child link
blocking relation
quoted text
commit message
review relation
revision history
thread context
timestamp/sequence
milestone membership
```

Invalid evidence:

```text
"it seems likely"
embedding similarity alone
same author alone
same repository alone
same keyword alone
same date alone
```

---

# 18. Episode Construction

Each Episode should contain a meaningful neighborhood.

Preferred size:

```text
5–30 SourceRecords
```

Some complex Episodes may exceed this.

Each Episode should include:

```text
positive evidence
related-but-different evidence
at least one plausible distractor when possible
```

Do not create an Episode containing only trivially linked records.

---

# 19. Hard Positive Cases

Create many cases where surface similarity is low but work identity is high.

Example:

```text
Issue:
"OAuth callback returns 500"

Slack:
"redirect URI slash was missing, fixing it now"
```

Expected:

```text
SAME_WORK
```

despite low lexical overlap.

Target:

```text
>= 150 hard-positive cases
```

across the 1,000 Episodes.

---

# 20. Hard Negative Cases

Create many cases where surface similarity is high but work identity differs.

Example:

```text
A:
Fix Qwen 27B startup

B:
Benchmark Qwen 35B throughput
```

Both involve Qwen/classifier/AWS, but may be separate Tasks/WorkUnits.

Target:

```text
>= 200 hard-negative cases
```

---

# 21. Uncertain Cases

Real work data is incomplete.

Target:

```text
>= 150 Episodes
```

must contain at least one meaningful uncertainty.

Use:

```text
UNCERTAIN
UNKNOWN_LEVEL
UNKNOWN_RELATION
MISSING_CONTEXT
UNRESOLVED_NODE_BOUNDARY
```

Do not clean away ambiguity.

---

# 22. Adversarial Cases

At least 200 Episodes should contain one or more of:

```text
same words, different work
different words, same work
same issue number in different repos
duplicate
reopened issue
rollback
revert
hotfix + permanent fix
one PR fixes multiple issues
multiple PRs for one issue
task split
task merge
changed deadline
changed owner
superseded plan
cross-repository work
ambiguous pronoun
missing explicit reference
same milestone but independent work
parent issue with independent children
discussion drifting into a second task
```

---

# 23. Japanese-Specific Requirements

The Japanese subset must include:

```text
native Japanese issue text
Japanese technical vocabulary
English identifiers mixed into Japanese
Japanese progress language
Japanese ambiguity
Japanese ellipsis / omitted subject
Japanese references such as:
  "例の件"
  "さっきのやつ"
  "これ"
  "前の修正"
```

Do NOT only use translated English examples.

Target:

```text
>= 220 Japanese Episodes
>= 80 naturally mixed Episodes
```

---

# 24. Figma / Design Artifact Rules

For public design artifacts:

Extract only what is actually observable.

Possible nodes:

```text
design direction
screen
flow
component
variant
presentation section
prototype relation
```

Do NOT invent:

```text
who requested the change
why the design changed
what comment existed
what review happened
```

unless the source actually provides evidence.

If only artifact structure exists, mark it as:

```text
ARTIFACT_ONLY_EPISODE
```

These should not dominate the benchmark.

---

# 25. Docs-Like Public Data Rules

For Wikimedia / public collaborative editing:

Use:

```text
revision
discussion
task
review
revert
page move
change sequence
```

as observable evidence.

This is a proxy for collaborative document work.

Do NOT label it as literally:

```text
Google Docs
```

The benchmark should store provider/source accurately.

---

# 26. GPT Annotation Workflow

GPT may perform most of the annotation work.

For every candidate Episode:

### Pass A — Reconstruction

GPT receives only raw source evidence.

It outputs:

```text
semantic atoms
work nodes
levels
relations
timeline
ambiguities
rationale
```

---

### Pass B — Independent Critic

Use a separate context/run.

The critic receives:

```text
raw source evidence
Pass A annotation
```

and must answer:

```text
SUPPORTED
PARTIALLY_SUPPORTED
UNSUPPORTED
```

for each node/relation.

It must specifically detect:

```text
invented goals
invented deadlines
invented dependencies
over-merging
over-splitting
forced ontology labels
```

---

### Pass C — Repair

Only repair based on source evidence.

Do not "make the graph cleaner" by inventing missing facts.

---

# 27. Gold Candidate Acceptance Gate

An Episode can enter Gold Candidate v0 only if:

- [ ] provenance exists
- [ ] source URL/reference exists
- [ ] license/status recorded
- [ ] raw evidence retained or reproducibly referenceable
- [ ] no unsupported invented source records
- [ ] semantic atoms map to evidence
- [ ] work nodes map to evidence
- [ ] relations map to evidence
- [ ] ambiguity is preserved
- [ ] independent critic completed
- [ ] no critical unsupported claims remain
- [ ] JSON schema validation passes

---

# 28. Reject Conditions

Reject the Episode if:

```text
source cannot be traced
license/provenance cannot be determined
underlying source is fabricated
too little context to form any useful work structure
annotation depends mainly on outside assumptions
duplicate of another benchmark Episode
contains secrets/private personal data
cannot be redistributed or referenced safely under dataset policy
```

Rejected candidates should be logged, not silently deleted.

---

# 29. Deduplication

Deduplicate at several levels:

```text
source-level hash
episode-level source overlap
same issue/PR neighborhood
near-identical text
same work graph derived twice
```

Do not count translated copies as independent episodes.

---

# 30. Project Diversity

No single project may provide more than:

```text
5% of the 1,000
```

i.e.:

```text
max 50 Episodes/project
```

For Japanese OSS, prefer:

```text
max 40 Episodes/repository
```

No single ecosystem should dominate more than:

```text
25%
```

---

# 31. Split Policy

Even at Candidate stage, assign a provisional split.

Split by PROJECT, not random Episode.

Suggested:

```text
TRAIN-CANDIDATE   600
DEV-CANDIDATE     150
TEST-CANDIDATE    250
```

Important:

The future final Test projects must not be used for fine-tuning.

---

# 32. Fine-Tuning Separation

These 1,000 are primarily:

```text
evaluation + ontology discovery candidates
```

They are NOT automatically fine-tuning data.

Future training data must be built from:

```text
different projects
or
non-overlapping project partitions
```

Never use:

```text
final test episode
final test project
```

for training.

---

# 33. Directory Structure

Recommended:

```text
eval/classifier/
├── external_sources/
│   ├── MANIFEST.yaml
│   └── licenses/
│
├── raw_index/
│   ├── jira/
│   ├── smartshark/
│   ├── slack/
│   ├── disco/
│   ├── wikimedia/
│   ├── japanese_oss/
│   ├── figma/
│   └── apache_mail/
│
├── silver/
│   └── episodes/
│
├── gold_candidate_v0/
│   ├── README.md
│   ├── schema/
│   ├── episodes/
│   ├── reports/
│   └── rejected/
│
└── scripts/
    ├── import/
    ├── normalize/
    ├── sample/
    ├── annotate/
    ├── validate/
    └── report/
```

---

# 34. Manifest

Create:

```text
eval/classifier/external_sources/MANIFEST.yaml
```

For every source:

```yaml
dataset_id:
name:
source_url:
version:
retrieved_at:
license:
redistribution_policy:
attribution_required:
contains_personal_data:
anonymized:
source_types:
language:
known_limitations:
checksum:
local_path:
notes:
```

No dataset may enter the pipeline without a manifest entry.

---

# 35. Implementation Order

## Phase 1 — Infrastructure

Build:

```text
ExternalSourceRecordV1
EpisodeCandidateV1
GoldCandidateEpisodeV1
schema validation
manifest validation
deduplication
reporting
```

---

## Phase 2 — First 100

Create:

```text
100 Episodes
```

Recommended:

```text
Jira          25
SmartSHARK    20
Slack         10
DISCO          5
Wikimedia     15
Japanese OSS  15
Figma          5
Apache Mail    5
```

Run complete annotation and critic process.

Do not continue blindly if the schema fails.

---

## Phase 3 — Ontology Checkpoint #1

After 100 Episodes, generate:

```text
ontology_discovery_100.md
```

Answer:

```text
Does L0/L1/L2/L3 fit?
What does not fit?
Are Project and Outcome the same?
Are Milestone and Coordination the same?
Do we need Micro-Action?
Do we need Decision as a node type?
Do we need Artifact as a separate node type?
Which relations recur?
Which relations are not observable?
```

Revise schema only when evidence supports it.

---

## Phase 4 — Expand to 250

Create:

```text
250 total
```

Then generate:

```text
ontology_discovery_250.md
```

This is the first meaningful ontology checkpoint.

---

## Phase 5 — Expand to 500

Create:

```text
500 total
```

At this point measure:

```text
level distribution
relation distribution
source distribution
language distribution
difficulty distribution
uncertainty frequency
annotation disagreement rate
ontology mismatch rate
```

---

## Phase 6 — Expand to 1,000

Complete all target distributions.

Generate final:

```text
gold_candidate_v0_report.md
ontology_discovery_1000.md
dataset_card.md
```

---

# 36. Required Reports

## report 1 — source coverage

```text
episodes per dataset
projects per dataset
languages
source types
licenses
rejected counts
```

---

## report 2 — ontology discovery

```text
L0 count
L1 count
L2 count
L3 count
UNKNOWN_LEVEL count
ontology mismatch count
```

---

## report 3 — relation coverage

```text
SAME_WORK
RELATED_DIFFERENT_WORK
UNRELATED
UNCERTAIN

PARENT_OF
CONTRIBUTES_TO
IMPLEMENTS
DEPENDS_ON
BLOCKS
DUPLICATE_OF
...
```

---

## report 4 — quality

```text
unsupported claim rate
critic rejection rate
duplicate rate
ambiguous episode rate
schema failure rate
source provenance failure rate
```

---

# 37. Quality Targets for Candidate v0

Before declaring 1,000 complete:

```text
Schema pass rate                  100%
Traceable provenance              100%
Critical unsupported claims         0%
Duplicate Episode rate             <1%
Japanese Episodes                 >=220
Mixed Episodes                     >=80
Hard/adversarial Episodes         >=550 combined
Episodes with uncertainty         >=150
Projects represented              >=30
Source families represented         8
```

---

# 38. Human Review Strategy

Do NOT require the human to create all 1,000 from scratch.

Instead:

```text
GPT builds candidate
↓
GPT critic checks candidate
↓
human reviews
```

Human review priority:

```text
100% of adversarial cases
100% of ontology mismatch cases
100% of future TEST candidates
sample of easy/medium cases
```

After human review:

```text
candidate_status:
  PENDING
  ACCEPTED
  REJECTED
  NEEDS_REVISION
```

Only `ACCEPTED` becomes Final Gold.

---

# 39. Important Anti-Leakage Rule

If an Episode is assigned to future Test:

```text
do not use it for:
- fine-tuning
- prompt optimization
- ontology tuning after freeze
- retrieval tuning
- few-shot examples
```

Test means test.

---

# 40. GPT / Agent System Instruction

Use the following instruction for the agent executing this plan:

```text
You are building Atra's external Work Reconstruction benchmark.

Your job is not to invent clean examples.

Your job is to reconstruct real work from public source evidence.

For every conclusion:
- preserve provenance,
- cite supporting SourceRecords,
- preserve ambiguity,
- do not force the 4-level ontology,
- never use lexical similarity alone as work identity,
- never convert Silver metadata directly into Gold truth,
- do not manufacture missing discussions, goals, deadlines, owners, or relations.

If evidence is insufficient:
return UNKNOWN or UNCERTAIN.

Quality is more important than reaching the count quickly.
However, the pipeline should be automated enough to scale to 1,000 episodes.
```

---

# 41. Agent Completion Report

When finished, output:

```md
# Gold Candidate v0 Completion Report

## Total
Valid Episodes: 1000
Rejected Candidates: X

## Source distribution
...

## Language distribution
English:
Japanese:
Mixed:

## Project count
...

## Work levels
L0:
L1:
L2:
L3:
Unknown:

## Pair relations
...

## Structural relations
...

## Difficulty
...

## Ontology failures
...

## Unsupported claims found by critic
...

## Human-review priority queue
...

## Recommended ontology changes
...

## Ready for Final Gold review?
YES / NO
```

---

# 42. Definition of Done

This task is DONE only when:

- [ ] 1,000 valid external Gold Candidates exist
- [ ] all are based on real public source evidence
- [ ] every candidate has provenance
- [ ] every candidate has GPT reconstruction
- [ ] every candidate has independent critic result
- [ ] every candidate passes schema
- [ ] at least 220 Japanese Episodes exist
- [ ] at least 80 mixed-language Episodes exist
- [ ] source-family quotas are reasonably satisfied
- [ ] project diversity constraints are satisfied
- [ ] hard positives and hard negatives exist at scale
- [ ] ambiguity/unknown states are preserved
- [ ] ontology discovery reports at 100/250/500/1000 exist
- [ ] future train/dev/test project partitions are assigned
- [ ] test leakage rules are recorded
- [ ] dataset card exists
- [ ] no AWS/Qwen dependency is required to complete this phase

---

# 43. Final Principle

The first 1,000 are not:

```text
"1,000 examples invented by GPT"
```

They are:

```text
1,000 real work episodes
        ↓
reconstructed by GPT
        ↓
challenged by an independent critic
        ↓
prepared for human verification
```

The benchmark should teach us what work actually looks like before we decide
what Atra's ontology must look like.


---

# 44. AFTER GOLD CANDIDATE v0 — Sync Latest GitHub and Repair Integration

This phase starts **only after the 1,000 Gold Candidate v0 Episodes are complete**
and all required reports have been generated.

Goal:

> Bring the classifier work onto the latest repository state without losing
> classifier assets, then actually execute the repository and repair important
> integration failures.

This is not a rewrite.

This is a **safe integration + verification + repair phase**.

---

## 44.1 Core Rule

Preserve both:

```text
A. Latest upstream repository state
B. Existing classifier / Work Reconstruction assets
```

Do NOT solve divergence by deleting either side.

In particular, preserve useful classifier assets such as:

```text
docs/classifier/*
eval/classifier/*
classifier schemas
ontology work
Gold Candidate pipeline
retrieval / relation / grouping work
model gateway abstractions
AWS/Qwen infrastructure code
tests
agent handoff / classifier state documents
```

unless a file is proven obsolete and the replacement is documented.

---

# 45. Before touching Git history

First inspect the current workspace.

Run:

```bash
git status
git branch --show-current
git remote -v
git log --oneline --decorate -20
```

Check for:

```text
uncommitted changes
untracked files
local commits not pushed
generated benchmark files
large downloaded datasets
```

Do NOT discard anything.

If there are meaningful uncommitted changes:

```text
commit them
OR
create a clearly named backup branch
```

Do not use:

```bash
git reset --hard
git clean -fd
```

unless the user explicitly authorizes destructive cleanup.

---

# 46. Create a safety snapshot

Before syncing upstream, create a local safety branch.

Example:

```bash
git switch codex/classifier-work-reconstruction
git branch backup/classifier-before-upstream-sync-YYYYMMDD-HHMM
```

If the current classifier branch has another name, use that branch instead.

Also record:

```bash
git rev-parse HEAD
git rev-parse origin/main
```

in the integration report.

---

# 47. Fetch the latest repository state

Run:

```bash
git fetch --all --prune
```

Then inspect:

```bash
git log --oneline --decorate --graph --all -40
git diff --stat HEAD..origin/main
git diff --stat origin/main..HEAD
git merge-base HEAD origin/main
```

The agent must understand:

```text
what main changed
what classifier changed
what overlaps
```

before merging.

Do not blindly accept all conflicts from one side.

---

# 48. Create an integration branch

Create a dedicated branch from the current classifier branch.

Example:

```bash
git switch codex/classifier-work-reconstruction
git switch -c integration/classifier-latest-main
```

Then integrate the latest `origin/main`.

Preferred first strategy:

```bash
git merge --no-ff origin/main
```

Reason:

- preserves classifier history,
- preserves upstream history,
- avoids rewriting classifier commits,
- makes conflict resolution auditable.

Do NOT force-push rewritten history as the default strategy.

---

# 49. Conflict Resolution Authority

When conflicts occur, do not resolve them mechanically.

Use this authority model.

## 49.1 Product authority

For current Atra product direction and current documentation authority:

```text
PRODUCT_STATE.md
docs/current/
current main governance files
```

take precedence.

If current upstream says:

```text
PRODUCT_DIRECTION = UNRESOLVED
```

do NOT reintroduce older classifier documents as if Work Reconstruction is the
confirmed product direction.

Classifier work must be framed as:

```text
Technical Asset
Experiment
Subsystem Candidate
Evaluation Track
```

until product direction explicitly changes.

---

## 49.2 Classifier technical authority

For classifier-specific technical assets:

```text
classifier contracts
schemas
Golden Set
evaluation harness
relation ontology
grouping rules
model gateway
Qwen/AWS experiment infrastructure
```

preserve the classifier branch unless newer upstream code clearly supersedes it.

Do not delete a classifier implementation merely because `main` does not yet
contain it.

---

# 50. Reconcile documentation after merge

After the Git merge, inspect and repair documentation drift.

At minimum inspect:

```text
PRODUCT_STATE.md
docs/current/
docs/classifier/
eval/classifier/
README files
agent/state files
```

Remove or repair:

```text
stale product claims
duplicated canonical definitions
dead links
conflicting status statements
obsolete branch names
references to deleted files
```

Do NOT remove historical documents merely to make tests green.

Archive or mark historical status where appropriate.

---

# 51. Execute the repository

Do not stop at "merge completed".

Actually run the project.

First inspect the repository's package/tooling configuration:

```text
package.json
pnpm-lock.yaml
package-lock.json
yarn.lock
turbo.json
tsconfig.json
vitest/jest config
CI workflows
Makefile
scripts/
```

Then use the repository's canonical commands.

Typical examples:

```bash
npm ci
npm test
npm run typecheck
npm run lint
npm run build
```

or the equivalent pnpm/yarn commands defined by the repository.

Do not invent commands if the project already documents them.

---

# 52. Classifier-specific execution

Run all classifier-related validation that exists or can safely be added.

At minimum verify:

```text
schema validation
fixture loading
Golden Candidate parsing
provenance validation
manifest validation
deduplication tests
relation/grouping tests
constraint-gate tests
work-graph validation
dataset report generation
```

The 1,000 Episode corpus must be test-loadable.

Target:

```text
1000/1000 valid JSON/schema load
0 broken provenance references where locally verifiable
0 duplicate IDs
0 impossible graph references
0 dangling evidence references
```

---

# 53. No AWS dependency for this integration phase

The repository must remain usable while AWS/Qwen inference is unavailable.

Therefore:

```text
tests must not require live AWS
tests must not require GPU
tests must not create paid resources
tests must not deploy CloudFormation
```

Use:

```text
MockGateway
FixtureGateway
offline evaluation
schema tests
deterministic grouping tests
```

where necessary.

AWS integration tests must be:

```text
disabled by default
explicitly opt-in
```

---

# 54. Important Repairs — Priority Order

When failures are discovered, repair them in this order.

## P0 — Data loss / security / destructive behavior

Examples:

```text
classifier files overwritten
benchmark files deleted
credentials exposed
unsafe provider writes
destructive migration
wrong tenant/trust boundary
```

Fix immediately.

---

## P0 — Build / test breakage caused by integration

Examples:

```text
TypeScript compile failure
module import failure
schema incompatibility
broken fixture loader
broken canonical path
```

Fix immediately.

---

## P1 — Contract mismatch

Examples:

```text
SourceRecord shape drift
SemanticAtom schema disagreement
Relation schema disagreement
WorkNode/Graph schema mismatch
old field names still used
```

Repair toward one canonical contract.

Add migration/adapters where necessary instead of silently dropping fields.

---

## P1 — Classifier correctness invariants

Verify and repair:

```text
UNCERTAIN remains valid
embedding/reranker does not define truth
hard constraints override model output
A SAME B + B SAME C does not automatically imply A SAME C
evidence remains traceable
corrections remain append-only where required
```

---

## P1 — Golden Set integrity

Repair:

```text
missing provenance
broken source references
duplicate episode IDs
wrong project split
train/test leakage
unsupported annotation claims
schema violations
```

---

## P2 — Developer Experience

After correctness:

```text
simplify scripts
improve error messages
remove dead duplicate helpers
document canonical commands
speed up offline validation
```

Do not prioritize cosmetic refactors over correctness.

---

# 55. Run tests iteratively

Use a repair loop:

```text
run
↓
capture failure
↓
identify root cause
↓
make smallest correct repair
↓
add/regress test
↓
rerun focused test
↓
rerun broader suite
```

Do not make large speculative refactors while a smaller fix is sufficient.

---

# 56. Preserve existing working behavior

Before changing an existing classifier behavior:

1. find the relevant test,
2. determine whether behavior is intentional,
3. compare with current classifier contracts,
4. compare with new Gold Candidate findings,
5. only then modify it.

If changing behavior is necessary, add a regression test explaining the new
contract.

---

# 57. Use the Golden Set to repair classifier architecture

After integration is stable, use the 1,000 Gold Candidates to identify
structural gaps.

Generate:

```text
classifier_gap_report_after_1000.md
```

It must answer:

```text
What work structures cannot current classifier represent?
Which L0/L1/L2/L3 cases fail?
Which relation types are missing?
Which graph relations are currently impossible?
Where does existing schema force information loss?
Where does grouping over-merge?
Where does grouping over-split?
Which provider/source types are unsupported?
```

Then classify each finding:

```text
P0 blocker
P1 required before model evaluation
P2 improvement
P3 research question
```

---

# 58. Repair only evidence-backed important gaps

Important:

Do not redesign the entire classifier simply because the new benchmark contains
new patterns.

For each proposed change, require:

```text
1. concrete Gold Candidate examples
2. recurring pattern count
3. current failure mode
4. proposed contract change
5. compatibility impact
6. regression test
```

A one-off strange example should not automatically change the ontology.

---

# 59. Update classifier state after integration

Update the classifier master/current-state document.

It should accurately state:

```text
current branch
latest integrated upstream commit
Gold Candidate count
implemented stages
partial stages
not implemented stages
AWS availability
offline-capable components
known blockers
next recommended tasks
```

Do not leave historical status like:

```text
S2–S9 NOT_IMPLEMENTED
```

if the repository now contains real implementations.

Likewise do not claim implementation exists if only docs/fixtures exist.

---

# 60. Reassess S0–S9 after the merge

Create a fresh evidence-backed table:

| Stage | Status | Evidence | Tests | Remaining gap |
|---|---|---|---|---|
| S0 SourceRecord | | | | |
| S1 Sanitize | | | | |
| S2 Semantic Atom | | | | |
| S3 Retrieval | | | | |
| S4 Rerank | | | | |
| S5 Relation | | | | |
| S6 Constraints | | | | |
| S7 Grouping | | | | |
| S8 WorkUnit / Work Graph | | | | |
| S9 Correction / lineage | | | | |

Allowed status values:

```text
NOT_STARTED
SKELETON
PARTIAL
PROVEN_BOUNDED
IMPLEMENTED_UNVALIDATED
VALIDATED
BLOCKED_EXTERNAL
```

Do not use vague percentages without evidence.

---

# 61. Keep model infrastructure, but isolate external dependency

Preserve existing Qwen/AWS infrastructure work such as:

```text
CloudFormation
model pinning
vLLM configuration
SSH tunnel design
EBS encryption
no-public-endpoint defaults
GPU instance mappings
```

unless superseded by a safer/newer implementation.

However ensure the rest of the classifier can run without it.

Architecture should remain conceptually similar to:

```text
Classifier Domain
      |
ModelGateway interface
      |
+--------------------------+
| FixtureGateway           |
| MockGateway              |
| AwsQwenGateway           |
+--------------------------+
```

AWS unavailability must not block:

```text
Golden Set
ontology
schemas
constraints
grouping
graph formation tests
evaluation code
```

---

# 62. Security / Cost Guard

During this phase:

DO NOT:

```text
create EC2 instances
deploy CloudFormation
create EIPs
create NAT Gateways
download paid models from restricted sources
change AWS billing resources
write production provider data
```

unless explicitly requested by the user later.

All cloud deployment remains opt-in.

---

# 63. Git commit strategy

Make small auditable commits.

Recommended sequence:

```text
1. chore: sync latest main into classifier integration branch
2. fix: resolve classifier contract conflicts
3. test: restore classifier and benchmark validation
4. fix: repair high-priority integration failures
5. docs: update classifier state after 1000-episode benchmark
```

Do not combine thousands of generated dataset files with unrelated source-code
repairs in one opaque commit when avoidable.

---

# 64. Do not push destructive history automatically

By default:

```text
do not force push
do not rewrite main
do not delete remote branches
```

Prepare the integration branch and report the result.

If repository policy allows and the user explicitly wants it later, the branch
can be pushed / opened as a PR.

---

# 65. Required Final Verification

Before declaring the integration phase complete:

- [ ] latest `origin/main` has been fetched
- [ ] classifier safety snapshot exists
- [ ] integration branch exists
- [ ] latest main is integrated
- [ ] no classifier assets were accidentally discarded
- [ ] product authority conflicts are resolved correctly
- [ ] repository installs successfully
- [ ] build/typecheck succeeds where applicable
- [ ] core tests pass
- [ ] classifier tests pass
- [ ] all 1,000 Gold Candidates schema-load successfully
- [ ] provenance validator passes
- [ ] no duplicate Episode IDs
- [ ] no train/test leakage detected by project
- [ ] AWS is not required for default tests
- [ ] important P0/P1 integration bugs are repaired
- [ ] S0–S9 status has been reassessed
- [ ] classifier gap report exists
- [ ] current-state docs are updated
- [ ] remaining blockers are explicit

---

# 66. Final Integration Report

Create:

```text
docs/classifier/reports/post_gold_1000_integration_report.md
```

with:

```md
# Post Gold-1000 Integration Report

## Git state

Classifier starting commit:
Latest upstream main commit:
Integration branch:
Merge commit:

## Preserved classifier assets

- ...

## Upstream changes integrated

- ...

## Conflicts

- file:
  cause:
  resolution:

## Commands executed

- ...

## Test results

- build:
- typecheck:
- unit:
- classifier:
- benchmark:
- provenance:
- leakage:

## Important repairs made

### P0
- ...

### P1
- ...

## Gold Candidate v0

Episodes:
Languages:
Projects:
Source families:

## S0–S9 status

| Stage | Status | Evidence | Remaining Gap |
|---|---|---|---|

## Architecture gaps discovered from the 1,000 Episodes

- ...

## AWS-dependent blockers

- ...

## Offline work that can continue

- ...

## Remaining unresolved items

- ...

## Recommended next 5 tasks

1.
2.
3.
4.
5.
```

---

# 67. Final Definition of Done

The full task is complete only when BOTH are true:

## Dataset phase

```text
1,000 Gold Candidate v0 Episodes complete
```

AND

## Repository integration phase

```text
latest upstream integrated
classifier preserved
repository executed
important P0/P1 issues repaired
tests rerun
classifier state updated
```

The desired final state is:

```text
Latest Atra repository
        +
Preserved Work Reconstruction technical assets
        +
1,000 external Gold Candidates
        +
Offline-testable classifier foundation
        +
Known and documented remaining gaps
```

Do not stop merely because Git merged successfully.

The repository must be **executed, tested, inspected, and repaired**.
