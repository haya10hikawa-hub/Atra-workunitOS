# Phase 5A: SaaS P0 Route/Auth Hardening

**Status:** Alpha Hardening Only
**Commercial SaaS Production:** No-Go
**External Execution:** No-Go
**Live Provider Integration:** No-Go

## Summary

Phase 5A hardens `/api/workunit/tools` before any real external execution.

Changes:
- `normalizeRoleInput` now fails closed (throws `RoleNormalizationError` on undefined/null/empty/unknown)
- CSRF Origin protection for state-changing POST requests
- In-memory rate limit gate with tenant+user+IP key
- `invalid_role` added to session failure reasons with 403 response
- Dev sessions resolve an **explicit** default role (`owner`) via `resolveDevSessionRole()`,
  gated behind `NODE_ENV !== "production"` + `ALLOW_DEV_SESSION` + a `dev` provider.
  This is dev-only and does **not** relax `normalizeRoleInput`: production membership
  rows with a missing/invalid role still fail closed (`invalid_role` / 403).

## `/api/workunit/tools` Protection

The route is actually protected, in this order, before any tool/LLM work:

1. **CSRF / Origin validation** (`validateCsrfOrigin`) runs first — before session,
   body parse, RBAC, LLM, or tool handling. Cross-site, malformed, and missing
   Origin/Referer POSTs are rejected with 403 (`invalid_origin` / `csrf_failed`,
   forwarded via `csrf.reason`).
2. **Session boundary** (`requireSession`) — establishes the trusted context.
3. **Tenant + user + IP rate limiting** (`checkRateLimit`) runs **before** body parse,
   RBAC, LLM, and tool handling — i.e. before expensive work. Beyond threshold → 429
   `rate_limited`.
4. Only then: body parse / validation / RBAC / tool handling.

### Trusted context is server-derived

- `tenantId` comes from `session.tenantId`.
- `actorUserId` comes from `session.userId`.
- `role` comes from membership via `normalizeRoleInput`.
- Client-owned `body.tenantId` / `body.userId` / `body.role` / `approvedByPm` are **not**
  trusted and cannot define tenant, actor, role, or authorize external execution.
- Invalid/missing role fails closed (`invalid_role` / 403).

### Rate limiter scope

- The in-memory limiter is **alpha/dev-safe only** (process-local `Map`).
- A **production durable limiter is still required** before commercial SaaS.

## What This PR Does Not Add

- OAuth/token vault
- Billing
- Real Slack/Gmail/GitHub/Calendar writes
- External execution
- Approval markUsed atomic CAS
- approvalId + actionPreviewId execution binding
- HMAC hash migration
- ActionPreview D1 mapRow fix
- OIDC/cookie session migration
- D1 schema migration
- Production durable rate limiter

## Future Phases

| Item | Phase |
|------|-------|
| approval markUsed atomic CAS | 5B |
| approvalId + actionPreviewId explicit binding | 5C |
| ActionPreview D1 mapRow fix | 5D |
| HMAC hash migration | 5E |

## Safety

- Client-provided tenantId/userId/role is not trusted
- Missing/undefined role does not become owner
- Role normalization fails closed
- CSRF/origin protection is required for state-changing requests
- Rate limit is required before expensive tool/LLM work
- Safe errors do not leak tokens/secrets/stacks
- External execution remains OFF
- Live provider integration remains No-Go
