# Typed Decomposition Object

**Phase:** P6.3. **Baseline:** `main` @ `eac1f50`.

Defines the candidate-only, structured contract that a decomposed Signal produces. Pairs
with [`DECOMPOSITION_STANDARD.md`](./DECOMPOSITION_STANDARD.md) and consumes the P6.2
evidence/provenance references ([`EVIDENCE_STANDARD.md`](./EVIDENCE_STANDARD.md),
[`PROVENANCE_MODEL.md`](./PROVENANCE_MODEL.md)). Documentation and a static test only — it
adds no schema migration, no storage, and enables no capability.

---

## 1. Purpose

Give decomposition a single, reviewable shape so that human review, the evaluation harness,
and future retrieval all consume the same typed, provenance-bearing, candidate-only object —
never a free-form model output.

## 2. Scope

- **In scope:** the object's principle, lifecycle, required fields, kinds, evidence and
  provenance references, and the fixed candidate-only / No-Go rules.
- **Out of scope:** any runtime schema, database, WorkUnit storage, GraphRAG, vectorization,
  NL2SQL, real LLM, or external execution.

## 3. Typed Object Principle

A Typed Decomposition Object is a candidate-only structured representation of a decomposed Signal, designed for human review and future evaluation, not for autonomous execution.

Typed Decomposition Objectとは、分解されたSignalを人間レビューと将来の評価に使うためのcandidate-onlyな構造表現であり、自律実行のための命令ではない。

## 4. Object Lifecycle

Ingest → decomposition produces candidate objects (candidate_only = true) → human review →
(human-only) promotion of a WorkUnit Candidate to a Formal WorkUnit. Objects are never
auto-promoted, never auto-executed, and never stored/vectorized by this contract.

## 5. Required Top-level Fields

Every Typed Decomposition Object carries:

- object_id
- tenant_id
- goal_id
- source_signal_refs
- object_kind
- canonical_summary
- evidence_refs
- provenance_refs
- missing_info
- risks
- dependencies
- duplicates
- conflicts
- action_candidates
- action_readiness
- human_review_required
- candidate_only
- promotion_blockers
- created_by_system
- created_at

## 6. Object Kinds

`object_kind` is one of:

- signal
- intent
- problem
- workunit_candidate
- action_candidate
- missing_info
- risk
- dependency
- duplicate
- conflict

## 7. Evidence References

Evidence references must point to provenance-bearing evidence defined by docs/EVIDENCE_STANDARD.md.

A Typed Decomposition Object must not treat model confidence as evidence.

Unsupported claims must be marked unsupported and must not raise action readiness.

## 8. Provenance References

Provenance references must point to provenance records defined by docs/PROVENANCE_MODEL.md.

Every Typed Decomposition Object must be tenant-scoped.

Raw retrieved text without provenance must not be used as evidence.

## 9. Missing Information Fields

Each `missing_info` entry carries:

- missing_field
- why_needed
- blocks_promotion
- suggested_clarification

## 10. Risk Fields

Each `risks` entry carries:

- risk_type
- risk_description
- severity
- evidence_refs
- mitigation_candidate
- human_review_required

## 11. Dependency Fields

Each `dependencies` entry carries:

- depends_on
- blocks
- blocked_by
- dependency_reason

## 12. Duplicate and Conflict Fields

Each `duplicates` / `conflicts` entry carries:

- duplicate_of
- duplicate_reason
- conflicts_with
- conflict_reason
- contradiction_evidence_refs

Contradiction evidence is preserved (both sides), never silently merged.

## 13. Action Candidate Fields

Each `action_candidates` entry carries:

- action_type
- tool_suggestion
- draft_allowed
- preview_required
- external_action_level
- requires_approval
- execution_allowed

## 14. Human Review Fields

`human_review_required` and `action_readiness` express readiness for human review, not
permission to execute. When evidence is insufficient, contradictory, or third-party-only for
a high-impact decision, `human_review_required` is true (per
[`DECISION_RUBRIC.md`](./DECISION_RUBRIC.md)).

## 15. Promotion Blockers

`promotion_blockers` lists why a WorkUnit Candidate may not yet become a Formal WorkUnit
(e.g. unresolved missing information, missing evidence, blocked-input origin, unreviewed
contradiction). Fixed rules for this phase:

candidate_only must be true for every Typed Decomposition Object in this phase.

execution_allowed must be false for every Action Candidate in this phase.

external_action_level must not exceed Level 5 Request Approval in this phase.

Level 6 Execute External Action remains No-Go.

Level 7 Irreversible / High-risk Action remains No-Go.

A Typed Decomposition Object must not authorize GraphRAG, vectorization, NL2SQL execution, real LLM enablement, external execution, or automated decision-making.

## 16. Relationship to Future Graph / Retrieval / NL2SQL / LLM Judgment

Future GraphRAG, vector retrieval, NL2SQL, and LLM judgment layers may use Typed Decomposition Objects only after their own gates, and only if evidence and provenance references can be restored.

A vector hit or SQL result derived from these objects is not evidence until its provenance
is restored (per [`PROVENANCE_MODEL.md`](./PROVENANCE_MODEL.md)).

## 17. Non-authorization Statement

This Typed Decomposition Object contract authorizes no runtime schema migration, no database implementation, no runtime WorkUnit storage, no GraphRAG implementation, no vectorization, no NL2SQL execution, no real LLM enablement, no external execution, and no automated decision-making.

Enforcement in code is governed by separate, future gates with recorded human decisions.
