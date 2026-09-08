# TSP Design Review Closure

**Status: PLAN — FUTURE / NOT IMPLEMENTED.** Product authority: NONE.

**Phase:** P7.0 (security lane). **Baseline:** `main` @ `1c2c920`.

Closes the design review of the TenantSecretProvider (TSP) that the P6.0 gate
([`TENANT_SECRET_PROVIDER_DESIGN.md`](./TENANT_SECRET_PROVIDER_DESIGN.md),
[`APPROVAL_HASH_KEYING_PLAN.md`](./APPROVAL_HASH_KEYING_PLAN.md),
[`APPROVAL_SECRET_THREAT_MODEL.md`](./APPROVAL_SECRET_THREAT_MODEL.md)) left open — at the
documentation and requirements level only. Pairs with
[`CANONICAL_APPROVAL_PAYLOAD_SPEC.md`](./CANONICAL_APPROVAL_PAYLOAD_SPEC.md). Documentation
and a static test only.

> This closure **confirms requirements**. It implements no secret retrieval, no key storage,
> no HMAC, and no ApprovalStore change. Risk Register R4 (unkeyed approval hash on the live
> path) remains open at runtime until a separately gated implementation phase lands.

---

## 1. Purpose

Convert the parked TSP design documents into a closed set of reviewed security requirements,
so a future implementation phase has an unambiguous contract to build against and Risk
Register R4 has a defined discharge path.

TenantSecretProvider design-review closure does not implement secret retrieval. It defines the security requirements that must be satisfied before approval hashes can be treated as keyed, tenant-scoped authorization integrity checks.

TenantSecretProvider design-review closure confirms the security requirements for future tenant-scoped keyed approval hashing, but it does not implement secret retrieval, key storage, HMAC, ApprovalStore changes, or external action execution.

TenantSecretProvider design-review closureとはsecret retrievalの実装ではない。approval hashをkeyedかつtenant-scopedなauthorization integrity checkとして扱う前に満たすべきsecurity requirementsを確定することである。

TenantSecretProvider design-review closureとはsecret retrievalの実装ではない。将来のtenant-scoped keyed approval hashingに必要なsecurity requirementsを確認するが、key storage・HMAC・ApprovalStore変更・external action executionは実装しない。

## 2. Scope

- **In scope:** the security requirements, tenant key scope, key identity/versioning/
  rotation, secret retrieval failure modes, approval hash verification requirements, audit
  and observability requirements, threat-model closure, open risks, and the closure
  decision.
- **Out of scope:** any runtime TenantSecretProvider implementation, secret storage, KMS
  integration, HMAC runtime code, ApprovalStore change, external action enablement, real
  LLM, or deployment.

## 3. Definition of TenantSecretProvider Design-review Closure

Design-review closure is the recorded confirmation that the TSP design documents, the
threat model, and the keying plan are consistent, complete at the requirements level, and
sufficient to gate a future implementation — nothing more.

## 4. What This Closure Is Not

This closure is **not**:

- TenantSecretProvider implementation
- secret storage
- KMS integration
- HMAC implementation
- ApprovalStore runtime change
- external action enablement
- real LLM enablement
- deployment approval
- production readiness by itself
- security signoff for execution by itself

## 5. Closure Principles

- Requirements first, implementation later, enablement last — each behind its own gate with
  a recorded human decision.
- Fail closed everywhere: any ambiguity about secrets, keys, or tenant binding resolves to
  refusal, never to a fallback.
- Approval integrity must not rely on client-provided approval state, unkeyed hashes,
  mutable payloads, or model confidence.

## 6. Security Requirements

Tenant secrets must be tenant-scoped.

Tenant secrets must not be client-provided.

Tenant secrets must not be logged.

Tenant secrets must not be exposed to the LLM.

Tenant secrets must not be stored in plaintext application logs.

Tenant secrets must not be embedded in source code.

Tenant secrets must not appear in the evidence ledger or release decision records.

Approval hash verification must fail closed if the tenant secret is unavailable.

Approval hash verification must fail closed if key metadata is invalid.

Unkeyed SHA-256 must not be accepted as authorization integrity.

Keyed MAC verification must be required before approval hashes can authorize future external action execution.

## 7. Tenant Key Scope Requirements

Each tenant must have an independent secret scope.

Cross-tenant key reuse is No-Go unless explicitly reviewed and documented as safe.

A tenant key must not validate another tenant's approval payload.

Tenant id must be part of the canonical approval payload.

Tenant id must be bound into the keyed MAC input.

## 8. Key Identity, Versioning, and Rotation Requirements

key_id is required.

key_version is required.

Key rotation must be supported by design.

Old keys must have an explicit verification window.

Revoked keys must fail closed.

Unknown key_id is No-Go.

Unknown key_version is No-Go.

## 9. Secret Retrieval and Failure-mode Requirements

Secret retrieval failure must fail closed.

Secret provider timeout must fail closed.

Secret provider ambiguity must fail closed.

Missing tenant binding must fail closed.

Missing key metadata must fail closed.

