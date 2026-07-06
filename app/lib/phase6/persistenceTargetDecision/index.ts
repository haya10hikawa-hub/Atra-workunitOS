/**
 * P6-I5B: public surface for the Phase 6 Persistence Target Decision module.
 *
 * Re-exports the inert types (./types.ts) and the pure, fail-closed validators
 * (./validators.ts) only. No runtime wiring, no persistence, no storage, no D1,
 * no SQL, no ApprovalStore, no external action. Validation pass is not approval,
 * not execution permission, not promotion, and not production readiness.
 */

export * from "./types.ts"
export * from "./validators.ts"
