# P7.1 TSP Minimal Runtime Implementation

**Phase:** P7.1 (security lane). **Baseline:** `main` @ `fcc67a1`. **Sign-off:**
[`P7_1_RUNTIME_SECURITY_SIGNOFF.md`](./P7_1_RUNTIME_SECURITY_SIGNOFF.md) (recorded before
runtime code).

Implements the isolated, non-wired runtime utilities required by
[`CANONICAL_APPROVAL_PAYLOAD_SPEC.md`](../CANONICAL_APPROVAL_PAYLOAD_SPEC.md) and
[`TSP_DESIGN_REVIEW_CLOSURE.md`](../TSP_DESIGN_REVIEW_CLOSURE.md). First runtime security
code of the project; behavioral tests land with the code.

---

## 1. Purpose

Give the future ApprovalStore-integration gate concrete, tested building blocks — canonical
serialization, a keyed tenant secret interface, keyed MAC computation, and fail-closed
verification — without touching the live approval path. Risk Register R4 (live unkeyed
SHA-256 binding) remains open until a separately approved wiring gate.

- P7.1 implements isolated utilities only.
- P7.1 does not wire into ApprovalStore.
- P7.1 does not change approval verification runtime behavior.
- P7.1 does not enable external actions.
- P7.1 does not enable real LLM.
- P7.1 does not store real secrets.
- P7.1 does not implement nonce storage.
- P7.1 does not implement key rotation runtime.
- P7.1 does not implement KMS.
- P7.1 does not implement production TenantSecretProvider.
- P7.1 does not authorize approval execution.
- P7.1 does not authorize external execution.

## 2. Scope

Runtime files added (all new; no existing runtime file modified):

- `app/lib/security/approvalMac/canonicalApprovalPayload.ts`
- `app/lib/security/approvalMac/tenantSecretProvider.ts`
- `app/lib/security/approvalMac/approvalMac.ts`

Test file added:

- `tests/tspMinimalRuntimeGate.test.mts` (31 behavioral assertions)

Docs added:

- `docs/legacy/P7_1_RUNTIME_SECURITY_SIGNOFF.md`
- `docs/legacy/P7_1_TSP_MINIMAL_RUNTIME_IMPLEMENTATION.md` (this file)

The Phase 5E modules `app/lib/security/hash.ts` and `app/lib/security/tenantSecret.ts` are
unchanged; the new keyed `TenantSecretProvider` interface (tenant_id, key_id, key_version)
is the design-level evolution of the P5E single-argument interface, which remains in place
for existing callers.

## 3. Implemented Utilities

- `CanonicalApprovalPayload` type (29 required fields per spec §6)
- `CanonicalApprovalPayloadValidationError` (structured; message is `code:field` only)
- `canonicalApprovalPayloadFieldOrder` (the documented field order)
- `validateCanonicalApprovalPayload(payload)`
- `canonicalizeApprovalPayload(payload)` → deterministic canonical string
- `TenantSecretProvider` interface (keyed: tenant_id, key_id, key_version)
- `TenantSecretMaterial` type (secret bytes + key_id + key_version + algorithm)
- `createTestTenantSecretProvider(entries)` — test-only in-memory fake
- `computeApprovalMac(payload, provider)` → 64-char lowercase hex HMAC-SHA-256
- `verifyApprovalMac(payload, expectedMac, provider, now?)` → structured result
- `constantTimeEqualHex(a, b)`

## 4. What Is Not Implemented

- ApprovalStore integration (no live-path file imports the new modules)
- external action execution integration
- nonce storage (requirements defined in §12/§15; storage is a future gate)
- production secret storage / real tenant secret retrieval
- KMS integration
- key rotation runtime (window semantics defined in §15; runtime is a future gate)
- database-backed or D1-backed secret provider
- UI changes, API routes, workflow changes, deployment

## 5. Canonicalization Algorithm

Pinned name: **`JCS-RFC8785-INSPIRED-V1`** (checked at validation; any other value fails
with `unsupported_canonicalization_algorithm`).

