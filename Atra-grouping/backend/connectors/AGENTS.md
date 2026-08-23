# Connector Agent Rules

Read `../../AGENTS.md` and `../../docs/DESIGN.md` first. This subtree owns acquisition and conversion into canonical `SourceRecord` objects.

## Responsibilities

- Implement provider adapters for QMSum, Public Jira, OpenTelemetry GitHub, authorized Google Docs, SmartSHARK, AMI, ECB+, and MAVEN-ERE.
- Preserve native IDs, parent/link structure, speakers, timestamps, line/character offsets, source URI, snapshot, license, and raw content hash.
- Store original evidence immutably; keep translation, summaries, and extracted features as derived records.
- Make ingestion deterministic, restartable, incremental where possible, and idempotent for the same snapshot/parser version.
- Emit explicit missing values rather than inventing content.

## Boundaries

- Do not generate candidates, scores, labels, or annotation hypotheses.
- Do not interpret event coreference as `SAME_WORK`; connectors preserve source-native relations only.
- Do not commit credentials, private Google Docs content, or restricted corpus material.
- Do not silently fetch a moving “latest” dataset. Record snapshot and parser versions.

## Required tests

- Contract validation for every emitted record
- Stable IDs and hashes across repeated ingestion
- Offset/line round trips to original evidence
- Provider relationship preservation
- Malformed, deleted, rate-limited, and partially missing source behavior
- License-aware fixture/export behavior
