# Security Model

**Status: CANONICAL — CURRENT PRODUCT-INDEPENDENT SECURITY INVARIANTS.** Product authority: NONE.

## Trust Architecture

WorkUnit OS has a strict trust boundary model. Nothing from the client,
external sources, or AI output is trusted by default.

### Trust Levels

```
Untrusted Source → Sanitized Candidate → WorkUnit Draft → Server Approval → Separate Runtime Authorization Gate
```

Each level carries a different trust:

| Level | Trust | Source |
|-------|-------|--------|
| Untrusted Source | Zero | Slack, Gmail, GitHub, Calendar, Notion, Drive |
| Sanitized Candidate | Low | Extracted metadata only — no raw body |
| WorkUnit Draft | Medium | AI/system-generated, human-reviewable |
| Server Approval | High | Server-side record, not client flag |
| Runtime authorization | Controlled | Server-generated, exact-bound, non-executing receipt |

Approval is necessary but never sufficient for execution. This security model owns that current technical invariant.

### What Is Never Trusted

1. **Client-provided `approvedByPm`** — stripped before reaching backend
2. **Client-provided `externalConfig`** — stripped; targets resolve server-side
3. **Raw source content** — Slack body, Gmail body, Notion page body, Drive file content
4. **AI output** — always treated as draft until human review
5. **Frontend state** — any React state can be tampered with

## Architecture boundary notes

- Client code does not own `tenantId`, `actorUserId`, approval hashes, approval status, or tokens.
- Preview / Approval requests are assembled in `app/lib/application/actionField/dashboardPreviewClient.ts`.
- The current right-side workspace must not expose raw provider payloads or execution-looking controls.
- Current UI data reads happen through `app/lib/application/dashboard/dashboardDataClient.ts` and `adoptedDashboardViewModel.ts`; UI components still do not import repositories, route internals, or raw external clients.
- Preview groups are derived from selected real WorkUnits via `app/lib/application/dashboard/selectedWorkUnitPreviewModel.ts`; the mapper never includes client-owned hashes, status, tenant, role, or tokens.
- Server errors from preview creation are mapped to safe user-facing messages (`mapSafePreviewError`) in the current UI component; raw server error JSON is never displayed.
- The static `getPrimaryActionPreviewGroup()` in `workUnitDashboardModel.ts` is legacy/demo only and is not used as authority for safe preview creation.
- `targetHash` and `payloadHash` are **never returned to the browser** in normal API responses from `POST /action-preview` or `POST /approval`. They are stored server-side and used only for approval/execution verification.
- Approval status is queried through `GET /api/workunit/:id/approval/status` which returns a safe summary (none/pending/approved/rejected/expired/used) without exposing hashes, tenantId, or raw approval internals.
- Approval status UI is API-backed through `approvalDecisionTraceModel.ts`. Server approval status overrides local preview-created assumptions once loaded. No raw server errors, hashes, tenantId, or approval internals are exposed in UI trace text.
- Approval completion is derived from `isApprovalCompleted()` which checks server status (`approved` + not consumed + not expired), not a local boolean.
- Explicit human approval/rejection uses the existing `approveDashboardActionPreviews` helper, sending only `actionPreviewId` and `decision`. No hashes, tenantId, role, or status are client-owned. After approve/reject, UI refreshes server approval status.
- Execution readiness is a model-level value via `executionReadinessModel.ts`, but the UI must not expose execution-looking controls in WorkUnit Launcher, WorkUnit Graph, Command Palette, Tool Pin, or editable Action Field text. No real execution is triggered; no `/api/workunit/tools` calls from UI for real external execution.
- A safe Execution Command envelope may be built via `executionCommandModel.ts` for internal transparency only. Approval ID is NOT rendered. No hashes, tenant/user/role, tokens, secrets, or raw payloads are exposed. The envelope is read-only metadata and does not trigger execution.
- Approval actions use the existing `dashboardPreviewClient.ts` helper and the existing `POST /approval` endpoint; no client-owned fields are sent.
- Legacy standalone Action Field modules remain for compatibility but are not future product authority.

## Session and Authentication

### Production

In production (`NODE_ENV === "production"`), `requireSession()` returns `unauthorized`.
No anonymous or dev session is allowed. Real authentication must be implemented
before deploying to production.

This phase adds the auth/workspace foundation schema plus a provider-agnostic auth adapter boundary. It now includes signed JWT identity verification, but it does not add OAuth, OIDC, cookie session storage, or provider token storage.

### Development

In development, `requireSession()` requires explicit opt-in:

```bash
AUTH_ADAPTER="dev"
ALLOW_DEV_SESSION="true"  # Required for local development
```

Without this env var, dev also returns `unauthorized`.

To test RBAC enforcement locally, set the dev session role:

```bash
DEV_SESSION_ROLE="viewer"  # Default: owner
```

