/**
 * P6-I5E: TEST-ONLY, in-memory, non-durable, tenant-scoped adapter for validated
 * Phase 6 Persistence Target Decision candidates.
 *
 * This module stores validated TargetDecisionRecord candidates only inside an
 * in-process map. It is NOT real persistence, NOT durable storage, NOT a
 * repository, and NOT a production adapter: nothing it holds survives process
 * exit. It reads no clock and no randomness, performs no I/O of any kind,
 * authorizes nothing, and lives only under tests/. It must never be exported
 * from or imported by app/.
 *
 * Every candidate is validated with the P6-I5B validator before it is accepted,
 * is scoped to a single tenant, and must select the one fixed target class. The
 * capability and purity boundaries are described in
 * docs/legacy/P6_I5E_IN_MEMORY_TEST_ONLY_TARGET_DECISION_ADAPTER.md, not inside this
 * source.
 *
 * The only import is the Phase 6 Persistence Target Decision module surface.
 */

import {
  validateTargetDecisionRecord,
  type TargetDecisionRecord,
} from "../../../app/lib/phase6/persistenceTargetDecision/index.ts"

// ─── The one fixed selectable target class (P6-I5A/B/C/D) ────────

const SELECTED_TARGET_CLASS = "in_memory_test_only_store"

// ─── Issue codes and result shapes ──────────────────────────────

export const IN_MEMORY_ADAPTER_ISSUE_CODES = [
  "invalid_input",
  "invalid_record",
  "validation_failed",
  "tenant_mismatch",
  "duplicate_conflict",
  "not_found",
  "forbidden_selected_target",
  "adapter_exception",
] as const

export type InMemoryAdapterIssueCode = (typeof IN_MEMORY_ADAPTER_ISSUE_CODES)[number]

export type InMemoryAdapterIssue = {
  readonly code: InMemoryAdapterIssueCode
  readonly field: string
  /** Structural only (`code:field`) — never contains input values. */
  readonly message: string
}

export type InMemoryAdapterResult = {
  readonly ok: boolean
  readonly issues: readonly InMemoryAdapterIssue[]
  readonly record?: TargetDecisionRecord
  readonly records?: readonly TargetDecisionRecord[]
  readonly count?: number
  readonly cleared_count?: number
}

export type PutTargetDecisionCandidateInput = {
  readonly tenant_id: string
  readonly record: unknown
}

export type GetTargetDecisionCandidateInput = {
  readonly tenant_id: string
  readonly target_decision_record_id: string
}

export type ListTargetDecisionCandidatesInput = {
  readonly tenant_id: string
}

export type ClearTargetDecisionCandidatesInput = {
  readonly tenant_id: string
}

export type InMemoryPersistenceTargetDecisionAdapter = {
  putTargetDecisionCandidate(input: PutTargetDecisionCandidateInput): InMemoryAdapterResult
  getTargetDecisionCandidate(input: GetTargetDecisionCandidateInput): InMemoryAdapterResult
  listTargetDecisionCandidates(input: ListTargetDecisionCandidatesInput): InMemoryAdapterResult
  clearTargetDecisionCandidates(input: ClearTargetDecisionCandidatesInput): InMemoryAdapterResult
  clearAllTargetDecisionCandidates(): InMemoryAdapterResult
  countTargetDecisionCandidates(input: ListTargetDecisionCandidatesInput): InMemoryAdapterResult
}

// ─── Helpers ────────────────────────────────────────────────────

function issue(code: InMemoryAdapterIssueCode, field: string): InMemoryAdapterIssue {
  return { code, field, message: `${code}:${field}` }
}

function fail(issues: readonly InMemoryAdapterIssue[]): InMemoryAdapterResult {
  return { ok: false, issues }
}

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}

/** Recursive value clone for plain string/boolean/number/array/object values. */
function deepClone<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((el) => deepClone(el)) as unknown as T
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>)) {
      out[key] = deepClone((value as Record<string, unknown>)[key])
    }
    return out as unknown as T
  }
  return value
}

/** Recursively freeze arrays and plain objects so a stored snapshot is immutable. */
function deepFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const el of value) deepFreeze(el)
    return Object.freeze(value) as T
  }
  if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key])
    }
    return Object.freeze(value) as T
  }
  return value
}

/** Structural deep equality for plain string/boolean/number/array/object values. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((el, i) => deepEqual(el, b[i]))
  }
  if (a !== null && b !== null && typeof a === "object" && typeof b === "object") {
    const ak = Object.keys(a as Record<string, unknown>).sort()
    const bk = Object.keys(b as Record<string, unknown>).sort()
    if (ak.length !== bk.length || !ak.every((k, i) => k === bk[i])) return false
    return ak.every((k) =>
      deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
    )
  }
  return false
}

/**
 * Capture the caller's raw input exactly once into a frozen deep clone
 * (validate-the-clone). The raw input is read only here; validation, tenant
 * checking, key derivation, duplicate comparison, and storage all operate on
 * the returned clone, so a getter or caller mutation cannot make the validated
 * object differ from the stored object. Returns null on a throwing getter so
 * the caller fails closed via the existing adapter_exception convention;
 * never echoes the thrown value.
 */
function capture(record: Record<string, unknown>): TargetDecisionRecord | null {
  try {
    return deepFreeze(deepClone(record)) as unknown as TargetDecisionRecord
  } catch {
    return null
  }
}

// ─── Adapter factory ────────────────────────────────────────────

