/**
 * P6-I5L: public surface for the Phase 6 Recorder Audit Summary module.
 *
 * Re-exports the inert types (./types.ts) and the pure, fail-closed validators
 * (./validators.ts) only. No recorder summary runtime, no summary emitter, no
 * audit runtime, no audit event emitter, no runtime wiring, no persistence, no
 * durable storage, no database access, no query-language execution, no
 * Evidence Ledger append, no Graph Model write, no external action. Validation
 * pass is not truth, not approval, not execution permission, not summary
 * runtime, not audit runtime, not audit event emission, not persistence, not
 * durable storage, and not production readiness.
 */

export * from "./types.ts"
export * from "./validators.ts"
