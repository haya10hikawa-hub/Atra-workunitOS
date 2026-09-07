# P6-I4 Storage Gate Record Contract

**Loop:** P6-I4 (storage_gate_spec_loop, docs-only + static-test). **Companion:**
[`P6_I4_STORAGE_GATE_SPEC.md`](./P6_I4_STORAGE_GATE_SPEC.md). **Human Go:**
[`P6_I4_EXPLICIT_HUMAN_GO.md`](./P6_I4_EXPLICIT_HUMAN_GO.md) (recorded before code).

## 1. Purpose

Specify the shape of a future Storage Gate Record: the non-authorizing record a future storage
gate would emit to describe whether a Phase 6 artifact or spine is *eligible* to be considered by
a later persistence implementation gate. This contract is documentation and static tests only; no
record is constructed, stored, or persisted by this loop.

A Storage Gate Record is a future non-authorizing record of whether a Phase 6 artifact or artifact spine is eligible to be considered by a later persistence implementation gate.

Storage Gate Recordとは、Phase 6 artifactまたはartifact spineが将来のpersistence implementation gateで検討可能かを記録するための非認可recordであり、保存実行・approval・execution・promotionを意味しない。

## 2. Scope

Documentation and static tests only. No app runtime file, no constructor, no validator, no
storage, no persistence, no D1 binding, no migration, and no SQL is added or modified. The record
described here is a specification shape, not an implemented type.

## 3. Definition of Storage Gate Record

A Storage Gate Record is the structured, non-authorizing output a future storage gate would
produce for one candidate (a single artifact or a grouped spine). It records the eligibility
verdict, the evidence that the pre-storage checks were run, the tenant and lineage results, the
hash/content-integrity results, the No-Go/failure information, and the human-review attribution —
and nothing that grants approval, execution, or promotion.

## 4. What Storage Gate Record Is Not

The Storage Gate Record is not:

- stored artifact
- database row by itself
- storage execution
- persistence execution
- D1 record
- SQL result
- ledger entry
- graph node
- graph edge
- approval record
- execution authorization
- Formal WorkUnit promotion
- production readiness

## 5. Required Fields

A Storage Gate Record must carry:

- storage_gate_record_id
- tenant_id
- storage_gate_status
- storage_gate_outcome
- artifact_scope
- artifact_references
- spine_references
- validation_evidence
- tenant_consistency_result
- lineage_continuity_result
- hash_integrity_result
- content_integrity_result
- no_go_flags_result
- non_authorization_result
- human_review_required
- reviewed_by_human_at
- reviewed_by_human_id
- created_at
- payload_hash
- no_go_flags

## 6. Storage Eligibility Status

`storage_gate_status` is one of these literal values:

- draft_storage_gate_record
- blocked_no_go
- storage_eligible_for_future_gate
- storage_ineligible
- clarification_needed

storage_eligible_for_future_gate is defined as: Eligible for a future persistence implementation gate review only. It is not storage execution.

`storage_gate_outcome` is one of these literal values:

- pass
- warn
- fail
- no_go

## 7. Artifact Reference Fields

`artifact_scope` is one of these literal values:

- single_artifact
- full_phase6_spine
- partial_spine
- blocked_record

`artifact_references` must reference one or more of:

- query_intent_id
- safe_query_plan_id
- compiled_sql_artifact_id
- rule_review_record_id
- query_result_record_id
- evidence_review_id
- llm_judgment_id
- human_decision_id

`spine_references` groups the artifact references when `artifact_scope` is `full_phase6_spine` or
`partial_spine`.

## 8. Tenant and Lineage Fields

The record must carry:

- tenant_id
- tenant_consistency_result
- lineage_continuity_result
- lineage_edges_checked
- lineage_mismatches
- cross_tenant_detected

## 9. Validation Evidence Fields

The record must carry:

- validators_checked
- validator_results
- construction_results_checked
- harness_results_checked
- fixture_results_checked
- validation_passed

## 10. Hash and Content Integrity Fields

The record must carry:

- sql_hash_check_result
- result_hash_check_result
- content_integrity_check_result
- payload_hash
- payload_hash_algorithm

payload_hash_algorithm must be sha256. payload_hash must be sha256:<64 lowercase hex>.

## 11. No-Go and Failure Fields

The record must carry:

- no_go_flags
- no_go_flags_result
- failure_reasons
- blocked_capabilities
- unresolved_risks

## 12. Human Review Fields

The record must carry:

- human_review_required
- reviewed_by_human_id
- reviewed_by_human_at
- reviewer_role
- review_rationale

## 13. Relationship to Future Persistence

- Storage Gate Record may be an input to P6-I5.
- Storage Gate Record does not persist artifacts by itself.
- Storage Gate Record does not choose a database backend.
- Storage Gate Record does not create D1 bindings.
- Storage Gate Record does not run migrations.

## 14. Relationship to Ledger and Graph Linkage

- Storage Gate Record does not append evidence ledger entries and does not update
  ALPHA_EVIDENCE_LEDGER.
- Storage Gate Record does not create graph nodes or graph edges and does not implement GraphRAG.
- Ledger linkage and graph linkage remain future-gated; a Storage Gate Record may at most name a
  candidate for a future ledger or graph gate, never write one.

## 15. Relationship to Approval and Execution

- Storage Gate Record is not ApprovalStore approval and does not satisfy any approval requirement.
- Storage Gate Record is not execution authorization and authorizes no external action.
- Storage Gate Record does not promote a Formal WorkUnit.
- storage_eligible_for_future_gate is not approval, not execution permission, and not promotion.

## 16. Validation Rules

- missing tenant_id is No-Go
- missing artifact references are No-Go
- empty artifact_references are No-Go
- cross-tenant lineage is No-Go
- lineage mismatch is No-Go
- invalid payload_hash is No-Go
- invalid content_integrity_reference is No-Go
- missing human review for storage eligibility is No-Go
- no_go_flags cannot be ignored
- storage_eligible_for_future_gate cannot be used as approval
- storage_eligible_for_future_gate cannot be used as execution permission
- storage_eligible_for_future_gate cannot be used as production readiness

## 17. Non-authorization Statement

This Storage Gate Record Contract authorizes no storage implementation, no persistence implementation, no D1 access, no D1 migration, no SQL execution, no repository implementation, no storage adapter, no database schema, no product runtime pipeline, no ApprovalStore integration, no P7.1 TSP wiring, no external action execution, no Formal WorkUnit promotion, no deployment, no release, no production readiness, and no automated decision-making.
