# Safe Query Plan Generation Gate

**Classification: REFERENCE — CURRENT TECHNICAL ARTIFACT; NO PRODUCT AUTHORITY.** Frozen V0 links are historical provenance only.

**Phase:** P6.8. **Baseline:** `main` @ `d694587`.

Defines how a valid Query Intent ([`QUERY_INTENT_CONTRACT.md`](./QUERY_INTENT_CONTRACT.md))
may be transformed into a **non-executable Safe Query Plan object** — never SQL, never
compilation, never execution, never database access. Consumes the
[`D1_SCHEMA_CATALOG.md`](./D1_SCHEMA_CATALOG.md) and conforms to the plan shape of
[`READ_ONLY_QUERY_PLANNING_SPEC.md`](./READ_ONLY_QUERY_PLANNING_SPEC.md). Pairs with
[`SAFE_QUERY_PLAN_CONTRACT.md`](./SAFE_QUERY_PLAN_CONTRACT.md). Documentation and a static
test only.

> This gate **describes** how plan generation must behave. It implements no generator,
> compiles nothing, executes nothing, and gives no LLM access to the database.

---

## 1. Purpose

Complete the planning chain Query Intent → Safe Query Plan with a fail-closed, rule-governed
transformation, so a future rule-review and execution gate receives a constrained,
tenant-scoped, provenance-planned object — never free-form model SQL.

Safe Query Plan generation is not SQL generation. It is the constrained transformation of a
valid Query Intent into a non-executable, tenant-scoped, allowlisted, denylist-aware,
provenance-planned query object for future rule review.

Safe Query Plan generationとはSQL生成ではない。validなQuery Intentを、将来のrule reviewに渡すための、実行不能・tenant-scoped・allowlist準拠・denylist考慮・provenance計画付きのquery objectへ制約付きで変換することである。

## 2. Scope

- **In scope:** the gate's inputs, outputs, the Query Intent → Safe Query Plan flow,
  pre-generation validation, tenant/allowlist/sensitivity/limit/provenance rules, and No-Go
  conditions.
- **Out of scope:** any SQL generation, SQL compilation, SQL execution, D1 execution,
  runtime query planning, runtime Safe Query Plan generation, runtime NL2SQL, GraphRAG,
  vectorization, real LLM, or external execution.

## 3. Definition of Safe Query Plan Generation Gate

The Safe Query Plan Generation Gate allows a valid Query Intent to be converted only into a non-executable Safe Query Plan object, clarification_needed, or No-Go, not SQL, not execution, and not database access.

## 4. What Safe Query Plan Generation Is Not

Safe Query Plan Generation is **not**:

- SQL generation
- SQL execution
- D1 execution
- SQL compilation
- free-form SQL generation
- database access
- LLM-controlled database access
- runtime query planning
- runtime Safe Query Plan generation
- runtime NL2SQL
- evidence by itself
- approval
- execution authorization
- Formal WorkUnit promotion

## 5. Gate Principles

- Rules transform; the model may assist shaping but never emits SQL and never touches the
  database. AI proposes; Rules guard; Humans decide.
- Fail closed: invalid intent, unknown schema, missing tenant scope, or sensitive targets
  resolve to clarification or No-Go, never to a permissive plan.
- A Safe Query Plan is review material for a future gate, never an authorization.

## 6. Allowed Inputs

- valid_query_intent
- tenant_id
- tenant_scope_requirement
- related_goal_id
- related_workunit_candidate_id
- documented_schema_refs
- candidate_tables
- candidate_columns
- denied_tables
- denied_columns
- sensitivity_considerations
- redaction_needed
- aggregation_requested
- row_limit_hint
- evidence_need
- provenance_need
- human_review_context

## 7. Allowed Outputs

The gate may output only:

- Safe Query Plan
- clarification_needed
- No-Go

## 8. Query Intent to Safe Query Plan Flow

```
Valid Query Intent → Schema and tenant validation → Allowlist / denylist review → Limit and provenance planning → Safe Query Plan or Clarification or No-Go
```

Generation stops at a reviewable Safe Query Plan (or clarification / No-Go); rule review,
SQL compilation, and execution are separate future gates.

## 9. Pre-generation Validation

Before a Safe Query Plan can be produced, the source Query Intent must be validated for tenant_id, tenant_scope_requirement, non-executable content, documented schema references, denied schema preservation, unsupported assumptions, sensitivity handling, evidence_need, and provenance_need.

