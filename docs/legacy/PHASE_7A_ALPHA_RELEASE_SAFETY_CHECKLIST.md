# Phase 7A: Alpha Release Safety Checklist and Go/No-Go Matrix

**Status:** Release-governance documentation only (no product shipped, no Electron, no execution enabled)

## Scope

Define exactly what is safe for each release mode and prevent overclaiming
readiness. This phase ships **no** product, enables **no** external execution, and
implements **no** Electron. It is documentation + governance tests only.

## Product Principle

> **AI proposes. Rules guard. Humans decide.**

This principle governs the entire matrix:

- **AI must not approve.** Approval is a human action recorded server-side.
- **AI must not execute external actions.**
- **Preview is not approval.** An ActionPreview is a proposal, not authorization.
- **Approval is not execution.** A valid approval does not perform an external action.
- **Dry-run is not execution.** Dry-run verifies readiness and never consumes an approval.
- **Local desktop state is not an approval source.**
- **LLM confidence cannot skip Human Review.** High model confidence never bypasses approval.
- **External actions remain disabled** unless a future, explicit execution phase changes that.

## Completed Safety Layers

| Phase | Guarantee |
|-------|-----------|
| 5A | `/api/workunit/tools` CSRF/Origin + tenant+user+IP rate limit; fail-closed role |
| 5B | `markUsed` atomic compare-and-set — one-time-use, no TOCTOU |
| 5C | Explicit approval ↔ ActionPreview binding; no latest/workUnit-only lookup |
| 5D | ActionPreview D1 JSON mapping is fail-safe (malformed → absent, no fabrication) |
| 5E | Tenant-secret HMAC-SHA256 helper/verifier (helper-only; explicit legacy SHA-256) |
| 6A | D1 schema integrity inventory (code-enforced vs DB-enforced invariants) |
| 6B | Tenant-prefixed composite indexes (additive, migration-safe) |
| 6C | Repository tenant-boundary enforcement (wrong-tenant reads/writes fail closed) |

## Current Technical Guarantees

- External execution is gated by a kill switch that defaults **off**
  (`EXTERNAL_ACTIONS_ENABLED === "true"` required; otherwise blocked).
- Live provider integration is **not** present — dry-run only; the fake provider is
  always blocked by the boundary (`provider_implementation_missing`).
- Approval records and ActionPreview records are **server/database-authoritative**.
- Client-owned `tenantId`/`userId`/`role`/`approvedByPm`/hashes are **not trusted**.
- Tenant isolation holds at every repository read/write path.
- `npm test` / `lint` / `build` / `cf:build` / `git diff --check` pass.
- An audit-log path is present for security-relevant events.

## Release Modes

1. Local technical demo
2. Closed alpha
3. Customer-observed pilot
4. Commercial SaaS production
5. Electron desktop alpha
6. Electron production release

## Go/No-Go Matrix

| Release mode | Status |
|--------------|--------|
| Local technical demo | **Conditional Go** |
| Closed alpha | **Conditional Go** |
| Customer-observed pilot | **Conditional Go** |
| Commercial SaaS production | **No-Go** |
| Electron desktop alpha | **No-Go** |
| Electron production release | **No-Go** |

"Conditional Go" is valid **only** while all of these hold:

- External execution is disabled (kill switch off).
- Real provider writes are disabled.
- No production secrets / provider tokens / tenant-secret material are packaged.
- Human approval remains required.
- `test` / `lint` / `build` / `cf:build` pass.
- The audit-log path remains present.
- Known limitations are disclosed to participants.

If any condition fails, the mode drops to **No-Go**.

## Local Technical Demo Checklist

- [ ] External execution disabled (`EXTERNAL_ACTIONS_ENABLED` unset/false).
- [ ] Dry-run used for verification only; no approval consumed.
- [ ] No live provider credentials present.
- [ ] No production data; dev/test tenant only.
- [ ] Human approval demonstrated as a required step.
- [ ] Validation suite green.

## Closed Alpha Checklist

- [ ] All Local Technical Demo items.
- [ ] External actions remain disabled for all participants.
- [ ] Real provider writes disabled.
- [ ] No production secrets packaged or deployed.
- [ ] Human approval required for any action proposal.
- [ ] Audit-log path present and reviewed.
- [ ] Known limitations disclosed (no execution, no live provider, alpha data durability).
- [ ] Tenant isolation verified by Phase 6C repository tests.

## Customer-Observed Pilot Checklist

- [ ] All Closed Alpha items.
- [ ] Explicitly disclose that the system **proposes** only; humans approve and
      execute outside the system.
- [ ] No customer production secrets stored.
- [ ] No external writes performed on the customer's behalf.
- [ ] Data handling limitations disclosed (no formal retention/deletion policy yet).
- [ ] Incident contact and rollback expectations disclosed.

## Commercial SaaS Production Checklist

Commercial SaaS production remains **No-Go** until at least all of:

- [ ] OAuth / token vault.
- [ ] Billing / usage enforcement.
- [ ] Production-grade tenant-secret storage (HMAC keying wired to records).
- [ ] Live provider write controls (explicit execution phase).
- [ ] Legal / privacy / security review.
- [ ] Production monitoring / alerting.
- [ ] Incident response process.
- [ ] Backup / restore.
- [ ] Data retention / deletion policy.
- [ ] Rate-limit and abuse-control review (durable limiter, not in-memory).
- [ ] Electron security review if a desktop release is included.

## Electron Desktop Alpha Checklist

Electron desktop alpha remains **No-Go** until at least all of:

