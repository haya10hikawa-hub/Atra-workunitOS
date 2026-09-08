# Runtime Authorization Gate Contract (P6-FIX-012, Issue #145)

**Status: CANONICAL — CURRENT PRODUCT-INDEPENDENT SAFETY CONTRACT.** Product authority: NONE.

The final gate that turns a **verified Approval Chain Linkage** plus a
**runtime-eligible Human Decision** into an opaque `authorized_not_executed`
receipt — and only after an **exact-binding atomic ApprovalStore claim** wins.

Baseline: `main` @ `0533671647f4b0b06833b962c3d7cd2dea66dc05` (P6-FIX-011 merged).

## Invariant chain

```
AI proposes. Rules guard. Humans decide.
Human Decision ≠ Approval ≠ Review Evidence ≠ Identity Independence ≠ Preview
Approval ≠ Linkage ≠ Runtime Authorization ≠ Execution
Runtime Authorization Receipt ≠ bearer token ≠ provider credential ≠ ExecutionResult
Draft ≠ Sent.  Dry-run ≠ Authorization ≠ Execution.
Validation / hash equality / record existence alone grant nothing.
Model confidence is not evidence.
Client-supplied identity/role/decision/linkage/hash/result/boolean grants nothing.
Every missing/malformed/stale/cross-tenant/mismatched/expired/revoked/used/
replayed/indeterminate input fails closed.
```

## Three layers

1. **Pure policy** — `app/lib/phase6/runtimeAuthorization/` (imports only inert
   Phase 6 policy modules + the SHA-256 hash / ISO-timestamp leaves). No routes,
   repositories, D1, resolvers, env, provider clients, Next.js, UI, or Electron;
   the P7.1 MAC module stays unwired. Determines evidence + policy eligibility
   only — never claims, consumes, persists, audits, calls a provider, creates an
   ExecutionResult, or promotes a WorkUnit.
2. **Server gate** — `app/lib/security/runtimeAuthorizationGate.ts` +
   `runtimeAuthorizationEvidenceResolver.ts`. Derives the executor from the
   current authenticated session, loads all evidence from the
   server-authoritative resolver (never the client), re-runs eligibility,
   rechecks RBAC + kill switch immediately before the exact-binding atomic
   claim, and constructs the receipt only after the claim wins. Imports no
   provider client and performs no external write.
3. **Integration** — the tools route routes external operations through the gate
   (returning `authorized_not_executed`, never `executed`); the dry-run route
   requires the real execute permission and never consumes.

## Human Decision runtime matrix (all required)

```
decision_status === "ready_for_future_gate_review"
decision_outcome === "pass"
decision_impact_scope === "action_readiness_assessment"
evidence_accepted === true
approval_required === true
execution_required === true
promotion_required === false        // no promotion gate exists in this patch
four_eyes_required === true
self_approval_blocked === true
no_go_flags.length === 0
+ the canonical Human Decision validator, run internally on a single-read snapshot
```

Free text (`allowed_use`, rationale, summary, role) and model confidence never
expand authority. A fabricated validator result cannot pass.

## Executor identity

Derived from the current authenticated session via
`createCanonicalSessionIdentity` with `actor_kind: "executor"`. Rejected: dev,
anonymous, expired (inclusive), cross-tenant, service-account, delegation, and
malformed sessions. Enforced: `executor.tenant_id === authorization.tenant_id`
and `executor.user_id !== linkage.approver_id`. Identity equality is canonical
`tenant_id + user_id` — never role, email, display name, or session id.

## Exact-binding atomic claim

`ApprovalStore.claimApprovalForRuntime` / `ApprovalRecordRepository.claimForRuntime`
require, atomically: tenant, Approval id, WorkUnit, ActionPreview, action type,
target hash, payload hash, `status = 'approved'`, `used_at IS NULL`, and
`expires_at > claimedAt`. Any mismatch or lost race claims 0 rows / returns
false. Inclusive-fail expiry is harmonized across `verifyApproval` (`now >=
expiresAt`), the in-memory claim (`claimedAt >= expiresAt`), and D1
(`expires_at > claimedAt`). The legacy unbound `markApprovalUsed` remains for
back-compat but is never used by the final gate.

## Authorization expiry

```
expires_at = min(linkage_expires_at, preview_expires_at, approval_expires_at,
                 executor_session_expires_at, issued_at + 30s)
issued_at must strictly precede expires_at (exactly-at-expiry is expired)
```

## Canonical receipt

