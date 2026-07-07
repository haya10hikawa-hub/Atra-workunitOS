/**
 * P6-I5G: public surface for the Phase 6 Persistence Audit Evidence module.
 *
 * Re-exports the inert types (./types.ts) and the pure, fail-closed validators
 * (./validators.ts) only. No audit runtime, no audit event emitter, no runtime
 * wiring, no persistence, no durable storage, no database access, no
 * query-language execution, no Evidence Ledger append, no Graph Model write, no
 * external action. Validation pass is not truth, not approval, not execution
 * permission, not persistence, not durable storage, and not production
 * readiness.
 */

export * from "./types.ts"
export * from "./validators.ts"
