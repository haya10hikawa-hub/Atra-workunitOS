# TenantSecretProvider Design Gate

**Status: PLAN — FUTURE / NOT IMPLEMENTED.** Product authority: NONE.

**Phase:** P6.0. **Baseline:** `main` @ `287515c`.

This document is the **design gate** for a future `TenantSecretProvider` and for keyed
approval-secret handling. It is opened only after Alpha exit
([`ALPHA_EXIT_CRITERIA.md`](./legacy/ALPHA_EXIT_CRITERIA.md)) and sits under the
[`NEXT_CAPABILITY_GATE.md`](./archive/v0/NEXT_CAPABILITY_GATE.md) "secret handling plan documented"
prerequisite. It is **documentation and a static test only** — it designs nothing runtime,
connects nothing, and enables no capability.

> **TenantSecretProvider planning does not authorize implementation, deployment, real LLM enablement, external execution, OAuth/token storage, production secret storage, or approval-flow behavior changes.**

---

## 1. Purpose

Define, before any code, what must be true for the project to safely move approval-hash
binding from unkeyed hashing toward tenant-scoped keyed derivation. The output is a set of
required properties and a fail-closed implementation gate — not an implementation.

## 2. Scope

- **In scope:** the design requirements, security properties, tenant-isolation and
  secret-lifecycle requirements, fail-closed behavior, audit/test requirements, and the
  implementation gate for a future `TenantSecretProvider`.
- **Out of scope:** implementing the provider, writing or wiring cryptographic runtime
  code, changing approval record generation, or changing approval verification behavior.

## 3. What TenantSecretProvider is

- A **design-level abstraction boundary** that would resolve per-tenant secret material for
  keyed approval-hash derivation, so that an approval hash is bound to a specific tenant's
  secret rather than being a public unkeyed digest.
- A supplier of key material to the **existing helper-level** primitives only if and when a
  future, separately-approved implementation phase wires it — this document does not wire it.

## 4. What TenantSecretProvider is not

- **TenantSecretProvider is not OAuth/token storage.**
- **TenantSecretProvider is not production secret storage by itself.**
- **TenantSecretProvider is not a database implementation.**
- **TenantSecretProvider is not an API route.**
- **TenantSecretProvider is not a UI feature.**
- It is not a rewiring of existing hash helpers, not a change to approval verification, and
  not permission to store real secrets anywhere.

> Existing hash or HMAC helpers, if present, are helper-level assets only. This document does not connect them to approval record generation or approval verification behavior.

The repository already contains helper-level primitives from a prior phase (e.g. canonical
hashing, an explicit legacy SHA-256 helper, and a tenant-secret HMAC-SHA256 helper that
reads no runtime environment). **This design gate references them for context only and does
not modify, connect, rewire, or extend them.**

## 5. Design principles

- **Fail-closed by default** — absence, error, or ambiguity resolves to rejection.
- **Least privilege** — secret material is scoped to one tenant and never broadened.
- **No secret exposure** — secrets never appear in logs, evidence, or decision records.
- **Preserve existing invariants** — four-eyes approval and self-approval rejection,
  one-time-use, expiry, and preview↔approval binding are preserved unchanged.
- **Helpers stay helpers** — low-level primitives read no runtime environment and are not
  wired by this document.
- **TenantSecretProvider must fail closed.**
- **TenantSecretProvider must preserve four-eyes approval and self-approval rejection.**

## 6. Required security properties

A future implementation must satisfy all of these:

- **tenant-scoped secret material**
- **keyed approval-hash derivation**
- **no cross-tenant secret reuse**
- **no secrets in logs**
- **no secrets in evidence ledger**
- **no secrets in release decision records**
- **fail-closed when a tenant secret is unavailable**
- **deterministic verification for the same canonical approval payload**
- **rejection on tenant mismatch**
- **rejection on canonical payload mismatch**

## 7. Tenant isolation requirements

- Secret material is resolved per tenant id, derived from the request/verification context —
  never from a caller-supplied field.
- No tenant may read, reuse, or derive with another tenant's secret (**no cross-tenant
  secret reuse**).
- A tenant mismatch between the verification context and the approval record is a hard
  rejection (**rejection on tenant mismatch**), never a silent fallback.

## 8. Secret lifecycle requirements

The design must address every stage:

- **generation**
- **storage design**
- **rotation**
- **revocation**
- **backup / recovery assumptions**
- **local development strategy without production secrets**
- **test strategy without live secrets**

No stage may require pasting a real secret into a doc, log, test fixture, or evidence
record.

## 9. Fail-closed behavior

- If a tenant secret is unavailable, unresolved, or errors, verification **fails closed** —
  the approval is treated as invalid; it must never "pass open".
- Canonical payload mismatch and tenant mismatch both reject.
- There is no configuration that turns a missing secret into a successful verification.

## 10. Audit requirements

- Secret-resolution failures are auditable as safe, redacted events (no secret value, no key
  material) consistent with the existing audit redaction (token/secret/hash keys dropped).
- Audit event shape stays compatible with the current persistent audit path; this document
  adds no new runtime audit code.

## 11. Test requirements

- The eventual implementation phase must be testable **without live secrets** (deterministic
  fixtures / injected fake secrets only), covering: deterministic verification, tenant
  mismatch rejection, canonical payload mismatch rejection, and fail-closed on missing
  secret.
- This phase adds only a **static, read-only** doc-contract test (no crypto, no wiring).

## 12. Implementation gate

Implementation may begin only after a separate, approved phase in which: every §6 property
and §8 lifecycle stage is designed and reviewed; the [`APPROVAL_HASH_KEYING_PLAN.md`](./APPROVAL_HASH_KEYING_PLAN.md)
migration gates are satisfied; the [`APPROVAL_SECRET_THREAT_MODEL.md`](./APPROVAL_SECRET_THREAT_MODEL.md)
No-Go conditions are all false; and a human sign-off is recorded per
[`ALPHA_SIGNOFF_TEMPLATE.md`](./legacy/ALPHA_SIGNOFF_TEMPLATE.md). Until then the capability is
**No-Go** and this document authorizes no code.

## 13. Non-authorization statement

> **TenantSecretProvider planning does not authorize implementation, deployment, real LLM enablement, external execution, OAuth/token storage, production secret storage, or approval-flow behavior changes.**

Recording this design gate authorizes only a separately-approved planning/design review —
never the provider's implementation, never any wiring into approval hashing, and never any
other risky capability.