export function createInMemoryPersistenceTargetDecisionAdapter(): InMemoryPersistenceTargetDecisionAdapter {
  // tenant_id -> (target_decision_record_id -> frozen snapshot). In-process only.
  const byTenant = new Map<string, Map<string, TargetDecisionRecord>>()

  function tenantMap(tenantId: string): Map<string, TargetDecisionRecord> {
    let m = byTenant.get(tenantId)
    if (m === undefined) {
      m = new Map<string, TargetDecisionRecord>()
      byTenant.set(tenantId, m)
    }
    return m
  }

  function putTargetDecisionCandidate(
    input: PutTargetDecisionCandidateInput,
  ): InMemoryAdapterResult {
    try {
      if (!isRecordObject(input)) return fail([issue("invalid_input", "(input)")])
      const tenantId = (input as Record<string, unknown>).tenant_id
      if (!isNonEmptyString(tenantId)) return fail([issue("invalid_input", "tenant_id")])
      const record = (input as Record<string, unknown>).record
      if (!isRecordObject(record)) return fail([issue("invalid_record", "record")])

      // Validate-the-clone: capture the raw record exactly once into a frozen
      // clone, then read the clone for every subsequent check and for storage.
      // The raw record is never read again, so a getter cannot present valid
      // values to the checks and different values to the stored snapshot.
      const snap = capture(record as Record<string, unknown>)
      if (snap === null) return fail([issue("adapter_exception", "(record)")])

      // Fixed selected-target pre-check (fail closed before storing anything).
      if ((snap as unknown as Record<string, unknown>).selected_target_class !== SELECTED_TARGET_CLASS) {
        return fail([issue("forbidden_selected_target", "selected_target_class")])
      }

      const validation = validateTargetDecisionRecord(snap)
      if (!validation.ok) {
        return fail(validation.issues.map((vi) => issue("validation_failed", vi.field)))
      }

      if (snap.tenant_id !== tenantId) {
        return fail([issue("tenant_mismatch", "tenant_id")])
      }

      const map = tenantMap(tenantId)
      const existing = map.get(snap.target_decision_record_id)
      if (existing !== undefined) {
        if (deepEqual(existing, snap)) {
          // Idempotent: identical content already stored.
          return { ok: true, issues: [], record: existing }
        }
        return fail([issue("duplicate_conflict", "target_decision_record_id")])
      }
      map.set(snap.target_decision_record_id, snap)
      return { ok: true, issues: [], record: snap }
    } catch {
      return fail([issue("adapter_exception", "(record)")])
    }
  }

  function getTargetDecisionCandidate(
    input: GetTargetDecisionCandidateInput,
  ): InMemoryAdapterResult {
    try {
      if (!isRecordObject(input)) return fail([issue("invalid_input", "(input)")])
      const tenantId = (input as Record<string, unknown>).tenant_id
      const recordId = (input as Record<string, unknown>).target_decision_record_id
      if (!isNonEmptyString(tenantId)) return fail([issue("invalid_input", "tenant_id")])
      if (!isNonEmptyString(recordId)) {
        return fail([issue("invalid_input", "target_decision_record_id")])
      }
      const found = byTenant.get(tenantId)?.get(recordId)
      // Not found is a successful lookup with no record (never reads other tenants).
      return { ok: true, issues: [], record: found }
    } catch {
      return fail([issue("adapter_exception", "(input)")])
    }
  }

  function listTargetDecisionCandidates(
    input: ListTargetDecisionCandidatesInput,
  ): InMemoryAdapterResult {
    try {
      if (!isRecordObject(input)) return fail([issue("invalid_input", "(input)")])
      const tenantId = (input as Record<string, unknown>).tenant_id
      if (!isNonEmptyString(tenantId)) return fail([issue("invalid_input", "tenant_id")])
      const map = byTenant.get(tenantId)
      const records =
        map === undefined
          ? []
          : [...map.values()].sort((a, b) =>
              a.target_decision_record_id < b.target_decision_record_id
                ? -1
                : a.target_decision_record_id > b.target_decision_record_id
                  ? 1
                  : 0,
            )
      return { ok: true, issues: [], records }
    } catch {
      return fail([issue("adapter_exception", "(input)")])
    }
  }

  function clearTargetDecisionCandidates(
    input: ClearTargetDecisionCandidatesInput,
  ): InMemoryAdapterResult {
    try {
      if (!isRecordObject(input)) return fail([issue("invalid_input", "(input)")])
      const tenantId = (input as Record<string, unknown>).tenant_id
      if (!isNonEmptyString(tenantId)) return fail([issue("invalid_input", "tenant_id")])
      const map = byTenant.get(tenantId)
      const cleared = map === undefined ? 0 : map.size
      byTenant.delete(tenantId)
      return { ok: true, issues: [], cleared_count: cleared }
    } catch {
      return fail([issue("adapter_exception", "(input)")])
    }
  }

  function clearAllTargetDecisionCandidates(): InMemoryAdapterResult {
    try {
      let cleared = 0
      for (const map of byTenant.values()) cleared += map.size
      byTenant.clear()
      return { ok: true, issues: [], cleared_count: cleared }
    } catch {
      return fail([issue("adapter_exception", "(all)")])
    }
  }

  function countTargetDecisionCandidates(
    input: ListTargetDecisionCandidatesInput,
  ): InMemoryAdapterResult {
    try {
      if (!isRecordObject(input)) return fail([issue("invalid_input", "(input)")])
      const tenantId = (input as Record<string, unknown>).tenant_id
      if (!isNonEmptyString(tenantId)) return fail([issue("invalid_input", "tenant_id")])
      const map = byTenant.get(tenantId)
      return { ok: true, issues: [], count: map === undefined ? 0 : map.size }
    } catch {
      return fail([issue("adapter_exception", "(input)")])
    }
  }

  return {
    putTargetDecisionCandidate,
    getTargetDecisionCandidate,
    listTargetDecisionCandidates,
    clearTargetDecisionCandidates,
    clearAllTargetDecisionCandidates,
    countTargetDecisionCandidates,
  }
}