No fallback to unkeyed hashing is allowed.

No fallback to client-provided secrets is allowed.

## 10. Approval Hash Verification Requirements

Verification must use a keyed MAC.

Verification must use canonical payload bytes.

Verification must include tenant_id, operation, target_hash, payload_hash, preview_hash, expires_at, nonce, key_id, and key_version.

Verification must use constant-time comparison in future runtime implementation.

Verification must reject expired payloads.

Verification must reject replayed nonces.

Verification must reject mismatched target or payload hashes.

## 11. Audit and Observability Requirements

Verification attempts must be auditable.

Verification success must be auditable.

Verification failure must be auditable.

Key id and key version may be logged.

Secrets must never be logged.

Audit records must include failure reasons without exposing secrets.

## 12. Threat Model Closure

The threat model ([`APPROVAL_SECRET_THREAT_MODEL.md`](./APPROVAL_SECRET_THREAT_MODEL.md)) is
closed at the requirements level for each of the following, via the named requirement:

Replay attack — nonce, expires_at, and idempotency_key are required and bound into the MAC; replayed nonces must be rejected.

Cross-tenant replay — tenant_id is bound into the MAC input and a tenant key must not validate another tenant's payload.

Payload substitution — payload_hash is bound; mismatched payload hashes must be rejected.

Target substitution — target_hash is bound; mismatched target hashes must be rejected.

Preview substitution — preview_hash is bound; a reviewed preview that does not match the execution payload is No-Go.

Client-provided approval state — never trusted; server-side verification remains the only source of approval truth.

approvedByPm trust bypass — client-provided approvedByPm must not be trusted.

Unkeyed hash forgery or recomputation — unkeyed SHA-256 must not be accepted as authorization integrity; a keyed MAC is required.

Secret unavailability — verification fails closed; no unkeyed fallback.

Key rotation and revoked keys — key_id/key_version are required, rotation is designed in, revoked keys fail closed.

LLM confidence bypass — model confidence is never approval and never lowers human review requirements.

Self-approval bypass — the four-eyes constraint is preserved: the creator of an action preview must not be its approver; keyed verification never replaces or weakens the creator-is-not-approver check.

Canonicalization mismatch or drift — canonical_payload_version and canonicalization_algorithm are required payload fields; verification uses canonical payload bytes, so divergent canonicalization fails verification rather than passing silently.

Secret in evidence ledger or release decision record — tenant secrets must not appear in the evidence ledger, release decision records, or any documentation surface; only key_id and key_version may be recorded.

## 13. Open Risks and Future Implementation Gates

Runtime TenantSecretProvider implementation remains future-gated.

Runtime HMAC verification remains future-gated.

Runtime nonce replay storage remains future-gated.

Runtime key rotation remains future-gated.

Runtime ApprovalStore integration remains future-gated.

External action enablement remains future-gated.

Real LLM enablement remains future-gated.

Until those gates land, Risk Register R4 (live unkeyed SHA-256 approval binding) remains
an open runtime risk, mitigated by external actions being disabled by default and
server-side approval enforcement.

## 14. Failure and No-Go Conditions

- tenant_secret_unavailable
- tenant_secret_client_provided
- tenant_secret_logged
- secret_exposed_to_llm
- missing_key_id
- missing_key_version
- unknown_key_id
- unknown_key_version
- revoked_key
- missing_tenant_binding
- cross_tenant_key_validation
- unkeyed_hash_fallback
- client_provided_secret_fallback
- expired_payload
- replayed_nonce
- target_hash_mismatch
- payload_hash_mismatch
- preview_hash_mismatch
- approvedByPm_trusted
- model_confidence_as_approval

## 15. Relationship to Canonical Approval Payload / ApprovalStore / External Actions

- **Canonical Approval Payload**
  ([`CANONICAL_APPROVAL_PAYLOAD_SPEC.md`](./CANONICAL_APPROVAL_PAYLOAD_SPEC.md)) defines the
  bytes the keyed MAC covers; this closure defines where the key comes from and how failure
  behaves.
- **ApprovalStore** remains the unchanged server-side source of approval truth; future TSP
  integration is a separate implementation gate.
- **External actions** remain disabled by default behind the existing enablement flag and
  kill switch; nothing in this closure weakens either.

## 16. Closure Decision

TenantSecretProvider design-review is closed only at the documentation and requirements level.

TenantSecretProvider is not implemented by this phase.

Approval hash verification is not changed by this phase.

External actions remain disabled unless a later implementation and enablement gate explicitly changes that state.

## 17. Non-authorization Statement

This TSP Design Review Closure authorizes no TenantSecretProvider implementation, no secret storage, no KMS integration, no HMAC implementation, no ApprovalStore runtime change, no approval verification runtime change, no external action enablement, no real LLM enablement, no deployment, and no automated decision-making.

Any future implementation or capability enablement requires a new explicit CURRENT
technical/safety decision and applicable implementation and verification gates.

The archived V0 `NEXT_CAPABILITY_GATE` is historical context only and does not authorize
current or future implementation.
