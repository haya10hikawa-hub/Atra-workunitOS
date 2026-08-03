# HTTP Mutation Guard and the Safe-Method Invariant

Status: implemented (WU-02S). Base `e8b36cc9`.

## INV-SAFE-1

> No handler exported as `GET`, `HEAD` or `OPTIONS` from any module under
> `app/api/**/route.{js,jsx,ts,tsx}` may cause **durable tenant/business-state
> mutation, provider mutation or external action** — on any code path, for any
> query string, under any feature flag.

Covers repository insert/update/upsert/delete, transaction, usage, audit,
approval, integration and provider mutation, and external action. The write
vocabulary is **derived at test time** from `repositories.ts`, so a new
repository write method cannot escape coverage.

**Documented exclusions (D4)**, both drift-tested by T4:
- `checkRateLimit` — a module-scope in-memory `Map`, per isolate, lost on
  recycle. Not durable, not tenant or business state. Including it would ban an
  availability control from read paths, which is not the property protected.
- `writeAuditLog` — a no-op **while it has no durable backend**. The exclusion is
  conditional: T4 asserts `auditLog.ts` contains no repository call, so gaining a
  backend becomes a build failure, not a silent regression.

"No mutation of any kind" is **prohibited** — false at these bytes, and it invites
widening the scanner until an availability control is banned from read paths.
**Layers.** L1 type-level containment (load-bearing): safe handlers receive
`TenantReadRepositoryBundle`, `Pick<>`-narrowed with `usage` absent — this is what
defeats callback injection, since the capability is absent from the type. L2 AST
call-name scan plus a module-local callee closure. L3 executable probes counting
real writes. **A module-graph reachability layer is prohibited here**: every route
imports `routeRepositories.ts`, so file-level reachability flags 100% of handlers
and has zero discriminating power (the module graph stays correct for T8–T10).

**Evidence limits.** No whole-program transitive proof is claimed; L2 resolves
direct and module-local edges only. Cross-module aliasing, dynamically-keyed
access and value-typed callbacks are not statically detected — L1 removes the
capability, L3 catches them at runtime, and L3 covers exercised paths only. These
tests must not be described as proving transitive purity.

**Fail-closed.** The invariant fails — never skips — on zero discovered handlers,
zero safe or unsafe handlers, a parse diagnostic, an unknown export form, a
sub-floor write inventory, **an unresolvable module-local callee**, or a failed
positive control. `reviewedStateChangingSafeHandlers` is `[]`, asserted as a
**prohibition**: a non-empty ledger fails.

## The guard

`app/lib/security/httpMutationGuard.ts`. **Phase 1**
`checkMutationRequestIntegrity(request, policy)` is **synchronous** and takes a
`Request` plus a plain policy value, so it cannot await a body. It has no
session, tenant, runtime-config resolver or repository in scope and reads no
environment: a guard that cannot resolve a session cannot mint one, and one that
cannot reach a repository cannot write. Enforced by the type and import
allowlist, not discipline. **Phase 2** `readGuardedJsonBody` is a separate
function the route calls at step 11.

| # | Step | Owner | Failure |
|---|---|---|---|
| 0 | request-scoped runtime configuration | route | 503 `integration_missing` |
| 1 | method | guard | 405 `invalid_request` |
| 2 | trusted target Host | guard | 403 `csrf_failed` |
| 3–4 | Origin, then Referer fallback | guard | 403 `invalid_origin` / `csrf_failed` |
| 5 | Content-Length precheck | guard | 413 `invalid_request` |
| 6 | Content-Type and charset | guard | 400 `invalid_request` |
| 7 | authentication | `requireSession` | 401/403/500 |
| 8 | tenant identity and active membership | `resolveRouteRepositories` | 403 / 503 |
| 9 | rate limit | `checkRateLimit` | 429 `rate_limited` |
| 10 | route-specific RBAC | route | 403 `forbidden` |
| 11–13 | body read, JSON parse, domain validation | route | 413 / 400 |
| 14–17 | provider resolution, persistence, usage, audit | `inboxService` | 503 / swallowed |
| 18 | response | route | — |

Load-bearing: **step 0 precedes the guard** because the guard's trusted-origin
policy *is* a projection of the runtime config (resolving it later makes the
guard unimplementable); step 0 reads no body, resolves no session or tenant,
performs no RBAC, touches no repository, and fails closed value-free.
**Steps 1–6 precede step 11**, so a bad request never reaches buffer allocation
or the JSON parser. **Steps 1–6 precede step 7** — integrity failures are
mutually indistinguishable regardless of credential validity, so there is **no
authentication oracle**. **Step 9 follows** authentication and tenant authority,
which it keys on. **Step 10 precedes step 11** everywhere except
`app/api/workunit/tools/route.ts`, whose permission is derived from the body — a
documented structural exception; rate limiting still precedes both. A
misconfigured production runtime therefore returns a value-free 503 before a
cross-site request reaches its 403; accepted, because that 503 is
request-independent and reveals no authentication or tenant state.

**Method authority.** An **actual** unsupported HTTP request to a module
exporting only `POST` is rejected by the framework dispatcher before the handler
runs, and that response is not the `safeError` envelope. **Direct invocation**
with a non-POST `Request` reaches the guard's step-1 check and returns 405
`invalid_request`. The guard's check is defense in depth for that second path
only; it is not claimed that every unsupported network request executes it.

