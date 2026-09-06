# Graph Model

**Phase:** P6.4. **Baseline:** `main` @ `17df0e3`.

Defines the product-level model of typed nodes and edges Atra uses to explain decisions.
Pairs with [`RELATIONSHIP_SCHEMA.md`](../../RELATIONSHIP_SCHEMA.md) and consumes the P6.2
evidence/provenance and P6.3 decomposition contracts. Documentation and a static test only —
it is **not** a runtime graph database in this phase.

---

## 1. Purpose

Give Atra a single, reviewable node/edge vocabulary so that decomposition output,
relationships, and future retrieval all describe decisions the same typed, tenant-scoped,
provenance-aware way — without building a graph store now.

## 2. Scope

- **In scope:** the node and edge types, their required fields, and the tenant-scoping,
  evidence/provenance, and future-gating rules.
- **Out of scope:** any runtime graph database, graph storage, GraphRAG, vectorization,
  NL2SQL, D1 query execution, real LLM, or external execution.

## 3. Definition of Atra Graph

The Atra graph is a product-level model of typed nodes and edges for explaining decisions, not a runtime graph database in this phase.

Atra graphとは、判断を説明するための型付きnodeとedgeのproduct-level modelであり、このフェーズでruntime graph databaseを実装するものではない。

## 4. What the Graph Is Not

The Atra graph is **not**:

- a runtime graph database (in this phase)
- a vector index
- proof of truth
- an execution plane
- permission to act
- a cross-tenant structure
- an autonomous planner

## 5. Graph Node Types

`node_type` is one of:

- Signal
- Intent
- Problem
- WorkUnitCandidate
- ActionCandidate
- Evidence
- Provenance
- MissingInformation
- Risk
- Dependency
- Duplicate
- Conflict
- HumanReview
- Preview
- Approval
- Project
- Goal
- Person

The first ten node types lift the P6.3 Typed Decomposition Object kinds; the remaining
node types (Evidence, Provenance, HumanReview, Preview, Approval, Project, Goal, Person)
derive from the doctrine flow and the relationship schema's evidence / review / approval /
action clauses.

## 6. Graph Edge Types

`edge_type` is one of:

- derived_from
- supports
- weakens
- contradicts
- qualifies
- depends_on
- blocks
- blocked_by
- duplicate_of
- conflicts_with
- mitigates
- requires_evidence
- requires_human_review
- suggested_action_for
- preview_for
- approval_requested_for
- approved_by

## 7. Node Required Fields

Every node carries:

- node_id
- tenant_id
- node_type
- canonical_label
- provenance_refs
- evidence_refs
- trust_level
- created_at
- lifecycle_state

## 8. Edge Required Fields

Every edge carries:

- edge_id
- tenant_id
- source_node_id
- target_node_id
- edge_type
- evidence_refs
- provenance_refs
- human_review_required
- created_at

## 9. Evidence and Provenance in the Graph

Evidence nodes and evidence edges reference provenance-bearing evidence per
[`EVIDENCE_STANDARD.md`](../../EVIDENCE_STANDARD.md); provenance nodes/refs follow
[`PROVENANCE_MODEL.md`](../../PROVENANCE_MODEL.md). Model confidence is not evidence and cannot
be a node's evidence. A graph element without restorable provenance cannot be treated as
evidence.

## 10. Tenant Scope

Every graph node must be tenant-scoped.

Every graph edge must be tenant-scoped.

A graph edge must not cross tenant boundaries.

`tenant_id` is derived from context, never from a caller-supplied field.

## 11. Contradiction, Conflict, and Missing Information

The graph must preserve contradiction, conflict, and missing information as reviewable structures.

The graph must not silently resolve truth when evidence conflicts.

`Conflict` and `MissingInformation` are first-class node types; contradictions keep both
sides with evidence, and missing information is "unknown", never "false".

## 12. Relationship to Typed Decomposition Objects

Typed Decomposition Objects may become graph nodes or graph-node inputs only after their own future implementation gate.

Object kinds map to node types and the decomposition object's dependency/duplicate/conflict
fields map to edges, but nothing is materialized into a runtime graph in this phase.

## 13. Relationship to Future GraphRAG and Vector Retrieval

GraphRAG may use the graph only after a separate GraphRAG gate.

Vector retrieval may use graph-derived projections only after a separate vector/retrieval gate.

A vector hit or graph-derived projection is not evidence until its provenance is restored
(per [`PROVENANCE_MODEL.md`](../../PROVENANCE_MODEL.md)).

## 14. Relationship to Future NL2SQL and D1 Queries

NL2SQL and D1 query results may attach to graph nodes only after a separate read-only query planning gate.

Query results carry provenance (query plan, tenant scope, selected source rows) before they
may attach to any node.

## 15. Relationship to Future LLM Judgment

LLM judgment may inspect graph context only after a separate LLM judgment evaluation gate.

An LLM judgment layer may read graph context to evaluate uncertainty/readiness, but must not
authorize execution, bypass approval, or replace the human decision. The graph must not authorize execution.

## 16. Graph Quality Rubric

The graph is evaluated on:

- node type clarity
- edge type clarity
- tenant isolation
- provenance completeness
- evidence restoration
- contradiction preservation
- missing information visibility
- dependency usefulness
- human review usefulness
- future retrieval safety

## 17. Non-authorization Statement

This Graph Model authorizes no runtime graph database, no graph storage, no GraphRAG implementation, no vectorization, no NL2SQL execution, no D1 query execution, no real LLM enablement, no external execution, no Formal WorkUnit promotion, and no automated decision-making.

Enforcement in code is governed by separate, future gates with recorded human decisions.
