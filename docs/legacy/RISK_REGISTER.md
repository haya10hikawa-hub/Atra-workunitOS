# Risk Register — Alpha Release Readiness

**Phase:** P5.1. **Baseline:** `main` @ `38ac55d`.

Concise register of the risks behind the Alpha readiness decisions in
[`ALPHA_RELEASE_READINESS.md`](./ALPHA_RELEASE_READINESS.md) and the RC gate in
[`RELEASE_CANDIDATE_GATE.md`](./RELEASE_CANDIDATE_GATE.md). Each risk lists **severity**,
**current status**, **alpha impact**, **mitigation**, and **release decision impact**.

Severity scale: High = blocks a real integration/production; Med = constrains the release
mode; Low = latent / cleanup. "Alpha impact" is whether the risk blocks a *constrained*
Alpha (it mostly does not — Alpha is defined to exclude the risky capabilities).

---

### R1 — Real LLM disabled
- **Severity:** — (by design)
- **Current status:** Disabled. Provider boundary always fails closed at
  `provider_implementation_missing`; production resolves `mode:"disabled"`.
- **Alpha impact:** None — Alpha is mock-only by definition; not a release blocker for Alpha.
- **Mitigation:** Fail-closed boundary + `alpha:safety-gate` No-Go assertion + static
  no-real-provider import guard.
- **Release decision impact:** Required to stay No-Go for Alpha; enabling it is a separate
  future phase.

### R2 — External execution disabled
- **Severity:** — (by design)
- **Current status:** Disabled. `EXTERNAL_ACTIONS_ENABLED` unset/`false`; kill switch in
  route + backend; RBAC gate additionally required.
- **Alpha impact:** None — external tools are context-only in Alpha; not a release blocker.
- **Mitigation:** Default-off kill switch, blocked attempts audited, safety-gate No-Go
  assertion.
- **Release decision impact:** Required to stay No-Go for Alpha.

### R3 — OAuth / token storage missing
- **Severity:** High (for real integrations)
- **Current status:** Not implemented — no OAuth, no token vault.
- **Alpha impact:** None for a constrained Alpha (no external writes); **blocks real
  integrations** and any production use.
- **Mitigation:** Documented as required next-work before SaaS production; Alpha forbids
  packaged tokens.
- **Release decision impact:** Blocks Commercial SaaS production (No-Go); not an Alpha
  blocker.

### R4 — `TenantSecretProvider` missing (keyed approval secrets)
- **Severity:** High
- **Current status:** Unimplemented; approval hash binding uses **unkeyed SHA-256**; HMAC
  keying is helper-only, not wired to records.
- **Alpha impact:** Tolerable in a single-operator supervised Alpha; **blocks keyed
  approval secrets** and multi-tenant production trust.
- **Mitigation:** Documented precondition; server-authoritative approval + four-eyes still
  enforced.
- **Release decision impact:** Precondition for real LLM / external execution / SaaS
  production; those stay No-Go until it lands.

### R5 — Audit viewer partial / operator review limited
- **Severity:** Med
- **Current status:** Durable tenant-scoped audit write exists but is **fail-open**;
  legacy `writeAuditLog` is still a no-op; viewer (`/api/audit/recent`) shows recent
  events only (no filter/search/export).
- **Alpha impact:** Operator-facing review is incomplete → constrains the release to
  **Conditional Go only**.
- **Mitigation:** RBAC-gated + redacted read path present; gap documented; fuller viewer +
  guaranteed-write is future work.
- **Release decision impact:** Keeps constrained Alpha at **Conditional Go**, not full Go
  for pilots.

### R6 — Deployment not proven
- **Severity:** Med (High for production)
- **Current status:** No successful D1-backed Cloudflare deploy demonstrated;
  `wrangler.toml` has `REPLACE_*` placeholders; CI never deploys.
- **Alpha impact:** Local/controlled Alpha does not require deploy; **blocks production**.
- **Mitigation:** CI proves the build (`cf:build`); deploy proof is required next-work.
- **Release decision impact:** Blocks Commercial SaaS production (No-Go); not an Alpha
  blocker.

### R7 — Branch protection depends on ruleset remaining active
- **Severity:** Med
- **Current status:** Main Safety Gate (id 18314883) active: `validate` required, PR
  required, force-push + deletion blocked, `bypass_actors: []`.
- **Alpha impact:** None while active; a silent weakening would remove the merge gate.
- **Mitigation:** RC gate Part B re-reads the ruleset each release; smoke test proved
  enforcement (PR #61); tests assert the CI workflow contract.
- **Release decision impact:** Any weakening ⇒ **No-Go** until restored.

### R8 — Solo-dev 0-approval review model
- **Severity:** Low
- **Current status:** `required_approving_review_count: 0` (avoids solo-dev deadlock).
- **Alpha impact:** None for Alpha; means no second-human PR review is enforced.
- **Mitigation:** PR-required + `validate` + force-push/deletion blocks still enforce
  process; four-eyes is enforced at the *product* approval layer regardless.
- **Release decision impact:** Acceptable for Alpha; revisit (require 1) before production.

### R9 — Live provider / integration / e2e test gaps
- **Severity:** Med
- **Current status:** Confidence is in logic/policy/static-invariant tests; **no
  integration/e2e, no live-D1, no UI-rendering, no real-provider** behavioral tests.
- **Alpha impact:** Acceptable given real capabilities are disabled; zero confidence the
  moment a risky flag flips.
- **Mitigation:** Static guards + fail-closed defaults; behavioral coverage is required
  before enabling any risky capability.
- **Release decision impact:** Reinforces keeping real LLM / external execution No-Go.

### R10 — Stale docs risk
- **Severity:** Low
- **Current status:** Two prior stale claims in `ALPHA_RELEASE_READINESS.md` corrected in
  P5.1: "34 checks" → **35 checks**; "Electron not implemented" → **E0 safe-shell exists
  but is No-Go**. A related over-broad "no `fetch`/SDK/secrets" claim was dropped.
- **Alpha impact:** Stale claims could mislead a future release decision if uncorrected.
- **Mitigation:** Corrections applied docs-only and listed explicitly; the static gate
  test pins key invariants so docs and reality cannot silently diverge.
- **Release decision impact:** Informational; no capability change.

---

## Summary

For a **constrained Alpha**, none of R1–R10 is a hard blocker: the risky capabilities
(R1–R4, R6) are excluded by definition, and the remaining items (R5, R7–R10) keep the
decision at **Conditional Go**, not full Go, for pilot modes. R3/R4/R6 are hard **No-Go**
blockers for real integrations, keyed secrets, and production respectively — which is why
real LLM, external execution, OAuth/token storage, and deployment stay No-Go until their
dedicated readiness phases land.
