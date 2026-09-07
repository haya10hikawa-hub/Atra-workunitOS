/**
 * P6-I5I: deterministic, TEST-ONLY Phase 6 Persistence Audit Evidence fixtures.
 *
 * This file builds seven fixed PersistenceAuditEvent objects — one per audited
 * operation (put, get, list, count, clear_tenant, clear_all) plus one blocked
 * no-go event — through the P6-I5H pure constructors and (transitively) the
 * P6-I5G validator, from fully caller-provided, fixed fixture data.
 *
 * It is NOT an audit runtime, NOT an audit event emitter, NOT storage, and NOT a
 * recorder: it is a fixture. It reads no clock and no randomness, performs no
 * I/O of any kind, mutates no global state, and authorizes nothing. Fixture
 * validity is not truth, not approval, not execution permission, not audit
 * runtime, not persistence, not durable storage, and not production readiness.
 *
 * The only import is the Phase 6 Persistence Audit Evidence module surface. The
 * capability and purity boundaries are described in
 * docs/legacy/P6_I5I_TEST_ONLY_PERSISTENCE_AUDIT_EVIDENCE_FIXTURE.md, not inside this
 * source.
 */

import {
  createPutPersistenceAuditEvent,
  createGetPersistenceAuditEvent,
  createListPersistenceAuditEvent,
  createCountPersistenceAuditEvent,
  createClearTenantPersistenceAuditEvent,
  createClearAllPersistenceAuditEvent,
  createBlockedPersistenceAuditEvent,
  type CreatePersistenceAuditEventInput,
  type PersistenceAuditEvent,
  type PersistenceAuditEventConstructionResult,
} from "../../../app/lib/phase6/persistenceAuditEvidence/index.ts"

// ─── Shared fixed fixture values ────────────────────────────────

const FIXED_TENANT_ID = "tenant_audit_evidence_fixture"
const FIXED_TDR_ID = "tdr_audit_evidence_fixture_001"
const FIXED_CREATED_AT = "2026-07-08T00:00:00Z"
const FIXED_NON_AUTH =
  "This event is descriptive: it is not approval, not execution permission, not persistence, not durable storage, and not production readiness."

/** Common source lineage and evidence fields shared by every fixture input. */
const COMMON = Object.freeze({
  tenant_id: FIXED_TENANT_ID,
  target_decision_record_id: FIXED_TDR_ID,
  validator_issue_codes: Object.freeze([]) as readonly string[],
  adapter_issue_codes: Object.freeze([]) as readonly string[],
  idempotency_result: "first_write",
  duplicate_result: "first_write",
  tenant_scope_result: "tenant_scoped",
  defensive_snapshot_result: "frozen_snapshot_returned",
  non_durability_result: "in_memory_only",
  failure_reasons: Object.freeze([]) as readonly string[],
  redaction_result: "no_raw_payload",
  source_loop: "P6-I5E",
  source_adapter_loop: "P6-I5E",
  source_fixture_loop: "P6-I5D",
  source_validator_loop: "P6-I5G",
  source_constructor_loop: "P6-I5H",
  source_target_decision_record_id: FIXED_TDR_ID,
  created_at: FIXED_CREATED_AT,
  non_authorization_statement: FIXED_NON_AUTH,
  no_go_flags: Object.freeze([]) as readonly string[],
})

// ─── Fixed deterministic fixture inputs ─────────────────────────

export const VALID_PUT_AUDIT_EVENT_FIXTURE_INPUT: CreatePersistenceAuditEventInput = Object.freeze({
  ...COMMON,
  audit_event_id: "ae_put_fixture_001",
  operation: "put",
  operation_status: "accepted",
  operation_outcome: "pass",
  validation_result: "validator_passed",
  clear_scope: "none",
  record_count: 1,
  payload_hash: "a".repeat(64),
}) as CreatePersistenceAuditEventInput

export const VALID_GET_AUDIT_EVENT_FIXTURE_INPUT: CreatePersistenceAuditEventInput = Object.freeze({
  ...COMMON,
  audit_event_id: "ae_get_fixture_001",
  operation: "get",
  operation_status: "not_found",
  operation_outcome: "pass",
  validation_result: "validator_not_applicable",
  clear_scope: "none",
  record_count: 0,
  payload_hash: "b".repeat(64),
}) as CreatePersistenceAuditEventInput

export const VALID_LIST_AUDIT_EVENT_FIXTURE_INPUT: CreatePersistenceAuditEventInput = Object.freeze({
  ...COMMON,
  audit_event_id: "ae_list_fixture_001",
  operation: "list",
  operation_status: "accepted",
  operation_outcome: "pass",
  validation_result: "validator_not_applicable",
  clear_scope: "none",
  record_count: 3,
  payload_hash: "c".repeat(64),
}) as CreatePersistenceAuditEventInput

export const VALID_COUNT_AUDIT_EVENT_FIXTURE_INPUT: CreatePersistenceAuditEventInput = Object.freeze({
  ...COMMON,
  audit_event_id: "ae_count_fixture_001",
  operation: "count",
  operation_status: "accepted",
  operation_outcome: "pass",
  validation_result: "validator_not_applicable",
  clear_scope: "none",
  record_count: 2,
  payload_hash: "d".repeat(64),
}) as CreatePersistenceAuditEventInput

