# Phase 5E: Tenant-secret HMAC-SHA256 Hash Binding

**Status:** Alpha Hardening Only (helpers / verifier introduced; record generation unchanged)
**Commercial SaaS Production:** No-Go
**External Execution:** No-Go
**Live Provider Integration:** No-Go
**OAuth / token vault:** No-Go

## Scope

Introduce tenant-secret HMAC-SHA256 hash binding as an explicit, opt-in mode, in a
migration-safe way. No schema migration, no real secret storage.

## Current plain-SHA risk

`targetHash`/`payloadHash` are plain SHA-256 over canonical JSON. They bind
target/payload structurally but are public deterministic digests — not keyed to a
tenant secret. HMAC-SHA256 keyed by a per-tenant secret makes the binding
tenant-scoped instead of a globally reproducible digest.

## HMAC-SHA256 contract

- Canonicalization is unchanged (`canonicalize`: sorted keys, `undefined` stripped).
- `computeTenantHmacSha256Hash(value, tenantSecret)` → 64 lowercase hex.
- Same secret + same canonical value → same digest.
- Different secret (same value) → different digest.
- Same secret + different value → different digest.
- HMAC digests differ from the legacy SHA-256 digest of the same value.

## tenantSecret injection rule

- The tenant secret is **always an injected argument**. The low-level helpers in
  `hash.ts` never read the runtime environment.
- Empty/missing secret → `HashBindingError("missing_tenant_secret")` (fail closed).
  Production must never silently fall back to a default/unkeyed digest.
- `app/lib/security/tenantSecret.ts` declares a `TenantSecretProvider` interface
  only — no implementation, no environment read, no default secret. A real provider
  is future OAuth / token-vault / security-infrastructure work.

## No raw secret / value exposure

- The raw `tenantSecret` is never logged, returned, serialized, committed, or
  included in errors. `HashBindingError.message` is a stable code (`missing_tenant_secret`).
- Hash helpers never echo the raw value being hashed.

## Legacy SHA-256 compatibility path

`verifyHashBinding({ value, storedDigest, tenantSecret?, allowLegacySha256 })`:

- When a non-empty `tenantSecret` is provided, HMAC-SHA256 is tried first and, on
  match, reported as `matched: "hmac-sha256"`.
- A legacy SHA-256 digest is accepted **only** when `allowLegacySha256: true`, and is
  reported explicitly as `matched: "sha256"`. A legacy digest never silently passes
  as HMAC.

## Record generation vs verifier — path chosen

**This PR introduces HMAC helpers + verifier + explicit legacy compatibility only.
It does NOT switch ActionPreview / ApprovalRecord generation to HMAC.**

Reason: keying HMAC into record creation requires a real per-tenant secret provider,
which is future OAuth / token-vault / security-infrastructure work and remains
No-Go. New records continue to use legacy SHA-256 (`hashField` / `computeLegacySha256Hash`).
Enabling HMAC for new records is a future phase once a tenant-secret provider exists.

## Phase 5B / 5C / 5D preserved

- Phase 5B atomic CAS `markUsed` one-time-use claim is unchanged.
- Phase 5C explicit approval ↔ action-preview binding is unchanged (still compares
  stored `targetHash`/`payloadHash`).
- Phase 5D ActionPreview D1 JSON mapping hardening is unchanged.
- Dry-run remains non-consuming.

## Boundaries

- External execution remains **No-Go**.
- Live provider integration remains **No-Go**.
- Commercial SaaS production remains **No-Go**.
- OAuth/token vault and billing remain **No-Go**.
- Real tenant-secret storage remains **future work**.
- D1 schema / index hardening remains **future Phase 6A / 6B / 6C**.

## Subagent Audits (Phase 5E merge gate)

Named specialized subagents are unavailable in this environment; equivalent
independent audits were performed with evidence against the committed diff.

- **SecurityAuditSubAgent — Go:** raw tenantSecret never exposed (result/error/log);
  no production fallback/default secret; low-level helpers read no environment; HMAC
  requires an injected secret (fails closed when empty); legacy SHA-256 is explicit;
  no external execution / live provider / provider SDK / `fetch` / secrets; client
  tenant/user/role and `approvedByPm` not trusted; no `providerRequest`/`providerResponse`/
  `executionPayload`; safe errors only; tenant boundary preserved.
- **ArchitectureAuditSubAgent — Go:** Phase 5E scope only; no Phase 6 schema/index;
  no OAuth/token vault or real secret storage; `TenantSecretProvider` is interface-only;
  no Supabase / production routing; hash-helper boundaries preserved.
- **TestAuditSubAgent — Go:** HMAC determinism, secret variance, value variance, 64
  lowercase hex, missing-secret fail-safe, no-raw-exposure (error + serialized),
  explicit legacy path, and legacy-not-as-HMAC tested behaviorally; Phase 5B/5C/5D
  tests still pass; full validation passes.
- **ProductGovernanceAuditSubAgent — Go:** all No-Go items preserved; docs state real
  tenant-secret storage remains future work; no readiness overclaim.
- **GitHygieneAuditSubAgent — Go:** branch from latest `main` after PR #43 merge; no
  unrelated/generated files committed; changed files expected; commit message matches
  Phase 5E.
