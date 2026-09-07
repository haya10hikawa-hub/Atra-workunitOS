# API_CONTRACT.md

**Status: CANONICAL — CURRENT V0 IMPLEMENTATION CONTRACT ONLY.** This API shape does not define or authorize the next product.

# WorkUnit OS API Contract

## 1. Purpose

This document defines the canonical API surface for WorkUnit OS.

It specifies stable boundaries for:

* WorkUnit lifecycle operations (ingest → draft → review → preview → approve → execute)
* Action Field operations (workspace editing, preview generation, approval flow)
* External execution (Slack, Gmail, GitHub, Google Calendar)
* Common request/response shapes, error codes, and security requirements

The API must never trust the client.
Every write operation must go through: session → tenant → RBAC → validation → policy → audit.

---

## 2. API Design Principles

1. **Frontend state is not authority.** No client-provided boolean (`approvedByPm`, `canExecute`) authorizes any server action.

2. **AI output is not authority.** AI-generated text in requests is treated as a suggestion, not a command. It never bypasses approval.

3. **Client approval flags are not authority.** `approvedByPm` is always stripped. Approval is always server-side.

4. **Client externalConfig is not authority.** Target channels, repos, recipients, and calendar IDs are resolved server-side from tenant-owned integration config. Client-provided `externalConfig` is always stripped.

5. **Server-side policy is authority.** Kill switch, RBAC, tenant boundary, and approval state are checked server-side on every request.

6. **All write operations require:** authenticated session → tenant context → RBAC permission check → input validation → kill switch check (for external) → audit log

7. **External actions are disabled by default.** `EXTERNAL_ACTIONS_ENABLED !== "true"` blocks all external execution.

8. **All responses use safe error codes.** No stack traces, internal validation details, environment values, tokens, or provider secrets in responses.

---

## 3. Common Request Requirements

### 3.1 Every Request

| Requirement          | How                                              |
| -------------------- | ------------------------------------------------ |
| Authenticated session| `Authorization: Bearer <token>` or session cookie |
| Tenant context       | Resolved from session; never client-provided     |
| Request ID           | `x-request-id` header or generated server-side   |
| Content-Length cap   | 64KB default; 256KB for file-attached requests   |
| Rate limit           | Per-user + per-tenant (deferred to implementation) |

### 3.2 Write Operations

| Requirement          | How                                              |
| -------------------- | ------------------------------------------------ |
| CSRF token           | `x-csrf-token` header or double-submit cookie    |
| Idempotency key      | `x-idempotency-key` header (execution endpoints) |
| JSON body validation | Runtime validation via `toolBackendValidation.ts` |
| Content type         | `application/json`                               |

### 3.3 Audit Events

Every request that modifies state must emit at minimum:

* `tool_request_received` — when the request is accepted by the handler
* `tool_request_validated` or `tool_request_rejected` — after validation
* Domain-specific event — e.g. `workunit_draft_created`, `execution_command_created`

Audit events must not contain:
* OAuth tokens or API keys
* Raw Slack/Gmail/document body text
* Full source content
* Stack traces

---

## 4. Common Response Envelope

### 4.1 Success

```ts
type ApiSuccess<T> = {
  ok: true
  requestId: string
  data: T
  auditEventId?: string
}
```

### 4.2 Failure

```ts
type ApiFailure = {
  ok: false
  requestId: string
  error: SafeErrorCode
  // Never: stack, internal detail, token, env value, provider secret
}
```

### 4.3 HTTP Status Mapping

| Error Code                  | HTTP Status |
| --------------------------- | ----------- |
| invalid_request             | 400         |
| unauthorized                | 401         |
| forbidden                   | 403         |
| tenant_boundary_violation   | 403         |
| external_actions_disabled   | 403         |
| approval_required           | 403         |
| approval_expired            | 403         |
| approval_used               | 409         |
| approval_payload_mismatch   | 409         |
| approval_target_mismatch    | 409         |
| rate_limited                | 429         |
| conflict                    | 409         |
| integration_missing         | 503         |
| internal_error              | 500         |

