/**
 * P6-I1: construction result types and shared helpers for the Phase 6 pure
 * artifact constructors (docs/P6_I1_PURE_ARTIFACT_CONSTRUCTORS.md).
 *
 * NON-AUTHORIZING, SIDE-EFFECT-FREE. A ConstructionResult carries only
 * { ok, artifact?, issues }: construction success is not approval, not
 * execution permission, not Formal WorkUnit promotion, and not pipeline
 * execution. Issue messages are `code:field` / `code:validationCode:field`
 * only — they never echo input values, so secret-like values cannot leak.
 *
 * These helpers perform no I/O of any kind (no network, file, database, D1,
 * SQL, LLM, ApprovalStore, P7.1 TSP, or external action calls), generate no
 * ids, generate no timestamps (no Date.now, no new Date, no crypto.randomUUID,
 * no Math.random), and never mutate caller input.
 */

import type { ValidationIssue } from "./validation.ts"

// ─── Issue codes ────────────────────────────────────────────────

export const CONSTRUCTION_ISSUE_CODES = [
  "invalid_constructor_input",
  "missing_constructor_input",
  "validation_failed",
  "output_validation_failed",
  "mismatched_llm_judgment_id",
  "constructor_exception",
] as const

export type ConstructionIssueCode = (typeof CONSTRUCTION_ISSUE_CODES)[number]

export type ConstructionIssue = {
  readonly code: ConstructionIssueCode
  readonly field: string
  /** Structural only (`code:field` or `code:validationCode:field`) — never input values. */
  readonly message: string
}

// ─── Result shapes ──────────────────────────────────────────────

export type ConstructionSuccess<T> = {
  readonly ok: true
  readonly artifact: T
  readonly issues: readonly []
}

export type ConstructionFailure = {
  readonly ok: false
  readonly issues: readonly ConstructionIssue[]
}

export type ConstructionResult<T> = ConstructionSuccess<T> | ConstructionFailure

/** Single-read snapshot of a constructor's input own enumerable fields. */
export type ConstructorInputSnapshot = Readonly<Record<string, unknown>>

export type ConstructorInputSnapshotResult =
  | { readonly ok: true; readonly snapshot: ConstructorInputSnapshot }
  | ConstructionFailure

// ─── Constructors of results / issues ───────────────────────────

export function constructionIssue(
  code: ConstructionIssueCode,
  field: string,
): ConstructionIssue {
  return { code, field, message: `${code}:${field}` }
}

export function failConstruction(
  issues: readonly ConstructionIssue[],
): ConstructionFailure {
  return { ok: false, issues }
}

export function passConstruction<T>(artifact: T): ConstructionSuccess<T> {
  return { ok: true, artifact, issues: [] }
}

// ─── Snapshot ───────────────────────────────────────────────────

/**
 * Single-read snapshot (getter-TOCTOU hardening, P6-I0 F1 precedent): read every
 * own enumerable top-level property of `input` exactly once into a plain object.
 * Constructors read only from this snapshot, so a getter-bearing input cannot show
 * one value to construction and another to validation. Fails closed on non-object
 * and array input. Never uses JSON.stringify. Preserves explicit null. Never
 * mutates input. Does not rely on the input's prototype chain (Object.keys returns
 * own enumerable keys only).
 */
export function snapshotConstructorInput(input: unknown): ConstructorInputSnapshotResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return failConstruction([constructionIssue("invalid_constructor_input", "(input)")])
  }
  const source = input as Record<string, unknown>
  const snapshot: Record<string, unknown> = {}
  for (const key of Object.keys(source)) {
    snapshot[key] = source[key]
  }
  return { ok: true, snapshot }
}

// ─── Freeze ─────────────────────────────────────────────────────

/**
 * Freeze the constructed top-level artifact before returning success. Nested
 * arrays are frozen too (simple and safe) so a returned artifact cannot be
 * mutated in place. Reads only the artifact's own enumerable keys; never mutates
 * caller input; does not rely on prototypes.
 */
export function freezeConstructedArtifact<T extends object>(artifact: T): T {
  for (const key of Object.keys(artifact)) {
    const value = (artifact as Record<string, unknown>)[key]
    if (Array.isArray(value)) Object.freeze(value)
  }
  return Object.freeze(artifact)
}

// ─── Validation-issue mapping ───────────────────────────────────

/**
 * Map P6-I0 ValidationIssue values to ConstructionIssue values under the stable
 * `output_validation_failed` construction code. The originating validation code
 * and field are preserved in the message (`output_validation_failed:<code>:<field>`)
 * for traceability; both are structural, so no input value is echoed.
 */
export function validationIssuesToConstructionIssues(
  issues: readonly ValidationIssue[],
): readonly ConstructionIssue[] {
  return issues.map((vi) => ({
    code: "output_validation_failed" as const,
    field: vi.field,
    message: `output_validation_failed:${vi.code}:${vi.field}`,
  }))
}

// ─── HumanDecisionRecord id-consistency invariant ───────────────

/**
 * P6-I1 constructor-level invariant (not a runtime approval rule): a
 * HumanDecisionRecord's `source_llm_judgment_record_id` must equal its
 * `llm_judgment_id`. Fails closed with `mismatched_llm_judgment_id` when the two
 * present ids differ. Absence is never treated as consistent — both ids are
 * required by the record — so a snapshot missing either id fails closed here as
 * well; the matching validator additionally reports the precise missing/invalid
 * lineage issue. Reads only from the provided snapshot; performs no I/O.
 */
export function ensureHumanDecisionJudgmentIdConsistency(
  snapshot: ConstructorInputSnapshot,
): { readonly ok: true } | ConstructionFailure {
  const linked = snapshot["source_llm_judgment_record_id"]
  const judgment = snapshot["llm_judgment_id"]
  const linkedPresent = typeof linked === "string" && linked.length > 0
  const judgmentPresent = typeof judgment === "string" && judgment.length > 0
  if (!linkedPresent || !judgmentPresent) {
    return failConstruction([
      constructionIssue("missing_constructor_input", "llm_judgment_id"),
    ])
  }
  if (linked !== judgment) {
    return failConstruction([
      constructionIssue("mismatched_llm_judgment_id", "llm_judgment_id"),
    ])
  }
  return { ok: true }
}
