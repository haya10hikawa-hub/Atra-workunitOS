/**
 * P6-FIX-012: the pure, redacted Runtime Authorization audit projection
 * (Issue #145).
 *
 * Producing an audit event authorizes nothing. The projection exposes
 * allowlisted identifiers (tenant, WorkUnit, ActionPreview, Approval, action
 * type), the lifecycle state, and allowlisted stable issue codes ONLY. Every
 * issue code passes the canonical allowlist; a non-allowlisted or forged code is
 * dropped. It never exposes the authorization hash, target/payload hash, raw
 * target/payload, session IDs, reviewer IDs, roles, email, tokens, or secrets.
 *
 * Malformed input yields a fully redacted `runtime_authorization_rejected`
 * event. Pure: no I/O, no clock (`evaluated_at` supplied), no randomness, no
 * mutation. Deterministic and frozen.
 */

import {
  type RuntimeAuthorizationAuditEvent,
  type RuntimeAuthorizationAuditEventKind,
  type RuntimeAuthorizationEligibilityState,
  RUNTIME_AUTHORIZATION_STATUS,
} from "./types.ts"
import {
  isRuntimeAuthorizationIssueCode,
  isRuntimeAuthorizationNonEmptyString,
} from "./validation.ts"

const REDACTED = "redacted"

export type RuntimeAuthorizationAuditInput = {
  readonly event_kind: RuntimeAuthorizationAuditEventKind
  readonly tenant_id: unknown
  readonly workunit_id: unknown
  readonly action_preview_id: unknown
  readonly approval_id: unknown
  readonly action_type: unknown
  readonly state: RuntimeAuthorizationEligibilityState | typeof RUNTIME_AUTHORIZATION_STATUS
  readonly issue_codes: readonly unknown[]
  readonly evaluated_at: string
}

function safeId(value: unknown): string {
  return isRuntimeAuthorizationNonEmptyString(value) ? value : REDACTED
}

/**
 * A typed BATCH sink the server-side gate flushes redacted runtime-authorization
 * lifecycle events into — ONCE, AFTER the terminal authorization decision.
 *
 * The gate never invokes the sink inside the security-critical window (between
 * the final RBAC/kill-switch checks and the atomic claim): it buffers frozen,
 * redacted events locally and flushes the ordered array only after a terminal
 * result. `flush` is awaited by the gate so durable persistence completes within
 * the request lifecycle; it must be internally fail-open (a flush failure must
 * never change the authorization result) and is always given the output of
 * `projectRuntimeAuthorizationAudit`.
 */
export interface RuntimeAuthorizationAuditSink {
  flush(events: readonly RuntimeAuthorizationAuditEvent[]): void | Promise<void>
}

/** A sink that discards events (default when no audit wiring is supplied). */
export const noopRuntimeAuthorizationAuditSink: RuntimeAuthorizationAuditSink = {
  flush() {
    /* no-op */
  },
}

/**
 * Project one redacted runtime-authorization audit event. Only allowlisted
 * identifiers survive; every issue code is filtered through the canonical
 * allowlist.
 */
export function projectRuntimeAuthorizationAudit(
  input: RuntimeAuthorizationAuditInput,
): RuntimeAuthorizationAuditEvent {
  const issueCodes: string[] = []
  if (Array.isArray(input.issue_codes)) {
    for (const code of input.issue_codes) {
      if (isRuntimeAuthorizationIssueCode(code)) issueCodes.push(code)
    }
  }
  return Object.freeze({
    event_kind: input.event_kind,
    tenant_id: safeId(input.tenant_id),
    workunit_id: safeId(input.workunit_id),
    action_preview_id: safeId(input.action_preview_id),
    approval_id: safeId(input.approval_id),
    action_type: safeId(input.action_type),
    state: input.state,
    issue_codes: Object.freeze(issueCodes),
    evaluated_at: input.evaluated_at,
  })
}
