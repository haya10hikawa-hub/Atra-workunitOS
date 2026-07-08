/**
 * P6-I5M: construction result types and helpers for the pure Phase 6 Recorder
 * Audit Summary constructors
 * (docs/P6_I5M_PURE_RECORDER_AUDIT_SUMMARY_CONSTRUCTORS.md). Builds on the
 * P6-I5L RecorderAuditSummaryRecord type and validator.
 *
 * NON-AUTHORIZING, SIDE-EFFECT-FREE. A RecorderAuditSummaryConstructionResult
 * carries only { ok, record?, issues }: construction success is not truth, not
 * approval, not execution permission, not summary runtime, not summary
 * emission, not audit runtime, not audit event emission, not persistence, not
 * durable storage, not Evidence Ledger append, not Graph Model write, and not
 * production readiness. Issue messages are `code:field` only — they never echo
 * input values, so secret-like values cannot leak.
 *
 * These helpers perform no I/O of any kind (no network, filesystem, database,
 * query-language execution, model calls, approval-store, or external action),
 * generate no identifiers, read no clock and no randomness, and never mutate
 * caller input. The result object provably carries no grant-like field.
 */

import type { RecorderAuditSummaryRecord } from "./types.ts"

// ─── Issue codes ────────────────────────────────────────────────

export const RECORDER_AUDIT_SUMMARY_CONSTRUCTOR_ISSUE_CODES = [
  "validation_failed",
  "invalid_constructor_input",
  "constructor_exception",
] as const

export type RecorderAuditSummaryConstructorIssueCode =
  (typeof RECORDER_AUDIT_SUMMARY_CONSTRUCTOR_ISSUE_CODES)[number]

export type RecorderAuditSummaryConstructorIssue = {
  readonly code: RecorderAuditSummaryConstructorIssueCode
  readonly field: string
  /** Structural only (`code:field`) — never contains input values. */
  readonly message: string
}

// ─── Result shape (discriminated union) ─────────────────────────

export type RecorderAuditSummaryConstructionSuccess = {
  readonly ok: true
  readonly record: RecorderAuditSummaryRecord
  readonly issues: readonly []
}

export type RecorderAuditSummaryConstructionFailure = {
  readonly ok: false
  readonly record?: never
  readonly issues: readonly RecorderAuditSummaryConstructorIssue[]
}

export type RecorderAuditSummaryConstructionResult =
  | RecorderAuditSummaryConstructionSuccess
  | RecorderAuditSummaryConstructionFailure

// ─── Helpers ────────────────────────────────────────────────────

export function recorderAuditSummaryConstructorIssue(
  code: RecorderAuditSummaryConstructorIssueCode,
  field: string,
): RecorderAuditSummaryConstructorIssue {
  return { code, field, message: `${code}:${field}` }
}

export function okRecorderAuditSummaryConstruction(
  record: RecorderAuditSummaryRecord,
): RecorderAuditSummaryConstructionSuccess {
  return { ok: true, record, issues: [] }
}

export function failRecorderAuditSummaryConstruction(
  issues: readonly RecorderAuditSummaryConstructorIssue[],
): RecorderAuditSummaryConstructionFailure {
  return { ok: false, issues }
}
