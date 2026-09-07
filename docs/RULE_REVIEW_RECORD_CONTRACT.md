# Rule Review Record Contract

**Classification: REFERENCE — CURRENT TECHNICAL ARTIFACT; NO PRODUCT AUTHORITY.** Frozen V0 links are historical provenance only.

**Phase:** P6.10. **Baseline:** `main` @ `0fe6d60`.

Defines the shape of a Rule Review Record: the non-executing object produced by the
[`RULE_REVIEW_GATE.md`](./RULE_REVIEW_GATE.md) from a valid Compiled SQL Artifact
([`COMPILED_SQL_ARTIFACT_CONTRACT.md`](./COMPILED_SQL_ARTIFACT_CONTRACT.md)), reviewed before
any future D1 read-only execution gate. Documentation and a static test only.

---

## 1. Purpose

Give rule review a single, reviewable output shape so a future D1 read-only execution gate
consumes a tenant-scoped, lineage-verified, check-by-check record — never an implicit "looks
fine" — and so humans can see exactly which checks passed before anything else is proposed.

## 2. Scope

- **In scope:** the definition, required fields, status/outcome enums, lineage/tenant/
  parameter-binding/schema/limit/provenance review rules, evidence and human review
  boundaries, validation rules, and outcomes of a Rule Review Record.
- **Out of scope:** any D1 execution, SQL execution, database access, runtime rule review,
  runtime approval, runtime SQL compiler, GraphRAG, vectorization, real LLM, or external
  execution.

## 3. Definition of Rule Review Record

A Rule Review Record is a non-executing, tenant-scoped review artifact that records whether a Compiled SQL Artifact satisfies lineage, parameter binding, denylist, limit, and provenance requirements before any future D1 read-only execution gate.

Rule Review Recordとは、将来のD1 read-only execution gateの前に、Compiled SQL Artifactがlineage・parameter binding・denylist・limit・provenance requirementsを満たすかを記録する、非実行・tenant-scopedなreview artifactである。

## 4. What Rule Review Record Is Not

Rule Review Record is **not**:

- D1 execution
- SQL execution
- database access
- approval
- execution authorization
- evidence
- provenance record
- Formal WorkUnit promotion
- human approval replacement
- external action

## 5. Required Fields

- review_id
- tenant_id
- source_compiled_sql_artifact_id
- source_safe_query_plan_id
- source_query_intent_id
- related_goal_id
- related_workunit_candidate_id
- review_status
- review_outcome
- lineage_check_result
- tenant_scope_check_result
- parameter_binding_check_result
- schema_allowlist_check_result
- schema_denylist_check_result
- limit_check_result
- cost_check_result
- provenance_capture_check_result
- evidence_boundary_check_result
- human_review_required
- execution_allowed
- reviewed_by_system
- reviewed_at
- unsupported_assumptions
- no_go_flags
- notes

Note: `reviewed_by_system` names the deterministic rule set (and its version) that produced
the record — never a model identity; a Rule Review Record must be reproducible from the same
inputs and the same rule-set version.

## 6. Review Status

`review_status` is one of:

- draft_review
- clarification_needed
- blocked_no_go
- ready_for_future_execution_gate_review

Reconciliation with the gate's outputs: `clarification_needed` and `No-Go` may be emitted
either as bare gate outcomes or as a record carrying `review_status` `clarification_needed`
/ `blocked_no_go`; in the record form, the per-check `*_check_result` fields record what was
checked before the outcome was reached.

## 7. Review Outcome Types

`review_outcome` is one of:

- pass
- warn
- fail
- no_go

A `warn` or `fail` outcome maps to `review_status` `draft_review` or `clarification_needed`
(never `ready_for_future_execution_gate_review`); a `no_go` outcome maps to `blocked_no_go`;
only a `pass` outcome may carry `ready_for_future_execution_gate_review`.

## 8. Lineage Fields

source_compiled_sql_artifact_id is required.

source_safe_query_plan_id is required.

source_query_intent_id is required.

Lineage mismatch is No-Go.

A Rule Review Record must not silently drop unsupported_assumptions or no_go_flags from source artifacts.

## 9. Tenant Scope Fields

