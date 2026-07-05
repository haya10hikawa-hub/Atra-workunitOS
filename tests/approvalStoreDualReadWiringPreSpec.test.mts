import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { test } from "node:test";

const SPEC_PATH = "docs/APPROVALSTORE_DUAL_READ_WIRING_PRE_SPEC.md";
const CONTRACT_PATH = "docs/APPROVAL_MAC_ROLLOUT_CONTRACT.md";

const spec = existsSync(SPEC_PATH) ? readFileSync(SPEC_PATH, "utf8") : "";
const contract = existsSync(CONTRACT_PATH) ? readFileSync(CONTRACT_PATH, "utf8") : "";

function requireAll(doc: string, label: string, needles: string[]): void {
  for (const needle of needles) {
    assert.ok(doc.includes(needle), `${label} must contain: ${JSON.stringify(needle)}`);
  }
}

test("P7.2A docs exist", () => {
  assert.ok(existsSync(SPEC_PATH), `${SPEC_PATH} must exist`);
  assert.ok(existsSync(CONTRACT_PATH), `${CONTRACT_PATH} must exist`);
  assert.ok(spec.length > 0, "spec doc must be non-empty");
  assert.ok(contract.length > 0, "contract doc must be non-empty");
});

test("PRE_SPEC contains all required sections", () => {
  requireAll(spec, "spec", [
    "## 1. Purpose",
    "## 2. Scope",
    "## 3. Definition of ApprovalStore Dual-read Wiring",
    "## 4. What This Pre-spec Is Not",
    "## 5. Product and Security Invariants",
    "## 6. Existing Runtime Inventory Requirements",
    "## 7. Legacy Hash to Canonical Payload Mapping",
    "## 8. Dual-read Verification Strategy",
    "## 9. Shadow Compare and Enforcement Modes",
    "## 10. Audit and Observability Requirements",
    "## 11. Failure and No-Go Conditions",
    "## 12. Rollback and Feature Flag Requirements",
    "## 13. Four-eyes and Human Approval Boundaries",
    "## 14. TSP / Key / Secret Requirements",
    "## 15. Migration and Compatibility Plan",
    "## 16. Future P7.2B Wiring Gate Entry Criteria",
    "## 17. Non-authorization Statement",
  ]);
});

test("PRE_SPEC contains the definition sentence and Japanese conceptual sentence", () => {
  requireAll(spec, "spec", [
    "ApprovalStore dual-read wiring is a future-gated migration strategy in which legacy approval verification remains authoritative while canonical approval MAC verification is computed in shadow mode for comparison, audit, and safety validation before any enforcement change.",
    "ApprovalStore dual-read wiringとはenforcementではない。既存のapproval verifierをauthoritativeなまま維持しつつ、新しいcanonical approval MAC verifierをshadow modeで計算し、比較・監査・安全検証を行った後にのみ、将来のenforcement変更へ進めるためのfuture-gated migration strategyである。",
  ]);
});

test("PRE_SPEC contains all not-pre-spec items", () => {
  requireAll(spec, "spec", [
    "- runtime wiring\n",
    "- ApprovalStore behavior change\n",
    "- approval verification behavior change\n",
    "- external action enablement\n",
    "- real LLM enablement\n",
    "- production TenantSecretProvider implementation\n",
    "- secret storage\n",
    "- KMS integration\n",
    "- nonce storage\n",
    "- key rotation runtime\n",
    "- approval authorization\n",
    "- execution authorization\n",
    "- deployment approval\n",
  ]);
});

test("PRE_SPEC contains product and security invariants", () => {
  requireAll(spec, "spec", [
    "AI proposes. Rules guard. Humans decide.",
    "Approval MAC is not approval.",
    "Dual-read is not enforcement.",
    "Shadow compare is not authorization.",
    "Preview is not approval.",
    "Approval is not execution.",
    "Model confidence cannot authorize approval.",
    "Client-provided approvedByPm must not be trusted.",
    "Client-provided approval state must not be trusted.",
    "Four-eyes requirements must not be weakened.",
    "Self-approval bypass is No-Go.",
  ]);
});