---

## 5. Safe Error Codes

Defined in `app/lib/security/safeErrors.ts`.

Extended codes for API-level use:

```ts
type SafeErrorCode =
  | "invalid_request"
  | "unauthorized"
  | "forbidden"
  | "tenant_boundary_violation"
  | "external_actions_disabled"
  | "approval_required"
  | "approval_expired"
  | "approval_used"
  | "approval_payload_mismatch"
  | "approval_target_mismatch"
  | "integration_missing"
  | "rate_limited"
  | "conflict"
  | "internal_error"
```

All codes above are currently defined in `app/lib/security/safeErrors.ts`.

---

## 6. Endpoint Overview

| Method | Path                                      | Purpose                            | Current status |
| ------ | ----------------------------------------- | ---------------------------------- | -------------- |
| POST   | `/api/workunit/signals/ingest`            | Ingest external signal             | Planned        |
| POST   | `/api/workunit/candidates`                | Create source candidate            | Planned        |
| POST   | `/api/workunit/drafts`                    | Create WorkUnit draft              | Planned        |
| PATCH  | `/api/workunit/drafts/:id`                | Edit WorkUnit draft                | Planned        |
| POST   | `/api/workunit/drafts/:id/review`         | Review draft → ReviewedWorkUnit    | Planned        |
| POST   | `/api/workunit/:id/action-preview`        | Generate action preview            | Implemented    |
| POST   | `/api/workunit/:id/approval`              | Request server-side approval       | Implemented    |
| POST   | `/api/workunit/:id/execute`               | Execute approved action            | Planned        |
| GET    | `/api/workunit/:id/executions/:eid`       | Fetch execution result             | Planned        |
| POST   | `/api/workunit/tools`                     | Compatibility endpoint (legacy)    | Implemented    |

---

## 7. Current Compatibility Endpoint

### POST /api/workunit/tools

| Attribute          | Value                                                  |
| ------------------ | ------------------------------------------------------ |
| Purpose            | Multi-operation compatibility endpoint                 |
| Auth               | `requireSession` enforced                             |
| Permissions        | RBAC enforced by operation                             |
| Kill switch        | Checked for external operations                        |
| Validation         | Runtime via `validateToolBackendRequest`               |
| Approval stripping | Strips `approvedByPm`, `externalConfig`               |
| Audit              | `writeAuditLog` called for request and rejection paths |
| Execution dispatch | Approval-gated; real external dispatch not fully wired |

**Request body (current):**

```ts
type ToolBackendRequest = {
  id: string
  source: "slack" | "notion" | "gmail" | "google_drive" | "google_calendar" | "github"
  operation: "ingest" | "draft" | "create_issue" | "create_task" | "schedule" | "reply"
  event?: SourceHopperEvent
  draft?: WorkUnitDraft
  // The following are STRIPPED before backend dispatch:
  // approvedByPm, externalConfig
}
```

**Success response:**

```ts
type ToolBackendResponse = {
  ok: boolean
  requestId: string
  target?: "hopper" | "draft" | "task" | "github_issue" | "calendar" | "slack_reply" | "gmail_reply"
  result?: unknown
  externalRef?: string | null
  errors: string[]
}
```

**Safe errors:** `invalid_request` (400), `external_actions_disabled` (403), `internal_error` (500)

**Future direction:** This endpoint should be split into the lifecycle-specific endpoints defined in Section 8. The split must not weaken any existing guard. While this endpoint exists, it must retain: runtime validation, kill switch double guard, `approvedByPm` stripping, `externalConfig` stripping, and safe error responses.

---

## 8. WorkUnit Lifecycle Endpoints

Each endpoint maps to a domain transition defined in `app/lib/domain/workUnitLifecycle.ts`.

### 8.1 POST /api/workunit/signals/ingest

