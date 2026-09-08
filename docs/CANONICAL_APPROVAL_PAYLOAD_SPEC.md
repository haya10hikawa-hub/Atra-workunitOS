# Canonical Approval Payload Spec

**Phase:** P7.0 (security lane). **Baseline:** `main` @ `1c2c920`.

Defines the product-level Canonical Approval Payload: the deterministic byte-level object a
future keyed approval-hash verification would bind a human approval decision to. Builds on
[`APPROVAL_HASH_KEYING_PLAN.md`](./APPROVAL_HASH_KEYING_PLAN.md),
[`TENANT_SECRET_PROVIDER_DESIGN.md`](./TENANT_SECRET_PROVIDER_DESIGN.md), and
[`APPROVAL_SECRET_THREAT_MODEL.md`](./APPROVAL_SECRET_THREAT_MODEL.md). Pairs with
[`TSP_DESIGN_REVIEW_CLOSURE.md`](./TSP_DESIGN_REVIEW_CLOSURE.md). Documentation and a static
test only.

> This spec **describes** the payload and its keying requirements. It implements no HMAC,
> retrieves no secrets, changes no ApprovalStore behavior, and enables no external action.
> The live approval binding (unkeyed SHA-256, Risk Register R4) is unchanged by this phase.

---

## 1. Purpose

Close the security-lane documentation gap flagged since the P6.0 design gate: name the exact
payload that a future keyed MAC must cover, so that approval integrity stops depending on an
unkeyed digest that any party who can read the payload can recompute.

Canonical Approval Payloads are not approvals. They are deterministic, tenant-scoped, immutable review payloads used to bind a human approval decision to the exact operation, target, payload, actor, tenant, preview, expiry, and lineage that were reviewed.

The Canonical Approval Payload is a deterministic, tenant-scoped, immutable review payload that binds a human approval decision to the exact operation, target, payload, actor, tenant, preview, expiry, nonce, and lineage that were reviewed.

Canonical Approval Payloadとはapprovalそのものではない。人間のapproval decisionを、レビューされたoperation・target・payload・actor・tenant・preview・expiry・nonce・lineageに正確に結びつけるための、deterministic・tenant-scoped・immutableなreview payloadである。

## 2. Scope

- **In scope:** the payload's required fields, canonicalization rules, hashing and keying
  requirements, tenant/actor/operation/target/payload/preview binding, expiry/nonce/replay
  resistance, audit expectations, and No-Go conditions.
- **Out of scope:** any runtime ApprovalStore change, TenantSecretProvider implementation,
  secret storage, KMS integration, HMAC runtime code, external action execution, real LLM,
  or deployment.

## 3. Definition of Canonical Approval Payload

A Canonical Approval Payload is the single, deterministic serialization of everything a
human reviewed when approving an action — and therefore the only bytes a future keyed
approval hash may be computed over. If it was not in the canonical payload, it was not
approved.

## 4. What Canonical Approval Payload Is Not

Canonical Approval Payload is **not**:

- approval
- execution authorization
- external action execution
- server-side approval verification by itself
- TenantSecretProvider implementation
- secret storage
- HMAC implementation
- runtime ApprovalStore change
- human approval replacement
- LLM permission
- model confidence
- audit log by itself
- evidence by itself

## 5. Payload Principles

- One payload, one decision: a human approval decision binds to exactly one canonical
  payload; any change to the payload invalidates the decision. AI proposes; Rules guard;
  Humans decide.
- Approval integrity must not rely on client-provided approval state, unkeyed hashes,
  mutable payloads, or model confidence.
- Fail closed: missing fields, unknown keys, unavailable secrets, expiry, or reuse resolve
  to No-Go, never to a permissive verification.

## 6. Required Fields

- canonical_payload_version
- approval_request_id
- tenant_id
- actor_id
- actor_role
- action_preview_id
- operation
- target_system
- target_identifier
- target_hash
- payload_hash
- payload_redaction_state
- preview_hash
- risk_level
- human_review_required
- source_workunit_candidate_id
- source_formal_workunit_id
- source_action_field_id
- source_decision_record_id
- created_at
- expires_at
- nonce
- idempotency_key
- key_id
- key_version
- hash_algorithm
- canonicalization_algorithm
- approval_scope
- no_go_flags

Note: the runtime approval-preview binding's `workUnitId` dimension maps to
`source_formal_workunit_id` (or `source_workunit_candidate_id` for pre-promotion
candidates); a future implementation must bind exactly one of them and treat a mismatch as
target_mismatch.

## 7. Canonicalization Rules

Canonicalization must be deterministic.

Canonicalization must use a documented field order.

Canonicalization must preserve explicit nulls.

Canonicalization must distinguish missing fields from null fields.

Canonicalization must normalize string encoding.

Canonicalization must normalize timestamp format.

Canonicalization must reject unknown critical fields.

Canonicalization must not include mutable display-only fields.