Domain `atra.runtime-authorization`, version `1`, canonicalization
`atra-sorted-json-v1`, algorithm `sha256`. `authorization_hash` is an integrity
identifier over the exact-allowlist payload (which excludes the hash itself and
carries no raw target/payload, email, session, role, token, secret, or env
value). The deterministic idempotency key + authorization id bind every envelope
field plus the executor canonical user id (no `Date.now()`, no randomness, no
client key). `status` is always `authorized_not_executed`; the receipt is opaque,
frozen, and is not a bearer credential, provider request, or ExecutionResult.

## Persistence note

No Phase 6 evidence table and no D1 migration are added in this Issue. The
default production evidence resolver is **default-deny**, so production runtime
authorization is closed by construction until a future patch persists the full
server-authoritative evidence bundle.

## P6-FIX-012 trust-gap repairs (PR #163 review)

- **Temporal freshness.** The authoritative authorization instant is minted by an
  injectable trusted clock **after** the final asynchronous evidence read (never
  before), and drives executor-session validation, Linkage verification, Human
  Decision eligibility, expiry derivation, and the CAS. A slow resolver that
  crosses an expiry boundary fails closed; the client never supplies the time.
- **One authoritative snapshot.** The eligibility evaluator snapshots the Linkage
  once and deep-snapshots the Linkage context (and every nested source) once
  before verification; `verifyApprovalLinkage`, the Human Decision matrix,
  envelope comparison, approver lookup, expiry, and idempotency all read those
  inert frozen snapshots. Every original scalar/array element is read at most
  once per evaluation.
- **One binding envelope.** The gate snapshots the resolver bundle once; the
  claim and the receipt both derive from `eligibility.evidence`, so the claim
  binding always equals the receipt binding.
- **Post-claim-only receipt.** The branded receipt constructor lives in the
  server-private `runtimeAuthorizationReceipt.ts`, imported ONLY by the gate and
  reached only after a winning CAS. No pure export turns plain evidence into a
  branded receipt.
- **Dry-run parity.** The dry-run route runs the SAME non-consuming core
  (resolver, post-resolution timestamp, executor, Linkage, HD matrix,
  executor-vs-approver, execute RBAC, kill switch, envelope). A default-deny /
  missing evidence resolver returns `not_ready` even with a valid Preview↔Approval
  binding, an enabled kill switch, and an owner caller. Preview↔Approval binding
  is a local defense and never sufficient for `verified`.
- **Audit lifecycle.** A typed sink receives `requested → eligible → claimed →
  created` on success and `rejected` / `replayed` / `blocked` on failure; a false
  CAS emits `replayed` and never `claimed`/`created`. Emissions are redacted, and
  a throwing sink never breaks the gate.
- **Claim input validation.** All ApprovalStore/claim implementations reject a
  malformed/non-ISO `claimedAt`; inclusive-fail expiry (`claimedAt >= expiresAt`)
  is preserved and D1/in-memory predicates stay equivalent.

## P6-FIX-012 claim-adjacency repairs (PR #163 review, round 3)

- **Claim-adjacent final checks.** Asynchronous evidence resolution is separated
  from synchronous finalization. The consuming gate (`authorizeRuntimeCommand`)
  performs the FINAL RBAC + kill-switch rechecks itself, immediately before the
  atomic claim; there is NO `await`, audit sink flush/emit, logger call, or other
  externally-supplied callback between those checks and the claim invocation. The
  dry-run reuses the shared synchronous evaluator (`evaluateResolvedRuntimeAuthorization`)
  and its own final checks but never claims.
- **Buffered audit (no callback in the critical window).** Redacted lifecycle
  events are buffered locally and the externally-supplied sink is flushed ONCE,
  after the terminal result — never before the claim. A hostile sink that
  disables the kill switch or flips RBAC cannot affect a claim, because it is not
  invoked in the pre-claim window (proven by an instrumented CLAIM-before-SINK
  ordering test, a microtask test, and a malicious-sink test).
- **Durable, awaited persistence.** The audit sink is a batch `flush(events)`;
  the route implementation AWAITS `persistAuditEvent` per event in order
  (internally fail-open), so persistence completes within the request lifecycle.
  Fire-and-forget (`void persistAuditEvent`) is removed from the runtime-authorization
  path. Success persists `requested → eligible → claimed → created`; a false CAS
  persists `requested → eligible → replayed` and never `claimed`/`created`. Audit
  failure remains fail-open and never changes the authorization result.
- **Canonical audit reasons.** `runtime_authorization_rbac_denied` and
  `runtime_authorization_kill_switch_off` are added to the canonical issue-code
  allowlist, so blocked / RBAC-denied audit events retain exactly one allowlisted
  reason code without exposing raw values.
