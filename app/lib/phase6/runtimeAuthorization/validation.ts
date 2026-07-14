/**
 * P6-FIX-012: shared issue codes, single-read snapshot helpers, and structural
 * guards for the Phase 6 Runtime Authorization module (Issue #145).
 *
 * Every stable issue code is declared here once. Codes name a failure CATEGORY
 * only and never echo a raw value (no hash, user id, session id, target, or
 * payload appears in a code or field label). Pure: no I/O, no clock, no
 * randomness, no mutation.
 */

// ─── Stable issue codes ─────────────────────────────────────────

export const RUNTIME_AUTHORIZATION_ISSUE_CODES = [
  // Structural / input
  "invalid_runtime_authorization_input",
  "runtime_authorization_validation_exception",
  "runtime_authorization_state_missing",
  // Linkage verification
  "runtime_authorization_linkage_invalid",
  "runtime_authorization_linkage_stale",
  "runtime_authorization_linkage_expired",
  "runtime_authorization_linkage_revoked",
  "runtime_authorization_linkage_used",
  "runtime_authorization_linkage_replayed",
  "runtime_authorization_linkage_not_verified",
  // Human Decision runtime matrix
  "runtime_authorization_decision_not_ready",
  "runtime_authorization_decision_outcome_not_pass",
  "runtime_authorization_decision_scope_mismatch",
  "runtime_authorization_evidence_not_accepted",
  "runtime_authorization_approval_not_required",
  "runtime_authorization_execution_not_required",
  "runtime_authorization_promotion_required",
  "runtime_authorization_four_eyes_not_required",
  "runtime_authorization_self_approval_not_blocked",
  "runtime_authorization_no_go_flag_present",
  "runtime_authorization_decision_invalid",
  // Intended-action envelope binding
  "runtime_authorization_tenant_mismatch",
  "runtime_authorization_workunit_mismatch",
  "runtime_authorization_action_preview_mismatch",
  "runtime_authorization_approval_mismatch",
  "runtime_authorization_action_type_mismatch",
  "runtime_authorization_target_hash_mismatch",
  "runtime_authorization_payload_hash_mismatch",
  // Executor identity
  "runtime_authorization_executor_invalid",
  "runtime_authorization_executor_actor_kind_mismatch",
  "runtime_authorization_executor_source_untrusted",
  "runtime_authorization_executor_subject_unsupported",
  "runtime_authorization_executor_tenant_mismatch",
  "runtime_authorization_executor_equals_approver",
  // Expiry
  "runtime_authorization_expired",
  // Timestamp consistency
  "runtime_authorization_timestamp_inconsistent",
] as const

export type RuntimeAuthorizationIssueCode =
  (typeof RUNTIME_AUTHORIZATION_ISSUE_CODES)[number]

const ISSUE_CODE_SET: ReadonlySet<string> = new Set(RUNTIME_AUTHORIZATION_ISSUE_CODES)

export type RuntimeAuthorizationIssue = {
  readonly code: RuntimeAuthorizationIssueCode
  readonly field: string
}

export function runtimeAuthorizationIssue(
  code: RuntimeAuthorizationIssueCode,
  field: string,
): RuntimeAuthorizationIssue {
  return { code, field }
}

/** Allowlist guard used by the audit projection so no forged code leaks. */
export function isRuntimeAuthorizationIssueCode(value: unknown): value is RuntimeAuthorizationIssueCode {
  return typeof value === "string" && ISSUE_CODE_SET.has(value)
}

// ─── Structural guards ──────────────────────────────────────────

export function isRuntimeAuthorizationRecordObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function isRuntimeAuthorizationNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}

const HEX64 = /^[0-9a-f]{64}$/

export function isRuntimeAuthorizationHex64(value: unknown): value is string {
  return typeof value === "string" && HEX64.test(value)
}

/**
 * Single-read snapshot of a plain record: read every own enumerable key exactly
 * once into a fresh object. A hostile getter/Proxy is invoked once here and can
 * never return one value at validation time and another at use time.
 */
export function snapshotRecordOrNull(value: unknown): Record<string, unknown> | null {
  if (!isRuntimeAuthorizationRecordObject(value)) return null
  const snapshot: Record<string, unknown> = {}
  for (const key of Object.keys(value)) {
    snapshot[key] = (value as Record<string, unknown>)[key]
  }
  return snapshot
}

/**
 * Bounded single-read DEEP snapshot. Every own enumerable property and every
 * array element of the original graph (down to `maxDepth`) is read EXACTLY ONCE
 * into a fresh frozen structure, so no downstream consumer can re-read an
 * original getter/Proxy and observe a substituted value. A throwing getter or
 * `ownKeys` trap surfaces as a thrown error the caller catches fail-closed;
 * leaves beyond `maxDepth` (in practice scalars) pass through unchanged.
 *
 * This reads the ORIGINAL object once; the frozen result is inert and may be
 * read any number of times. It performs no `toJSON`/prototype traversal and
 * copies own enumerable keys only.
 */
export function snapshotDeepFrozen(value: unknown, maxDepth = 8): unknown {
  if (maxDepth <= 0) return value
  if (Array.isArray(value)) {
    const out: unknown[] = []
    for (const el of value) out.push(snapshotDeepFrozen(el, maxDepth - 1))
    return Object.freeze(out)
  }
  if (isRuntimeAuthorizationRecordObject(value)) {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value)) {
      out[key] = snapshotDeepFrozen((value as Record<string, unknown>)[key], maxDepth - 1)
    }
    return Object.freeze(out)
  }
  return value
}
