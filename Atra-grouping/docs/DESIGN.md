# Gold Set Annotation Platform — Design

## 1. Purpose

This platform creates a versioned, auditable Gold Set for evaluating Atra's cross-provider work-unit grouping. It ingests heterogeneous public or authorized sources, retrieves plausible evidence pairs, deliberately includes counterexamples, collects independent human judgments, resolves disagreement, and exports immutable evaluation releases.

The platform does **not** use Gold truth to improve candidate selection. Development/training annotations must be stored and versioned separately from evaluation Gold.

Supporting docs:

- `docs/CONTEXT.md` records the project purpose, prior design decisions, and product framing.
- `docs/LABEL_GUIDELINES.md` expands annotation rules and reason codes.
- `docs/SOURCE_PLAN.md` describes source-family ingestion expectations.
- `docs/SAMPLING_AND_QA.md` defines challenge buckets, blind annotation, adjudication, and leakage checks.
- `docs/MVP_PLAN.md` gives the implementation order and completion criteria.
- `docs/OPEN_DECISIONS.md` lists choices that must be resolved before or during implementation.
- `docs/DEVELOPMENT_START.md` provides recommended models, implementation prompts, and the first-run checklist.
- `docs/BEYOND_MVP_ROADMAP.md` defines the production-readiness path after the first MVP.
- `docs/LOOP_ENGINEERING.md` defines the repeated build, verify, fix, reverify, and advance process.

## 2. Core question and labels

For an anchor record and candidate evidence, annotators answer two independent questions.

### Relation

- `SAME_WORK`: both records represent the same completion unit and a single completion decision would close both.
- `RELATED`: meaningfully connected work, but not the same completion unit (parent/child, dependency, follow-up, shared project, duplicate discussion without shared completion).
- `DIFFERENT_WORK`: enough evidence shows distinct work; topical similarity alone may be high.
- `UNKNOWN`: evidence is insufficient, inaccessible, contradictory, or too ambiguous for a defensible decision.

### Work type

- `INITIATIVE`: strategic multi-project outcome
- `PROJECT`: coordinated body of work containing multiple completion units
- `TASK`: independently completable work item
- `SUBTASK`: bounded child of a task
- `MILESTONE`: checkpoint or target state/date, not the execution unit itself
- `NOT_WORK`: contextual text with no work unit
- `UNKNOWN`: granularity cannot be determined

The annotation UI must show the full taxonomy. Aggregate reporting may expose Project (`INITIATIVE`, `PROJECT`) and Task (`TASK`, `SUBTASK`) rollups without deleting the original label.

### Decision test

Ask: “If one item is completed, is the other necessarily completed by the same act and acceptance criterion?” Yes strongly supports `SAME_WORK`; a structural or causal link supports `RELATED`; separate completion criteria support `DIFFERENT_WORK`; missing evidence supports `UNKNOWN`.

## 3. Canonical data model

The logical pipeline is:

`SourceRecord -> Chunk -> CandidatePair -> Annotation -> Adjudication -> GoldRelease`

Minimum fields:

### SourceRecord

`source_record_id`, `provider`, `dataset`, `native_id`, `record_type`, `title`, `body`, `author_refs`, `participant_refs`, `created_at`, `updated_at`, `parent_ref`, `external_refs`, `source_uri`, `content_hash`, `license`, `ingestion_version`, `raw_payload_ref`.

Original text and raw payload are immutable. Corrections create a new ingestion version.

### Chunk

`chunk_id`, `source_record_id`, `ordinal`, `text`, `start_offset`, `end_offset`, `speaker`, `timestamp`, `chunker_version`, `content_hash`.

Offsets refer to canonical source text. Translation and summary use separate derived fields and never replace `text`.

### CandidatePair

`candidate_pair_id`, `anchor_chunk_id`, `candidate_chunk_id`, `retrieval_model`, `retrieval_model_version`, `retrieval_score`, `reranker_model`, `reranker_version`, `reranker_score`, `sampling_bucket`, `sampling_reason`, `policy_version`, `created_at`.

Pair identity is order-stable. Exact duplicates must be prevented without merging semantically different evidence.

### Annotation

`annotation_id`, `candidate_pair_id`, `annotator_id`, `assignment_round`, `relation`, `anchor_work_type`, `candidate_work_type`, `evidence_spans`, `reason_codes`, `confidence`, `notes`, `guideline_version`, `created_at`.

Annotations are append-only. Annotators cannot see model scores, sampling bucket, peer answers, or Gold status.

### StructuredSignal

`structured_signal_id`, `chunk_id`, `signal_class`, `work_type`, `slots`, `classifier_model`, `classifier_model_version`, `slot_model`, `slot_model_version`, `confidence`, `guideline_version`, `created_at`.

