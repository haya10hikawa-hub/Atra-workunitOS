/**
 * P6-FIX-012 (Issue #145): the redacted runtime authorization audit projection.
 * Proves the allowlist, that no hash / raw target-payload / session id / reviewer
 * id / token / secret leaks, that malformed input is fully redacted, and that the
 * projection is frozen and deterministic.
 */

import test from "node:test"
import assert from "node:assert/strict"
import {
  projectRuntimeAuthorizationAudit,
  RUNTIME_AUTHORIZATION_AUDIT_EVENT_KINDS,
} from "../app/lib/phase6/runtimeAuthorization/index.ts"

function base(over: Record<string, unknown> = {}) {
  return {
    event_kind: "runtime_authorization_created" as const,
    tenant_id: "tenant-1", workunit_id: "wu-1", action_preview_id: "preview-1",
    approval_id: "approval-1", action_type: "slack_reply",
    state: "authorized_not_executed" as const,
    issue_codes: [], evaluated_at: "2026-07-05T03:00:00Z", ...over,
  }
}

test("every lifecycle event kind is projectable and frozen", () => {
  for (const kind of RUNTIME_AUTHORIZATION_AUDIT_EVENT_KINDS) {
    const ev = projectRuntimeAuthorizationAudit(base({ event_kind: kind }))
    assert.equal(ev.event_kind, kind)
    assert.equal(Object.isFrozen(ev), true)
  }
})

test("only allowlisted issue codes survive; forged codes are dropped", () => {
  const ev = projectRuntimeAuthorizationAudit(base({
    issue_codes: ["runtime_authorization_executor_equals_approver", "grant_everything", "", 42, null],
  }))
  assert.deepEqual(ev.issue_codes, ["runtime_authorization_executor_equals_approver"])
})

test("the projection carries no hash / raw target / payload / token fields", () => {
  const ev = projectRuntimeAuthorizationAudit(base())
  for (const forbidden of ["authorization_hash", "target_hash", "payload_hash", "raw_target", "raw_payload", "executor_id", "session_id", "reviewer_id", "token", "secret"]) {
    assert.ok(!(forbidden in ev), `audit must not expose ${forbidden}`)
  }
})

test("malformed identifiers are redacted, not echoed", () => {
  const ev = projectRuntimeAuthorizationAudit(base({
    event_kind: "runtime_authorization_rejected",
    tenant_id: 12345, workunit_id: null, action_preview_id: undefined, approval_id: {}, action_type: "",
    state: "invalid",
  }))
  assert.equal(ev.tenant_id, "redacted")
  assert.equal(ev.workunit_id, "redacted")
  assert.equal(ev.action_preview_id, "redacted")
  assert.equal(ev.approval_id, "redacted")
  assert.equal(ev.action_type, "redacted")
})

test("projection is deterministic", () => {
  assert.deepEqual(projectRuntimeAuthorizationAudit(base()), projectRuntimeAuthorizationAudit(base()))
})
