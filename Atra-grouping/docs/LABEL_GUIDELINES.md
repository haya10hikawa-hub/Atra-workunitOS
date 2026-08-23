# Label Guidelines

## Relation labels

### `SAME_WORK`

Use when the anchor and candidate refer to the same completion unit.

Decision test: if one item is completed, the other is necessarily completed by the same act and acceptance criterion.

Typical evidence:

- direct cross-provider reference to the same concrete fix, task, or deliverable
- shared acceptance condition
- same owner/action/result described at compatible granularity
- one source is a meeting/spec mention of the exact work item in the other source

Not enough by itself:

- same issue number appears in text
- same component or repository
- same person assigned
- similar wording
- close timestamp

### `RELATED`

Use when records are meaningfully connected but not the same completion unit.

Common cases:

- project-to-task
- task-to-subtask
- milestone-to-task
- dependency
- follow-up work
- duplicate discussion about a broader topic
- same incident or feature area with separate acceptance criteria

This is the label most likely to be confused with `SAME_WORK`. When in doubt, ask whether the same completion act closes both records.

### `DIFFERENT_WORK`

Use when there is enough evidence to decide the records are distinct work.

Common hard negatives:

- same project, different tasks
- same owner, same day, separate fixes
- same component, different bug
- same issue ID mentioned historically, but the candidate describes a new follow-up
- high gte/Ettin score caused by vocabulary overlap

### `UNKNOWN`

Use when a defensible decision cannot be made from available evidence.

Common cases:

- inaccessible source context
- contradictory evidence
- vague meeting note with no clear action
- missing surrounding lines
- candidate text is too short
- identity depends on private context not present in the annotation payload

`UNKNOWN` is not a failure. It prevents false certainty from entering the Gold Set.

## Work type labels

- `INITIATIVE`: strategic outcome containing multiple projects.
- `PROJECT`: coordinated body of work containing multiple tasks or milestones.
- `TASK`: independently completable work item.
- `SUBTASK`: bounded child of a task.
- `MILESTONE`: checkpoint, target date, release marker, or decision gate.
- `NOT_WORK`: contextual content with no work unit.
- `UNKNOWN`: granularity cannot be determined.

For product summaries, `INITIATIVE` and `PROJECT` may roll up as Project; `TASK` and `SUBTASK` may roll up as Task. Stored labels must remain explicit.

## Required annotation fields

Every annotation records:

- relation label
- anchor work type
- candidate work type
- confidence
- reason codes
- evidence spans where available
- annotator notes for ambiguity, source defects, or policy questions

Evidence spans are required for `SAME_WORK` and strongly recommended for `RELATED` and `DIFFERENT_WORK`.

## Reason codes

Use a small, stable set first:

- `same_completion_unit`
- `shared_acceptance_criteria`
- `explicit_cross_reference`
- `parent_child`
- `dependency`
- `follow_up`
- `shared_topic_only`
- `shared_identifier_not_identity`
- `different_acceptance_criteria`
- `insufficient_context`
- `contradictory_evidence`
- `not_work_content`

Reason codes support QA. They do not replace annotator judgment.

## Calibration examples to maintain

Maintain fixtures for:

- same Issue ID but different work
- no shared ID but same work
- same person/time but different work
- same topic but different acceptance criteria
- project-to-task `RELATED`
- milestone-to-task `RELATED`
- high score but `DIFFERENT_WORK`
- low score but `SAME_WORK`
- ambiguous or restricted evidence `UNKNOWN`

