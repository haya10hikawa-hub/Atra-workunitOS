# Approval Hash Keying Plan

**Status: PLAN — FUTURE / NOT IMPLEMENTED.** Product authority: NONE.

**Phase:** P6.0. **Baseline:** `main` @ `287515c`.

A planning document describing **how** approval-hash binding could move from unkeyed hashing
to tenant-scoped keyed derivation, and **what must be true first**. It is
[`TENANT_SECRET_PROVIDER_DESIGN.md`](./TENANT_SECRET_PROVIDER_DESIGN.md)'s companion. It is
**documentation only** — it prescribes no implementation code and changes no runtime
behavior.

---

## 1. Purpose

Give a reviewable, staged path for keyed approval hashing so that a future implementation
phase has explicit prerequisites, migration gates, and failure-mode reviews — without
writing or wiring any code now.

## 2. Current state

> **Current approval hashing is documented as unkeyed SHA-256 over canonical approval payloads.**

Helper-level primitives already exist from a prior phase (canonical hashing, an explicit
legacy SHA-256 helper, and a tenant-secret HMAC-SHA256 helper that reads no runtime
environment). These are **helper-only and not wired** into approval record generation or
verification; the live binding remains unkeyed SHA-256. This plan does not change that.

## 3. Target state

> **Target approval hashing should use tenant-scoped keyed derivation such as HMAC over the canonical approval payload, subject to implementation review.**

The target is that an approval hash is bound to the tenant's secret so a public digest alone
cannot forge a valid binding — reached only through the staged gates below and a recorded
human review.

## 4. Canonical payload requirements

- **canonical payload stability** — the canonical serialization must be stable and
  order-independent, so the same logical approval always yields the same canonical material.
- **target / payload / operation included in canonical material** — the canonical input must
  bind the action target, the payload, and the operation, so a hash cannot be reused across
  different actions.
- The canonical form must be documented and versioned before any keyed migration.

## 5. Keyed hash requirements

- **tenant id included in or bound to verification context** — verification derives the key
  from the tenant resolved in context, never from a caller-supplied field.
- Keyed derivation must be **deterministic** for the same tenant + canonical payload and
  must **fail closed** when the secret is unavailable.
- Comparison must be constant-time (using the existing helper-level primitive's approach);
  this plan does not implement or rewire it.

## 6. Migration strategy

Staged, in prose only (no code in this phase):

- **planning-only** — this document; design and threat model reviewed, nothing wired.
- **dual-read or compatibility review** — review how legacy unkeyed and keyed bindings would
  be verified during transition, with **legacy migration reviewed before activation**.
- **keyed-write gate** — a separately-approved gate before any keyed hash is ever written to
  a record; requires all §4/§5 requirements and a recorded sign-off.
- **legacy retirement gate** — a final separately-approved gate before unkeyed verification
  is retired, with rollback documented.

Each stage is fail-closed and requires human sign-off; no stage is entered automatically.

## 7. Compatibility strategy

- Preserve **approval expiry preserved** and **one-time-use semantics preserved** (the
  existing compare-and-set one-time-use) unchanged across any migration.
- Preserve **four-eyes / self-approval constraints preserved** (creator ≠ approver;
  self-approval rejected) unchanged.
- Preserve **audit event compatibility preserved** — audit event shapes stay valid; no
  secret or key material is added to any event.
- Explicit legacy compatibility (the existing legacy SHA-256 helper) is the reference point
  for dual-verification review; **legacy migration reviewed before activation**.

## 8. Failure modes

- Missing/unresolved tenant secret → fail closed (never pass open).
- Canonical payload mismatch → reject.
- Tenant mismatch → reject.
- Replay of a previously valid payload → **replay protections reviewed** before activation
  (expiry + one-time-use are the current guards; keyed hashing does not replace them).
- Canonicalization drift between writer and verifier → treated as mismatch (reject).

## 9. Test plan

- Design the eventual tests to run **without live secrets**: deterministic verification,
  tenant-mismatch rejection, canonical-payload-mismatch rejection, fail-closed on missing
  secret, and preservation of expiry / one-time-use / four-eyes.
- This phase itself adds only a static, read-only doc-contract test.

## 10. Rollout gate

Rollout requires, in order: this plan reviewed; the design gate's security properties met;
the threat model's No-Go conditions all false; **replay protections reviewed**; **legacy
migration reviewed before activation**; and a recorded human sign-off. Only then may a
separate implementation phase be proposed. Rollout authorizes nothing by itself.

## 11. What this plan does not authorize

This plan does not authorize:

- **implementation**
- **approval hash runtime behavior changes**
- **approval record generation changes**
- **approval verification behavior changes**
- **real LLM enablement**
- **external execution**
- **OAuth/token storage**
- **deployment**
- **publish**
- **release creation**
- **release tags**
- **artifact upload**

Every requirement above (**canonical payload stability**, **tenant id included in or bound
to verification context**, **target / payload / operation included in canonical material**,
**replay protections reviewed**, **approval expiry preserved**, **one-time-use semantics
preserved**, **four-eyes / self-approval constraints preserved**, **audit event
compatibility preserved**, **legacy migration reviewed before activation**) is a
precondition for a *future* phase, not an action taken now.
