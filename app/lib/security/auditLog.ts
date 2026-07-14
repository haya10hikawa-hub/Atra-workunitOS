/**
 * Audit logging foundation for WorkUnit OS.
 *
 * Defines the audit event vocabulary and a no-op writeAuditLog function
 * that serves as the hook point for future persistence (database, log drain, SIEM).
 *
 * Audit events MUST NOT log:
 *   - raw secrets, tokens, or API keys
 *   - full raw source content (Slack body, Gmail body, etc.)
 *   - personally identifiable information beyond what is necessary
 *   - stack traces
 *   - environment variable values
 */

export type AuditEventKind =
  // Request lifecycle
  | "tool_request_received"
  | "tool_request_validated"
  | "tool_request_rejected"
  // Auth / RBAC / tenant
  | "auth_required"
  | "rbac_denied"
  | "tenant_boundary_violation"
  // External action lifecycle
  | "external_action_blocked"
  | "external_action_approval_required"
  | "external_action_approved"
  | "external_action_executed"
  | "external_action_failed"
  // Approval lifecycle
  | "approval_requested"
  | "approval_granted"
  | "approval_rejected"
  | "approval_expired"
  | "approval_used"
  | "approval_payload_mismatch"
  | "approval_target_mismatch"
  // WorkUnit lifecycle
  | "workunit_draft_created"
  | "workunit_reviewed"
  | "action_preview_created"
  | "execution_command_created"
  // Error / conflict
  | "integration_missing"
  | "rate_limited"
  | "conflict"
  | "internal_error"
  // LLM processing
  | "llm_processing_started"
  | "llm_processing_completed"
  | "llm_processing_blocked"
  | "llm_processing_failed"
  | "llm_budget_exceeded"
  // Action Preview lifecycle
  | "action_preview_create_requested"
  | "action_preview_created"
  | "action_preview_create_failed"
  // Approval lifecycle
  | "approval_create_requested"
  | "approval_created"
  | "approval_rejected"
  | "approval_create_failed"
  | "approval_lookup_failed"
  | "self_approval_forbidden"
  // Approval status endpoint
  | "approval_status_requested"
  | "approval_status_returned"
  | "approval_status_failed"
  // Execution
  | "execution_approval_failed"
  | "execution_approval_verified"
  | "execution_approval_consumed"
  // Execution dry-run
  | "execution_dry_run_requested"
  | "execution_dry_run_verified"
  | "execution_dry_run_blocked"
  | "execution_dry_run_failed"
  // Runtime authorization (Issue #145)
  | "runtime_authorization_requested"
  | "runtime_authorization_eligible"
  | "runtime_authorization_claimed"
  | "runtime_authorization_created"
  | "runtime_authorization_rejected"
  | "runtime_authorization_replayed"
  | "runtime_authorization_blocked"

export type AuditEvent = {
  kind: AuditEventKind
  timestamp: string
  tenantId?: string
  actorId?: string
  requestId?: string
  workUnitId?: string
  operation?: string
  target?: string
  reason?: string
  metadata?: Record<string, string | number | boolean | null>
}

/**
 * Write an audit event to the audit log.
 *
 * CURRENT: no-op. Intended hook point for future database/SIEM integration.
 * The function signature is stable — callers should not change when the
 * implementation gains a real backend.
 *
 * SAFETY: callers MUST strip secrets and raw source content before passing
 * metadata. This function does not sanitize its input.
 */
export async function writeAuditLog(_event: AuditEvent): Promise<void> {
  // TODO: persist to database, log drain, or SIEM
  // Intentionally no-op in development. In production, this must not fail
  // open — a logging failure should not block the primary request path.
  if (process.env.NODE_ENV === "development" && process.env.AUDIT_LOG_VERBOSE === "true") {
    console.log("[AUDIT]", JSON.stringify(_event))
  }
}
