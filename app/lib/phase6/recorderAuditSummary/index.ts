/**
 * P6-I5L/P6-I5M: public surface for the Phase 6 Recorder Audit Summary module.
 *
 * Re-exports the inert types (./types.ts), the pure, fail-closed validators
 * (./validators.ts), the construction result helpers (./construction.ts), and
 * the pure constructors (./constructors.ts) only. No recorder summary runtime,
 * no summary emitter, no audit runtime, no audit event emitter, no runtime
 * wiring, no persistence, no durable storage, no database access, no
 * query-language execution, no Evidence Ledger append, no Graph Model write,
 * no external action. Validation pass and construction success are not truth,
 * not approval, not execution permission, not summary runtime, not audit
 * runtime, not audit event emission, not persistence, not durable storage, and
 * not production readiness.
 */

export * from "./types.ts"
export * from "./validators.ts"
export * from "./construction.ts"
export * from "./constructors.ts"