| Attribute      | Value                                              |
| -------------- | -------------------------------------------------- |
| Purpose        | Ingest an ExternalSignal from a source provider    |
| Auth           | requireSession                                     |
| Permission     | workunit.create                                    |
| Audit events   | external_signal_received, tool_request_validated   |
| Domain         | ExternalSignal (new)                               |
| Transition     | (none — first object in chain)                     |

**Request:**

```ts
{
  sourceType: "slack" | "gmail" | "github" | "google_calendar" | "manual" | "meeting_transcript"
  sourceRef: {
    source: SourceType
    externalId: string
    container?: string
    url?: string
    capturedAt: string
  }
  metadata: Record<string, unknown>
  rawContentRef?: string
}
```

**Success (201):**

```ts
{
  ok: true
  requestId: string
  data: {
    signal: ExternalSignal
  }
}
```

**Safe errors:** `invalid_request`, `unauthorized`, `forbidden`, `rate_limited`

### 8.2 POST /api/workunit/candidates

| Attribute      | Value                                              |
| -------------- | -------------------------------------------------- |
| Purpose        | Create a SourceCandidate from one or more signals  |
| Auth           | requireSession                                     |
| Permission     | workunit.create                                    |
| Audit events   | source_candidate_created                           |
| Domain         | SourceCandidate (new)                              |
| Transition     | ExternalSignal → SourceCandidate                   |

**Request:**

```ts
{
  sourceSignalIds: string[]
  extractedSummary: string
  detectedActors: string[]
  detectedProblem?: string
  detectedDeadline?: string
  detectedIntent?: string
  confidence: number
}
```

**Success (201):**

```ts
{
  ok: true
  requestId: string
  data: {
    candidate: SourceCandidate
  }
}
```

**Safe errors:** `invalid_request`, `unauthorized`, `forbidden`, `tenant_boundary_violation`

### 8.3 POST /api/workunit/drafts

| Attribute      | Value                                              |
| -------------- | -------------------------------------------------- |
| Purpose        | Create a WorkUnitDraft from a SourceCandidate      |
| Auth           | requireSession                                     |
| Permission     | workunit.create                                    |
| Audit events   | workunit_draft_created                             |
| Domain         | WorkUnitDraft (new)                                |
| Transition     | SourceCandidate → WorkUnitDraft                    |

**Request:**

```ts
{
  sourceCandidateIds: string[]
  title: string
  situation: string
  problem: string
  actors: string[]
  urgency?: number
  impact?: number
  effort?: number
  nextAction?: string
  createdBy: "system" | "ai" | "user"
}
```

**Success (201):**

```ts
{
  ok: true
  requestId: string
  data: {
    draft: WorkUnitDraft
  }
}
```

### 8.4 PATCH /api/workunit/drafts/:id

| Attribute      | Value                                              |
| -------------- | -------------------------------------------------- |
| Purpose        | Edit a WorkUnitDraft's workspace content           |
| Auth           | requireSession                                     |
| Permission     | workunit.edit                                      |
| Audit events   | (deferred to workspace change tracking)            |
| Domain         | WorkUnitDraft (updated)                            |
| Transition     | None (draft → draft)                               |

**Request (partial):**

```ts
{
  title?: string
  situation?: string
  problem?: string
  actors?: string[]
  nextAction?: string
  tasks?: string[]
  urgency?: number
  impact?: number
  effort?: number
}
```

**Success (200):**

```ts
{
  ok: true
  requestId: string
  data: {
    draft: WorkUnitDraft
    approvalInvalidated: boolean   // true if an existing approval was invalidated by this edit
  }
}
```

**Safe errors:** `invalid_request`, `unauthorized`, `forbidden`, `tenant_boundary_violation`

### 8.5 POST /api/workunit/drafts/:id/review

