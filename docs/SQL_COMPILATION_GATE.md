# SQL Compilation Gate

**Classification: REFERENCE — CURRENT TECHNICAL ARTIFACT; NO PRODUCT AUTHORITY.** Frozen V0 links are historical provenance only.

**Phase:** P6.9. **Baseline:** `main` @ `bf90ff4`.

Defines how a valid Safe Query Plan ([`SAFE_QUERY_PLAN_CONTRACT.md`](./SAFE_QUERY_PLAN_CONTRACT.md))
may be transformed into a **non-executed, parameterized, read-only Compiled SQL Artifact**
for future rule review — never execution, never database access. Consumes plans produced by
the [`SAFE_QUERY_PLAN_GENERATION_GATE.md`](./SAFE_QUERY_PLAN_GENERATION_GATE.md), grounded in
the [`D1_SCHEMA_CATALOG.md`](./D1_SCHEMA_CATALOG.md) and the constraints of
[`READ_ONLY_QUERY_PLANNING_SPEC.md`](./READ_ONLY_QUERY_PLANNING_SPEC.md). Pairs with
[`COMPILED_SQL_ARTIFACT_CONTRACT.md`](./COMPILED_SQL_ARTIFACT_CONTRACT.md). Documentation and
a static test only.

> This gate **describes** how SQL compilation must behave. It implements no compiler,
> executes nothing, accesses no database, and gives no LLM the ability to write free-form
> SQL.

---

## 1. Purpose