Definition: deterministic JSON serialization over the explicit ordered field list
`canonicalApprovalPayloadFieldOrder` — not object insertion order. String values are
escaped with `JSON.stringify` semantics; explicit `null` is preserved as JSON `null`;
booleans serialize as `true`/`false`; `no_go_flags` serializes as a JSON string array in
given order; `undefined`, missing fields, and unknown top-level fields are rejected;
mutable display-only fields are therefore rejected if present. Output is a UTF-8 string
suitable as the HMAC input. No dependencies were added.

## 6. Field Type and Format Rules

All 29 fields are required and validated fail-closed:

- string, non-empty: canonical_payload_version, approval_request_id, tenant_id, actor_id,
  actor_role, action_preview_id, operation, target_system, target_identifier,
  payload_redaction_state, risk_level, nonce, idempotency_key, key_id, key_version,
  approval_scope
- 64-character lowercase hex SHA-256 string: target_hash, payload_hash, preview_hash
- ISO-8601 UTC string (`YYYY-MM-DDTHH:MM:SS[.mmm]Z`): created_at, expires_at
- boolean: human_review_required
- string or null: source_workunit_candidate_id, source_formal_workunit_id,
  source_action_field_id, source_decision_record_id
- readonly string array: no_go_flags
- hash_algorithm: exactly `"HMAC-SHA-256"`
- canonicalization_algorithm: exactly `"JCS-RFC8785-INSPIRED-V1"`

## 7. TenantSecretProvider Interface

`resolveTenantSecret(tenant_id, key_id, key_version)` →
`Promise<TenantSecretMaterial | null>`. Returning `null` means "no secret available"; the
callers fail closed (`tenant_secret_unavailable`) — there is no unkeyed fallback and no
client-provided-secret path. The provider abstraction is the only way secret material
reaches the MAC helpers. No environment reads, no I/O, no logging.

## 8. Keyed MAC Helper