**Host.** Trusted hosts derive from the same `trustedOrigins` policy — one
authority, one thing to misconfigure. Exact equality on `URL`-parsed hosts; **no
suffix, prefix, `includes` or `endsWith` matching**. Port counts. Missing,
malformed, duplicated and trailing-dot values reject. `X-Forwarded-Host`,
`Forwarded` and `X-Forwarded-Server` are never read.

**Origin / Referer.** Exact `URL.origin` equality; scheme, host and port all
count. Origin present → Origin only, with **no Referer fallback** even when the
Referer would be trusted. Origin absent → same-origin Referer accepted,
cross-site rejected. Both absent → 403 `csrf_failed`. `Origin: null` is rejected
explicitly as policy. **Bearer without Origin is REJECTED**, preserving today's
behaviour: a CLI or server-to-server client must send a conforming `Origin`.

**Content-Type.** Only `application/json`, optionally `charset=utf-8`. The
`text/plain` rejection is the security-relevant one — it is a CORS-simple type a
cross-origin caller can send with no preflight, so requiring `application/json`
forces a preflight beneath the Origin check. **Body size:** step 5 is
header-only; with `Content-Length` absent the existing streaming cap in
`readBoundedJsonObject` remains the enforcement. **Value-free errors:** every
failure body is exactly `{ ok: false, requestId, error }` — never the Origin,
Host, tenant, entity id, body fragment or internal `category`. No
`SAFE_ERROR_CODES` member was added; the vocabulary remains 17.

## Request-scoped trusted-origin authority

```
Cloudflare request env (ALLOWED_ORIGINS) → resolveValidatedRequestRuntimeConfig()
  → validated frozen SecurityRuntimeConfig.trustedOrigins
  → MutationGuardPolicy.trustedOrigins → checkMutationRequestIntegrity
```

`csrfProtection.ts` previously computed its allowlist from the ambient
environment at **module load**. Under Cloudflare Workers that is not the request
environment, so it collapsed to `["http://localhost:3000"]` in production — an
allowlist that cannot be configured in production is not a guard. Each entry must
parse with `new URL(entry)` **and** equal its own `.origin`; wildcards are
rejected explicitly, because a wildcard host round-trips through `URL.origin` and
would otherwise be accepted. Results are deduplicated and frozen. Under
`cloudflare`, absent/empty/malformed fails closed (value-free 503); under
`local`, absent defaults to `http://localhost:3000` and malformed still fails
closed.

Prohibited: module-scope or per-call ambient origin authority,
`NEXT_PUBLIC_APP_URL` as server authority, wildcard origins, suffix/prefix
matching, unconditional forwarded-host trust. **Scope note:** this covers
`httpMutationGuard.ts` and `csrfProtection.ts`; it does not claim to remove every
unrelated ambient-environment reader from the application.

## Read-only repository capability

`resolveRouteReadRepositories` is the only resolver a safe-method handler may
call. It delegates to `resolveRouteRepositories` — sharing tenant-registry
validation and the `tenant_forbidden → 403` / `integration_missing → 503`
mappings — then narrows. `usage` is **absent from the type entirely** rather than
narrowed, removing `recordEvent` from reach completely.

## `POST /api/workunit/inbox/refresh`

The sole explicit WorkUnit-row materialization path.

**Request** `{ "source"?: "mock" | "github" | "slack" | "calendar" | "all" }`.
Absent → `"mock"`, identical to the GET default; `"mock"` is a first-class member
and is never rejected. Any other value, any server-owned field, and any key other
than `source` → 400. Limits `{ maxBytes: 2048, maxDepth: 2, maxNodes: 10 }`.

**Response** 200, exactly `{ ok, requestId, refreshed, source }` — no WorkUnit
entities, tenant values, rows, provider content or internal errors. The caller
uses `GET` to read the projection.

**RBAC** `canRefreshWorkUnitInbox` = `workunit.create` **AND** `workunit.edit`.
Reading the inbox must not authorize mutating it: `viewer` keeps GET, loses
refresh. `canViewInbox` alone is prohibited; `canCreateFeedback` is not reused;
no new permission is minted. **Telemetry** is strictly
`persistence → usage → audit`, both fail-open and both after the authorization
decision; `inbox_fetch` and `workunit.inbox.fetch` are preserved verbatim so
dashboards and `audit/recent` keep working.

**Semantics.** Idempotent in id-space (deterministic ids), so N refreshes
converge and a non-`open` stored status survives. Telemetry is append-only, one
row per call. Concurrency is **last-writer-wins, pinned as characterization,
never asserted as a guarantee**. A provider rejection **fails before any write**
(503, zero rows/usage/audit) — a strengthening over the pre-WU-02S GET.

**Transaction semantics, exactly.** `WorkUnitRepository` exposes no transaction
method, so there is no rollback and none is introduced. Once the write loop
begins, a failure part-way leaves a **partial row set** — every row authorized,
same-tenant, from the same projection, but fewer than the projection contains.
All-or-nothing is **not** claimed. What is guaranteed is narrower and exact: *no
write occurs unless every provider resolved.* **Providers remain fake** on every
branch, including `"real"` with a token, so the endpoint's latency, failure and
idempotency characteristics **must not** be cited as evidence that the same shape
is safe once a real provider is activated.

## Accepted product cost (D1)

`GET /api/workunit/inbox` is projection-only and **no UI caller is added**, so
`work_units` rows are materialized only after an explicit refresh. A direct API
caller that relied on the GET to materialize rows before
`POST /api/workunit/[id]/action-preview` or `.../feedback` must call
`POST /api/workunit/inbox/refresh` first. No shipped screen is affected, but the
API contract genuinely changes. (In in-memory mode the coupling was already
absent; it was live only in D1 mode.)
