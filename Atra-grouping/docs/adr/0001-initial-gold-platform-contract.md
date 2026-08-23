# ADR 0001: Initial Gold Platform Contract

## Status

Accepted

## Context

Atra needs an evaluation Gold Set for cross-provider work-unit grouping. The system must identify when two records represent the same work while avoiding false merges caused by semantic similarity, shared identifiers, same people, close timestamps, or broad project context.

The project discussed using multiple public or authorized source families: QMSum, Public Jira, OpenTelemetry GitHub plus Google Docs, SmartSHARK, AMI, ECB+, and MAVEN-ERE.

## Decision

Use this canonical pipeline:

`SourceRecord -> Chunk -> CandidatePair -> Annotation -> Adjudication -> GoldRelease`

Use these relation labels:

- `SAME_WORK`
- `RELATED`
- `DIFFERENT_WORK`
- `UNKNOWN`

Use explicit work-type labels:

- `INITIATIVE`
- `PROJECT`
- `TASK`
- `SUBTASK`
- `MILESTONE`
- `NOT_WORK`
- `UNKNOWN`

Candidate generation will use `gte` retrieval, then `Ettin` reranking, then blind human annotation. Frozen Gold labels are evaluation-only and must not feed retrieval, reranking, embeddings, prompts, threshold tuning, or training.

## Consequences

- All implementation areas must preserve source provenance and versioning.
- Annotation must hide model scores, sample buckets, peer labels, and Gold status.
- Sampling must include hard negatives and intentional reverse examples.
- Disagreements and low-confidence cases require adjudication.
- Gold releases are immutable snapshots with manifests, checksums, and export policy.

