# Gold Workflow Agent Rules

Read `../../AGENTS.md` and `../../docs/DESIGN.md` first. This subtree owns human truth: assignments, annotations, adjudication, audit history, release validation, freeze, and export.

## Workflow rules

- Assign every release-eligible pair to two independent annotators.
- Enforce blindness to scores, ranks, sampling reasons, model suggestions, peer decisions, and Gold state.
- Store relation plus anchor/candidate work type using only canonical enums.
- Treat `UNKNOWN` as a valid outcome; never auto-resolve it from similarity.
- Keep annotations append-only. Corrections create superseding events with actor, timestamp, and reason.
- Route relation disagreement, material work-type disagreement, low confidence, and audit samples to adjudication.
- Require a reasoned adjudication tied to the input annotation IDs and guideline version.

## Freeze/export rules

- Run completeness, provenance, dual-annotation, adjudication, leakage, license, split, schema, and checksum gates.
- A frozen release is immutable. A correction creates a new semantic version and changelog.
- Export only evidence permitted by its source license; otherwise export stable references, spans, and hashes.
- Include manifest, schemas, guidelines, source/policy/model versions, sampling and quality reports, and checksums.

## Required tests

- independent assignment and access controls
- valid state transitions and concurrent-save behavior
- enum and evidence-span validation
- disagreement routing and adjudication audit trail
- freeze rejection for every incomplete/unsafe condition
- byte-stable deterministic export and immutable release behavior
