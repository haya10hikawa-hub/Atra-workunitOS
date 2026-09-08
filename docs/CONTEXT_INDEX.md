# WorkUnit OS Context Index

## 1. Purpose

This is an implementation-path reference. Read [`PRODUCT_STATE.md`](../PRODUCT_STATE.md) and [`current/README.md`](./current/README.md) first.

It routes agents to files for each maintenance task and prevents unnecessary reads of legacy, compatibility, prototype, generated, or build-output surfaces.

## 2. Global dependency direction

```txt
UI
-> API Routes
-> Application Services
-> Domain
-> Repository / Client Interfaces
-> Infrastructure
-> D1 / External APIs
```

## 3. Security boundaries

- `tenantId`, `actorUserId`, and `role` are server-derived.
- JWT identity does not determine tenant or role.
- Preview / Approval hashes and status are server-owned.
- Provider tokens, secrets, raw payloads, raw request bodies, cookies, and Authorization headers must not be exposed.

## 4. Canonical files by feature

| Feature | Read these files first |
|---|---|
| WorkUnit UI implementation | `app/components/workunit-os/WorkUnitOSDashboard.tsx`, `app/components/workunit-os/adopted/AdoptedWorkUnitDashboard.tsx`, `app/components/workunit-os/adopted/AdoptedWorkUnitDashboard.module.css`, `app/lib/application/dashboard/*` |
| Action Field | `app/lib/application/actionField/dashboardPreviewClient.ts`, `app/lib/application/actionField/errorState.ts`, `app/lib/application/dashboard/selectedWorkUnitPreviewModel.ts`, `app/lib/application/dashboard/dashboardApprovalStatusClient.ts`, `app/lib/application/dashboard/approvalDecisionTraceModel.ts` |
| WorkUnit Inbox | `app/lib/application/workunitInbox/*` |
| Provider reads | `app/lib/infrastructure/external/github/*`, `app/lib/infrastructure/external/slack/*`, `app/lib/infrastructure/external/calendar/*` |
| Auth | `app/lib/application/auth/*`, `app/lib/security/session.ts`, `app/lib/security/rbac.ts`, `app/lib/security/tenantAccess.ts` |
| Persistence | `app/lib/persistence/repositoryResolver.ts`, `app/lib/persistence/routeRepositories.ts`, `app/lib/infrastructure/persistence/control/*` |
| Approval verification | `app/lib/security/approvalStore.ts`, `app/lib/security/approvalStoreResolver.ts`, `app/lib/persistence/approvalStoreAdapter.ts`, `app/lib/persistence/d1/approvalRecordRepository.ts`, `app/lib/persistence/d1/actionPreviewRepository.ts` |
| LLM | `app/lib/llm/*`; future planned path: `app/lib/application/llmContext/*` |

## 5. Files to avoid by default

- `app/components/legacy/workunitInbox/*`
- `app/components/workunitInbox/*`
- `app/lib/workunitInbox/*`
- `app/lib/workunitInbox/sources/**`
- `app/lib/actionField/*`
- Old pre-v0 `app/components/workunit-os/*` panes unless the task specifically targets migration
- Hopper / Studio / Decision prototype folders unless the task specifically targets them
- Generated output: `.next`, `.open-next`, `node_modules`

## 6. Minimal context bundles

| Task | Minimal context |
|---|---|
| UI maintenance | `PRODUCT_STATE.md`, `docs/CONTEXT_INDEX.md`, current V0 UI implementation files, client-safe view models, and relevant API response shape; frozen UI direction is historical context under `docs/archive/v0/` and does not authorize current or future implementation |
| Auth work | `docs/security/SECURITY_MODEL.md`, `app/lib/application/auth/*`, `app/lib/security/session.ts`, control repositories |
| Persistence work | `docs/DEPENDENCY_MAP.md`, target route file, `routeRepositories.ts`, `repositoryResolver.ts`, target repository implementation |
| LLM work | `app/lib/llm/sanitize.ts`, `app/lib/llm/budget.ts`, `app/lib/llm/prompts.ts`, `app/lib/llm/processWorkSignal.ts` |
| Integration work | Target `app/lib/infrastructure/external/<provider>` folder, `app/lib/application/workunitInbox/*`, relevant API route |

UI truthfulness rule: empty, loading, error, disconnected, unapproved, and unpreviewed states must be labeled as such. Do not show sample WorkUnits, sample audit rows, or sample provider status as live data.

## 7. Legacy status table

| Path | Classification | Current status | Removal gate |
|---|---|---|---|
| `app/lib/workunitInbox/*` | Compatibility | Re-exports canonical inbox application modules; some legacy UI may still import it | Zero active imports outside explicit compatibility tests |
| `app/lib/workunitInbox/sources/**` | Compatibility | Re-exports canonical provider read boundaries | Provider tests migrated to `app/lib/infrastructure/external/*` |
| `app/lib/actionField/*` | Compatibility | Re-exports canonical Action Field helpers | Zero imports from active code/tests |
| `app/components/workunitInbox/*` | Compatibility | Re-exports legacy WorkUnit Inbox UI | Zero active imports |
| `app/components/legacy/workunitInbox/*` | Legacy | Physical old standalone inbox/detail/action-field UI | Compatibility exports removed and no active imports |
| Old pre-v0 `app/components/workunit-os/*` panes | Transitional | Retained for implementation history only; not product direction | Explicit PM-approved disposition after product direction is resolved |
| Hopper / Studio / Decision prototype folders | Prototype / unknown | Not canonical WorkUnit UI root | PM decision to archive, migrate, or delete |

## 8. Rule for future prompts

Use this prompt shape for architecture-sensitive work:

```txt
Read only:
- docs/CONTEXT_INDEX.md
- <specific canonical files>

Do not edit:
- auth/session/security/approval unless explicitly required
- generated output

Do not touch legacy paths:
- app/lib/workunitInbox/*
- app/components/workunitInbox/*
- app/components/legacy/workunitInbox/*

Verification commands:
- npm run lint
- npm test
- git diff --check
```
