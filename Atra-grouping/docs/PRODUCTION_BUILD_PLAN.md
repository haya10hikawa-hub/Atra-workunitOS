# Gold Platform Production Build Plan

## Scope

This plan covers only the platform that creates trustworthy Gold Sets. It ends at immutable, license-aware export. Semantic Judge training, Atra runtime grouping, WorkUnit clustering, and external action execution are excluded.

## Target production line

`real source acquisition -> SourceRecord normalization -> provider-aware Chunking -> pinned Hugging Face embeddings -> vector retrieval -> pinned Hugging Face reranking -> balanced sampling -> blind dual annotation -> independent adjudication -> QA -> immutable GoldRelease -> license-aware export`

## Conservative implementation defaults

Use these defaults unless an accepted ADR says otherwise:

- TypeScript remains authoritative for contracts, workflow, API, UI, release, and QA.
- A Python inference service owns PyTorch/Sentence Transformers model execution.
- Primary multilingual embedding: `Alibaba-NLP/gte-multilingual-base` pinned to an immutable Hugging Face commit.
- Primary multilingual reranker: `Alibaba-NLP/gte-multilingual-reranker-base` pinned to an immutable Hugging Face commit.
- Comparative adapters: `BAAI/bge-m3` and `BAAI/bge-reranker-v2-m3`.
- English-only calibration adapters: `Alibaba-NLP/gte-modernbert-base` and `cross-encoder/ettin-reranker-150m-v1`; never treat them as validated Japanese production models.
- SQLite and a local ignored object store are acceptable for the single-node pilot; storage interfaces and migrations must permit Postgres plus object storage later.
- Restricted evidence defaults to reference-only export.
- Frozen evaluation Gold is physically/logically separate from development annotations and is never read by retrieval or sampling.

Every model configuration must record model ID, immutable revision, tokenizer revision, model-file hash when available, dimension, context limit, truncation, normalization, dtype, inference mode, and input hash.

## Phase ledger

### P0 — Decisions and reproducible local runtime

- [ ] Record ADRs for model revisions, inference deployment, vector storage, source/export policy, annotation identity, split policy, and retention.
- [ ] Provide one local bootstrap command and environment template with no real secrets.
- [ ] Add structured job states including `NOT_RUN_EXTERNAL`.
- [ ] Create and maintain `docs/PRODUCTION_BUILD_STATUS.md`.

Exit: a new developer can install, test, and identify every pinned production dependency from documentation alone.

### P1 — Real source acquisition and canonical normalization

- [ ] Replace the fixture-only connector contract with restartable acquisition/sync contracts.
- [ ] Implement snapshot, cursor, pagination, retry/backoff, rate-limit, partial-failure, idempotency, parser-version, license, and raw-payload-hash behavior.
- [ ] Implement at least two real public/authorized source families, beginning with Public Jira and OpenTelemetry GitHub; keep authorized Google Docs reference-safe.
- [ ] Persist source snapshots, records, acquisition jobs, and structured failures.
- [ ] Preserve native IDs, hierarchy, links, authors/participants, timestamps, and access/export policy.

Exit: the same pinned public/authorized snapshot runs twice with identical IDs and hashes; credential-only live checks may be `NOT_RUN_EXTERNAL` if contract and recorded-response coverage pass.

### P2 — Provider-aware chunking and derived artifacts

- [ ] Implement provider-native boundaries, token limits, overlap/context policy, title handling, and long-text behavior.
- [ ] Validate Unicode offsets and exact round trips to immutable canonical text.
- [ ] Version chunkers and tokenizer-dependent limits.
- [ ] Store language detection, redaction, translation, and summaries only as lineage-linked derived artifacts.
- [ ] Add malformed, deleted, missing-field, and source-defect tests.

Exit: every chunk traces exactly to a source slice and survives multilingual/Unicode regression tests.

### P3 — Real Hugging Face embedding service

- [ ] Add a Python service with health, readiness, batch embedding, structured errors, timeout, OOM handling, and deterministic configuration.
- [ ] Implement the pinned GTE multilingual adapter and BGE-M3 comparison adapter.
- [ ] Persist embeddings and complete model/input lineage; invalidate cache on any relevant version/config change.
- [ ] Keep deterministic local test doubles for hermetic CI without calling them production models.
- [ ] Add local CPU smoke and optional GPU benchmark profiles.

Exit: fixture and permitted public chunks produce dimension-checked normalized vectors through the real model adapter, or external model acquisition is explicitly evidenced as `NOT_RUN_EXTERNAL` while the service contract and offline artifact path pass.

### P4 — Vector retrieval

- [ ] Add a versioned vector-store abstraction and a working pilot implementation.
- [ ] Implement cross-provider top-K retrieval, tenant/source-policy filters, self/exact-duplicate exclusion, deterministic tie-breaking, and index rebuilds.
- [ ] Persist retrieval runs, rank, score, config hash, and index version.
- [ ] Measure candidate recall@K on development/calibration fixtures only.

