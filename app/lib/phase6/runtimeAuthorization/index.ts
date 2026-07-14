/**
 * P6-FIX-012: public surface for the Phase 6 Runtime Authorization policy module
 * (Issue #145, docs/RUNTIME_AUTHORIZATION_GATE_CONTRACT.md).
 *
 * Re-exports the inert types + pinned constants (./types.ts), the stable issue
 * codes plus snapshot/structural guards (./validation.ts), the canonical
 * payload / integrity hash / deterministic idempotency + id builders
 * (./canonical.ts), the Human Decision runtime eligibility policy
 * (./humanDecisionPolicy.ts), the pure eligibility evaluator (./eligibility.ts),
 * and the redacted audit projection (./audit.ts).
 *
 * The branded `RuntimeAuthorizationReceipt` production point is DELIBERATELY NOT
 * on this public surface. No pure export accepts a plain
 * `RuntimeAuthorizationEligibleEvidence` and returns a branded receipt; the
 * canonical builders here return only plain, non-authorizing payload/hash
 * values. The single receipt constructor lives server-private in
 * `app/lib/security/runtimeAuthorizationReceipt.ts` and is reachable only by the
 * gate, after a successful exact-binding CAS.
 *
 * Dependency direction: artifacts / canonicalIdentity / identityIndependence /
 * reviewEvidence / approvalLinkage / security-hash-leaf → runtimeAuthorization.
 * This module imports NO API route, ApprovalStore, resolver, adapter,
 * persistence repository, D1 binding, environment variable, runtime audit
 * logger, external action executor, provider client, OAuth/token, Next.js, UI,
 * or Electron code, and it does NOT import the P7.1 approvalMac MAC module.
 *
 * Eligibility is not authorization. A RuntimeAuthorizationReceipt is
 * `authorized_not_executed`, is not a bearer token, is not a provider
 * credential, and is not an ExecutionResult. The atomic immediately-before-use
 * claim, the executor-session derivation, the final RBAC + kill-switch recheck,
 * and receipt construction after claim success are the server-side gate's job.
 * AI proposes. Rules guard. Humans decide.
 */

export * from "./types.ts"
export * from "./validation.ts"
export * from "./canonical.ts"
export * from "./humanDecisionPolicy.ts"
export * from "./eligibility.ts"
export * from "./audit.ts"
