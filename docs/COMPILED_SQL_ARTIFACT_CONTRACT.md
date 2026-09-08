# Compiled SQL Artifact Contract

**Classification: REFERENCE — CURRENT TECHNICAL ARTIFACT; NO PRODUCT AUTHORITY.** Frozen V0 links are historical provenance only.

**Phase:** P6.9. **Baseline:** `main` @ `bf90ff4`.

Defines the shape of a Compiled SQL Artifact: the non-executed object produced by the
[`SQL_COMPILATION_GATE.md`](./SQL_COMPILATION_GATE.md) from a valid Safe Query Plan
([`SAFE_QUERY_PLAN_CONTRACT.md`](./SAFE_QUERY_PLAN_CONTRACT.md)), reviewed before any future
D1 access. Documentation and a static test only.

---

## 1. Purpose

Give SQL compilation a single, reviewable output shape so a future rule review and D1
read-only execution gate both consume the same tenant-scoped, parameterized, limit-bounded,
provenance-planned artifact — never raw model SQL.

## 2. Scope

- **In scope:** the definition, required fields, status/operation-shape enums, SQL
  text/parameter-binding, schema/tenant/limit/provenance/evidence rules, validation rules,
  and outcomes of a Compiled SQL Artifact.
- **Out of scope:** any SQL execution, D1 execution, database access, runtime SQL compiler,
  runtime query planner, GraphRAG, vectorization, real LLM, or external execution.

## 3. Definition of Compiled SQL Artifact

A Compiled SQL Artifact is a non-executed, read-only, parameterized SQL representation derived from a valid Safe Query Plan for future rule review before any D1 access.

Compiled SQL Artifactとは、D1アクセスの前にfuture rule reviewへ渡すための、validなSafe Query Planから導出された、未実行・read-only・parameterizedなSQL表現である。

## 4. What Compiled SQL Artifact Is Not

Compiled SQL Artifact is **not**:

- SQL execution
- D1 access
- database access
- free-form SQL
- LLM-authored trusted SQL
- evidence
- provenance record
- approval
- execution authorization
- Formal WorkUnit promotion

## 5. Required Fields

- artifact_id
- tenant_id
- source_safe_query_plan_id
- source_query_intent_id
- related_goal_id
- related_workunit_candidate_id
- artifact_status
- operation_shape
- sql_text_template
- parameter_binding_plan
- allowed_tables
- allowed_columns
- denied_tables
- denied_columns
- tenant_scope_filter
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

Note: the source plan's `sensitivity_handling`, `redaction_plan`, and `aggregation_plan`
remain recorded on the Safe Query Plan referenced by `source_safe_query_plan_id`; a future
rule review must dereference that plan — the artifact alone is not sufficient to check
redaction or aggregation handling.

## 6. Artifact Status

`artifact_status` is one of:

- draft_compilation
- clarification_needed
- blocked_no_go
- ready_for_rule_review

Reconciliation with the gate's outputs: `clarification_needed` and `No-Go` may be emitted
either as bare gate outcomes or as an artifact carrying `artifact_status`
`clarification_needed` / `blocked_no_go`; in the artifact form, `operation_shape` records the
shape that was attempted before the outcome was reached.

## 7. Allowed Operation Shape

`operation_shape` is one of:

- read_only_select_shape

Only read_only_select_shape is allowed in this phase.

All ten Safe Query Plan operation types ([`SAFE_QUERY_PLAN_CONTRACT.md`](./SAFE_QUERY_PLAN_CONTRACT.md)
§7) compile to `read_only_select_shape`; the source plan's `operation_type` is preserved via
`source_safe_query_plan_id` lineage, satisfying the gate's rule that the compiled artifact
preserve the operation_type from the Safe Query Plan.

## 8. SQL Text and Parameter Binding Fields

sql_text_template may exist only as a non-executed template.

sql_text_template must not be executed in this phase.

parameter_binding_plan is required.

tenant_id must be represented in parameter_binding_plan.

All user-controlled values must be represented in parameter_binding_plan.

No user-controlled value may be interpolated into sql_text_template.

String concatenation for SQL construction is No-Go.

## 9. Schema Reference Fields

allowed_tables and allowed_columns must reference documented schema only.

denied_tables and denied_columns must be preserved from Safe Query Plan and D1 Schema Catalog.

