import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { test } from "node:test";

const SPEC_PATH = "docs/CANONICAL_APPROVAL_PAYLOAD_SPEC.md";
const CLOSURE_PATH = "docs/TSP_DESIGN_REVIEW_CLOSURE.md";

const spec = existsSync(SPEC_PATH) ? readFileSync(SPEC_PATH, "utf8") : "";
const closure = existsSync(CLOSURE_PATH) ? readFileSync(CLOSURE_PATH, "utf8") : "";

function requireAll(doc: string, label: string, needles: string[]): void {
  for (const needle of needles) {
    assert.ok(doc.includes(needle), `${label} must contain: ${JSON.stringify(needle)}`);
  }
}

test("P7.0 docs exist", () => {
  assert.ok(existsSync(SPEC_PATH), `${SPEC_PATH} must exist`);
  assert.ok(existsSync(CLOSURE_PATH), `${CLOSURE_PATH} must exist`);
  assert.ok(spec.length > 0, "spec doc must be non-empty");
  assert.ok(closure.length > 0, "closure doc must be non-empty");
});

test("CANONICAL_APPROVAL_PAYLOAD_SPEC contains all required sections", () => {
  requireAll(spec, "spec", [
    "## 1. Purpose",
    "## 2. Scope",
    "## 3. Definition of Canonical Approval Payload",
    "## 4. What Canonical Approval Payload Is Not",
    "## 5. Payload Principles",
    "## 6. Required Fields",
    "## 7. Canonicalization Rules",
    "## 8. Hashing and Keying Requirements",
    "## 9. Tenant Scope and Actor Binding",
    "## 10. Operation, Target, and Payload Binding",
    "## 11. Preview, Risk, and Human Review Binding",
    "## 12. Expiry, Nonce, and Replay Resistance",
    "## 13. Audit and Verification Expectations",
    "## 14. Failure and No-Go Conditions",
    "## 15. Relationship to ApprovalStore / TenantSecretProvider / External Actions",
    "## 16. Future Implementation Requirements",
    "## 17. Non-authorization Statement",
  ]);
});

test("CANONICAL_APPROVAL_PAYLOAD_SPEC contains the definition sentence and Japanese conceptual sentence", () => {
  requireAll(spec, "spec", [
    "The Canonical Approval Payload is a deterministic, tenant-scoped, immutable review payload that binds a human approval decision to the exact operation, target, payload, actor, tenant, preview, expiry, nonce, and lineage that were reviewed.",
    "Canonical Approval Payloadとはapprovalそのものではない。人間のapproval decisionを、レビューされたoperation・target・payload・actor・tenant・preview・expiry・nonce・lineageに正確に結びつけるための、deterministic・tenant-scoped・immutableなreview payloadである。",
  ]);
});

test("CANONICAL_APPROVAL_PAYLOAD_SPEC contains all not-payload items", () => {
  requireAll(spec, "spec", [
    "- approval\n",
    "- execution authorization\n",
    "- external action execution\n",
    "- server-side approval verification by itself\n",
    "- TenantSecretProvider implementation\n",
    "- secret storage\n",
    "- HMAC implementation\n",
    "- runtime ApprovalStore change\n",
    "- human approval replacement\n",
    "- LLM permission\n",
    "- model confidence\n",
    "- audit log by itself\n",
    "- evidence by itself\n",
  ]);
});

