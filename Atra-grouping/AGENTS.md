# Atra Gold Set Annotation Platform

## Mission

Build a trustworthy annotation platform for deciding whether records from different providers refer to the same unit of work. Candidate generation may assist annotators, but humans determine the final truth.

The repository-wide delivery target is the complete Gold production line:

`real source acquisition -> SourceRecord normalization -> provider-aware Chunking -> pinned Hugging Face embeddings -> vector retrieval -> pinned Hugging Face reranking -> balanced sampling -> blind dual annotation -> independent adjudication -> QA -> immutable GoldRelease -> license-aware export`

This repository builds the Gold Set platform only. Runtime Semantic Judge training, Atra production grouping, WorkUnit clustering, and external action execution are out of scope.

Before changing schemas, labels, pipeline boundaries, sampling, evaluation, or export behavior, read `docs/README.md` and `docs/DESIGN.md`. `DESIGN.md` is the repository-wide source of truth. Supporting docs under `docs/` capture project context, label guidance, source plans, sampling/QA rules, open decisions, implementation prompts, and the MVP sequence. A nested `AGENTS.md` adds rules for its subtree; it does not override the design contract.

## Repository boundaries

- `backend/connectors/`: immutable source ingestion and normalization
- `backend/retrieval/`: chunking, gte retrieval, Ettin reranking, and sampling
- `backend/gold/`: annotation workflow, adjudication, freezing, and export
- `frontend/`: evidence-first annotation UI
- `evaluation/`: leakage-safe metrics, slices, and reports
- `data/`: local fixtures and generated artifacts only; never commit credentials or restricted corpora
- `tests/`: contract, integration, and regression tests

## Non-negotiable semantic rules

1. Gold is evaluation-only. Frozen Gold labels, adjudication outcomes, and label-derived features must never enter retrieval, reranking, embeddings, runtime grouping, or training data.
2. Semantic similarity is not identity. Similar wording, topic, people, time, repository, or provider identifiers are evidence—not truth.
3. `SAME_WORK` requires the same completion unit. Parent/child, dependency, follow-up, or shared-project records are normally `RELATED`.
4. `UNKNOWN` is valid when evidence is insufficient or contradictory. Never force a confident label.
5. Canonical source evidence is immutable and traceable. Translation, summary, chunk, embedding, extracted span, and score are derived artifacts.
6. Annotation must be blind to model scores, retrieval rank, the other annotator's decision, and any eventual Gold label.

## Canonical labels

Relation: `SAME_WORK`, `RELATED`, `DIFFERENT_WORK`, `UNKNOWN`.

Work type: `INITIATIVE`, `PROJECT`, `TASK`, `SUBTASK`, `MILESTONE`, `NOT_WORK`, `UNKNOWN`. Product-facing summaries may group `INITIATIVE/PROJECT` as Project and `TASK/SUBTASK` as Task, but stored labels stay explicit.

## Engineering rules

- Preserve stable IDs and provenance through every stage.
- Make pipeline steps deterministic and restartable; version schemas, prompts, models, sampling policies, and datasets.
- Add tests for schema changes and boundary behavior.
- Use synthetic or redistributable fixtures in tests. Do not silently redistribute licensed datasets.
- Never overwrite a frozen Gold release. Create a new version and record lineage.
- Keep secrets out of source control and logs.
- Prefer small changes that maintain the contracts in `docs/DESIGN.md`.

## Continuous delivery contract

When a user asks to build the complete platform or invokes `docs/MASTER_BUILD_PROMPT.md`, continue through every phase in `docs/PRODUCTION_BUILD_PLAN.md`. Do not stop after a scaffold, one passing milestone, an MVP demo, or a planning report while safe in-scope work remains.

- Inspect the current implementation before changing it; resume from the first incomplete acceptance criterion.
- Implement, test, verify, fix, and advance continuously. A failing test is work to resolve, not a reason to stop.
- Do not ask for routine preferences. Use the accepted ADRs and the conservative defaults in `docs/PRODUCTION_BUILD_PLAN.md`, record the choice, and keep moving.
- Missing credentials, private corpora, GPU access, or hosted infrastructure block only the live verification that requires them. Finish interfaces, local adapters, synthetic/public fixtures, recorded-response tests, migrations, UI states, documentation, and a precise activation runbook, then continue with later independent work.
- Never fake live success. Mark unavailable external checks `NOT_RUN_EXTERNAL` with the exact command, required authority, and expected evidence.
- Use real, published Hugging Face model adapters for production paths and deterministic test doubles only for hermetic tests. Pin model IDs, immutable revisions, tokenizer revisions, dimensions, context limits, and input hashes.
- Preserve compatibility at boundaries where practical, but remove dead fixture-only paths once their production replacement and regression coverage are complete.
- Keep a machine-readable progress ledger at `docs/PRODUCTION_BUILD_STATUS.md`; update it after each phase with state, evidence, blockers, and next action.
- Run the full repository verification at every phase boundary. Perform an independent skeptical review before declaring the production line complete.

### Human-stop conditions

Stop and request a decision only when safe progress across all remaining phases is impossible because of one of these conditions:

- a source license or export policy is genuinely ambiguous and no reference-only implementation is safe;
- a requested destructive or irreversible operation needs authorization;
- canonical relation/work-type semantics or Gold leakage rules would need to change;
- two documented owner decisions are incompatible and no backward-compatible implementation exists;
- all remaining work strictly requires unavailable credentials, private data, external infrastructure, or legal approval.

Before stopping, complete every unaffected task and write a resumable blocker record in `docs/PRODUCTION_BUILD_STATUS.md`.

## Required checks before completion

- Relevant unit and contract tests pass.
- No Gold-derived field is consumed by candidate generation or ranking.
- Every output record can be traced to source, chunk, candidate policy, annotations, and adjudication.
- Documentation is updated when a public schema or semantic rule changes.
