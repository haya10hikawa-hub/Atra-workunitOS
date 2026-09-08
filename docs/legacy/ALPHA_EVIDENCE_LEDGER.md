# Alpha Evidence Ledger

**Phase:** P5.4. **Baseline:** `main` @ `8a8d078`.

The Alpha evidence ledger is the human-readable record of the evidence gathered for each
Alpha Release Candidate review. It is used together with the operator runbook
([`ALPHA_OPERATOR_RUNBOOK.md`](./ALPHA_OPERATOR_RUNBOOK.md)), the manual review protocol
([`MANUAL_REVIEW_PROTOCOL.md`](./MANUAL_REVIEW_PROTOCOL.md)), and the sign-off template
([`ALPHA_SIGNOFF_TEMPLATE.md`](./ALPHA_SIGNOFF_TEMPLATE.md)), and it feeds the
[`RELEASE_DECISION_RECORD.md`](./RELEASE_DECISION_RECORD.md).

> **The Alpha evidence ledger is a human-readable review record. It is not a database, not an audit-log backend, not a deployment artifact, and not permission to enable real integrations.**

This phase adds **documentation and a static test only** — no database, no API, no storage
backend, no UI, no runtime persistence.

---

## 1. Purpose

Give reviewers one consistent, human-readable place to record *what evidence was seen* for
a candidate, so a release decision is traceable and reproducible without a runtime system.

## 2. Scope

- **In scope:** a per-candidate, plain-text/Markdown ledger entry capturing the dry-run
  evidence, governance readback, and the reviewer's decision inputs.
- **Out of scope:** any database, audit-log backend, API, UI, deployment artifact, or
  automated collection. The ledger is filled and read by humans.

## 3. What the ledger is

- A human-readable review record (Markdown/plain text), one entry per candidate commit.
- A companion to the sign-off: the ledger holds the *evidence*, the sign-off holds the
  *decision*.
- Append-only archival documentation — entries are kept for traceability and never
  rewritten (corrections are appended, per §7); the medium is plain docs, not a production
  data store with a runtime durability guarantee.

## 4. What the ledger is not

- **Not a database** and not an audit-log backend (the runtime audit path in
  `app/lib/security/auditPersistence.ts` is separate and unchanged).
- **Not a deployment artifact** and not something that ships or is published.
- **Not permission** to enable real LLM, external execution, OAuth/token storage, or
  deployment — recording evidence authorizes nothing.
- **Not** an API, UI, or storage backend.

## 5. Required evidence entries

Each ledger entry must record:

- **candidate commit SHA**
- **PR number / branch**
- **validation command results** (`npm test` count + 0 failures; `alpha:safety-gate` 35
  checks; `lint`; `build`; `cf:build`; `electron:build:check`; `git diff --check`)
- **GitHub `validate` check result**
- **Main Safety Gate readback summary** (enforcement active; required check `validate`;
  `pull_request` / `non_fast_forward` / `deletion` rules; `bypass_actors` empty)
- **risky capability No-Go confirmation** (real LLM, external execution, OAuth/token
  storage, deployment all disabled)
- **deploy / publish / release / tag / upload non-execution confirmation**
- **known limitations accepted** (per [`RISK_REGISTER.md`](./RISK_REGISTER.md))
- **reviewer identity** (named accountable human)
- **decision state** (Go / Conditional Go / No-Go)
- **follow-up actions**

## 6. Evidence naming convention

- One file/entry per candidate: `ledger/alpha-rc-<shortSHA>-<YYYYMMDD>.md` (or an appended
  section keyed by `<shortSHA>` in a single ledger file).
- Reference the PR as `#<number>` and the branch by name.
- Timestamps in ISO 8601 (UTC).

## 7. Evidence integrity rules

- Record evidence verbatim from the commands (counts, pass/fail lines) — do not paraphrase
  a pass that did not happen.
- Never edit a past entry to change a recorded outcome; append a correction with its own
  timestamp and reviewer instead.
- The commit SHA in the entry must match the commit the evidence was produced on.

## 8. Review and retention expectations

- A ledger entry is reviewed by the accountable human before the decision is recorded.
- Entries are retained (append-only) for traceability of past Alpha decisions; they are
  documentation, not customer data, and carry no runtime durability guarantee.

## 9. Privacy / secret safety

> The ledger must not contain secrets, API keys, OAuth tokens, credentials, raw private
> data, or production environment values.

Record only non-sensitive evidence (command result lines, counts, SHAs, decision text).
Link to CI runs by URL rather than pasting logs that could contain sensitive values.

## 10. Prohibited entries

The ledger must never contain:

- secrets
- production credentials
- real LLM provider keys
- external-action credentials
- OAuth tokens
- private customer data
- deployment credentials

If any of these would be needed to "complete" an entry, **stop** — the entry is out of
scope and the presence of such material is itself a No-Go.

## 11. Go / Conditional Go / No-Go usage

- **Go** — evidence shows all validation passed, governance intact, all risky capabilities
  disabled, and no forbidden action executed.
- **Conditional Go** — the above hold and the build is used only in a constrained Alpha
  mode with disclosures per [`ALPHA_RELEASE_READINESS.md`](./ALPHA_RELEASE_READINESS.md).
- **No-Go** — any evidence is missing/inconsistent, a boundary is unconfirmed, a prohibited
  entry appears, or a forbidden action occurred.

## 12. Relationship to operator sign-off

The ledger is the evidence backing the [`ALPHA_SIGNOFF_TEMPLATE.md`](./ALPHA_SIGNOFF_TEMPLATE.md)
and the [`RELEASE_DECISION_RECORD.md`](./RELEASE_DECISION_RECORD.md): the reviewer reads the
ledger, then records the human decision. The ledger assists the decision; it does not make
it. **AI assistance may summarize ledger evidence, but the human operator makes the
decision.**
