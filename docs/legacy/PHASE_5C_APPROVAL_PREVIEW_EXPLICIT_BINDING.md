# Phase 5C: Explicit Approval ↔ ActionPreview Binding

**Status:** Alpha Hardening Only
**Commercial SaaS Production:** No-Go
**External Execution:** No-Go
**Live Provider Integration:** No-Go

## Scope

Remove ambiguous approval lookup from verification/execution-like paths. An
approval is valid only when it is explicitly bound to a specific stored
`ActionPreview` under tenant + workUnit scope.

## Ambiguity removed

Previously the dry-run route resolved the approval with a **latest / workUnit-only**
lookup:

```
findByWorkUnitId(ctx, workUnitId) -> approvalRecords[0]   // most recent
```

and then accepted "any referenced preview whose hashes match that latest
approval". There was no explicit approval↔preview binding. With multiple
approvals/previews for a WorkUnit this is ambiguous.

`verifyApproval` (toolBackend path) also accepted `actionPreviewId` in its input
but never compared it to the stored `approval.actionPreviewId`.

## Exact binding contract

An approval is valid only when **all** of these hold (server-side, against stored
records):

- `tenantId` matches (trusted session)
- `workUnitId` matches (trusted route param)
- `approval.actionPreviewId === actionPreviewId` (explicit approval→preview binding)
- `preview.id === approval.actionPreviewId` (explicit preview→approval binding)
- `preview.tenantId === tenantId` and `preview.workUnitId === workUnitId`
- `approval.status === "approved"`, `usedAt` is null, not expired
- `approval.targetHash === preview.targetHash`
- `approval.payloadHash === preview.payloadHash`
- requested action type matches `approval.actionType` (when asserted)

Implemented as a pure function `verifyApprovalPreviewBinding`
(`app/lib/security/approvalPreviewBinding.ts`).

## Server-derived trusted context / client-owned fields

- `tenantId` from session, `workUnitId` from the route, hashes from the stored
  `ActionPreview`. These are the only inputs trusted for verification.
- The dry-run client contract is unchanged: it sends only `previewRefs`
  (`{ actionId, previewId }`) and `requestedActionType`. `approvalId`,
  `targetHash`, `payloadHash`, `tenantId`, `userId`, `role`, `status`, `usedAt`,
  `tokens`, `secret`, `rawPayload`, `rawBody` remain **forbidden client keys**.
- The server resolves the approval by the exact `actionPreviewId`
  (`approvalRepo.findByPreviewId`, tenant-scoped) — never by a client-supplied
  approvalId and never by a latest/workUnit-only lookup.

## Dry-run remains non-consuming

- Dry-run verifies the exact approval/preview binding for readiness only.
- It never calls `markApprovalUsed`, never marks an approval used, never enables
  the Execute CTA, and never creates `providerRequest`/`providerResponse`/
  `executionPayload`.
- The response exposes only safe fields (`ok`, `mode`, `status`, `reason`,
  `workUnitId`, `actionCount`, `requestedActionType`).

## Phase 5B CAS remains intact

The Phase 5B atomic compare-and-set `markUsed` one-time-use claim is unchanged.
Phase 5C adds explicit binding *before* any claim; the execute path still calls
the Phase 5B CAS and fails closed (`approval_used`) when the claim is lost.

## Notes / known limits

- `app/api/workunit/[id]/approval/status/route.ts` is a **display-only** status
  endpoint (shows the latest approval state for the dashboard). It is not a
  verification or execution gate and is intentionally out of Phase 5C scope.

## Boundaries

- No latest approval lookup for verification.
- No workUnit-only approval verification.
- External execution remains **No-Go**.
- Live provider integration remains **No-Go**.
- Commercial SaaS production remains **No-Go**.
- OAuth/token vault and billing remain **No-Go**.
- ActionPreview D1 `mapRow` hardening remains **future Phase 5D**.
- Tenant-secret HMAC-SHA256 hash migration remains **future Phase 5E**.

## Subagent Audits (Phase 5C merge gate)

The named specialized subagents are not available in this environment; equivalent
independent audits were performed with evidence against the committed diff.

- **SecurityAuditSubAgent — Go:** no external execution/live provider enabled; no
  provider SDK import / `fetch` / secrets; client-owned tenant/user/role and
  `approvedByPm` not trusted; no raw hashes / `providerRequest` / `providerResponse`
  / `executionPayload` exposed; binding is tenant-scoped and hash matching is
  server-side; safe errors only; binding outcomes never carry hashes/tenant/role/secrets.
- **ArchitectureAuditSubAgent — Go:** Phase 5C scope only; no 5D `mapRow`, no 5E
  HMAC, no Phase 6 schema work; no Supabase / production routing; pure binding
  module keeps domain/application/infrastructure boundaries.
- **TestAuditSubAgent — Go:** positive + mismatch + tenant + workUnit + hash +
  status/expiry/used + missing cases tested; no latest/workUnit-only ambiguity
  remains; dry-run non-consuming verified; full validation passes.
- **ProductGovernanceAuditSubAgent — Go:** all No-Go items preserved in docs/PR;
  no readiness overclaim.
- **GitHygieneAuditSubAgent — Go:** branch from latest `main` after PR #41 merge;
  no unrelated/generated files committed; changed files expected; commit message
  matches Phase 5C.