| Attribute      | Value                                              |
| -------------- | -------------------------------------------------- |
| Purpose        | Promote a WorkUnitDraft to ReviewedWorkUnit        |
| Auth           | requireSession                                     |
| Permission     | workunit.review                                    |
| Audit events   | workunit_reviewed                                  |
| Domain         | ReviewedWorkUnit (new)                             |
| Transition     | WorkUnitDraft → ReviewedWorkUnit                   |

**Request:** No body required (draft ID in path).

**Success (200):**

```ts
{
  ok: true
  requestId: string
  data: {
    reviewedWorkUnit: ReviewedWorkUnit
  }
}
```

**Safe errors:** `invalid_request`, `unauthorized`, `forbidden`, `tenant_boundary_violation`

### 8.6 POST /api/workunit/:id/action-preview

| Attribute      | Value                                              |
| -------------- | -------------------------------------------------- |
| Purpose        | Generate an ActionPreview for an external action   |
| Auth           | requireSession                                     |
| Permission     | workunit.read                                      |
| Audit events   | action_preview_created                             |
| Domain         | ActionPreview (new)                                |
| Transition     | ReviewedWorkUnit → ActionPreview                   |

**Request:**

```ts
{
  actionType: "internal_task" | "slack_reply" | "gmail_reply" | "github_issue" | "calendar_event"
  targetLabel: string
  targetDestination: string
  bodySnippet: string
  detailFields: Record<string, string>
  // NOTE: resolvedTarget and resolvedPayload are server-generated, not client-provided
}
```

**Success (201):**

```ts
{
  ok: true
  requestId: string
  data: {
    preview: ActionPreview
    // preview.includes: targetPreview, payloadPreview, payloadHash, targetHash, requiresApproval
  }
}
```

**Safe errors:** `invalid_request`, `unauthorized`, `forbidden`, `external_actions_disabled` (if external action and kill switch off)

### 8.7 POST /api/workunit/:id/approval

| Attribute      | Value                                              |
| -------------- | -------------------------------------------------- |
| Purpose        | Request or check server-side approval              |
| Auth           | requireSession                                     |
| Permission     | workunit.approve_external_action                   |
| Audit events   | approval_requested / approval_granted / approval_rejected |
| Domain         | ActionApprovalRecord (new/updated)                 |
| Transition     | ActionPreview → ActionApprovalRecord               |

**Request (request approval):**

```ts
{
  actionPreviewId: string
  actionType: "slack_reply" | "gmail_reply" | "github_issue" | "calendar_event"
  // targetHash and payloadHash are server-computed from the ActionPreview.
  // The client does NOT send them — the server reads them from the stored preview.
  // Client-provided approvedByPm is IGNORED.
}
```

**Request (check approval status):**

```ts
{
  actionPreviewId: string
  // Returns current status of the approval record for this preview
}
```

**Success (200, approved):**

```ts
{
  ok: true
  requestId: string
  data: {
    approval: {
      id: string
      status: "pending" | "approved"
      approvedByUserId?: string
      approvedAt?: string
      expiresAt: string
    }
  }
}
```

**Success (200, pending):**

```ts
{
  ok: true
  requestId: string
  data: {
    approval: {
      id: string
      status: "pending"
      expiresAt: string
    }
  }
}
```

**Safe errors:** `invalid_request`, `unauthorized`, `forbidden`, `approval_required` (if requesting approval but user lacks permission), `external_actions_disabled`, `tenant_boundary_violation`

### 8.8 POST /api/workunit/:id/execute

| Attribute      | Value                                              |
| -------------- | -------------------------------------------------- |
| Purpose        | Execute an approved external action                |
| Auth           | requireSession                                     |
| Permission     | workunit.execute_external_action                   |
| Kill switch    | Required (`EXTERNAL_ACTIONS_ENABLED === "true"`)   |
| Idempotency    | Required (`x-idempotency-key` header)              |
| Audit events   | execution_command_created, external_action_executed / external_action_failed |
| Domain         | ExecutionCommand → ExecutionResult                 |
| Transition     | ActionApprovalRecord → ExecutionCommand → ExecutionResult |