This is a derived classification and slot-filling artifact, not a Gold label. It may help sampling, queue routing, QA, and source-defect review, but it cannot replace blind human relation annotation. The first target taxonomy is deliberately narrow:

- Classification: `WORK_ACTION`, `WORK_DECISION`, `WORK_STATUS_UPDATE`, `WORK_REFERENCE`, `NOT_WORK`, `UNKNOWN`
- Slots: `work_identifier`, `owner`, `participant`, `due_date`, `status`, `acceptance_criterion`, `source_reference`, `action_object`, `blocker`, `dependency`, `amount`, `time_window`

Every slot must carry an evidence span, normalized value when available, and confidence. `NOT_WORK` cannot carry work slots.

### Adjudication

`adjudication_id`, `candidate_pair_id`, `input_annotation_ids`, `relation`, `anchor_work_type`, `candidate_work_type`, `decision_reason`, `adjudicator_id`, `guideline_version`, `created_at`.

### GoldRelease

`release_id`, `semantic_version`, `dataset_split`, `pair_ids`, `schema_version`, `guideline_version`, `sampling_policy_version`, `source_snapshot_ids`, `frozen_at`, `manifest_hash`, `supersedes`.

## 4. Source ingestion

All connectors emit the same `SourceRecord` contract while preserving provider-native structure and licensing metadata.

| Source | Units to preserve | Pairing value and cautions |
|---|---|---|
| QMSum | meeting, topic span, query/summary, speaker turns | Task decisions and action items; summaries are derived, so retain transcript spans |
| Public Jira | project, issue, type, status, links, comments, parent/epic | Strong explicit relations; same project or shared key mention is not automatic identity |
| OpenTelemetry GitHub + authorized Google Docs | issue/PR/discussion plus document paragraphs and line ranges | Cross-provider references, specs, meeting decisions; preserve commit/issue refs and Docs line provenance |
| SmartSHARK | issue, commit, pull request, message, file-change links | Software evolution relations; repository proximity must not imply same work |
| AMI | meeting, dialogue act, speaker, timestamp, topic segment | Decisions/actions amid conversational noise; preserve speaker and time boundaries |
| ECB+ | event mentions, documents, topics, coreference clusters | Useful weak supervision and evaluation inspiration; map event identity cautiously to work identity |
| MAVEN-ERE | event mentions and temporal/causal/subevent/coreference relations | Source for related-vs-identical and hierarchy examples; do not collapse causal/subevent relations into `SAME_WORK` |

Each connector must document acquisition, license/redistribution constraints, snapshot date, parser version, missing fields, and normalization choices. Restricted raw content remains outside Git; fixtures must be synthetic or permitted excerpts.

## 5. Candidate pipeline: gte -> Ettin -> human

1. Normalize records without rewriting source evidence.
2. Chunk by provider-aware semantic boundaries; retain offsets and context windows.
3. Run a schema-constrained classification and slot-filling pass over eligible chunks.
4. Encode eligible chunks with a pinned gte embedding model/version.
5. Retrieve cross-provider candidates plus explicit control buckets. Exclude self-pairs and exact duplicates.
6. Rerank candidates with a pinned Ettin model/version using evidence text only.
7. Sample across score bands, providers, extracted slot coverage, work types, relation hypotheses, and difficulty buckets.
8. Strip scores/rank/bucket metadata from annotator payloads.
9. Assign each pair to two independent annotators, then adjudicate disagreement or designated low-confidence cases.

Model output is candidate evidence only. It is never a label and must not be displayed as one.

### Needle-style structured extraction role

Atra should borrow Needle 2's narrow-specialist pattern: fixed schemas, typed arguments, confidence gates, and escalation instead of open-ended prose generation. In this platform, that means the small model's job is only:

- classify each chunk into one work-signal class;
- fill bounded work slots with exact evidence spans;
- return `UNKNOWN` or low confidence instead of guessing;
- produce schema-valid JSON that can be rejected by contract tests.

It must not decide `SAME_WORK`. Pair identity remains a human Gold decision after retrieval, reranking, blind annotation, and adjudication.

## 6. Balanced sampling and intentional reverse evidence

A useful Gold Set must not mirror nearest-neighbor bias. Sampling quotas are configured and versioned, not hard-coded. Balance both relation and work-type coverage across providers where source data permits.

Required challenge buckets include:

- same explicit issue/doc ID but different work
- no shared identifier but the same work
- same people and close time but different completion units
- same topic/system but different acceptance criteria
- paraphrases that are merely related
- project-to-task, task-to-subtask, and milestone-to-task relations
- high gte/Ettin score expected to be `DIFFERENT_WORK` or `RELATED`
- low score expected to be `SAME_WORK`
- sparse or contradictory evidence expected to be `UNKNOWN`
- easy positives and easy negatives as calibration controls

