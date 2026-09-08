# ERROR_MODEL.md

**Status: CANONICAL — CURRENT V0 IMPLEMENTATION CONTRACT ONLY.** Product authority: NONE.

# WorkUnit OS Error Model

## 1. Purpose

This document defines the canonical safe error system for WorkUnit OS.

Every error returned to the client must be:

* **Safe** — no stack traces, provider secrets, OAuth tokens, or raw source content
* **Stable** — error codes are part of the API contract; additions are safe, removals are breaking
* **Auditable** — every error maps to an audit event with safe metadata
* **User-actionable** — the client can map each code to a clear UI state
* **Compatible** — error codes defined here match `API_CONTRACT.md`, `ACTION_FIELD_SPEC.md`, and `safeErrors.ts`

The client must never see raw validation internals, `console.error` output, provider API responses, or internal diagnostic strings.

---

## 2. Error Design Principles

1. **Never expose stack traces.** All unhandled exceptions become `internal_error`.

2. **Never expose provider secrets.** `external_tool_not_configured:github` is an internal string — the client sees `integration_missing`.

3. **Never expose OAuth tokens.** Token errors are mapped to `integration_missing` or `internal_error`.

4. **Never expose raw source content.** Validation failures that reference user-provided text must use safe messages.

5. **Never expose full validation internals.** The client sees `invalid_request`, not `"field 'draft.title' exceeded max length 10000"`.

6. **Client receives a stable safe error code.** One string per error category.

7. **Internal logs/audit may store safe diagnostic metadata.** `requestId` links client-facing errors to internal logs.

8. **Frontend state is not authority.** An error response overrides any optimistic client state.

9. **Errors must not reveal tenant existence across boundaries.** `tenant_boundary_violation` must not disclose whether the requested resource exists in another tenant.

---

## 3. Common Error Response Envelope

### 3.1 Standard

```ts
type ApiFailure = {
  ok: false
  requestId: string
  error: SafeErrorCode
}
```

### 3.2 With Client Hint (future)

```ts
type SafeClientHint =
  | { kind: "retry_after"; seconds: number }
  | { kind: "approval_invalidated"; reason: "payload_changed" | "target_changed" }
  | { kind: "missing_fields"; fields: string[] }
  | { kind: "integration_required"; provider: string }

type ApiFailureWithClientHint = {
  ok: false
  requestId: string
  error: SafeErrorCode
  clientHint?: SafeClientHint
}
```

`clientHint` must **never** include:
* Stack traces or error objects
* Provider API response bodies
* OAuth tokens or API keys
* Raw source content
* Internal validation rule descriptions
* Database error messages
* File paths or server hostnames

---

## 4. HTTP Status Mapping

| SafeErrorCode                  | HTTP | Category              |
| ------------------------------ | ---- | --------------------- |
| `invalid_request`              | 400  | Client error          |
| `unauthorized`                 | 401  | Auth error            |
| `forbidden`                    | 403  | Permission error      |
| `tenant_boundary_violation`    | 403  | Permission error      |
| `external_actions_disabled`    | 403  | Policy block          |
| `approval_required`            | 403  | Policy block          |
| `approval_expired`             | 403  | Policy block          |
| `approval_used`                | 409  | Conflict              |
| `approval_payload_mismatch`    | 409  | Conflict              |
| `approval_target_mismatch`     | 409  | Conflict              |
| `integration_missing`          | 503  | Service unavailable   |
| `conflict`                     | 409  | Conflict              |
| `rate_limited`                 | 429  | Rate limit            |
| `internal_error`               | 500  | Server error          |

---

## 5. Safe Error Code Catalog

### 5.1 `invalid_request`

| Attribute        | Value                                    |
| ---------------- | ---------------------------------------- |
| Meaning          | Request body is malformed, missing required fields, or fails validation |
| HTTP status      | 400                                      |
| When returned    | JSON parse failure, runtime validation failure, missing fields, oversized payload |
| User message     | "The request could not be processed. Check your input and try again." |
| Retry            | Correct request and retry                |
| Audit event      | `tool_request_rejected`                  |
| Client recover   | Yes — user can fix and resubmit          |
| Domain stage     | Any (validation is the first gate)       |

#### 5.1.1 Non-400 statuses carried by `invalid_request`

