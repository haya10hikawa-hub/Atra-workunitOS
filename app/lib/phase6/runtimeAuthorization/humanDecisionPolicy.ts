/**
 * P6-FIX-012: the single explicit pure Human Decision RUNTIME eligibility policy
 * (Issue #145).
 *
 * A structurally valid Human Decision is NOT automatically runtime authorization
 * material. This policy runs the canonical Human Decision validator internally
 * and then requires the full runtime matrix. Every failure category has a stable
 * issue code and never echoes a raw value. Free-text fields (`allowed_use`,
 * `disallowed_use`, rationale, summary, reviewer role, model confidence /
 * uncertainty) can never expand authority — they are never read as a grant.
 *
 * SNAPSHOT-ONCE. The Human Decision is snapshotted once and every own
 * array-valued field is replaced with a frozen single-read copy before the
 * validator and the matrix read it, so a getter-backed array cannot present one
 * value to validation and another to the matrix. A fabricated caller-supplied
 * "validator result" is impossible: the policy calls the validator itself.
 *
 * `promotion_required === true` fails closed — no promotion gate exists in this
 * patch. `warn`, `fail`, `no_go`, draft/clarification/blocked statuses, and any
 * no-go flag all fail. Pure: no I/O, no clock, no randomness, no mutation.
 */

import { validateHumanDecisionRecord } from "../artifacts/index.ts"
import {
  type RuntimeAuthorizationIssue,
  runtimeAuthorizationIssue,
  snapshotRecordOrNull,
} from "./validation.ts"

export type HumanDecisionRuntimeEligibilityResult = {
  readonly ok: boolean
  readonly issues: readonly RuntimeAuthorizationIssue[]
}

/**
 * Snapshot a Human Decision once and defensively freeze every own array-valued
 * field with a bounded one-level copy (snapshot-depth hardening), so validation
 * and the matrix observe identical `no_go_flags` / `allowed_use` content.
 */
function snapshotHumanDecision(value: unknown): Record<string, unknown> | null {
  const snapshot = snapshotRecordOrNull(value)
  if (snapshot === null) return null
  for (const key of Object.keys(snapshot)) {
    const v = snapshot[key]
    if (Array.isArray(v)) {
      const copy: unknown[] = []
      for (const el of v) copy.push(el)
      snapshot[key] = Object.freeze(copy)
    }
  }
  return snapshot
}

/**
 * Evaluate the Human Decision runtime eligibility matrix over an untrusted
 * Human Decision. Returns `ok: true` only when the record validates AND every
 * matrix condition holds.
 */
export function evaluateHumanDecisionRuntimeEligibility(
  humanDecision: unknown,
): HumanDecisionRuntimeEligibilityResult {
  try {
    const hd = snapshotHumanDecision(humanDecision)
    if (hd === null) {
      return { ok: false, issues: [runtimeAuthorizationIssue("runtime_authorization_decision_invalid", "(human_decision)")] }
    }

    // 1. Canonical structural + semantic validation, run internally. A
    //    caller-supplied "already validated" flag is never trusted.
    const validation = validateHumanDecisionRecord(hd)
    if (!validation.ok) {
      return { ok: false, issues: [runtimeAuthorizationIssue("runtime_authorization_decision_invalid", "(human_decision)")] }
    }

    const issues: RuntimeAuthorizationIssue[] = []

    // 2. Runtime matrix — all ten conditions must hold exactly.
    if (hd.decision_status !== "ready_for_future_gate_review") {
      issues.push(runtimeAuthorizationIssue("runtime_authorization_decision_not_ready", "(human_decision).decision_status"))
    }
    if (hd.decision_outcome !== "pass") {
      issues.push(runtimeAuthorizationIssue("runtime_authorization_decision_outcome_not_pass", "(human_decision).decision_outcome"))
    }
    if (hd.decision_impact_scope !== "action_readiness_assessment") {
      issues.push(runtimeAuthorizationIssue("runtime_authorization_decision_scope_mismatch", "(human_decision).decision_impact_scope"))
    }
    if (hd.evidence_accepted !== true) {
      issues.push(runtimeAuthorizationIssue("runtime_authorization_evidence_not_accepted", "(human_decision).evidence_accepted"))
    }
    if (hd.approval_required !== true) {
      issues.push(runtimeAuthorizationIssue("runtime_authorization_approval_not_required", "(human_decision).approval_required"))
    }
    if (hd.execution_required !== true) {
      issues.push(runtimeAuthorizationIssue("runtime_authorization_execution_not_required", "(human_decision).execution_required"))
    }
    // No promotion gate exists in this patch: a decision that still expects
    // promotion fails closed.
    if (hd.promotion_required !== false) {
      issues.push(runtimeAuthorizationIssue("runtime_authorization_promotion_required", "(human_decision).promotion_required"))
    }
    if (hd.four_eyes_required !== true) {
      issues.push(runtimeAuthorizationIssue("runtime_authorization_four_eyes_not_required", "(human_decision).four_eyes_required"))
    }
    if (hd.self_approval_blocked !== true) {
      issues.push(runtimeAuthorizationIssue("runtime_authorization_self_approval_not_blocked", "(human_decision).self_approval_blocked"))
    }
    const flags = hd.no_go_flags
    if (!Array.isArray(flags) || flags.length !== 0) {
      issues.push(runtimeAuthorizationIssue("runtime_authorization_no_go_flag_present", "(human_decision).no_go_flags"))
    }

    return { ok: issues.length === 0, issues }
  } catch {
    return { ok: false, issues: [runtimeAuthorizationIssue("runtime_authorization_validation_exception", "(human_decision_policy)")] }
  }
}
