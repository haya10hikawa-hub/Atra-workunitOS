/**
 * P6-I5C: pure constructors for the Phase 6 Persistence Target Decision record
 * (docs/P6_I5C_PURE_TARGET_DECISION_CONSTRUCTORS.md). Builds on the P6-I5B
 * TargetDecisionRecord type and validator.
 *
 * PURE, DETERMINISTIC, NON-AUTHORIZING. Each constructor:
 *   - takes a single-read snapshot of the caller input (getter-TOCTOU hardening);
 *   - uses caller-provided ids, timestamps, and payload hash; it generates none;
 *   - reads no clock and no randomness, and performs no I/O of any kind;
 *   - never mutates its input;
 *   - fixes the selected target class to the single P6-I5A/P6-I5B selection, and
 *     fixes the deferred and rejected target sets;
 *   - validates the produced record with the P6-I5B validator and returns a
 *     failure (never ok=true) when validation fails;
 *   - returns a structured result carrying no grant-like field.
 *
 * Constructor success is not persistence, not storage, not approval, not
 * execution permission, not formal promotion, and not production readiness.
 */

import {
  PERSISTENCE_TARGET_CLASSES,
  DEFERRED_PERSISTENCE_TARGET_CLASSES,
  REJECTED_PERSISTENCE_TARGET_CLASSES,
  TARGET_DECISION_STATUSES,
  type TargetDecisionRecord,
  type TargetDecisionStatus,
  type TargetDecisionOutcome,
} from "./types.ts"
import { validateTargetDecisionRecord } from "./validators.ts"
import {
  type TargetDecisionConstructionResult,
  targetDecisionConstructorIssue,
  okTargetDecisionConstruction,
  failTargetDecisionConstruction,
} from "./construction.ts"

// ─── Caller input shapes ────────────────────────────────────────

/** Fields the caller supplies; the constructor fixes every safety/target field. */
export type CreateTargetDecisionRecordInput = {
  readonly target_decision_record_id: string
  readonly tenant_id: string
  readonly target_decision_status?: TargetDecisionStatus
  readonly target_decision_outcome?: TargetDecisionOutcome
  readonly decision_rationale: string
  readonly selected_target_rationale: string
  readonly deferred_target_rationales: readonly string[]
  readonly rejected_target_rationales: readonly string[]
  readonly d1_deferral_rationale: string
  readonly sql_deferral_rationale: string
  readonly approvalstore_deferral_rationale: string
  readonly external_action_deferral_rationale: string
  readonly p6_i5_merge_commit: string
  readonly reviewed_by_human_at: string
  readonly reviewed_by_human_id: string
  readonly reviewer_role: string
  readonly review_rationale: string
  readonly next_slice?: string
  readonly next_slice_scope: string
  readonly forbidden_next_slice_capabilities: readonly string[]
  readonly d1_gate_requirement: string
  readonly external_action_gate_requirement: string
  readonly approvalstore_gate_requirement: string
  readonly created_at: string
  readonly payload_hash: string
}

/** Blocked-path input: the caller must supply a non-empty no_go_flags array. */
export type CreateBlockedTargetDecisionRecordInput = CreateTargetDecisionRecordInput & {
  readonly no_go_flags: readonly string[]
}

// ─── Field sets ─────────────────────────────────────────────────

const SELECTED = PERSISTENCE_TARGET_CLASSES[0] // "in_memory_test_only_store"
const DEFERRED = [...DEFERRED_PERSISTENCE_TARGET_CLASSES] as const
const REJECTED = [...REJECTED_PERSISTENCE_TARGET_CLASSES] as const

const SAFETY_FIELDS = [
  "test_only_confirmed",
  "non_persistent_confirmed",
  "non_authorizing_confirmed",
  "app_runtime_untouched_confirmed",
  "d1_deferred_confirmed",
  "sql_deferred_confirmed",
  "approvalstore_unwired_confirmed",
  "external_actions_blocked_confirmed",
  "formal_workunit_promotion_blocked_confirmed",
] as const

const NON_BLOCKED_STATUSES: readonly string[] = TARGET_DECISION_STATUSES.filter(
  (s) => s !== "blocked_no_go",
)

// ─── Snapshot (single read, no mutation, no prototype reliance) ──

