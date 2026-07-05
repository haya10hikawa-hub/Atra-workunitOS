# ApprovalStore Dual-read Wiring Pre-spec

**Phase:** P7.2A (security lane). **Baseline:** `main` @ `45975b4`.

Defines how the existing approval path may **later** be migrated from legacy approval-hash
verification toward the P7.1 canonical approval MAC utilities
([`P7_1_TSP_MINIMAL_RUNTIME_IMPLEMENTATION.md`](./P7_1_TSP_MINIMAL_RUNTIME_IMPLEMENTATION.md))
using a future dual-read / shadow-compare rollout. Pairs with
[`APPROVAL_MAC_ROLLOUT_CONTRACT.md`](./APPROVAL_MAC_ROLLOUT_CONTRACT.md). Documentation and a
static test only.

> This pre-spec **describes** a future migration. It wires nothing, changes no ApprovalStore
> behavior, imports no P7.1 utility into the live path, and enables no enforcement. The live
> approval binding still uses the legacy unkeyed SHA-256 path (Risk Register R4 remains
> open) until a separate P7.2B wiring gate — and later enforcement gates — land with their
> own sign-offs.

---

## 1. Purpose

Discharge, at the documentation level, the pre-wiring gaps flagged by the P7.1 and P6.12
audits so that a future P7.2B wiring gate has an unambiguous contract: the legacy-to-canonical
field mapping, the coexistence of `verifyHashBinding` and `verifyApprovalMac`, the shadow
rollout modes, verifier authority per stage, audit/rollback requirements, and the entry
criteria that must all be true before any runtime wiring begins.

ApprovalStore dual-read wiring is a future-gated migration strategy in which legacy approval verification remains authoritative while canonical approval MAC verification is computed in shadow mode for comparison, audit, and safety validation before any enforcement change.

ApprovalStore dual-read wiringとはenforcementではない。既存のapproval verifierをauthoritativeなまま維持しつつ、新しいcanonical approval MAC verifierをshadow modeで計算し、比較・監査・安全検証を行った後にのみ、将来のenforcement変更へ進めるためのfuture-gated migration strategyである。

## 2. Scope

- **In scope:** the runtime inventory the wiring gate must complete, the legacy→canonical
  field mapping, the dual-read verification strategy, shadow/enforcement rollout modes,
  audit/observability requirements, rollback/feature-flag requirements, four-eyes
  boundaries, TSP/key/secret requirements, the migration/compatibility plan, and P7.2B
  entry criteria.
- **Out of scope:** any runtime wiring, ApprovalStore behavior change, approval verification
  change, P7.1 utility wiring, external action enablement, real LLM enablement, production
  TenantSecretProvider, secret storage, KMS, nonce storage, key rotation runtime, runtime
  audit implementation, or feature-flag implementation.

## 3. Definition of ApprovalStore Dual-read Wiring

ApprovalStore dual-read wiring is the future runtime arrangement in which, for a single
approval verification, the existing legacy verifier is evaluated authoritatively and the
canonical approval MAC verifier is *additionally* evaluated in shadow mode, their results
compared and audited, with no change to the user-visible approval outcome until a separate
enforcement gate makes the canonical verifier authoritative.

## 4. What This Pre-spec Is Not

This pre-spec is **not**:

- runtime wiring
- ApprovalStore behavior change
- approval verification behavior change
- external action enablement
- real LLM enablement
- production TenantSecretProvider implementation
- secret storage
- KMS integration
- nonce storage
- key rotation runtime
- approval authorization
- execution authorization
- deployment approval

## 5. Product and Security Invariants

AI proposes. Rules guard. Humans decide.

Approval MAC is not approval.

Dual-read is not enforcement.

Shadow compare is not authorization.

Preview is not approval.

Approval is not execution.

Model confidence cannot authorize approval.

Client-provided approvedByPm must not be trusted.

Client-provided approval state must not be trusted.

Four-eyes requirements must not be weakened.

Self-approval bypass is No-Go.

## 6. Existing Runtime Inventory Requirements

Before P7.2B wiring, the implementer must identify and document the exact existing runtime files for ApprovalStore, approval preview binding, hash binding verification, external action gating, audit logging, and P7.1 approval MAC utilities.

Before P7.2B wiring, the implementer must confirm whether P7.1 utilities are imported anywhere in the live approval path.

Before P7.2B wiring, the implementer must confirm that external actions remain disabled by default.

Before P7.2B wiring, the implementer must confirm that real LLM remains disabled unless separately enabled by an approved gate.

Inventory reference (as observed at baseline `45975b4`, to be re-confirmed by the wiring
gate, not relied on as current at wiring time): ApprovalStore at
`app/lib/security/approvalStore.ts` (+ `approvalStoreResolver.ts`,
`app/lib/persistence/approvalStoreAdapter.ts`,
`app/lib/persistence/d1/approvalRecordRepository.ts`); approval preview binding at
`app/lib/security/approvalPreviewBinding.ts`; hash binding at `app/lib/security/hash.ts`
(`hashActionTarget`, `hashActionPayload`, `verifyHashBinding`, `allowLegacySha256`); action
approval at `app/lib/security/actionApproval.ts`; external action gating at
`app/lib/security/externalActions.ts`; P7.1 utilities at
`app/lib/security/approvalMac/*`. At baseline the P7.1 utilities are **not imported by any
live approval-path file**; the wiring gate must re-verify this.

