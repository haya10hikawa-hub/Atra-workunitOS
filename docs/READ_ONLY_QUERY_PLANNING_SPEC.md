# Read-only Query Planning Spec

**Classification: REFERENCE — CURRENT TECHNICAL ARTIFACT; NO PRODUCT AUTHORITY.** This artifact does not select or authorize a product capability.

**Phase:** P6.6. **Baseline:** `main` @ `651ff8e`.

Documents the frozen V0 technical shape of a read-only query plan: a constrained,
tenant-scoped, provenance-aware plan for retrieving decision-relevant information — never
SQL execution, never an LLM writing or running SQL. Consumes the
[`D1_SCHEMA_CATALOG.md`](./D1_SCHEMA_CATALOG.md) and enforces the P6.2 rule that a SQL result
is not evidence without recorded provenance. Documentation and a static test only.

---

## 1. Purpose

Fix how decision-relevant retrieval may later be *planned* — with tenant scope, allowlists,
limits, and provenance capture — so that any future execution gate has a safe, reviewable
plan rather than free-form model SQL.

## 2. Scope

- **In scope:** the definition of read-only query planning, the query-intent → safe-plan
  flow, required plan fields, tenant/allowlist/limit/provenance rules, and evidence
  eligibility.
- **Out of scope:** any SQL execution, D1 runtime execution, NL2SQL, free-form SQL
  generation, database mutation, runtime query planner, GraphRAG, vectorization, real LLM,
  or external execution.

## 3. Definition of Read-only Query Planning

Read-only query planning is the creation of a constrained, tenant-scoped, provenance-aware plan for retrieving decision-relevant information without mutation, external authority, or LLM-controlled database access.

Read-only query planningとはSQL実行ではない。判断に関係する情報を、変更・外部権限・LLMによるDB直接操作なしに取得するための、制約付き・tenant-scoped・provenance-awareな計画を作ることである。

## 4. What Read-only Query Planning Is Not

Read-only query planning is **not**:

- SQL execution
- NL2SQL execution
- free-form SQL generation
- database mutation
- external action
- evidence by itself
- approval
- execution authorization
- LLM-controlled database access
- production data processing by itself

## 5. Query Planning Flow

```
User / WorkUnit question → Query Intent → Safe Query Plan → Human or Rule Review → Future gated execution → Provenance-bearing result
```

Planning stops at a reviewed Safe Query Plan; execution is a separately gated future
capability.

## 6. Query Intent

Query Intent is the structured statement of *what decision-relevant information is sought*
(the question, the goal/WorkUnit it serves, the tenant), expressed without SQL. An LLM may
help shape Query Intent, but never emits SQL and never accesses the database.

## 7. Safe Query Plan

A Safe Query Plan is the tenant-scoped, allowlisted, limited, provenance-capturing plan
derived from a Query Intent against the catalog. It is data for human/rule review, not an
executable statement.

## 8. Required Plan Fields

Every Safe Query Plan carries:

- plan_id
- tenant_id
- related_goal_id
- related_workunit_candidate_id
- query_intent
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

## 9. Tenant Scope Enforcement

Tenant scope must be enforced by rules outside the LLM.

A plan without tenant_id is No-Go.

A plan without tenant_scope_filter is No-Go.

A query plan must not cross tenant boundaries.

## 10. Allowlist and Denylist Rules

Only allowlisted tables and columns may appear in a Safe Query Plan.

Denied tables and columns must override allowlists.

Secrets, tokens, passwords, blocked input, and unknown_sensitive columns must be denied.

Mutation operations are always denied in this phase.

Denied operations (always denied in this phase):

- INSERT
- UPDATE
- DELETE
- DROP
- ALTER
- CREATE
- REPLACE
- UPSERT
- PRAGMA
- ATTACH
- DETACH
- VACUUM

## 11. Cost, Row, and Time Limits

Every plan declares a `row_limit`, a `time_limit`, and a `cost_limit`; a plan without them
is not safe. Limits are bounded conservatively and are enforced by rules, not by the LLM.

## 12. Result Provenance Requirements

A query result is not evidence unless the query plan, tenant scope, selected source rows, and result provenance are recorded.

Query results must preserve table, column, row reference, query plan id, tenant id, obtained_at, and redaction state.

Aggregated results must preserve aggregation method and source scope.

## 13. Evidence Eligibility for Query Results

A query result may become evidence only when its tenant scope, query plan, selected source rows, redaction state, and provenance are known.

A query result with unknown tenant scope is No-Go.

A query result from denied columns is No-Go.

A query result must not be treated as truth by default when source rows conflict.

## 14. Human Review Requirements

Human review is required when query results affect priority, risk, action readiness, external-action preview, human-review requirement, or promotion readiness.

Human review is required when sensitive data, personal data, redaction, aggregation, contradiction, or missing information is involved.

## 15. Relationship to Future NL2SQL / D1 Execution / GraphRAG / LLM Judgment

Future NL2SQL may produce Query Intent only after a separate NL2SQL planning gate.

Future NL2SQL must not execute SQL directly.

Future D1 execution requires a separate runtime read-only execution gate.

Future GraphRAG may use query results only after provenance is restored.

Future LLM judgment may inspect query results only after a separate LLM judgment evaluation gate.

A query plan must not authorize execution.

## 16. Query Planning Quality Rubric

A query plan is evaluated on:

- intent clarity
- tenant scope safety
- allowlist correctness
- denylist correctness
- sensitivity handling
- redaction clarity
- cost and row limit clarity
- provenance capture completeness
- evidence eligibility clarity
- non-authorization clarity

## 17. Non-authorization Statement

This Read-only Query Planning Spec authorizes no SQL execution, no D1 runtime execution, no NL2SQL execution, no free-form SQL generation, no database mutation, no runtime query planner, no GraphRAG implementation, no vectorization, no real LLM enablement, no external execution, and no automated decision-making.

Enforcement in code is governed by separate, future gates with recorded human decisions.