test("CANONICAL_APPROVAL_PAYLOAD_SPEC contains all required fields", () => {
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

test("CANONICAL_APPROVAL_PAYLOAD_SPEC contains canonicalization rules", () => {
  requireAll(spec, "spec", [
    "Canonicalization must be deterministic.",
    "Canonicalization must use a documented field order.",
    "Canonicalization must preserve explicit nulls.",
    "Canonicalization must distinguish missing fields from null fields.",
    "Canonicalization must normalize string encoding.",
    "Canonicalization must normalize timestamp format.",
    "Canonicalization must reject unknown critical fields.",
    "Canonicalization must not include mutable display-only fields.",
    "Canonicalization must not depend on object insertion order.",
    "Canonicalization must be stable across runtimes.",
  ]);
});

test("CANONICAL_APPROVAL_PAYLOAD_SPEC contains hashing and keying requirements", () => {
  requireAll(spec, "spec", [
    "Approval integrity must use a keyed construction such as HMAC-SHA-256 or an equivalent reviewed keyed MAC.",
    "Unkeyed SHA-256 must not be sufficient for approval authorization integrity.",
    "The approval hash must be bound to tenant_id.",
    "The approval hash must be bound to operation.",
    "The approval hash must be bound to target_hash.",
    "The approval hash must be bound to payload_hash.",
    "The approval hash must be bound to preview_hash.",
    "The approval hash must be bound to expires_at.",
    "The approval hash must be bound to nonce.",
    "The approval hash must be bound to key_id and key_version.",
    "Verification must fail closed when a tenant secret is unavailable.",
    "Verification must fail closed when key_id or key_version is unknown.",
    "Verification comparison must use constant-time comparison in a future runtime implementation.",
  ]);
});

test("CANONICAL_APPROVAL_PAYLOAD_SPEC contains tenant scope and actor binding rules", () => {
  requireAll(spec, "spec", [
    "tenant_id is required.",
    "actor_id is required.",
    "actor_role is required.",
    "approval_scope is required.",
    "Cross-tenant approval payloads are No-Go.",
    "Client-provided tenant scope must not be trusted by itself.",
    "Client-provided approvedByPm must not be trusted.",
  ]);
});

test("CANONICAL_APPROVAL_PAYLOAD_SPEC contains operation, target, and payload binding rules", () => {
  requireAll(spec, "spec", [
    "operation is required.",
    "target_system is required.",
    "target_identifier is required.",
    "target_hash is required.",
    "payload_hash is required.",
    "preview_hash is required.",
    "Any mismatch between reviewed preview and execution payload is No-Go.",
    "Any mismatch between target_hash and requested target is No-Go.",
    "Any mismatch between payload_hash and requested payload is No-Go.",
  ]);
});

test("CANONICAL_APPROVAL_PAYLOAD_SPEC contains preview, risk, and human review binding rules", () => {
  requireAll(spec, "spec", [
    "action_preview_id is required.",
    "risk_level is required.",
    "human_review_required is required.",
    "human_review_required must not be lowered by the model.",
    "LLM confidence must not reduce human review requirements.",
    "Approval cannot be inferred from preview generation.",
  ]);
});

test("CANONICAL_APPROVAL_PAYLOAD_SPEC contains expiry, nonce, and replay resistance rules", () => {
  requireAll(spec, "spec", [
    "expires_at is required.",
    "nonce is required.",
    "idempotency_key is required.",
    "Expired approval payloads are No-Go.",
    "Reused nonce is No-Go.",
    "Replay across tenants is No-Go.",
    "Replay across operations is No-Go.",
    "Replay across targets is No-Go.",
  ]);
});

test("CANONICAL_APPROVAL_PAYLOAD_SPEC contains audit and verification expectations", () => {
  requireAll(spec, "spec", [
    "Verification attempt must be auditable in a future runtime implementation.",
    "Verification success must be auditable in a future runtime implementation.",
    "Verification failure must be auditable in a future runtime implementation.",
    "Audit records must not contain secrets.",
    "Audit records must include tenant_id, approval_request_id, action_preview_id, operation, target_hash, payload_hash, key_id, key_version, verification outcome, and verified_at.",
  ]);
});

test("CANONICAL_APPROVAL_PAYLOAD_SPEC contains all failure and No-Go conditions", () => {
  requireAll(spec, "spec", [
    "- missing_tenant_id\n",
    "- missing_actor_id\n",
    "- missing_operation\n",
    "- missing_target_hash\n",
    "- missing_payload_hash\n",
    "- missing_preview_hash\n",
    "- missing_expires_at\n",
    "- missing_nonce\n",
    "- missing_key_id\n",
    "- missing_key_version\n",
    "- unknown_key_id\n",
    "- unknown_key_version\n",
    "- tenant_secret_unavailable\n",
    "- expired_payload\n",
    "- nonce_reuse\n",
    "- cross_tenant_replay\n",
    "- operation_mismatch\n",
    "- target_mismatch\n",
    "- payload_mismatch\n",
    "- preview_mismatch\n",
    "- unkeyed_hash_for_authorization\n",
    "- client_provided_approval_state\n",
    "- approvedByPm_trusted\n",
    "- model_confidence_as_approval\n",
    "- human_review_requirement_lowered\n",
  ]);
});

test("CANONICAL_APPROVAL_PAYLOAD_SPEC contains future implementation requirements and the non-authorization statement", () => {
  requireAll(spec, "spec", [
    "Future runtime implementation must use TenantSecretProvider.",
    "Future runtime implementation must use a keyed MAC.",
    "Future runtime implementation must fail closed when secrets or key metadata are unavailable.",
    "Future runtime implementation must use constant-time comparison.",
    "Future runtime implementation must audit verification attempts.",
    "Future runtime implementation must preserve approval payload immutability.",
    "Future runtime implementation must not log secrets.",
    "Future runtime implementation must not enable external actions without a separate external-action enablement gate.",
    "This Canonical Approval Payload Spec authorizes no approval, no execution authorization, no external action execution, no runtime ApprovalStore change, no TenantSecretProvider implementation, no secret storage, no HMAC implementation, no real LLM enablement, no external execution, no deployment, and no automated decision-making.",
  ]);
});

test("TSP_DESIGN_REVIEW_CLOSURE contains all required sections", () => {
  requireAll(closure, "closure", [
    "## 1. Purpose",
    "## 2. Scope",
    "## 3. Definition of TenantSecretProvider Design-review Closure",
    "## 4. What This Closure Is Not",
    "## 5. Closure Principles",
    "## 6. Security Requirements",
    "## 7. Tenant Key Scope Requirements",
    "## 8. Key Identity, Versioning, and Rotation Requirements",
    "## 9. Secret Retrieval and Failure-mode Requirements",
    "## 10. Approval Hash Verification Requirements",
    "## 11. Audit and Observability Requirements",
    "## 12. Threat Model Closure",
    "## 13. Open Risks and Future Implementation Gates",
    "## 14. Failure and No-Go Conditions",
    "## 15. Relationship to Canonical Approval Payload / ApprovalStore / External Actions",
    "## 16. Closure Decision",
    "## 17. Non-authorization Statement",
  ]);
});

test("TSP_DESIGN_REVIEW_CLOSURE contains the closure definition sentence and Japanese conceptual sentences", () => {
  requireAll(closure, "closure", [
    "TenantSecretProvider design-review closure confirms the security requirements for future tenant-scoped keyed approval hashing, but it does not implement secret retrieval, key storage, HMAC, ApprovalStore changes, or external action execution.",
    "TenantSecretProvider design-review closureとはsecret retrievalの実装ではない。approval hashをkeyedかつtenant-scopedなauthorization integrity checkとして扱う前に満たすべきsecurity requirementsを確定することである。",
    "TenantSecretProvider design-review closureとはsecret retrievalの実装ではない。将来のtenant-scoped keyed approval hashingに必要なsecurity requirementsを確認するが、key storage・HMAC・ApprovalStore変更・external action executionは実装しない。",
  ]);
});

test("TSP_DESIGN_REVIEW_CLOSURE contains all not-closure items", () => {
  requireAll(closure, "closure", [
    "- TenantSecretProvider implementation\n",
    "- secret storage\n",
    "- KMS integration\n",
    "- HMAC implementation\n",
    "- ApprovalStore runtime change\n",
    "- external action enablement\n",
    "- real LLM enablement\n",
    "- deployment approval\n",
    "- production readiness by itself\n",
    "- security signoff for execution by itself\n",
  ]);
});

test("TSP_DESIGN_REVIEW_CLOSURE contains security requirements", () => {
  requireAll(closure, "closure", [
    "Tenant secrets must be tenant-scoped.",
    "Tenant secrets must not be client-provided.",
    "Tenant secrets must not be logged.",
    "Tenant secrets must not be exposed to the LLM.",
    "Tenant secrets must not be stored in plaintext application logs.",
    "Tenant secrets must not be embedded in source code.",
    "Approval hash verification must fail closed if the tenant secret is unavailable.",
    "Approval hash verification must fail closed if key metadata is invalid.",
    "Unkeyed SHA-256 must not be accepted as authorization integrity.",
    "Keyed MAC verification must be required before approval hashes can authorize future external action execution.",
  ]);
});

test("TSP_DESIGN_REVIEW_CLOSURE contains tenant key scope requirements", () => {
  requireAll(closure, "closure", [
    "Each tenant must have an independent secret scope.",
    "Cross-tenant key reuse is No-Go unless explicitly reviewed and documented as safe.",
    "A tenant key must not validate another tenant's approval payload.",
    "Tenant id must be part of the canonical approval payload.",
    "Tenant id must be bound into the keyed MAC input.",
  ]);
});

test("TSP_DESIGN_REVIEW_CLOSURE contains key identity, versioning, and rotation requirements", () => {
  requireAll(closure, "closure", [
    "key_id is required.",
    "key_version is required.",
    "Key rotation must be supported by design.",
    "Old keys must have an explicit verification window.",
    "Revoked keys must fail closed.",
    "Unknown key_id is No-Go.",
    "Unknown key_version is No-Go.",
  ]);
});

test("TSP_DESIGN_REVIEW_CLOSURE contains secret retrieval and failure-mode requirements", () => {
  requireAll(closure, "closure", [
    "Secret retrieval failure must fail closed.",
    "Secret provider timeout must fail closed.",
    "Secret provider ambiguity must fail closed.",
    "Missing tenant binding must fail closed.",
    "Missing key metadata must fail closed.",
    "No fallback to unkeyed hashing is allowed.",
    "No fallback to client-provided secrets is allowed.",
  ]);
});

test("TSP_DESIGN_REVIEW_CLOSURE contains approval hash verification requirements", () => {
  requireAll(closure, "closure", [
    "Verification must use a keyed MAC.",
    "Verification must use canonical payload bytes.",
    "Verification must include tenant_id, operation, target_hash, payload_hash, preview_hash, expires_at, nonce, key_id, and key_version.",
    "Verification must use constant-time comparison in future runtime implementation.",
    "Verification must reject expired payloads.",
    "Verification must reject replayed nonces.",
    "Verification must reject mismatched target or payload hashes.",
  ]);
});

test("TSP_DESIGN_REVIEW_CLOSURE contains audit and observability requirements", () => {
  requireAll(closure, "closure", [
    "Verification attempts must be auditable.",
    "Verification success must be auditable.",
    "Verification failure must be auditable.",
    "Key id and key version may be logged.",
    "Secrets must never be logged.",
    "Audit records must include failure reasons without exposing secrets.",
  ]);
});

test("TSP_DESIGN_REVIEW_CLOSURE contains threat model closure items", () => {
  requireAll(closure, "closure", [
    "Replay attack",
    "Cross-tenant replay",
    "Payload substitution",
    "Target substitution",
    "Preview substitution",
    "Client-provided approval state",
    "approvedByPm trust bypass",
    "Unkeyed hash forgery or recomputation",
    "Secret unavailability",
    "Key rotation and revoked keys",
    "LLM confidence bypass",
  ]);
});

test("TSP_DESIGN_REVIEW_CLOSURE contains open risks and future implementation gates", () => {
  requireAll(closure, "closure", [
    "Runtime TenantSecretProvider implementation remains future-gated.",
    "Runtime HMAC verification remains future-gated.",
    "Runtime nonce replay storage remains future-gated.",
    "Runtime key rotation remains future-gated.",
    "Runtime ApprovalStore integration remains future-gated.",
    "External action enablement remains future-gated.",
    "Real LLM enablement remains future-gated.",
  ]);
});

test("TSP_DESIGN_REVIEW_CLOSURE contains all failure and No-Go conditions", () => {
  requireAll(closure, "closure", [
    "- tenant_secret_unavailable\n",
    "- tenant_secret_client_provided\n",
    "- tenant_secret_logged\n",
    "- secret_exposed_to_llm\n",
    "- missing_key_id\n",
    "- missing_key_version\n",
    "- unknown_key_id\n",
    "- unknown_key_version\n",
    "- revoked_key\n",
    "- missing_tenant_binding\n",
    "- cross_tenant_key_validation\n",
    "- unkeyed_hash_fallback\n",
    "- client_provided_secret_fallback\n",
    "- expired_payload\n",
    "- replayed_nonce\n",
    "- target_hash_mismatch\n",
    "- payload_hash_mismatch\n",
    "- preview_hash_mismatch\n",
    "- approvedByPm_trusted\n",
    "- model_confidence_as_approval\n",
  ]);
});

test("TSP_DESIGN_REVIEW_CLOSURE contains the closure decision and the non-authorization statement", () => {
  requireAll(closure, "closure", [
    "TenantSecretProvider design-review is closed only at the documentation and requirements level.",
    "TenantSecretProvider is not implemented by this phase.",
    "Approval hash verification is not changed by this phase.",
    "External actions remain disabled unless a later implementation and enablement gate explicitly changes that state.",
    "This TSP Design Review Closure authorizes no TenantSecretProvider implementation, no secret storage, no KMS integration, no HMAC implementation, no ApprovalStore runtime change, no approval verification runtime change, no external action enablement, no real LLM enablement, no deployment, and no automated decision-making.",
  ]);
});
