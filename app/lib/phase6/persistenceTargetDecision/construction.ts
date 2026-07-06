/**
 * P6-I5C: construction result types and helpers for the pure Phase 6
 * Persistence Target Decision constructors
 * (docs/P6_I5C_PURE_TARGET_DECISION_CONSTRUCTORS.md). Builds on the P6-I5B
 * TargetDecisionRecord type and validator.
 *
 * NON-AUTHORIZING, SIDE-EFFECT-FREE. A TargetDecisionConstructionResult carries
 * only { ok, record?, issues }: construction success is not persistence, not
 * storage, not approval, not execution permission, not formal promotion, and not
 * production readiness. Issue messages are `code:field` only — they never echo
 * input values, so secret-like values cannot leak.
 *
 * These helpers perform no I/O of any kind (no network, filesystem, database,
 * query-language execution, model calls, approval-store, or external action),
 * generate no identifiers, read no clock and no randomness, and never mutate
 * caller input. The result object provably carries no grant-like field.
 */

import type { TargetDecisionRecord } from "./types.ts"

// ─── Issue codes ────────────────────────────────────────────────

export const TARGET_DECISION_CONSTRUCTOR_ISSUE_CODES = [
  "validation_failed",
  "invalid_constructor_input",
  "constructor_exception",
] as const

export type TargetDecisionConstructorIssueCode =
  (typeof TARGET_DECISION_CONSTRUCTOR_ISSUE_CODES)[number]

export type TargetDecisionConstructorIssue = {
  readonly code: TargetDecisionConstructorIssueCode
  readonly field: string
  /** Structural only (`code:field`) — never contains input values. */
  readonly message: string
}

// ─── Result shape (discriminated union) ─────────────────────────

export type TargetDecisionConstructionSuccess = {
  readonly ok: true
  readonly record: TargetDecisionRecord
  readonly issues: readonly []
}

export type TargetDecisionConstructionFailure = {
  readonly ok: false
  readonly record?: never
  readonly issues: readonly TargetDecisionConstructorIssue[]
}

export type TargetDecisionConstructionResult =
  | TargetDecisionConstructionSuccess
  | TargetDecisionConstructionFailure

// ─── Helpers ────────────────────────────────────────────────────

export function targetDecisionConstructorIssue(
  code: TargetDecisionConstructorIssueCode,
  field: string,
): TargetDecisionConstructorIssue {
  return { code, field, message: `${code}:${field}` }
}

export function okTargetDecisionConstruction(
  record: TargetDecisionRecord,
): TargetDecisionConstructionSuccess {
  return { ok: true, record, issues: [] }
}

export function failTargetDecisionConstruction(
  issues: readonly TargetDecisionConstructorIssue[],
): TargetDecisionConstructionFailure {
  return { ok: false, issues }
}