test("PRE_SPEC contains existing runtime inventory requirements", () => {
  requireAll(spec, "spec", [
    "Before P7.2B wiring, the implementer must identify and document the exact existing runtime files for ApprovalStore, approval preview binding, hash binding verification, external action gating, audit logging, and P7.1 approval MAC utilities.",
    "Before P7.2B wiring, the implementer must confirm whether P7.1 utilities are imported anywhere in the live approval path.",
    "Before P7.2B wiring, the implementer must confirm that external actions remain disabled by default.",
    "Before P7.2B wiring, the implementer must confirm that real LLM remains disabled unless separately enabled by an approved gate.",
  ]);
});

test("PRE_SPEC contains legacy hash to canonical payload mapping rules", () => {
  requireAll(spec, "spec", [
    "The future wiring gate must map existing approval preview / target / payload / work unit / actor / tenant data to every required Canonical Approval Payload field.",
    "The mapping must explicitly address legacy `workUnitId` and its relationship to `source_formal_workunit_id` or `source_workunit_candidate_id`.",
    "The mapping must explicitly address legacy preview hash, target hash, and payload hash.",
    "The mapping must explicitly address actor and tenant scope.",
    "Any unmapped required canonical field is No-Go for P7.2B runtime wiring.",
    "Any ambiguous mapping between legacy hash fields and canonical fields is No-Go for enforcement.",
  ]);
});

test("PRE_SPEC contains all canonical payload fields", () => {
  requireAll(spec, "spec", [
    "- canonical_payload_version\n",
    "- approval_request_id\n",
    "- tenant_id\n",
    "- actor_id\n",
    "- actor_role\n",
    "- action_preview_id\n",
    "- operation\n",
    "- target_system\n",
    "- target_identifier\n",
    "- target_hash\n",
    "- payload_hash\n",
    "- payload_redaction_state\n",
    "- preview_hash\n",
    "- risk_level\n",
    "- human_review_required\n",
    "- source_workunit_candidate_id\n",
    "- source_formal_workunit_id\n",
    "- source_action_field_id\n",
    "- source_decision_record_id\n",
    "- created_at\n",
    "- expires_at\n",
    "- nonce\n",
    "- idempotency_key\n",
    "- key_id\n",
    "- key_version\n",
    "- hash_algorithm\n",
    "- canonicalization_algorithm\n",
    "- approval_scope\n",
    "- no_go_flags\n",
  ]);
});

test("PRE_SPEC contains dual-read verification strategy", () => {
  requireAll(spec, "spec", [
    "The existing legacy verifier remains authoritative during shadow mode.",
    "The canonical approval MAC verifier is computed in shadow mode only.",
    "Shadow-mode canonical MAC mismatch must not change user-visible approval behavior.",
    "Shadow-mode canonical MAC mismatch must be auditable.",
    "Shadow-mode canonical MAC success must be auditable.",
    "Legacy verifier failure must continue to fail according to existing behavior.",
    "Canonical MAC failure in shadow mode must not enable execution.",
    "Canonical MAC success in shadow mode must not authorize execution.",
    "A future enforcement phase requires a separate gate.",
  ]);
});

test("PRE_SPEC contains rollout modes and first-wiring eligibility statement", () => {
  requireAll(spec, "spec", [
    "- legacy_only\n",
    "- shadow_compare\n",
    "- dual_read_warn\n",
    "- dual_read_block_candidate\n",
    "- keyed_mac_enforced\n",
    "Only legacy_only and shadow_compare are eligible for first P7.2B runtime wiring.",
    "dual_read_warn, dual_read_block_candidate, and keyed_mac_enforced require later gates.",
    "keyed_mac_enforced must not be enabled in P7.2B.",
  ]);
});

test("PRE_SPEC contains audit and observability requirements", () => {
  requireAll(spec, "spec", [
    "Future dual-read attempts must be auditable.",
    "Future shadow comparison success must be auditable.",
    "Future shadow comparison mismatch must be auditable.",
    "Future provider failure must be auditable.",
    "Future unknown key_id and unknown key_version must be auditable.",
    "Future audit records must not contain secrets.",
    "Future audit records must include tenant_id, approval_request_id, action_preview_id, operation, target_hash, payload_hash, preview_hash, key_id, key_version, legacy_verifier_result, canonical_mac_result, comparison_result, rollout_mode, and verified_at.",
  ]);
});