tenant_id is required.

tenant_scope_check_result is required.

Tenant scope must be enforceable by rules outside the LLM.

A Rule Review Record without tenant_id is No-Go.

A Rule Review Record must not allow cross-tenant execution.

## 10. Parameter Binding Review Fields

parameter_binding_check_result is required.

tenant_id must be bound as a parameter.

All user-controlled values must be represented as bound parameters.

String interpolation is No-Go.

String concatenation for SQL construction is No-Go.

## 11. Schema Review Fields

schema_allowlist_check_result is required.

schema_denylist_check_result is required.

Denied tables and denied columns must override allowed tables and columns.

secret_or_token, blocked_input, and unknown_sensitive data must fail review.

Unknown schema must produce clarification_needed or No-Go.

## 12. Limit and Cost Review Fields

limit_check_result is required.

cost_check_result is required.

row_limit, time_limit, and cost_limit must be preserved from the compiled artifact.

Missing limits are Fail or No-Go depending on risk.

Risk criterion: missing limits are **No-Go** when the reviewed artifact touches sensitive or
personal data, or is non-aggregate over tenant business data; otherwise the missing limit is
a **Fail**, matching [`COMPILED_SQL_ARTIFACT_CONTRACT.md`](./COMPILED_SQL_ARTIFACT_CONTRACT.md)
§11.

## 13. Provenance Review Fields

provenance_capture_check_result is required.

provenance_capture_plan must be present before future D1 execution.

Rule Review Record may describe future provenance capture, but it must not create provenance records.

## 14. Evidence Boundary and Human Review Requirements

Rule Review Record is not evidence.

Rule Review Record must not be treated as evidence.

Rule Review Record must not authorize execution.

execution_allowed must be false in this phase.

human_review_required must be explicit.

Human review is required when review_outcome is warn, fail, or no_go.

`human_review_required` is also preserved from the source artifacts whenever the decision
rubric requires it (per [`DECISION_RUBRIC.md`](./archive/v0/DECISION_RUBRIC.md)); a pass outcome never
clears a human review requirement inherited from the source Safe Query Plan or Compiled SQL
Artifact.

## 15. Validation Rules

A valid Rule Review Record must be non-executing.

A valid Rule Review Record must contain tenant_id.

A valid Rule Review Record must contain source_compiled_sql_artifact_id.

A valid Rule Review Record must contain source_safe_query_plan_id.

A valid Rule Review Record must contain source_query_intent_id.

A valid Rule Review Record must preserve unsupported_assumptions and no_go_flags.

A valid Rule Review Record must include lineage_check_result.

A valid Rule Review Record must include parameter_binding_check_result.

A valid Rule Review Record must include schema_allowlist_check_result.

A valid Rule Review Record must include schema_denylist_check_result.

A valid Rule Review Record must include limit_check_result.

A valid Rule Review Record must include provenance_capture_check_result.

A valid Rule Review Record must not authorize execution.

execution_allowed must be false in this phase.

## 16. Pass / Warn / Fail / No-Go Outcomes

Pass:
The Rule Review Record confirms that the Compiled SQL Artifact is non-executing, tenant-scoped, lineage-consistent, parameterized, denylist-safe, limit-preserving, provenance-planned, and safe for future D1 read-only execution gate review.

Warn:
The Rule Review Record is non-executing and tenant-scoped, but clarification, human review, or quality improvement is needed before future execution-gate review.

Fail:
Required review fields or consistency checks are missing, but no hard safety boundary is crossed.

No-Go:
A hard safety boundary is violated, such as D1 access, SQL execution, missing tenant scope, cross-tenant review, lineage mismatch, denied schema reference, string interpolation, string concatenation, secret_or_token request, blocked_input request, unknown_sensitive request, or execution authorization.

## 17. Non-authorization Statement

This Rule Review Record Contract authorizes no D1 execution, no SQL execution, no database access, no approval, no execution authorization, no runtime rule review, no runtime approval, no provenance record creation, no GraphRAG implementation, no vectorization, no real LLM enablement, no external execution, no Formal WorkUnit promotion, and no automated decision-making.

Enforcement in code is governed by separate, future gates with recorded human decisions.
