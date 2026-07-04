# P7.1 Runtime Security Sign-off

**Phase:** P7.1 (security lane). **Baseline:** `main` @ `fcc67a1`. **Recorded:** 2026-07-03.

This is the explicit sign-off record required before any P7.1 runtime security code is
added, per [`TSP_DESIGN_REVIEW_CLOSURE.md`](./TSP_DESIGN_REVIEW_CLOSURE.md) §13 (future
implementation gates), [`TENANT_SECRET_PROVIDER_DESIGN.md`](./TENANT_SECRET_PROVIDER_DESIGN.md)
§12, and the P7.1 phase instruction ("There must be an explicit human sign-off record for
P7.1 before adding runtime code"). The requesting human operator issued the P7.1 phase
instruction that authorizes exactly this scope; this file records that authorization in-repo
before the first runtime file is created.

## Authorized scope

- P7.1 introduces isolated runtime security utilities.
- P7.1 does not wire into ApprovalStore.
- P7.1 does not change approval verification behavior.
- P7.1 does not enable external actions.
- P7.1 does not enable real LLM.
- P7.1 does not store real secrets.
- P7.1 uses fake/injected secrets only in tests.
- P7.1 is allowed to proceed only as a non-wired implementation gate.

## Scope boundaries confirmed

- [x] Canonical Approval Payload types, serializer, and validation — isolated module only.
- [x] TenantSecretProvider keyed interface + test-only in-memory fake provider — no
  production retrieval, no KMS, no secret storage.
- [x] Keyed MAC helper (HMAC-SHA-256 via Node `crypto`, already used by the repo) +
  constant-time comparison + explicit-input verification helper.
- [x] Behavioral tests with injected fake secrets only.
- [x] No ApprovalStore / actionApproval / approvalPreviewBinding / externalActions /
  approvalStoreAdapter behavior change. No API route, UI, Electron, workflow, package,
  or migration change.
- [x] Risk Register R4 remains open: the live approval binding is not changed by P7.1;
  wiring is a separate future gate per `TSP_DESIGN_REVIEW_CLOSURE.md` §13.

## Decision

Sign-off granted for the non-wired implementation scope above, recorded before runtime code.
Any wiring into the live approval path requires a new, separate sign-off and phase gate.