`invalid_request` is the code for several request-integrity rejections that do
**not** return 400. Status and code are deliberately decoupled — established
precedent, since every mutation route already returns 413 `invalid_request` for
an oversized payload. **No new safe error code is introduced**; the wire
vocabulary remains 17 members.

| Status | When returned | Source |
| ------ | ------------- | ------ |
| **400** | JSON parse failure, validation failure, missing fields, **unsupported or missing `Content-Type`** | route / `readBoundedJsonObject` / mutation guard step 6 |
| **405** | **Unsupported HTTP method on a mutation route** | mutation guard step 1, on direct handler invocation — see below |
| **413** | Oversized payload — declared `Content-Length` above the route limit, or a chunked body exceeding the streaming cap | mutation guard step 5 / `readBoundedJsonObject` |

**Content-Type (400).** Only `application/json`, optionally with
`charset=utf-8`, is accepted on a mutation route; `text/plain` is rejected
specifically because it is a CORS-simple type a cross-origin caller can send
with no preflight.

**Method (405).** Two distinct paths produce a 405 and must not be conflated: an
**actual** unsupported HTTP request to a module exporting only `POST` is rejected
by the framework dispatcher **before** the handler runs, and that response is
**not** this envelope; **direct invocation** with a non-POST `Request` reaches
the guard's method check and returns 405 `invalid_request` in the standard
envelope.

See `docs/architecture/HTTP_MUTATION_GUARD.md`.

### 5.2 `unauthorized`

| Attribute        | Value                                    |
| ----------------- | ---------------------------------------- |
| Meaning           | No valid session or authentication token |
| HTTP status       | 401                                      |
| When returned     | Missing/expired/invalid session token    |
| User message      | "Please log in to continue."             |
| Retry             | Log in, then retry                       |
| Audit event       | TODO: `auth_required`                    |
| Client recover    | Yes — redirect to login                  |
| Domain stage      | Any (auth is checked before all else)    |

### 5.3 `forbidden`

| Attribute        | Value                                    |
| ----------------- | ---------------------------------------- |
| Meaning           | Authenticated user lacks required permission |
| HTTP status       | 403                                      |
| When returned     | RBAC check fails (e.g. viewer tries to approve) |
| User message      | "You don't have permission to perform this action." |
| Retry             | No — requires role change                |
| Audit event       | `rbac_denied`                            |
| Client recover    | No — show permission-required UI state   |
| Domain stage      | Any (RBAC checked per endpoint)          |

### 5.4 `tenant_boundary_violation`

| Attribute        | Value                                    |
| ----------------- | ---------------------------------------- |
| Meaning           | Attempt to access a resource belonging to a different tenant |
| HTTP status       | 403                                      |
| When returned     | `assertTenantBoundary` fails             |
| User message      | "Access denied." (must NOT reveal whether resource exists) |
| Retry             | No                                       |
| Audit event       | `tenant_boundary_violation`              |
| Client recover    | No — show generic access-denied state    |
| Domain stage      | Any access to tenant-scoped resources    |

### 5.5 `external_actions_disabled`

| Attribute        | Value                                    |
| ----------------- | ---------------------------------------- |
| Meaning           | External action kill switch is off; all external execution blocked |
| HTTP status       | 403                                      |
| When returned     | `EXTERNAL_ACTIONS_ENABLED !== "true"` and operation is external |
| User message      | "External actions are currently disabled." |
| Retry             | No — system policy                       |
| Audit event       | `external_action_blocked`                |
| Client recover    | No — show policy-disabled status         |
| Domain stage      | ActionPreview, Approval, Execute         |

### 5.6 `approval_required`

| Attribute        | Value                                    |
| ----------------- | ---------------------------------------- |
| Meaning           | External action requires server-side approval before execution |
| HTTP status       | 403                                      |
| When returned     | `verifyServerSideApproval` returns `approval_required` |
| User message      | "This action requires approval before it can be executed." |
| Retry             | Request approval, then retry execution   |
| Audit event       | `external_action_approval_required`      |
| Client recover    | Yes — show approval request UI           |
| Domain stage      | Execute                                  |

### 5.7 `approval_expired`

| Attribute        | Value                                    |
| ----------------- | ---------------------------------------- |
| Meaning           | Approval record has passed its expiration time |
| HTTP status       | 403                                      |
| When returned     | Approval `expiresAt < now`               |
| User message      | "The approval for this action has expired. Please request a new approval." |
| Retry             | Request new approval, then retry         |
| Audit event       | `approval_expired` (TODO)                |
| Client recover    | Yes — re-request approval                |
| Domain stage      | Execute                                  |