`computeApprovalMac` computes HMAC-SHA-256 (Node `crypto.createHmac`, already used by the
repo's Phase 5E helpers — no new dependencies) over the canonical payload string and
returns a 64-char lowercase hex digest. Because tenant_id, operation, target_hash,
payload_hash, preview_hash, expires_at, nonce, key_id, and key_version are canonical
fields, they are all bound into the MAC by construction. There is no unkeyed code path;
unsupported hash/canonicalization algorithms, unavailable secrets, and key metadata
mismatches (`unknown_key_id` / `unknown_key_version`) throw structured errors that carry
no secret or payload values.

## 9. Constant-time Comparison

`constantTimeEqualHex` validates both inputs as 64-char lowercase hex first (returning
`false` on any format violation — uppercase, wrong length, non-hex, non-string), then
delegates to `crypto.timingSafeEqual` over the decoded bytes, so comparison does not
early-return on the first mismatched byte. It never throws to the caller and never logs.

## 10. Verification Helper

`verifyApprovalMac(payload, expectedMac, provider, now?)` — explicit inputs only.
Validation produces a frozen own-property snapshot (each input field read exactly once);
every gate below and the MAC recompute read from that same snapshot, so a getter-bearing
input cannot show an expired `expires_at` / non-empty `no_go_flags` to the MAC while showing
a passing value to the gates (getter-based TOCTOU is closed). Fail-closed order: payload
validation → `no_go_flags` non-empty → expiry (`now >= expires_at`, and a non-finite `now`
or `expires_at` also fails closed) → expected-MAC format → secret resolution → MAC recompute
→ constant-time compare. Returns the structured `ApprovalMacVerificationResult` with
`ok`, `reason`, tenant_id, approval_request_id, key_id, key_version, hash_algorithm, and
canonicalization_algorithm — never secret material. It does not audit to runtime storage,
does not call ApprovalStore, and does not call external actions in this phase.

## 11. Test-only Secret Provider

`createTestTenantSecretProvider` builds an in-memory `(tenant_id, key_id, key_version) →
TenantSecretMaterial` table from injected fake secrets. It is marked test-only in name and
documentation, implements no rotation/storage/retrieval policy, and is the only provider
implementation in the repository. Tests use only fake secrets (e.g.
`test-only-fake-secret-not-real`); no real secret exists anywhere in this phase.

## 12. Failure and No-Go Conditions

Validation and verification reason codes (all fail closed):

- missing_required_field
- unknown_field
- invalid_field_type
- invalid_hash_format
- invalid_timestamp
- unsupported_hash_algorithm
- unsupported_canonicalization_algorithm
- tenant_secret_unavailable
- unknown_key_id
- unknown_key_version
- mac_mismatch
- expired_payload
- no_go_flags_present
- invalid_mac_format

Expired payloads must fail verification. Non-empty no_go_flags must fail verification.
Nonce reuse detection (`nonce_reuse`) requires the future nonce store and is intentionally
NOT a P7.1 reason code — replay rejection beyond expiry is future-gated (§15).

`unknown_key_id` / `unknown_key_version` fire when a provider returns key material whose
metadata does not match the payload. The test-only fake provider instead returns `null` for
an unknown (tenant_id, key_id, key_version) tuple, which surfaces as
`tenant_secret_unavailable` — both are fail-closed; the distinct codes are exercised with a
mismatched-material provider in the behavioral tests.

## 13. Runtime Non-wiring Statement

No file outside `app/lib/security/approvalMac/` imports the new modules. ApprovalStore,
actionApproval, approvalPreviewBinding, approvalStoreAdapter, externalActions, all API
routes, and all UI remain byte-identical to baseline `fcc67a1`. The live approval binding
still uses the Phase 5E unkeyed SHA-256 path; nothing in P7.1 changes what production
verifies. A behavioral test asserts the isolated modules' import graph stays within
`crypto` and the module set itself.

## 14. Security Properties Achieved

- Keyed MAC (HMAC-SHA-256) over canonical bytes — unkeyed SHA-256 has no code path in the
  new modules and cannot satisfy verification.
- 9-way binding (tenant_id / operation / target_hash / payload_hash / preview_hash /
  expires_at / nonce / key_id / key_version) proven by behavioral tests: changing any one
  changes the MAC.
- Fail closed on: invalid payload, unknown fields, bad hash/timestamp formats, unsupported
  algorithms, unavailable secret, unknown key metadata, expired payload, non-empty
  no_go_flags, malformed expected MAC.
- Constant-time digest comparison; secrets never logged, returned, thrown, or serialized
  into results or errors.
- Deterministic canonicalization independent of object insertion order, stable across
  runs.
- Getter-based TOCTOU resistance: validation snapshots each field once into a frozen
  own-property object; the MAC and the expiry/no_go_flags gates read identical bytes.
- Non-finite `now` / `expires_at` fail closed (no NaN-comparison fail-open).

## 15. Remaining Future Gates

- ApprovalStore integration (wiring) — separate gate with its own sign-off; discharges R4
  only when the live binding migrates per
  [`APPROVAL_HASH_KEYING_PLAN.md`](../APPROVAL_HASH_KEYING_PLAN.md) (dual-read → keyed
  write → legacy retirement).
- Nonce replay storage — required properties when built: durable, tenant-scoped,
  compare-and-set uniqueness on (tenant_id, nonce), retention at least until expires_at,
  fail closed when the store is unavailable.
- Key rotation runtime — required properties when built: explicit bounded verification
  window for old key_versions, revoked keys fail closed, rotation never extends an
  expired payload's validity.
- Production TenantSecretProvider / secret storage / KMS.
- External action enablement gate; real LLM enablement gate.

## 16. Validation Summary

- Isolated behavioral test: `tests/tspMinimalRuntimeGate.test.mts` — 36/36 pass (includes
  getter-TOCTOU and non-finite-`now` regression tests, the exact expiry boundary, and the
  distinct `unknown_key_id` / `unknown_key_version` provider-mismatch paths).
- Full suite, safety gate, lint, build, cf:build, electron:build:check, `git diff --check`
  — recorded in the phase report; only the six P7.1 files changed.

## 17. Non-authorization Statement

This P7.1 TSP Minimal Runtime Implementation authorizes no ApprovalStore integration, no approval verification behavior change, no external action execution, no real LLM enablement, no production secret storage, no KMS integration, no nonce storage, no runtime key rotation, no deployment, and no automated decision-making.

Enforcement in code is governed by separate, future gates
([`NEXT_CAPABILITY_GATE.md`](../archive/v0/NEXT_CAPABILITY_GATE.md)) with recorded human decisions.
