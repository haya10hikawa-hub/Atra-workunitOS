# Data-Flow Map — Large-SaaS Refactor Program

Base: `origin/main` @ `2669f2ea`. Companion to `DEPENDENCY_MAP.md` (module
structure); this file follows the data.

## F1 — Authentication & tenant attribution

```mermaid
sequenceDiagram
  participant C as Client
  participant R as API route
  participant CFG as requestRuntimeConfig
  participant A as Auth adapter (jwt/none/dev)
  participant CTRL as CONTROL_DB

  C->>R: request + Bearer JWT
  R->>CFG: resolve once (frozen, fail-closed)
  R->>A: verify(request)
  A-->>R: VerifiedAuthIdentity (provider, subject)
  R->>CTRL: auth_identities → users → memberships → tenants
  Note over R,CTRL: tenantId = FIRST active membership (order-dependent — AUD-003)
  CTRL-->>R: SessionContext {userId, tenantId, role}
  Note over R: role/tenant NEVER from JWT claims
```

## F2 — Signal ingestion & LLM pipeline (advisory only)

```mermaid
flowchart LR
  SRC[Fake GitHub/Slack/Calendar events] --> NORM[NormalizedToolSignal]
  NORM --> SAN[sanitizeForLlm\ninjection flags FAIL-CLOSED]
  SAN --> BUD[char budgets per stage]
  BUD --> EXT[extractCandidate] --> DRAFT[generateWorkUnitDraft] --> EVAL[evaluateWorkUnit]
  EVAL -->|failure| DEG[degrade: ok + manual-review + medium risk]
  DRAFT --> OUT[validated JSON DTO to client]
  OUT -.->|no persistence, no authority| X[(nothing executed)]
```

Tenant data sent to LLM: sanitized signal content only; provider disabled in
production; mock-only in dev. API key from request-scoped config on the tools
route (`projectLlmEnv`).

## F3 — Preview → Approval → Runtime authorization (no execution)

```mermaid
sequenceDiagram
  participant U1 as Creator (user A)
  participant U2 as Approver (user B)
  participant API as API routes
  participant TDB as TENANT_DB
  participant GATE as runtimeAuthorizationGate

  U1->>API: POST action-preview
  API->>TDB: preview row (server-set creatorUserId, targetHash, payloadHash, expiry)
  U2->>API: POST approval {previewId, decision}
  Note over API: four-eyes: creator ≠ approver, fail-closed on missing creator
  API->>TDB: approval row (hashes copied from stored preview, 30-min expiry)
  U2->>API: POST tools {external op, approvalId, previewId}
  API->>GATE: authorizeRuntimeCommand (server evidence only)
  GATE->>TDB: exact-binding atomic claim (tenant+WU+preview+approval+type+hashes)
  GATE-->>API: authorized_not_executed receipt
  Note over GATE: production evidence resolver = default-deny → fails closed
  API->>TDB: buffered audit events flushed AFTER terminal decision (fail-open)
```

## F4 — Persistence write path (tenant isolation)

```mermaid
flowchart TD
  ROUTE[route handler] --> RR[resolveRouteRepositories tenantId, runtime]
  RR --> RES[repositoryResolver\nprod: mandatory resolver, fail-closed]
  RES --> REL[relationshipEnforcedRepositories\nparent checks, opaque violations]
  REL --> D1[D1 repos: tenant predicate on EVERY read/write\n+ writeGuards UNIQUE→object_id_conflict]
  D1 --> DB[(TENANT_DB shared D1,\nglobal id namespace)]
  RES -->|dev only, ALLOW_IN_MEMORY_PERSISTENCE| MEM[(in-memory bundle)]
```

## F5 — Audit data flow (current, defective)

```mermaid
flowchart LR
  EV[audit_event in route] --> WAL[writeAuditLog — NO-OP in prod]
  EV2[selected security paths] --> RAE[recordAuditEvent\nallowlist-redacted metadata]
  RAE -->|try/catch swallow: FAIL-OPEN| ALOGS[(audit_logs, tenant-scoped)]
  ALOGS --> AR[GET /api/audit/recent\nlimit-validated, RBAC]
  WAL -.-> LOST[silently discarded]
```

## F6 — Operator deploy/migration flow (no runtime coupling)

```mermaid
flowchart LR
  CFGF[wrangler.deploy.json] --> AUTH[cfDeployConfigAuthority\nread-once, validate, freeze, private exec copy]
  AUTH --> PLAN[manifest lanes + planDigest] --> LEDGER[__atra_d1_migrations reconcile]
  LEDGER --> EXEC[wrangler d1 execute --file\nONE atomic batch, double-gated]
  EXEC --> VERIFY[COUNT-only post-verify\nhonest failed_after_commit]
  AUTH --> DEPLOY[worker deploy — never migrates]
```

## Trust-boundary summary

| Boundary | Enforcement | Gaps |
|---|---|---|
| Client → server fields | `hasClientOwnedFields`, bounded JSON | DTO leakage of server fields tracked in #134 |
| Tenant → tenant | SQL predicates + relationship enforcement + write guards | order-dependent tenant attribution (AUD-003); shared global id namespace (by design, fail-closed) |
| LLM → product state | advisory-only pipeline; no tool authority; injection fail-closed | eval-stage fail-open is deliberate but undocumented for operators |
| App → providers | kill switch + gate; no executor exists | provider tokens global, not per-tenant (R-09) |
| Env → config | request-scoped validated config | module-scope CSRF allowlist (AUD-002); stray direct reads (map §Findings) |
| Operator → remote D1 | double gates, artifact binding, one authority | remote execution never yet exercised (#155) |
