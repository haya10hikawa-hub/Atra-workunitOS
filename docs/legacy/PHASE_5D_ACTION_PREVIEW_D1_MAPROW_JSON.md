# Phase 5D: ActionPreview D1 mapRow JSON Hardening

**Status:** Alpha Hardening Only
**Commercial SaaS Production:** No-Go
**External Execution:** No-Go
**Live Provider Integration:** No-Go

## Scope

Harden `D1ActionPreviewRepository` row mapping so the `target_preview` /
`payload_preview` JSON columns are serialized and parsed safely, deterministically,
and without unsafe fallback.

## Risk removed

The previous `mapRow` used a broken heuristic:

```ts
targetPreview: safeJsonParse(row.target_preview, {}).toString() !== "[object Object]"
  ? safeJsonParse(row.target_preview, "{}")
  : "{}"
```

- For a normal stored JSON **object**, `.toString()` is `"[object Object]"`, so the
  branch returned the literal `"{}"` — **content was silently lost**.
- Malformed JSON also silently fell back to `"{}"` — a fabricated, potentially
  "executable-looking" empty target/payload.

`create` also double-encoded: `safeJsonStringify(safeJsonParse(safeJsonStringify(x)))`.

## Safe JSON parsing contract

Two helpers in `rowHelpers.ts`:

- `toJsonColumn(value)` — serialize for storage **exactly once**. Nullish/empty →
  `"{}"`; string → verbatim; object/array → stringified once. Never mutates input,
  never throws.
- `readJsonColumn(value)` — return the stored string **verbatim** only when it
  parses as JSON (content preserved exactly); otherwise `null`. Never returns
  parser text and never echoes raw stored content.

`mapRow` now returns `ActionPreviewRow | null`:

- `target_preview` / `payload_preview` are read via `readJsonColumn` and returned
  verbatim.
- If either column is missing or malformed → `mapRow` returns `null`.

## Malformed row behavior

- `findById` → returns `null` for a malformed row (treated as absent).
- `findByWorkUnitId` → skips malformed rows (valid rows still returned).
- No fabricated `{}` target/payload, so a corrupt row can never be read as a valid
  empty/default action.

## No raw payload / hash / secret exposure

The fail-safe path returns `null` — it carries no fields, no parser message, no raw
target/payload, no `targetHash`/`payloadHash`, no `tenantId`/`userId`/`role`, and no
token/secret/API-key content.

## Tenant boundary

Unchanged: `findById` / `findByWorkUnitId` SQL remain scoped by `tenant_id = ?`.
Wrong tenant → `null` / `[]`.

## Hash preservation

`targetHash` and `payloadHash` are stored in separate columns and returned exactly
as stored. The JSON-mapping change does not touch them and does not change the hash
algorithm.

## Phase 5B / 5C preserved

- Phase 5B atomic CAS `markUsed` one-time-use claim is unchanged.
- Phase 5C explicit approval ↔ action-preview binding is unchanged; a malformed
  preview simply resolves as absent, so binding fails closed (not_ready), never
  validating against a fabricated preview.
- Dry-run remains non-consuming.

## Boundaries

- External execution remains **No-Go**.
- Live provider integration remains **No-Go**.
- Commercial SaaS production remains **No-Go**.
- OAuth/token vault and billing remain **No-Go**.
- Tenant-secret HMAC-SHA256 hash migration remains **future Phase 5E**.
- D1 schema / index hardening remains **future Phase 6A / 6B / 6C**.

## Subagent Audits (Phase 5D merge gate)

Named specialized subagents are unavailable in this environment; equivalent
independent audits were performed with evidence against the committed diff.

- **SecurityAuditSubAgent — Go:** no external execution/live provider; no provider
  SDK / `fetch` / secrets; client-owned tenant/user/role and `approvedByPm` not
  trusted; malformed JSON exposes no raw target/payload/hash/tenant/secret (returns
  `null`); no `providerRequest`/`providerResponse`/`executionPayload`; safe errors
  only; tenant boundary preserved.
- **ArchitectureAuditSubAgent — Go:** Phase 5D scope only; no 5E HMAC, no Phase 6
  schema/index work; no Supabase / production routing; persistence-layer change
  keeps boundaries; helpers live in `rowHelpers.ts`.
- **TestAuditSubAgent — Go:** valid roundtrip, hash preservation, tenant boundary,
  malformed-fail-safe, no-raw-exposure, no-default-fabrication tested behaviorally
  (not source-scan only); Phase 5B CAS and 5C binding tests still pass.
- **ProductGovernanceAuditSubAgent — Go:** all No-Go items preserved; no readiness
  overclaim.
- **GitHygieneAuditSubAgent — Go:** branch from latest `main` after PR #42 merge; no
  unrelated/generated files committed; changed files expected; commit message
  matches Phase 5D.
