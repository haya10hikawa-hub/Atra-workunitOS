# NL2SQL Planning Gate

**Classification: REFERENCE — CURRENT TECHNICAL ARTIFACT; NO PRODUCT AUTHORITY.** Frozen V0 links are historical provenance only.

**Phase:** P6.7. **Baseline:** `main` @ `c2d73fe`.

Discharges the P6.6 forward reference by defining the NL2SQL Planning Gate: how a
natural-language information need may be translated into **Query Intent, a clarification
need, or No-Go** — never SQL, never execution, never database access. Consumes the
[`D1_SCHEMA_CATALOG.md`](./D1_SCHEMA_CATALOG.md) and hands off to the
[`READ_ONLY_QUERY_PLANNING_SPEC.md`](./READ_ONLY_QUERY_PLANNING_SPEC.md). Pairs with
[`QUERY_INTENT_CONTRACT.md`](./QUERY_INTENT_CONTRACT.md). Documentation and a static test
only.

> This gate **describes** how planning must behave. It implements no NL2SQL, generates no
> SQL, executes nothing, and gives no LLM access to the database.

---

## 1. Purpose

Let natural-language information needs be safely shaped into reviewable Query Intent, so a
future Safe Query Plan gate has a constrained, schema-grounded, tenant-scoped input — never
free-form model SQL.

## 2. Scope

- **In scope:** the gate's inputs, outputs, the natural-language → Query Intent flow, the
  schema-catalog and tenant rules, the handoff to read-only query planning, and the No-Go
  conditions.
- **Out of scope:** any NL2SQL runtime, SQL generation, SQL execution, D1 execution, runtime
  query planner, database access, GraphRAG, vectorization, real LLM, or external execution.

## 3. Definition of NL2SQL Planning Gate

The NL2SQL Planning Gate allows natural-language information needs to be converted only into Query Intent, clarification needs, or No-Go, not SQL, not execution, and not database access.

NL2SQL PlanningとはSQL生成ではない。自然言語の情報要求を、documented schemaだけを使って、DBアクセスなしに、Query Intent・確認質問・No-Goへ制約付きで変換することである。

## 4. What NL2SQL Planning Is Not

NL2SQL Planning is **not**:

- SQL generation
- SQL execution
- D1 execution
- free-form SQL generation
- database access
- LLM-controlled database access
- runtime query planning
- schema discovery by the model
- evidence by itself
- approval
- execution authorization
- Formal WorkUnit promotion

## 5. Gate Principles

- The model proposes Query Intent; rules guard; humans decide. The model never touches the
  database and never emits executable SQL.
- Fail closed: unknown schema, missing tenant scope, or sensitive targets resolve to
  clarification or No-Go, never to invented intent.
- Query Intent is a reviewable proposal, not an authorization.

## 6. Allowed Inputs

- natural_language_request
- tenant_id
- related_goal_id
- related_workunit_candidate_id
- goal_context
- documented_schema_refs
- allowed_schema_refs
- denied_schema_refs
- sensitivity_context
- evidence_need
- provenance_need
- human_review_context

## 7. Allowed Outputs

The gate may output only:

- Query Intent
- clarification_needed
- No-Go

## 8. Natural Language to Query Intent Flow

```
Natural-language information need → Schema-grounded interpretation → Query Intent or Clarification → Rule review → Future Safe Query Plan gate
```

Planning stops at a reviewed Query Intent (or clarification / No-Go); Safe Query Plan
generation and execution are separate future gates.

## 9. Prohibited Outputs and Actions

- The model must not output executable SQL.
- The model must not output SELECT, INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, REPLACE, UPSERT, PRAGMA, ATTACH, DETACH, or VACUUM as executable database operations.
- The model must not invent tables or columns.
- The model must not treat unknown schema as safe.
- The model must not bypass D1 Schema Catalog.
- The model must not bypass Read-only Query Planning.
- The model must not directly create a Safe Query Plan in this phase.
- The model must not access D1.
- The model must not query production data.
- The model must not use model confidence as schema evidence.
- The model must not use model confidence as permission to proceed.
- A request without tenant_id is No-Go.
- A request that requires cross-tenant access is No-Go.
- A request targeting denied tables, denied columns, secret_or_token, blocked_input, or unknown_sensitive data is No-Go unless rewritten as an allowed aggregate or clarification need by future gates.
- A Query Intent must not authorize execution.
- A Query Intent must not be treated as evidence.

## 10. Tenant Scope and Authorization Boundary

Tenant scope is required before planning: a request without `tenant_id` is No-Go, and a
request needing cross-tenant access is No-Go. Tenant scope is a rule outside the model; the
model may not widen it, and Query Intent authorizes nothing.

## 11. Schema Catalog Use

Only documented schema from docs/D1_SCHEMA_CATALOG.md may be referenced.

Repository schema files win over catalog text when disagreement is discovered.

Unknown schema must produce clarification_needed or No-Go, not invented intent.

## 12. Read-only Query Planning Handoff

Query Intent may be handed off to the future Safe Query Plan process defined by docs/READ_ONLY_QUERY_PLANNING_SPEC.md.

The handoff does not authorize SQL execution.

The handoff does not authorize D1 execution.

The handoff does not authorize evidence creation.

Safe Query Plan generation remains a separate future gate unless already explicitly implemented by a later approved phase.

## 13. Evidence and Provenance Boundary

Query Intent is not evidence.

Query Intent contains an evidence need, not evidence itself.

Future query results are not evidence unless query plan, tenant scope, selected source rows, and result provenance are recorded.

Provenance must be restored before future query results can support WorkUnit review.

## 14. Clarification and Human Review Requirements

When tenant scope, schema references, or sensitivity handling are unclear, the gate outputs
`clarification_needed` rather than proceeding. Human review is required when the information
need touches sensitive data, personal data, redaction, aggregation, contradiction, or
missing information (per [`DECISION_RUBRIC.md`](./archive/v0/DECISION_RUBRIC.md)).

## 15. Failure and No-Go Conditions

- missing_tenant_id
- cross_tenant_request
- unknown_schema_request
- denied_schema_request
- secret_or_token_request
- blocked_input_request
- executable_sql_output
- free_form_sql_output
- direct_database_access
- unsupported_schema_assumption
- query_intent_as_evidence
- query_intent_as_execution_authorization

## 16. Relationship to Future Runtime NL2SQL / D1 Execution / GraphRAG / LLM Judgment

A future runtime NL2SQL producer, Safe Query Plan generator, D1 read-only execution,
GraphRAG, and LLM judgment each require their own separate gates. This gate names them as
future-gated capabilities and authorizes none of them.

## 17. Non-authorization Statement

This NL2SQL Planning Gate authorizes no SQL generation, no SQL execution, no D1 execution, no free-form SQL generation, no runtime query planner, no database access, no LLM-controlled database access, no GraphRAG implementation, no vectorization, no real LLM enablement, no external execution, no Formal WorkUnit promotion, and no automated decision-making.

Enforcement in code is governed by separate, future gates
([`NEXT_CAPABILITY_GATE.md`](./archive/v0/NEXT_CAPABILITY_GATE.md)) with recorded human decisions.
