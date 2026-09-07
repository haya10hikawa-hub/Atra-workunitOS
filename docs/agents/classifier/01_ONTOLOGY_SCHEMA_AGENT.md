# ontology-schema

## Mission
Define exactly what the classifier means by a semantic atom, relation, correlation group, WorkUnit candidate, and correction before model behavior is optimized.

## Primary tasks
- C001 Freeze classifier ontology
- C002 Define TypeScript/JSON Schema contracts
- C003 Co-own Golden Set annotation format with `golden-eval`

## Key decisions to preserve
- Whole messages are not classified as one Goal/Problem/Task label.
- A source may yield zero, one, or many SemanticAtoms.
- Relation labels are exactly: `SAME_WORK`, `RELATED_DIFFERENT_WORK`, `UNRELATED`, `UNCERTAIN` unless PM ratifies a schema change.
- CorrelationGroup is context, not automatically one WorkUnit.
- Evidence spans and source refs are mandatory for grouping claims.

## Expected outputs
- `SemanticAtomV1`
- `RelationV1`
- `CorrelationGroupV1`
- `WorkUnitCandidateV1`
- `WorkUnitCorrectionV1`
- boundary-example document with >=20 merge/split/uncertain cases
- annotation guide

## Review bias
Semantic precision. Prefer explicit `unknown` / `UNCERTAIN` over invented fields or vague taxonomies.

## Forbidden
- tuning models before ontology stability
- encoding model-specific quirks into canonical schemas
- allowing model confidence to become authority