**Request:**

```ts
{
  actionPreviewId: string
  approvalId: string
  // NO externalConfig — targets resolved server-side from tenant integration
  // NO approvedByPm — approval is checked server-side
}
```

**Headers:**
```
x-idempotency-key: <unique-key>
```

**Server checks (in order):**
1. Session valid? → else `unauthorized`
2. RBAC: `workunit.execute_external_action`? → else `forbidden`
3. Tenant boundary: workUnit.tenantId === session.tenantId? → else `tenant_boundary_violation`
4. Kill switch: `EXTERNAL_ACTIONS_ENABLED === "true"`? → else `external_actions_disabled`
5. Approval valid? status=approved, not expired, not used? → else `approval_required` / `approval_expired` / `approval_used`
6. Payload hash matches preview? → else `approval_payload_mismatch`
7. Target hash matches preview? → else `approval_target_mismatch`
8. Idempotency key not previously used? → else `conflict` (return existing result)
9. Integration config exists? → else `integration_missing`
10. Build ExecutionCommand, execute, record ExecutionResult

**Success (200):**

```ts
{
  ok: true
  requestId: string
  data: {
    execution: {
      commandId: string
      result: {
        status: "succeeded" | "failed" | "blocked" | "skipped"
        providerResultRef?: string
        safeMessage: string
        errorCode?: string
      }
    }
  }
}
```

**Safe errors:** `unauthorized`, `forbidden`, `tenant_boundary_violation`, `external_actions_disabled`, `approval_required`, `approval_expired`, `approval_used`, `approval_payload_mismatch`, `approval_target_mismatch`, `integration_missing`, `conflict`, `invalid_request`, `rate_limited`, `internal_error`

### 8.9 GET /api/workunit/:id/executions/:executionId

| Attribute      | Value                                              |
| -------------- | -------------------------------------------------- |
| Purpose        | Fetch the result of an execution                   |
| Auth           | requireSession                                     |
| Permission     | workunit.read                                      |
| Audit events   | None (read-only)                                   |

**Success (200):**

```ts
{
  ok: true
  requestId: string
  data: {
    execution: {
      commandId: string
      status: "succeeded" | "failed" | "blocked" | "skipped"
      provider?: string
      providerResultRef?: string
      safeMessage: string
      errorCode?: string
      executedAt: string
    }
  }
}
```

**Safe errors:** `unauthorized`, `forbidden`, `tenant_boundary_violation`, `invalid_request`

---

## 9. Action Field API

The Action Field is a client-side workspace. The API supports it through the endpoints above.

### 9.1 Loading Action Field State

The client loads the Action Field by fetching:

1. `GET /api/workunit/drafts/:id` — WorkUnitDraft (context, problem, tasks, missing fields)
2. `GET /api/workunit/:id/action-preview` — ActionPreview if one exists
3. `GET /api/workunit/:id/approval?previewId=...` — approval status if preview exists
4. `GET /api/workunit/:id/executions/:eid` — execution result if executed

These are composed client-side into the Action Field sections defined in `ACTION_FIELD_SPEC.md`.

### 9.2 Updating Workspace Text

Use `PATCH /api/workunit/drafts/:id`.

Workspace text updates:
- Never trigger external execution
- May invalidate an existing approval (if the payload preview is affected)
- Return `approvalInvalidated: true` when applicable

### 9.3 Generating Preview

Use `POST /api/workunit/:id/action-preview`.

Preview generation:
- Does NOT execute anything
- Returns `requiresApproval: true` for external actions
- Returns `requiresApproval: false` for `internal_task`

### 9.4 Invalidating Approval After Edit

When the user edits a draft that has an active approval:

1. Client calls `PATCH /api/workunit/drafts/:id`
2. Server compares new payload hash with stored approval's payload hash
3. If mismatch: approval status set to `expired`, response includes `approvalInvalidated: true`
4. Client shows "Approval invalidated — re-approval required"

