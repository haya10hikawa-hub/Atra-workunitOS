# Rule Review Gate

**Classification: REFERENCE — CURRENT TECHNICAL ARTIFACT; NO PRODUCT AUTHORITY.** Frozen V0 links are historical provenance only.

**Phase:** P6.10. **Baseline:** `main` @ `0fe6d60`.

Defines how a valid Compiled SQL Artifact
([`COMPILED_SQL_ARTIFACT_CONTRACT.md`](./COMPILED_SQL_ARTIFACT_CONTRACT.md)) may be reviewed
against its source Safe Query Plan
([`SAFE_QUERY_PLAN_CONTRACT.md`](./SAFE_QUERY_PLAN_CONTRACT.md)), Query Intent
([`QUERY_INTENT_CONTRACT.md`](./QUERY_INTENT_CONTRACT.md)), schema catalog
([`D1_SCHEMA_CATALOG.md`](./D1_SCHEMA_CATALOG.md)), tenant scope, parameter bindings, limits,
denied schema, and provenance plan — before any future D1 read-only execution gate. Pairs
with [`RULE_REVIEW_RECORD_CONTRACT.md`](./RULE_REVIEW_RECORD_CONTRACT.md). Documentation and
a static test only.

> This gate **describes** how rule review must behave. It implements no reviewer, executes
> nothing, accesses no database, approves nothing, and authorizes nothing.

---

## 1. Purpose

Discharge the "rule review" step that [`SQL_COMPILATION_GATE.md`](./SQL_COMPILATION_GATE.md)
§8 and [`SAFE_QUERY_PLAN_GENERATION_GATE.md`](./SAFE_QUERY_PLAN_GENERATION_GATE.md) §8
reference but do not define: the deterministic check standing between an artifact with
`artifact_status` `ready_for_rule_review` and any future D1 read-only execution gate.

Rule Review is not execution authorization. It is a deterministic, provenance-aware, tenant-scoped review of a Compiled SQL Artifact against its source Safe Query Plan, Query Intent, schema catalog, parameter binding plan, limits, denied schema, and future provenance capture requirements before any future D1 read-only execution gate.

Rule Reviewとは実行許可ではない。Compiled SQL Artifactを、将来のD1 read-only execution gateの前に、source Safe Query Plan・Query Intent・schema catalog・parameter binding plan・limits・denied schema・future provenance capture requirementsと照合する、deterministic・provenance-aware・tenant-scopedなレビューである。

## 2. Scope

- **In scope:** the gate's inputs, outputs, the Compiled SQL Artifact → Rule Review Record
  flow, pre-review validation, lineage/consistency checks, tenant/parameter-binding checks,
  schema denylist/allowlist checks, limit/cost checks, provenance/evidence boundaries, and
  No-Go conditions.
- **Out of scope:** any D1 execution, SQL execution, database access, runtime rule review,
  runtime approval, runtime SQL compiler, runtime query planning, GraphRAG, vectorization,
  real LLM, or external execution.

## 3. Definition of Rule Review Gate

The Rule Review Gate allows a valid Compiled SQL Artifact to be reviewed only into a Rule Review Record, clarification_needed, or No-Go, not D1 execution, not SQL execution, and not execution authorization.

## 4. What Rule Review Is Not

Rule Review is **not**:

- D1 execution
- SQL execution
- database access
- execution authorization
- approval
- external action
- evidence by itself
- provenance record creation
- Formal WorkUnit promotion
- runtime rule review
- runtime approval
- human approval replacement
- LLM-controlled database access

## 5. Gate Principles

- Rules review; the model does not decide review outcomes and never touches the database.
  AI proposes; Rules guard; Humans decide.
- Fail closed: an invalid artifact, broken lineage, missing tenant scope, missing bound
  parameters, or sensitive targets resolve to clarification or No-Go, never to a permissive
  record.
- A Rule Review Record is review material for a future gate, never an authorization.

Fixed rules, always:

A Rule Review Record must be non-executing.

A Rule Review Record must not authorize execution.

A Rule Review Record must not access D1.

A Rule Review Record must not execute SQL.

A Rule Review Record must not query production data.

A Rule Review Record must not be treated as evidence.

A Rule Review Record must not create provenance records.

A Rule Review Record must not promote a WorkUnit Candidate into a Formal WorkUnit.

A Rule Review Record must be produced only from a valid Compiled SQL Artifact.

Rule Review pass must not authorize D1 execution.

## 6. Allowed Inputs

- valid_compiled_sql_artifact
- source_safe_query_plan
- source_query_intent
- tenant_id
- tenant_scope_filter
- parameter_binding_plan
- allowed_tables
- allowed_columns
- denied_tables
- denied_columns
- row_limit
- time_limit
- cost_limit
- provenance_capture_plan
- evidence_eligibility
- human_review_context

## 7. Allowed Outputs

The gate may output only:

- Rule Review Record
- clarification_needed
- No-Go

`clarification_needed` and `No-Go` may be emitted either as bare gate outcomes or as a Rule
Review Record carrying the corresponding `review_status` (per
[`RULE_REVIEW_RECORD_CONTRACT.md`](./RULE_REVIEW_RECORD_CONTRACT.md) §6).

## 8. Compiled SQL Artifact to Rule Review Flow

```
Valid Compiled SQL Artifact → Lineage and consistency checks → Tenant and parameter checks → Denylist / limit / provenance checks → Rule Review Record or Clarification or No-Go
```

Review stops at a reviewable Rule Review Record (or clarification / No-Go); D1 read-only
execution is a separate future gate.

## 9. Pre-review Validation

