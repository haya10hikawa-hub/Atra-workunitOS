# ADR 0010: Sampling Policy and Quota Governance

## Status

Accepted

## Context

Sampling needs production maturity without using human labels as runtime features.

## Decision

Sampling policies are versioned immutable inputs to a batch and declare quotas by provider pair, challenge bucket, score band, and work-type coverage where source evidence permits. Intended sampling bucket is stored separately from human labels. Replenishment creates a new policy version and candidate batch; it cannot mutate frozen releases. Quotas use pre-label candidate metadata only.

## Consequences

- Sampling health is auditable and leakage-safe.
- Exact production quota targets remain operational configuration, not hidden code.