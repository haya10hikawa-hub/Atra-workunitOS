# Decomposition Evaluation Harness Spec

**Phase:** P6.5. **Baseline:** `main` @ `e229cdf`.

Defines, at the product level, what it means to evaluate decomposition quality in Atra: a
controlled, offline, fixture-based specification that measures whether decomposition output
preserves the boundaries fixed by the P6.1 constitution, the P6.2 evidence/provenance
standard, the P6.3 decomposition standard / typed object, and the P6.4 relationship/graph
model. Pairs with [`DECOMPOSITION_EVALUATION_RUBRIC.md`](./DECOMPOSITION_EVALUATION_RUBRIC.md).
Documentation and a static test only.

> A runtime evaluation harness already exists in the codebase
> (`decompositionEvalHarness.ts`, `decompositionGoldenRunner.ts`, `pmCorrectionTaxonomy.ts`);
> this phase does **not** change that runtime behavior, does not wire anything, and runs no
> evaluation. This is the specification the future runtime must conform to.

---

## 1. Purpose

Make decomposition quality measurable against Atra's written standards — so that "better
decomposition" means "safer, more grounded, more reviewable", never "sounded more useful".

A decomposition evaluation harness does not judge whether the AI sounded useful. It
measures whether decomposition output preserves Atra's safety, evidence, provenance,
relationship, candidate-only, and human-review boundaries.

## 2. Scope

- **In scope:** the definition of the evaluation harness, its inputs/outputs, fixture and
  golden-case requirements, required safety checks, and report structure.
- **Out of scope:** any runtime evaluation implementation, live LLM evaluation, production
  data processing, GraphRAG/vector/NL2SQL benchmarks, real LLM, or external execution.

## 3. Definition of Decomposition Evaluation Harness

A Decomposition Evaluation Harness is a controlled, offline, fixture-based evaluation specification for measuring whether decomposition outputs comply with Atra's doctrine, intake, decision, evidence, provenance, typed-object, relationship, graph, and human-review rules.

Decomposition Evaluation Harnessとは、AIの出力がそれらしく見えるかを測るものではない。Atraの分解結果が、安全境界・証拠・provenance・関係性・candidate-only境界・人間レビュー条件を守っているかを測るための評価仕様である。

## 4. What the Evaluation Harness Is Not

The evaluation harness is **not**:

- live LLM evaluation
- runtime decomposition execution
- production data processing
- approval gate
- execution gate
- GraphRAG benchmark
- NL2SQL benchmark
- vector retrieval benchmark
- model leaderboard by itself
- Formal WorkUnit promotion mechanism
- automated decision-making system

## 5. Evaluation Inputs

Each evaluation case provides:

- fixture_id
- tenant_id
- goal_context
- input_signal
- expected_intents
- expected_problems
- expected_workunit_candidates
- expected_action_candidates
- expected_missing_information
- expected_risks
- expected_dependencies
- expected_duplicates
- expected_conflicts
- expected_evidence_refs
- expected_provenance_refs
- expected_relationships
- expected_graph_nodes
- expected_graph_edges
- expected_human_review_required
- expected_no_go_flags

## 6. Evaluation Outputs

Each evaluation case yields:

- case_id
- pass_warn_fail_no_go
- failed_dimensions
- missing_required_fields
- unsupported_claims
- evidence_coverage_result
- provenance_preservation_result
- relationship_validity_result
- candidate_only_safety_result
- human_review_result
- promotion_boundary_result
- external_action_safety_result
- regression_notes

## 7. Fixture and Golden Case Requirements

Golden labels must be human-authored or human-reviewed.

Fixtures must not contain live secrets, tokens, passwords, or unredacted sensitive data.

Fixtures must not require network access.

Fixtures must not require real LLM access.

Fixtures must include tenant_id.

Fixtures must include expected evidence and provenance behavior when claims affect priority, risk, action readiness, or human review.

Fixtures must include negative cases where blocked input, unsupported claims, contradictions, and missing information are present.