Denied tables and denied columns must override allowed tables and allowed columns.

Unknown schema must appear in unsupported_assumptions or no_go_flags.

secret_or_token, blocked_input, and unknown_sensitive columns must not appear in sql_text_template.

The model must not invent schema.

The model must not use model confidence as schema evidence.

## 10. Tenant Scope Fields

tenant_id is required.

tenant_scope_filter is required.

tenant_scope_filter must be enforceable by rules outside the LLM.

tenant_id must be bound as a parameter.

A Compiled SQL Artifact without tenant_id is No-Go.

A Compiled SQL Artifact without tenant_scope_filter is No-Go.

A Compiled SQL Artifact must not request cross-tenant access.

## 11. Limit and Cost Fields

row_limit is required.

time_limit is required.

cost_limit is required.

Limits must be conservative by default.

A Compiled SQL Artifact without row_limit, time_limit, or cost_limit is Fail or No-Go depending on risk.

Risk criterion: missing limits are **No-Go** when the artifact touches sensitive or personal
data, or is non-aggregate over tenant business data; otherwise the missing limit is a
**Fail** (a validity defect that blocks `ready_for_rule_review` until corrected, per §15),
matching [`SAFE_QUERY_PLAN_CONTRACT.md`](./SAFE_QUERY_PLAN_CONTRACT.md) §11.

## 12. Provenance Capture Fields

provenance_capture_plan is required.

provenance_capture_plan must include table reference, column reference, row reference strategy, query plan id, compiled artifact id, tenant id, obtained_at, and redaction state.

Aggregated results must preserve aggregation method and source scope.

## 13. Evidence Eligibility Fields

evidence_eligibility must be explicit.

A Compiled SQL Artifact may describe future evidence eligibility, but it must not create evidence.

A Compiled SQL Artifact must not be treated as evidence.

Future query results must restore provenance before they can support human review.

## 14. Human Review Requirements

`human_review_required` is preserved from the source Safe Query Plan and is set whenever the
decision rubric requires it: sensitive or personal data, redaction, aggregation,
contradiction, missing information, or any result that would affect priority, risk, action
readiness, or promotion readiness, as constrained by this contract and
[`SAFE_QUERY_PLAN_CONTRACT.md`](./SAFE_QUERY_PLAN_CONTRACT.md) §14.

## 15. Validation Rules

A valid Compiled SQL Artifact must be non-executed.

A valid Compiled SQL Artifact must be read-only.

A valid Compiled SQL Artifact must contain tenant_id.

A valid Compiled SQL Artifact must contain tenant_scope_filter.

A valid Compiled SQL Artifact must contain parameter_binding_plan.

A valid Compiled SQL Artifact must preserve denied tables and denied columns.

A valid Compiled SQL Artifact must deny secret_or_token, blocked_input, and unknown_sensitive data.

A valid Compiled SQL Artifact must include row_limit, time_limit, and cost_limit.

A valid Compiled SQL Artifact must include provenance_capture_plan.

A valid Compiled SQL Artifact must not authorize execution.

execution_allowed must be false in this phase.

## 16. Pass / Warn / Fail / No-Go Outcomes

Pass:
The Compiled SQL Artifact is non-executed, read-only, tenant-scoped, schema-grounded, parameterized, limited, provenance-planned, and safe for future rule review.

Warn:
The Compiled SQL Artifact is non-executed, read-only, and tenant-scoped, but clarification or quality improvement is needed.

Fail:
Required fields or grounding requirements are missing, but no hard safety boundary is crossed.

No-Go:
A hard safety boundary is violated, such as SQL execution, D1 access, missing tenant scope, cross-tenant compilation, denied schema reference, mutation operation, free-form SQL, string interpolation, secret_or_token request, blocked_input request, unknown_sensitive request, or execution authorization.

## 17. Non-authorization Statement

This Compiled SQL Artifact Contract authorizes no SQL execution, no D1 execution, no database access, no free-form SQL generation, no LLM-controlled SQL generation, no LLM-controlled database access, no runtime SQL compiler, no runtime query planner, no runtime Safe Query Plan generation, no GraphRAG implementation, no vectorization, no real LLM enablement, no external execution, no Formal WorkUnit promotion, and no automated decision-making.

Enforcement in code is governed by separate, future gates with recorded human decisions.