### 5.8 `approval_used`

| Attribute        | Value                                    |
| ----------------- | ---------------------------------------- |
| Meaning           | Approval was already consumed by a prior execution |
| HTTP status       | 409                                      |
| When returned     | Approval status is `used`                |
| User message      | "This approval has already been used."   |
| Retry             | No — create new preview and approval     |
| Audit event       | `approval_used` (TODO)                   |
| Client recover    | No — requires new approval cycle         |
| Domain stage      | Execute                                  |

### 5.9 `approval_payload_mismatch`

| Attribute        | Value                                    |
| ----------------- | ---------------------------------------- |
| Meaning           | The action preview payload was edited after approval was granted |
| HTTP status       | 409                                      |
| When returned     | `payloadHash` in approval ≠ `payloadHash` in current preview |
| User message      | "The action content has changed since approval. Please review and re-approve." |
| Retry             | Review changes, request new approval     |
| Audit event       | `approval_payload_mismatch` (TODO)       |
| Client recover    | Yes — show what changed, request re-approval |
| Domain stage      | Execute                                  |

### 5.10 `approval_target_mismatch`

| Attribute        | Value                                    |
| ----------------- | ---------------------------------------- |
| Meaning           | The action target was changed after approval was granted |
| HTTP status       | 409                                      |
| When returned     | `targetHash` in approval ≠ `targetHash` in current preview |
| User message      | "The action target has changed since approval. Please review and re-approve." |
| Retry             | Review target, request new approval      |
| Audit event       | `approval_target_mismatch` (TODO)        |
| Client recover    | Yes — show what changed, request re-approval |
| Domain stage      | Execute                                  |

### 5.11 `integration_missing`

| Attribute        | Value                                    |
| ----------------- | ---------------------------------------- |
| Meaning           | Required provider integration is not configured for this tenant |
| HTTP status       | 503                                      |
| When returned     | `TenantIntegration` not found or status ≠ `active` |
| User message      | "The required integration is not configured. Please contact your admin." |
| Retry             | No — requires admin setup                |
| Audit event       | `integration_missing` (TODO)             |
| Client recover    | No — show integration setup required     |
| Domain stage      | ActionPreview, Execute                   |

### 5.12 `conflict`

| Attribute        | Value                                    |
| ----------------- | ---------------------------------------- |
| Meaning           | Idempotency key reused with different payload, or resource state conflict |
| HTTP status       | 409                                      |
| When returned     | Duplicate idempotency key with mismatched payload |
| User message      | "A conflicting request was detected. Please try again." |
| Retry             | Yes — with new idempotency key           |
| Audit event       | `conflict` (TODO)                        |
| Client recover    | Yes — regenerate key and retry           |
| Domain stage      | Execute (idempotency check)              |

### 5.13 `rate_limited`

| Attribute        | Value                                    |
| ----------------- | ---------------------------------------- |
| Meaning           | Too many requests from this user or tenant |
| HTTP status       | 429                                      |
| When returned     | Rate limit exceeded                      |
| User message      | "Too many requests. Please wait and try again." |
| Retry             | Yes — after `Retry-After` seconds        |
| Audit event       | `rate_limited` (TODO)                    |
| Client recover    | Yes — auto-retry after delay             |
| Domain stage      | Any                                      |

### 5.14 `internal_error`

| Attribute        | Value                                    |
| ----------------- | ---------------------------------------- |
| Meaning           | Unexpected server-side failure           |
| HTTP status       | 500                                      |
| When returned     | Unhandled exception, provider failure, internal logic error |
| User message      | "Something went wrong. Please try again or contact support." |
| Retry             | Maybe — if transient                     |
| Audit event       | `internal_error` (TODO)                  |
| Client recover    | No — show generic error, include requestId for support |
| Domain stage      | Any                                      |

---

## 6. Client Recovery Strategy

| Category              | Client Behavior                                        |
| --------------------- | ------------------------------------------------------ |
| Client error (400)    | Show editable form with highlighted issue              |
| Auth error (401)      | Redirect to login; preserve return URL                 |
| Permission error (403)| Show "not authorized" state; disable action button     |
| Policy block (403)    | Show policy status badge; no retry                     |
| Conflict (409)        | Show what changed; offer re-approval or regenerate     |
| Rate limit (429)      | Show countdown timer; auto-retry                       |
| Service down (503)    | Show "integration unavailable" badge; retry button     |
| Server error (500)    | Show generic error; include requestId; contact support |