test("PRE_SPEC contains all failure and No-Go conditions", () => {
  requireAll(spec, "spec", [
    "- missing_runtime_inventory\n",
    "- missing_canonical_field_mapping\n",
    "- ambiguous_workunit_mapping\n",
    "- missing_tenant_mapping\n",
    "- missing_actor_mapping\n",
    "- missing_preview_mapping\n",
    "- missing_target_mapping\n",
    "- missing_payload_mapping\n",
    "- unmapped_required_canonical_field\n",
    "- p7_1_utilities_not_present\n",
    "- p7_1_utilities_modified_without_reason\n",
    "- approvalstore_behavior_change\n",
    "- approval_verification_behavior_change\n",
    "- external_action_behavior_change\n",
    "- external_action_enabled\n",
    "- real_llm_enabled\n",
    "- client_provided_approval_state_trusted\n",
    "- approvedByPm_trusted\n",
    "- self_approval_bypass\n",
    "- four_eyes_weakened\n",
    "- shadow_mismatch_used_for_execution\n",
    "- canonical_mac_success_used_as_approval\n",
    "- keyed_mac_enforced_without_gate\n",
    "- secrets_logged\n",
    "- tenant_secret_unavailable_allowed\n",
    "- unknown_key_allowed\n",
    "- rollback_missing\n",
  ]);
});

test("PRE_SPEC contains rollback and feature flag requirements", () => {
  requireAll(spec, "spec", [
    "Future wiring must be controlled by an explicit rollout mode.",
    "Future rollout mode must default to legacy_only.",
    "Future shadow_compare must be reversible without data migration.",
    "Future rollback must restore legacy_only behavior.",
    "Future rollback must not delete approval records.",
    "Future rollback must not enable external actions.",
    "Future rollback must not trust client approval state.",
    "Future feature flags must not be client-controlled.",
  ]);
});

test("PRE_SPEC contains four-eyes and human approval boundaries", () => {
  requireAll(spec, "spec", [
    "Four-eyes requirements must remain intact.",
    "Self-approval bypass is No-Go.",
    "Canonical MAC must not replace human approval.",
    "Canonical MAC must not lower human_review_required.",
    "Canonical MAC must not infer approval from preview generation.",
    "Canonical MAC must not infer approval from model confidence.",
  ]);
});

test("PRE_SPEC contains TSP / key / secret requirements", () => {
  requireAll(spec, "spec", [
    "TenantSecretProvider remains future-gated for production.",
    "No production secrets may be introduced in P7.2A.",
    "No production secrets may be logged.",
    "Key id and key version may be logged.",
    "Secrets must never be logged.",
    "Tenant secret unavailable must fail closed in enforcement phases.",
    "Unknown key_id and unknown key_version must fail closed in enforcement phases.",
    "No fallback to unkeyed hash is allowed for authorization integrity.",
  ]);
});

test("PRE_SPEC contains future P7.2B entry criteria", () => {
  requireAll(spec, "spec", [
    "P7.2A merged into main.",
    "Explicit P7.2B runtime wiring sign-off.",
    "Exact runtime inventory completed.",
    "Canonical field mapping completed.",
    "Legacy verifier authority preserved.",
    "P7.1 utility import points identified.",
    "Audit fields defined.",
    "Rollback mode defined.",
    "Rollout mode default defined as legacy_only.",
    "Tests planned for non-wiring behavior, shadow comparison, mismatch auditing, and rollback.",
  ]);
});

test("PRE_SPEC contains the non-authorization statement", () => {
  requireAll(spec, "spec", [
    "This ApprovalStore Dual-read Wiring Pre-spec authorizes no runtime wiring, no ApprovalStore behavior change, no approval verification behavior change, no external action execution, no real LLM enablement, no production TenantSecretProvider, no secret storage, no KMS integration, no nonce storage, no key rotation runtime, no keyed MAC enforcement, no deployment, and no automated decision-making.",
  ]);
});

test("ROLLOUT_CONTRACT contains all required sections", () => {
  requireAll(contract, "contract", [
    "## 1. Purpose",
    "## 2. Scope",
    "## 3. Definition of Approval MAC Rollout Contract",
    "## 4. What This Contract Is Not",
    "## 5. Required Rollout Fields",
    "## 6. Rollout Modes",
    "## 7. Verifier Authority Rules",
    "## 8. Legacy-to-Canonical Mapping Requirements",
    "## 9. Shadow Comparison Result Contract",
    "## 10. Audit Event Contract",
    "## 11. Rollback Contract",
    "## 12. Human Approval and Four-eyes Requirements",
    "## 13. Secret and Key Handling Requirements",
    "## 14. Validation Rules",
    "## 15. Failure and No-Go Conditions",
    "## 16. Pass / Warn / Fail / No-Go Outcomes",
    "## 17. Non-authorization Statement",
  ]);
});

