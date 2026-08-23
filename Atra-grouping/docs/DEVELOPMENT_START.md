# Development Start Guide

This guide turns the design into executable agent work. Use it when starting implementation from the current repository state.

## Recommended model plan

Use stronger models where architecture, correctness, and cross-file consistency matter. Use faster models for narrow implementation chores after contracts are stable.

| Work | Recommended model | Why |
|---|---|---|
| Root architecture, schema contracts, Gold leakage rules | `gpt-5.6-sol` | Highest-risk reasoning and system boundaries |
| Backend connectors and retrieval pipeline | `gpt-5.6-terra` | Balanced implementation work with careful data handling |
| Annotation UI and routine frontend iteration | `gpt-5.6-terra` | Good balance of product judgment and speed |
| Fixtures, validators, small tests, docs follow-ups | `gpt-5.6-luna` | Fast bounded tasks once the contract is clear |
| Final review before freeze/export | `gpt-5.6-sol` | Needs skeptical cross-boundary review |

Default to `gpt-5.6-terra` for ordinary coding. Escalate to `gpt-5.6-sol` for schema, evaluation, leakage, and release semantics.

## Development rules for all agents

Before editing, read:

- `AGENTS.md`
- `docs/README.md`
- `docs/DESIGN.md`
- `docs/LOOP_ENGINEERING.md`
- the relevant subtree `AGENTS.md`

Never change:

- Gold evaluation-only rule
- canonical relation labels
- canonical work-type labels
- append-only annotation semantics
- immutable Gold release semantics
- blind annotation constraints

If a task needs one of those changes, stop and add or request an ADR first.

## Prompt 1: root scaffold and contracts

Use model: `gpt-5.6-sol`

```text
You are implementing the first MVP foundation for Atra's Gold Set Annotation Platform.

Repository: /Users/sotanakano/Atra-workunitOS/Atra-grouping

First read AGENTS.md, docs/README.md, docs/DESIGN.md, docs/OPEN_DECISIONS.md, and docs/MVP_PLAN.md.

Goal:
Create the initial project scaffold and canonical schema/validation layer without changing the documented semantics.

Implement:
- package/workspace structure suitable for backend, frontend, evaluation, fixtures, and tests
- canonical enums for relation and work type
- schemas for SourceRecord, Chunk, CandidatePair, Annotation, Adjudication, and GoldRelease
- deterministic ID helper interfaces
- schema validation tests
- synthetic fixtures covering SAME_WORK, RELATED, DIFFERENT_WORK, UNKNOWN, Project/Task/Subtask/Milestone/Not-work/Ambiguous cases

Rules:
- Gold labels must not be imported by retrieval or ranking modules.
- Original source text is immutable.
- Keep restricted datasets out of Git.
- If a stack decision is missing, choose the conservative default in docs/OPEN_DECISIONS.md and record it as an ADR.

Verify:
- install/build/test commands run locally
- schema tests pass
- git diff has no unrelated changes
```

## Prompt 2: connectors

Use model: `gpt-5.6-terra`

```text
You are implementing connector foundations for Atra's Gold Set Annotation Platform.

Read AGENTS.md, docs/DESIGN.md, docs/SOURCE_PLAN.md, backend/connectors/AGENTS.md, and existing schemas/tests.

Goal:
Implement source ingestion interfaces and deterministic fixture-based connectors.

Implement:
- connector interface returning SourceRecord records and Chunks
- Public Jira fixture connector
- OpenTelemetry GitHub fixture connector
- Google Docs authorized-export fixture connector or reference-only fixture connector
- source snapshot metadata
- parser version and content hash handling
- tests proving records are immutable, provenance is present, and reruns are deterministic

Rules:
- Do not commit restricted raw content.
- Preserve provider-native IDs and hierarchy.
- Do not infer labels inside connectors.

Verify:
- connector tests pass
- each fixture emits the canonical contract
```

## Prompt 3: retrieval and sampling