### 9.5 Showing Execution Result

Use `GET /api/workunit/:id/executions/:executionId`.

The execution result:
- Shows status, safe message, provider ref
- Never exposes provider tokens or raw API responses
- Read-only; cannot be modified by client

---

## 10. Approval API Detail

### 10.1 Approval Request

```
POST /api/workunit/:id/approval
```

The server:

1. Resolves the ActionPreview by `actionPreviewId`
2. Computes `targetHash` and `payloadHash` from the stored preview
3. Creates `ActionApprovalRecord` with status `pending`
4. If the request is an explicit approval decision from an authorized human user, records `approved`
5. Otherwise: returns `pending` status

### 10.2 Hash Binding

| Field        | Source                          | When Computed     |
| ------------ | ------------------------------- | ----------------- |
| targetHash   | `ActionPreview.targetPreview`   | At preview creation |
| payloadHash  | `ActionPreview.payloadPreview`  | At preview creation |

The client never provides these hashes.
The server reads them from the stored ActionPreview.

### 10.3 Expiration

Approvals expire after a configurable TTL (default: 60 minutes).
Expired approvals return `approval_expired`.

### 10.4 One-Time Use

Approval status transitions: `pending → approved → used`.
Once `used`, any further execution attempt returns `approval_used`.

### 10.5 Mismatch Behavior

| Mismatch         | Response                         | Action                        |
| ---------------- | -------------------------------- | ----------------------------- |
| payloadHash diff | `approval_payload_mismatch`     | Client must regenerate preview|
| targetHash diff  | `approval_target_mismatch`      | Client must regenerate preview|

---

## 11. Execution API Detail

### 11.1 Idempotency

```
Header: x-idempotency-key: <unique-client-generated-key>
```

Rules:
- Key is scoped to `tenantId + workUnitId + actionType`
- Duplicate key with same payload returns existing execution result
- Duplicate key with different payload returns `conflict`

### 11.2 Execution Flow

```
Client                    Server
  |                          |
  |-- POST /execute -------->|
  |   x-idempotency-key      |
  |                          |-- 1. Validate session
  |                          |-- 2. Check RBAC
  |                          |-- 3. Check tenant boundary
  |                          |-- 4. Check kill switch
  |                          |-- 5. Resolve approval
  |                          |-- 6. Verify hashes
  |                          |-- 7. Check idempotency
  |                          |-- 8. Resolve integration config
  |                          |-- 9. Build ExecutionCommand
  |                          |-- 10. Call provider API
  |                          |-- 11. Record ExecutionResult
  |                          |-- 12. Write audit log
  |<-- 200 + result ---------|
```

### 11.3 Provider Resolution

The server resolves:

| Action Type      | Resolved From                                |
| ---------------- | -------------------------------------------- |
| `slack_reply`    | `TenantIntegration.config.slack.defaultChannel` |
| `gmail_reply`    | `TenantIntegration.config.gmail.defaultFrom` |
| `github_issue`   | `TenantIntegration.config.github.defaultOwner + defaultRepo` |
| `calendar_event` | `TenantIntegration.config.googleCalendar.defaultCalendarId` |

Client-provided targets in the request body are **ignored**.

---

## 12. Integration API Boundary

Integration management endpoints are deferred to `INTEGRATION_SPEC.md`.

Principles that must hold:

1. Integration config is tenant-owned
2. Provider tokens are never sent to the client
3. Client cannot choose trusted execution targets directly
4. Future integration endpoints must use RBAC (`integration.manage`) and audit logging

---

## 13. Audit Requirements