“Intentional reverse” means selecting cases that challenge a model heuristic; it never means fabricating or altering evidence. Track `sampling_bucket` separately from human labels. Quotas should avoid claiming exact class balance before annotation; use staged sampling and replenish underrepresented verified labels without leaking evaluation labels back into retrieval features.

Prevent contamination by grouping near-duplicates, shared source threads, and linked work families before train/development/evaluation split assignment. Split at the group level, not the pair level.

## 7. Annotation workflow

### Blind dual annotation

- Two independently assigned annotators judge every release-eligible pair.
- They see the anchor, candidate, sufficient surrounding context, provider, and source provenance.
- They do not see scores, ranks, sample hypotheses, peer labels, or model suggestions.
- Required judgments: relation and work type for both sides. Evidence spans and reason codes are required for `SAME_WORK` and recommended for all labels.
- Pair order should be randomized where the UI permits, while preserving stable pair identity.

### Adjudication

Agreement is accepted only after schema validation. Relation disagreement, material work-type disagreement, low-confidence agreement, and policy-sampled audits enter an adjudication queue. The adjudicator sees both decisions only after making or recording an independent evidence review, then writes a reasoned final decision.

Guideline errors or source defects create a tracked issue; they are not silently patched. Measure raw agreement and chance-adjusted agreement by relation, work type, provider pair, and difficulty bucket.

## 8. Gold freeze and export

A freeze is an immutable snapshot, never an in-place update.

Before freezing:

- all pairs have valid provenance and two independent annotations
- required disagreements are adjudicated
- source licenses permit the chosen export form
- leakage and family-level split checks pass
- schema, guideline, source, model, and policy versions are pinned
- counts and agreement metrics are recorded by slice

Export a manifest, machine-readable pairs/labels, evidence/provenance allowed by license, datasheet, label guideline, sampling report, quality report, and checksums. Restricted text may be replaced with stable references and hashes. Corrections create a new semantic version with a changelog and `supersedes`; old releases remain reproducible.

## 9. Evaluation

Primary relation metrics: macro F1, per-class precision/recall/F1, confusion matrix, and `SAME_WORK` precision/recall. Report work-type macro F1 and hierarchical rollups separately. Always slice by provider pair, score band, challenge bucket, work type, evidence length, and identifier presence.

Also report candidate-stage recall at K independently from final classifier/grouping quality. For graph grouping, add pairwise metrics plus cluster metrics and check transitivity errors. Never tune thresholds, prompts, models, or sampling using the frozen evaluation labels.

## 10. Service boundaries

- Connectors own acquisition and canonical normalization, not retrieval decisions.
- Retrieval owns chunks, embeddings, candidate/rerank records, and sampling assignments, not human truth.
- Gold owns assignments, annotation state, adjudication, release validation, and export.
- Frontend consumes explicit APIs and does not reimplement label or workflow rules.
- Evaluation consumes frozen releases read-only and emits reports, never mutated labels.

Public APIs and storage formats must use versioned schemas. Cross-boundary tests use small fixtures with stable expected outputs.

## 11. MVP implementation order

1. **Contracts and fixtures**: schemas, label guideline, IDs, provenance, synthetic cross-provider examples, validation tests.
2. **Two-source ingestion**: Public Jira and OpenTelemetry GitHub plus authorized Google Docs; immutable records and chunks. Add QMSum/SmartSHARK/AMI/ECB+/MAVEN-ERE adapters behind the same contract after license review.
3. **Candidate generation**: pinned gte retrieval, Ettin reranking, deterministic deduplication, versioned reverse/hard-negative sampling.
4. **Annotation UI/API**: evidence display, full relation/work-type taxonomy, autosave, blind dual assignment, audit log.
5. **Adjudication and QA**: disagreement queue, reasoned resolution, agreement/slice reports, source-defect handling.
6. **Freeze/export**: validation gate, manifests, hashes, immutable releases, license-aware evidence export.
7. **Evaluation harness**: baseline candidate recall, classification and grouping metrics, challenge slices, leakage tests.

MVP is complete when an authorized two-source snapshot can run end-to-end twice deterministically, produce blind dual annotations and adjudications, freeze a reproducible Gold release, and evaluate a baseline without any Gold leakage.

## 12. Open decisions to record as ADRs

- exact gte and Ettin model identifiers, revisions, context limits, and deployment constraints
- storage engine and object-store layout
- annotator identity/privacy and access-control policy
- licensing/export policy per corpus
- target sample sizes and quota tolerances after a pilot
- agreement thresholds and adjudication audit rate

Do not bury these decisions in code. Add an ADR under `docs/adr/` when each is resolved.