## 8. Evaluation Dimensions

Evaluation scores the rubric dimensions defined in
[`DECOMPOSITION_EVALUATION_RUBRIC.md`](./DECOMPOSITION_EVALUATION_RUBRIC.md) — goal
relevance, object-kind correctness, evidence coverage, provenance preservation,
missing-information clarity, risk visibility, dependency/duplicate/conflict/contradiction
detection, relationship/graph validity, action-candidate safety, candidate-only safety,
tenant-scope integrity, and external-action safety.

## 9. Required Safety Checks

Every evaluation run must include:

- blocked input promotion check
- candidate_only check
- execution_allowed check
- external_action_level check
- model_confidence_as_evidence check
- unsupported_claims_action_readiness check
- missing_information_negative_evidence check
- contradiction_silent_resolution check
- cross_tenant_relationship check
- draft_sent_confusion check
- preview_approval_confusion check
- approval_execution_confusion check

## 10. Candidate-only Boundary Checks

candidate_only must remain true.

A WorkUnit Candidate must not be treated as a Formal WorkUnit.

No evaluation result may promote a candidate.

No evaluation score may authorize execution.

## 11. Evidence and Provenance Checks

Evaluation verifies that evidence references resolve to provenance-bearing evidence per
[`EVIDENCE_STANDARD.md`](./EVIDENCE_STANDARD.md), that provenance references follow
[`PROVENANCE_MODEL.md`](./PROVENANCE_MODEL.md), that model confidence is never counted as
evidence, and that unsupported claims are marked unsupported and never raise action
readiness.

## 12. Relationship and Graph Checks

Evaluation verifies that emitted relationships and graph nodes/edges conform to
[`RELATIONSHIP_SCHEMA.md`](./RELATIONSHIP_SCHEMA.md) and [`GRAPH_MODEL.md`](./archive/v0/GRAPH_MODEL.md):
typed, tenant-scoped, no cross-tenant edges, contradiction/conflict/missing-information
preserved as reviewable structures, and no relationship that promotes or executes.

## 13. Human Review and Promotion Checks

Evaluation verifies that `human_review_required` is set whenever the decision rubric
requires it, that promotion blockers are present when evidence or missing information is
unresolved, and that no output treats Draft as Sent, Preview as Approval, or Approval as
Execution.

## 14. Evaluation Report Requirements

Evaluation reports must show what failed, why it failed, which safety boundary was affected, and whether the result is Pass, Warn, Fail, or No-Go.

Reports reference the fixture, the failed dimensions, and the affected boundary so a human
can act on them; a report is information for humans, never an authorization.

Run-level aggregation is fail-closed: if any case is No-Go the run is No-Go; otherwise if
any case is Fail the run is Fail; otherwise if any case is Warn the run is Warn; otherwise
the run is Pass.

## 15. Regression and Release-Gate Use

Evaluation results may inform regression tracking and release decisions (e.g. as evidence
in the release decision record), but a passing evaluation never authorizes promotion,
execution, or capability enablement — those remain governed by their own gates and human
sign-off.

## 16. Relationship to Future Runtime / LLM / GraphRAG / NL2SQL

A future runtime harness implementing this spec requires its own gate. LLM judgment
evaluation, GraphRAG benchmarks, vector retrieval benchmarks, and NL2SQL evaluation each
require their own separate gates and are out of scope here. Live evaluation of a real LLM
is No-Go until the LLM judgment evaluation gate and the real-LLM gate are satisfied.

## 17. Non-authorization Statement

This Decomposition Evaluation Harness Spec authorizes no runtime evaluation implementation, no live LLM evaluation, no production data processing, no Formal WorkUnit promotion, no runtime WorkUnit storage, no GraphRAG implementation, no vectorization, no NL2SQL execution, no real LLM enablement, no external execution, and no automated decision-making.

Enforcement in code is governed by separate, future gates
([`NEXT_CAPABILITY_GATE.md`](./NEXT_CAPABILITY_GATE.md)) with recorded human decisions.
