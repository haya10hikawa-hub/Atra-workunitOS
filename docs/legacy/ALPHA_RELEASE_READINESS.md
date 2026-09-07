# Alpha Release Readiness

**Phase:** P5.1 (Alpha Release Readiness Checklist + Release Candidate Gate)
**Status:** Conditional alpha only — not production, not Electron, not autonomous.
**Baseline:** `main` @ `38ac55d` (security/governance series P1–P4.7 complete and verified).

This document defines **what "Alpha releaseable" means** for WorkUnit OS / Atra, as a
human-actionable checklist. It is the companion to the concrete
[`RELEASE_CANDIDATE_GATE.md`](./RELEASE_CANDIDATE_GATE.md) (the pass/fail gate) and
[`RISK_REGISTER.md`](./RISK_REGISTER.md) (the risks behind each decision). This phase is
**docs + one static test only** — it enables no capability and changes no product
behavior.

> Product principle: **AI proposes. Rules guard. Humans decide.** AI must not approve,
> and AI must not execute external actions.

---

## 1. Alpha definition

**Alpha means a controlled, non-production, non-autonomous evaluation build.**

Alpha is a build used to evaluate the candidate → human-review → approval workflow with
a small, supervised audience. It is *not* a product launch, *not* multi-tenant SaaS
production, and *not* a desktop (Electron) release.

Alpha **MUST NOT**:

- Alpha MUST NOT call real LLM providers. (Mock decomposition only.)
- Alpha MUST NOT enable external execution. (No real Slack/Gmail/GitHub/Calendar writes.)
- Alpha MUST NOT store OAuth or provider tokens. (No token vault, no packaged secrets.)
- Alpha MUST NOT deploy production SaaS. (Deployment is unproven and out of scope.)
- Alpha MUST NOT bypass human approval. (Server-authoritative approval is mandatory.)
- Alpha MUST NOT bypass CI or branch protection. (The Main Safety Gate stays active.)

If any of these is violated, the build is **No-Go for Alpha**, not "Alpha with caveats".

## 2. Alpha audience

- **Local technical demo** — the developer / internal reviewers on a local build.
- **Closed alpha** — a small, hand-provisioned cohort (operator mints identities; no
  self-serve signup, no OAuth).
- **Customer-observed pilot** — a supervised session where the customer watches the
  proposal workflow; no external writes are performed on the customer's behalf and no
  customer production secrets are stored.

Anyone outside a supervised, disclosed context is **out of scope** for Alpha.

## 3. What is allowed in Alpha

- Mock-only AI decomposition producing **candidate-only** WorkUnit nodes
  (`candidateOnly: true`, `humanReviewRequired: true`).
- Human review, edit, promotion (candidate → formal), and preview inspection.
- Server-authoritative **approval** (creator ≠ approver, four-eyes enforced).
- **Dry-run** readiness checks (which never mark an approval used and never build a
  provider request/response payload).
- Read-only, redacted, tenant-scoped **audit** review via `/api/audit/recent`.
- External tools as **context** only (never as execution buttons).

## 4. What is explicitly not allowed

| Capability | Alpha status |
|---|---|
| Real LLM provider calls | **No-Go** |
| External execution (real Slack/Gmail/GitHub/Calendar writes) | **No-Go** |
| OAuth / token vault / packaged provider tokens | **No-Go** |
| Production SaaS deployment | **No-Go** |
| Electron desktop alpha / production release | **No-Go** |
| Billing / usage enforcement | **No-Go** |
| Bypassing human approval, CI, or branch protection | **No-Go** |

These are enforced fail-closed in code (`app/lib/security/externalActions.ts` kill switch
default off; LLM provider boundary always `provider_implementation_missing`) and asserted
by `npm run alpha:safety-gate`.

## 5. Required pre-release checks

All of the following must pass on the exact candidate commit (see
[`RELEASE_CANDIDATE_GATE.md`](./RELEASE_CANDIDATE_GATE.md) for the authoritative gate):

```
npm test
npm run alpha:safety-gate
npm run lint
npm run build
npm run cf:build
npm run electron:build:check
git diff --check
```

Plus GitHub governance: the PR's required check **`validate`** must be green and the
**Main Safety Gate** ruleset must be active (PR required, force-push blocked, deletion
blocked, `bypass_actors` empty).

## 6. Required manual review items

- External execution confirmed disabled (`EXTERNAL_ACTIONS_ENABLED` unset/`false`).
- Real LLM confirmed disabled (production `mode:"disabled"`; only mock/null resolved).
- Approval boundary intact: preview ≠ approval, approval ≠ execution, dry-run ≠
  execution, draft ≠ sent, candidate ≠ formal WorkUnit.
