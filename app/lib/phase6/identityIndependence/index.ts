/**
 * P6-FIX-010: public surface for the Phase 6 Identity Independence gate
 * (Issue #143, docs/CANONICAL_IDENTITY_INDEPENDENCE_CONTRACT.md).
 *
 * Re-exports the inert types (./types.ts), the thin validation plumbing over
 * the single canonical issue-code list (./validation.ts), the pure
 * fail-closed verifier (./verifier.ts), and the redacted audit projection
 * (./audit.ts) only.
 *
 * Dependency direction: canonicalIdentity → reviewEvidence →
 * identityIndependence. This module consumes the canonical identity,
 * Review Evidence, and Human Decision artifact public surfaces; nothing
 * below it may import it back.
 *
 * No ApprovalStore integration, no approval creation, no runtime
 * authorization, no action execution, no external provider writes, no Formal
 * WorkUnit promotion, no persistence, no D1, no SQL, no routes, no UI, no
 * Electron behavior. Identity independence verification success is not
 * approval, not authorization, not execution permission, and not production
 * readiness. The executor-versus-approver rule is deferred to Issue #145;
 * record linkage to ApprovalStore is deferred to Issue #144. AI proposes.
 * Rules guard. Humans decide.
 */

export * from "./types.ts"
export * from "./validation.ts"
export * from "./verifier.ts"
export * from "./audit.ts"
