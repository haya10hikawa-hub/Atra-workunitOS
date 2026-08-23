# ADR 0009: Confidence and Guideline Governance

## Status

Accepted

## Context

Confidence is human-provided evidence quality metadata, not a retrieval signal. Guidelines require stable release pinning.

## Decision

Annotations retain their original confidence and guideline version append-only. Confidence must not alter candidate generation, ranking, sampling quotas, grouping, prompts, or thresholds. Freeze pins one guideline version. Guideline changes require a changelog/ADR and do not rewrite historical annotations; a correction creates superseding events and a new release.

## Consequences

- Confidence supports QA and adjudication routing only.
- Old and new release labels remain auditable under their original guidance.