test("ROLLOUT_CONTRACT contains the definition sentence and Japanese conceptual sentence", () => {
  requireAll(contract, "contract", [
    "The Approval MAC Rollout Contract defines how legacy approval verification and canonical approval MAC verification may be compared during future shadow rollout without changing approval behavior or authorizing execution.",
    "Approval MAC Rollout Contractとは、将来のshadow rolloutにおいてlegacy approval verificationとcanonical approval MAC verificationを比較する方法を定義するが、approval behaviorを変更せず、executionも認可しないcontractである。",
  ]);
});

test("ROLLOUT_CONTRACT contains all not-contract items", () => {
  requireAll(contract, "contract", [
    "- runtime implementation\n",
    "- ApprovalStore integration\n",
    "- approval behavior change\n",
    "- approval authorization\n",
    "- execution authorization\n",
    "- external action enablement\n",
    "- real LLM enablement\n",
    "- production secret storage\n",
    "- key rotation runtime\n",
    "- deployment approval\n",
  ]);
});

test("ROLLOUT_CONTRACT contains all required rollout fields", () => {
  requireAll(contract, "contract", [
    "- rollout_id\n",
    "- rollout_mode\n",
    "- tenant_id\n",
    "- approval_request_id\n",
    "- action_preview_id\n",
    "- operation\n",
    "- target_hash\n",
    "- payload_hash\n",
    "- preview_hash\n",
    "- legacy_verifier_result\n",
    "- canonical_mac_result\n",
    "- comparison_result\n",
    "- canonical_payload_mapping_status\n",
    "- p7_1_utility_version\n",
    "- key_id\n",
    "- key_version\n",
    "- audit_event_id\n",
    "- rollback_mode\n",
    "- human_review_required\n",
    "- four_eyes_required\n",
    "- self_approval_blocked\n",
    "- created_at\n",
    "- evaluated_at\n",
    "- no_go_flags\n",
  ]);
});

test("ROLLOUT_CONTRACT contains all rollout modes and mode semantics", () => {
  requireAll(contract, "contract", [
    "- legacy_only\n",
    "- shadow_compare\n",
    "- dual_read_warn\n",
    "- dual_read_block_candidate\n",
    "- keyed_mac_enforced\n",
    "legacy_only means only the legacy verifier is evaluated.",
    "shadow_compare means the legacy verifier remains authoritative while canonical MAC is computed for comparison.",
    "dual_read_warn means canonical mismatch may produce warning only and requires a later gate.",
    "dual_read_block_candidate means canonical mismatch may block candidate approval only after a later gate.",
    "keyed_mac_enforced means canonical MAC becomes authoritative only after a later enforcement gate.",
    "P7.2B may only implement legacy_only and shadow_compare.",
  ]);
});

test("ROLLOUT_CONTRACT contains verifier authority rules", () => {
  requireAll(contract, "contract", [
    "legacy verifier remains authoritative in legacy_only.",
    "legacy verifier remains authoritative in shadow_compare.",
    "canonical MAC success must not authorize approval in shadow_compare.",
    "canonical MAC failure must not by itself change behavior in shadow_compare.",
    "canonical MAC mismatch must not enable execution.",
    "keyed_mac_enforced requires a later gate.",
  ]);
});

test("ROLLOUT_CONTRACT contains legacy-to-canonical mapping requirements", () => {
  requireAll(contract, "contract", [
    "All required Canonical Approval Payload fields must be mapped before runtime wiring.",
    "Mapping must identify source for tenant_id, actor_id, actor_role, action_preview_id, operation, target_system, target_identifier, target_hash, payload_hash, preview_hash, risk_level, human_review_required, source_workunit_candidate_id, source_formal_workunit_id, source_action_field_id, source_decision_record_id, expires_at, nonce, idempotency_key, key_id, and key_version.",
    "Unmapped fields are No-Go for runtime wiring.",
    "Ambiguous workUnitId mapping is No-Go for enforcement.",
  ]);
});

test("ROLLOUT_CONTRACT contains shadow comparison result values", () => {
  requireAll(contract, "contract", [
    "- not_evaluated\n",
    "- match\n",
    "- mismatch\n",
    "- canonical_unavailable\n",
    "- legacy_failed\n",
    "- both_failed\n",
    "- invalid_mapping\n",
    "- no_go\n",
  ]);
});

