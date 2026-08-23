# Beyond MVP Roadmap

The MVP proves the end-to-end Gold Set loop. It is not the stopping point. After MVP, the platform should become a durable production-quality system for trusted cross-provider work-unit evaluation.

## North star

The long-term system should support repeated Gold releases across multiple source families, with clear provenance, reliable annotation operations, strong leakage prevention, and evaluation reports that can guide Atra without contaminating Atra's runtime grouping models.

## Production readiness areas

### 1. Data governance and access control

Needed after MVP:

- source-level access policy
- restricted text handling
- export modes per source: full text, excerpt, reference-only, hash-only
- annotator and adjudicator permissions
- audit logs for evidence access and label changes
- retention policy for raw payloads, derived data, and frozen exports

Acceptance signal:

- every release can explain what content is included, why it is allowed, and who had access.

### 2. Scalable storage and lineage

Needed after MVP:

- migration path from local SQLite/filesystem to Postgres plus object storage
- immutable release artifact storage
- raw snapshot lineage
- derived artifact lineage for chunks, embeddings, rerank scores, sampling policies, annotations, adjudications, and exports
- reproducible manifests with hashes

Acceptance signal:

- a past release can be rebuilt or audited from pinned snapshots and versions.

### 3. Connector expansion

MVP starts with Public Jira and OpenTelemetry GitHub plus authorized Google Docs. Production should add source families behind the same contract:

- QMSum
- SmartSHARK
- AMI
- ECB+
- MAVEN-ERE

Needed:

- license review for each source
- connector fixtures
- parser versioning
- provider-specific chunking tests
- source defect reporting
- source coverage dashboards

Acceptance signal:

- each connector emits canonical `SourceRecord` and `Chunk` records with stable provenance and no label inference.

### 4. Annotation operations

Needed after MVP:

- annotator calibration batches
- guideline version changelog
- queue management
- assignment balancing
- conflict-of-interest rules
- adjudicator workload view
- quality audits
- inter-annotator agreement tracking by provider, label, work type, and challenge bucket

Acceptance signal:

- the team can run repeat annotation batches with measurable quality and clear disagreement resolution.

### 5. Sampling strategy maturity

Needed after MVP:

- configurable quota policies
- staged replenishment without leakage
- group-level split management
- challenge bucket monitoring
- duplicate and near-duplicate family detection
- score-band calibration
- per-provider sampling health checks

Acceptance signal:

- each Gold release has balanced evaluation value instead of simply reflecting retrieval similarity.

### 6. Evaluation maturity

Needed after MVP:

- read-only evaluation API or CLI
- candidate recall at multiple K values
- pairwise and cluster-level metrics
- transitivity violation analysis
- error slices by source pair, work type, score band, identifier presence, evidence length, and challenge bucket
- regression comparison across Atra model versions
- release-to-release comparability notes

Acceptance signal:

- a model change can be evaluated without using frozen labels for tuning.

### 7. Security and privacy

Needed after MVP:

- secret scanning
- dependency audit
- local restricted-data ignore rules
- access logs
- export redaction checks
- private-source test strategy
- least-privilege service credentials

Acceptance signal:

- no private documents, credentials, or restricted raw corpora are committed or exported accidentally.

### 8. Product completeness

Needed after MVP:

- reviewer-friendly annotation UI
- keyboard-efficient labeling
- evidence span selection
- source context expansion
- adjudication UI
- release dashboard
- QA dashboard
- export download and manifest inspection
- clear empty, loading, error, and permission states

Acceptance signal:

- annotators and adjudicators can complete real batches without developer assistance.

### 9. Observability and operations

Needed after MVP:

- structured logs
- deterministic job IDs
- retry-safe ingestion and retrieval jobs
- job status tracking
- batch-level metrics
- failure reports
- release validation summaries

Acceptance signal:

- failed jobs can be diagnosed and rerun without corrupting state.

### 10. Documentation and governance

Needed after MVP:

- ADRs for major decisions
- release datasheet template
- sampling report template
- quality report template
- source license notes
- annotator onboarding guide
- runbook for freeze/export
- runbook for leakage incidents

Acceptance signal:

- a new engineer or annotation lead can run the system from docs and scripts.

## Suggested post-MVP phases

### Phase 8: Production storage and release lineage

Move from local MVP storage assumptions to migration-backed metadata and immutable artifact storage.

### Phase 9: Real connector expansion

Add QMSum, SmartSHARK, AMI, ECB+, and MAVEN-ERE after license/export review.

### Phase 10: Annotation operations

Build calibration, queue management, adjudication ergonomics, and agreement dashboards.

### Phase 11: Evaluation regression suite

Create repeatable model comparison reports across Atra grouping versions.

### Phase 12: Security, privacy, and release governance

Add security checks, export redaction, access policies, incident runbooks, and release approval gates.

## Do not stop at MVP checklist

After the MVP passes, immediately ask:

- Can this run on a second source snapshot without code changes?
- Can a release be audited six months later?
- Are restricted sources protected by default?
- Can annotators operate without seeing model hints?
- Can adjudicators resolve disagreement with enough context?
- Can evaluation compare multiple Atra model versions safely?
- Can source expansion happen without changing the core schema?
- Are all remaining decisions tracked in `docs/OPEN_DECISIONS.md` or ADRs?

