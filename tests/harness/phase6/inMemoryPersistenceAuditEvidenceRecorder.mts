/**
 * P6-I5J: TEST-ONLY, in-memory, non-durable, tenant-scoped recorder for validated
 * Phase 6 Persistence Audit Events.
 *
 * This module records validated PersistenceAuditEvent objects only inside an
 * in-process map. It is NOT an audit runtime, NOT an audit event emitter, NOT
 * real persistence, NOT durable storage, NOT a repository, and NOT a production
 * adapter: nothing it holds survives process exit. It reads no clock and no
 * randomness, performs no I/O of any kind, authorizes nothing, and lives only
 * under tests/. It must never be exported from or imported by app/.
 *
 * Every event is validated with the P6-I5G validator before it is accepted, is
 * scoped to a single tenant, and must carry the one fixed adapter and selected
 * target class. The capability and purity boundaries are described in
 * docs/P6_I5J_IN_MEMORY_TEST_ONLY_PERSISTENCE_AUDIT_EVIDENCE_RECORDER.md, not
 * inside this source.
 *
 * The only import is the Phase 6 Persistence Audit Evidence module surface.
 */

import {
  validatePersistenceAuditEvent,
  type PersistenceAuditEvent,
} from "../../../app/lib/phase6/persistenceAuditEvidence/index.ts"

// ─── The one fixed adapter/selected target class ────────────────

const FIXED_TARGET_CLASS = "in_memory_test_only_store"

// ─── Issue codes and result shapes ──────────────────────────────

export const IN_MEMORY_AUDIT_EVIDENCE_RECORDER_ISSUE_CODES = [
  "invalid_input",
  "invalid_event",
  "validation_failed",
  "tenant_mismatch",
  "duplicate_conflict",
  "forbidden_target_class",
  "recorder_exception",
] as const

export type InMemoryAuditEvidenceRecorderIssueCode =
  (typeof IN_MEMORY_AUDIT_EVIDENCE_RECORDER_ISSUE_CODES)[number]

export type InMemoryAuditEvidenceRecorderIssue = {
  readonly code: InMemoryAuditEvidenceRecorderIssueCode
  readonly field: string
  /** Structural only (`code:field`) — never contains input values. */
  readonly message: string
}

export type InMemoryAuditEvidenceRecorderResult = {
  readonly ok: boolean
  readonly issues: readonly InMemoryAuditEvidenceRecorderIssue[]
  readonly event?: PersistenceAuditEvent
  readonly events?: readonly PersistenceAuditEvent[]
  readonly count?: number
  readonly cleared_count?: number
}

export type RecordAuditEventInput = {
  readonly tenant_id: string
  readonly event: unknown
}

export type GetAuditEventInput = {
  readonly tenant_id: string
  readonly audit_event_id: string
}

export type ListAuditEventsInput = {
  readonly tenant_id: string
}

export type CountAuditEventsInput = {
  readonly tenant_id: string
}

export type ClearTenantAuditEventsInput = {
  readonly tenant_id: string
}

export type InMemoryPersistenceAuditEvidenceRecorder = {
  recordAuditEvent(input: RecordAuditEventInput): InMemoryAuditEvidenceRecorderResult
  getAuditEvent(input: GetAuditEventInput): InMemoryAuditEvidenceRecorderResult
  listAuditEvents(input: ListAuditEventsInput): InMemoryAuditEvidenceRecorderResult
  countAuditEvents(input: CountAuditEventsInput): InMemoryAuditEvidenceRecorderResult
  clearTenantAuditEvents(input: ClearTenantAuditEventsInput): InMemoryAuditEvidenceRecorderResult
  clearAllAuditEvents(): InMemoryAuditEvidenceRecorderResult
}

// ─── Helpers ────────────────────────────────────────────────────

function issue(
  code: InMemoryAuditEvidenceRecorderIssueCode,
  field: string,
): InMemoryAuditEvidenceRecorderIssue {
  return { code, field, message: `${code}:${field}` }
}