test("ROLLOUT_CONTRACT contains audit event contract", () => {
  requireAll(contract, "contract", [
    "Audit event must not contain secrets.",
    "Audit event must include rollout_mode.",
    "Audit event must include legacy_verifier_result.",
    "Audit event must include canonical_mac_result.",
    "Audit event must include comparison_result.",
    "Audit event must include key_id and key_version.",
    "Audit event must include tenant_id and approval_request_id.",
    "Audit event must include failure reason without exposing secrets.",
  ]);
});

test("ROLLOUT_CONTRACT contains rollback contract", () => {
  requireAll(contract, "contract", [
    "Rollback must return rollout_mode to legacy_only.",
    "Rollback must not delete existing approval records.",
    "Rollback must not enable external actions.",
    "Rollback must not trust client-provided approval state.",
    "Rollback must be possible without database migration in first wiring phase.",
  ]);
});

test("ROLLOUT_CONTRACT contains human approval and four-eyes requirements", () => {
  requireAll(contract, "contract", [
    "Canonical MAC must not replace human approval.",
    "Canonical MAC must not replace four-eyes review.",
    "Canonical MAC must not allow self-approval.",
    "Canonical MAC must not lower human_review_required.",
    "Model confidence must not reduce approval requirements.",
  ]);
});

test("ROLLOUT_CONTRACT contains secret and key handling requirements", () => {
  requireAll(contract, "contract", [
    "No production secrets in P7.2A.",
    "No secret logging.",
    "No fallback to unkeyed hash for authorization integrity.",
    "Unknown key_id must fail closed in enforcement phases.",
    "Unknown key_version must fail closed in enforcement phases.",
    "Tenant secret unavailable must fail closed in enforcement phases.",
  ]);
});

test("ROLLOUT_CONTRACT contains validation rules", () => {
  requireAll(contract, "contract", [
    "A valid rollout contract must define rollout modes.",
    "A valid rollout contract must define verifier authority per mode.",
    "A valid rollout contract must define legacy-to-canonical mapping requirements.",
    "A valid rollout contract must define shadow comparison results.",
    "A valid rollout contract must define audit fields.",
    "A valid rollout contract must define rollback behavior.",
    "A valid rollout contract must preserve human approval and four-eyes boundaries.",
    "A valid rollout contract must not authorize execution.",
  ]);
});

test("ROLLOUT_CONTRACT contains failure and No-Go conditions", () => {
  requireAll(contract, "contract", [
    "- missing_rollout_mode\n",
    "- unknown_rollout_mode\n",
    "- missing_verifier_authority_rule\n",
    "- missing_legacy_to_canonical_mapping\n",
    "- unmapped_canonical_field\n",
    "- ambiguous_workunit_mapping\n",
    "- missing_shadow_comparison_result\n",
    "- missing_audit_event_contract\n",
    "- secrets_in_audit_event\n",
    "- rollback_missing\n",
    "- external_action_enabled\n",
    "- real_llm_enabled\n",
    "- canonical_mac_authoritative_in_shadow\n",
    "- keyed_mac_enforced_without_gate\n",
    "- human_approval_replaced\n",
    "- four_eyes_weakened\n",
    "- self_approval_allowed\n",
    "- client_approval_state_trusted\n",
  ]);
});

test("ROLLOUT_CONTRACT contains Pass / Warn / Fail / No-Go outcomes and non-authorization statement", () => {
  requireAll(contract, "contract", [
    "The rollout contract preserves legacy verifier authority, defines canonical MAC shadow comparison, maps required canonical fields, preserves human approval and four-eyes boundaries, defines audit and rollback expectations, and does not authorize execution.",
    "The rollout contract is non-authorizing, but mapping, audit, rollback, or rollout-mode details need clarification before runtime wiring.",
    "Required rollout fields or documentation are missing, but no hard safety boundary is crossed.",
    "A hard safety boundary is violated, such as external action enablement, real LLM enablement, canonical MAC enforcement without a later gate, client approval state trust, self-approval bypass, weakened four-eyes review, secret logging, or execution authorization.",
    "This Approval MAC Rollout Contract authorizes no runtime implementation, no ApprovalStore integration, no approval behavior change, no approval authorization, no execution authorization, no external action execution, no real LLM enablement, no production secret storage, no key rotation runtime, no deployment, and no automated decision-making.",
  ]);
});
