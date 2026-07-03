# Query Intent Contract

**Phase:** P6.7. **Baseline:** `main` @ `c2d73fe`.

Defines the shape of a Query Intent: a non-executable, tenant-scoped description of *what
information is needed and why*, produced by the [`NL2SQL_PLANNING_GATE.md`](./NL2SQL_PLANNING_GATE.md)
and reviewed before any future Safe Query Plan
([`READ_ONLY_QUERY_PLANNING_SPEC.md`](./READ_ONLY_QUERY_PLANNING_SPEC.md)) or database
access. Documentation and a static test only.

---

## 1. Purpose

Give NL2SQL planning a single, reviewable output shape so a future Safe Query Plan gate and
human reviewers consume a schema-grounded, tenant-scoped, non-executable intent — never
free-form model SQL.

## 2. Scope

- **In scope:** the definition, required fields, intent types, schema/tenant/sensitivity
  rules, evidence/provenance expectations, clarification and validation rules, and the
  Pass/Warn/Fail/No-Go outcomes of a Query Intent.
- **Out of scope:** any SQL, Safe Query Plan generation, database access, D1 execution,
  runtime query planner, GraphRAG, vectorization, real LLM, or external execution.

## 3. Definition of Query Intent

Query Intent is a non-executable, tenant-scoped description of what information is needed and why, designed to be reviewed before any future Safe Query Plan or database access.

Query Intentとは、どの情報がなぜ必要かを示す、実行不能・tenant-scopedな記述であり、将来のSafe Query PlanやDBアクセスの前にレビューされるためのものである。

## 4. What Query Intent Is Not

Query Intent is **not**:

- SQL
- executable code
- database access
- Safe Query Plan
- query execution
- evidence
- provenance record
- approval
- execution authorization
- Formal WorkUnit promotion

## 5. Required Fields

- intent_id
- tenant_id
- related_goal_id
- related_workunit_candidate_id
- natural_language_request
- intent_type
- target_information_need
- candidate_tables
- candidate_columns
- denied_tables
- denied_columns
- tenant_scope_requirement
- sensitivity_considerations
- redaction_needed
- aggregation_requested
- time_range
- row_limit_hint
- evidence_need
- provenance_need
- clarification_questions
- unsupported_assumptions
- no_go_flags
- created_by_system
- created_at

## 6. Intent Types

`intent_type` is one of:

- lookup
- filter
- aggregate
- compare
- trend
- count
- existence_check
- relationship_lookup
- provenance_lookup
- evidence_lookup
- clarification_needed
- no_go

## 7. Schema Reference Rules

candidate_tables and candidate_columns must reference documented schema only.

Denied tables and denied columns must override candidate tables and candidate columns.

Unknown schema must be represented as unsupported_assumptions or clarification_questions.

The model must not invent schema.

The model must not use model confidence as schema evidence.

## 8. Tenant Scope Fields

tenant_id is required.

tenant_scope_requirement is required.

A Query Intent without tenant_id is No-Go.

A Query Intent without tenant_scope_requirement is No-Go.

A Query Intent must not request cross-tenant access.

## 9. Sensitivity and Redaction Hints

secret_or_token data must not be requested.

blocked_input data must not be requested.

unknown_sensitive data must not be requested.

personal_data must require human review and redaction consideration.

redaction_needed must be explicit when sensitive data may appear.

## 10. Evidence and Provenance Expectations

Query Intent may state evidence_need.

Query Intent may state provenance_need.

Query Intent must not claim that evidence exists.

Query Intent must not be treated as evidence.

Future query results must restore provenance before they can support human review.

## 11. Clarification Requirements

Clarification is required when tenant scope is unclear.

Clarification is required when schema references are unknown.

Clarification is required when sensitivity or redaction handling is unclear.

Clarification is required when the requested information need cannot be safely mapped to documented schema.

## 12. Unsafe Request Handling

Unsafe requests must produce no_go or clarification_needed.

Unsafe requests must not produce SQL.

Unsafe requests must not produce Safe Query Plans.

Unsafe requests must not authorize execution.

## 13. Handoff to Safe Query Plan

A valid Query Intent may be handed to the future Safe Query Plan gate
([`READ_ONLY_QUERY_PLANNING_SPEC.md`](./READ_ONLY_QUERY_PLANNING_SPEC.md)); that handoff
authorizes no SQL, no execution, and no evidence creation. Safe Query Plan generation is a
separate future gate.

## 14. Validation Rules

A valid Query Intent must contain tenant_id.

A valid Query Intent must contain tenant_scope_requirement.

A valid Query Intent must not contain executable SQL.

A valid Query Intent must not reference undocumented schema as fact.

A valid Query Intent must preserve denied tables and denied columns.

A valid Query Intent must mark unsupported assumptions.

A valid Query Intent must not authorize execution.

## 15. Pass / Warn / Fail / No-Go Outcomes

Pass:
The Query Intent is tenant-scoped, non-executable, schema-grounded, and safe for future rule review.

Warn:
The Query Intent is non-executable and tenant-scoped, but clarification or quality improvement is needed.

Fail:
Required fields or grounding requirements are missing, but no hard safety boundary is crossed.

No-Go:
A hard safety boundary is violated, such as executable SQL output, missing tenant scope, cross-tenant request, denied schema request, secret_or_token request, blocked_input request, or execution authorization.

## 16. Relationship to Future Safe Query Plan and Execution Gates

The Safe Query Plan gate, D1 read-only execution gate, GraphRAG gate, and LLM judgment gate
are all future, separately-gated capabilities that consume Query Intent only after their own
gates. Query Intent authorizes none of them.

## 17. Non-authorization Statement

This Query Intent Contract authorizes no SQL generation, no SQL execution, no D1 execution, no Safe Query Plan generation, no runtime query planner, no database access, no LLM-controlled database access, no GraphRAG implementation, no vectorization, no real LLM enablement, no external execution, no Formal WorkUnit promotion, and no automated decision-making.

Enforcement in code is governed by separate, future gates with recorded human decisions.
