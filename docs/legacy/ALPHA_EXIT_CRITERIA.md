# Alpha Exit Criteria

**Phase:** P5.5. **Baseline:** `main` @ `cf24ca3`.

Defines the conditions that must be true before the project may be considered to have
**completed the Alpha governance baseline** and may proceed to consider (not implement) any
risky capability work through the [`NEXT_CAPABILITY_GATE.md`](../archive/v0/NEXT_CAPABILITY_GATE.md).

> **Alpha exit means the project has completed the Alpha governance baseline. It does not authorize real LLM enablement, external execution, OAuth/token storage, production deployment, publishing, release creation, release tags, or artifact upload.**

This phase adds **documentation and a static test only** — it enables no capability and
changes no product behavior.

---

## 1. Purpose

State, unambiguously, what "done with Alpha governance" means, so no one treats a passing
Alpha as permission to turn on a risky capability. Alpha exit is a **checkpoint**, not an
authorization.

## 2. Scope

- **In scope:** the governance conditions (baseline, validation, governance, evidence,
  human decision, unresolved-risk review) required to declare Alpha governance complete.
- **Out of scope:** implementing any capability. Enabling a capability is governed by
  [`NEXT_CAPABILITY_GATE.md`](../archive/v0/NEXT_CAPABILITY_GATE.md), one capability at a time.

## 3. What Alpha exit means

- The Alpha governance ladder (P5.1 → P5.4) is complete and verified on `main`.
- A candidate can be dry-run, reviewed, decided, and recorded by a human operator using the
  existing docs.
- The project has an honest, written view of its unresolved risks.

## 4. What Alpha exit does not mean

Alpha exit does **not** mean, and does **not** authorize:

- real LLM enablement
- external execution
- OAuth/token storage
- production deployment
- publishing, release creation, release tags, or artifact upload
- adding a database, API route, storage backend, UI, or Electron authority

Recording "Alpha complete" authorizes nothing beyond continued Alpha-grade use.

## 5. Required baseline conditions

- **P1 through P5.4 are present and verified**
- **Main Safety Gate remains active**
- **required check is validate**
- **full validation passes**
- **Alpha RC dry-run is reproducible**
- **operator runbook exists**
- **evidence ledger exists**
- **release decision record exists**

## 6. Required validation conditions

The full validation must pass on the exit candidate commit:

```
npm test                      (0 failures)
npm run alpha:safety-gate     (35 checks; No-Go boundaries intact)
npm run lint
npm run build
npm run cf:build
npm run electron:build:check
git diff --check
```

Plus GitHub: the PR's required check `validate` is green.

## 7. Required governance conditions

- Main Safety Gate ruleset active; required check is `validate`; `pull_request`,
  `non_fast_forward`, and `deletion` rules present; `bypass_actors` empty.
- No ruleset weakening, no CI weakening, no branch-protection bypass.

## 8. Required evidence conditions

- An evidence ledger entry ([`ALPHA_EVIDENCE_LEDGER.md`](./ALPHA_EVIDENCE_LEDGER.md)) exists
  for the exit candidate, with all required entries and no prohibited (secret) material.
- A release decision record ([`RELEASE_DECISION_RECORD.md`](./RELEASE_DECISION_RECORD.md))
  exists, referencing the ledger and the CI `validate` run.

## 9. Required human decision conditions

- A named human operator recorded the decision via
  [`ALPHA_SIGNOFF_TEMPLATE.md`](./ALPHA_SIGNOFF_TEMPLATE.md).
- **The human operator makes the release decision; the system may assist but must not decide
  autonomously.**

## 10. Required unresolved-risk review

Before declaring Alpha exit, the operator must review and accept (or block on) each open
risk, explicitly including:

- **TenantSecretProvider missing** (approval hash binding is unkeyed SHA-256)
- **OAuth/token storage absent**
- **real LLM disabled**
- **external execution disabled**
- **deployment not proven**
- **audit/operator review limitations** (audit write fail-open; legacy no-op; viewer
  recent-only)
- **production observability missing or partial**
- **rollback/kill-switch assumptions** (external-action kill switch is the rollback; no
  deploy = no production rollback)

See [`RISK_REGISTER.md`](./RISK_REGISTER.md) for the full register.

## 11. Go / Conditional Go / No-Go criteria

- **Go** — §5–§10 all satisfied on the exit candidate; unresolved risks reviewed and
  accepted for Alpha-grade use.
- **Conditional Go** — §5–§10 satisfied and the build is used only in a constrained Alpha
  mode with disclosures per [`ALPHA_RELEASE_READINESS.md`](./ALPHA_RELEASE_READINESS.md).
- **No-Go** — any baseline/validation/governance/evidence/decision condition fails, the
  Main Safety Gate is missing/weakened, or an unresolved risk is unacceptable.

## 12. Relationship to next capability gate

Alpha exit is the **precondition** for opening the
[`NEXT_CAPABILITY_GATE.md`](../archive/v0/NEXT_CAPABILITY_GATE.md), not a substitute for it. Even with
Alpha exit recorded, each risky capability must still pass its own specific gate, be
reviewed, and be recorded before any implementation begins. Alpha exit authorizes **nothing
new** by itself.
