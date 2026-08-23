# Stage 3 Production-Readiness Backlog

This backlog converts the post-MVP roadmap into ordered, leakage-safe implementation slices. Every slice retains Gold as evaluation-only and uses the build -> verify -> fix -> reverify loop.

## Phase 8 — storage and lineage

- [x] ADR 0004 local SQLite metadata and content-addressed artifact baseline.
- [x] Immutable local persistence for assignment, annotation, adjudication, release metadata, and reference-only export artifacts.
- [x] Durable local workflow rehydration and restart tests.
- [ ] Explicit persistent terminal-batch mode with actor selection and resume semantics.
- [ ] Release supersession workflow and correction-event lineage.
- [ ] Package-local compiled runtime exports; remove direct TypeScript-source package loading.

## Phase 9 — connector expansion (blocked pending source decisions)

For QMSum, SmartSHARK, AMI, ECB+, and MAVEN-ERE:

1. Record license, permitted local access, redistributable fixture scope, and export classification under ADR 0005.
2. Add only redistributable synthetic/public fixture tests first.
3. Implement connector normalization and provider-aware chunking.
4. Add source coverage and provenance tests.

No connector may ingest or export restricted evidence before its source decision is recorded.

## Phase 10 — annotation operations

- Calibration batch creation and immutable guideline changelog.
- Assignment balancing and conflict-of-interest enforcement from ADR 0007.
- Persistent terminal queue/resume flow, adjudicator evidence-first review, and audit sampling.
- Agreement reports by relation, work type, provider pair, and challenge bucket.
- Work-family linkage and split validation from ADR 0008.

## Phase 11 — evaluation regression suite

- Read-only model-version comparison input contract.
- Candidate recall-at-K, pairwise metrics, cluster metrics, transitivity analysis, and 12-axis error slices.
- Release-to-release comparability report that rejects unpinned model/snapshot/policy metadata.

## Phase 12 — security, privacy, and release governance

- Source-policy enforcement from ADR 0005 and export-redaction assertions.
- Local evidence-access audit logs and retention configuration.
- Release approval/validation summaries, datasheet, sampling report, and quality report templates.
- Structured job logs, deterministic job IDs, retry-safe failure reporting, and operator runbooks.

## External decision gates

- Production model revisions and inference deployment provider (ADR 0006 records the safe configuration rule but does not select a vendor/model).
- Source-specific license/access/export decisions for Phase 9 datasets.
- Production authentication and authorization provider; ADR 0007 supplies the local pseudonymous contract only.
- Production Postgres/object-storage deployment choice after local workflow behavior is validated.
