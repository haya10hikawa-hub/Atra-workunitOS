/**
 * P6-I5H: pure constructors for the Phase 6 Persistence Audit Event
 * (docs/P6_I5H_PURE_PERSISTENCE_AUDIT_EVIDENCE_CONSTRUCTORS.md). Builds on the
 * P6-I5G PersistenceAuditEvent type and validator.
 *
 * PURE, DETERMINISTIC, NON-AUTHORIZING. Each constructor:
 *   - takes a single-read snapshot of the caller input (getter-TOCTOU hardening);
 *   - uses caller-provided ids, timestamps, and payload hash; it generates none;
 *   - reads no clock and no randomness, and performs no I/O of any kind;
 *   - never mutates its input;
 *   - fixes the adapter and selected target class to the single P6-I5A..G
 *     selection, so any caller override is ignored;
 *   - validates the produced event with the P6-I5G validator and returns a
 *     failure (never ok=true) when validation fails;
 *   - returns a structured result carrying no grant-like field.
 *
 * Constructor success is not truth, not approval, not execution permission, not
 * audit runtime, not audit event emission, not persistence, not durable storage,
 * not Evidence Ledger append, not Graph Model write, and not production
 * readiness.
 */

import {
  PERSISTENCE_AUDIT_TARGET_CLASSES,
  type PersistenceAuditEvent,
  type PersistenceAuditOperation,
  type PersistenceAuditOperationStatus,
  type PersistenceAuditOperationOutcome,
  type PersistenceAuditValidationResult,
  type PersistenceAuditIdempotencyResult,
  type PersistenceAuditDuplicateResult,
  type PersistenceAuditTenantScopeResult,
  type PersistenceAuditDefensiveSnapshotResult,
  type PersistenceAuditNonDurabilityResult,
  type PersistenceAuditClearScope,
  type PersistenceAuditRedactionResult,
  type PersistenceAuditSourceLoop,
  type PersistenceAuditNoGoFlag,
} from "./types.ts"
import { validatePersistenceAuditEvent } from "./validators.ts"
import {
  type PersistenceAuditEventConstructionResult,
  persistenceAuditEventConstructorIssue,
  okPersistenceAuditEventConstruction,
  failPersistenceAuditEventConstruction,
} from "./construction.ts"

// ─── The one fixed adapter/selected target class ────────────────

const TARGET_CLASS = PERSISTENCE_AUDIT_TARGET_CLASSES[0] // "in_memory_test_only_store"

// ─── Caller input shapes ────────────────────────────────────────

/** Fields the caller supplies; both target class fields are fixed by the constructor. */
export type CreatePersistenceAuditEventInput = {
  readonly audit_event_id: string
  readonly tenant_id: string
  readonly target_decision_record_id: string
  readonly operation: PersistenceAuditOperation
  readonly operation_status: PersistenceAuditOperationStatus
  readonly operation_outcome: PersistenceAuditOperationOutcome
  readonly validation_result: PersistenceAuditValidationResult
  readonly validator_issue_codes: readonly string[]
  readonly adapter_issue_codes: readonly string[]
  readonly idempotency_result: PersistenceAuditIdempotencyResult
  readonly duplicate_result: PersistenceAuditDuplicateResult
  readonly tenant_scope_result: PersistenceAuditTenantScopeResult
  readonly defensive_snapshot_result: PersistenceAuditDefensiveSnapshotResult
  readonly non_durability_result: PersistenceAuditNonDurabilityResult
  readonly clear_scope: PersistenceAuditClearScope
  readonly record_count: number
  readonly failure_reasons: readonly string[]
  readonly redaction_result: PersistenceAuditRedactionResult
  readonly source_loop: PersistenceAuditSourceLoop
  readonly source_adapter_loop: string
  readonly source_fixture_loop: string
  readonly source_validator_loop: string
  readonly source_constructor_loop: string
  readonly source_target_decision_record_id: string
  readonly created_at: string
  readonly payload_hash: string
  readonly non_authorization_statement: string
  readonly no_go_flags: readonly PersistenceAuditNoGoFlag[]
}

/** Blocked-path input: the caller must supply a non-empty no_go_flags array. */
export type CreateBlockedPersistenceAuditEventInput = CreatePersistenceAuditEventInput

// ─── Snapshot / freeze helpers ──────────────────────────────────

