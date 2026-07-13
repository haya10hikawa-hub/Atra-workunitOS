/**
 * P6-I5O: TEST-ONLY, in-memory, deterministic, read-only harness over the
 * P6-I5N Recorder Audit Summary fixtures.
 *
 * This harness loads the five fixed P6-I5N fixture records, re-validates every
 * record through the P6-I5L validator at construction, and exposes
 * deterministic read-only views: list, lookup by summary_id, filtering by
 * summary_scope and tenant_id, counting, and re-validation. It is NOT a summary
 * runtime, NOT an emitter, NOT storage, NOT a repository, and NOT a production
 * adapter: nothing it holds survives process exit, and no operation writes
 * anything anywhere. It reads no clock and no randomness, performs no I/O of
 * any kind, authorizes nothing, and lives only under tests/. It must never be
 * exported from or imported by app/.
 *
 * Failure paths use stable non-echoing issue objects (`code:field` messages) or
 * generic non-echoing errors only. The capability and purity boundaries are
 * described in docs/P6_I5O_TEST_ONLY_RECORDER_AUDIT_SUMMARY_HARNESS.md, not
 * inside this source.
 *
 * The only imports are the P6-I5N fixture module and the Phase 6 Recorder
 * Audit Summary module surface.
 */

import {
  ALL_RECORDER_AUDIT_SUMMARY_FIXTURES,
} from "../../fixtures/phase6/recorderAuditSummaryFixture.mts"
import {
  validateRecorderAuditSummaryRecord,
  isRecorderAuditSummaryScope,
  type RecorderAuditSummaryRecord,
  type RecorderAuditSummaryScope,
} from "../../../app/lib/phase6/recorderAuditSummary/index.ts"

// ─── The one fixed recorder/selected target class ───────────────

const FIXED_TARGET_CLASS = "in_memory_test_only_store"

// ─── Issue codes and result shapes ──────────────────────────────

export const RECORDER_AUDIT_SUMMARY_HARNESS_ISSUE_CODES = [
  "invalid_input",
  "not_found",
  "validation_failed",
  "forbidden_target_class",
  "harness_exception",
] as const

export type RecorderAuditSummaryHarnessIssueCode =
  (typeof RECORDER_AUDIT_SUMMARY_HARNESS_ISSUE_CODES)[number]

export type RecorderAuditSummaryHarnessIssue = {
  readonly code: RecorderAuditSummaryHarnessIssueCode
  readonly field: string
  /** Structural only (`code:field`) — never contains input values. */
  readonly message: string
}

export type RecorderAuditSummaryHarnessResult = {
  readonly ok: boolean
  readonly issues: readonly RecorderAuditSummaryHarnessIssue[]
  readonly summary?: RecorderAuditSummaryRecord
  readonly summaries?: readonly RecorderAuditSummaryRecord[]
  readonly count?: number
}

function issue(
  code: RecorderAuditSummaryHarnessIssueCode,
  field: string,
): RecorderAuditSummaryHarnessIssue {
  return { code, field, message: `${code}:${field}` }
}

function okResult(
  partial: Omit<RecorderAuditSummaryHarnessResult, "ok" | "issues">,
): RecorderAuditSummaryHarnessResult {
  return { ok: true, issues: [], ...partial }
}

function failResult(
  issues: readonly RecorderAuditSummaryHarnessIssue[],
): RecorderAuditSummaryHarnessResult {
  return { ok: false, issues }
}

// ─── Harness ────────────────────────────────────────────────────

export type RecorderAuditSummaryTestHarness = {
  listSummaries(): RecorderAuditSummaryHarnessResult
  getSummary(summaryId: unknown): RecorderAuditSummaryHarnessResult
  /** Fail-closed lookup: returns the record or throws a generic non-echoing error. */
  requireSummary(summaryId: unknown): RecorderAuditSummaryRecord
  listByScope(summaryScope: unknown): RecorderAuditSummaryHarnessResult
  listByTenant(tenantId: unknown): RecorderAuditSummaryHarnessResult
  countSummaries(): RecorderAuditSummaryHarnessResult
  validateAllSummaries(): RecorderAuditSummaryHarnessResult
  /** Re-derives harness-local state from the fixture constants. */
  reset(): RecorderAuditSummaryHarnessResult
}

/**
 * Loads the five P6-I5N fixtures into a harness-local frozen list, validating
 * every record and both target class fields. Throws a generic non-echoing
 * error if the fixture state is invalid.
 */
