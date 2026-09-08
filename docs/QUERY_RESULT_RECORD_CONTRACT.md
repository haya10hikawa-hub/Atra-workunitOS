# Query Result Record Contract

**Classification: REFERENCE — CURRENT TECHNICAL ARTIFACT; NO PRODUCT AUTHORITY.** Frozen V0 links are historical provenance only.

**Phase:** P6.11. **Baseline:** `main` @ `5fda748`.

Defines the shape of a Query Result Record: the tenant-scoped, provenance-bearing object a
**future** D1 read-only execution gate
([`D1_READ_ONLY_EXECUTION_GATE.md`](./D1_READ_ONLY_EXECUTION_GATE.md)) would produce from a
valid Rule Review Record ([`RULE_REVIEW_RECORD_CONTRACT.md`](./RULE_REVIEW_RECORD_CONTRACT.md)).
This is the object that can satisfy this contract's evidence predicate. Documentation and a
static test only.

---

## 1. Purpose

Give future read-only execution a single, reviewable result shape so that evidence review,
GraphRAG, and LLM judgment all consume the same lineage-verified, provenance-complete,
conflict-explicit record — never a bare row set with unknown origin.

## 2. Scope

- **In scope:** the definition, required fields, status/shape enums, lineage/tenant/source-
  row/parameter/redaction/aggregation/evidence rules, human review and conflict handling,
  validation rules, and outcomes of a Query Result Record.
- **Out of scope:** any runtime D1 execution, SQL execution, runtime query result storage,
  runtime provenance storage, GraphRAG, vectorization, real LLM, or external execution.

## 3. Definition of Query Result Record

A Query Result Record is a tenant-scoped, provenance-bearing record of a future read-only D1 query result, including lineage, selected source rows, selected columns, parameter bindings, limits, redaction state, aggregation details, obtained_at, and result hash.

Query Result Recordとは、将来のread-only D1 query resultについて、lineage・selected source rows・selected columns・parameter bindings・limits・redaction state・aggregation details・obtained_at・result hashを含む、tenant-scoped・provenance-bearingな記録である。

## 4. What Query Result Record Is Not

Query Result Record is **not**:

- open database access
- unrestricted SQL execution
- mutation execution
- evidence by default
- truth by default
- approval
- execution authorization
- external action
- Formal WorkUnit promotion
- GraphRAG implementation
- LLM judgment

## 5. Required Fields

- result_id
- tenant_id
- source_rule_review_record_id
- source_compiled_sql_artifact_id
- source_safe_query_plan_id
- source_query_intent_id
- related_goal_id
- related_workunit_candidate_id
- result_status
- result_shape
- selected_source_rows
- selected_columns
- parameter_bindings_used
- tenant_scope_filter_used
- row_limit_used
- time_limit_used
- cost_limit_used
- redaction_state
- aggregation_method
- source_scope
- obtained_at
- result_hash
- provenance_complete
- evidence_eligible
- conflict_state
- human_review_required
- execution_authorized
- created_by_system
- created_at
- no_go_flags
- notes

## 6. Result Status

`result_status` is one of:

- draft_result_record
- provenance_incomplete
- blocked_no_go
- ready_for_evidence_review

Reconciliation with the gate's outputs: `clarification_needed` and `No-Go` may be emitted
either as bare gate outcomes or as a record carrying `result_status` `draft_result_record`
/ `provenance_incomplete` (for clarification) or `blocked_no_go` (for No-Go); only a
provenance-complete, evidence-eligible record may carry `ready_for_evidence_review`.

A Warn- or Fail-grade record maps to `draft_result_record` or `provenance_incomplete`,
never `ready_for_evidence_review`; a No-Go-grade record maps to `blocked_no_go` (following
the outcome-to-status mapping pattern of
[`RULE_REVIEW_RECORD_CONTRACT.md`](./RULE_REVIEW_RECORD_CONTRACT.md) §7).

## 7. Result Shape

`result_shape` is one of:

- row_set
- aggregate_result
- count_result
- existence_result
- relationship_result
- provenance_result
- evidence_result

## 8. Lineage Fields

source_rule_review_record_id is required.

source_compiled_sql_artifact_id is required.

source_safe_query_plan_id is required.

