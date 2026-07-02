# Decomposition Standard

**Phase:** P6.3. **Baseline:** `main` @ `eac1f50`.

Defines, at the product level, what decomposition means in Atra: how a goal-relevant Signal
becomes candidate decision units carrying explicit evidence, provenance, missing
information, risks, dependencies, conflicts, and human-review requirements. Builds on the
P6.1 constitution ([`ATRA_DOCTRINE.md`](./ATRA_DOCTRINE.md),
[`INFORMATION_INTAKE_POLICY.md`](./INFORMATION_INTAKE_POLICY.md),
[`DECISION_RUBRIC.md`](./DECISION_RUBRIC.md)) and the P6.2 evidence foundation
([`EVIDENCE_STANDARD.md`](./EVIDENCE_STANDARD.md),
[`PROVENANCE_MODEL.md`](./PROVENANCE_MODEL.md)), and pairs with
[`TYPED_DECOMPOSITION_OBJECT.md`](./TYPED_DECOMPOSITION_OBJECT.md). Documentation and a
static test only.

> This is a **product-level standard and contract**. Decomposition runtime already exists
> in the codebase (mock-only, candidate-only); this phase does **not** change that runtime
> behavior, does not wire anything, and promotes nothing.

---

## 1. Purpose

Fix what "good decomposition" means so that the runtime, the evaluation harness, retrieval,
and LLM judgment all convert Signals into reviewable candidates the same disciplined way —
never summaries, never autonomous plans.

## 2. Scope

- **In scope:** the definition of decomposition, its flow, the meaning of Signal / Intent /
  Problem / WorkUnit Candidate / Action Candidate, the candidate-only and evidence/provenance
  rules, granularity, and the quality rubric.
- **Out of scope:** any runtime decomposition implementation, Formal WorkUnit promotion,
  runtime WorkUnit storage, GraphRAG, vectorization, NL2SQL, real LLM, or external execution.

## 3. Definition of Decomposition

Decomposition is the conversion of goal-related signals into candidate decision units with explicit evidence, provenance, missing information, risks, dependencies, conflicts, and human-review requirements.

分解とは要約ではない。分解とは、goalに関係するSignalを、証拠・provenance・不足情報・リスク・依存関係・矛盾・人間レビュー条件を持つ判断候補単位へ変換することである。

## 4. What Decomposition Is Not

Decomposition is **not**:

- summarization
- task extraction only
- priority scoring only
- autonomous planning
- execution preparation
- external action authorization
- Formal WorkUnit promotion
- truth resolution by the model

## 5. Decomposition Flow

```
Signal → Intent → Problem → WorkUnit Candidate → Action Candidate → Human Review
```

Every stage produces candidate-only output; the flow ends at human review, never at an
autonomous action (Action Field is workspace, not execution plane).

## 6. Signal

Signal:
An observed piece of goal-relevant information that may affect a decision, priority, risk, dependency, evidence, or next action.

A Signal enters only through the intake policy (accepted, not blocked) and carries
provenance from ingest.

## 7. Intent

Intent:
The inferred or explicit purpose, request, pressure, or decision need contained in a Signal.

Inferred intent is a candidate reading, not a fact; low-confidence or ambiguous intent is a
reason to hold or to require human review, never to act.

## 8. Problem

Problem:
The unresolved condition that prevents the user from making or completing a decision.

The Problem names what is blocking the human decision, so the WorkUnit Candidate can target
one reviewable resolution.

## 9. WorkUnit Candidate

WorkUnit Candidate:
A candidate decision unit that may become reviewable by a human, but is not a Formal WorkUnit.

## 10. Action Candidate

Action Candidate:
A proposed next action, draft, tool suggestion, clarification, or review request attached to a WorkUnit Candidate.

## 11. Missing Information

Missing information must be represented explicitly and must not be treated as negative evidence.

A candidate with unresolved missing information stays held/pending and is presented to the
human as "what is missing", never silently completed by a model guess.

## 12. Risk, Dependency, Duplicate, and Conflict Handling

- **Risk** is attached with its evidence and a candidate mitigation, and may require human
  review.
- **Dependency** (depends_on / blocks / blocked_by) is made explicit so ordering is visible.
- **Duplicate** detection is decided first by deterministic canonical matching; the model
  may only propose duplicate candidates.
- **Conflict / contradiction** is preserved: Contradiction must be preserved as a review signal, not silently resolved during decomposition.

## 13. Evidence and Provenance Requirements

- Decomposition must preserve evidence references and provenance references.
- Model confidence must not be used as evidence or as permission to promote a candidate.
- Evidence references point to provenance-bearing evidence per
  [`EVIDENCE_STANDARD.md`](./EVIDENCE_STANDARD.md); provenance references point to records
  per [`PROVENANCE_MODEL.md`](./PROVENANCE_MODEL.md).
- Unsupported claims are marked unsupported and never raise action readiness on their own.

## 14. WorkUnit Granularity

A good WorkUnit Candidate should correspond to one human-reviewable decision or one completion condition.

Too large → split candidate; multiple Signals for one decision → merge candidate. Splits and
merges are candidate proposals, decided by a human.

## 15. Decomposition Quality Rubric

A decomposition is evaluated on:

- goal relevance
- evidence coverage
- provenance preservation
- missing information clarity
- risk visibility
- dependency clarity
- duplicate detection
- conflict preservation
- actionability for human review
- candidate-only safety

## 16. Human Review and Promotion Boundary

- A WorkUnit Candidate is not a Formal WorkUnit.
- A Formal WorkUnit must not be created from blocked input.
- A Formal WorkUnit must not be created while required evidence or missing information remains unresolved.
- Action Candidate means proposed action for human review, not permission to execute.
- Draft generation may be suggested, but Draft must not be treated as Sent.
- Preview must not be treated as Approval.
- Approval must not be treated as Execution.

Promotion (candidate → Formal WorkUnit) is a human-only action; LLM confidence cannot skip
Human Review.

## 17. Non-authorization Statement

This Decomposition Standard authorizes no runtime decomposition implementation, no Formal WorkUnit promotion, no runtime WorkUnit storage, no GraphRAG implementation, no vectorization, no NL2SQL execution, no real LLM enablement, no external execution, and no automated decision-making.

Enforcement in code is governed by separate, future gates
([`NEXT_CAPABILITY_GATE.md`](./NEXT_CAPABILITY_GATE.md)) with recorded human decisions.
