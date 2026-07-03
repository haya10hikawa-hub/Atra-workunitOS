# D1 Read-only Execution Gate

**Phase:** P6.11. **Baseline:** `main` @ `5fda748`.

Defines how a valid Rule Review Record
([`RULE_REVIEW_RECORD_CONTRACT.md`](./RULE_REVIEW_RECORD_CONTRACT.md)) may be used by a
**future** D1 read-only execution gate to produce a provenance-bearing Query Result Record
([`QUERY_RESULT_RECORD_CONTRACT.md`](./QUERY_RESULT_RECORD_CONTRACT.md)). Discharges the
verification checklist that [`RULE_REVIEW_GATE.md`](./RULE_REVIEW_GATE.md) §16 and
[`SQL_COMPILATION_GATE.md`](./SQL_COMPILATION_GATE.md) §16 impose on this gate. Documentation
and a static test only.

> This gate **describes** how future read-only execution must behave. It implements no
> execution, adds no D1 bindings or adapters, accesses no database, and creates no runtime
> query results, evidence, or provenance records. Execution itself remains future-gated
> behind recorded human decisions.

---

## 1. Purpose

Close the last undefined node of the query spine: Query Intent → Safe Query Plan → Compiled
SQL Artifact → Rule Review Record → **this gate** → Query Result Record. This is the step
where the evidence predicate established by
[`READ_ONLY_QUERY_PLANNING_SPEC.md`](./READ_ONLY_QUERY_PLANNING_SPEC.md) can finally be
satisfied — a query result becomes evidence-eligible only when plan, artifact, review,
tenant scope, selected source rows, and result provenance are all recorded.

D1 Read-only Execution is not open database access. It is a future-gated, tenant-scoped, parameter-bound, read-only execution step that may produce a provenance-bearing Query Result Record only after Rule Review, lineage, immutability, limits, denied schema absence, human-review requirements, and provenance capture requirements are verified.

D1 Read-only Executionとは自由なDBアクセスではない。Rule Review・lineage・immutability・limits・denied schema absence・human-review requirements・provenance capture requirementsを検証した後にのみ、tenant-scoped・parameter-bound・read-onlyな実行として、provenance-bearingなQuery Result Recordを生成しうるfuture-gated stepである。

## 2. Scope

- **In scope:** the gate's inputs, outputs, the Rule Review Record → Query Result Record
  flow, pre-execution validation, lineage/immutability/content-integrity checks,
  tenant/parameter-binding checks, read-only/denied-operation checks, limit/cost/result-shape
  checks, provenance capture and evidence eligibility boundaries, and No-Go conditions.
- **Out of scope:** any runtime D1 execution, D1 bindings, D1 adapters, SQL execution,
  runtime query result storage, runtime provenance storage, runtime rule review, runtime
  approval, GraphRAG, vectorization, real LLM, or external execution.

## 3. Definition of D1 Read-only Execution Gate

The D1 Read-only Execution Gate allows a valid Rule Review Record to be used only by a future-gated read-only execution process to produce a provenance-bearing Query Result Record, clarification_needed, or No-Go, not open database access and not unrestricted SQL execution.

## 4. What D1 Read-only Execution Is Not

D1 Read-only Execution is **not**:

- open database access
- unrestricted SQL execution
- mutation execution
- free-form SQL execution
- LLM-controlled database access
- external action
- approval
- execution authorization by itself
- evidence by itself
- provenance guarantee by itself
- GraphRAG implementation
- LLM judgment
- Formal WorkUnit promotion

## 5. Gate Principles

- Rules execute within verified bounds; the model never executes, never widens scope, and
  never touches the database directly. AI proposes; Rules guard; Humans decide.
- Fail closed: a failed review, broken lineage, changed artifact content, missing limits,
  missing human decision, or sensitive targets resolve to clarification or No-Go, never to
  execution.
- Even after every check passes, this gate is a description: actual enablement requires a
  separate recorded human decision per
  [`NEXT_CAPABILITY_GATE.md`](./NEXT_CAPABILITY_GATE.md).

Fixed rules, always:

A Query Result Record must be tenant-scoped.

A Query Result Record must be provenance-bearing.

A Query Result Record must not authorize execution.

A Query Result Record must not authorize external action.

A Query Result Record must not promote a WorkUnit Candidate into a Formal WorkUnit.

A Query Result Record must not be treated as evidence unless evidence eligibility and provenance requirements are satisfied.

Model confidence must not be used as permission to execute.

## 6. Allowed Inputs

- valid_rule_review_record
- source_compiled_sql_artifact
- source_safe_query_plan
- source_query_intent
- tenant_id
- tenant_scope_filter
- parameter_binding_plan
- row_limit
- time_limit
- cost_limit
- expected_result_shape
- provenance_capture_plan
- evidence_eligibility
- human_review_required
- review_outcome
- content_integrity_reference
- rule_set_version

## 7. Allowed Outputs

The gate may output only:

- Query Result Record
- clarification_needed
- No-Go

`clarification_needed` and `No-Go` may be emitted either as bare gate outcomes or as a Query
Result Record carrying the corresponding `result_status` (per
[`QUERY_RESULT_RECORD_CONTRACT.md`](./QUERY_RESULT_RECORD_CONTRACT.md) §6).

## 8. Rule Review Record to Query Result Flow

```
Valid Rule Review Record → Lineage and integrity validation → Tenant and parameter binding validation → Read-only / limit / denied schema validation → Future read-only execution → Query Result Record or Clarification or No-Go
```

The "Future read-only execution" step is not implemented by this phase; everything before
and after it is a rule-governed validation or recording step.