Discharge the forward reference in
[`SAFE_QUERY_PLAN_GENERATION_GATE.md`](./SAFE_QUERY_PLAN_GENERATION_GATE.md) §16 ("Future SQL
compilation requires a separate SQL compilation gate") by defining that gate: a fail-closed,
rule-governed transformation of a valid Safe Query Plan into a Compiled SQL Artifact that a
future rule review can inspect — never model-authored SQL, never execution.

SQL Compilation is not SQL execution. It is the constrained transformation of a valid Safe Query Plan into a non-executed, parameterized, read-only SQL compilation artifact for future rule review, with tenant scope, allowlists, denylists, limits, and provenance capture preserved.

SQL CompilationとはSQL実行ではない。validなSafe Query Planを、将来のrule reviewに渡すための、未実行・parameterized・read-onlyなSQL compilation artifactへ制約付きで変換し、tenant scope・allowlist・denylist・limits・provenance captureを保持することである。

## 2. Scope

- **In scope:** the gate's inputs, outputs, the Safe Query Plan → Compiled SQL Artifact flow,
  pre-compilation validation, read-only enforcement, tenant/parameter-binding rules, schema
  allowlist/denylist enforcement, limit/cost enforcement, provenance/evidence boundaries, and
  No-Go conditions.
- **Out of scope:** any SQL execution, D1 execution, database access, runtime SQL compiler,
  runtime query planning, runtime Safe Query Plan generation, runtime NL2SQL, GraphRAG,
  vectorization, real LLM, or external execution.

## 3. Definition of SQL Compilation Gate

The SQL Compilation Gate allows a valid Safe Query Plan to be converted only into a non-executed, parameterized, read-only Compiled SQL Artifact, clarification_needed, or No-Go, not SQL execution and not database access.

## 4. What SQL Compilation Is Not

SQL Compilation is **not**:

- SQL execution
- D1 execution
- database access
- free-form SQL generation
- LLM-controlled SQL generation
- LLM-controlled database access
- runtime SQL compilation
- runtime query planning
- runtime Safe Query Plan generation
- evidence by itself
- approval
- execution authorization
- Formal WorkUnit promotion

## 5. Gate Principles

- Rules compile; the model may assist shaping but never emits trusted SQL and never touches
  the database. AI proposes; Rules guard; Humans decide.
- Fail closed: an invalid plan, unknown schema, missing tenant scope, missing bound
  parameters, or sensitive targets resolve to clarification or No-Go, never to a permissive
  artifact.
- A Compiled SQL Artifact is review material for a future gate, never an authorization.

Fixed rules, always:

A Compiled SQL Artifact must be non-executed.

A Compiled SQL Artifact must not authorize execution.

A Compiled SQL Artifact must not access D1.

A Compiled SQL Artifact must not query production data.

A Compiled SQL Artifact must not be treated as evidence.

A Compiled SQL Artifact must not promote a WorkUnit Candidate into a Formal WorkUnit.

A Compiled SQL Artifact must be compiled only from a valid Safe Query Plan.

## 6. Allowed Inputs

- valid_safe_query_plan
- tenant_id
- tenant_scope_filter
- source_query_intent_id
- related_goal_id
- related_workunit_candidate_id
- allowed_tables
- allowed_columns
- denied_tables
- denied_columns
- operation_type
- row_limit
- time_limit
- cost_limit
- expected_result_shape
- provenance_capture_plan
- evidence_eligibility
- human_review_context

## 7. Allowed Outputs

The gate may output only:

- Compiled SQL Artifact
- clarification_needed
- No-Go

## 8. Safe Query Plan to Compiled SQL Flow

```
Valid Safe Query Plan → Compilation validation → Read-only operation check → Parameter binding and limit enforcement → Compiled SQL Artifact or Clarification or No-Go
```

Compilation stops at a reviewable Compiled SQL Artifact (or clarification / No-Go); rule
review and D1 read-only execution are separate future gates.

## 9. Pre-compilation Validation

Before a Compiled SQL Artifact can be produced, the source Safe Query Plan must be validated
for tenant scope, non-executable content, documented schema references, denied schema
preservation, sensitivity handling, limits, and provenance capture planning.

A Safe Query Plan without tenant_id is No-Go.

A Safe Query Plan without tenant_scope_filter is No-Go.

A Safe Query Plan with execution_allowed other than false is No-Go.

Cross-tenant SQL compilation is No-Go.

Free-form SQL must not be accepted as input.

LLM-generated raw SQL must not be accepted as trusted output.

## 10. Read-only Operation Enforcement

Only read-only SELECT-style compilation may be planned by this gate.

Only read-only query shapes may be compiled.

Mutation operations are No-Go.

INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, REPLACE, UPSERT, PRAGMA, ATTACH, DETACH, and VACUUM are No-Go.

The compiled artifact must preserve the operation_type from the Safe Query Plan.

The compiled artifact must preserve denied tables and denied columns.

The compiled artifact must include row_limit.

The compiled artifact must include tenant_scope_filter.

The compiled artifact must include parameter_binding_plan.

## 11. Tenant Scope and Parameter Binding

tenant_id is required.

tenant_scope_filter is required.

tenant_scope_filter must be enforceable by rules outside the LLM.

tenant_id must be bound as a parameter.

All user-controlled values must be bound as parameters.

No user-controlled value may be interpolated into SQL text.

Tenant values must be represented as parameters, not string interpolation.

All dynamic values must be represented as bound parameters.

String concatenation for SQL construction is No-Go.

## 12. Schema Allowlist and Denylist Enforcement

Only allowlisted tables and columns from the Safe Query Plan may appear in the artifact.

Denied tables and denied columns must not appear in the artifact.

Denied tables and denied columns must override allowed tables and columns.

Unknown schema must produce clarification_needed or No-Go.

Unknown schema must not be treated as safe.

secret_or_token, blocked_input, and unknown_sensitive data must not be compilable.

Model confidence must not be used as schema evidence.

Model confidence must not be used as permission to compile SQL.

## 13. Limit and Cost Enforcement

row_limit is required.

time_limit is required.

cost_limit is required.

Compiled SQL Artifact must preserve row_limit, time_limit, and cost_limit.

Missing limits are Fail or No-Go depending on risk (per the risk criterion in
[`SAFE_QUERY_PLAN_CONTRACT.md`](./SAFE_QUERY_PLAN_CONTRACT.md) §11: No-Go when sensitive or
personal data is touched or the query is non-aggregate over tenant business data; otherwise
Fail).

## 14. Provenance and Evidence Boundary

Compiled SQL Artifact is not evidence.

Compiled SQL Artifact may describe future provenance capture, but it must not create provenance records.

Future query results are not evidence unless query plan, compiled artifact, tenant scope, selected source rows, and result provenance are recorded.

This preserves this gate's evidence and provenance boundary: SQL results are not evidence until provenance
is restored, and no compilation step creates evidence on its own.

## 15. Failure and No-Go Conditions

- invalid_safe_query_plan
- missing_tenant_id
- missing_tenant_scope_filter
- execution_allowed_not_false
- cross_tenant_compilation
- undocumented_schema_reference
- denied_schema_reference
- secret_or_token_compilation
- blocked_input_compilation
- unknown_sensitive_compilation
- mutation_operation
- free_form_sql_input
- raw_llm_sql_output
- string_interpolation
- missing_bound_parameters
- compiled_sql_as_evidence
- compiled_sql_as_execution_authorization
- direct_database_access

## 16. Relationship to Future D1 Read-only Execution / GraphRAG / LLM Judgment

Future D1 read-only execution requires a separate D1 read-only execution gate.

Future D1 execution must verify compiled artifact id, tenant scope, parameters, row limits, denied schema absence, and provenance capture plan.

The future D1 read-only execution gate must also verify source_safe_query_plan_id lineage and the preservation of time_limit and cost_limit, not only row limits.

Future GraphRAG may use query results only after provenance is restored.

Future LLM judgment may inspect query results only after a separate LLM judgment evaluation gate.

A Compiled SQL Artifact must not authorize D1 execution.

A Compiled SQL Artifact must not authorize external execution.

## 17. Non-authorization Statement

This SQL Compilation Gate authorizes no SQL execution, no D1 execution, no database access, no free-form SQL generation, no LLM-controlled SQL generation, no LLM-controlled database access, no runtime SQL compiler, no runtime query planner, no runtime Safe Query Plan generation, no GraphRAG implementation, no vectorization, no real LLM enablement, no external execution, no Formal WorkUnit promotion, and no automated decision-making.

Any future implementation or capability enablement requires a new explicit CURRENT
technical/safety decision and applicable implementation and verification gates.

The archived V0 `NEXT_CAPABILITY_GATE` is historical context only and does not authorize
current or future implementation.