function loadFixtureSnapshot(): readonly RecorderAuditSummaryRecord[] {
  const loaded: RecorderAuditSummaryRecord[] = []
  for (const record of ALL_RECORDER_AUDIT_SUMMARY_FIXTURES) {
    const validation = validateRecorderAuditSummaryRecord(record)
    if (!validation.ok) {
      throw new Error("P6-I5O harness fixture failed validation at load")
    }
    if (
      record.recorder_target_class !== FIXED_TARGET_CLASS ||
      record.selected_target_class !== FIXED_TARGET_CLASS
    ) {
      throw new Error("P6-I5O harness fixture carried a forbidden target class at load")
    }
    loaded.push(record)
  }
  return Object.freeze(loaded)
}

export function createRecorderAuditSummaryTestHarness(): RecorderAuditSummaryTestHarness {
  // Harness-local, deterministic, fixture-order snapshot. Records themselves
  // are frozen by the P6-I5M constructor; the list is frozen here.
  let state: readonly RecorderAuditSummaryRecord[] = loadFixtureSnapshot()

  function snapshotList(
    records: readonly RecorderAuditSummaryRecord[],
  ): readonly RecorderAuditSummaryRecord[] {
    // Fresh frozen array per call: callers can never splice harness state.
    return Object.freeze([...records])
  }

  return {
    listSummaries(): RecorderAuditSummaryHarnessResult {
      try {
        return okResult({ summaries: snapshotList(state) })
      } catch {
        return failResult([issue("harness_exception", "(list)")])
      }
    },

    getSummary(summaryId: unknown): RecorderAuditSummaryHarnessResult {
      try {
        if (typeof summaryId !== "string" || summaryId.length === 0) {
          return failResult([issue("invalid_input", "summary_id")])
        }
        const found = state.find((r) => r.summary_id === summaryId)
        if (!found) return failResult([issue("not_found", "summary_id")])
        return okResult({ summary: found })
      } catch {
        return failResult([issue("harness_exception", "(get)")])
      }
    },

    requireSummary(summaryId: unknown): RecorderAuditSummaryRecord {
      if (typeof summaryId !== "string" || summaryId.length === 0) {
        throw new Error("P6-I5O harness requireSummary received invalid input")
      }
      const found = state.find((r) => r.summary_id === summaryId)
      if (!found) {
        throw new Error("P6-I5O harness requireSummary found no matching summary")
      }
      return found
    },

    listByScope(summaryScope: unknown): RecorderAuditSummaryHarnessResult {
      try {
        if (!isRecorderAuditSummaryScope(summaryScope)) {
          return failResult([issue("invalid_input", "summary_scope")])
        }
        const scope: RecorderAuditSummaryScope = summaryScope
        return okResult({
          summaries: snapshotList(state.filter((r) => r.summary_scope === scope)),
        })
      } catch {
        return failResult([issue("harness_exception", "(list_by_scope)")])
      }
    },

    listByTenant(tenantId: unknown): RecorderAuditSummaryHarnessResult {
      try {
        if (typeof tenantId !== "string" || tenantId.length === 0) {
          return failResult([issue("invalid_input", "tenant_id")])
        }
        return okResult({
          summaries: snapshotList(state.filter((r) => r.tenant_id === tenantId)),
        })
      } catch {
        return failResult([issue("harness_exception", "(list_by_tenant)")])
      }
    },

    countSummaries(): RecorderAuditSummaryHarnessResult {
      try {
        return okResult({ count: state.length })
      } catch {
        return failResult([issue("harness_exception", "(count)")])
      }
    },

    validateAllSummaries(): RecorderAuditSummaryHarnessResult {
      try {
        const issues: RecorderAuditSummaryHarnessIssue[] = []
        for (const record of state) {
          const validation = validateRecorderAuditSummaryRecord(record)
          if (!validation.ok) {
            issues.push(issue("validation_failed", "summary_id"))
          }
          // P6-FIX-007d (Issue #121): report each target-class violation on the
          // field that actually mismatched. Two independent, deterministically
          // ordered checks (recorder before selected) — never a combined OR that
          // mislabels a selected mismatch as a recorder mismatch.
          if (record.recorder_target_class !== FIXED_TARGET_CLASS) {
            issues.push(issue("forbidden_target_class", "recorder_target_class"))
          }
          if (record.selected_target_class !== FIXED_TARGET_CLASS) {
            issues.push(issue("forbidden_target_class", "selected_target_class"))
          }
        }
        if (issues.length > 0) return failResult(issues)
        return okResult({ count: state.length })
      } catch {
        return failResult([issue("harness_exception", "(validate_all)")])
      }
    },

    reset(): RecorderAuditSummaryHarnessResult {
      try {
        state = loadFixtureSnapshot()
        return okResult({ count: state.length })
      } catch {
        return failResult([issue("harness_exception", "(reset)")])
      }
    },
  }
}
