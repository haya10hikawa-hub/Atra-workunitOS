# Relationship Schema

**Phase:** P6.4. **Baseline:** `main` @ `17df0e3`.

Defines, at the product level, what a relationship is in Atra: a typed, tenant-scoped,
provenance-aware connection that explains why a WorkUnit Candidate exists, what it depends
on, what supports or contradicts it, what risks it carries, and what a human must review.
Builds on the P6.1 constitution, the P6.2 evidence/provenance foundation
([`EVIDENCE_STANDARD.md`](./EVIDENCE_STANDARD.md),
[`PROVENANCE_MODEL.md`](./PROVENANCE_MODEL.md)), and the P6.3 decomposition standard
([`DECOMPOSITION_STANDARD.md`](./DECOMPOSITION_STANDARD.md),
[`TYPED_DECOMPOSITION_OBJECT.md`](./TYPED_DECOMPOSITION_OBJECT.md)). Pairs with
[`GRAPH_MODEL.md`](./archive/v0/GRAPH_MODEL.md). Documentation and a static test only.

> This is a **product-level schema and contract**. It adds no runtime relationship storage,
> no graph database, and changes no decomposition runtime behavior.

---

## 1. Purpose

Fix what a relationship must be so that dependency, contradiction, evidence, risk, review,
and approval context are represented consistently — typed and provenance-aware — rather
than as decorative links or model intuition.

## 2. Scope

- **In scope:** the definition of a relationship, its required properties, its types, and
  the tenant-scoping and evidence/provenance rules that govern it.
- **Out of scope:** any runtime relationship storage, graph database, GraphRAG,
  vectorization, NL2SQL, real LLM, external execution, or Formal WorkUnit promotion.

## 3. Definition of Relationship

A relationship is a typed, tenant-scoped, provenance-aware connection between Atra objects that explains support, contradiction, dependency, duplication, risk, review, approval, or action context.

関係性とは、Atra内のオブジェクト同士を結び、支持・矛盾・依存・重複・リスク・レビュー・承認・action contextを説明する、型付き・tenant-scoped・provenance-awareな接続である。

## 4. What Relationships Are Not

Relationships are **not**:

- decorative links
- untyped references
- model intuition
- vector similarity by itself
- proof of truth
- permission to execute
- approval
- Formal WorkUnit promotion
- cross-tenant association

## 5. Relationship Principles

- Every relationship is typed and carries the provenance/evidence needed to justify it.
- A relationship explains a decision; it never makes one (AI proposes; Rules guard; Humans
  decide).
- Contradiction is preserved, not resolved. Approval is not execution. Preview is not
  approval.
- A relationship is candidate context for human review, never an authorization.

## 6. Required Relationship Properties

Every relationship carries:

- relationship_id
- tenant_id
- source_object_id
- target_object_id
- relationship_type
- evidence_refs
- provenance_refs
- confidence_source
- human_review_required
- created_by_system
- created_at

`confidence_source` records *whether* the relationship's backing is deterministic
(canonical matching), evidence-based, or model-proposed — it is a category, never a
confidence score, and it is never treated as evidence.

## 7. Relationship Types

`relationship_type` is one of:

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

## 8. Evidence Relationships

`supports`, `weakens`, `contradicts`, `qualifies`, and `requires_evidence` connect an object
to evidence. Evidence relationships must reference provenance-bearing evidence per
[`EVIDENCE_STANDARD.md`](./EVIDENCE_STANDARD.md); model confidence is not evidence and cannot
back an evidence relationship.

## 9. Provenance Relationships

`derived_from` records where an object came from. Provenance references point to records per
[`PROVENANCE_MODEL.md`](./PROVENANCE_MODEL.md); a relationship without restorable provenance
cannot be used as evidence for priority, risk, action readiness, human review, or future
retrieval.

## 10. Dependency Relationships

`depends_on`, `blocks`, and `blocked_by` express ordering and blocking between candidates so
the human sees what must happen first. They are directional and never imply automatic
execution.

## 11. Duplicate and Conflict Relationships

`duplicate_of` and `conflicts_with` are decided first by deterministic canonical matching;
the model may only propose them. A `conflicts_with` relationship preserves the contradiction
(both sides, with evidence), never silently merged or resolved.

## 12. Risk and Mitigation Relationships

`mitigates` connects a candidate action to a risk it reduces, carrying the risk's evidence.
A mitigation relationship may require human review; it never authorizes the mitigating
action.

## 13. Human Review and Approval Relationships

`requires_human_review`, `approval_requested_for`, and `approved_by` record review and
approval context. An approval relationship records a human decision (four-eyes: creator ≠
approver); it is never an execution relationship.

## 14. Action Candidate Relationships

`suggested_action_for` and `preview_for` attach an Action Candidate or a preview to a
WorkUnit Candidate. These are proposals for human review; a preview relationship is not an
approval relationship, and neither authorizes execution.

## 15. Tenant Scope and Isolation

`tenant_id` is derived from context, never from a caller-supplied field (consistent with the
existing repository tenant invariants). The fixed relationship rules for this phase:

Every relationship must be tenant-scoped.

A relationship must not cross tenant boundaries.

A relationship must preserve evidence references and provenance references when it affects priority, risk, action readiness, human review, or future retrieval.

Vector similarity is not a relationship unless resolved into a typed relationship with provenance.

A relationship that contradicts another object must be preserved as a review signal, not silently resolved by the model.

A relationship may support human review, but it must not authorize execution.

Approval relationships must not be treated as execution relationships.

Preview relationships must not be treated as approval relationships.

A relationship must not promote a WorkUnit Candidate into a Formal WorkUnit.

## 16. Relationship Quality Rubric

A relationship is evaluated on:

- type clarity
- tenant isolation
- evidence coverage
- provenance preservation
- direction correctness
- review usefulness
- contradiction preservation
- dependency usefulness
- duplicate clarity
- execution-safety

## 17. Non-authorization Statement

This Relationship Schema authorizes no runtime relationship storage, no graph database implementation, no GraphRAG implementation, no vectorization, no NL2SQL execution, no real LLM enablement, no external execution, no Formal WorkUnit promotion, and no automated decision-making.

Enforcement in code is governed by separate, future gates
([`NEXT_CAPABILITY_GATE.md`](./NEXT_CAPABILITY_GATE.md)) with recorded human decisions.