## 7. Legacy Hash to Canonical Payload Mapping

The future wiring gate must map existing approval preview / target / payload / work unit / actor / tenant data to every required Canonical Approval Payload field.

The mapping must include these canonical fields:

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

The mapping must explicitly address legacy `workUnitId` and its relationship to `source_formal_workunit_id` or `source_workunit_candidate_id`.

The mapping must explicitly address legacy preview hash, target hash, and payload hash.

The mapping must explicitly address actor and tenant scope.

Any unmapped required canonical field is No-Go for P7.2B runtime wiring.

Any ambiguous mapping between legacy hash fields and canonical fields is No-Go for enforcement.

Known mapping candidates and open questions (documentation only; the wiring gate must
resolve each before enforcement, and each unresolved item is No-Go for enforcement):

- `tenant_id` ← ApprovalRecord/ActionPreview `tenantId` (direct).
- `target_hash` ← `targetHash` (legacy `hashActionTarget`, unkeyed SHA-256); `payload_hash`
  ← `payloadHash` (legacy `hashActionPayload`). These are legacy unkeyed digests; the
  canonical MAC binds them as fields, it does not re-use the legacy digest as the MAC.
- `operation` ← `actionType`.
- `expires_at` ← `expiresAt`.
- `source_formal_workunit_id` / `source_workunit_candidate_id` ← legacy `workUnitId`
  (**ambiguous**: a single `workUnitId` does not by itself say whether it is a formal or
  candidate WorkUnit — the wiring gate must resolve which field it maps to, or map exactly
  one and leave the other null, and treat a mismatch as `target_mismatch`).
- `preview_hash` — **no direct legacy field**: ActionPreview carries `targetHash` and
  `payloadHash` but no combined preview hash today; the wiring gate must define how a
  preview hash is derived (unresolved, No-Go for enforcement until defined).
- `actor_id` ← ApprovalRecord `approvedByUserId` / creator identity; `actor_role` — **no
  direct legacy field** (unresolved).
- `risk_level`, `payload_redaction_state`, `approval_scope`, `nonce`, `idempotency_key`,
  `key_id`, `key_version`, `canonical_payload_version`, `hash_algorithm`,
  `canonicalization_algorithm`, `source_action_field_id`, `source_decision_record_id`,
  `created_at`, `approval_request_id`, `human_review_required`, `no_go_flags` — **no direct
  legacy fields** or must be minted/derived by the wiring gate; each remains unmapped and is
  No-Go for enforcement until the wiring gate defines its source.

## 8. Dual-read Verification Strategy

The existing legacy verifier remains authoritative during shadow mode.

The canonical approval MAC verifier is computed in shadow mode only.

Shadow-mode canonical MAC mismatch must not change user-visible approval behavior.

Shadow-mode canonical MAC mismatch must be auditable.

Shadow-mode canonical MAC success must be auditable.

Legacy verifier failure must continue to fail according to existing behavior.

Canonical MAC failure in shadow mode must not enable execution.

Canonical MAC success in shadow mode must not authorize execution.

A future enforcement phase requires a separate gate.

The canonical shadow verifier is the P7.1 `verifyApprovalMac` (keyed HMAC-SHA-256 over the
canonical payload); the legacy verifier is `verifyHashBinding` with `allowLegacySha256`.
During shadow mode the two run side by side over the same approval; only the legacy result
is authoritative, and the canonical result is recorded for comparison per
[`APPROVAL_HASH_KEYING_PLAN.md`](./APPROVAL_HASH_KEYING_PLAN.md).

## 9. Shadow Compare and Enforcement Modes

Rollout modes:

- legacy_only
- shadow_compare
- dual_read_warn
- dual_read_block_candidate
- keyed_mac_enforced

Only legacy_only and shadow_compare are eligible for first P7.2B runtime wiring.

dual_read_warn, dual_read_block_candidate, and keyed_mac_enforced require later gates.

keyed_mac_enforced must not be enabled in P7.2B.

## 10. Audit and Observability Requirements

Future dual-read attempts must be auditable.

Future shadow comparison success must be auditable.

Future shadow comparison mismatch must be auditable.

Future provider failure must be auditable.

Future unknown key_id and unknown key_version must be auditable.

Future audit records must not contain secrets.

Future audit records must include tenant_id, approval_request_id, action_preview_id, operation, target_hash, payload_hash, preview_hash, key_id, key_version, legacy_verifier_result, canonical_mac_result, comparison_result, rollout_mode, and verified_at.

## 11. Failure and No-Go Conditions

