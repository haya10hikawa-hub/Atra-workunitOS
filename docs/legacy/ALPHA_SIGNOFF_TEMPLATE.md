# Alpha Sign-off Template

**Phase:** P5.3. **Baseline:** `main` @ `158c074`.

Fillable record for a human operator's Alpha Release Candidate decision. Copy this file per
candidate, fill every field, and archive it with the evidence. Used after
[`ALPHA_OPERATOR_RUNBOOK.md`](./ALPHA_OPERATOR_RUNBOOK.md) and
[`MANUAL_REVIEW_PROTOCOL.md`](./MANUAL_REVIEW_PROTOCOL.md).

> **AI proposes. Rules guard. Humans decide.** This record is a human decision.

---

## 1. Candidate commit

- Commit SHA: `__________`
- Clean working tree (`git status --short`): [ ] yes

## 2. PR / branch

- PR: `#____` — URL: `__________`
- Branch: `__________`

## 3. Reviewer

- Name (accountable human): `__________`
- Role: `__________`

## 4. Date / time

- Review date/time (ISO 8601): `__________`

## 5. Validation results

- `npm test`: `____` tests, **0** failures — [ ] pass
- `npm run alpha:safety-gate`: 35 checks — [ ] pass
- `npm run lint`: 0/0 — [ ] pass
- `npm run build`: [ ] pass  ·  `npm run cf:build`: [ ] pass  ·  `npm run electron:build:check`: [ ] pass
- `git diff --check`: [ ] clean

## 6. Evidence links / notes

- CI run / `validate` check URL: `__________`
- Evidence notes: `__________`

## 7. Manual review checklist

- [ ] Evidence checklist confirmed (protocol §3)
- [ ] Boundary checklist confirmed: candidate != formal WorkUnit; preview != approval;
  approval != execution; draft != sent; LLM confidence cannot skip human review; Electron
  shell must not increase authority; Action Field is workspace, not execution plane
- [ ] Product-behavior, security, audit, documentation checklists confirmed (protocol §5–§8)
- [ ] Governance confirmed: Main Safety Gate active; required check is `validate`

## 8. Known limitations accepted

- [ ] Reviewed known limitations (audit fail-open / legacy no-op; unkeyed approval hash /
  `TenantSecretProvider` missing; in-memory rate limiter; no deploy proof; no integration/
  e2e/live-D1/UI tests) per [`RISK_REGISTER.md`](./RISK_REGISTER.md).
- Notes: `__________`

## 9. Go / Conditional Go / No-Go decision

- Decision (circle one): **Go**  /  **Conditional Go**  /  **No-Go**
- If Conditional Go, allowed mode(s): `__________`
- Rationale: `__________`

## 10. Required follow-up actions

- `__________`

## 11. Explicit non-authorizations

This sign-off certifies a local, non-production build decision only. It grants no further
authorization:

- This sign-off does not authorize real LLM enablement.
- This sign-off does not authorize external execution.
- This sign-off does not authorize OAuth or token storage.
- This sign-off does not authorize production deployment.
- This sign-off does not authorize publishing, release creation, release tags, or artifact upload.

## 12. Final human sign-off

- Operator signature (name): `__________`
- Date: `__________`
- Statement: "I, the named operator, reviewed the evidence and made this release decision.
  The system assisted but did not decide autonomously."