- Four-eyes: a preview's creator cannot self-approve.
- No secrets, provider tokens, or tenant-secret material committed or packaged.
- Disclosed limitations acknowledged by every participant.

## 7. Required rollback / disable assumptions

- **Kill switch is the rollback.** External execution is off by default; there is no
  runtime state to unwind because no external write is ever performed in Alpha.
- **No deploy = no production rollback needed.** Alpha runs locally / in a controlled
  build; there is no live SaaS release to revert.
- **Data is disposable.** No retention/backup/restore guarantees; an Alpha environment
  may be torn down and re-seeded without customer impact.
- **Governance rollback:** the Main Safety Gate ruleset must never be weakened to ship an
  Alpha build; if a check blocks a merge, fix the build, do not bypass the gate.

## 8. Operator responsibilities

- Provision identities manually (no self-serve auth in Alpha).
- Verify the pre-release checks (§5) on the candidate commit before any demo/pilot claim.
- Disclose the §9 limitations to participants and record acknowledgement.
- Keep `EXTERNAL_ACTIONS_ENABLED` unset and never wire a real provider.
- Never store customer secrets/tokens; never package credentials.
- Own the incident contact and the (trivial, disposable) rollback expectation.

## 9. Known limitations

- **Real-provider path is mock-only** and never exercised end-to-end.
- **Audit review is partial** — the durable audit write is fail-open, the legacy
  `writeAuditLog` remains a no-op, and the viewer shows recent events only (no
  filter/search/export). Operator-facing review is therefore **Conditional Go** grade.
- **`TenantSecretProvider` is unimplemented** — approval hash binding uses unkeyed
  SHA-256; HMAC keying is helper-only and not wired to records.
- **Tenant isolation for several read paths is code-enforced** (post-filter), not fully
  SQL-scoped.
- **In-memory rate limiter** is dev/alpha-safe only (not durable).
- **No production deployment has been proven** (`wrangler.toml` is placeholder-only; CI
  never deploys).
- **No integration/e2e/live-D1/UI-rendering tests** — confidence is concentrated in
  logic/policy/static-invariant layers.
- **Electron safe-shell (E0) exists but is gated No-Go** for all release modes; its
  runtime is unchanged by this phase.

## 10. Go / Conditional Go / No-Go criteria

| Release mode | Decision |
|---|---|
| Local technical demo | **Conditional Go** |
| Closed alpha | **Conditional Go** |
| Customer-observed pilot | **Conditional Go** |
| Commercial SaaS production | **No-Go** |
| Electron desktop alpha | **No-Go** |
| Electron production release | **No-Go** |
| External execution | **No-Go** |
| Real LLM integration | **No-Go** |
| OAuth / token vault | **No-Go** |
| Billing | **No-Go** |

- **Go** — all §5 checks pass, §6 manual review passes, and all §4 capabilities are
  confirmed disabled. (Full "Go" applies only to a local technical demo.)
- **Conditional Go** — the constrained alpha modes above, valid **only** while every
  §4 No-Go capability stays disabled and §9 limitations are disclosed. Any violation
  drops the mode to No-Go.
- **No-Go** — any §5 check fails, any §4 capability is enabled, the Main Safety Gate is
  missing/weakened, or the readiness assessment recommends enabling a risky capability
  before its readiness gate exists.

---

## Stale-claim corrections applied in P5.1 (docs-only)

This rewrite corrects two statements in the prior Phase-7C version of this file that
could mislead a future release decision:

1. **Alpha safety gate check count** — was "34 checks"; the gate now reports **35
   checks** (`npm run alpha:safety-gate`). Corrected wherever referenced.
2. **Electron status** — was "Electron is **not implemented**"; in fact a hardened
   **E0 safe-shell exists** (`nodeIntegration:false`, `contextIsolation:true`,
   `sandbox:true`, read-only IPC allowlist) and is **correctly gated No-Go** for every
   release mode. "Not implemented" was inaccurate; the accurate statement is "present
   but No-Go, runtime unchanged this phase". A related "no provider SDK / `fetch` /
   secrets" claim was over-broad: isolated real clients (`externalToolClients.ts`,
   `llm/deepseekProvider.ts`) do contain live `fetch`, are unreachable from the AI
   decomposition runtime, and are never packaged — the boundary is sound but the blanket
   wording is dropped.

