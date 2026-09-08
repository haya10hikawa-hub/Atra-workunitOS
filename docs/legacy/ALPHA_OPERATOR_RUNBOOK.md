# Alpha Operator Runbook

**Phase:** P5.3. **Baseline:** `main` @ `158c074`.

This runbook is the human operator's step-by-step guide for reviewing, signing off, and
recording an Alpha Release Candidate. It sits on top of the P5.1 RC gate
([`RELEASE_CANDIDATE_GATE.md`](./RELEASE_CANDIDATE_GATE.md)) and the P5.2 dry-run
([`ALPHA_RC_DRY_RUN.md`](./ALPHA_RC_DRY_RUN.md)), and it is used together with the
[`MANUAL_REVIEW_PROTOCOL.md`](./MANUAL_REVIEW_PROTOCOL.md) and the fillable
[`ALPHA_SIGNOFF_TEMPLATE.md`](./ALPHA_SIGNOFF_TEMPLATE.md).

> Product principle: **AI proposes. Rules guard. Humans decide.**
>
> **The operator is responsible for reviewing evidence and making the release decision.
> The system may assist, but it must not decide autonomously.** The human operator makes
> the release decision.

---

## 1. Purpose

Give one accountable human a repeatable procedure to turn a passing dry-run into a
recorded Alpha release decision, without deploying, publishing, or enabling any risky
capability.

## 2. Operator role

- A single named human accountable for the decision (not the system, not the AI).
- Reads and confirms the evidence; runs the manual review; records the sign-off.
- Has authority to say **No-Go** and to stop; has **no** authority to bypass the gate,
  weaken governance, or enable a risky capability to "make it pass".

## 3. Scope

- **In scope:** verifying a candidate commit on `main` (or a candidate branch/PR) using
  the dry-run, reviewing evidence per the manual review protocol, and recording a decision.
- **Out of scope:** any deployment, publish, release, tag, artifact upload, real provider
  call, OAuth/token storage, or governance change — all **forbidden** (§12).

## 4. Pre-run checks

- Clean checkout of the candidate; commit SHA recorded; `git status --short` shows no
  unexpected tracked changes.
- Node 22 available.
- `EXTERNAL_ACTIONS_ENABLED` unset/`false`; no provider API keys; no OAuth/token material.
- Main Safety Gate ruleset active; required check is `validate`; `bypass_actors` empty.

## 5. RC dry-run execution

Run the P5.2 dry-run sequence exactly (build-only / check-only), per
[`ALPHA_RC_DRY_RUN.md`](./ALPHA_RC_DRY_RUN.md) §4:

```
git status --short
git fetch origin
git pull origin main
npm test
npm run alpha:safety-gate
npm run lint
npm run build
npm run cf:build
npm run electron:build:check
git diff --check
```

## 6. Evidence collection

Capture: commit SHA + clean tree; `npm test` count with 0 failures; `alpha:safety-gate`
pass (35 checks); lint 0/0; `build` / `cf:build` success lines; `electron:build:check`
pass; `git diff --check` clean; confirmation no forbidden action ran; ruleset readback
(active, `validate` required, `bypass_actors` empty).

## 7. Manual review steps

Work through [`MANUAL_REVIEW_PROTOCOL.md`](./MANUAL_REVIEW_PROTOCOL.md): confirm the
evidence, the boundary checklist (candidate/preview/approval/execution/draft separation),
product-behavior, security, audit, and documentation checklists, then the decision
checklist. The reviewer must positively confirm every boundary — silence is not approval.

## 8. Go / Conditional Go / No-Go decision

- **Go** — every dry-run command passed, all evidence collected, all boundaries confirmed,
  no forbidden action occurred (local technical demo grade).
- **Conditional Go** — the above hold and the build is used only in a constrained Alpha
  mode (closed alpha / customer-observed pilot) with risky capabilities disabled and
  limitations disclosed per [`ALPHA_RELEASE_READINESS.md`](./ALPHA_RELEASE_READINESS.md).
  Exposing the build to any audience is a separate distribution decision requiring the
  readiness sign-off, not merely green commands.
- **No-Go** — any command fails, any boundary is unconfirmed, any forbidden action
  occurred, or the Main Safety Gate is missing/weakened.

## 9. Rollback / disable assumptions

- The kill switch **is** the rollback: external execution is off by default and no external
  write is ever performed, so there is nothing to unwind.
- No deploy means no production rollback; the Alpha build is local/disposable.
- If a risky capability were somehow enabled, the correct action is **stop and No-Go**, not
  "roll forward".

## 10. Incident escalation

- If evidence is inconsistent, a boundary cannot be confirmed, or a forbidden action is
  discovered: **halt, mark No-Go, and record it** on the sign-off with the specifics.
- Do not attempt a fix that touches app/Electron/runtime/package/migration/workflow to
  make the candidate pass — that is out of scope for this phase and voids the Alpha claim.
- Record the incident, the commit SHA, and the operator; notify the accountable owner.

## 11. Cleanup rules

- Local build outputs (`.next/`, `.open-next/`) are disposable; never commit, upload, or
  publish them.
- No artifact leaves the machine. Do not commit any environment file, credential, or
  generated bundle.

## 12. What this runbook does not authorize

Passing this runbook and recording a decision **MUST NOT** be treated as authorization to:

- enable real LLM (no provider key, no non-mock provider).
- enable external execution (no `EXTERNAL_ACTIONS_ENABLED=true`).
- add OAuth / token storage.
- deploy (no `wrangler deploy` / `cf:deploy`).
- publish (no `npm publish` / package registry publish).
- create a GitHub release (no `gh release create`).
- create a release tag (no `git tag` for release).
- upload artifacts (no artifact upload).
- weaken the ruleset (no disabling/relaxing the Main Safety Gate).
- bypass human approval (the human decision is mandatory).

> This runbook does not authorize real LLM, external execution, OAuth, token storage, production deployment, publishing, release creation, release tags, or artifact upload.
