# Approval MAC Rollout Contract

**Phase:** P7.2A (security lane). **Baseline:** `main` @ `45975b4`.

Defines the shape of a rollout record and the rules governing how legacy approval
verification and canonical approval MAC verification may be compared during a **future**
shadow rollout — without changing approval behavior or authorizing execution. Pairs with
[`APPROVALSTORE_DUAL_READ_WIRING_PRE_SPEC.md`](./APPROVALSTORE_DUAL_READ_WIRING_PRE_SPEC.md).
Documentation and a static test only.

---

## 1. Purpose

Give the future dual-read rollout a single, reviewable record shape and an unambiguous set
of authority/audit/rollback rules, so a P7.2B wiring gate consumes a fixed contract rather
than inventing rollout semantics — and so no rollout mode can silently make the canonical
MAC authoritative or authorize execution.

The Approval MAC Rollout Contract defines how legacy approval verification and canonical approval MAC verification may be compared during future shadow rollout without changing approval behavior or authorizing execution.

Approval MAC Rollout Contractとは、将来のshadow rolloutにおいてlegacy approval verificationとcanonical approval MAC verificationを比較する方法を定義するが、approval behaviorを変更せず、executionも認可しないcontractである。

## 2. Scope

- **In scope:** the rollout record's required fields, rollout modes, verifier authority per
  mode, legacy-to-canonical mapping requirements, shadow comparison result values, audit
  event contract, rollback contract, human-approval/four-eyes requirements, secret/key
  handling, validation rules, and outcomes.
- **Out of scope:** any runtime implementation, ApprovalStore integration, approval behavior
  change, external action enablement, real LLM enablement, production secret storage, key
  rotation runtime, or deployment.

## 3. Definition of Approval MAC Rollout Contract

The Approval MAC Rollout Contract is the reviewable definition of a single dual-read rollout
evaluation: which mode is active, what the legacy and canonical verifiers each returned, how
they compared, whether the mapping was valid, and what audit/rollback state applies — with
the legacy verifier authoritative in every mode this contract permits for P7.2B.

## 4. What This Contract Is Not

This contract is **not**:

- runtime implementation
- ApprovalStore integration
- approval behavior change
- approval authorization
- execution authorization
- external action enablement
- real LLM enablement
- production secret storage
- key rotation runtime
- deployment approval

## 5. Required Rollout Fields

- rollout_id
- rollout_mode
- tenant_id
- approval_request_id
- action_preview_id
- operation
- target_hash
- payload_hash
- preview_hash
- legacy_verifier_result
- canonical_mac_result
- comparison_result
- canonical_payload_mapping_status
- p7_1_utility_version
- key_id
- key_version
- audit_event_id
- rollback_mode
- human_review_required
- four_eyes_required
- self_approval_blocked
- created_at
- evaluated_at
- no_go_flags

## 6. Rollout Modes

`rollout_mode` is one of:

- legacy_only
- shadow_compare
- dual_read_warn
- dual_read_block_candidate
- keyed_mac_enforced

legacy_only means only the legacy verifier is evaluated.

shadow_compare means the legacy verifier remains authoritative while canonical MAC is computed for comparison.

dual_read_warn means canonical mismatch may produce warning only and requires a later gate.

dual_read_block_candidate means canonical mismatch may block candidate approval only after a later gate.

keyed_mac_enforced means canonical MAC becomes authoritative only after a later enforcement gate.

P7.2B may only implement legacy_only and shadow_compare.

## 7. Verifier Authority Rules

legacy verifier remains authoritative in legacy_only.

legacy verifier remains authoritative in shadow_compare.

canonical MAC success must not authorize approval in shadow_compare.

canonical MAC failure must not by itself change behavior in shadow_compare.

canonical MAC mismatch must not enable execution.

keyed_mac_enforced requires a later gate.

## 8. Legacy-to-Canonical Mapping Requirements

All required Canonical Approval Payload fields must be mapped before runtime wiring.

