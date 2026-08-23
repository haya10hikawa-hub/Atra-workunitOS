# Production Build Status

This is the resumable ledger for `docs/PRODUCTION_BUILD_PLAN.md`. Agents update it at every phase boundary. Never claim an external check passed without evidence.

```yaml
schema_version: 1
updated_at: "2026-08-23T04:24:54Z"
current_phase: P7
overall_state: BUILDING
phases:
  P0: BUILDING
  P1: BUILDING
  P2: BUILDING
  P3: BUILDING
  P4: PASS_WITH_EXTERNAL_GAPS
  P5: PASS_WITH_EXTERNAL_GAPS
  P6: PASS_WITH_EXTERNAL_GAPS
  P7: PARTIAL_MVP_ONLY
  P8: PARTIAL_MVP_ONLY
  P9: NOT_STARTED
  P10: PARTIAL_MVP_ONLY
  P11: NOT_STARTED
evidence:
  - phase: P0
    acceptance_criterion: "Local TypeScript workspace bootstraps and verifies without secrets."
    command_or_artifact: "package.json; npm run test; npm run lint; npm run typecheck; npm run build"
    result: "PASS: 37 Vitest tests, ESLint, TypeScript typecheck, and build passed on 2026-08-21."
    date: "2026-08-21"
  - phase: P2-P10
    acceptance_criterion: "Synthetic MVP contracts/workflow exist."
    command_or_artifact: "backend/connectors, backend/retrieval, backend/gold, frontend, evaluation, tests"
    result: "PARTIAL_MVP_ONLY: deterministic synthetic fixtures and local SQLite workflow exist; they do not satisfy production source acquisition, real Hugging Face inference, durable services/UI, QA operations, or production release governance."
    date: "2026-08-21"
  - phase: P1
    acceptance_criterion: "Recorded-response Public Jira and OpenTelemetry GitHub acquisition is deterministic and restartable at the contract boundary."
    command_or_artifact: "tests/acquisition-contracts.test.ts; backend/connectors/src/index.ts"
    result: "PASS: two recorded-response adapters emit stable canonical SourceRecords, payload hashes, deterministic acquisition IDs, and resumable rate-limit state. Persistent acquisition storage and live source activation remain incomplete."
    date: "2026-08-21"
  - phase: P3
    acceptance_criterion: "Offline inference service contract and immutable model registry load."
    command_or_artifact: "python3 -m unittest inference.tests.test_service; inference/service.py; inference/config/production-models.json"
    result: "PARTIAL: registry, deterministic non-production embedding/rerank contracts, and Hugging Face revision metadata helpers pass contract tests; HTTP endpoints and live model runtime remain incomplete."
    date: "2026-08-22"
  - phase: P3-P5
    acceptance_criterion: "Pinned primary Hugging Face artifacts are locally reproducible and transferable."
    command_or_artifact: "HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 .venv-inference/bin/python inference/verify_local_models.py; inference/config/production-models.json; models/huggingface"
    result: "PASS: exact primary embedding and reranker revisions were downloaded, SHA-256 values were recorded, custom architecture code was vendored, and both models loaded from local files with network access disabled. Embedding hidden_size is 768 and reranker num_labels is 1. Actual embedding pooling and pair-scoring integration remain P4/P5 work."
    date: "2026-08-23"
  - phase: P4
    acceptance_criterion: "Vector retrieval creates deterministic cross-provider top-K candidates without Gold access."
    command_or_artifact: "backend/retrieval/src/index.ts; tests/vector-retrieval-reranking.test.ts"
    result: "PASS_WITH_EXTERNAL_GAPS: local vector index, embedding lineage records, cross-provider top-K, self/exact-duplicate exclusion, deterministic tie-breaking, score bands, and no-Gold dependency boundary pass offline tests. Live production embedding execution remains NOT_RUN_EXTERNAL."
    date: "2026-08-22"
  - phase: P5
    acceptance_criterion: "Reranking stage can rerank retrieved vector candidates with traceable adapter contracts."
    command_or_artifact: "backend/retrieval/src/index.ts; inference/service.py; inference/tests/test_service.py; tests/vector-retrieval-reranking.test.ts"
    result: "PASS_WITH_EXTERNAL_GAPS: vector candidates are reranked through a test-double-compatible Reranker boundary, Python rerank contract returns scores and lineage, and pinned Hugging Face embedding/reranker revisions were externally resolved through the Hugging Face model API. Live CrossEncoder execution remains NOT_RUN_EXTERNAL."
    date: "2026-08-22"
  - phase: P6
    acceptance_criterion: "Candidate batches are restart-persistent before annotation."
    command_or_artifact: "backend/gold/src/sqlite.ts; tests/candidate-batch-persistence.test.ts"
    result: "PARTIAL: SQLite stores vector candidate batches immutably and rejects byte-different rewrites. Feature-based balanced sampling remains incomplete."
    date: "2026-08-22"
  - phase: P6
    acceptance_criterion: "Feature-based deterministic sampling can turn vector/reranked candidates into a bounded annotation batch."
    command_or_artifact: "backend/retrieval/src/index.ts; tests/vector-retrieval-reranking.test.ts"
    result: "PASS_WITH_EXTERNAL_GAPS: sampling now buckets candidates by retrieval/reranker score pattern and identifier presence, applies deterministic seed ordering, enforces quotas/max pair counts, and reports shortages. Production family-level split isolation and richer people/time/hierarchy features remain later P6 hardening."
    date: "2026-08-22"
  - phase: P6-P7
    acceptance_criterion: "Needle-style classification and slot filling are available as schema-bound derived artifacts before durable annotation APIs."
    command_or_artifact: "packages/gold-contracts/src/index.ts; inference/service.py; tests/schema-validation.test.ts; inference/tests/test_service.py; docs/adr/0013-needle-style-classification-and-slot-filling.md"
    result: "PASS: StructuredSignal contracts define narrow work-signal classification and bounded slot filling with evidence spans, confidence, and NOT_WORK validation. Python inference now exposes a deterministic classification/slot-filling contract for CI. These outputs remain derived features, not Gold labels."
    date: "2026-08-23"
external_blockers:
  - missing_authority: "Public source-specific acquisition/export approvals and pinned source snapshot authority"
    affected_check: "P1 live Public Jira/OpenTelemetry GitHub acquisition and release export verification"
    completed_fallback_work: "Synthetic fixtures and an AMI local-input connector exist; no restricted corpus content was acquired or committed."
    activation_command: "npm run acquire -- --source public-jira --snapshot <approved-snapshot>"
    expected_evidence: "Restartable snapshot/job records with approved license/export policy, stable IDs, and identical rerun hashes."
    other_phases_can_continue: true
next_action: "Implement P7 durable blinded annotation/adjudication service APIs over persisted candidate batches."
```

Allowed states: `NOT_STARTED`, `BUILDING`, `VERIFYING`, `FIXING`, `PASS`, `PASS_WITH_EXTERNAL_GAPS`, `BLOCKED`. `PARTIAL_MVP_ONLY` is an implementation-progress annotation, not a completion state.

Each evidence entry must include phase, acceptance criterion, command or artifact, result, and date. Each external blocker must include the missing authority, affected check, completed fallback work, activation command, and whether other phases can continue.