To allow deterministic dev user / tenant / membership bootstrap:

```bash
ALLOW_DEV_WORKSPACE_BOOTSTRAP="true"
```

### Session Resolution

`requireSession()` is the single integration point for authentication.
Current flow:
1. Resolve `AuthAdapter`
2. Verify request into `VerifiedAuthIdentity`
3. Resolve control DB user + active membership
4. Build typed `SessionContext`

Current adapters:
- `dev` adapter — explicit and non-production only
- `jwt` adapter — verifies HS256 Bearer tokens into `VerifiedAuthIdentity`
- `none` / noop adapter — always safe-fails

Future adapters:
- `cookie`
- `oidc`

JWT adapter notes:
- Required env: `AUTH_ADAPTER=jwt` and `JWT_AUTH_SECRET`
- Optional checks: `JWT_AUTH_ISSUER`, `JWT_AUTH_AUDIENCE`
- Ignored claims: `tenantId`, `role`
- `tenantId` and `role` still come only from control DB active membership
- Tokens are verified but never stored or logged

Current dev session:
- userId: `dev-user`
- tenantId: `dev-tenant`
- role: configurable via `DEV_SESSION_ROLE` (default: `owner`)
- email: `dev@example.local`
- isDevSession: `true`

## RBAC Enforcement

Every mutating operation on `/api/workunit/tools` is checked against RBAC.

### Operation → Permission Mapping

| Operation      | Required Permission                    |
| -------------- | -------------------------------------- |
| ingest         | `workunit.create`                      |
| draft          | `workunit.create`                      |
| create_task    | `workunit.create`                      |
| reply          | `workunit.execute_external_action`     |
| schedule       | `workunit.execute_external_action`     |
| create_issue   | `workunit.execute_external_action`     |

### Enforcement Order

The route enforces in this order:
1. Resolve requestId
2. Write audit: `tool_request_received`
3. Require session → `401 unauthorized` if missing
4. Parse JSON as unknown
5. Validate request body → `400 invalid_request`
6. Write audit: validation result
7. Map operation to required permission
8. Assert permission → `403 forbidden` if denied
9. Write audit: `rbac_denied` if denied
10. Check kill switch for external ops → `403 external_actions_disabled`
11. Execute via `runToolBackendRequest`
12. Map backend errors to safe codes
13. Write audit: result
14. Return safe response

## External Action Kill Switch

All external actions (reply, schedule, create_issue) are blocked by default.

```bash
EXTERNAL_ACTIONS_ENABLED="true"  # Required for any external execution
```

Without this env var set to exactly `"true"`, the system returns `403 external_actions_disabled`.

The kill switch is checked in **two places** (double guard):
1. `app/api/workunit/tools/route.ts` — API boundary
2. `app/lib/toolBackend.ts` — backend function (safe even if called from elsewhere)

## Server-Side Approval

External actions require server-side approval. The approval model:

- Each external action creates an `ActionApprovalRecord`
- Record is stored server-side by the Action Preview / Approval API path
- Record includes: tenant ID, work unit ID, action type, target hash, payload hash
- Status transitions: `pending → approved → used` or `pending → rejected`
- Records expire (configurable TTL, default 60 minutes)
- Client `approvedByPm` flag is ignored — only server-side records authorize execution

Current state: D1 schema exists for `action_previews` and `approval_records`, and the approval API creates records by copying hashes from the persisted preview. Execution-time verification for `/api/workunit/tools` resolves the stored `ActionPreview`, wraps the tenant-scoped `approvalRecords` repository with the canonical `ApprovalStore` adapter, verifies the caller-provided approval ID against persisted hashes, and marks the approval `used` after a successful verification path. Production must not silently fall back to an in-memory approval store; if persistence or preview context is unavailable, execution verification fails closed.

## RBAC

Role-based access control with four canonical roles:

| Role | Permissions |
|------|------------|
| owner | All permissions including tenant management |
| manager | Read, create, edit, preview, approve, manage integrations, read audit |
| editor | Read, create, edit, preview, approve, integration status |
| viewer | Read inbox and integration status only |

Legacy dev/test role inputs (`admin`, `pm`, `member`) are normalized to canonical roles so older fixtures do not silently bypass the new policy model.

Permission checks are centralized in `app/lib/security/rbac.ts`. No ad-hoc role checks elsewhere.

## Tenant Isolation

Multi-tenant isolation via branded types (`TenantId`, `UserId`, `WorkUnitId`):

- Every resource is owned by a tenant
- `assertTenantBoundary()` enforces cross-tenant access prevention
- Development mode uses `"dev-tenant"` — explicitly marked unsafe for production
- Persistence repositories and route handlers scope reads and writes by resolved session tenant ID
- No client-provided `tenantId` is trusted on inbox, feedback, integration status, preview, or approval routes
- No client-provided `actorUserId` or `role` is trusted on mutating routes

