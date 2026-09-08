# Next Capability Gate

**Phase:** P5.5. **Baseline:** `main` @ `cf24ca3`.

Defines, per risky capability, the specific conditions that must be satisfied, reviewed, and
recorded **before any implementation of that capability may begin**. It is opened only after
Alpha exit ([`ALPHA_EXIT_CRITERIA.md`](../../legacy/ALPHA_EXIT_CRITERIA.md)) is recorded.

> **Gate principle: A capability may only be implemented after its specific gate is satisfied, reviewed, and recorded. Passing this document does not authorize implementation by itself.**

This phase adds **documentation and a static test only** — it enables no capability and
changes no product behavior.

---

## 1. Purpose

Prevent any risky capability from being turned on "because Alpha passed". Each capability
has its own gate with concrete, reviewable prerequisites; the gate must be satisfied,
human-reviewed, and recorded before code is written.

## 2. Scope

- **In scope:** the prerequisites and sign-off required to *authorize planning of* a
  specific capability.
- **Out of scope:** implementing any capability. This document authorizes nothing on its
  own (see the gate principle).

## 3. Gate principle

**A capability may only be implemented after its specific gate is satisfied, reviewed, and
recorded. Passing this document does not authorize implementation by itself.** Each gate is
fail-closed: if any prerequisite is unmet or unreviewed, the capability stays **No-Go**.

## 4. Capability categories

Each of the following is a separately gated capability:

- **real LLM provider enablement**
- **external action execution**
- **OAuth/token storage**
- **production deployment**
- **Electron authority expansion**
- **persistent runtime evidence storage**

## 5. Universal prerequisites

Every capability gate additionally requires all of these:

- **P1 through P5.4 preserved**
- **Main Safety Gate active**
- **validate required**
- **full validation passing**
- **evidence ledger updated**
- **release decision record updated**
- **human sign-off recorded**
- **rollback / disable plan documented**
- **secret handling plan documented**
- **observability plan documented**

## 6. Real LLM gate

To open real LLM provider enablement for planning, require:

- **provider allowlist**
- **tenant-scoped secret handling**
- **fail-closed provider errors**
- **prompt/input redaction review**
- **budget/rate limits**
- **audit events for provider calls**
- **test plan without live secrets**

The readiness gate ([`REAL_LLM_READINESS_GATE.md`](../../REAL_LLM_READINESS_GATE.md)) remains the
enforcement chokepoint; it stays fail-closed at `provider_implementation_missing`.

## 7. External execution gate

To open external action execution for planning, require:

- **operation allowlist**
- **server-side authorization**
- **approval verification**
- **idempotency / replay protection**
- **dry-run preview**
- **audit events**
- **kill switch**
- **rollback plan**

The `EXTERNAL_ACTIONS_ENABLED` kill switch stays default-off until this gate is satisfied and
recorded.

## 8. OAuth / token storage gate

To open OAuth / token storage for planning, require:

- **threat model**
- **encrypted storage design**
- **token rotation / revocation**
- **tenant isolation**
- **least privilege scopes**
- **no token exposure in logs**
- **manual review before enabling**

## 9. Deployment / production gate

To open production deployment for planning, require:

- **production environment review**
- **secret management plan**
- **rollback plan**
- **monitoring / alerting**
- **incident response owner**
- **backup / retention plan**
- **no public release without human sign-off**

## 10. Electron authority gate

Electron authority expansion stays **No-Go** until a dedicated gate defines: an architecture
decision record, main/preload/renderer trust boundaries, a narrow IPC allowlist, a local
storage policy (not an approval source), forbidden packaged secrets, an update/signing
strategy, and preserved server-authoritative approval — with human sign-off recorded. The
current safe-shell grants read-only IPC only and must not increase authority.

## 11. Observability / rollback gate

No capability opens without a documented observability plan (what is monitored, where audit
events go, how failures are detected) and a rollback / disable plan (how the capability is
turned off and what state must be unwound). For Alpha, the rollback is the default-off kill
switch; a real capability needs an explicit, tested rollback.

## 12. Evidence and sign-off requirements

Opening any gate requires: an updated evidence ledger entry, an updated release decision
record, and a recorded human sign-off per [`ALPHA_SIGNOFF_TEMPLATE.md`](../../legacy/ALPHA_SIGNOFF_TEMPLATE.md).
**AI assistance may summarize the gate evidence, but a human must make and record the
decision.**

## 13. Go / Conditional Go / No-Go criteria

- **Go (to plan the capability)** — the capability's §6–§11 gate and the §5 universal
  prerequisites are all satisfied, reviewed, and recorded. This authorizes *planning*, not
  a live capability.
- **Conditional Go** — prerequisites satisfied but bounded (e.g. dry-run/offline only) with
  disclosures and a recorded decision.
- **No-Go** — any prerequisite unmet/unreviewed, the Main Safety Gate weakened, or no human
  sign-off. This is the default state for every capability.

## 14. What this gate does not authorize

> **This gate does not authorize real LLM, external execution, OAuth/token storage, production deployment, publishing, release creation, release tags, artifact upload, database implementation, API routes, UI changes, or Electron authority expansion.**

Satisfying a gate authorizes a *separately-approved planning phase* for that one capability —
never the implementation itself, and never any other capability.
