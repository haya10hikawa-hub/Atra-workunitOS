# Approval Secret Threat Model

**Phase:** P6.0. **Baseline:** `main` @ `287515c`.

Threat model for tenant-scoped keyed approval-secret handling, produced **before** any
implementation. It backs [`TENANT_SECRET_PROVIDER_DESIGN.md`](./TENANT_SECRET_PROVIDER_DESIGN.md)
and [`APPROVAL_HASH_KEYING_PLAN.md`](./APPROVAL_HASH_KEYING_PLAN.md). It is documentation
only and authorizes no implementation.

---

## 1. Purpose

Enumerate the assets, trust boundaries, threats, abuse cases, and required mitigations for
keyed approval secrets, and define the No-Go conditions that must all be false before any
implementation phase may be proposed.

## 2. Assets

- Tenant secret material (per-tenant key used for keyed derivation).
- Approval records and their hash bindings (target/payload/operation).
- Canonical approval payloads.
- The persistent, redacted audit log.
- The human-readable evidence ledger and release decision records.

## 3. Trust boundaries

- Caller/UI → API route (untrusted input; tenant derived server-side).
- Route → repository → D1 (tenant-scoped context; server-authoritative).
- Approval verification boundary (server/database-authoritative; preview ≠ approval ≠
  execution).
- Documentation surface (evidence ledger / decision records) — must never hold secrets.

## 4. Threats

- **cross-tenant secret confusion**
- **replayed approval payload**
- **forged approval hash**
- **leaked tenant secret**
- **secret in logs**
- **secret in evidence ledger**
- **secret in release decision record**
- **approval payload canonicalization mismatch**
- **self-approval bypass**
- **external action execution without valid approval**

## 5. Abuse cases

- An attacker in tenant A tries to derive/verify against tenant B's secret (cross-tenant
  confusion) to forge a binding.
- An attacker replays a previously valid approval payload after use or expiry.
- An attacker crafts a canonicalization variant so writer and verifier disagree, slipping a
  forged hash past verification.
- A creator attempts to approve their own preview (self-approval bypass) to reach execution.
- Any actor attempts an external action without a valid, verified approval.
- A secret leaks via a log line, an evidence-ledger entry, or a release decision record.

## 6. Required mitigations

- **fail-closed verification** — missing/unresolved/errored secret ⇒ invalid; never pass
  open.
- **tenant mismatch rejection** — context tenant ≠ record tenant ⇒ reject.
- **canonical payload mismatch rejection** — any canonical divergence ⇒ reject.
- **replay review before activation** — expiry + one-time-use remain the replay guards;
  keyed hashing does not weaken them, and replay handling is reviewed before any activation.
- **four-eyes / self-approval constraints preserved** — creator ≠ approver; self-approval
  rejected, unchanged.
- **no secrets in logs** — audit redaction keeps secret/key/hash material out of logs.
- **no secrets in evidence ledger** — the ledger's prohibited-entries rule applies.
- **no secrets in release decision record** — decision records carry no secret material.

## 7. Residual risks

- Key management maturity (rotation/revocation/backup) is design-stage only; until an
  implementation phase lands, approval binding remains unkeyed SHA-256 (accepted, tracked in
  [`RISK_REGISTER.md`](./legacy/RISK_REGISTER.md) R4).
- Canonicalization versioning drift risk persists until the canonical form is versioned.
- Operator discipline is relied upon to keep secrets out of human-written records.

## 8. Open questions

- Where does tenant secret material live in production (KMS/secret manager) and how is it
  scoped? (Deferred to a production secret-storage gate — not this phase.)
- What is the exact dual-verification window during migration, and how is rollback proven?
- How are rotation and revocation surfaced to verification without a fail-open path?

## 9. No-Go conditions

Implementation is **No-Go** while any of these is true:

- **secrets visible in logs**
- **secrets visible in docs or evidence records**
- **tenant mismatch accepted**
- **replay accepted without review**
- **provider unavailable but approval passes open**
- **self-approval accepted**
- **approval verification skipped**
- **external execution enabled before this gate is implemented and reviewed**

## 10. Review requirements

- A human reviewer must confirm every §9 No-Go condition is false and every §6 mitigation is
  designed, then record the decision per [`ALPHA_SIGNOFF_TEMPLATE.md`](./legacy/ALPHA_SIGNOFF_TEMPLATE.md)
  and [`RELEASE_DECISION_RECORD.md`](./legacy/RELEASE_DECISION_RECORD.md).
- AI assistance may summarize this threat model, but a human makes and records the decision.
- No implementation phase may be proposed until this review is recorded.
