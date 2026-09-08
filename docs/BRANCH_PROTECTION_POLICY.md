# Branch Protection Policy — `main`

**Status: PLAN — FUTURE / NOT IMPLEMENTED.** Verify live GitHub settings before use. Product authority: NONE.

Security P4. This document defines the branch protection / required-checks policy
for `main` so GitHub enforces the **CI Safety Gate** (Security P3) before any merge.
It is the human-actionable companion to [`CI_SAFETY_GATE.md`](./CI_SAFETY_GATE.md).

> Status at time of writing: `main` is **NOT** protected (no branch protection rule,
> no rulesets). This document is a readiness plan — applying it is a deliberate,
> separately-approved step.

## Required status check

The CI workflow [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)
(`CI Safety Gate`) runs a single job whose check-run name is:

```
validate
```

This is the exact name to mark as a **required status check** (in the GitHub UI it
appears under the `CI Safety Gate` workflow; the selectable context is `validate`).
It runs `npm ci` then the full gate: `npm test`, `npm run alpha:safety-gate`,
`npm run lint`, `npm run build`, `npm run cf:build`, `npm run electron:build:check`,
`git diff --check`.

## Policy to enable on `main`

Recommended (minimum to consider `main` "protected"):

| Setting | Value | Notes |
|---|---|---|
| Require a pull request before merging | **enabled** | No direct merges to `main`. |
| Require status checks to pass | **enabled** | Required check: **`validate`**. |
| └ Require branches up to date before merge | recommended | Keep only if CI runtime (~2 min) stays acceptable. |
| Block force pushes | **enabled** | |
| Block deletions | **enabled** | |
| Restrict who can push to `main` | enable **if available** | On a personal public repo, push restrictions may be unavailable; otherwise document manual discipline (always go through a PR). |
| Require approving reviews | recommended **1** for security PRs | If solo development blocks velocity, keep manual for now and document the tradeoff. |
| └ Dismiss stale approvals on new commits | recommended | Only meaningful once required reviews are enabled. |
| Include administrators | recommended once stable | On a solo repo this also blocks the owner's hotfix path — enable deliberately. |

## What NOT to enable yet

- **Require linear history** — only if the repo standardizes on squash/rebase merges; current history mixes merge commits.
- **Require signed commits** — current workflow does not sign commits; do not enable until commit signing is set up.
- **Deployments / environments gating** — out of scope; CI does not deploy.

## How to apply (GitHub Web UI)

1. Repo → **Settings → Branches → Add branch ruleset** (or *Add classic branch protection rule*) for `main`.
2. Enable **Require a pull request before merging**.
3. Enable **Require status checks to pass** → add **`validate`**.
4. Enable **Block force pushes** and **Restrict deletions**.
5. (Optional) Enable **Require approvals = 1** + **Dismiss stale approvals**.
6. Save. Open a throwaway PR to confirm the `validate` check is reported and required.

## Relation to P1 / P2 / P3

- **P1 (#57)** — four-eyes approval + persistent audit logs.
- **P2 (#58)** — tools-route audit coverage + in-memory tenant write hardening.
- **P3 (#59)** — the `CI Safety Gate` workflow these protections will *require*.
- **P4 (this doc)** — makes GitHub **enforce** the P3 gate before merge, closing the
  prior gap where merge-readiness relied on local validation + SubAgent audits.

## Safety boundaries

No application code, Atra UI, Electron runtime, package dependency, external
execution, real-LLM, or OAuth/token change is involved. Branch protection is
repository governance only and is applied via GitHub settings, never via code.
