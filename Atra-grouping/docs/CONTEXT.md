# Project Context

## What this project is

Atra needs to decide whether records from different providers refer to the same unit of work. Examples include GitHub issues, Google Docs meeting notes, Jira issues, meeting transcript turns, commits, pull requests, and event mentions in benchmark corpora.

This repository defines and will implement a Gold Set Annotation Platform for that problem. The platform retrieves candidate evidence automatically, then asks humans to make the final truth judgment through blind annotation and adjudication.

## Product goal

The goal is not to build a generic semantic search demo. The goal is to produce a trustworthy, versioned, auditable evaluation Gold Set for Atra's work-unit grouping system.

The final Gold Set should help answer:

- Can Atra identify when two provider records describe the same completion unit?
- Can it avoid merging merely related records?
- Can it handle project/task/milestone granularity correctly?
- Can it remain robust against misleading identifiers, shared topics, same people, or high embedding similarity?

## Core framing from the design discussion

The target annotation card is evidence-first:

```text
Gold #000184

Anchor
Provider: GitHub
Issue: #341
Text:
OAuth callback returns HTTP 500

Candidate Evidence
Provider: Google Docs
Doc: Specification Meeting 8/20
Lines: 212-218

"...the OAuth callback issue appears
to be caused by the token refresh.
Alex will submit a fix..."

Human Annotation

Relation:
SAME_WORK
RELATED
DIFFERENT_WORK
UNKNOWN

Work Type:
TASK
PROJECT
MILESTONE
UNKNOWN
```

The UI may simplify visible options for a pilot, but the stored taxonomy is wider: `INITIATIVE`, `PROJECT`, `TASK`, `SUBTASK`, `MILESTONE`, `NOT_WORK`, and `UNKNOWN`.

## Important decisions already made

- Gold is for evaluation only.
- Candidate retrieval uses models, but human labels are the source of truth.
- The candidate path is `gte -> Ettin -> human annotation`.
- The system must intentionally include misleading, reverse, and hard-negative cases.
- `SAME_WORK`, `RELATED`, `DIFFERENT_WORK`, and `UNKNOWN` must all appear in useful coverage.
- Project-like, task-like, milestone-like, non-work, and ambiguous cases must all be represented.
- Two independent annotators judge release-eligible pairs without seeing each other's labels.
- Disagreements and low-confidence cases go through adjudication.
- Frozen Gold releases are immutable and exported with manifests, checksums, provenance, and sampling/quality reports.

## What must not happen

- Do not train, tune, rank, retrieve, prompt, or threshold against frozen Gold labels.
- Do not treat high semantic similarity as identity.
- Do not treat the same issue ID, doc mention, person, meeting, or timestamp as automatic identity.
- Do not rewrite source evidence. Store derived summaries, translations, chunks, spans, embeddings, and scores separately.
- Do not force a binary answer when evidence is insufficient. `UNKNOWN` is a valid label.

## Working assumption for implementation

The MVP should prove the full path with a small authorized snapshot before scaling:

`SourceRecord -> Chunk -> CandidatePair -> blind dual Annotation -> Adjudication -> GoldRelease -> Evaluation`