Canonicalization must not depend on object insertion order.

Canonicalization must be stable across runtimes.

## 8. Hashing and Keying Requirements

Approval integrity must use a keyed construction such as HMAC-SHA-256 or an equivalent reviewed keyed MAC.

Unkeyed SHA-256 must not be sufficient for approval authorization integrity.

The approval hash must be bound to tenant_id.

The approval hash must be bound to operation.

The approval hash must be bound to target_hash.

The approval hash must be bound to payload_hash.

The approval hash must be bound to preview_hash.

The approval hash must be bound to expires_at.

The approval hash must be bound to nonce.

The approval hash must be bound to key_id and key_version.

Verification must fail closed when a tenant secret is unavailable.

Verification must fail closed when key_id or key_version is unknown.

Verification comparison must use constant-time comparison in a future runtime implementation.

## 9. Tenant Scope and Actor Binding

tenant_id is required.

actor_id is required.

actor_role is required.

approval_scope is required.

Cross-tenant approval payloads are No-Go.

Client-provided tenant scope must not be trusted by itself.

Client-provided approvedByPm must not be trusted.

## 10. Operation, Target, and Payload Binding

operation is required.

target_system is required.

target_identifier is required.

target_hash is required.

payload_hash is required.

preview_hash is required.

Any mismatch between reviewed preview and execution payload is No-Go.

Any mismatch between target_hash and requested target is No-Go.

Any mismatch between payload_hash and requested payload is No-Go.

## 11. Preview, Risk, and Human Review Binding

action_preview_id is required.

risk_level is required.

human_review_required is required.

human_review_required must not be lowered by the model.

LLM confidence must not reduce human review requirements.

Approval cannot be inferred from preview generation.

Preview ≠ Approval; Approval ≠ Execution — binding the preview into the payload records
what was reviewed; it never converts a preview into an approval or an approval into an
execution.

## 12. Expiry, Nonce, and Replay Resistance

expires_at is required.

nonce is required.

idempotency_key is required.

Expired approval payloads are No-Go.

Reused nonce is No-Go.

Replay across tenants is No-Go.

Replay across operations is No-Go.

Replay across targets is No-Go.

## 13. Audit and Verification Expectations

Verification attempt must be auditable in a future runtime implementation.

Verification success must be auditable in a future runtime implementation.

Verification failure must be auditable in a future runtime implementation.

Audit records must not contain secrets.

Audit records must include tenant_id, approval_request_id, action_preview_id, operation, target_hash, payload_hash, key_id, key_version, verification outcome, and verified_at.

## 14. Failure and No-Go Conditions

- missing_tenant_id
- missing_actor_id
- missing_operation
- missing_target_hash
- missing_payload_hash
- missing_preview_hash
- missing_expires_at
- missing_nonce
- missing_key_id
- missing_key_version
- unknown_key_id
- unknown_key_version
- tenant_secret_unavailable
- expired_payload
- nonce_reuse
- cross_tenant_replay
- operation_mismatch
- target_mismatch
- payload_mismatch
- preview_mismatch
- unkeyed_hash_for_authorization
- client_provided_approval_state
- approvedByPm_trusted
- model_confidence_as_approval
- human_review_requirement_lowered
- unknown_hash_algorithm
- unknown_canonicalization_algorithm

## 15. Relationship to ApprovalStore / TenantSecretProvider / External Actions

- **ApprovalStore** remains the server-side source of approval truth; this spec defines the
  payload it would bind to, not a change to its runtime behavior.
- **TenantSecretProvider** ([`TSP_DESIGN_REVIEW_CLOSURE.md`](./TSP_DESIGN_REVIEW_CLOSURE.md))
  is the future source of the tenant-scoped key for the keyed MAC; it remains unimplemented.
- **External actions** remain blocked by the existing enablement flag and kill switch; a
  verified canonical payload is a necessary future precondition for external execution,
  never a sufficient one.

## 16. Future Implementation Requirements

Future runtime implementation must use TenantSecretProvider.

Future runtime implementation must use a keyed MAC.

Future runtime implementation must fail closed when secrets or key metadata are unavailable.

Future runtime implementation must use constant-time comparison.

Future runtime implementation must audit verification attempts.

Future runtime implementation must preserve approval payload immutability.

Future runtime implementation must not log secrets.

Future runtime implementation must not enable external actions without a separate external-action enablement gate.

## 17. Non-authorization Statement

This Canonical Approval Payload Spec authorizes no approval, no execution authorization, no external action execution, no runtime ApprovalStore change, no TenantSecretProvider implementation, no secret storage, no HMAC implementation, no real LLM enablement, no external execution, no deployment, and no automated decision-making.

Any future implementation or capability enablement requires a new explicit CURRENT
technical/safety decision and applicable implementation and verification gates.

The archived V0 `NEXT_CAPABILITY_GATE` is historical context only and does not authorize
current or future implementation.
