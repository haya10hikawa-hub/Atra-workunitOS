# Manual Review Protocol

**Phase:** P5.3. **Baseline:** `main` @ `158c074`.

The reviewer's checklist for an Alpha Release Candidate. Used by the human operator during
[`ALPHA_OPERATOR_RUNBOOK.md`](./ALPHA_OPERATOR_RUNBOOK.md) §7 and recorded via
[`ALPHA_SIGNOFF_TEMPLATE.md`](./ALPHA_SIGNOFF_TEMPLATE.md). Every item is a positive
confirmation: an unconfirmed item is a **No-Go**, never a silent pass.

> **AI proposes. Rules guard. Humans decide.** LLM confidence cannot skip human review.

---

## 1. Review purpose

Independently verify that a candidate build is safe for a constrained Alpha: the evidence
is real, the safety boundaries hold, and no risky capability was enabled. The review
produces a recorded human decision, not an automated verdict.

## 2. Required reviewer mindset

- Skeptical by default: assume nothing passed until the evidence shows it.
- Boundary-first: a green build with a broken boundary is **No-Go**.
- The reviewer confirms *absence* of risky capability, not just presence of green checks.
- The reviewer may say No-Go for any unresolved doubt; there is no pressure to ship.

## 3. Evidence checklist

- [ ] Candidate commit SHA recorded; `git status --short` clean.
- [ ] `npm test` — exact count, **0 failures**.
- [ ] `npm run alpha:safety-gate` — pass (35 checks; No-Go boundaries intact).
- [ ] `npm run lint` — 0 errors / 0 warnings.
- [ ] `npm run build` / `npm run cf:build` — success (build-only).
- [ ] `npm run electron:build:check` — pass (check-only).
- [ ] `git diff --check` — clean.

## 4. Boundary checklist

Confirm each separation invariant still holds:

- [ ] **candidate != formal WorkUnit** — AI output stays candidate-only until a human
  promotes it through the review gate.
- [ ] **preview != approval** — inspecting a preview never approves it.
- [ ] **approval != execution** — an approval never performs an external action.
- [ ] **draft != sent** — an AI draft is never sent as a message.
- [ ] **LLM confidence cannot skip human review** — high model confidence never bypasses
  Human Review.
- [ ] **Electron shell must not increase authority** — the safe-shell (read-only IPC
  allowlist) grants no execution authority; local desktop state is not an approval source.
- [ ] **Action Field is workspace, not execution plane** — the Action Field is where humans
  inspect/edit/preview; it is not an execution surface.

## 5. Product behavior checklist

- [ ] Decomposition is mock-only and candidate-only (`candidateOnly: true`,
  `humanReviewRequired: true`).
- [ ] No auto-promotion, no auto-approval, no auto-execution.
- [ ] Human approval is required and is server-authoritative; four-eyes (creator ≠
  approver) is enforced.
- [ ] Dry-run never marks an approval used and never builds a provider request/response
  payload.

## 6. Security checklist

Reviewer must confirm:

- [ ] **real LLM is disabled** (production `mode:"disabled"`; only mock/null resolved).
- [ ] **external execution is disabled** (`EXTERNAL_ACTIONS_ENABLED` unset/`false`; kill
  switch fails closed).
- [ ] **OAuth/token storage is absent** (no token vault; no packaged tokens/secrets).
- [ ] **deployment was not performed** (no `wrangler deploy` / `cf:deploy`).
- [ ] **publish/release/tag/upload was not performed** (no `npm publish`, no
  `gh release create`, no `git tag`, no artifact upload).

## 7. Audit checklist

- [ ] Audit persistence path is present and tenant-scoped; metadata is redacted (no
  token/secret/payload/hash).
- [ ] No secret or credential appears in logs, evidence, or build outputs.
- [ ] Known audit limitation (fail-open write; legacy no-op) is acknowledged (Conditional
  Go constraint), per [`RISK_REGISTER.md`](./RISK_REGISTER.md).

## 8. Documentation checklist

- [ ] Known limitations from [`ALPHA_RELEASE_READINESS.md`](./ALPHA_RELEASE_READINESS.md)
  are reviewed and, for a pilot, disclosed to participants.
- [ ] The RC gate authorization limit is understood: passing does not authorize real LLM,
  external execution, OAuth, token storage, or production deployment.

## 9. Decision checklist

Reviewer must confirm governance before deciding:

- [ ] **Main Safety Gate remains active** (enforcement active; `pull_request`,
  `non_fast_forward`, `deletion` rules present; `bypass_actors` empty).
- [ ] **required check is validate** (the CI Safety Gate context on the PR is `validate`).
- [ ] All §3–§8 items confirmed; decision recorded as Go / Conditional Go / No-Go.

## 10. Review record format

Record on the [`ALPHA_SIGNOFF_TEMPLATE.md`](./ALPHA_SIGNOFF_TEMPLATE.md): candidate commit,
PR/branch, reviewer name, date/time, validation results, evidence notes, the completed
checklists above, accepted known limitations, the decision, follow-ups, the explicit
non-authorizations, and the final human sign-off.