### Action Field UI Mapping

| Error Code                    | Action Field UI State                               |
| ----------------------------- | --------------------------------------------------- |
| `invalid_request`             | Highlight invalid fields with correction hints      |
| `unauthorized`                | Redirect to login                                   |
| `forbidden`                   | Disable approve/execute buttons; show role badge    |
| `tenant_boundary_violation`   | Show generic error (no detail)                      |
| `external_actions_disabled`   | Show "External Actions Disabled" banner             |
| `approval_required`           | Show approval request panel                         |
| `approval_expired`            | Show "Approval expired — re-request" button         |
| `approval_used`               | Show "Already executed" with execution result link  |
| `approval_payload_mismatch`   | Show "Content changed since approval" warning       |
| `approval_target_mismatch`    | Show "Target changed since approval" warning        |
| `integration_missing`         | Show "Integration not configured" with admin link   |
| `rate_limited`                | Show countdown + disable buttons temporarily        |
| `conflict`                    | Show "Conflict detected — retry" button             |
| `internal_error`              | Show generic error with requestId for support       |

---

## 7. Audit Requirements

| Error Code                    | Audit Event (current)              | Notes                               |
| ----------------------------- | ---------------------------------- | ----------------------------------- |
| `invalid_request`             | `tool_request_rejected`           | Already in `auditLog.ts`            |
| `unauthorized`                | `auth_required`                   | Already in `auditLog.ts`            |
| `forbidden`                   | `rbac_denied`                     | Already in `auditLog.ts`            |
| `tenant_boundary_violation`   | `tenant_boundary_violation`       | Already in `auditLog.ts`            |
| `external_actions_disabled`   | `external_action_blocked`         | Already in `auditLog.ts`            |
| `approval_required`           | `external_action_approval_required`| Already in `auditLog.ts`            |
| `approval_expired`            | `approval_expired`                | Already in `auditLog.ts`            |
| `approval_used`               | `approval_used`                   | Already in `auditLog.ts`            |
| `approval_payload_mismatch`   | `approval_payload_mismatch`       | Already in `auditLog.ts`            |
| `approval_target_mismatch`    | `approval_target_mismatch`        | Already in `auditLog.ts`            |
| `integration_missing`         | `integration_missing`             | Already in `auditLog.ts`            |
| `conflict`                    | `conflict`                        | Already in `auditLog.ts`            |
| `rate_limited`                | `rate_limited`                    | Already in `auditLog.ts`            |
| `internal_error`              | `internal_error`                  | Already in `auditLog.ts`            |

---

## 8. Error Boundaries by Domain Lifecycle

Each lifecycle stage has specific errors relevant to it.

### ExternalSignal Ingestion

| Error                    | When                                          |
| ------------------------ | --------------------------------------------- |
| `invalid_request`        | Payload missing `sourceType`, `sourceRef`     |
| `unauthorized`           | No valid session                              |
| `rate_limited`           | Too many ingest requests                      |

### SourceCandidate Creation

| Error                    | When                                          |
| ------------------------ | --------------------------------------------- |
| `invalid_request`        | Missing `sourceSignalIds`, `extractedSummary` |
| `unauthorized`           | No valid session                              |
| `forbidden`              | User lacks `workunit.create`                  |
| `tenant_boundary_violation` | Source signal belongs to another tenant    |

### WorkUnitDraft Creation / Editing

| Error                    | When                                          |
| ------------------------ | --------------------------------------------- |
| `invalid_request`        | Missing required fields                       |
| `unauthorized`           | No valid session                              |
| `forbidden`              | User lacks `workunit.create` or `workunit.edit` |
| `tenant_boundary_violation` | Draft belongs to another tenant            |

### WorkUnitDraft Review

| Error                    | When                                          |
| ------------------------ | --------------------------------------------- |
| `invalid_request`        | Draft ID missing or invalid                   |
| `unauthorized`           | No valid session                              |
| `forbidden`              | User lacks `workunit.review`                  |
| `tenant_boundary_violation` | Draft belongs to another tenant            |

### ActionPreview Generation

