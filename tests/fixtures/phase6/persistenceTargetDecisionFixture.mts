/**
 * P6-I5D: deterministic, TEST-ONLY Phase 6 Persistence Target Decision fixtures.
 *
 * This file builds two fixed TargetDecisionRecord objects — one valid record and
 * one blocked record — through the P6-I5C pure constructors and (transitively)
 * the P6-I5B validators, from fully caller-provided, fixed fixture data.
 *
 * It is NOT a runtime pipeline, NOT storage, and NOT an adapter: it is a fixture.
 * It reads no clock and no randomness, performs no I/O of any kind, mutates no
 * global state, and authorizes nothing. Fixture validity is not persistence, not
 * storage, not approval, not execution permission, and not production readiness.
 *
 * The only import is the Phase 6 Persistence Target Decision module surface. The
 * capability and purity boundaries are described in
 * docs/legacy/P6_I5D_TEST_ONLY_TARGET_DECISION_FIXTURE.md, not inside this source.
 */

import {
  createTargetDecisionRecord,
  createBlockedTargetDecisionRecord,
  type CreateTargetDecisionRecordInput,
  type CreateBlockedTargetDecisionRecordInput,
  type TargetDecisionRecord,
} from "../../../app/lib/phase6/persistenceTargetDecision/index.ts"

// ─── Fixed deterministic fixture inputs ─────────────────────────

export const VALID_TARGET_DECISION_RECORD_FIXTURE_INPUT: CreateTargetDecisionRecordInput =
  Object.freeze({
    target_decision_record_id: "tdr_fixture_valid_001",
    tenant_id: "tenant_phase6_target_decision_fixture",
    decision_rationale: "safest first target for future type and validator work",
    selected_target_rationale: "non-persistent, deterministic to validate",
    deferred_target_rationales: Object.freeze([
      "filesystem persistence deferred",
      "audit semantics deferred",
      "tenant isolation deferred",
      "database gate deferred",
    ]),
    rejected_target_rationales: Object.freeze(["blocked target is explicit No-Go"]),
    d1_deferral_rationale: "database gate not yet executed",
    sql_deferral_rationale: "query-language execution separately gated",
    approvalstore_deferral_rationale: "approval-store remains unwired",
    external_action_deferral_rationale: "external actions blocked",
    p6_i5_merge_commit: "56394e7",
    reviewed_by_human_at: "2026-07-06T15:00:00Z",
    reviewed_by_human_id: "human_fixture_reviewer_001",
    reviewer_role: "maintainer",
    review_rationale: "reviewed and recorded for future fixture work",
    next_slice: "P6-I5D",
    next_slice_scope: "test-only persistence target decision fixture",
    forbidden_next_slice_capabilities: Object.freeze(["persistence", "storage", "d1_execution"]),
    d1_gate_requirement: "separate database persistence gate",
    external_action_gate_requirement: "separate external action gate",
    approvalstore_gate_requirement: "separate approval-store gate",
    created_at: "2026-07-06T15:00:00Z",
    payload_hash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  }) as CreateTargetDecisionRecordInput

export const BLOCKED_TARGET_DECISION_RECORD_FIXTURE_INPUT: CreateBlockedTargetDecisionRecordInput =
  Object.freeze({
    target_decision_record_id: "tdr_fixture_blocked_001",
    tenant_id: "tenant_phase6_target_decision_fixture",
    decision_rationale: "target selection is blocked pending upstream gate",
    selected_target_rationale: "selection recorded but blocked",
    deferred_target_rationales: Object.freeze([
      "filesystem persistence deferred",
      "audit semantics deferred",
      "tenant isolation deferred",
      "database gate deferred",
    ]),
    rejected_target_rationales: Object.freeze(["blocked target is explicit No-Go"]),
    d1_deferral_rationale: "database gate not yet executed",
    sql_deferral_rationale: "query-language execution separately gated",
    approvalstore_deferral_rationale: "approval-store remains unwired",
    external_action_deferral_rationale: "external actions blocked",
    p6_i5_merge_commit: "56394e7",
    reviewed_by_human_at: "2026-07-06T15:00:00Z",
    reviewed_by_human_id: "human_fixture_reviewer_001",
    reviewer_role: "maintainer",
    review_rationale: "reviewed and recorded as blocked",
    next_slice: "P6-I5D",
    next_slice_scope: "test-only persistence target decision fixture",
    forbidden_next_slice_capabilities: Object.freeze(["persistence", "storage", "d1_execution"]),
    d1_gate_requirement: "separate database persistence gate",
    external_action_gate_requirement: "separate external action gate",
    approvalstore_gate_requirement: "separate approval-store gate",
    created_at: "2026-07-06T15:00:00Z",
    payload_hash: "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210",
    no_go_flags: Object.freeze(["target_selection_blocked_pending_gate"]),
  }) as CreateBlockedTargetDecisionRecordInput

// ─── Deterministic fixture factories ────────────────────────────

/** Build the valid fixture record through the P6-I5C constructor. */
export function createValidTargetDecisionRecordFixture(): TargetDecisionRecord {
  const result = createTargetDecisionRecord(VALID_TARGET_DECISION_RECORD_FIXTURE_INPUT)
  if (!result.ok) {
    throw new Error("P6-I5D valid target decision fixture failed to construct")
  }
  return result.record
}

/** Build the blocked fixture record through the P6-I5C blocked constructor. */
export function createBlockedTargetDecisionRecordFixture(): TargetDecisionRecord {
  const result = createBlockedTargetDecisionRecord(BLOCKED_TARGET_DECISION_RECORD_FIXTURE_INPUT)
  if (!result.ok) {
    throw new Error("P6-I5D blocked target decision fixture failed to construct")
  }
  return result.record
}

// ─── Constructed fixture records (frozen by the constructor) ─────

export const VALID_TARGET_DECISION_RECORD_FIXTURE: TargetDecisionRecord =
  createValidTargetDecisionRecordFixture()

export const BLOCKED_TARGET_DECISION_RECORD_FIXTURE: TargetDecisionRecord =
  createBlockedTargetDecisionRecordFixture()