- [ ] Electron architecture decision record (ADR) exists.
- [ ] main / preload / renderer trust boundaries defined.
- [ ] `nodeIntegration` disabled in renderer.
- [ ] `contextIsolation` required.
- [ ] IPC allowlist designed (narrow commands only).
- [ ] Local storage policy designed (not an approval source).
- [ ] Packaged secrets forbidden (no tenant secrets / provider tokens / API keys).
- [ ] Update / code-signing strategy designed.
- [ ] Server-authoritative approval verification preserved.

## Electron Production Release Checklist

Electron production release remains **No-Go** until all Electron Desktop Alpha items
**and** all Commercial SaaS Production items are satisfied, plus a desktop-specific
security review (renderer sandbox, auto-update integrity, local data encryption).

## External Action Policy

- External execution is **disabled** by default and remains **No-Go** for all alpha
  modes. Enabling it requires a future explicit execution phase with provider write
  controls and human approval gating preserved.
- Real provider writes remain **disabled**.

## Human Approval Policy

- Human approval is **required**. AI proposes; rules guard; humans decide.
- Approval is recorded server-side, is one-time-use (Phase 5B CAS), and is bound to
  a specific ActionPreview (Phase 5C).
- LLM confidence never skips Human Review.

## Dry-run Policy

- Dry-run is **not execution**. It verifies readiness against the exact
  approval/preview binding and **never** marks an approval used.
- Dry-run never enables the Execute CTA and never creates provider
  request/response/execution payloads.

## D1 / Tenant Boundary Policy

- Approval records remain **server-authoritative**.
- ActionPreview verification remains **server/database-authoritative**.
- Every tenant-owned repository read/write is tenant-scoped; wrong-tenant reads
  return null/[], wrong-tenant writes mutate nothing (Phase 6C).

## Electron Local State Policy

- Local desktop state is **not** an approval source.
- The renderer must **not** own tenant/user/role decisions.
- IPC/preload boundaries must be narrow (future Electron phase).
- Stale local state can never authorize an action; verification re-checks server/DB
  truth.

## Secrets / Tokens / Provider Credentials Policy

- No production secrets, provider tokens, tenant-secret material, API keys, or live
  provider credentials are packaged or committed.
- Low-level hash helpers read no runtime environment (Phase 5E).

## Observability / Audit Policy

- An audit-log path is present for security-relevant events.
- Audit entries carry no raw hashes, payloads, tenant secrets, or tokens.
- Production-grade monitoring/alerting is a Commercial SaaS Production blocker (not
  yet satisfied).

## Known Blockers

- Commercial SaaS production: OAuth/token vault, billing, production tenant-secret
  storage, live provider write controls, legal/privacy/security review, monitoring,
  incident response, backup/restore, retention policy, durable rate limiter.
- Electron desktop alpha: ADR, trust boundaries, `nodeIntegration` off,
  `contextIsolation` on, IPC allowlist, local storage policy, no packaged secrets,
  signing/update strategy.
- HMAC keying is helper-only (not wired to record generation) pending a tenant-secret
  provider.

## Phase 7B Handoff

Phase 7B will turn this checklist into **automated alpha safety-gate tests** and a
repeatable PR validation contract (regression tests for: no external execution, no
live provider, dry-run non-consuming, Execute CTA disabled, no production claim).

## Phase 7C Handoff

Phase 7C will consolidate Phase 5B–7B into a final alpha readiness report
(`ALPHA_RELEASE_READINESS.md`) with the complete safety boundary matrix and the
remaining production blockers.

## No-Go Boundaries

- Commercial SaaS production: **No-Go**.
- Electron desktop alpha: **No-Go**. Electron production release: **No-Go**.
- External execution: **No-Go**. Live Real LLM integration / live provider adapter:
  **No-Go**. OAuth/token vault: **No-Go**. Billing: **No-Go**. Real provider writes:
  **No-Go**.

Phase 5B CAS, Phase 5C approval-preview binding, Phase 5D ActionPreview JSON
hardening, Phase 5E HMAC helper / explicit legacy compatibility, Phase 6A Electron
constraints, Phase 6B migration/index contract, and Phase 6C repository tenant
invariant enforcement all remain intact and unchanged by this phase.

## Subagent Audits (Phase 7A merge gate)

Named specialized subagents are unavailable in this environment; equivalent
independent audits were performed with evidence against the committed diff.

- **SecurityAuditSubAgent — Go:** matrix does not overclaim; commercial SaaS
  production / Electron production / Electron desktop alpha remain No-Go; external
  execution and live provider writes remain disabled; human approval required; local
  desktop state untrusted; no Electron implementation; no provider SDK / `fetch` /
  secrets; HMAC helper still reads no runtime env; `approvedByPm` not trusted.
- **ArchitectureAuditSubAgent — Go:** Phase 7A scope only (docs + governance tests);
  no Phase 7B automation, no Phase 7C consolidation, no Electron, no migration, no
  repository rewrite; no Supabase; docs reflect existing safety layers accurately.
- **TestAuditSubAgent — Go:** release matrix, No-Go states, Conditional-Go caveats,
  and Electron blockers tested; Phase 5B/5C/5D/5E/6A/6B/6C guards still pass; full
  validation passes.
- **ProductGovernanceAuditSubAgent — Go:** commercial SaaS production / Electron
  modes No-Go; closed alpha Conditional-Go only with external execution disabled;
  known blockers explicit; pilot limitations explicit; no readiness overclaim.
- **GitHygieneAuditSubAgent — Go:** branch from latest `main` after PR #47 merge; no
  unrelated/generated files committed; `desktop/` not committed; commit message
  matches Phase 7A.