Exit: restartable top-K retrieval produces traceable, deterministic candidate inputs without Gold access.

### P5 — Real Hugging Face reranking

- [ ] Implement the pinned GTE multilingual CrossEncoder adapter and BGE reranker comparison adapter.
- [ ] Implement pair formatting, pair truncation, batching, raw-score semantics, timeout/OOM behavior, and cache lineage.
- [ ] Rerank retrieved top-K and persist reranker score/rank/config.
- [ ] Keep Ettin as an English-only comparison adapter.

Exit: a candidate batch records real pinned reranker output and deterministic lineage; hermetic CI remains offline-capable.

### P6 — Balanced, versioned sampling and split isolation

- [ ] Replace ordinal fixture bucket assignment with feature-based construction policies.
- [ ] Cover provider pairs, score bands, identifier presence, hierarchy, people/time overlap, evidence lengths, controls, reverse cases, hard negatives, and ambiguity.
- [ ] Implement quotas, deterministic seeds, shortage reports, family/near-duplicate grouping, and family-level splits.
- [ ] Add automated dependency and lineage checks proving no frozen Gold, adjudication, or label-derived feature reaches retrieval or sampling.

Exit: a reproducible batch has documented coverage and passes leakage/split gates.

### P7 — Durable candidate and annotation services

- [ ] Persist candidate batches, pairs, model runs, sampling runs, assignments, append-only annotations, source defects, adjudications, and audit events.
- [ ] Add versioned HTTP APIs for queueing, blinded payloads, autosave, submission, defects, adjudication, QA, freeze, and export.
- [ ] Add idempotency, optimistic concurrency, safe errors, and restart recovery.
- [ ] Enforce roles for admin, manager, annotator, adjudicator, release manager, and auditor.

Exit: two distinct identities can complete a durable blind workflow after process restart without forbidden metadata crossing the API.

### P8 — Production annotation and adjudication UI

- [ ] Build symmetric evidence views with provenance and context expansion.
- [ ] Implement all relation/work-type labels, evidence spans, reason codes, confidence, notes, autosave, resume, validation, keyboard flow, and accessibility.
- [ ] Ensure scores, ranks, buckets, hypotheses, peer answers, and Gold state are absent from independent annotation responses and analytics.
- [ ] Build independent-first adjudication, then controlled peer-decision reveal and reasoned final submission.
- [ ] Build source/job/batch/assignment/release operations views with loading, empty, error, and permission states.

Exit: annotators and adjudicators can finish a real pilot without developer intervention, and blindness contract tests pass.

### P9 — QA and annotation operations

- [ ] Add calibration batches, queue balancing, low-confidence routing, random audits, source-defect handling, and guideline issue tracking.
- [ ] Report raw agreement and chance-adjusted agreement by relation, work type, provider pair, language, and challenge bucket.
- [ ] Version guidelines and retain old annotation semantics append-only.
- [ ] Generate completeness, disagreement, adjudication, evidence-span, and coverage reports.

Exit: release managers can explain annotation quality and every unresolved case is blocked from freeze.

### P10 — Immutable freeze and license-aware export

- [ ] Enforce provenance, dual annotation, adjudication, schema, license, split, leakage, checksum, and version-pin gates.
- [ ] Generate deterministic manifest, labels, pairs, permitted evidence references/excerpts, datasheet, sampling report, quality report, guideline, changelog, and checksums.
- [ ] Support full-text, excerpt, reference-only, and hash-only policies per source, defaulting restricted material to reference-only.
- [ ] Prevent overwrite; corrections create a new semantic version with `supersedes`.
- [ ] Verify byte-stable recreation and immutable artifact storage.

Exit: a reproducible Gold release can be audited from export back to source snapshot and cannot be mutated in place.

### P11 — Security, observability, deployment, and final audit

- [ ] Add least-privilege secrets, encryption, source ACLs, access logs, redaction checks, retention/deletion policy, dependency/secret scanning, backup/restore, and incident runbooks.
- [ ] Add structured logs, deterministic job IDs, retries, dead-letter handling, metrics, alerts, model latency/resource monitoring, and release validation summaries.
- [ ] Provide local, staging, and production deployment/runbooks with migrations and rollback.
- [ ] Run an independent final review covering semantics, blindness, leakage, lineage, licensing, immutability, security, accessibility, restartability, and reproducibility.

Exit: `npm run verify`, inference-service checks, end-to-end pilot, export recreation, security checks, and independent review pass; unavailable credential-bound checks are the only permitted `NOT_RUN_EXTERNAL` items and must not affect release safety.

## Global definition of done

The platform is complete only when an authorized two-source snapshot can run twice deterministically through every stage, two humans can annotate blindly, a third can adjudicate required cases, QA can block unsafe release, and an immutable license-aware export can be recreated and audited without frozen Gold influencing candidate creation.
