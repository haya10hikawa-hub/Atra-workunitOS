# Atra Classifier — Development Architecture and Plan

Status: Development baseline v1
Branch: `codex/classifier-work-reconstruction`

## 1. Development strategy

The classifier should be developed as a staged measurable subsystem, not as one giant prompt.

Each stage has a separate responsibility, interface, evaluation target, and failure mode.

```text
S0 SourceRecordV1
 -> S1 sanitize/trust
 -> S2 semantic extraction
 -> S3 candidate retrieval
 -> S4 reranking
 -> S5 relation judgment
 -> S6 deterministic constraints
 -> S7 grouping
 -> S8 WorkUnit formation
 -> S9 human correction / lineage
```

This separation is required so that a quality failure can be localized.

Example:

- correct related item never appears -> retrieval problem
- correct item appears but ranks too low -> reranker problem
- candidate is present but SAME/RELATED is wrong -> relation problem
- relation is correct but grouping is wrong -> algorithm/constraint problem
- group is correct but WorkUnit boundary is wrong -> decomposition problem

## 2. Model baseline

During the accuracy-first AWS phase:

### Generative structured reasoning

Primary:
`Qwen/Qwen3.5-27B`

Shadow comparison:
`Qwen/Qwen3.5-35B-A3B`

Responsibilities:

- SemanticAtom extraction
- pair relation judgment
- WorkUnitCandidate formation
- grounded missing-field extraction

Requirements:

- temperature 0 for classification paths
- schema-constrained output
- no model-owned approval/execution/security truth
- source evidence retained
- unknown remains unknown

### Embedding

`Qwen/Qwen3-Embedding-8B`

Responsibilities:

- multilingual semantic candidate retrieval
- Japanese/English mixed engineering data
- code/document/message retrieval

Embedding score is never SAME_WORK probability.

### Reranker

`Qwen/Qwen3-Reranker-8B`

Responsibilities:

- reorder retrieval candidates by relevance
- reduce expensive relation-judge comparisons

Reranker score is relevance only.

### Runtime

AWS rented GPU + vLLM.

Model access must be behind a provider-neutral gateway so later local inference can replace AWS without changing classifier contracts.

## 3. Required model gateway

Target interface concept:

```ts
interface ClassifierModelGateway {
  extractAtoms(input: SanitizedEvidenceV1): Promise<SemanticAtomV1[]>
  embed(input: readonly string[]): Promise<readonly number[][]>
  rerank(query: string, candidates: readonly string[]): Promise<readonly RerankScore[]>
  judgeRelation(input: RelationJudgmentInput): Promise<RelationV1>
  formWorkUnits(input: CorrelationGroupV1): Promise<readonly WorkUnitCandidateV1[]>
}
```

The domain layer must not import AWS/vLLM implementation details.

## 4. Semantic extraction

Do not classify an entire source record as one type.

A source can create zero, one, or many `SemanticAtomV1` values.

Each atom must include:

- semantic type
- normalized statement
- exact evidence span
- source reference
- actor candidates
- entity candidates
- deadline if explicitly supported
- commitment state
- certainty
- source timestamp
- model/schema version

If evidence cannot support a field, keep it unknown.

## 5. Hybrid retrieval

Candidate generation should combine multiple channels.

Priority order:

1. explicit issue / PR / thread / URL references
2. lexical / exact retrieval
3. dense embedding retrieval
4. metadata candidates
5. union + dedupe
6. reranking

Initial experiment values:

- lexical TopK: 30
- dense TopK: 30
- rerank TopK: 10
- relation judge: top 5–10 + all mandatory explicit references

These are experiment defaults and must not become permanent constants without evaluation.

## 6. Relation judgment

The relation judge answers one narrow question:

> What is the work relationship between these two grounded pieces of information?

Primary labels:

- `SAME_WORK`
- `RELATED_DIFFERENT_WORK`
- `UNRELATED`
- `UNCERTAIN`

Output must include:

- relation
- supporting evidence
- contradictions
- human-review requirement
- model version

The model should not output an authoritative merge command.

## 7. Deterministic constraint gate

Before grouping, deterministic constraints can reject or defer a proposed SAME relation.

Examples:

