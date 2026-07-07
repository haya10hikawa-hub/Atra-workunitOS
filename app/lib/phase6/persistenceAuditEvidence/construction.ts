/**
 * P6-I5H: construction result types and helpers for the pure Phase 6 Persistence
 * Audit Evidence constructors
 * (docs/P6_I5H_PURE_PERSISTENCE_AUDIT_EVIDENCE_CONSTRUCTORS.md). Builds on the
 * P6-I5G PersistenceAuditEvent type and validator.
 *
 * NON-AUTHORIZING, SIDE-EFFECT-FREE. A PersistenceAuditEventConstructionResult
 * carries only { ok, event?, issues }: construction success is not truth, not
 * approval, not execution permission, not audit runtime, not audit event
 * emission, not persistence, not durable storage, not Evidence Ledger append,
 * not Graph Model write, and not production readiness. Issue messages are
 * `code:field` only — they never echo input values, so secret-like values cannot
 * leak.
 *
 * These helpers perform no I/O of any kind (no network, filesystem, database,
 * query-language execution, model calls, approval-store, or external action),
 * generate no identifiers, read no clock and no randomness, and never mutate
 * caller input. The result object provably carries no grant-like field.
 */

import type { PersistenceAuditEvent } from "./types.ts"

// ─── Issue codes ────────────────────────────────────────────────

export const PERSISTENCE_AUDIT_EVENT_CONSTRUCTOR_ISSUE_CODES = [
  "validation_failed",
  "invalid_constructor_input",
  "constructor_exception",
] as const

export type PersistenceAuditEventConstructorIssueCode =
  (typeof PERSISTENCE_AUDIT_EVENT_CONSTRUCTOR_ISSUE_CODES)[number]

export type PersistenceAuditEventConstructorIssue = {
  readonly code: PersistenceAuditEventConstructorIssueCode
  readonly field: string
  /** Structural only (`code:field`) — never contains input values. */
  readonly message: string
}

// ─── Result shape (discriminated union) ─────────────────────────

export type PersistenceAuditEventConstructionSuccess = {
  readonly ok: true
  readonly event: PersistenceAuditEvent
  readonly issues: readonly []
}

export type PersistenceAuditEventConstructionFailure = {
  readonly ok: false
  readonly event?: never
  readonly issues: readonly PersistenceAuditEventConstructorIssue[]
}

export type PersistenceAuditEventConstructionResult =
  | PersistenceAuditEventConstructionSuccess
  | PersistenceAuditEventConstructionFailure

// ─── Helpers ────────────────────────────────────────────────────

export function persistenceAuditEventConstructorIssue(
  code: PersistenceAuditEventConstructorIssueCode,
  field: string,
): PersistenceAuditEventConstructorIssue {
  return { code, field, message: `${code}:${field}` }
}

export function okPersistenceAuditEventConstruction(
  event: PersistenceAuditEvent,
): PersistenceAuditEventConstructionSuccess {
  return { ok: true, event, issues: [] }
}

export function failPersistenceAuditEventConstruction(
  issues: readonly PersistenceAuditEventConstructorIssue[],
): PersistenceAuditEventConstructionFailure {
  return { ok: false, issues }
}