## 9. Pre-execution Validation

Before a Query Result Record can be produced, the future D1 read-only execution gate must validate rule review record id, compiled artifact id, safe query plan id, query intent id, tenant_id, tenant_scope_filter, parameter_binding_plan, row_limit, time_limit, cost_limit, denied schema absence, review_outcome, human_review_required, content integrity, rule_set_version, and provenance_capture_plan.

A Rule Review Record without tenant_id is No-Go.

A Rule Review Record without source_compiled_sql_artifact_id is No-Go.

A Rule Review Record without source_safe_query_plan_id is No-Go.

A Rule Review Record without source_query_intent_id is No-Go.

A Rule Review Record with execution_allowed other than false is No-Go.

A Rule Review Record with review_outcome other than pass is No-Go for execution-gate entry.

A Rule Review Record with human_review_required true must require recorded human decision before any future execution gate.

Cross-tenant D1 execution is No-Go.

## 10. Lineage, Immutability, and Content Integrity Checks

The Rule Review Record must reference the Compiled SQL Artifact.

The Compiled SQL Artifact must reference the Safe Query Plan.

The Safe Query Plan must reference the Query Intent.

The artifact content must match the content_integrity_reference.

The source artifacts must not change between rule review and future execution.

The rule_set_version used for review must be recorded.

rule_set_version must match the rule set and version recorded in the Rule Review Record's reviewed_by_system field (per [`RULE_REVIEW_RECORD_CONTRACT.md`](./RULE_REVIEW_RECORD_CONTRACT.md) §5).

Lineage mismatch is No-Go.

Content integrity mismatch is No-Go.

Missing rule_set_version is No-Go.

## 11. Tenant Scope and Parameter Binding Checks

tenant_id is required.

tenant_scope_filter is required.

tenant_id must be bound as a parameter.

All user-controlled values must be represented as bound parameters.

No user-controlled value may be interpolated into SQL text.

Parameter binding must match the compiled artifact and rule review record.

Missing parameter_binding_plan is No-Go.

Missing tenant_scope_filter is No-Go.

String interpolation is No-Go.

String concatenation for SQL construction is No-Go.

## 12. Read-only and Denied Operation Checks

Only read-only selected operation shapes may be eligible.

Mutation operations are No-Go.

INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, REPLACE, UPSERT, PRAGMA, ATTACH, DETACH, and VACUUM are No-Go.

Free-form SQL execution is No-Go.

LLM-generated raw SQL execution is No-Go.

Denied tables and denied columns must not appear.

Denied schema absence must be verified before future execution.

Denied schema presence is No-Go.

secret_or_token, blocked_input, and unknown_sensitive data must not be executed against.

## 13. Limit, Cost, and Result Shape Checks

row_limit is required.

time_limit is required.

cost_limit is required.

expected_result_shape is required.

Result size must be constrained by row_limit.

Execution cost must be constrained by cost_limit.

Timeout behavior must be defined by time_limit.

Missing row_limit, time_limit, or cost_limit is No-Go.

## 14. Provenance Capture and Evidence Eligibility Boundary

Query Result Record may become evidence only when provenance is complete.

Query Result Record must record query plan id, compiled artifact id, rule review record id, tenant id, selected source rows, selected columns, obtained_at, redaction state, aggregation method when applicable, and result hash.

A query result with unknown tenant scope is No-Go.

A query result without selected source rows is not evidence.

A query result without provenance capture is not evidence.

A query result from denied schema is No-Go.

A query result must not be treated as truth by default when source rows conflict.

This is the step that satisfies the evidence predicate of
[`READ_ONLY_QUERY_PLANNING_SPEC.md`](./READ_ONLY_QUERY_PLANNING_SPEC.md) and
[`EVIDENCE_STANDARD.md`](./EVIDENCE_STANDARD.md): result provenance is captured here or the
result never becomes evidence.

## 15. Failure and No-Go Conditions

- invalid_rule_review_record
- missing_tenant_id
- missing_tenant_scope_filter
- missing_source_query_intent_id
- missing_source_safe_query_plan_id
- missing_source_compiled_sql_artifact_id
- execution_allowed_not_false
- review_outcome_not_pass
- missing_required_human_decision
- cross_tenant_execution
- lineage_mismatch
- content_integrity_mismatch
- missing_rule_set_version
- missing_parameter_binding_plan
- missing_limits
- denied_schema_presence
- secret_or_token_execution
- blocked_input_execution
- unknown_sensitive_execution
- mutation_operation
- free_form_sql_execution
- raw_llm_sql_execution
- string_interpolation
- string_concatenation
- missing_provenance_capture_plan
- query_result_as_evidence_without_provenance
- direct_unscoped_database_access

## 16. Relationship to Future Evidence Use / GraphRAG / LLM Judgment

Future evidence use requires complete provenance and human-review compatibility.

Future GraphRAG may use query results only after provenance is restored and evidence eligibility is satisfied.

Future LLM judgment may inspect query results only after a separate LLM judgment evaluation gate.

A Query Result Record must not authorize external execution.

A Query Result Record must not authorize Formal WorkUnit promotion.

## 17. Non-authorization Statement

This D1 Read-only Execution Gate authorizes no runtime D1 execution, no unrestricted SQL execution, no mutation execution, no open database access, no free-form SQL execution, no LLM-controlled database access, no external execution, no approval, no GraphRAG implementation, no vectorization, no real LLM enablement, no Formal WorkUnit promotion, and no automated decision-making.

Enforcement in code is governed by separate, future gates
([`NEXT_CAPABILITY_GATE.md`](./NEXT_CAPABILITY_GATE.md)) with recorded human decisions.