export const VALID_CLEAR_TENANT_AUDIT_EVENT_FIXTURE_INPUT: CreatePersistenceAuditEventInput =
  Object.freeze({
    ...COMMON,
    audit_event_id: "ae_clear_tenant_fixture_001",
    operation: "clear_tenant",
    operation_status: "cleared",
    operation_outcome: "pass",
    validation_result: "validator_not_applicable",
    clear_scope: "tenant_only",
    record_count: 2,
    payload_hash: "e".repeat(64),
  }) as CreatePersistenceAuditEventInput

export const VALID_CLEAR_ALL_AUDIT_EVENT_FIXTURE_INPUT: CreatePersistenceAuditEventInput =
  Object.freeze({
    ...COMMON,
    audit_event_id: "ae_clear_all_fixture_001",
    operation: "clear_all",
    operation_status: "cleared",
    operation_outcome: "pass",
    validation_result: "validator_not_applicable",
    clear_scope: "all_test_memory",
    record_count: 0,
    payload_hash: "f".repeat(64),
  }) as CreatePersistenceAuditEventInput

export const BLOCKED_NO_GO_AUDIT_EVENT_FIXTURE_INPUT: CreatePersistenceAuditEventInput = Object.freeze({
  ...COMMON,
  audit_event_id: "ae_blocked_fixture_001",
  operation: "put",
  operation_status: "blocked_no_go",
  operation_outcome: "no_go",
  validation_result: "validator_failed",
  clear_scope: "none",
  record_count: 0,
  payload_hash: "0".repeat(64),
  no_go_flags: Object.freeze(["validation_failed"]) as readonly string[],
}) as CreatePersistenceAuditEventInput

// ─── Deterministic fixture factories ────────────────────────────

function unwrap(result: PersistenceAuditEventConstructionResult, label: string): PersistenceAuditEvent {
  if (!result.ok) {
    throw new Error(`P6-I5I ${label} audit evidence fixture failed to construct`)
  }
  return result.event
}

export function createValidPutAuditEventFixture(): PersistenceAuditEvent {
  return unwrap(createPutPersistenceAuditEvent(VALID_PUT_AUDIT_EVENT_FIXTURE_INPUT), "put")
}
export function createValidGetAuditEventFixture(): PersistenceAuditEvent {
  return unwrap(createGetPersistenceAuditEvent(VALID_GET_AUDIT_EVENT_FIXTURE_INPUT), "get")
}
export function createValidListAuditEventFixture(): PersistenceAuditEvent {
  return unwrap(createListPersistenceAuditEvent(VALID_LIST_AUDIT_EVENT_FIXTURE_INPUT), "list")
}
export function createValidCountAuditEventFixture(): PersistenceAuditEvent {
  return unwrap(createCountPersistenceAuditEvent(VALID_COUNT_AUDIT_EVENT_FIXTURE_INPUT), "count")
}
export function createValidClearTenantAuditEventFixture(): PersistenceAuditEvent {
  return unwrap(
    createClearTenantPersistenceAuditEvent(VALID_CLEAR_TENANT_AUDIT_EVENT_FIXTURE_INPUT),
    "clear_tenant",
  )
}
export function createValidClearAllAuditEventFixture(): PersistenceAuditEvent {
  return unwrap(
    createClearAllPersistenceAuditEvent(VALID_CLEAR_ALL_AUDIT_EVENT_FIXTURE_INPUT),
    "clear_all",
  )
}
export function createBlockedNoGoAuditEventFixture(): PersistenceAuditEvent {
  return unwrap(createBlockedPersistenceAuditEvent(BLOCKED_NO_GO_AUDIT_EVENT_FIXTURE_INPUT), "blocked")
}

// ─── Constructed fixture events (frozen by the constructor) ─────

export const VALID_PUT_AUDIT_EVENT_FIXTURE: PersistenceAuditEvent = createValidPutAuditEventFixture()
export const VALID_GET_AUDIT_EVENT_FIXTURE: PersistenceAuditEvent = createValidGetAuditEventFixture()
export const VALID_LIST_AUDIT_EVENT_FIXTURE: PersistenceAuditEvent = createValidListAuditEventFixture()
export const VALID_COUNT_AUDIT_EVENT_FIXTURE: PersistenceAuditEvent = createValidCountAuditEventFixture()
export const VALID_CLEAR_TENANT_AUDIT_EVENT_FIXTURE: PersistenceAuditEvent =
  createValidClearTenantAuditEventFixture()
export const VALID_CLEAR_ALL_AUDIT_EVENT_FIXTURE: PersistenceAuditEvent =
  createValidClearAllAuditEventFixture()
export const BLOCKED_NO_GO_AUDIT_EVENT_FIXTURE: PersistenceAuditEvent =
  createBlockedNoGoAuditEventFixture()

/** Deterministically ordered: put, get, list, count, clear_tenant, clear_all, blocked. */
export const ALL_PERSISTENCE_AUDIT_EVENT_FIXTURES: readonly PersistenceAuditEvent[] = Object.freeze([
  VALID_PUT_AUDIT_EVENT_FIXTURE,
  VALID_GET_AUDIT_EVENT_FIXTURE,
  VALID_LIST_AUDIT_EVENT_FIXTURE,
  VALID_COUNT_AUDIT_EVENT_FIXTURE,
  VALID_CLEAR_TENANT_AUDIT_EVENT_FIXTURE,
  VALID_CLEAR_ALL_AUDIT_EVENT_FIXTURE,
  BLOCKED_NO_GO_AUDIT_EVENT_FIXTURE,
])