- missing_runtime_inventory
- missing_canonical_field_mapping
- ambiguous_workunit_mapping
- missing_tenant_mapping
- missing_actor_mapping
- missing_preview_mapping
- missing_target_mapping
- missing_payload_mapping
- unmapped_required_canonical_field
- p7_1_utilities_not_present
- p7_1_utilities_modified_without_reason
- approvalstore_behavior_change
- approval_verification_behavior_change
- external_action_behavior_change
- external_action_enabled
- real_llm_enabled
- client_provided_approval_state_trusted
- approvedByPm_trusted
- self_approval_bypass
- four_eyes_weakened
- shadow_mismatch_used_for_execution
- canonical_mac_success_used_as_approval
- keyed_mac_enforced_without_gate
- secrets_logged
- tenant_secret_unavailable_allowed
- unknown_key_allowed
- rollback_missing

## 12. Rollback and Feature Flag Requirements

Future wiring must be controlled by an explicit rollout mode.

Future rollout mode must default to legacy_only.

Future shadow_compare must be reversible without data migration.

Future rollback must restore legacy_only behavior.

Future rollback must not delete approval records.

Future rollback must not enable external actions.

Future rollback must not trust client approval state.

Future feature flags must not be client-controlled.

## 13. Four-eyes and Human Approval Boundaries

Four-eyes requirements must remain intact.

Self-approval bypass is No-Go.

Canonical MAC must not replace human approval.

Canonical MAC must not lower human_review_required.

Canonical MAC must not infer approval from preview generation.

Canonical MAC must not infer approval from model confidence.

## 14. TSP / Key / Secret Requirements

TenantSecretProvider remains future-gated for production.

No production secrets may be introduced in P7.2A.

No production secrets may be logged.

Key id and key version may be logged.

Secrets must never be logged.

Tenant secret unavailable must fail closed in enforcement phases.

Unknown key_id and unknown key_version must fail closed in enforcement phases.

No fallback to unkeyed hash is allowed for authorization integrity.

key_id and key_version must survive audit redaction: they are non-secret and must remain
present in audit records after redaction, so the audit trail can name which key was used.

Naming note: the audit field named `verified_at` in §10 corresponds to the rollout record's
`evaluated_at` in [`APPROVAL_MAC_ROLLOUT_CONTRACT.md`](./APPROVAL_MAC_ROLLOUT_CONTRACT.md) §5
(the moment the dual-read evaluation completed); the wiring gate must use one consistent name
per record.

## 15. Migration and Compatibility Plan

P7.2B may introduce shadow_compare only.

P7.2B must not remove the legacy verifier.

P7.2B must not make canonical MAC authoritative.

P7.2B must not enable keyed_mac_enforced.

P7.2B must not enable external actions.

P7.2B must preserve existing approval behavior.

P7.2B must add tests proving existing behavior is unchanged.

## 16. Future P7.2B Wiring Gate Entry Criteria

P7.2A merged into main.

Explicit P7.2B runtime wiring sign-off.

Exact runtime inventory completed.

Canonical field mapping completed.

Legacy verifier authority preserved.

P7.1 utility import points identified.

Audit fields defined.

Rollback mode defined.

Rollout mode default defined as legacy_only.

Tests planned for non-wiring behavior, shadow comparison, mismatch auditing, and rollback.

Additional pre-wiring code-hygiene entry criteria carried forward from the P7.1 audit (each
must be resolved before P7.2B imports the P7.1 utilities into the live approval path; none
is resolved by this docs-only phase):

- The `TenantSecretProvider` name collision must be resolved: the P5E single-argument
  interface in `app/lib/security/tenantSecret.ts` and the P7.1 keyed three-argument
  interface in `app/lib/security/approvalMac/tenantSecretProvider.ts` share the same
  exported name; P7.2B must rename or deprecation-note one so auto-import cannot pick the
  wrong interface on the authorization path.
- The duplicate `constantTimeEqualHex` must be consolidated: it is defined privately in
  `app/lib/security/hash.ts` and exported from
  `app/lib/security/approvalMac/approvalMac.ts`; two constant-time implementations must not
  diverge on the authorization path.
- The `material.algorithm` returned by the provider must be checked at runtime (not only by
  the TypeScript literal type) before it is used to compute a MAC.
- `preview_hash` derivation must be defined before shadow comparison: because `preview_hash`
  is a MAC-bound canonical field with no direct legacy source, a shadow MAC computed against
  a guessed `preview_hash` produces meaningless mismatch noise; its derivation is a P7.2B
  pre-wiring requirement, not a wiring-time guess.
- The `comparison_result` truth table must be defined: P7.2B must specify how each
  (legacy_verifier_result, canonical_mac_result) pair maps to a single `comparison_result`
  value from [`APPROVAL_MAC_ROLLOUT_CONTRACT.md`](./APPROVAL_MAC_ROLLOUT_CONTRACT.md) §9.

## 17. Non-authorization Statement

This ApprovalStore Dual-read Wiring Pre-spec authorizes no runtime wiring, no ApprovalStore behavior change, no approval verification behavior change, no external action execution, no real LLM enablement, no production TenantSecretProvider, no secret storage, no KMS integration, no nonce storage, no key rotation runtime, no keyed MAC enforcement, no deployment, and no automated decision-making.

Enforcement in code is governed by separate, future gates
([`NEXT_CAPABILITY_GATE.md`](./NEXT_CAPABILITY_GATE.md)) with recorded human decisions.