Before a Rule Review Record can be produced, the Compiled SQL Artifact must be validated for non-executed status, read-only operation shape, tenant_id, tenant_scope_filter, parameter_binding_plan, denied schema preservation, source_safe_query_plan_id, source_query_intent_id, row_limit, time_limit, cost_limit, provenance_capture_plan, evidence_eligibility, and execution_allowed=false.

A Compiled SQL Artifact without tenant_id is No-Go.

A Compiled SQL Artifact without tenant_scope_filter is No-Go.

A Compiled SQL Artifact with execution_allowed other than false is No-Go.

Cross-tenant rule review is No-Go.

## 10. Lineage and Consistency Checks

Lineage mismatch between Query Intent, Safe Query Plan, and Compiled SQL Artifact is No-Go.

Missing source_safe_query_plan_id is No-Go.

Missing source_query_intent_id is No-Go.

source_query_intent_id must match the Query Intent lineage.

source_safe_query_plan_id must match the Safe Query Plan lineage.

The Compiled SQL Artifact must be derived from the referenced Safe Query Plan.

The Safe Query Plan must be derived from the referenced Query Intent.

operation_shape must be consistent with the source Safe Query Plan operation_type.

allowed_tables and allowed_columns must be consistent across source artifacts.

denied_tables and denied_columns must be preserved across source artifacts.

unsupported_assumptions and no_go_flags must not be silently dropped.

## 11. Tenant Scope and Parameter Binding Checks

tenant_id is required.

tenant_scope_filter is required.

tenant_id must be bound as a parameter.

All user-controlled values must be represented as bound parameters.

No user-controlled value may be interpolated into SQL text.

String interpolation is No-Go.

String concatenation for SQL construction is No-Go.

Missing parameter_binding_plan is No-Go.

Tenant scope remains a rule outside the LLM (per
[`READ_ONLY_QUERY_PLANNING_SPEC.md`](./READ_ONLY_QUERY_PLANNING_SPEC.md) §9); rule review
may never widen it.

## 12. Schema Denylist / Allowlist Checks

Only allowlisted tables and columns may appear in the compiled artifact.

Denied tables and denied columns must not appear in the compiled artifact.

Denied tables and denied columns must override allowlists.

Denied tables and denied columns must override allowed tables and columns.

Unknown schema must produce clarification_needed or No-Go.

secret_or_token, blocked_input, and unknown_sensitive data must not pass rule review.

Rule review must dereference the source Safe Query Plan's sensitivity_handling,
redaction_plan, and aggregation_plan — the compiled artifact alone is not sufficient to
check redaction or aggregation handling (per
[`COMPILED_SQL_ARTIFACT_CONTRACT.md`](./COMPILED_SQL_ARTIFACT_CONTRACT.md) §5).

Model confidence must not be used as review evidence.

Model confidence must not be used as permission to pass rule review.

## 13. Limit and Cost Checks

row_limit is required.

time_limit is required.

cost_limit is required.

Rule Review must preserve row_limit, time_limit, and cost_limit.

Missing row_limit, time_limit, or cost_limit is Fail or No-Go depending on risk.

Missing limits are Fail or No-Go depending on risk (per the risk criterion in
[`COMPILED_SQL_ARTIFACT_CONTRACT.md`](./COMPILED_SQL_ARTIFACT_CONTRACT.md) §11: No-Go when
sensitive or personal data is touched or the query is non-aggregate over tenant business
data; otherwise Fail).

## 14. Provenance and Evidence Boundary

Rule Review Record is not evidence.

Rule Review Record may describe future provenance capture, but it must not create provenance records.

Future query results are not evidence unless query plan, compiled artifact, rule review record, tenant scope, selected source rows, and result provenance are recorded.

This preserves the evidence boundary of [`EVIDENCE_STANDARD.md`](./archive/v0/EVIDENCE_STANDARD.md) and
[`PROVENANCE_MODEL.md`](./archive/v0/PROVENANCE_MODEL.md): review never manufactures evidence, and the
provenance chain now includes the rule review record itself.

## 15. Failure and No-Go Conditions

- invalid_compiled_sql_artifact
- missing_tenant_id
- missing_tenant_scope_filter
- execution_allowed_not_false
- cross_tenant_rule_review
- missing_source_query_intent_id
- missing_source_safe_query_plan_id
- lineage_mismatch
- missing_parameter_binding_plan
- string_interpolation
- string_concatenation
- denied_schema_reference
- secret_or_token_review
- blocked_input_review
- unknown_sensitive_review
- missing_limits
- missing_provenance_capture_plan
- rule_review_as_evidence
- rule_review_as_execution_authorization
- direct_database_access

## 16. Relationship to Future D1 Read-only Execution / GraphRAG / LLM Judgment

Future D1 read-only execution requires a separate D1 read-only execution gate.

Future D1 execution must verify rule review record id, compiled artifact id, safe query plan id, query intent id, tenant scope, parameters, limits, denied schema absence, and provenance capture plan.

The future D1 read-only execution gate must also verify human_review_required and review_outcome, the content integrity of the reviewed artifact against the artifact that would be executed, and the rule-set version recorded in reviewed_by_system.

Future GraphRAG may use query results only after provenance is restored.

Future LLM judgment may inspect query results only after a separate LLM judgment evaluation gate.

A Rule Review Record must not authorize D1 execution.

A Rule Review Record must not authorize external execution.

## 17. Non-authorization Statement

This Rule Review Gate authorizes no D1 execution, no SQL execution, no database access, no execution authorization, no approval, no runtime rule review, no runtime approval, no provenance record creation, no GraphRAG implementation, no vectorization, no real LLM enablement, no external execution, no Formal WorkUnit promotion, and no automated decision-making.

Enforcement in code is governed by separate, future gates
([`NEXT_CAPABILITY_GATE.md`](./archive/v0/NEXT_CAPABILITY_GATE.md)) with recorded human decisions.
