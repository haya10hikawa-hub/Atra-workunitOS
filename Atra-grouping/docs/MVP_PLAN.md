# MVP Plan

## MVP outcome

The MVP is complete when an authorized two-source snapshot can run end-to-end twice with deterministic results:

`SourceRecord -> Chunk -> CandidatePair -> blind dual Annotation -> Adjudication -> GoldRelease -> Evaluation`

It must produce a reproducible frozen Gold release and evaluate at least one baseline without leaking Gold labels back into candidate generation or model tuning.

MVP is a checkpoint, not the final destination. Once the MVP passes, continue with `docs/BEYOND_MVP_ROADMAP.md` to harden storage, governance, connector coverage, annotation operations, evaluation regression, security, and release management.

## Phase 1: Contracts and fixtures

Deliver:

- canonical schemas for `SourceRecord`, `Chunk`, `CandidatePair`, `Annotation`, `Adjudication`, and `GoldRelease`
- relation and work-type enums
- reason codes
- synthetic cross-provider fixtures
- schema validation tests
- ID and provenance conventions

Done when fixtures can validate and round-trip without source text mutation.

## Phase 2: Two-source ingestion

Start with:

- Public Jira
- OpenTelemetry GitHub plus authorized Google Docs

Deliver:

- connector interface
- immutable source records
- provider-aware chunks
- source snapshot metadata
- license/export notes

Done when both sources emit the same contracts and can be re-run deterministically.

## Phase 3: Candidate generation

Deliver:

- pinned gte embedding configuration
- deterministic nearest-neighbor retrieval
- pinned Ettin reranking configuration
- exact duplicate prevention
- versioned sampling policy
- hard-negative and reverse bucket assignment

Done when candidate batches include score bands, provider coverage, easy controls, and challenge buckets.

## Phase 4: Annotation UI/API

Deliver:

- evidence-first annotation view
- relation and work-type controls
- provenance display
- evidence-span capture
- reason codes
- confidence and notes
- autosave
- blind dual assignment
- audit log

Done when two independent annotators can complete the same batch without seeing model scores or peer labels.

## Phase 5: Adjudication and QA

Deliver:

- disagreement queue
- low-confidence queue
- adjudicator decision form
- source-defect tracking
- agreement reports
- slice counts by provider, label, work type, score band, and challenge bucket

Done when every release-eligible pair has a validated final decision.

## Phase 6: Freeze and export

Deliver:

- freeze validation gate
- immutable release manifest
- machine-readable labels
- license-aware evidence export
- datasheet
- sampling report
- quality report
- checksums
- semantic versioning and `supersedes`

Done when a release can be recreated and older releases remain reproducible.

## Phase 7: Evaluation harness

Deliver:

- candidate recall at K
- relation macro F1 and per-class metrics
- `SAME_WORK` precision/recall
- work-type macro F1 and rollups
- confusion matrix
- provider/challenge/score-band slices
- graph grouping metrics and transitivity checks
- leakage checks

Done when baseline reports can run read-only against a frozen release.

## First implementation sequence

1. Add schemas and validators.
2. Add synthetic fixtures that represent all critical labels and hard-negative buckets.
3. Implement Public Jira ingestion.
4. Implement OpenTelemetry GitHub and Google Docs ingestion behind the same interface.
5. Implement chunking and deterministic IDs.
6. Add gte retrieval and Ettin reranking as versioned pluggable stages.
7. Build the annotation API and minimal UI.
8. Add adjudication, freeze/export, and evaluation.
9. Run the final MVP review prompt in `docs/DEVELOPMENT_START.md`.
10. If MVP passes, start the post-MVP roadmap in `docs/BEYOND_MVP_ROADMAP.md`.