A Safe Query Plan must be generated only from a valid Query Intent.

A Query Intent without tenant_id is No-Go.

A Query Intent without tenant_scope_requirement is No-Go.

## 10. Tenant Scope Enforcement

A Safe Query Plan without tenant_id is No-Go.

A Safe Query Plan without tenant_scope_filter is No-Go.

Cross-tenant query planning is No-Go.

Tenant scope remains a rule outside the LLM (per
[`READ_ONLY_QUERY_PLANNING_SPEC.md`](./READ_ONLY_QUERY_PLANNING_SPEC.md) §9); the gate may
never widen it.

## 11. Schema Allowlist and Denylist Enforcement

Denied tables and denied columns must override allowlisted tables and columns.

Unknown schema must not be treated as safe.

Model confidence must not be used as schema evidence.

Model confidence must not be used as permission to generate a Safe Query Plan.

Only documented schema (per [`D1_SCHEMA_CATALOG.md`](./D1_SCHEMA_CATALOG.md)) may be
referenced; undocumented references are No-Go or clarification, never assumed.

## 12. Sensitivity, Redaction, and Aggregation Handling

secret_or_token, blocked_input, and unknown_sensitive data must not be queryable.

Personal data requires human review and an explicit redaction plan; aggregation planning
must preserve source scope and method (detailed in
[`SAFE_QUERY_PLAN_CONTRACT.md`](./SAFE_QUERY_PLAN_CONTRACT.md)).

## 13. Limit and Cost Planning

Every generated plan carries `row_limit`, `time_limit`, and `cost_limit`, bounded
conservatively by rules. A plan without limits is not safe for review.

## 14. Provenance and Evidence Eligibility Planning

A Safe Query Plan may contain evidence_eligibility, but it must not create evidence.

A Safe Query Plan may contain provenance_capture_plan, but it must not create provenance records.

Future query results are not evidence unless query plan, tenant scope, selected source rows, and result provenance are recorded.

A Safe Query Plan must describe how table, column, row reference, query plan id, tenant id, obtained_at, and redaction state would be captured by a future execution gate.

## 15. Failure and No-Go Conditions

- invalid_query_intent
- missing_tenant_id
- missing_tenant_scope_requirement
- missing_tenant_scope_filter
- cross_tenant_query_plan
- undocumented_schema_reference
- denied_schema_reference
- secret_or_token_query
- blocked_input_query
- unknown_sensitive_query
- executable_sql_in_plan
- direct_database_access
- query_plan_as_evidence
- query_plan_as_execution_authorization
- unsupported_schema_assumption

Fixed prohibitions, always:

A Safe Query Plan must be non-executable.

A Safe Query Plan must not contain executable SQL.

A Safe Query Plan must not contain SELECT, INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, REPLACE, UPSERT, PRAGMA, ATTACH, DETACH, or VACUUM as executable database operations.

A Safe Query Plan must not authorize execution.

A Safe Query Plan must not access D1.

A Safe Query Plan must not query production data.

A Safe Query Plan must not be treated as evidence.

A Safe Query Plan must not promote a WorkUnit Candidate into a Formal WorkUnit.

## 16. Relationship to Future SQL Compilation / D1 Execution / GraphRAG / LLM Judgment

Future SQL compilation requires a separate SQL compilation gate.

Future D1 read-only execution requires a separate D1 read-only execution gate.

Future GraphRAG may use query results only after provenance is restored.

Future LLM judgment may inspect query results only after a separate LLM judgment evaluation gate.

A Safe Query Plan must not authorize SQL compilation.

A Safe Query Plan must not authorize D1 execution.

A Safe Query Plan must not authorize external execution.

## 17. Non-authorization Statement

This Safe Query Plan Generation Gate authorizes no SQL generation, no SQL execution, no D1 execution, no SQL compilation, no free-form SQL generation, no runtime query planner, no runtime Safe Query Plan generation, no database access, no LLM-controlled database access, no GraphRAG implementation, no vectorization, no real LLM enablement, no external execution, no Formal WorkUnit promotion, and no automated decision-making.

Any future implementation or capability enablement requires a new explicit CURRENT
technical/safety decision and applicable implementation and verification gates.

The archived V0 `NEXT_CAPABILITY_GATE` is historical context only and does not authorize
current or future implementation.
