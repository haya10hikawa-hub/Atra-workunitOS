# Alpha RC Dry-run Procedure

**Phase:** P5.2. **Baseline:** `main` @ `c828ab7`.

This document defines the **Alpha Release Candidate dry-run**: the exact, repeatable
procedure that proves the repository can produce and verify a safe Alpha RC **without
deploying, publishing, enabling real integrations, or weakening any safety gate**. It is
the operational companion to the [`RELEASE_CANDIDATE_GATE.md`](./RELEASE_CANDIDATE_GATE.md)
(the pass/fail gate) and [`ALPHA_PACKAGE_VERIFICATION.md`](./ALPHA_PACKAGE_VERIFICATION.md)
(what a verified build is and is not).

A dry-run is **verification only**. It builds locally, runs the gate, and stops. It never
ships anything.

---

## 1. Purpose

Answer one question with reproducible evidence: **can we build and verify an Alpha RC
candidate on the current `main` without deploying, publishing, enabling real integrations,
or weakening safety gates?** The dry-run produces the evidence; a human makes the release
decision.

## 2. Scope

- **In scope:** local build of the web app, the Cloudflare/OpenNext worker bundle, the
  Electron safe-shell build *check*, plus the full validation gate — all offline, all
  read-only with respect to any external system.
- **Out of scope:** any deployment, publish, release, tag, artifact upload, real provider
  call, or repository-governance change. These are **forbidden** (§6), not merely skipped.

## 3. Prerequisites

- A clean checkout of `main` (`git status --short` shows no unexpected tracked changes).
- Node 22 (the test runner uses `--experimental-strip-types`).
- No environment variables that would enable risky capabilities:
  `EXTERNAL_ACTIONS_ENABLED` unset/`false`; no provider API keys; no OAuth/token material.
- The Main Safety Gate ruleset is active and `validate` is the required check (governance
  is unchanged by the dry-run).

## 4. Dry-run command sequence

Run these in order, on the exact candidate commit. Every command must succeed:

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

Notes on the build steps (all build-only / check-only):

- `npm run build` — Next.js webpack build; emits `.next/` locally. No deploy.
- `npm run cf:build` — OpenNext Cloudflare build; emits `.open-next/worker.js` locally.
  This is **build-only**; deploying requires the separate `cf:deploy` (`wrangler deploy`),
  which is **forbidden** here.
- `npm run electron:build:check` — a check-only script (`scripts/electron-build-check.mjs`);
  it verifies the safe-shell posture and adds no execution authority. It does **not**
  package or publish an Electron app.

## 5. Evidence to collect

Record, for the candidate commit:

- The commit SHA (`git rev-parse HEAD`) and that `git status --short` is clean.
- `npm test` — exact test count and **0 failures**.
- `npm run alpha:safety-gate` — pass line (**35 checks**; No-Go boundaries intact).
- `npm run lint` — 0 errors / 0 warnings.
- `npm run build` / `npm run cf:build` — success lines (e.g. "OpenNext build complete.").
- `npm run electron:build:check` — pass line.
- `git diff --check` — clean.
- Confirmation that **no** deploy/publish/release/tag/upload command was run and that the
  Main Safety Gate ruleset is still active with `validate` required.

## 6. Explicit forbidden actions

The dry-run **MUST NOT** perform any of the following:

- `wrangler deploy` (or `npm run cf:deploy`, `wrangler dev` against a live target).
- `npm publish` (or any package registry publish).
- `gh release create` (no GitHub release).
- `git tag` for a release (no release tags).
- `electron publish` (or `electron-builder --publish`, any Electron packaging/upload).
- uploading artifacts (no `actions/upload-artifact`, no manual artifact upload).
- enabling real LLM (no provider key, no non-mock provider wired).
- enabling external execution (no `EXTERNAL_ACTIONS_ENABLED=true`).
- adding OAuth / token storage.
- changing GitHub rulesets (no weakening/disabling the Main Safety Gate).

If any of these appears necessary to "verify" the build, **stop and report No-Go** — the
dry-run is verification-only by definition.

## 7. Go / Conditional Go / No-Go criteria

- **Go** — every §4 command succeeds, all §5 evidence is collected, and no §6 forbidden
  action occurred. The candidate is a valid Alpha RC dry-run (local technical demo grade).
- **Conditional Go** — §4/§5 pass and the build is used only in a constrained Alpha mode
  (closed alpha / customer-observed pilot) with all risky capabilities disabled and
  limitations disclosed per [`ALPHA_RELEASE_READINESS.md`](./ALPHA_RELEASE_READINESS.md).
  A passing dry-run alone does **not** grant Conditional Go: exposing the build to any
  audience (even a pilot cohort) is a separate distribution decision that requires the
  Alpha readiness sign-off, not merely green §4 commands.
- **No-Go** — any §4 command fails, any §6 forbidden action occurred, the Main Safety Gate
  is missing/weakened, or a source/dependency/workflow change was required to pass.

## 8. Cleanup rules

- Local build outputs (`.next/`, `.open-next/`) are disposable and must **not** be
  committed, uploaded, or published; delete or ignore them.
- No artifact leaves the machine. There is nothing to roll back because nothing was
  shipped.
- Do not commit any environment file, credential, or generated bundle produced during the
  dry-run.

## 9. Relationship to P5.1 RC Gate

The dry-run **executes** the [`RELEASE_CANDIDATE_GATE.md`](./RELEASE_CANDIDATE_GATE.md):
§4 here is Part A (automated checks) run locally; §3/§6 preserve Part B (governance) and
Part C (product safety). Passing the dry-run is the same authorization limit as the RC gate.

> **Passing the dry-run does not authorize real LLM, external execution, OAuth, token storage, or production deployment.**

It only certifies a local, non-production build.

## 10. Human sign-off checklist

Before calling a dry-run "verified", a human confirms:

- [ ] `main` checkout clean; commit SHA recorded.
- [ ] All §4 commands passed; evidence (§5) captured.
- [ ] No §6 forbidden action was performed.
- [ ] `EXTERNAL_ACTIONS_ENABLED` unset/`false`; no provider keys; no OAuth/token material.
- [ ] Main Safety Gate ruleset active; `validate` required; `bypass_actors` empty.
- [ ] Build outputs treated as disposable; nothing uploaded/published/tagged.
- [ ] Release decision (§7) recorded with the operator's name and date.
