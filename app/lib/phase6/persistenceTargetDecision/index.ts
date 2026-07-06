/**
 * P6-I5B: public surface for the Phase 6 Persistence Target Decision module.
 *
 * Re-exports the inert types (./types.ts), the pure, fail-closed validators
 * (./validators.ts), the construction result helpers (./construction.ts), and
 * the pure constructors (./constructors.ts) only. No runtime wiring, no
 * persistence, no storage, no D1, no SQL, no ApprovalStore, no external action.
 * Validation pass and constructor success are not approval, not execution
 * permission, not promotion, and not production readiness.
 */

export * from "./types.ts"
export * from "./validators.ts"
export * from "./construction.ts"
export * from "./constructors.ts"
