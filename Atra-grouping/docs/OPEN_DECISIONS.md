# Open Decisions

This document lists decisions that should be resolved before or during implementation. Do not hide these choices in code. When a decision becomes stable, create an ADR under `docs/adr/`.

## Must decide before the first working MVP

### Runtime stack

Decision needed:

- backend language and framework
- frontend framework
- package manager and monorepo layout
- test runner
- local development command

Recommended default:

- TypeScript monorepo
- backend: Node.js with a small HTTP API
- frontend: React/Vite
- validation: Zod or JSON Schema
- tests: Vitest

Reason: schemas, API contracts, annotation UI, and deterministic fixtures can share types cleanly.

### Storage

Decision needed:

- database engine
- object-store layout for raw payloads and restricted source snapshots
- migration tool
- release artifact location

Recommended default for MVP:

- SQLite for local MVP metadata
- filesystem object store under ignored local data paths
- later migration path to Postgres plus object storage

Gold releases must be immutable regardless of storage choice.

### Source access and licensing

Decision needed:

- which datasets are allowed in Git fixtures
- which sources are local-only
- whether Google Docs text may be exported or only referenced
- snapshot dates and license notes per source

Recommended default:

- use synthetic fixtures first
- treat Google Docs and any restricted corpora as reference/hash-only until export policy is explicit

### Model identifiers

Decision needed:

- exact gte embedding model name and revision
- exact Ettin reranker model name and revision
- context limits
- local vs hosted inference
- deterministic batch settings

Recommended default:

- configure model identifiers, revisions, dimensions, context windows, and batch sizes in versioned config
- never hard-code model settings in retrieval logic

### Annotation identity and permissions

Decision needed:

- annotator identity model
- access control for source evidence
- whether annotator IDs are pseudonymous in exports
- adjudicator role separation

Recommended default:

- pseudonymous annotator IDs in exported QA reports
- internal audit log keeps stable identity references
- annotators cannot adjudicate their own pair in the same release

### Gold split policy

Decision needed:

- train/dev/evaluation dataset boundaries
- work-family grouping method before split
- whether this repo only handles evaluation Gold or also stores development annotations

Recommended default:

- keep frozen evaluation Gold separate from development annotations
- split by linked work family, not candidate pair
- block exports if leakage checks fail

### Sampling quotas

Decision needed:

- target batch size
- minimum coverage by relation, work type, provider pair, score band, and challenge bucket
- replenishment rules after annotation

Recommended default:

- pilot with small deterministic batches
- track intended bucket separately from human label
- replenish only through a versioned sampling policy

### Label guideline governance

Decision needed:

- who can update label guidelines
- guideline versioning format
- whether old annotations are migrated or kept under old guideline versions

Recommended default:

- append-only annotations keep original guideline version
- guideline changes require ADR or changelog entry
- releases pin a single guideline version

## Decisions that can wait until after the first MVP

- exact production deployment target
- full authentication provider
- large-scale vector index engine
- advanced active learning
- multilingual translation strategy
- reviewer productivity analytics
- full data retention policy beyond pilot constraints

## Decision template

Use this when adding ADRs:

```md
# ADR NNNN: Title

## Status

Proposed | Accepted | Superseded

## Context

What forced this decision?

## Decision

What are we choosing?

## Consequences

What gets easier, harder, or constrained?
```

