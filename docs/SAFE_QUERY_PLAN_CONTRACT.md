# Safe Query Plan Contract

**Phase:** P6.8. **Baseline:** `main` @ `d694587`.

Defines the shape of a Safe Query Plan: the non-executable object produced by the
[`SAFE_QUERY_PLAN_GENERATION_GATE.md`](./SAFE_QUERY_PLAN_GENERATION_GATE.md) from a valid
Query Intent, conforming to the plan fields declared in
[`READ_ONLY_QUERY_PLANNING_SPEC.md`](./READ_ONLY_QUERY_PLANNING_SPEC.md) §8, and reviewed
before any future SQL compilation or database access. Documentation and a static test only.

---

## 1. Purpose

Give plan generation a single, reviewable output shape so a future rule review, SQL
compilation gate, and D1 read-only execution gate all consume the same tenant-scoped,
allowlisted, limit-bounded, provenance-planned object — never model SQL.

## 2. Scope

- **In scope:** the definition, required fields, status/operation enums, schema/tenant/
  sensitivity/limit/provenance/evidence rules, validation rules, and outcomes of a Safe
  Query Plan.
- **Out of scope:** any SQL, SQL compilation, database access, D1 execution, runtime plan
  generator, GraphRAG, vectorization, real LLM, or external execution.

## 3. Definition of Safe Query Plan

A Safe Query Plan is a non-executable, tenant-scoped, allowlisted, denylist-aware, provenance-planned query object designed for future rule review before any SQL compilation or database access.

Safe Query Planとは、SQLコンパイルやDBアクセスの前にfuture rule reviewへ渡すための、実行不能・tenant-scoped・allowlist準拠・denylist考慮・provenance計画付きのquery objectである。

## 4. What Safe Query Plan Is Not

Safe Query Plan is **not**:

- SQL
- executable code
- database access
- D1 execution
- SQL compilation
- query execution
- evidence
- provenance record
- approval
- execution authorization
- Formal WorkUnit promotion

## 5. Required Fields

- plan_id
- tenant_id
- source_query_intent_id
- related_goal_id
- related_workunit_candidate_id
- plan_status
- operation_type
- allowed_tables
- allowed_columns
- denied_tables
- denied_columns
- tenant_scope_filter
- sensitivity_handling
- redaction_plan
- aggregation_plan
- row_limit
- time_limit
- cost_limit
- expected_result_shape
- provenance_capture_plan
- evidence_eligibility
- human_review_required
- execution_allowed
- unsupported_assumptions
- no_go_flags
- created_by_system
- created_at

Note: this contract supersedes the `query_intent` field declared in
[`READ_ONLY_QUERY_PLANNING_SPEC.md`](./READ_ONLY_QUERY_PLANNING_SPEC.md) §8 with
`source_query_intent_id` — a normalized reference to the P6.7 Query Intent object replaces
the embedded copy; the remaining 20 fields match §8 verbatim, plus the additions above.

## 6. Plan Status

`plan_status` is one of:

- draft_plan
- clarification_needed
- blocked_no_go
- ready_for_rule_review

Reconciliation with the gate's outputs: `clarification_needed` and `No-Go` may be emitted
either as bare gate outcomes or as a plan object carrying `plan_status`
`clarification_needed` / `blocked_no_go`; in the plan-object form, `operation_type` records
the operation type that was attempted before the outcome was reached.

## 7. Plan Operation Types

`operation_type` is one of:

- lookup_plan
- filter_plan
- aggregate_plan
- compare_plan
- trend_plan
- count_plan
- existence_check_plan
- relationship_lookup_plan
- provenance_lookup_plan
- evidence_lookup_plan

## 8. Schema Reference Fields

allowed_tables and allowed_columns must reference documented schema only.

denied_tables and denied_columns must be preserved from Query Intent and D1 Schema Catalog.

Denied tables and denied columns must override allowed tables and allowed columns.

Unknown schema must appear in unsupported_assumptions or no_go_flags.