Use model: `gpt-5.6-terra`

```text
You are implementing retrieval and candidate sampling for Atra's Gold Set Annotation Platform.

Read AGENTS.md, docs/DESIGN.md, docs/SAMPLING_AND_QA.md, backend/retrieval/AGENTS.md, and existing schemas/tests.

Goal:
Create a deterministic candidate pipeline shaped as gte retrieval -> Ettin reranking -> versioned sampling.

Implement:
- retrieval stage interfaces with pinned model config objects
- local fixture/mock embedding and reranking implementations for tests
- CandidatePair creation with stable IDs
- exact duplicate and self-pair prevention
- sampling policy with challenge buckets
- tests for high-score hard negatives, low-score positives, score-band coverage, and no label leakage

Rules:
- Candidate generation may store scores and buckets internally.
- Annotator payloads must not include scores, ranks, or sampling hypotheses.
- Do not consume Gold labels.

Verify:
- retrieval/sampling tests pass
- generated candidate batch is deterministic
```

## Prompt 4: Gold workflow backend

Use model: `gpt-5.6-sol`

```text
You are implementing the Gold workflow backend for Atra's Gold Set Annotation Platform.

Read AGENTS.md, docs/DESIGN.md, docs/LABEL_GUIDELINES.md, docs/SAMPLING_AND_QA.md, backend/gold/AGENTS.md, and existing schemas/tests.

Goal:
Implement annotation assignment, append-only annotation records, adjudication, release validation, and export skeletons.

Implement:
- blind dual assignment rules
- annotation API/domain services
- adjudication queue rules
- release eligibility validation
- immutable GoldRelease manifest creation
- export skeleton with checksums and license-aware evidence handling
- tests for blind constraints, append-only behavior, disagreement routing, and freeze validation

Rules:
- Annotators cannot see scores, buckets, peer labels, or Gold status.
- Frozen releases are never overwritten.
- Adjudication is required for relation disagreement and low-confidence policy cases.

Verify:
- Gold workflow tests pass
- no retrieval module imports frozen Gold labels
```

## Prompt 5: frontend annotation UI

Use model: `gpt-5.6-terra`

```text
You are implementing the first annotation UI for Atra's Gold Set Annotation Platform.

Read AGENTS.md, docs/DESIGN.md, docs/LABEL_GUIDELINES.md, frontend/AGENTS.md, and existing API/schema contracts.

Goal:
Build an evidence-first annotation interface for blind dual annotation.

Implement:
- anchor and candidate evidence display
- provider and provenance display
- relation label controls
- work-type controls for both sides
- evidence span capture or structured placeholder if full span selection is not yet available
- reason codes, confidence, notes
- autosave state
- validation messages
- no model scores, ranks, sampling buckets, or peer labels in annotator view

Design:
- operational tool, not a marketing page
- dense, calm, scan-friendly layout
- full taxonomy available

Verify:
- UI builds
- core flow can be exercised with synthetic fixtures
- annotator payload contains no hidden model metadata
```

## Prompt 6: evaluation harness

Use model: `gpt-5.6-terra`

```text
You are implementing the evaluation harness for Atra's Gold Set Annotation Platform.

Read AGENTS.md, docs/DESIGN.md, docs/SAMPLING_AND_QA.md, evaluation/AGENTS.md, and existing release/export schemas.

Goal:
Evaluate frozen Gold releases read-only.

Implement:
- relation macro F1 and per-class precision/recall/F1
- SAME_WORK precision/recall
- work-type macro F1 and project/task rollups
- confusion matrix data
- candidate recall at K
- provider pair, score band, work type, challenge bucket, evidence length, and identifier-presence slices
- graph grouping metrics and transitivity checks if cluster outputs exist
- leakage validation checks

Rules:
- Never mutate labels or release files.
- Never tune thresholds against frozen Gold labels.

Verify:
- evaluation tests pass against synthetic frozen release fixtures
- report output is deterministic
```

