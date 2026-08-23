# ADR 0005: Source Access and Export Policy

## Status

Accepted

## Context

Stage 3 needs a default that protects restricted source evidence before individual source licenses are reviewed.

## Decision

All sources are classified as `PUBLIC_REDISTRIBUTABLE`, `RESTRICTED_REFERENCE_ONLY`, or `SYNTHETIC`. Until a source-specific license note explicitly permits otherwise, exports are reference-only: stable source IDs, URIs, permitted offsets, and content hashes only. Raw bodies, excerpts, and derived text remain local and are never placed in fixture releases. Every source-family connector must declare its classification and policy version.

QMSum, SmartSHARK, AMI, ECB+, and MAVEN-ERE connector implementations are blocked until their license, access, and export classification are recorded.

## Consequences

- Fixture releases remain safe by default.
- Connector expansion has an explicit, auditable external decision gate.
- Release manifests can explain export eligibility without exposing evidence.