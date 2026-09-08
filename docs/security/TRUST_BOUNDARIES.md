# Trust Boundaries

**Status: CANONICAL — CURRENT PRODUCT-INDEPENDENT SECURITY BOUNDARIES.** Product authority: NONE.

## The Trust Model

[`SECURITY_MODEL.md`](./SECURITY_MODEL.md) owns the umbrella security model and the current `Approval ≠ Execution` invariant. This document owns boundary-by-boundary enforcement details.

WorkUnit OS operates on a strict zero-trust model for all external input.
No data crosses a trust boundary without explicit sanitization or approval.

## Trust Boundaries Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     UNTRUSTED ZONE                           │
│                                                              │
│  Slack messages   Gmail messages   GitHub issues             │
│  Notion pages     Drive files      Calendar events           │
│  Client JSON      AI output        Frontend state            │
│                                                              │
│  ════════════════════ TRUST BOUNDARY ═══════════════════    │
│                    (sourceHoppers.ts)                         │
│                    (toolBackendValidation.ts)                 │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                     SANITIZED ZONE                            │
│                                                              │
│  SanitizedWorkUnitCandidate  — metadata only, no raw body    │
│                                                              │
│  ════════════════════ TRUST BOUNDARY ═══════════════════    │
│                    (workUnitDrafts.ts)                        │
│                    (human review)                             │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                     DRAFT ZONE                                │
│                                                              │
│  WorkUnitDraft  — AI/system-generated, reviewable            │
│                                                              │
│  ════════════════════ TRUST BOUNDARY ═══════════════════    │
│                    (actionApproval.ts)                        │
│                    (server-side approval)                     │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                     APPROVED ZONE                             │
│                                                              │
│  ActionApprovalRecord  — server-side, immutable              │
│                                                              │
│  ════════════════════ TRUST BOUNDARY ═══════════════════    │
│                    (externalActions.ts kill switch)           │
│                    (rbac.ts permission check)                 │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                     EXECUTION ZONE                            │
│                                                              │
│  External tool clients  — controlled, audited                │
│  Slack API   Gmail API   GitHub API   Calendar API           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## What Each Boundary Enforces

### Boundary 1: Untrusted → Sanitized

- **File:** `app/lib/sourceHoppers.ts`
- **What it does:** Strips raw content fields (rawContent, body, html, pageBody)
- **What survives:** Metadata only — title, actors, timestamps, labels, external IDs
- **Enforcement:** Runtime validation in `sanitizeSourceEvent()`, privacy regression checks

### Boundary 2: Sanitized → Draft

- **File:** `app/lib/workUnitDrafts.ts`
- **What it does:** Converts sanitized candidates to structured WorkUnit drafts
- **What survives:** Structured Situation, Actors, Problem, Deadline, Impact, Effort
- **Enforcement:** Source ref must remain separated from content

### Boundary 3: Draft → Approved

- **File:** `app/lib/security/actionApproval.ts`
- **What it does:** Requires server-side approval record before execution
- **What is enforced:** Client `approvedByPm` is ignored. Only server-side records count.
- **Current state:** Default deny — `verifyServerSideApproval` returns `approval_required`

### Boundary 4: Approved → Runtime authorization eligibility

- **File:** `app/lib/security/externalActions.ts`, `app/lib/security/rbac.ts`
- **What it does:** Kill switch check + RBAC permission check before external API calls
- **What is enforced:** `EXTERNAL_ACTIONS_ENABLED="true"` required. PM role must hold `workunit.execute_external_action` (currently only owner/admin).

## What Must Never Cross Boundaries

1. **Raw source body text** — Slack message body, Gmail body, Notion page content
2. **Client authorization flags** — `approvedByPm` is always stripped
3. **Client integration config** — `externalConfig` (channels, repos, recipients)
4. **API tokens** — never exposed to client or stored in draft objects
5. **Stack traces** — never in error responses
6. **Internal validation details** — generic error messages only

## In Code

The trust level types are defined in `app/lib/trustBoundaries.ts`:

```typescript
type TrustLevel = "untrusted" | "sanitized" | "draft" | "approved" | "executed"
```

Each boundary has corresponding types:
- `UntrustedSourceContent` — raw external input
- `SanitizedWorkUnitData` — metadata-only candidate
- `WorkUnitDraftData` — structured but unapproved
- `HumanApprovalDecision` — server-side approval record
- `ExecutionCommandData` — approved, ready to execute
- `ExternalExecutionResult` — result from external provider