function fail(
  issues: readonly InMemoryAuditEvidenceRecorderIssue[],
): InMemoryAuditEvidenceRecorderResult {
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

/** Store a frozen deep-clone snapshot; never hand the caller our live reference. */
function snapshot(event: PersistenceAuditEvent): PersistenceAuditEvent {
  return deepFreeze(deepClone(event))
}

// ─── Recorder factory ───────────────────────────────────────────

export function createInMemoryPersistenceAuditEvidenceRecorder(): InMemoryPersistenceAuditEvidenceRecorder {
  // tenant_id -> (audit_event_id -> frozen snapshot). In-process only.
  const byTenant = new Map<string, Map<string, PersistenceAuditEvent>>()

  function tenantMap(tenantId: string): Map<string, PersistenceAuditEvent> {
    let m = byTenant.get(tenantId)
    if (m === undefined) {
      m = new Map<string, PersistenceAuditEvent>()
      byTenant.set(tenantId, m)
    }
    return m
  }

  function recordAuditEvent(input: RecordAuditEventInput): InMemoryAuditEvidenceRecorderResult {
    try {
      if (!isRecordObject(input)) return fail([issue("invalid_input", "(input)")])
      const tenantId = (input as Record<string, unknown>).tenant_id
      if (!isNonEmptyString(tenantId)) return fail([issue("invalid_input", "tenant_id")])
      const event = (input as Record<string, unknown>).event
      if (!isRecordObject(event)) return fail([issue("invalid_event", "event")])

      // Fixed target-class pre-check (fail closed before storing anything).
      const eventRecord = event as Record<string, unknown>
      if (eventRecord.adapter_target_class !== FIXED_TARGET_CLASS) {
        return fail([issue("forbidden_target_class", "adapter_target_class")])
      }
      if (eventRecord.selected_target_class !== FIXED_TARGET_CLASS) {
        return fail([issue("forbidden_target_class", "selected_target_class")])
      }

      const validation = validatePersistenceAuditEvent(event)
      if (!validation.ok) {
        return fail(validation.issues.map((vi) => issue("validation_failed", vi.field)))
      }

      const valid = event as unknown as PersistenceAuditEvent
      if (valid.tenant_id !== tenantId) {
        return fail([issue("tenant_mismatch", "tenant_id")])
      }

      const snap = snapshot(valid)
      const map = tenantMap(tenantId)
      const existing = map.get(valid.audit_event_id)
      if (existing !== undefined) {
        if (deepEqual(existing, snap)) {
          // Idempotent: identical content already recorded.
          return { ok: true, issues: [], event: existing }
        }
        return fail([issue("duplicate_conflict", "audit_event_id")])
      }
      map.set(valid.audit_event_id, snap)
      return { ok: true, issues: [], event: snap }
    } catch {
      return fail([issue("recorder_exception", "(event)")])
    }
  }

  function getAuditEvent(input: GetAuditEventInput): InMemoryAuditEvidenceRecorderResult {
    try {
      if (!isRecordObject(input)) return fail([issue("invalid_input", "(input)")])
      const tenantId = (input as Record<string, unknown>).tenant_id
      const eventId = (input as Record<string, unknown>).audit_event_id
      if (!isNonEmptyString(tenantId)) return fail([issue("invalid_input", "tenant_id")])
      if (!isNonEmptyString(eventId)) return fail([issue("invalid_input", "audit_event_id")])
      const found = byTenant.get(tenantId)?.get(eventId)
      // Not found is a successful lookup with no event (never reads other tenants).
      return { ok: true, issues: [], event: found }
    } catch {
      return fail([issue("recorder_exception", "(input)")])
    }
  }

  function listAuditEvents(input: ListAuditEventsInput): InMemoryAuditEvidenceRecorderResult {
    try {
      if (!isRecordObject(input)) return fail([issue("invalid_input", "(input)")])
      const tenantId = (input as Record<string, unknown>).tenant_id
      if (!isNonEmptyString(tenantId)) return fail([issue("invalid_input", "tenant_id")])
      const map = byTenant.get(tenantId)
      const events =
        map === undefined
          ? []
          : [...map.values()].sort((a, b) => {
              if (a.created_at < b.created_at) return -1
              if (a.created_at > b.created_at) return 1
              if (a.audit_event_id < b.audit_event_id) return -1
              if (a.audit_event_id > b.audit_event_id) return 1
              return 0
            })
      return { ok: true, issues: [], events }
    } catch {
      return fail([issue("recorder_exception", "(input)")])
    }
  }

  function countAuditEvents(input: CountAuditEventsInput): InMemoryAuditEvidenceRecorderResult {
    try {
      if (!isRecordObject(input)) return fail([issue("invalid_input", "(input)")])
      const tenantId = (input as Record<string, unknown>).tenant_id
      if (!isNonEmptyString(tenantId)) return fail([issue("invalid_input", "tenant_id")])
      const map = byTenant.get(tenantId)
      return { ok: true, issues: [], count: map === undefined ? 0 : map.size }
    } catch {
      return fail([issue("recorder_exception", "(input)")])
    }
  }

  function clearTenantAuditEvents(
    input: ClearTenantAuditEventsInput,
  ): InMemoryAuditEvidenceRecorderResult {
    try {
      if (!isRecordObject(input)) return fail([issue("invalid_input", "(input)")])
      const tenantId = (input as Record<string, unknown>).tenant_id
      if (!isNonEmptyString(tenantId)) return fail([issue("invalid_input", "tenant_id")])
      const map = byTenant.get(tenantId)
      const cleared = map === undefined ? 0 : map.size
      byTenant.delete(tenantId)
      return { ok: true, issues: [], cleared_count: cleared }
    } catch {
      return fail([issue("recorder_exception", "(input)")])
    }
  }

  function clearAllAuditEvents(): InMemoryAuditEvidenceRecorderResult {
    try {
      let cleared = 0
      for (const map of byTenant.values()) cleared += map.size
      byTenant.clear()
      return { ok: true, issues: [], cleared_count: cleared }
    } catch {
      return fail([issue("recorder_exception", "(all)")])
    }
  }

  return {
    recordAuditEvent,
    getAuditEvent,
    listAuditEvents,
    countAuditEvents,
    clearTenantAuditEvents,
    clearAllAuditEvents,
  }
}
