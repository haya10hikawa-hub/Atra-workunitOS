# Phase 7B: Automated Alpha Safety Gates and PR Validation Contract

**Status:** Automated governance gate + PR validation contract (no product shipped, no Electron, no execution enabled)

## Scope

Convert the Phase 7A release-governance checklist into an **automated alpha safety
gate** and a **PR validation contract**. This phase adds a dependency-free local
gate script, a package script, governance tests, and this contract. It ships **no**
product, enables **no** external execution, and implements **no** Electron.

## Product Principle

> **AI proposes. Rules guard. Humans decide.**

## Safety Gate Purpose

Make the Phase 7A release matrix difficult to violate by accident. A PR is **not**
alpha-safe if it weakens a No-Go boundary, enables external execution, adds Electron
implementation/dependencies, adds provider writes, removes human approval, turns
dry-run into execution, makes local desktop state an approval source, or overclaims
commercial SaaS production / Electron readiness.

The gate (`scripts/alpha-safety-gate.mjs`) is read-only and **fails closed**: any
unmet condition exits non-zero with an actionable message.

## PR Validation Contract

A PR **cannot claim alpha readiness** unless the alpha safety gate passes **and** the
standard validation suite passes. A PR **cannot claim commercial SaaS production
readiness** at all in the current phase.

## Required Commands

```
npm test
npm run alpha:safety-gate
npm run lint
npm run build
npm run cf:build
git diff --check
```

## Required Evidence in PR Body

- `npm test`: exact count, 0 failures.
- `alpha safety gate`: pass.
- `npm run lint`: 0 errors, 0 warnings.
- `npm run build`: pass.
- `npm run cf:build`: pass.
- `git diff --check`: pass.
- A Go/No-Go block consistent with the Phase 7A matrix (no overclaim).

## Release Matrix Guard

The gate verifies `docs/release/ALPHA_RELEASE_MATRIX.json`:

- local technical demo / closed alpha / customer-observed pilot = **Conditional Go**.
- commercial SaaS production / Electron desktop alpha / Electron production = **No-Go**.
- `noGo.externalExecution`, `noGo.realProviderWrites`, `noGo.oauthTokenVault`,
  `noGo.billing` all `true`; `externalExecution` / `liveProviderWrites` = `disabled`.

## External Execution Guard

The gate verifies the kill-switch contract
(`EXTERNAL_ACTIONS_ENABLED === "true"` required; default off) remains in
`externalActions.ts`, and that the tool/dry-run paths create no provider write
payloads. **External execution remains No-Go.**

## Human Approval Guard

The checklist must state human approval is required; the gate verifies it. AI never
approves and never executes.

## Dry-run Guard

The gate verifies the dry-run route does **not** call `markApprovalUsed` and keeps
the kill switch, and that the matrix records `dryRunConsumesApproval: false`.
**Dry-run is not execution.**

## Preview / Approval / Execution Separation Guard

The checklist must state, and the gate verifies, that **preview is not approval**,
**approval is not execution**, and **dry-run is not execution**.

## D1 / Tenant Boundary Guard

The gate verifies Phase 5B markUsed CAS, Phase 5C approval-preview binding (and no
latest/workUnit-only approval lookup in verification paths), Phase 5D ActionPreview
JSON hardening, and the Phase 6C `work_units` tenant-scoped `updateStatus`.
**Approval records remain server-authoritative; ActionPreview verification remains
server/database-authoritative.**

## Electron Guard

The gate verifies `package.json` has **no** `electron` dependency. **Electron desktop
alpha and Electron production release remain No-Go.** Local desktop state is **not**
an approval source.

## Secrets / Tokens / Provider Credentials Guard

The gate verifies the Phase 5E HMAC helper reads no runtime environment, and that no
provider SDK dependency is added. No secrets / tokens / provider credentials are
introduced.

## Provider Write Guard

The gate verifies the tool / dry-run paths do not create
`executionPayload` / `providerRequest` / `providerResponse`. **Provider writes
remain disabled.**

