# ADR 0013: Needle-Style Classification and Slot Filling

## Status

Accepted

## Context

Needle 2 is a small specialist model designed for tool calling, device use, and structured extraction. Its relevant design pattern for Atra is not broad chat generation. It is narrow schema-bound prediction: choose a fixed class, fill typed arguments, attach confidence, and escalate low-confidence cases.

Atra's Gold platform needs this same shape for work-unit evidence. The platform should identify whether a chunk is a work action, decision, status update, reference, not-work text, or unknown, then extract bounded slots such as owner, due date, status, identifier, acceptance criteria, dependencies, and blockers.

## Decision

Introduce `StructuredSignal` as a first-class derived artifact:

`Chunk -> StructuredSignal -> CandidatePair/Sampling/QA`

`StructuredSignal` is separate from `Annotation`, `Adjudication`, and `GoldRelease`.

The first schema supports:

- classification: `WORK_ACTION`, `WORK_DECISION`, `WORK_STATUS_UPDATE`, `WORK_REFERENCE`, `NOT_WORK`, `UNKNOWN`
- slots: `work_identifier`, `owner`, `participant`, `due_date`, `status`, `acceptance_criterion`, `source_reference`, `action_object`, `blocker`, `dependency`, `amount`, `time_window`

Every slot must carry an evidence span and confidence. `NOT_WORK` cannot carry work slots.

## Consequences

- Classification and slot filling can guide sampling, queue routing, QA coverage, and source-defect review.
- Classification and slots are model-derived evidence features, not Gold truth.
- `SAME_WORK` remains a blind human annotation decision.
- Low-confidence or `UNKNOWN` structured signals are valid outputs and should route to human review instead of being forced.
- Future Needle 2, small classifier, or cloud model adapters must emit this schema and pass contract tests before production use.
