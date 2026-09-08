# Alpha Package Verification Checklist

**Phase:** P5.2. **Baseline:** `main` @ `c828ab7`.

This checklist defines what an **Alpha package** is, what it is not, and how to verify it
safely. It is the companion to [`ALPHA_RC_DRY_RUN.md`](./ALPHA_RC_DRY_RUN.md) (the
procedure) and [`RELEASE_CANDIDATE_GATE.md`](./RELEASE_CANDIDATE_GATE.md) (the gate).

> **An Alpha package is evidence of a local/non-production build passing the RC gate. It is
> not a public release, not a deployment, and not permission to enable real integrations.**

---

## 1. What counts as an Alpha package

An Alpha package is the **local build evidence** produced by the dry-run on a specific
`main` commit:

- The Next.js web build output (`.next/`) built by `npm run build`.
- The OpenNext Cloudflare worker bundle (`.open-next/worker.js`) built by `npm run cf:build`.
- The Electron safe-shell **build-check result** from `npm run electron:build:check`
  (a posture check, not a packaged desktop app).
- The captured validation evidence (test count, safety-gate pass, lint/build/diff results).

It exists to let a human review that the candidate builds and passes the gate — nothing more.

## 2. What does not count as an Alpha package

- A deployed Cloudflare Worker or any live URL (that requires `cf:deploy` — **out of scope**).
- A published npm package (`npm publish` — **forbidden**).
- A GitHub release or release tag (`gh release create` / `git tag` — **forbidden**).
- A packaged/uploaded Electron desktop binary (`electron publish` / `electron-builder
  --publish` — **forbidden**).
- Any artifact uploaded off the build machine.

## 3. Web build verification

- `npm run build` completes with exit 0; route table printed; no build errors.
- Output is local `.next/` only; treated as disposable; never committed or uploaded.

## 4. Cloudflare / OpenNext build verification

- `npm run cf:build` completes and prints "OpenNext build complete."; emits
  `.open-next/worker.js` locally.
- **Build-only:** confirm no `wrangler deploy` / `cf:deploy` / `wrangler dev` was run. The
  worker bundle is verification evidence, not a deployment.

## 5. Electron check verification

- `npm run electron:build:check` passes (read-only allowlist IPC only; no execution
  authority added).
- Confirm Electron remains **No-Go** for all release modes; no desktop binary is packaged
  or published; `electron` is not a package dependency.

## 6. Artifact handling rules

- Build outputs (`.next/`, `.open-next/`) stay on the build machine and are disposable.
- **No publish/upload step** of any kind (registry, GitHub release, artifact store,
  desktop update channel).
- No artifact is signed, tagged, or distributed as part of an Alpha package.

## 7. Environment variable safety

- `EXTERNAL_ACTIONS_ENABLED` unset or `false` (external execution stays No-Go).
- No non-mock LLM provider mode; no provider API key variables set.
- No OAuth / token variables. `wrangler.toml` keeps `REPLACE_*` placeholders (no real
  database IDs / secrets baked in).

## 8. Secret safety

The Alpha package and its build logs **must not** contain any secret or credential.
Verify none are present or embedded:

- **no secrets in artifacts**
- **no production credentials**
- **no real LLM provider keys**
- **no external-action credentials**
- **no OAuth tokens**
- **no deployment target mutation**
- **no publish/upload step**

## 9. Operator review requirements

- A human reviews the captured dry-run evidence (§5 of the dry-run doc) against this
  checklist before calling the package "verified".
- The operator confirms the No-Go boundaries (real LLM, external execution, OAuth/token
  storage, deployment, publish, release, tag, upload) were all respected.
- The operator records the commit SHA, the decision, their name, and the date.

## 10. Release decision states

- **Go** — all §3–§8 checks pass and §2 non-package items were not produced; a valid Alpha
  package for local/non-production review.
- **Conditional Go** — checks pass and the package is used only for a constrained Alpha
  (closed alpha / customer-observed pilot) with disclosures.
- **No-Go** — any secret/credential is present, any forbidden publish/deploy/release/tag/
  upload occurred, or any risky capability was enabled.

Passing this checklist certifies a **local, non-production build only**. It grants no
authorization to deploy, publish, release, or enable real LLM / external execution /
OAuth / token storage.
