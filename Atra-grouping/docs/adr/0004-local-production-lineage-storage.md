# ADR 0004: Local Production-Lineage Storage Baseline

## Status

Accepted

## Context

Stage 2 proves the Gold workflow with deterministic in-memory fixture repositories. Stage 3 needs restart-persistent metadata, migration tracking, and immutable artifact lineage while remaining runnable locally without credentials, hosted infrastructure, or private source material.

## Decision

Use Node.js's built-in `node:sqlite` `DatabaseSync` API for the local Stage 3 metadata baseline. Store only local metadata in an ignored SQLite database under `data/local/`; continue to keep raw restricted data out of the repository. Keep freeze artifacts as content-addressed JSON files below ignored `data/generated/releases/<manifest-hash>/`, written once and rejected if a path already exists with different bytes.

Migrations are versioned SQL statements in application code and recorded in a `schema_migrations` table. The local repository is an adapter at the Gold boundary; retrieval continues to have no Gold dependency. A later production ADR may replace this adapter with Postgres metadata and object storage without changing canonical contracts.

## Consequences

- Annotation events, adjudications, and release metadata survive process restart in local development.
- The implementation uses an experimental Node SQLite API on the pinned Node 24 runtime. The runtime command records this as an implementation constraint until the Postgres adapter replaces it.
- Fixture exports remain reference-only unless a source-specific policy explicitly permits text.
- Database and generated artifacts stay ignored and are never committed.
