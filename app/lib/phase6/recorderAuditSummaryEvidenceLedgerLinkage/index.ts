/**
 * P6-I5S: narrow public surface for the inert Recorder Audit Summary to
 * Evidence Ledger no-append linkage contract module.
 *
 * Re-exports the inert contract types (./types.ts) and the pure, fail-closed
 * no-append validator (./validators.ts) only. No runtime consumer, no Evidence
 * Ledger append, no Evidence Ledger writer, no Graph Model write, no runtime
 * linkage, no summary emitter, no audit runtime, no persistence, no durable
 * storage, no database access, no query-language execution, no approval-store,
 * no external action. Validation success is descriptive only: it is not append,
 * not Graph Model write, not approval, not execution permission, and not
 * production readiness.
 */

export * from "./types.ts"
export * from "./validators.ts"
