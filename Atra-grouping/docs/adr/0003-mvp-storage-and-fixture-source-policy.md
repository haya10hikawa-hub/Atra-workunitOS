# ADR 0003: MVP Storage and Fixture Source Policy

## Status

Accepted

## Context

The MVP must demonstrate append-only Gold workflow behavior, immutable releases, source provenance, and export constraints without credentials or restricted raw sources. The production storage engine and source access controls remain post-MVP decisions.

## Decision

Use deterministic in-memory repositories for the executable synthetic-fixture MVP. The repository accepts only synthetic Public Jira, OpenTelemetry GitHub, and Google Docs reference-safe fixture inputs. Every fixture source record has `license: synthetic-test-fixture`; no private or restricted text is stored or exported.

The MVP freeze operation creates a deep-frozen, content-hashed release artifact in memory. Its export mode is `full_text` only for the synthetic fixture license. The default for a non-synthetic source is `reference_only`, containing stable source references, offsets, and hashes rather than body text.

Production storage moves to migration-backed Postgres metadata plus immutable object storage after an ADR covering deployment, retention, access control, and artifact layout.

## Consequences

- The MVP proves workflow semantics and byte-stable manifests, not durable process-restart persistence.
- Restricted source acquisition and export are explicitly blocked until a source-specific license/access ADR exists.
- Freeze/export code must select export fields by policy and never make text availability implicit.
- Production persistence and access control are mandatory Stage 3 work.