| Error                    | When                                          |
| ------------------------ | --------------------------------------------- |
| `invalid_request`        | Missing `actionType` or invalid type          |
| `unauthorized`           | No valid session                              |
| `forbidden`              | User lacks `workunit.read`                    |
| `external_actions_disabled` | External action requested with kill switch off |

### Approval Creation / Verification

| Error                    | When                                          |
| ------------------------ | --------------------------------------------- |
| `invalid_request`        | Missing `actionPreviewId`                     |
| `unauthorized`           | No valid session                              |
| `forbidden`              | User lacks `workunit.approve_external_action` |
| `external_actions_disabled` | Approval requested with kill switch off     |

### ExecutionCommand Creation

| Error                       | When                                       |
| --------------------------- | ------------------------------------------ |
| `invalid_request`           | Missing `approvalId`                       |
| `unauthorized`              | No valid session                           |
| `forbidden`                 | User lacks `workunit.execute_external_action` |
| `tenant_boundary_violation` | WorkUnit belongs to another tenant         |
| `external_actions_disabled` | Kill switch is off                         |
| `approval_required`         | Approval not yet granted                   |
| `approval_expired`          | Approval has expired                       |
| `approval_used`             | Approval already consumed                  |
| `approval_payload_mismatch` | Payload changed after approval             |
| `approval_target_mismatch`  | Target changed after approval              |
| `integration_missing`       | Provider integration not configured        |
| `conflict`                  | Idempotency key reused with different payload |
| `rate_limited`              | Too many execution requests                |

### ExecutionResult Recording

| Error                    | When                                          |
| ------------------------ | --------------------------------------------- |
| `internal_error`         | Provider API call failed unexpectedly         |

---

## 9. Action Field Error Behavior

The Action Field (`ACTION_FIELD_SPEC.md` Section 11) must handle errors as follows:

| Error                        | Action Field Behavior                                         |
| ---------------------------- | ------------------------------------------------------------- |
| `invalid_request`            | Highlight the specific field that needs correction           |
| `approval_required`          | Show the approval request panel with "Request Approval" button |
| `external_actions_disabled`  | Show persistent "External actions disabled" banner in footer  |
| `approval_payload_mismatch`  | Show "Content was edited after approval" with diff highlight  |
| `approval_target_mismatch`   | Show "Target was changed after approval" with diff highlight  |
| `approval_expired`           | Show "Approval expired at [time]" with "Re-request" button    |
| `approval_used`              | Show "This action was already executed" with result link      |
| `integration_missing`        | Show "Integration required" placeholder with admin contact    |
| `forbidden`                  | Disable approve/execute buttons; show role/permission badge   |
| `conflict`                   | Show "A conflicting request was detected" with retry button   |
| `internal_error`             | Show generic error state with requestId; offer retry          |

The Action Field must **never** display:
* The raw server error message
* The provider's API response
* Internal hash values or validation rule descriptions
* A "success" state for a failed execution

---

## 10. Approval-Specific Errors

These five errors govern the approval lifecycle:

```
                    ┌──────────────────┐
                    │  approval_required │ ← default; no server-side approval record
                    └────────┬─────────┘
                             │ user requests approval
                    ┌────────▼─────────┐
                    │    approved       │
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
     ┌────────▼─────┐ ┌──────▼──────┐ ┌─────▼──────────┐
     │ approval_    │ │ approval_  │ │ approval_      │
     │ expired      │ │ used       │ │ payload_/      │
     │              │ │            │ │ target_mismatch│
     └──────────────┘ └────────────┘ └────────────────┘
```

### Key Rules

1. Editing the payload after approval → `approval_payload_mismatch` on next execute
2. Editing the target after approval → `approval_target_mismatch` on next execute
3. Approval expires after TTL → `approval_expired` on execute
4. Approval already consumed → `approval_used` on execute
5. No approval exists → `approval_required` on execute

The client can recover from expired and mismatch errors by requesting a new approval.
The client cannot recover from `used` — it must create a new preview and approval cycle.

---

## 11. Integration-Specific Errors

Provider errors are mapped to safe codes:

