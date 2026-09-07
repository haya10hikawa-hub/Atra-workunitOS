# Release Candidate (RC) Gate

**Phase:** P5.1. **Baseline:** `main` @ `38ac55d`.

This document defines the **concrete, enforceable gate** a build must pass to be called a
Release Candidate for a constrained Alpha (see
[`ALPHA_RELEASE_READINESS.md`](./ALPHA_RELEASE_READINESS.md)). The gate is a checklist of
objective pass/fail conditions plus an explicit release decision. It authorizes **nothing
beyond a constrained Alpha** — see the boundary statement at the end.

The gate has three parts (all must pass) and one decision.

---

## Part A — Required automated checks

Run on the exact candidate commit; every command must succeed:

```
npm test
npm run alpha:safety-gate
npm run lint
npm run build
npm run cf:build
npm run electron:build:check
git diff --check
```

And on the GitHub PR:

- **`validate` required on the GitHub PR** — the CI Safety Gate job named `validate`
  (`.github/workflows/ci.yml`) must be green and required before merge.

| Check | Pass condition |
|---|---|
| `npm test` | exact test count reported, **0 failures** |
| `npm run alpha:safety-gate` | passes (**35 checks**); every No-Go boundary intact |
| `npm run lint` | 0 errors, 0 warnings |
| `npm run build` | Next.js build succeeds |
| `npm run cf:build` | OpenNext build completes |
| `npm run electron:build:check` | safe-shell build check passes (read-only IPC only) |
| `git diff --check` | no whitespace/conflict errors |
| GitHub `validate` | required check green on the PR |

## Part B — Required repository governance

The **Main Safety Gate** ruleset (id `18314883`) on `refs/heads/main` must be intact:

- **Main Safety Gate active** — `enforcement: active`.
- **required check `validate`** — `required_status_checks` includes context `validate`.
- **PR required** — `pull_request` rule present (no direct pushes to `main`).
- **force push blocked** — `non_fast_forward` rule present.
- **deletion blocked** — `deletion` rule present.
- **bypass actors empty** — `bypass_actors: []` (no one can bypass the gate).

If the ruleset is missing, disabled, or weakened, the RC gate is **No-Go**.

## Part C — Required product safety

Confirmed disabled / intact on the candidate:

- **real LLM disabled** — production resolves `mode:"disabled"`; only mock/null provider
  is wired; the provider boundary always returns `provider_implementation_missing`.
- **external execution disabled** — `EXTERNAL_ACTIONS_ENABLED` unset/`false`; kill switch
  fails closed; RBAC still required.
- **approval boundary intact** — server-authoritative approval; four-eyes (creator ≠
  approver) enforced.
- **preview ≠ approval** — inspecting a preview never approves it.
- **approval ≠ execution** — an approval never performs an external action.
- **draft ≠ sent** — an AI draft is never sent as a message.
- **candidate ≠ formal WorkUnit** — AI output stays candidate-only until a human promotes
  it through the review gate.

## Release decision

Exactly one of:

- **Go** — Part A, Part B, and Part C all pass; applies in full only to a local
  technical demo.
- **Conditional Go** — Parts A/B/C pass and the build is used **only** in a constrained
  Alpha mode (local demo / closed alpha / customer-observed pilot) with all No-Go
  capabilities disabled and limitations disclosed.
- **No-Go** — any Part A check fails, Part B governance is missing/weakened, any Part C
  capability is enabled, or a risky capability is proposed before its readiness gate
  exists.

---

## Scope boundary (authorization limit)

> **Passing the RC gate does not authorize real LLM, external execution, OAuth, token storage, or production deployment.**

The RC gate certifies only that a build is safe for a **constrained, non-production,
non-autonomous Alpha**. Enabling any risky capability requires its own dedicated,
separately-approved readiness phase with production-grade secret handling, tenant
enforcement, observability, and rollback — none of which exist today (see
[`RISK_REGISTER.md`](./RISK_REGISTER.md)). This phase adds no capability and changes no
product behavior.
