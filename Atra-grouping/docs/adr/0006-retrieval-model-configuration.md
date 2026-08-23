# ADR 0006: Retrieval Model Configuration

## Status

Accepted

## Context

Model identities must be pinned without allowing Gold outcomes to tune runtime retrieval.

## Decision

Retrieval and reranking configuration is versioned, immutable per candidate batch, and contains model name, revision, dimension/context limits, batch settings, and inference mode. Gold releases record the already-produced candidate model versions only. Gold labels, adjudications, analysis fields, and frozen-release contents cannot be configuration inputs.

The deterministic fixture gte/Ettin implementations remain the local default until owners select production model revisions.

## Consequences

- Model changes are traceable and comparable in read-only evaluation.
- Production model selection is an explicit owner decision, not an implicit code change.