source_query_intent_id is required.

Lineage mismatch is No-Go.

## 9. Tenant Scope Fields

tenant_id is required.

tenant_scope_filter_used is required.

A Query Result Record without tenant_id is No-Go.

A Query Result Record without tenant_scope_filter_used is No-Go.

A Query Result Record must not cross tenant boundaries.

## 10. Source Row and Column Provenance Fields

selected_source_rows is required.

selected_columns is required.

selected_source_rows must identify source table and row reference strategy.

selected_columns must identify source table and column references.

A Query Result Record without selected_source_rows is not evidence.

A Query Result Record without selected_columns is not evidence.

## 11. Parameter and Limit Fields

parameter_bindings_used is required.

row_limit_used is required.

time_limit_used is required.

cost_limit_used is required.

parameter_bindings_used must match the Compiled SQL Artifact and Rule Review Record.

## 12. Redaction and Aggregation Fields

redaction_state is required.

aggregation_method is required when result_shape is aggregate_result.

source_scope is required for aggregated results.

personal_data must preserve redaction state.

secret_or_token, blocked_input, and unknown_sensitive data must not appear.

## 13. Evidence Eligibility Fields

provenance_complete is required.

evidence_eligible is required.

Query Result Record is not evidence by default.

Query Result Record may become evidence only when provenance_complete is true, evidence_eligible is true, tenant scope is known, selected source rows are recorded, selected columns are recorded, denied schema is absent, and human-review requirements are satisfied.

## 14. Human Review and Conflict Handling Requirements

human_review_required must be explicit.

Human review is required when query results affect priority, risk, action readiness, external-action preview, human-review requirement, or promotion readiness.

Human review is required when sensitive data, personal data, redaction, aggregation, contradiction, conflict, or missing information is involved.

A Query Result Record must not be treated as truth by default when source rows conflict.

conflict_state must be explicit.

These triggers preserve this contract's stated decision boundaries; a Query Result Record
never clears a human review requirement inherited from its source Rule Review Record.

## 15. Validation Rules

A valid Query Result Record must contain tenant_id.

A valid Query Result Record must contain all lineage ids.

A valid Query Result Record must contain selected_source_rows.

A valid Query Result Record must contain selected_columns.

A valid Query Result Record must contain parameter_bindings_used.

A valid Query Result Record must contain row_limit_used, time_limit_used, and cost_limit_used.

A valid Query Result Record must contain redaction_state.

A valid Query Result Record must contain obtained_at.

A valid Query Result Record must contain result_hash.

A valid Query Result Record must not include denied schema.

A valid Query Result Record must not include secret_or_token, blocked_input, or unknown_sensitive data.

A valid Query Result Record must not authorize execution.

execution_authorized must be false in this phase.

## 16. Pass / Warn / Fail / No-Go Outcomes

Pass:
The Query Result Record is tenant-scoped, lineage-consistent, provenance-complete, limit-preserving, redaction-aware, conflict-explicit, and safe for future evidence review.

Warn:
The Query Result Record is tenant-scoped and non-authorizing, but clarification, human review, redaction review, or quality improvement is needed before future evidence review.

Fail:
Required result fields, provenance fields, or review requirements are missing, but no hard safety boundary is crossed.

No-Go:
A hard safety boundary is violated, such as open database access, mutation execution, missing tenant scope, cross-tenant result, lineage mismatch, missing source rows, missing provenance, denied schema result, secret_or_token result, blocked_input result, unknown_sensitive result, or execution authorization.

Risk criterion for missing provenance fields: they are **No-Go** whenever the record is (or
would be) used as evidence or carries `ready_for_evidence_review` (per the gate's
`query_result_as_evidence_without_provenance` condition); a missing provenance field on a
draft record not offered as evidence is a **Fail** that blocks `ready_for_evidence_review`
until corrected.

## 17. Non-authorization Statement

This Query Result Record Contract authorizes no D1 execution, no SQL execution, no mutation execution, no open database access, no approval, no execution authorization, no external action, no GraphRAG implementation, no vectorization, no real LLM enablement, no Formal WorkUnit promotion, and no automated decision-making.

Enforcement in code is governed by separate, future gates with recorded human decisions.