function snapshot(input: unknown): Record<string, unknown> | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null
  const source = input as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(source)) {
    out[key] = source[key]
  }
  return out
}

/** Freeze the record and its array fields before returning success. */
function freeze(record: Record<string, unknown>): TargetDecisionRecord {
  for (const key of Object.keys(record)) {
    const value = record[key]
    if (Array.isArray(value)) Object.freeze(value)
  }
  return Object.freeze(record) as unknown as TargetDecisionRecord
}

/** Apply the constructor-fixed safety/target/dependency fields onto `record`. */
function applyFixedFields(record: Record<string, unknown>): void {
  record.selected_target_class = SELECTED
  record.deferred_target_classes = [...DEFERRED]
  record.rejected_target_classes = [...REJECTED]
  for (const field of SAFETY_FIELDS) {
    record[field] = "confirmed"
  }
  record.p6_i5_merged = true
  record.storage_gate_spec_available = "present"
  record.persistence_gate_spec_available = "present"
  record.persistence_record_contract_available = "present"
  record.main_safety_gate_active = true
  record.human_review_required = true
}

function finish(record: Record<string, unknown>): TargetDecisionConstructionResult {
  const validation = validateTargetDecisionRecord(record)
  if (!validation.ok) {
    return failTargetDecisionConstruction(
      validation.issues.map((vi) =>
        targetDecisionConstructorIssue("validation_failed", vi.field),
      ),
    )
  }
  return okTargetDecisionConstruction(freeze(record))
}

// ─── createTargetDecisionRecord ─────────────────────────────────

export function createTargetDecisionRecord(
  input: CreateTargetDecisionRecordInput,
): TargetDecisionConstructionResult {
  try {
    const snap = snapshot(input as unknown)
    if (snap === null) {
      return failTargetDecisionConstruction([
        targetDecisionConstructorIssue("invalid_constructor_input", "(input)"),
      ])
    }
    // Start from a copy of the snapshot so genuinely-unknown caller keys (typos,
    // grant-like fields) flow through to the validator and fail closed there.
    const record: Record<string, unknown> = { ...snap }

    // Resolve caller-influenced enums with safe non-blocked defaults.
    const status =
      typeof snap.target_decision_status === "string" &&
      NON_BLOCKED_STATUSES.includes(snap.target_decision_status)
        ? snap.target_decision_status
        : "target_selected_for_future_types"
    record.target_decision_status = status
    record.target_decision_outcome = snap.target_decision_outcome === "warn" ? "warn" : "pass"
    record.next_slice =
      snap.next_slice === "P6-I5C" || snap.next_slice === "P6-I5D" ? snap.next_slice : "P6-I5D"

    // Fixed safety/target/dependency fields (any caller override is ignored).
    applyFixedFields(record)
    // Non-blocked path never carries No-Go flags.
    record.no_go_flags = []

    return finish(record)
  } catch {
    return failTargetDecisionConstruction([
      targetDecisionConstructorIssue("constructor_exception", "(record)"),
    ])
  }
}

// ─── createBlockedTargetDecisionRecord ──────────────────────────

export function createBlockedTargetDecisionRecord(
  input: CreateBlockedTargetDecisionRecordInput,
): TargetDecisionConstructionResult {
  try {
    const snap = snapshot(input as unknown)
    if (snap === null) {
      return failTargetDecisionConstruction([
        targetDecisionConstructorIssue("invalid_constructor_input", "(input)"),
      ])
    }
    const flags = snap.no_go_flags
    if (!Array.isArray(flags) || flags.length === 0) {
      return failTargetDecisionConstruction([
        targetDecisionConstructorIssue("invalid_constructor_input", "no_go_flags"),
      ])
    }

    const record: Record<string, unknown> = { ...snap }
    record.target_decision_status = "blocked_no_go"
    record.target_decision_outcome = "no_go"
    record.next_slice =
      snap.next_slice === "P6-I5C" || snap.next_slice === "P6-I5D" ? snap.next_slice : "P6-I5D"

    applyFixedFields(record)
    // Blocked path preserves the caller-provided non-empty No-Go flags.
    record.no_go_flags = [...flags]

    return finish(record)
  } catch {
    return failTargetDecisionConstruction([
      targetDecisionConstructorIssue("constructor_exception", "(record)"),
    ])
  }
}
