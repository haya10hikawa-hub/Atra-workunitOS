# ADR 0007: Annotation Identity and Role Separation

## Status

Accepted

## Context

Stage 3 requires stable audit identity while preserving blind dual annotation and export privacy.

## Decision

Local operations use stable pseudonymous actor IDs. Assignment, annotation, and adjudication audit records retain actor IDs locally. Release exports and QA reports use pseudonymous IDs only. An adjudicator may not adjudicate a pair they annotated in the same release. Recipient payloads are scoped to one assigned annotator and never include peer decisions, adjudications, or release state.

## Consequences

- Audit and separation-of-duties checks have a stable local identity basis.
- Production authentication integration remains a later adapter, not a Gold-contract change.