The model must not invent schema.

The model must not use model confidence as schema evidence.

## 9. Tenant Scope Fields

tenant_id is required.

tenant_scope_filter is required.

tenant_scope_filter must be enforceable by rules outside the LLM.

A Safe Query Plan without tenant_id is No-Go.

A Safe Query Plan without tenant_scope_filter is No-Go.

A Safe Query Plan must not request cross-tenant access.

## 10. Sensitivity, Redaction, and Aggregation Fields

secret_or_token data must not be queryable.

blocked_input data must not be queryable.

unknown_sensitive data must not be queryable.

personal_data must require human review and redaction consideration.

redaction_plan must be explicit when sensitive data may appear.

aggregation_plan must describe source scope and aggregation method.

## 11. Limit Fields

row_limit is required.

time_limit is required.

cost_limit is required.

Limits must be conservative by default.

A Safe Query Plan without row_limit, time_limit, or cost_limit is Fail or No-Go depending on risk.

Risk criterion: missing limits are **No-Go** when the plan touches sensitive or personal
data, or is non-aggregate over tenant business data; otherwise the missing limit is a
**Fail** (a validity defect that blocks `ready_for_rule_review` until corrected, per §15).

## 12. Provenance Capture Fields

provenance_capture_plan is required.

provenance_capture_plan must include table reference, column reference, row reference strategy, query plan id, tenant id, obtained_at, and redaction state.

Aggregated results must preserve aggregation method and source scope.

## 13. Evidence Eligibility Fields

evidence_eligibility must be explicit.

A Safe Query Plan may describe future evidence eligibility, but it must not create evidence.

A Safe Query Plan must not be treated as evidence.

Future query results must restore provenance before they can support human review.

## 14. Human Review Requirements

`human_review_required` is set whenever the decision rubric requires it: sensitive or
personal data, redaction, aggregation, contradiction, missing information, or any result
that would affect priority, risk, action readiness, or promotion readiness (per
[`DECISION_RUBRIC.md`](./archive/v0/DECISION_RUBRIC.md) and
[`READ_ONLY_QUERY_PLANNING_SPEC.md`](./READ_ONLY_QUERY_PLANNING_SPEC.md) §14).

## 15. Validation Rules

A valid Safe Query Plan must be non-executable.

A valid Safe Query Plan must not contain executable SQL.

A valid Safe Query Plan must contain tenant_id.

A valid Safe Query Plan must contain tenant_scope_filter.

A valid Safe Query Plan must preserve denied tables and denied columns.

A valid Safe Query Plan must deny secret_or_token, blocked_input, and unknown_sensitive data.

A valid Safe Query Plan must include row_limit, time_limit, and cost_limit.

A valid Safe Query Plan must include provenance_capture_plan.

A valid Safe Query Plan must not authorize execution.

execution_allowed must be false in this phase.

## 16. Pass / Warn / Fail / No-Go Outcomes

Pass:
The Safe Query Plan is non-executable, tenant-scoped, schema-grounded, allowlisted, denylist-aware, limited, provenance-planned, and safe for future rule review.

Warn:
The Safe Query Plan is non-executable and tenant-scoped, but clarification or quality improvement is needed.

Fail:
Required fields or grounding requirements are missing, but no hard safety boundary is crossed.

No-Go:
A hard safety boundary is violated, such as executable SQL, missing tenant scope, cross-tenant plan, denied schema request, secret_or_token request, blocked_input request, unknown_sensitive request, database access, or execution authorization.

## 17. Non-authorization Statement

This Safe Query Plan Contract authorizes no SQL generation, no SQL execution, no D1 execution, no SQL compilation, no free-form SQL generation, no runtime query planner, no runtime Safe Query Plan generation, no database access, no LLM-controlled database access, no GraphRAG implementation, no vectorization, no real LLM enablement, no external execution, no Formal WorkUnit promotion, and no automated decision-making.

Enforcement in code is governed by separate, future gates with recorded human decisions.
