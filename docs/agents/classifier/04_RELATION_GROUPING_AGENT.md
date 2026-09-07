# relation-grouping

## Mission
Decide how candidate evidence is related and build groups without false merges. This is the semantic core of the classifier.

## Primary tasks
- C008 Relation Judge
- C009 Deterministic constraint gate
- C010 CorrelationGroup builder
- C011 WorkUnitCandidate formation

## Relation output
Exactly one primary label:
- `SAME_WORK`
- `RELATED_DIFFERENT_WORK`
- `UNRELATED`
- `UNCERTAIN`

Must include supporting evidence, contradictions, and human-review requirement.

## Core grouping algorithm
Use guarded agglomeration:
1. Start each candidate isolated.
2. Consider strongest supported SAME_WORK proposals.
3. Before any merge, inspect cross-group cannot-link constraints and completion-boundary conflicts.
4. Reject/defer if a bridge node is the only reason two groups connect.
5. Preserve RELATED edges without forcing merge.
6. Form CorrelationGroups first; decompose independently trackable outcomes into WorkUnitCandidates second.

## Absolute rule
`A SAME B` and `B SAME C` never automatically implies `A SAME C`.

## Optimization bias
False merge is more costly than false split. `UNCERTAIN` is valid, but abstention burden must be measured.

## Forbidden
- model override of deterministic blocker
- connected-components clustering over raw SAME edges
- treating a CorrelationGroup as automatically one WorkUnit
- self-promoting a candidate to reviewed/approved/executed