## Prompt 7: final integration review

Use model: `gpt-5.6-sol`

```text
You are reviewing the MVP implementation before the first pilot, and you must also identify what is still needed after MVP. Do not stop at "MVP works"; produce the next production-readiness plan if the MVP passes.

Read AGENTS.md, docs/README.md, docs/DESIGN.md, docs/OPEN_DECISIONS.md, docs/SAMPLING_AND_QA.md, docs/MVP_PLAN.md, docs/BEYOND_MVP_ROADMAP.md, and all subtree AGENTS.md files.

Review for:
- schema drift from docs
- Gold leakage into retrieval, reranking, embeddings, prompts, training, or thresholds
- missing provenance
- non-deterministic IDs or sampling
- annotation blindness violations
- mutable Gold release behavior
- missing tests for hard negatives and UNKNOWN
- source licensing/export risks
- frontend exposure of hidden metadata
- missing post-MVP requirements for data governance, access control, storage lineage, connector expansion, annotation operations, sampling maturity, evaluation regression, security, observability, and release governance

Output:
- blocking findings first
- non-blocking risks
- MVP verdict: PASS / PASS WITH RISKS / FAIL
- post-MVP readiness verdict: READY TO CONTINUE / NEEDS FOUNDATION WORK / BLOCKED
- exact files/lines to fix
- recommended next patch sequence
- recommended next prompt from the post-MVP roadmap
```

## Prompt 8: post-MVP production readiness plan

Use model: `gpt-5.6-sol`

```text
You are planning the next implementation phase after the MVP for Atra's Gold Set Annotation Platform.

Repository: /Users/sotanakano/Atra-workunitOS/Atra-grouping

Read AGENTS.md, docs/README.md, docs/DESIGN.md, docs/OPEN_DECISIONS.md, docs/MVP_PLAN.md, docs/BEYOND_MVP_ROADMAP.md, and the current implementation.

Goal:
Do not stop at MVP. Inspect the current implementation and turn the post-MVP roadmap into a concrete next-phase backlog.

Check and plan:
- production storage and release lineage
- source access policy and restricted evidence handling
- connector expansion for QMSum, SmartSHARK, AMI, ECB+, and MAVEN-ERE
- annotation calibration, queue management, and adjudication operations
- sampling quota maturity and work-family split management
- evaluation regression across Atra model versions
- security, privacy, and export redaction
- observability, retry-safe jobs, and operational runbooks
- documentation templates for datasheets, sampling reports, quality reports, and release approvals

Output:
- the next 3 implementation phases in order
- blocking decisions that need ADRs
- specific files/modules likely to change
- tests required before each phase is considered done
- the exact next coding prompt to run

Rules:
- Do not weaken the Gold evaluation-only rule.
- Do not introduce label leakage.
- Do not make broad code changes unless explicitly asked; this is a planning and verification pass.
```

## First run checklist

Before starting code:

- choose runtime stack
- record stack decision as an ADR
- create schemas before connectors
- create fixtures before real data ingestion
- make retrieval model config versioned
- keep annotation payload separate from internal candidate metadata
- add leakage tests before freeze/export
- after MVP passes, continue with `docs/BEYOND_MVP_ROADMAP.md` instead of stopping
- use `docs/LOOP_ENGINEERING.md` to alternate independent build, verify, fix, and reverify passes

## Three-stage execution

When a verifier reports that the current implementation is not ready, use `docs/LOOP_ENGINEERING.md` and run the work in three stages:

1. Stage 1 Foundation repair: fix broken validators, missing challenge fixtures, tests, and build coverage.
2. Stage 2 MVP completion: implement the full documented MVP pipeline end to end.
3. Stage 3 Production expansion: continue beyond MVP toward storage lineage, source governance, connector expansion, annotation operations, evaluation regression, security, observability, and release governance.

Do not jump to Stage 2 until Stage 1 reverify passes. Do not stop after Stage 2; use the production roadmap for Stage 3.
