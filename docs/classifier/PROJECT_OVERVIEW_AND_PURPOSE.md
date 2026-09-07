# Atra Classifier — Project Overview and Purpose

Status: Design baseline v1
Branch: `codex/classifier-work-reconstruction`
Scope: Classifier subsystem only

## 1. What this project is

Atra is not being designed as a generic task manager, search UI, or AI chat.

The classifier project exists to build the core engine that reconstructs engineering work from scattered evidence.

The classifier receives normalized source records from tools such as GitHub, Slack, documents, code, and later other providers. It must determine what each fragment means, how fragments relate, which fragments belong to the same work, which are merely related, and which independently trackable WorkUnits should exist.

The canonical classifier boundary is:

```text
SourceRecordV1[]
  -> SemanticAtomV1[]
  -> RetrievalCandidateV1[]
  -> RelationV1[]
  -> CorrelationGroupV1[]
  -> WorkUnitCandidateV1[]
```

The classifier stops at `WorkUnitCandidateV1`. Approval, execution, provider writes, deploy, billing, and production tenant administration are outside this team's scope.

## 2. User problem

The first target user is an engineer or small engineering team.

Today, engineers repeatedly reconstruct context by opening multiple tools and answering questions such as:

- What is this work actually about?
- Is this Slack thread the same work as this GitHub Issue?
- Is this PR a continuation of the issue or an independent task?
- Which decision is current and which one has been superseded?
- What has already been completed?
- What is blocked or waiting?
- Which code, documents, or discussions matter right now?
- What should be done next?

The problem is not simply that information is unclassified. The deeper problem is that the current state of work is fragmented across sources and has to be manually reconstructed.

## 3. Product thesis

Atra should reduce the cost of reconstructing work state without increasing incorrect merges, incorrect splits, or unsupported claims.

The key product statement is:

> Reconstruct work, not just tasks.

For the local-first product direction:

> Keep work context on the user's machine or trusted infrastructure, and reconstruct the current work state from evidence.

## 4. Core product questions

For each work episode, Atra should eventually answer:

1. What work exists?
2. What evidence supports each work item?
3. Which information refers to the same work?
4. Which information is related but independently completable?
5. What is the current state?
6. What changed over time?
7. What information is missing?
8. What should the user inspect, decide, or do next?
9. Which files, code, documents, tools, or AI are relevant?

## 5. Why Goal / Problem / Task alone is insufficient

A single source message can contain multiple semantic units at once.

Example:

```text
The login bug is still happening.
Hayato, investigate it today.
Do not deploy before approval.
```

This contains at least:

- `problem`: login bug still happening
- `task_request`: investigate it
- `constraint`: no deploy before approval

Therefore Atra must not force an entire message into a single Goal / Problem / Task class.

The initial semantic atom taxonomy is:

- `goal`
- `problem`
- `task_request`
- `decision`
- `question`
- `constraint`
- `evidence_claim`
- `status_update`
- `context`

A separate relation layer then determines:

- `SAME_WORK`
- `RELATED_DIFFERENT_WORK`
- `UNRELATED`
- `UNCERTAIN`

## 6. Core distinction: CorrelationGroup vs WorkUnit

`CorrelationGroupV1` is a context cluster.

`WorkUnitCandidateV1` is one independently trackable outcome.

They are not the same object.

A login incident may correlate:

- an Issue
- a Slack discussion
- two PRs
- a decision message
- a customer communication task

but the incident may still contain separate WorkUnits such as:

- investigate root cause
- implement backend fix
- verify frontend behavior
- communicate with customer

This distinction is central to Atra's classifier quality.

## 7. Product principles

The classifier must preserve these invariants:

- AI proposes candidates; it does not own final authority.
- Vector similarity is retrieval evidence, never SAME_WORK truth.
- `A SAME B` and `B SAME C` do not automatically imply `A SAME C`.
- Every grouping claim keeps `sourceRef` and `evidenceSpan`.
- `UNCERTAIN` is a valid answer.
- Unknown actor, deadline, state, or ownership remains unknown.
- Tenant, identity, approval, execution, and security truth are never inferred by a model.
- Corrections are append-only and never erase original evidence.
- False merge is treated as a particularly expensive failure.

## 8. Current development position

The existing repository already has bounded proof around `SourceRecordV1`, recorded GitHub capture, several security boundaries, preview/approval safety, and build/test gates.

The central classifier path remains the main unfinished product core:

```text
SourceRecord
  -> CorrelationGroup
  -> WorkUnitCandidate
  -> HumanCorrection
```

The purpose of this branch is to turn that path from a concept into an independently measurable subsystem.

## 9. Success definition

The classifier project succeeds when another Atra component can call one stable boundary such as:

```ts
classifyWorkEpisode(sourceRecords)
```

and receive grounded, reviewable output containing:

- semantic atoms
- relations
- correlation groups
- WorkUnit candidates
- uncertainty
- evidence references
- evaluation trace

without depending on a specific internal model implementation.
