# Canonical Identity Independence Contract

**Phase:** P6-FIX-010 (Issue #143). **Modules:** `app/lib/phase6/canonicalIdentity/`,
`app/lib/phase6/identityIndependence/`.

Defines the canonical user identity model, the trusted identity sources, and the pure,
non-authorizing identity-independence gate that enforces self-approval prohibition by
canonical identity comparison. Grounded in
[`FOUR_EYES_REVIEW_EVIDENCE_CONTRACT.md`](./FOUR_EYES_REVIEW_EVIDENCE_CONTRACT.md) and
[`HUMAN_DECISION_RECORD_CONTRACT.md`](./HUMAN_DECISION_RECORD_CONTRACT.md).

---

## 1. Purpose

`self_approval_blocked: true` on a Human Decision Record is a policy declaration, not an
identity comparison, and the Four-Eyes Review Evidence artifact records two reviewer ID
strings without proving where they came from. This contract closes that gap: it defines
what a user identity canonically IS, which server-side sources may produce one, and the
exact independence rules — so that "two different people reviewed and a third approved"
is a verified property of trusted identities, never an assertion assembled from
caller-supplied strings.

## 2. Canonical User Identity

Canonical user identity is `tenant_id` + `user_id`. Two identities denote the same user
exactly when both fields are equal. Everything else — role name, email address, display
name, provider name, session ID alone, model output, client-supplied actor fields — is
NOT identity and never establishes or differentiates it.

**Role difference does not prove identity difference.** One user acting under multiple
roles, sessions, or email aliases is still one identity: the same `tenant_id + user_id`
as reviewer and approver conflicts even when the roles differ.

A `CanonicalIdentity` records: `tenant_id`, `user_id`, `actor_kind` (`requester`,
`creator`, `reviewer`, `approver`, `executor`), `identity_source`, `source_record_id`,
`observed_at`, and `subject_type` (`human_user` only). It is an opaque,
constructor-produced compile-time type with a module-private brand that is never
serialized and never exported. A TypeScript cast can still lie: the type is a
compile-time PROVENANCE boundary, not cryptographic proof — every downstream consumer
re-validates canonical identities at runtime.

## 3. Trusted Identity Sources

Exactly two sources are accepted:

- `authenticated_session` — `createCanonicalSessionIdentity(session, input)` derives
  `user_id` from `session.userId`, `tenant_id` from `session.tenantId`, and
  `source_record_id` from `session.sessionId` of a previously authenticated
  `SessionContext`. Callers supply only the actor kind, the expected tenant, and the
  observation timestamp — never a user or tenant ID.
- `stored_action_preview_creator` — `createCanonicalPreviewCreatorIdentity(preview,
  input)` derives `user_id` from the stored `ActionPreviewRow.creatorUserId`,
  `tenant_id` from the stored row's tenant, and `source_record_id` from the stored
  row's id. The row must already have been fetched by trusted server code; the module
  never reads a repository, client body, or request field.

There is deliberately NO generic constructor accepting arbitrary user and tenant
strings, and the constructor input allowlists reject any smuggled identity field.

Fail-closed session policy: a session identity is rejected when the session object is
malformed; `userId`, `tenantId`, or `sessionId` is missing or empty (an anonymous
session is never an identity); the expected tenant mismatches; `expiresAt` is missing or
malformed; `observed_at >= expiresAt` (exactly-at-expiry is already expired); or
`isDevSession` is anything other than the literal `false` — a development or
indeterminate session is not approval-grade identity. No clock is read anywhere;
`observed_at` is supplied and validated against the pinned ISO-8601 UTC profile.

Fail-closed creator policy: a missing stored creator (pre-P1 row) is rejected; no
fallback or anonymous creator is ever synthesized.

## 4. Service Accounts and Delegation

For this patch, explicitly fail-closed:

- Human review and approval require the supported human-session identity source;
  `subject_type` is `human_user` only.
- Service-account reviewer or approver identities are unsupported: service-account
  markers (`is_service_account`, `service_account_id`, and camelCase forms) fail with
  `identity_subject_unsupported`.
- Delegated approval is unsupported without separate delegation evidence: delegation
  markers (`delegated_for_user_id`, `delegation_evidence_id`, `on_behalf_of`, and
  camelCase forms) fail with `delegation_not_supported`. A `delegated_for_user_id`
  string never creates independence.
- Role impersonation never creates independence (role is not identity; see §2).

## 5. Hardened Review Attestation Identity

`createReviewAttestation` no longer accepts the structural
`ReviewAttestationServerContext` (`{ tenant_id, reviewer_id }`); that type is removed
from the public surface with no alternate constructor preserved. The reviewer argument
must be a constructor-produced `CanonicalIdentity` with `actor_kind === "reviewer"`,
`identity_source === "authenticated_session"`, the supported human subject type, and a
tenant matching the validated source Human Decision. Because a cast can lie, the
identity is defensively re-validated at runtime (`invalid_reviewer_identity`). The
attestation output schema is unchanged: it stores the derived canonical reviewer ID and
tenant ID and never stores session tokens, session IDs, email addresses, roles, or raw
session data.

## 6. Snapshot Consistency (Validation/Use TOCTOU)

Every unknown object that crosses an identity boundary is reduced to a single-read
snapshot before it is used, and validation and use always operate on that **same**
snapshot:

```text
single-read snapshot → validate that exact snapshot → construct / compare / project
                       using that exact snapshot (the original is never re-read)
```

This applies at all three boundaries:

- **`createReviewAttestation`** snapshots the reviewer identity (and the source Human
  Decision) once; validation, the actor-kind/source/subject/tenant checks, and the
  derived stored `reviewer_id`/`tenant_id` all read that snapshot.
- **`verifyIdentityIndependence`** takes one top-level snapshot and then one nested
  snapshot per artifact and per identity position; every provenance, tenant, binding,
  and canonical-user comparison reads only those snapshots.
- **`createIdentityIndependenceAuditEvent`** takes one snapshot of the input, evaluates
  the verifier on it, and projects the record identifiers and `evaluated_at` from that
  same snapshot — so the decision and its audit projection describe the same evaluated
  input.

A hostile getter or `Proxy`/`ownKeys` trap can therefore never return one value at
validation time and a different value at use time: an identity that validates as one
reviewer cannot be stored or compared as another, and the audit event cannot emit a
value the verifier never saw (including a sensitive string). A throwing getter or
`ownKeys` trap fails closed with the existing stable issue vocabulary and never escapes.
This is snapshot **consistency** only; it does not convert the compile-time opaque
brand into cryptographic proof, and future runtime gates (Issue #145) must still
re-check identity server-side immediately before use.

## 7. Identity Independence Verifier

`verifyIdentityIndependence(input)` is pure, deterministic, clock-free, and I/O-free. It
consumes the validated Human Decision Record, the Four-Eyes Review Evidence artifact,
canonical requester / creator / first-reviewer / second-reviewer / approver identities,
an optional canonical executor identity, the expected tenant / Human Decision /
WorkUnit / ActionPreview IDs, and the evaluation timestamp. Every artifact and identity
is re-validated internally through the real production validators; a caller-supplied
result object is never accepted, and unknown top-level input fields fail closed.

Provenance rules (all fail-closed):

- requester, both reviewers, approver, and executor sources are `authenticated_session`;
- the creator source is `stored_action_preview_creator`;
- every actor kind matches its position;
- every identity tenant, the Human Decision tenant, and the evidence tenant match the
  expected tenant;
- the canonical reviewer identities match `first_reviewer_id` / `second_reviewer_id` in
  the Review Evidence;
- the Human Decision and the evidence's source Human Decision both match the expected
  Human Decision ID (transitively binding evidence to decision);
- the evidence WorkUnit matches the expected WorkUnit;
- the creator's `source_record_id` matches the expected ActionPreview ID;
- every required identity is present — a missing identity fails the decision;
- session identities were valid, non-development, and unexpired at `observed_at`
  (enforced by the only production source of session identities, the canonical
  constructor).

Equality rules (canonical `tenant_id + user_id`, never role):

| Comparison                        | Result on equality                                  |
| --------------------------------- | --------------------------------------------------- |
| first reviewer vs second reviewer | fail — `duplicate_reviewer_identity`                |
| requester vs approver             | fail — `self_approval_forbidden`                    |
| creator vs approver               | fail — `self_approval_forbidden`                    |
| first reviewer vs approver        | fail — `self_approval_forbidden`                    |
| second reviewer vs approver       | fail — `self_approval_forbidden`                    |
| executor vs approver              | NOT evaluated here — deferred to Issue #145 (see §8) |

The issue `field` names the conflicting actor position; the actual user ID never
appears in any issue.

## 8. Executor Rule Deferral

The executor identity is represented in the model and, when present, validated for
shape, actor kind, trusted source, and tenant — but this patch deliberately does NOT
decide whether the executor must differ from the approver. That rule belongs to the
Issue #145 runtime authorization gate. A present, valid executor identity is never
interpreted as execution permission and grants nothing.

## 9. Stable Result and Issue Codes

The verifier returns a frozen `{ ok, issues }` with a defensively copied, frozen issue
array. Messages are stable `code:field` strings that never contain supplied identity
values. The single canonical exported code list is `CANONICAL_IDENTITY_ISSUE_CODES` in
`app/lib/phase6/canonicalIdentity/validation.ts` — the independence gate re-uses it and
maintains no duplicate list:

`invalid_identity_input`, `identity_state_missing`, `identity_source_untrusted`,
`identity_session_expired`, `identity_tenant_mismatch`, `identity_actor_kind_mismatch`,
`identity_subject_unsupported`, `identity_evidence_mismatch`,
`duplicate_reviewer_identity`, `self_approval_forbidden`, `delegation_not_supported`,
`identity_validation_exception`.

## 10. Redacted Audit Projection

`createIdentityIndependenceAuditEvent(input)` runs the verifier internally (a fabricated
`ok: true` object can never produce a verified event) and projects a frozen, redacted
event carrying only: the event kind (`identity_independence_verified`,
`self_approval_forbidden`, or `identity_independence_rejected`), the expected Human
Decision / WorkUnit / ActionPreview identifiers, the boolean outcome, allowlisted stable
issue codes, and the evaluation timestamp. Every code passes the canonical allowlist;
non-canonical entries are never echoed and force the rejected state via the fallback
code `identity_validation_exception`. Malformed input produces a rejected, fully
redacted event and never throws.

It never exposes requester / creator / reviewer / approver / executor user IDs, session
IDs, email addresses, roles, raw session objects, payloads, payload hashes, secrets,
tokens, ApprovalStore records, or authorization material. The factory never calls the
runtime audit logger.

## 11. Existing Route Responsibility

The ActionPreview approval route (`app/api/workunit/[id]/approval/route.ts`) keeps its
immediate LOCAL defense, behaviorally unchanged in this patch: the creator comes from
the stored preview row, the approver from the authenticated session, a missing creator
fails closed, and creator-equals-approver returns `self_approval_forbidden`. The Phase 6
identity gate is broader (requester / creator / reviewers / approver provenance and
cross-role equality) and must never replace or weaken that local defense. The gate is
NOT wired into the route in this patch.

## 12. Issue #144 / #145 Responsibility

- **Issue #144:** binding Human Decision, Review Evidence, ActionPreview, and
  ApprovalStore records (canonical payload construction, record linkage).
- **Issue #145:** the final runtime authorization gate with immediately-before-use
  identity re-checks, and the executor-separation decision (§8).

## 13. Non-authorization Statement

Identity verification is not approval, not authorization, and not execution permission.
This contract authorizes no ApprovalStore approval, no approval creation, no runtime
authorization, no action execution, no external provider write, no Formal WorkUnit
promotion, no persistence, no D1 access, no SQL generation or execution, no route
change, no UI behavior, no Electron behavior, no deployment, and no release. Validation
success is non-authorizing. AI proposes. Rules guard. Humans decide.