function snapshot(input: unknown): Record<string, unknown> | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null
  const source = input as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(source)) {
    out[key] = source[key]
  }
  return out
}

function freeze(event: Record<string, unknown>): PersistenceAuditEvent {
  for (const key of Object.keys(event)) {
    const value = event[key]
    if (Array.isArray(value)) Object.freeze(value)
  }
  return Object.freeze(event) as unknown as PersistenceAuditEvent
}

// ─── Shared build: overlay fixed fields, validate, return ────────

function buildEvent(
  input: unknown,
  overrides: Record<string, unknown>,
): PersistenceAuditEventConstructionResult {
  try {
    const snap = snapshot(input)
    if (snap === null) {
      return failPersistenceAuditEventConstruction([
        persistenceAuditEventConstructorIssue("invalid_constructor_input", "(input)"),
      ])
    }
    // Start from a copy of the snapshot so genuinely-unknown caller keys (typos,
    // grant-like fields, raw payload, secret-like fields) flow through to the
    // validator and fail closed there. Operation-shape overrides and the fixed
    // target class fields always win.
    const event: Record<string, unknown> = {
      ...snap,
      ...overrides,
      adapter_target_class: TARGET_CLASS,
      selected_target_class: TARGET_CLASS,
    }

    const validation = validatePersistenceAuditEvent(event)
    if (!validation.ok) {
      return failPersistenceAuditEventConstruction(
        validation.issues.map((vi) =>
          persistenceAuditEventConstructorIssue("validation_failed", vi.field),
        ),
      )
    }
    return okPersistenceAuditEventConstruction(freeze(event))
  } catch {
    return failPersistenceAuditEventConstruction([
      persistenceAuditEventConstructorIssue("constructor_exception", "(event)"),
    ])
  }
}

// ─── Generic constructor ────────────────────────────────────────

export function createPersistenceAuditEvent(
  input: CreatePersistenceAuditEventInput,
): PersistenceAuditEventConstructionResult {
  return buildEvent(input, {})
}

// ─── Operation-specific constructors ────────────────────────────

export function createPutPersistenceAuditEvent(
  input: CreatePersistenceAuditEventInput,
): PersistenceAuditEventConstructionResult {
  return buildEvent(input, { operation: "put", clear_scope: "none" })
}

export function createGetPersistenceAuditEvent(
  input: CreatePersistenceAuditEventInput,
): PersistenceAuditEventConstructionResult {
  return buildEvent(input, { operation: "get", clear_scope: "none" })
}

export function createListPersistenceAuditEvent(
  input: CreatePersistenceAuditEventInput,
): PersistenceAuditEventConstructionResult {
  return buildEvent(input, { operation: "list", clear_scope: "none" })
}

export function createCountPersistenceAuditEvent(
  input: CreatePersistenceAuditEventInput,
): PersistenceAuditEventConstructionResult {
  return buildEvent(input, { operation: "count", clear_scope: "none" })
}

export function createClearTenantPersistenceAuditEvent(
  input: CreatePersistenceAuditEventInput,
): PersistenceAuditEventConstructionResult {
  return buildEvent(input, { operation: "clear_tenant", clear_scope: "tenant_only" })
}

export function createClearAllPersistenceAuditEvent(
  input: CreatePersistenceAuditEventInput,
): PersistenceAuditEventConstructionResult {
  // Preserves the caller-provided non-durability evidence; only operation and
  // clear scope are fixed.
  return buildEvent(input, { operation: "clear_all", clear_scope: "all_test_memory" })
}

// ─── Blocked constructor ────────────────────────────────────────

export function createBlockedPersistenceAuditEvent(
  input: CreateBlockedPersistenceAuditEventInput,
): PersistenceAuditEventConstructionResult {
  const snap = snapshot(input)
  if (snap === null) {
    return failPersistenceAuditEventConstruction([
      persistenceAuditEventConstructorIssue("invalid_constructor_input", "(input)"),
    ])
  }
  const flags = snap.no_go_flags
  if (!Array.isArray(flags) || flags.length === 0) {
    return failPersistenceAuditEventConstruction([
      persistenceAuditEventConstructorIssue("invalid_constructor_input", "no_go_flags"),
    ])
  }
  return buildEvent(input, {
    operation_status: "blocked_no_go",
    operation_outcome: "no_go",
  })
}