| Endpoint                          | Audit Events Emitted                                     |
| --------------------------------- | -------------------------------------------------------- |
| POST /signals/ingest              | tool_request_received, tool_request_validated, external_signal_received |
| POST /candidates                  | tool_request_received, source_candidate_created          |
| POST /drafts                      | tool_request_received, workunit_draft_created            |
| PATCH /drafts/:id                 | tool_request_received, (deferred: draft_edited)          |
| POST /drafts/:id/review           | tool_request_received, workunit_reviewed                 |
| POST /:id/action-preview          | tool_request_received, action_preview_created            |
| POST /:id/approval                | tool_request_received, approval_requested / approval_granted / approval_rejected |
| POST /:id/execute                 | tool_request_received, execution_command_created, external_action_executed / external_action_failed |
| Any RBAC denial                   | rbac_denied                                              |
| Any tenant boundary violation     | tenant_boundary_violation                                |
| Any external action blocked       | external_action_blocked                                  |

---

## 14. Idempotency and Conflict Handling

| Scenario                                  | Response     |
| ----------------------------------------- | ------------ |
| Duplicate idempotency key, same payload   | 200 + cached result |
| Duplicate idempotency key, different payload | 409 conflict |
| No idempotency key on execution endpoint  | 400 invalid_request |
| Execution already completed               | 200 + existing result (idempotent) |

---

## 15. Rate Limit and Abuse Control

Future requirements:

| Scope             | Default Limit        |
| ----------------- | -------------------- |
| Per user          | 100 req/min          |
| Per tenant        | 1000 req/min         |
| Per operation     | Varies: execute=10/min, drafts=60/min |
| AI-cost-sensitive | Separate tier (deferred) |
| External provider | Provider-specific limits |

Rate limit responses: `429 rate_limited` with `Retry-After` header.

---

## 16. Versioning

Current: internal API (no version prefix). Used by the local dev frontend.

Future:

```
/api/v1/workunit/...   ← first stable versioned API
```

Breaking changes require versioning. Additive changes (new fields, new endpoints) do not.

---

## 17. Testing Requirements

### Unit Tests (per endpoint)

- [ ] Request validation rejects malformed input → 400 invalid_request
- [ ] Missing auth → 401 unauthorized
- [ ] Insufficient permission → 403 forbidden
- [ ] Cross-tenant access → 403 tenant_boundary_violation
- [ ] External action with kill switch off → 403 external_actions_disabled
- [ ] Execute without approval → 403 approval_required
- [ ] Execute with expired approval → 403 approval_expired
- [ ] Execute with used approval → 403 approval_used
- [ ] Idempotency: duplicate key same payload → 200 (cached)
- [ ] Idempotency: duplicate key different payload → 409 conflict
- [ ] All responses use safe error codes (no internals leaked)

### Integration Tests

- [ ] Full lifecycle: ingest → candidate → draft → review → preview → approve → execute → result
- [ ] Edit after approval invalidates and requires re-approval
- [ ] External execution blocked by kill switch at every stage
- [ ] Audit events emitted at every lifecycle transition

---

## 18. Known Gaps

| Gap                                  | Current State                     | Target                                   |
| ------------------------------------ | --------------------------------- | ---------------------------------------- |
| Lifecycle endpoints                  | Not implemented                   | Split from `/api/workunit/tools`         |
| Auth                                 | Dev placeholder only              | Real session management                  |
| Tenant persistence                   | Dev placeholder only              | Real tenant isolation                    |
| Approval persistence                 | D1 schema/API foundation exists; execution-time store resolution not fully unified | Database-backed ActionApprovalRecord |
| Audit persistence                    | No-op console log                 | Database or SIEM                         |
| Idempotency persistence              | Not implemented                   | Database-backed key storage              |
| Integration config resolution        | Pass-through from env vars        | Tenant-owned integration settings store  |
| Rate limiting                        | Not implemented                   | Per-user + per-tenant middleware         |
| CSRF hardening                       | Not implemented                   | Token validation on mutating endpoints   |
| Safe error codes                     | All 14 codes defined in safeErrors.ts | Keep API routes using canonical statuses |
