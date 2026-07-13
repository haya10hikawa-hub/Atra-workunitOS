# Four-Eyes Review Evidence Contract

**Phase:** P6-FIX-009 (Issue #142). **Module:** `app/lib/phase6/reviewEvidence/`.

Defines the shape and boundaries of Review Attestations and Four-Eyes Review Evidence:
the pure, non-authorizing evidence model proving that two different humans reviewed one
exact Human Decision payload. Grounded in
[`HUMAN_DECISION_RECORD_CONTRACT.md`](./HUMAN_DECISION_RECORD_CONTRACT.md).

---

## 1. Purpose

`four_eyes_required: true` on a Human Decision Record is a policy declaration, not
evidence that two reviews occurred. This contract defines the separate, immutable
evidence artifacts that record two independent human reviews of one exact payload,
so future gates (Issue #143 identity enforcement, Issue #144 ApprovalStore linkage,
Issue #145 runtime authorization) can consume verifiable review evidence instead of a
bare policy flag.

## 2. Definition of Review Attestation

A Review Attestation is a non-executing, constructor-produced artifact recording that one
human reviewed one exact Human Decision payload: it carries the attestation id, the
server-owned tenant and reviewer identity, the source Human Decision id, the source
WorkUnit id, the 64-character lowercase hexadecimal reviewed payload hash, and the review
timestamp — never the raw reviewed payload.

## 3. Definition of Four-Eyes Review Evidence

A Four-Eyes Review Evidence artifact combines exactly two Review Attestations by two
different reviewers over the same tenant, the same Human Decision, the same WorkUnit, and
the same reviewed payload hash, with a deterministic review timeline, a completion
timestamp, and a strictly later expiry timestamp.

## 4. What Review Evidence Is Not

Review Evidence is **not**:

- ApprovalStore approval
- approval creation
- runtime authorization
- execution permission
- action execution
- external action
- Formal WorkUnit promotion
- persistence
- an audit log write
- proof of identity
- production readiness

Review Evidence verification is not runtime authorization and is not execution
permission. Verification success grants nothing.

## 5. Server-Owned Identity Boundary

`tenant_id` and `reviewer_id` are server-owned: they come only from the server-owned
construction context, and `source_human_decision_id` comes only from the validated Human
Decision artifact.

The fail-closed policy is REJECT: untrusted input that carries any server-owned field
fails with `client_owned_identity_field`, so attempted mass assignment stays observable.

The evidence constructor derives every binding field (tenant, source ids, hash, reviewer
ids, attestation ids, review timestamps) from the two attestation artifacts; untrusted
evidence input carrying any of them is likewise rejected.

This contract establishes the ownership boundary only. Issue #143 connects it to
canonical server/session identities and enforces requester, creator, reviewer, and
approver independence. A structural TypeScript object is not cryptographic proof of
identity.

## 6. Trusted Type Boundary

`ReviewAttestation` and `FourEyesReviewEvidence` are opaque compile-time types carrying
module-private brands that are never serialized and never exported.
`createReviewAttestation` and `createFourEyesReviewEvidence` are the only production
functions returning them. The structural validators are non-narrowing: validator success
does not create the trusted types. Direct object literals, parsed JSON, database rows,
network data, casts, and deserialized values are unvalidated input and must be
reconstructed through the constructors. A TypeScript cast can always lie: the opaque
types are a compile-time provenance boundary, not cryptographic proof and not
authorization, and future runtime gates must still perform their own server-side
evidence, identity, tenant, hash, expiry, replay, RBAC, and kill-switch checks.

The source Human Decision must be a ValidatedHumanDecisionRecord, and its runtime shape
is still defensively re-validated because a cast can lie.

## 7. Construction Invariants

- The two attestation ids are different (`duplicate_review_attestation`).
- `first_reviewer_id !== second_reviewer_id` (`duplicate_reviewer_identity`).
- Both attestations share the same `tenant_id` (`review_tenant_mismatch`).
- Both attestations share the same `source_human_decision_id`
  (`review_source_human_decision_mismatch`).
- Both attestations share the same `source_workunit_id`
  (`review_source_workunit_mismatch`).
- Both attestations share the same `reviewed_payload_hash`
  (`review_payload_hash_mismatch`).
- The Human Decision tenant and id match both attestations.
- The review timeline is deterministic: `first_reviewed_at <= second_reviewed_at`, with
  equal timestamps tie-broken by ascending attestation id (`invalid_review_timeline`).
- `review_completed_at` must not precede either review (`invalid_review_timeline`).
- `review_expires_at` must be strictly later than `review_completed_at`
  (`invalid_review_timeline`).
- Construction returns a fresh frozen artifact; unknown fields are never copied; inputs
  are never mutated; construction success grants nothing.

## 8. Payload Hash Binding

`reviewed_payload_hash` must be exactly 64 lowercase hexadecimal characters. This
contract validates the format, binds the evidence to that hash, and compares it exactly
with the current payload hash at verification. A changed payload hash invalidates prior
Review Evidence (`review_payload_hash_mismatch`) without mutating or deleting the
historical evidence artifact. Canonical ApprovalStore payload construction and
cross-object canonicalization belong to Issue #144 and are not defined here.

## 9. Verification Context

Verification is pure and evaluates a constructed evidence artifact against server-owned
current state: tenant id, Human Decision id, WorkUnit id, current payload hash,
evaluation timestamp, an immutable revoked-evidence-id snapshot, and an immutable
consumed-evidence-id snapshot. The verifier reads no clock and performs no I/O.

The verifier fails closed when the evidence is structurally invalid, reviewer identities
are duplicated, the tenant / Human Decision / WorkUnit / payload hash mismatches, the
evidence is expired, revoked, or replayed, or required state is missing or malformed
(`review_evidence_state_missing`). Absent revocation or replay state is never treated as
"not revoked" or "not consumed".

## 10. Expiry, Revocation, and Replay

- Expiry is inclusive-fail: `evaluated_at >= review_expires_at` is expired
  (`review_evidence_expired`). Evaluation exactly at expiry fails.
- Revocation is represented in external verification state; a revoked evidence id fails
  with `review_evidence_revoked`. The evidence artifact itself is never mutated.
- Replay is represented in external verification state; a consumed evidence id fails
  with `review_evidence_replayed`. One-time-use enforcement state is owned by future
  gates; this contract only evaluates the supplied snapshot.

## 11. Stable Issue Codes

Validation, construction, and verification report only stable codes from
`REVIEW_EVIDENCE_ISSUE_CODES`, with messages of the exact form `code:field`. Messages
never include supplied values, payloads, or secrets.

## 12. Redacted Audit Projection

The pure audit factory accepts the evidence and the server-side verification context and
produces the verification decision internally by calling
`verifyFourEyesReviewEvidence(evidence, context)`. An external caller can never supply
the verification result: a fabricated `ok: true` object cannot produce a verified audit
event. `event_kind`, `ok`, and `issue_codes` are derived exclusively from the internally
produced decision, and `evaluated_at` is obtained defensively from the supplied context.

The frozen event carries only: the event kind (`four_eyes_review_evidence_verified` or
`four_eyes_review_evidence_rejected`), the review evidence id, the source Human Decision
id, the source WorkUnit id, the boolean outcome, the allowlisted stable issue codes, and
the evaluation timestamp.

Stable-code allowlist (defense-in-depth): every issue code is checked against the
canonical `REVIEW_EVIDENCE_ISSUE_CODES` before it may enter `issue_codes` — an arbitrary
non-empty string is never copied merely because it appears in a property named `code`. A
non-canonical or malformed issue entry is never echoed (not its code, field, message, or
value); it forces the event to the rejected state and is represented once by the stable
fallback code `review_evidence_validation_exception`. Codes are de-duplicated in
deterministic first-occurrence order.

Evidence identifiers are projected only after the evidence passes defensive structural
validation; a structurally invalid evidence object projects every identifier as the
literal `(invalid)` placeholder, and supplied malformed identifier values are not echoed.

It never exposes the raw reviewed payload, any payload body or content, the payload hash
(excluded: it is payload-derived material with no audit-side consumer in this patch),
reviewer identities (reviewer-level attribution belongs to the Issue #143 identity
boundary), secrets, credentials, session tokens, raw authorization material, or approval
records. It is I/O-free, never calls the runtime audit logger, and producing an audit
event authorizes nothing — no approval, no persistence, no runtime authorization, no
execution.

## 13. Non-authorization Statement

This Four-Eyes Review Evidence Contract authorizes no ApprovalStore approval, no approval
creation, no approval MAC generation or verification, no runtime authorization, no action
execution, no external provider write, no Formal WorkUnit promotion, no persistence, no
D1 access, no SQL generation or execution, no route, no UI behavior, no Electron
behavior, no deployment, and no release. AI proposes. Rules guard. Humans decide.