Hard blockers:

- tenant mismatch
- security/trust boundary mismatch
- explicit cannot-link rule
- incompatible source identity where identity is authoritative

Strong split / review signals:

- different independently verifiable outcomes
- conflicting completion conditions
- separate approval boundaries
- independently owned work with separate deadlines and outputs

The model cannot override a hard blocker.

## 8. Grouping algorithm

Initial algorithm: guarded agglomerative graph grouping.

Procedure:

1. start each candidate in its own group
2. produce candidate relation edges
3. sort merge proposals by SAME_WORK evidence strength
4. before a merge, inspect cross-group cannot-link and contradiction evidence
5. verify completion/outcome compatibility
6. require group-level coherence rather than one bridge edge
7. if coherence is insufficient, preserve `RELATED_DIFFERENT_WORK` or `UNCERTAIN`
8. retain relation/evidence lineage for every group revision

Never use ordinary connected components over SAME edges.

Bad:

```text
A SAME B
B SAME C
=> merge A+B+C automatically
```

This is prohibited.

## 9. WorkUnit formation

After correlation grouping, form independent `WorkUnitCandidateV1` objects.

One candidate should correspond to one independently trackable outcome.

Split signals include:

- different outcome
- different done condition
- independent owner
- independent deadline
- separate approval boundary
- separate deliverable

A `CorrelationGroupV1` may create multiple WorkUnits.

## 10. Golden Set

The evaluation unit is an engineering work episode, not a random isolated sentence.

### Phase 0: ontology calibration

20–30 episodes.

Two annotators independently label:

- semantic atoms
- evidence spans
- relation pairs
- must-not-merge pairs
- expected correlation groups
- expected WorkUnits
- ambiguous cases

### Phase 1: evaluation

100–150 episodes, approximately 1,000–3,000 source records.

Required slices:

- Japanese only
- English only
- Japanese/English mixed
- code + natural language

No leakage across train/test from the same work episode.

## 11. Required metrics

Retrieval:

- Recall@10
- Recall@30

Relation:

- macro F1
- per-label precision/recall
- SAME_WORK precision
- UNCERTAIN / abstention rate

Grouping:

- false merge episode rate
- false split WorkUnit rate

Grounding:

- unsupported claim rate
- evidence-span validity
- missing-field recall

Product:

- time to reconstruct current work
- correction rate
- number of source hops reduced

Language:

- Japanese-only metrics
- English-only metrics
- mixed-language metrics

## 12. Fine-tuning gate

Do not fine-tune simply because GPU is available.

Fine-tuning is allowed only after:

1. ontology is stable
2. schema is stable
3. Golden Set exists
4. baseline is measured
5. failure stage is localized
6. prompt/rule/retrieval/threshold improvements have been tested

Decision tree:

```text
Recall@30 low
 -> retrieval / embedding

Recall good, ranking poor
 -> reranker

Candidate present, relation wrong
 -> relation judge

Relation good, grouping wrong
 -> constraints / grouping

Group good, WorkUnit wrong
 -> decomposition / schema
```

Likely first tuning target, if justified: relation classification using human-adjudicated hard pairs.

## 13. Development milestones

### M0 — Specification Freeze

- C001 ontology
- C002 canonical schemas
- C003 annotation format

### M1 — Accuracy Baseline

- C004 AWS/vLLM benchmark harness
- C005 semantic extraction
- C006 hybrid retrieval
- C007 reranker

### M2 — Relation and Grouping

- C008 relation judge
- C009 deterministic constraint gate
- C010 CorrelationGroup builder

### M3 — WorkUnit and Correction

- C011 WorkUnitCandidate formation
- C013 append-only correction lineage

### M4 — Evaluation

- C012 false merge/split evaluator
- bilingual slices
- performance/cost benchmark

### M5 — Tuning Decision

- C014 fine-tuning go/no-go

## 14. Required engineering discipline

Every change must:

- preserve existing safety boundaries
- have bounded scope
- include tests or evaluation evidence
- update authoritative shared state
- move task to REVIEW before DONE
- be independently reviewed for ontology/grouping/model-selection milestones

Do not rerun whole-system audits when a focused classifier gate is sufficient.
