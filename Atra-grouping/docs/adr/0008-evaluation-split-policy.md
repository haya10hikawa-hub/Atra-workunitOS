# ADR 0008: Evaluation Split Policy

## Status

Accepted

## Context

Evaluation Gold must remain independent of training and avoid work-family leakage.

## Decision

This repository treats frozen Gold as evaluation-only. Dataset splits are assigned by linked work family before candidate sampling; a family cannot span train, development, and evaluation releases. Export and freeze validation must reject an unknown or mixed family split when family metadata becomes available. Until work-family linkage is implemented, fixture releases are evaluation-only and declare the limitation explicitly.

## Consequences

- Frozen labels remain unavailable to runtime grouping and training.
- Work-family extraction is a required Phase 10/11 backlog item.