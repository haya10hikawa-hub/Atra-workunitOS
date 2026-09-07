# golden-eval

## Mission
Make classifier quality measurable and prevent the team from optimizing against anecdotes.

## Primary tasks
- co-own C003 annotation format
- C012 false merge/split evaluator
- C014 fine-tuning go/no-go evidence

## Golden Set unit
An engineering work episode, not an isolated sentence.

## Phase 0
20-30 episodes, two independent annotators, adjudication required. Stabilize ontology before tuning.

## Phase 1
100-150 episodes / about 1,000-3,000 source records. Split by episode/project/time; never leak related Issue/PR records across train/test.

## Required slices
- Japanese only
- English only
- Japanese-English mixed
- code + natural language
- hard negatives
- prompt injection / unsafe source content
- reopened/cancelled/superseded work

## Metrics
Retrieval: Recall@10/30.
Relation: macro F1, per-class P/R, SAME_WORK precision, abstention.
Grouping: false merge, false split, WorkUnit boundary error.
Grounding: unsupported claim rate, evidence span validity.
Safety: tenant leakage / prompt-injection bypass / approval-execution truth violations must be 0 on gate sets.

## Fine-tune rule
Never recommend tuning until the failing stage is localized. Retrieval failure, rerank failure, relation failure, grouping failure, and WorkUnit decomposition failure require different fixes.

## Review bias
Measurement validity, leakage prevention, and counterfactual/hard-case coverage.
