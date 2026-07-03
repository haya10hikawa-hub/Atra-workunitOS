# D1 Schema Catalog

**Phase:** P6.6. **Baseline:** `main` @ `651ff8e`.

A documentation-only inventory of Atra's known Cloudflare D1 tables and columns, recording
tenant scope, sensitivity, queryability, and evidence/provenance relevance so that a future
read-only query planner has a governed catalog to plan against. Pairs with
[`READ_ONLY_QUERY_PLANNING_SPEC.md`](./READ_ONLY_QUERY_PLANNING_SPEC.md). Builds on the P6.2
evidence/provenance standard and the existing D1 schema-integrity work (Phase 6A–6C).
Documentation and a static test only.

> This catalog **describes** schema; it does not create, migrate, bind, or query it. The
> authoritative schema lives in `migrations/` and the repository code; where this catalog
> and those files disagree, the repository files win and the catalog entry is corrected.

---

## 1. Purpose

Give a governed, human-readable inventory of D1 schema — with tenant scope, sensitivity, and
queryability declared — so that decision-relevant retrieval can later be planned safely,
never by an LLM writing SQL against unknown tables.

## 2. Scope

- **In scope:** documenting known tables/columns, their tenant scope, sensitivity/redaction
  class, queryability, and evidence/provenance relevance; and the rules for unknown schema.
- **Out of scope:** any migration, D1 binding/adapter, runtime schema registry, query
  execution, NL2SQL, GraphRAG, vectorization, real LLM, or external execution.

## 3. Definition of D1 Schema Catalog

A D1 Schema Catalog is a documentation-only inventory of known D1 tables, columns, tenant scope, sensitivity, queryability, and evidence/provenance relevance.

D1 Schema Catalogとは、既知のD1 table・column・tenant scope・sensitivity・queryability・evidence/provenance上の意味を記録するdocumentation-onlyな目録である。

## 4. What the Catalog Is Not

The catalog is **not**:

- a migration
- a database implementation
- a runtime schema registry
- a query executor
- an ORM
- an API contract by itself
- an authorization layer
- an evidence store
- a provenance store
- a source of truth when repository schema files disagree

## 5. Cataloging Principles

- Ground every entry in a repository source; never invent tables or columns.
- Declare tenant scope and sensitivity for every entry, or mark it unknown.
- Fail closed: unknown schema is treated as sensitive and not queryable, never safe by
  default.
- The catalog informs planning; it authorizes nothing.

## 6. Schema Discovery Source Rules

A catalog entry's `discovery_source` must be one of:

- migrations
- existing schema files
- existing repository code
- existing tests
- existing docs
- explicit human confirmation

## 7. Table Registry

Every table entry declares these fields:

- table_name
- status
- discovery_source
- tenant_scope_field
- primary_key
- sensitivity_class
- queryability
- evidence_relevance
- provenance_relevance
- mutation_allowed_by_this_phase
- notes

Known tables (grounded in `migrations/0001`–`0006`; classification is conservative and
subject to per-column review in §8):

- **Control DB:** `users`, `tenant_memberships`, `auth_identities`, `tenants`,
  `tenant_databases`.
- **Tenant DB:** `action_previews`, `approval_records`, `work_units`, `workunit_feedback`,
  `integration_connections`, `audit_logs`, `usage_events`, `usage_daily_summary`.
- `auth_identities` and `integration_connections` hold credential/token-shaped material and
  are classified `secret_or_token` / `not_queryable` until a per-column review proves
  otherwise. `mutation_allowed_by_this_phase` is **false** for every table.

## 8. Column Classification

Every cataloged column declares:

- column_name
- data_kind
- sensitivity_class
- tenant_scope_relevance
- evidence_relevance
- provenance_relevance
- queryability
- redaction_required

## 9. Tenant Scope Requirements

Every cataloged table must declare tenant scope or be marked unknown. Tenant-scoped tables
name their `tenant_scope_field` (e.g. `tenant_id`); cross-tenant reads are never planned
against them (enforced outside the LLM per the query-planning spec).

## 10. Sensitivity and Redaction Classes

`sensitivity_class` is one of:

- public_metadata
- internal_metadata
- tenant_scoped_business_data
- personal_data
- secret_or_token
- blocked_input
- unknown_sensitive

## 11. Evidence and Provenance Relevance

Each entry declares whether its data can be evidence (`evidence_relevance`) and whether it
carries provenance (`provenance_relevance`), consistent with
[`EVIDENCE_STANDARD.md`](./EVIDENCE_STANDARD.md) and [`PROVENANCE_MODEL.md`](./PROVENANCE_MODEL.md).
A column is evidence-relevant only if a query result from it could carry restorable
provenance.

## 12. Queryability Classification

`queryability` is one of:

- queryable_read_only
- queryable_with_redaction
- aggregate_only
- human_review_required
- not_queryable
- unknown

## 13. Unknown / Future / Deprecated Schema Handling

`status` distinguishes `known`, `unknown`, `future`, and `deprecated` entries. Unknown and
future schema are cataloged as such and treated fail-closed (`not_queryable`); deprecated
schema is retained for traceability and never planned against.

## 14. Relationship to Read-only Query Planning

The catalog is the input to [`READ_ONLY_QUERY_PLANNING_SPEC.md`](./READ_ONLY_QUERY_PLANNING_SPEC.md):
a Safe Query Plan may reference only tables/columns whose tenant scope, sensitivity,
queryability, and provenance relevance are documented here.

## 15. Relationship to Future NL2SQL / GraphRAG / LLM Judgment

Future NL2SQL, GraphRAG, and LLM judgment may consume the catalog only after their own
separate gates; the catalog names them as future-gated capabilities and authorizes none of
them.

## 16. Catalog Quality Rubric

A catalog is evaluated on:

- schema source traceability
- tenant scope clarity
- sensitivity classification
- queryability clarity
- evidence relevance clarity
- provenance relevance clarity
- unknown handling
- mutation safety
- future-query usefulness
- non-authorization clarity

### Fixed catalog rules

- Every cataloged table must declare tenant scope or be marked unknown.
- Every cataloged column must declare sensitivity_class or be marked unknown_sensitive.
- Secrets, tokens, passwords, and blocked input must be classified as not_queryable.
- Unknown schema must not be treated as safe by default.
- The catalog must not authorize mutation.
- The catalog must not authorize query execution.
- The catalog must not authorize NL2SQL.
- A schema entry may support query planning only when tenant scope, sensitivity, queryability, and provenance relevance are documented.

## 17. Non-authorization Statement

This D1 Schema Catalog authorizes no migration, no database implementation, no runtime schema registry, no query execution, no NL2SQL execution, no GraphRAG implementation, no vectorization, no real LLM enablement, no external execution, and no automated decision-making.

Enforcement in code is governed by separate, future gates
([`NEXT_CAPABILITY_GATE.md`](./NEXT_CAPABILITY_GATE.md)) with recorded human decisions.