The completed safety layers (Phase 5B–7B: approval CAS, approval↔preview binding,
ActionPreview JSON hardening, tenant-secret HMAC helper, D1 schema/index/invariant
enforcement, alpha safety gate) and the P1–P4.7 security/governance series remain intact
and unchanged by this phase.

---

## Preserved policy detail (Phase 7C — corrections applied)

The sections below preserve the durable Phase 7C readiness policy that the P5.1 checklist
builds on. Content is unchanged except the two stale-claim corrections listed above. The
alpha safety gate must pass before any alpha demo/pilot claim.

### Preview / Approval / Execution Separation

- **Preview is not approval.**
- **Approval is not execution.**
- **Dry-run is not execution.**

Dry-run verifies readiness against the exact approval/preview binding and **never** marks
an approval used, never enables the Execute CTA, and never creates provider
request/response/execution payloads.

### Human Approval Policy

Human approval is **required**. AI proposes; rules guard; humans decide. LLM confidence
never skips Human Review. AI must not approve. AI must not execute external actions.

### D1 / Tenant Boundary Policy

- Approval records remain **server-authoritative**.
- ActionPreview verification remains **server/database-authoritative**.
- Every tenant-owned read/write is tenant-scoped; wrong-tenant access fails closed.

### Electron Policy

- Electron **safe-shell (E0) is present but gated No-Go** for all release modes
  (`nodeIntegration:false`, `contextIsolation:true`, `sandbox:true`, read-only IPC
  allowlist); its runtime is unchanged by this phase. *(Corrected from the prior "not
  implemented" claim.)*
- Local desktop state is **not** an approval source.
- The renderer must not own tenant/user/role decisions.
- Desktop packaging must not include secrets, provider tokens, tenant secrets, API keys,
  or live provider credentials.

### Completed Safety Layers

| Phase | Layer |
|-------|-------|
| Phase 5B | Approval `markUsed` atomic compare-and-set (one-time-use) |
| Phase 5C | Approval ↔ ActionPreview explicit binding |
| Phase 5D | ActionPreview D1 JSON mapping hardening (fail-safe) |
| Phase 5E | Tenant-secret HMAC-SHA256 helper + explicit legacy SHA-256 |
| Phase 6A | D1 schema integrity inventory + Electron constraints |
| Phase 6B | Tenant-scoped composite D1 indexes (additive) |
| Phase 6C | Repository tenant-boundary invariant enforcement |
| Phase 7A | Alpha safety checklist + Go/No-Go matrix |
| Phase 7B | Automated alpha safety gate (**35 checks**) + PR validation contract |

The Phase 7B gate (`scripts/alpha-safety-gate.mjs`) is dependency-free and read-only and
fails closed if any No-Go boundary or Phase 5B–6C guard is weakened. *(Check count
corrected from the prior "34 checks" to the current 35.)*

### Final Go / No-Go Matrix

| Item | Status |
|------|--------|
| Local technical demo | Conditional Go |
| Closed alpha | Conditional Go |
| Customer-observed pilot | Conditional Go |
| Commercial SaaS production | No-Go |
| Electron desktop alpha | No-Go |
| Electron production release | No-Go |
| External execution | No-Go |
| Live provider writes | No-Go |
| Live Real LLM integration | No-Go |
| Live provider adapter | No-Go |
| OAuth/token vault | No-Go |
| Billing | No-Go |
| Real provider writes | No-Go |

### Customer-Observed Pilot Disclosure

Participants must be told:

- The system **proposes** only; humans approve and execute **outside** the system.
- No external writes are performed on the customer's behalf.
- No customer production secrets are stored.
- Data handling is alpha-grade: no formal retention/deletion policy yet; durability is not
  guaranteed.
- Incident contact and rollback expectations are provided.

### Required Next Work Before SaaS Production

- OAuth / token vault.
- Billing / usage enforcement.
- Production-grade tenant-secret storage (HMAC keying wired to records).
- Live provider write controls (explicit execution phase).
- Legal / privacy / security review.
- Production monitoring / alerting.
- Incident response process.
- Backup / restore.
- Data retention / deletion policy.
- Durable rate limiter (replace in-memory).

### Required Next Work Before Electron Alpha

- Electron architecture decision record (ADR).
- main / preload / renderer trust boundaries.
- `nodeIntegration` disabled; `contextIsolation` required.
- IPC allowlist (narrow commands only).
- Local storage policy (not an approval source).
- Packaged secrets forbidden.
- Update / code-signing strategy.
- Server-authoritative approval verification preserved.

### Required Next Work Before Electron Production

All Electron Alpha items **and** all SaaS Production items, plus a desktop-specific
security review (renderer sandbox, auto-update integrity, local data encryption).