## Validation

All API input is validated at runtime:

- `app/lib/toolBackendValidation.ts` — validates tool backend requests
- Treats `request.json()` as `unknown`, not `ToolBackendRequest`
- Validates: id, source, operation, operation/source combo, draft shape, event presence
- Enforces string length (10K) and array length (500) limits
- Strips `approvedByPm` and `externalConfig` before backend dispatch
- Returns `400 invalid_request` with no internal detail

## Error Handling

Only safe error codes are returned to clients:

- `400 invalid_request` — malformed payload
- `403 external_actions_disabled` — kill switch active
- `403 forbidden` — RBAC denied
- `500 internal_error` — unexpected server error

No stack traces, environment values, tokens, or implementation details are leaked.

## Audit Logging

Audit event vocabulary is defined in `app/lib/security/auditLog.ts`:

- `tool_request_received`, `tool_request_validated`, `tool_request_rejected`
- `external_action_blocked`, `external_action_approved`, `external_action_executed`, `external_action_failed`
- `tenant_boundary_violation`, `rbac_denied`

Current implementation has both:

- no-op / verbose local logger support for low-risk debugging
- repository-backed audit persistence for feedback and selected route events when repositories are available

Current persisted route coverage:

- `POST /api/workunit/:id/feedback`
- `GET /api/workunit/inbox` with summarized metadata only: `{ source, count }`
- `GET /api/audit/recent` for tenant-scoped UI read visibility

Audit metadata must stay sanitized. Raw WorkUnits, raw provider payloads, tokens, and secrets are not written to audit rows.
UI audit reads additionally remove metadata keys such as `token`, `accessToken`, `refreshToken`, `secret`, `authorization`, `cookie`, `rawPayload`, `rawBody`, and `password`.

## UI Operations Visibility

- `GET /api/integrations/status` requires `canViewIntegrationStatus(session)`
- `GET /api/audit/recent` requires `canViewAudit(session)`
- Both routes derive tenant scope from `SessionContext`
- Neither route exposes provider tokens, secrets, cookies, raw request bodies, or raw provider payloads
- WorkUnit rows come from `/api/workunit/inbox`; empty/loading/error states must be labeled honestly and must not show sample WorkUnits as live work
- Preview, approval, integration, and audit states must reflect actual API/local state or remain empty/unavailable; static sample operational events must not be presented as real

## Control DB auth/workspace foundation

Control DB now includes:

- `users`
- `tenants`
- `tenant_memberships`
- `auth_identities`
- `tenant_databases`

These tables provide the production auth/workspace foundation. A signed JWT can now authenticate identity into this control DB boundary, but cookie-based auth, OIDC callback handling, and provider token storage are still deferred.

No provider integration tokens are stored in this layer.

## Persistence Safety

Current repository-backed persistence rules:

- `GET /api/workunit/inbox` may persist sanitized generated WorkUnits through tenant-scoped `upsert()`
- repeated fetches do not create duplicate WorkUnit rows for the same stable ID
- `POST /api/workunit/:id/feedback` persists only safe feedback values and status updates
- `GET /api/integrations/status` reads persisted connection metadata but does not expose tokens or secret material
- usage events record only safe metadata such as source name, feedback value, and provider count

Development fallback may skip persistence when repositories are unavailable. Production-safe behavior must not silently succeed without required persistence.

## Production Blockers

Before production SaaS:

- [ ] Real cookie or OIDC authentication adapter
- [ ] Tenant isolation enforcement (not just types)
- [ ] RBAC enforcement wired to every endpoint
- [ ] Server-side approval persistence fully unified with execution-time `ApprovalStore`
- [ ] Per-tenant OAuth token vault (encrypted at rest)
- [ ] Rate limiting
- [ ] CSRF / session hardening
- [ ] Audit log storage (database or SIEM)
- [x] External action review UI foundation
- [ ] Prompt injection red-team testing
- [ ] Penetration testing

## What Is Safe Today

- Ingest and draft operations work without external execution risk
- External actions cannot run without `EXTERNAL_ACTIONS_ENABLED="true"`
- Client cannot authorize execution via `approvedByPm`
- Client cannot choose arbitrary execution targets via `externalConfig`
- API input is runtime-validated, not just TypeScript-cast
- Error responses don't leak internals
- Security boundaries exist in code, not just comments

## Architecture reduction guardrails

- `docs/CONTEXT_INDEX.md` is the first-read file for AI agents to avoid legacy paths.
- Architecture Reduction Phase 1 does not change auth, session, RBAC, tenant access, Preview / Approval, or external execution behavior.
- Legacy import tracking is allowed to report compatibility usage, but it must not weaken deny-by-default production auth.
- Compatibility export deletion is deferred until imports are migrated and scanner output proves the surface is unused.