## Production Readiness Claim Guard

The gate keeps commercial SaaS production **No-Go** and prevents the matrix from
flipping any No-Go mode to Go. A PR that flips a No-Go mode fails the gate.

## Expected Failure Cases

The gate exits non-zero if, for example:

- a release mode flips from No-Go to Go (e.g. commercial SaaS production = Go);
- `electron` appears in `package.json` dependencies;
- a provider SDK dependency is added;
- the kill-switch contract is removed;
- the dry-run route gains a `markApprovalUsed` call;
- the tool authorization path trusts `approvedByPm`;
- a verification path adds a latest/workUnit-only approval lookup;
- a Phase 5B–6C source guard disappears.

## Allowed Conditional Go Cases

Local technical demo, closed alpha, and customer-observed pilot remain **Conditional
Go** only while external execution is disabled, real provider writes are disabled, no
production secrets are packaged, human approval is required, validation passes, the
audit-log path is present, and limitations are disclosed.

## Phase 7C Handoff

Phase 7C consolidates Phase 5B–7B into a final alpha readiness report
(`ALPHA_RELEASE_READINESS.md`) with the complete safety-boundary matrix and the
remaining production blockers. The gate from this phase becomes part of that
readiness evidence.

## No-Go Boundaries

- A PR cannot claim alpha readiness unless the alpha safety gate passes.
- A PR cannot claim commercial SaaS production readiness.
- Electron desktop alpha: **No-Go**. Electron production release: **No-Go**.
- External execution: **No-Go**. Dry-run is not execution. Preview is not approval.
  Approval is not execution. Human approval is required. Local desktop state is not
  an approval source. Approval records remain server-authoritative. ActionPreview
  verification remains server/database-authoritative. Provider writes remain
  disabled.
- Live provider / OAuth-token-vault / billing / Supabase: **No-Go**.

Phase 5B CAS, Phase 5C approval-preview binding, Phase 5D ActionPreview JSON
hardening, Phase 5E HMAC helper / explicit legacy compatibility, Phase 6A Electron
constraints, Phase 6B migration/index contract, Phase 6C repository tenant invariant
enforcement, and Phase 7A release matrix all remain intact and unchanged by this
phase.

## Subagent Audits (Phase 7B merge gate)

Named specialized subagents are unavailable in this environment; equivalent
independent audits were performed with evidence against the committed diff.

- **SecurityAuditSubAgent — Go:** gate fails closed (any unmet condition exits
  non-zero); commercial SaaS production / Electron alpha / Electron production remain
  No-Go; external execution and live provider writes remain disabled; human approval
  required; dry-run ≠ execution; preview ≠ approval; approval ≠ execution; local
  desktop state untrusted; no Electron implementation; no provider SDK / `fetch` /
  secrets added; HMAC helper reads no runtime env; `approvedByPm` not trusted in the
  authorization path.
- **ArchitectureAuditSubAgent — Go:** Phase 7B scope only (gate script + docs + tests
  + one package script); no Phase 7C; no Electron; no migration; no repository
  rewrite; no app runtime behavior change; no Supabase; gate is local and
  dependency-free (node:fs only).
- **TestAuditSubAgent — Go:** the gate script and the PR validation contract are
  tested, including actually invoking the gate (exit 0); No-Go states, Conditional-Go
  caveats, and Electron blockers tested; Phase 5B/5C/5D/5E/6A/6B/6C/7A guards still
  pass; full validation passes.
- **ProductGovernanceAuditSubAgent — Go:** commercial SaaS production / Electron modes
  No-Go; closed alpha Conditional-Go only with external execution disabled; pilot
  limitations explicit; the gate prevents obvious readiness overclaims.
- **GitHygieneAuditSubAgent — Go:** branch from latest `main` after PR #48 merge; no
  unrelated/generated files committed; `desktop/` not committed; commit message
  matches Phase 7B.
