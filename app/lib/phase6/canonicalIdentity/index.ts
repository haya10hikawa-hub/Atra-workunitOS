/**
 * P6-FIX-010: public surface for the Phase 6 Canonical Identity core module
 * (Issue #143, docs/CANONICAL_IDENTITY_INDEPENDENCE_CONTRACT.md).
 *
 * Re-exports the inert types (./types.ts), the single canonical issue-code
 * list plus validation plumbing and the structural validator (./validation.ts),
 * and the two trusted-source constructors (./constructors.ts) only.
 *
 * DEPENDENCY LEAF. This module sits below Review Evidence and the identity-
 * independence gate and must never import either. No ApprovalStore, no
 * approval creation, no runtime authorization, no execution, no persistence,
 * no repositories, no D1, no SQL, no routes, no UI. Constructing, validating,
 * or comparing canonical identities is not approval, not authorization, not
 * execution permission, and not production readiness. AI proposes. Rules
 * guard. Humans decide.
 */

export * from "./types.ts"
export * from "./validation.ts"
export * from "./constructors.ts"
