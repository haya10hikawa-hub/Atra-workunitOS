# Atra Classifier — Team Roles and Operating Model

Status: Team operating baseline v1
Branch: `codex/classifier-work-reconstruction`

## 1. Why the team is split

The classifier combines ontology, model serving, retrieval, relation judgment, grouping, evaluation, and safety review.

These responsibilities should not be owned by one Agent because errors can hide each other.

The development organization therefore separates:

- product/architecture authority
- ontology/schema authority
- model infrastructure
- retrieval/reranking
- relation/grouping
- Golden Set/evaluation
- independent adversarial review

The user remains PM and final design authority.

## 2. Team structure

```text
PM / Pilot
   |
   v
Classifier Chief
   |
   +-- Ontology & Schema Team
   +-- Model Infrastructure Team
   +-- Retrieval & Rerank Team
   +-- Relation & Grouping Team
   +-- Golden Set & Evaluation Team
   +-- Classifier Red Team
```

The Chief coordinates work but does not replace technical reviewers.

## 3. Classifier Chief

Agent ID: `classifier-chief`

Purpose:

- maintain the shared project state
- sequence tasks by dependencies
- prevent uncontrolled parallel editing
- integrate handoffs
- surface only PM-level decisions

Owns:

- authoritative progress state
- task dependency interpretation
- state lock coordination
- current handoff summary
- team conflict escalation

Does not own:

- final ontology content
- model benchmark conclusions
- relation quality approval
- Red Team sign-off

The Chief must not mark a technical milestone DONE solely because an implementation Agent says it is complete.

## 4. Ontology & Schema Team

Primary Agent: `ontology-schema`

Tasks:

- C001 ontology and boundary examples
- C002 canonical TypeScript/JSON contracts
- C003 Golden Set annotation structure together with evaluation team

Owns definitions of:

- `SemanticAtomV1`
- `RelationV1`
- `CorrelationGroupV1`
- `WorkUnitCandidateV1`
- `WorkUnitCorrectionV1`

Key responsibility:

Make the meaning of SAME_WORK vs RELATED_DIFFERENT_WORK operationally clear enough that independent humans can annotate it consistently.

Must provide:

- positive examples
- negative examples
- ambiguous examples
- split/merge boundary examples
- Japanese/English examples

## 5. Model Infrastructure Team

Primary Agent: `model-infra`

Tasks:

- C004 AWS/vLLM benchmark harness
- C005 model-backed semantic extraction infrastructure

Owns:

- `ClassifierModelGateway` infrastructure adapter
- AWS GPU model serving
- vLLM configuration
- structured JSON output harness
- model/config/version recording
- reproducible replay benchmark
- latency/token/GPU metrics

Does not own:

- ontology
- SAME_WORK definition
- final quality decision

The infrastructure must allow models to be swapped without changing canonical domain contracts.

## 6. Retrieval & Rerank Team

Primary Agent: `retrieval-rerank`

Tasks:

- C006 hybrid retrieval
- C007 reranker

Owns:

- explicit reference retrieval
- lexical/BM25 retrieval
- dense embedding retrieval
- candidate union/dedupe
- reranking
- Recall@10/30 measurements

Baseline models:

- `Qwen/Qwen3-Embedding-8B`
- `Qwen/Qwen3-Reranker-8B`

Critical invariant:

Retrieval relevance is never treated as SAME_WORK truth.

## 7. Relation & Grouping Team

Primary Agent: `relation-grouping`

Tasks:

- C008 relation judge
- C009 deterministic constraint gate
- C010 CorrelationGroup builder
- C011 WorkUnitCandidate formation

Owns the classifier core:

```text
retrieved pair
 -> relation
 -> admissibility constraints
 -> grouping
 -> independent WorkUnit outcomes
```

Must protect against:

- transitive-chain false merge
- same-keyword false merge
- same-person false merge
- same-project false merge
- old/new decision confusion
- one meeting note bridging unrelated work

Any grouping milestone requires independent review.

## 8. Golden Set & Evaluation Team

Primary Agent: `golden-eval`

Tasks:

- C003 annotation design with ontology team
- C012 false merge/split evaluator
- C014 fine-tuning go/no-go evidence

Owns:

- episode selection
- annotation protocol
- adjudication rules
- train/dev/test split safety
- Japanese/English/mixed slices
- retrieval/relation/grouping metrics
- model comparison reports
- tuning decision evidence

The evaluation team must not allow model-generated labels to become Golden truth without human adjudication.

## 9. Classifier Red Team

Primary Agent: `classifier-redteam`

Purpose:

- independently attack assumptions
- search for false merge / false split counterexamples
- test prompt injection and unsupported claims
- test language imbalance
- check evaluation leakage
- verify deterministic blockers cannot be overridden

The Red Team should not be the primary implementer of the feature it reviews.

Example attacks:

- `A SAME B`, `B SAME C`, but `A` and `C` must not merge
- same Issue title for separate customers
- Japanese report and English PR for the same work
- same repo/component but separate incidents
- old completed work reopened later
- cancelled request that looks like an active task
- meeting summary containing multiple independent tasks
- malicious text inside source evidence

## 10. Review model

Implementation status flow:

```text
READY
 -> IN_PROGRESS
 -> REVIEW
 -> DONE
```

Blocked work:

```text
IN_PROGRESS -> BLOCKED -> READY
```

The primary implementer moves work only to REVIEW.

DONE requires explicit acceptance evidence and a reviewer where the milestone requires independent review.

## 11. Parallel work policy

Safe initial parallelism:

```text
Ontology & Schema: C001
Model Infrastructure: C004
```

After dependencies unlock, more teams can run in parallel.

Rules:

- code ownership may be parallel
- authoritative shared-state JSON writes are serialized
- overlapping file ownership must be declared before editing
- no team silently expands task scope
- architecture changes require a recorded decision proposal

## 12. Shared information model

All Agents use two layers of shared machine-readable state:

### Project state

`docs/agents/classifier/ATRA_CLASSIFIER_MASTER_STATE.json`

Contains:

- branch/scope
- hard boundaries
- invariants
- model baseline
- pipeline status
- task status/dependencies
- quality targets
- current handoff

### Agent/team network

`docs/agents/classifier/TEAM_AGENT_REGISTRY.json`

Contains:

- teams
- Agent IDs
- task ownership
- dependencies
- review requirements
- file ownership hints
- inputs/outputs between teams

### Handoff protocol

`docs/agents/classifier/AGENT_HANDOFF_PROTOCOL.json`

Defines the JSON envelope Agents use when work crosses team boundaries.

## 13. PM decision boundary

Agents may propose decisions.

The PM retains authority over:

- product scope changes
- taxonomy changes that alter user-facing meaning
- architecture changes that cross classifier boundaries
- model strategy changes with major cost/product implications
- security boundary changes
- merge/deploy/live-provider activation

The system should compress PM questions to the smallest necessary decision rather than forwarding internal implementation detail.
