/**
 * P6-FIX-009: public surface for the Phase 6 Four-Eyes Review Evidence module
 * (Issue #142, docs/FOUR_EYES_REVIEW_EVIDENCE_CONTRACT.md).
 *
 * Re-exports the inert types (./types.ts), the shared validation result
 * plumbing (./validation.ts), the pure fail-closed structural validators
 * (./validators.ts), the pure constructors (./constructors.ts), the pure
 * current-context verifier (./verifier.ts), and the redacted audit projection
 * (./audit.ts) only.
 *
 * No ApprovalStore integration, no approval creation, no MAC generation or
 * verification, no runtime authorization, no action execution, no external
 * provider writes, no Formal WorkUnit promotion, no persistence, no D1, no
 * SQL, no routes, no UI, no Electron behavior. Attestation construction,
 * evidence construction, verification success, and audit projection are not
 * approval, not authorization, not execution permission, and not production
 * readiness. `four_eyes_required: true` is a policy declaration, not evidence
 * that two reviews occurred; verified Review Evidence is still not approval.
 */

export * from "./types.ts"
export * from "./validation.ts"
export * from "./validators.ts"
export * from "./constructors.ts"
export * from "./verifier.ts"
export * from "./audit.ts"
