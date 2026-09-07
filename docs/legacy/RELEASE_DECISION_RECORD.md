# Release Decision Record

**Phase:** P5.4. **Baseline:** `main` @ `8a8d078`.

A Release Decision Record (RDR) is the durable, human-readable record of a single Alpha
Release Candidate decision. It is backed by the evidence in
[`ALPHA_EVIDENCE_LEDGER.md`](./ALPHA_EVIDENCE_LEDGER.md) and records the human decision made
via [`ALPHA_SIGNOFF_TEMPLATE.md`](./ALPHA_SIGNOFF_TEMPLATE.md). It is documentation only —
no database, no API, no storage backend.

> **The final release decision must be made by a human operator. AI assistance may
> summarize evidence, but it must not make or auto-approve the decision.**

---

## 1. Purpose

Create a traceable, append-only record answering: *which commit, reviewed by whom, on what
evidence, was decided Go / Conditional Go / No-Go — and what it does not authorize.*

## 2. Record format

- One record per candidate decision, plain Markdown, with the required fields below.
- Append-only: superseding a decision adds a new record that references the prior
  `record id`; it never rewrites history.

## 3. Required fields

- **record id** (e.g. `RDR-<YYYYMMDD>-<shortSHA>`)
- **candidate commit** (full SHA)
- **PR / branch** (`#<number>` / branch name)
- **reviewer** (named accountable human)
- **date / time** (ISO 8601, UTC)
- **validation summary** (`npm test` count/0 fail; `alpha:safety-gate` 35; lint; build;
  cf:build; electron:build:check; git diff --check; GitHub `validate` result)
- **evidence references** (link/ID of the ledger entry and CI run)
- **known limitations** (accepted, per [`RISK_REGISTER.md`](./RISK_REGISTER.md))
- **decision: Go / Conditional Go / No-Go**
- **follow-up actions**
- **final human sign-off** (operator name + attestation)

## 4. Decision states

- **Go** — all validation passed, governance intact, all risky capabilities disabled, no
  forbidden action executed. (Full Go applies to a local technical demo.)
- **Conditional Go** — the above hold and the build is used only in a constrained Alpha mode
  (closed alpha / customer-observed pilot) with disclosures; exposure is a separate
  decision per [`ALPHA_RELEASE_READINESS.md`](./ALPHA_RELEASE_READINESS.md).
- **No-Go** — any validation fails, any boundary is unconfirmed, the Main Safety Gate is
  missing/weakened, or any forbidden action occurred.

## 5. Evidence references

Every RDR must reference its backing evidence: the ledger entry ID
([`ALPHA_EVIDENCE_LEDGER.md`](./ALPHA_EVIDENCE_LEDGER.md)) and the CI `validate` run URL.
The RDR summarizes; the ledger holds the raw evidence.

## 6. Non-authorization statements

Every RDR carries this limit:

> A release decision record does not authorize real LLM enablement, external execution,
> OAuth or token storage, production deployment, publishing, release creation, release
> tags, or artifact upload.

Restated as discrete lines for clarity:

- A release decision record does not authorize real LLM enablement.
- A release decision record does not authorize external execution.
- A release decision record does not authorize OAuth or token storage.
- A release decision record does not authorize production deployment.
- A release decision record does not authorize publishing, release creation, release tags,
  or artifact upload.

## 7. Human responsibility statement

**The final release decision must be made by a human operator. AI assistance may summarize
evidence, but it must not make or auto-approve the decision.** A record with no named human
sign-off is invalid.

## 8. Reversal / correction rules

- Records are append-only; to reverse or correct a decision, create a new RDR that cites
  the prior `record id`, states the reason, and carries its own human sign-off.
- Never edit a past record's decision in place.
- A discovered forbidden action or missing evidence retroactively makes the affected
  candidate **No-Go**; record the correction.

## 9. Example record

```
record id:        RDR-20260701-8a8d078
candidate commit: 8a8d078ba120b6f4b799ace791f8a030dc3cd168
PR / branch:      #65 / docs/alpha-operator-runbook
reviewer:         (named human operator)
date / time:      2026-07-01T08:30:00Z
validation:       npm test 1934/0; alpha:safety-gate 35; lint clean; build ok;
                  cf:build ok; electron:build:check ok; git diff --check clean;
                  GitHub validate: pass
evidence refs:    ledger alpha-rc-8a8d078-20260701; CI run <url>
known limits:     audit fail-open; unkeyed approval hash; no deploy proof (accepted)
decision:         Conditional Go (closed alpha, disclosures)
follow-up:        none
sign-off:         (operator name) — "I made this decision; the system did not decide."
non-authorization: does not authorize real LLM / external execution / OAuth / token
                  storage / production deployment / publish / release / tag / upload
```

## 10. No-Go examples

- **Validation failed** — `npm test` shows failures, or `alpha:safety-gate` regressed → **No-Go**.
- **Governance weakened** — Main Safety Gate missing/disabled, `bypass_actors` non-empty,
  or required check is no longer `validate` → **No-Go**.
- **Forbidden action executed** — a `wrangler deploy`, `npm publish`, `gh release create`,
  `git tag`, or artifact upload occurred → **No-Go**.
- **Risky capability enabled** — real LLM wired, `EXTERNAL_ACTIONS_ENABLED=true`, or
  OAuth/token storage added → **No-Go**.
- **Missing evidence / no human sign-off** — the ledger entry is incomplete or the record
  has no named operator → **No-Go**.