| Internal Error                          | Safe Client Code        |
| --------------------------------------- | ----------------------- |
| `external_tool_not_configured:github`   | `integration_missing`   |
| `external_config_missing:github`        | `integration_missing`   |
| Provider returns 401 (token revoked)    | `integration_missing`   |
| Provider returns 403 (insufficient scope)| `integration_missing`  |
| Provider returns 429 (provider rate limit)| `rate_limited`        |
| Provider returns 5xx (provider down)    | `internal_error`        |
| Network timeout                         | `internal_error`        |

Future provider error codes (not yet in safe error catalog):
* `provider_token_revoked` — mapped to `integration_missing`
* `provider_scope_insufficient` — mapped to `integration_missing`
* `provider_rate_limited` — mapped to `rate_limited`
* `provider_unavailable` — mapped to `internal_error`

Do **not** expose raw provider error codes in the API response.
Always map to one of the 14 safe error codes.

---

## 12. Internal Error Handling

`internal_error` is the generic client-facing code for unexpected failures.

### What goes to the client

```json
{
  "ok": false,
  "requestId": "req_abc123",
  "error": "internal_error"
}
```

### What goes to internal logs (NOT to client)

* Error message and stack trace
* Provider API response status and safe portion of body
* Operation that was attempted
* Tenant ID and user ID (safe — not secrets)
* Timestamp

### What must NEVER appear anywhere

* OAuth tokens or API keys in logs
* Raw Slack/Gmail/document body text in logs
* Full provider API response bodies (may contain secrets)
* Customer PII in error messages

---

## 13. Testing Requirements

### Unit Tests

- [ ] All 14 safe error codes exist in `SAFE_ERROR_CODES`
- [ ] Each code maps to the correct HTTP status
- [ ] `safeError()` returns correct `{ error, status }` for every code
- [ ] `invalid_request` responses do not leak validation rule details
- [ ] `internal_error` responses do not leak stack traces
- [ ] `tenant_boundary_violation` does not reveal resource existence
- [ ] Approval mismatch codes map to 409
- [ ] `external_actions_disabled` maps to 403
- [ ] `safeErrors.ts` codes match `ERROR_MODEL.md` catalog

### Integration Tests

- [ ] Full lifecycle error: execute without approval → `approval_required`
- [ ] Edit after approval → `approval_payload_mismatch`
- [ ] Expired approval → `approval_expired`
- [ ] Used approval → `approval_used`
- [ ] Cross-tenant access → `tenant_boundary_violation`
- [ ] Kill switch off → `external_actions_disabled`
- [ ] Missing integration → `integration_missing`
- [ ] Duplicate idempotency key → `conflict`

---

## 14. Current Implementation Gaps

| Gap                                        | Current State                              | Action Required                              |
| ------------------------------------------ | ------------------------------------------ | -------------------------------------------- |
| `approval_payload_mismatch` in safeErrors  | Present in `SAFE_ERROR_CODES` (409)        | Keep route responses canonical               |
| `approval_target_mismatch` in safeErrors   | Present in `SAFE_ERROR_CODES` (409)        | Keep route responses canonical               |
| `conflict` in safeErrors                   | Present in `SAFE_ERROR_CODES` (409)        | Keep route responses canonical               |
| Route error envelope                       | Uses `safeError()` in current routes       | Continue avoiding raw internals              |
| toolBackend `fail()` uses internal strings | Mapped through `toSafeErrorCode()` at route boundary | Keep provider details out of responses |
| Audit events for error codes               | Audit vocabulary includes dedicated or mapped events | Normalize route event names and persist later |
| Action Field error-to-UI mapping           | Implemented in `app/lib/actionField/errorState.ts` | Wire mapping into visible UI paths       |
| `clientHint` extension                     | Not implemented                            | Future: add after core codes are stable     |

---

## 15. Implementation Checklist

- [x] Add `approval_payload_mismatch` to `SAFE_ERROR_CODES` (409)
- [x] Add `approval_target_mismatch` to `SAFE_ERROR_CODES` (409)
- [x] Add `conflict` to `SAFE_ERROR_CODES` (409)
- [x] Add missing audit event kinds to `AuditEventKind`
- [x] Replace route responses with `safeError()` envelope
- [x] Map internal error strings at the route boundary with `toSafeErrorCode()`
- [x] Wire `verifyApproval` reasons to safe error codes
- [ ] Add tests for all 14 code/status mappings
- [ ] Add integration tests for approval mismatch flows
- [ ] Add integration tests for idempotency conflict
- [ ] Ensure `tenant_boundary_violation` returns generic message (no resource existence leak)