Mapping must identify source for tenant_id, actor_id, actor_role, action_preview_id, operation, target_system, target_identifier, target_hash, payload_hash, preview_hash, risk_level, human_review_required, source_workunit_candidate_id, source_formal_workunit_id, source_action_field_id, source_decision_record_id, expires_at, nonce, idempotency_key, key_id, and key_version.

Unmapped fields are No-Go for runtime wiring.

Ambiguous workUnitId mapping is No-Go for enforcement.

## 9. Shadow Comparison Result Contract

`comparison_result` is one of:

- not_evaluated
- match
- mismatch
- canonical_unavailable
- legacy_failed
- both_failed
- invalid_mapping
- no_go

The future wiring gate must define the truth table mapping each (legacy_verifier_result,
canonical_mac_result) pair to exactly one `comparison_result` value; an undefined mapping is
`missing_shadow_comparison_result` (§15) and No-Go for wiring.

## 10. Audit Event Contract

Audit event must not contain secrets.

Audit event must include rollout_mode.

Audit event must include legacy_verifier_result.

Audit event must include canonical_mac_result.

Audit event must include comparison_result.

Audit event must include key_id and key_version.

Audit event must include tenant_id and approval_request_id.

Audit event must include failure reason without exposing secrets.

## 11. Rollback Contract

Rollback must return rollout_mode to legacy_only.

Rollback must not delete existing approval records.

Rollback must not enable external actions.

Rollback must not trust client-provided approval state.

Rollback must be possible without database migration in first wiring phase.

## 12. Human Approval and Four-eyes Requirements

Canonical MAC must not replace human approval.

Canonical MAC must not replace four-eyes review.

Canonical MAC must not allow self-approval.

Canonical MAC must not lower human_review_required.

Model confidence must not reduce approval requirements.

## 13. Secret and Key Handling Requirements

No production secrets in P7.2A.

No secret logging.

No fallback to unkeyed hash for authorization integrity.

Unknown key_id must fail closed in enforcement phases.

Unknown key_version must fail closed in enforcement phases.

Tenant secret unavailable must fail closed in enforcement phases.

## 14. Validation Rules

A valid rollout contract must define rollout modes.

A valid rollout contract must define verifier authority per mode.

A valid rollout contract must define legacy-to-canonical mapping requirements.

A valid rollout contract must define shadow comparison results.

A valid rollout contract must define audit fields.

A valid rollout contract must define rollback behavior.

A valid rollout contract must preserve human approval and four-eyes boundaries.

A valid rollout contract must not authorize execution.

## 15. Failure and No-Go Conditions

- missing_rollout_mode
- unknown_rollout_mode
- missing_verifier_authority_rule
- missing_legacy_to_canonical_mapping
- unmapped_canonical_field
- ambiguous_workunit_mapping
- missing_shadow_comparison_result
- missing_audit_event_contract
- secrets_in_audit_event
- rollback_missing
- external_action_enabled
- real_llm_enabled
- canonical_mac_authoritative_in_shadow
- keyed_mac_enforced_without_gate
- human_approval_replaced
- four_eyes_weakened
- self_approval_allowed
- client_approval_state_trusted

## 16. Pass / Warn / Fail / No-Go Outcomes

Pass:
The rollout contract preserves legacy verifier authority, defines canonical MAC shadow comparison, maps required canonical fields, preserves human approval and four-eyes boundaries, defines audit and rollback expectations, and does not authorize execution.

Warn:
The rollout contract is non-authorizing, but mapping, audit, rollback, or rollout-mode details need clarification before runtime wiring.

Fail:
Required rollout fields or documentation are missing, but no hard safety boundary is crossed.

No-Go:
A hard safety boundary is violated, such as external action enablement, real LLM enablement, canonical MAC enforcement without a later gate, client approval state trust, self-approval bypass, weakened four-eyes review, secret logging, or execution authorization.

## 17. Non-authorization Statement

This Approval MAC Rollout Contract authorizes no runtime implementation, no ApprovalStore integration, no approval behavior change, no approval authorization, no execution authorization, no external action execution, no real LLM enablement, no production secret storage, no key rotation runtime, no deployment, and no automated decision-making.

Enforcement in code is governed by separate, future gates with recorded human decisions.
