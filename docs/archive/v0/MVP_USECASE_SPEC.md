# MVP_USECASE_SPEC.md

# WorkUnit OS — MVP Inbox Use Case Specification

## 1. Purpose

This document defines the MVP WorkUnit signal-to-WorkUnit experience.

The **WorkUnit Launcher** is the first product surface a user sees. It opens normalized tool
signals (GitHub, Slack, Calendar) as WorkUnits that answer:

* What is happening?
* Why does it matter?
* What should I do next?

**Today's scope:** Use normalized fake/source fixtures by default. GitHub has a real client skeleton for local/dev experiments, but the MVP path does not require real external APIs.
The goal is the product experience — not the integration implementation.

## 2. Target Users

* Individual developers managing personal projects
* Student developers tracking assignments and side work
* Indie hackers shipping solo or in pairs
* Small teams of 1–5 people using GitHub + Slack + Calendar

## 3. Target Tools (MVP)

| Tool | Signal | WorkUnit Kind |
|------|--------|---------------|
| GitHub | PR waiting for review | `review_waiting` |
| GitHub | Issue assigned | `assigned_issue` |
| GitHub | Issue blocked | `blocker` |
| Slack | Mention / request | `missed_response` |
| Calendar | Deadline approaching | `deadline` |

## 4. Detected Work Types

| Kind | Description | Typical Priority |
|------|-------------|-----------------|
| `review_waiting` | Someone is waiting for your review | High / Medium |
| `assigned_issue` | You've been assigned a task | Medium |
| `blocker` | Something is blocking progress | High |
| `missed_response` | You may have missed a Slack message | Medium / High |
| `deadline` | A calendar deadline is approaching | High / Medium |

## 5. Conversion Rules

Signals are transformed into WorkUnits via deterministic rules in
`app/lib/application/workunitInbox/transform.ts`.

Rules:
* Signal type → WorkUnit kind (fixed mapping)
* `priorityHint` overrides default priority when present
* Blocker defaults to high, deadline to high/medium based on dueAt
* All other types default to medium
* Sort: high → medium → low, then newest first

## 6. Inbox API

`GET /api/workunit/inbox`

* Returns: `{ workUnits: InboxWorkUnit[] }`
* Session required
* Tenant-filtered
* Source switcher supports `all`, `mock`, `github`, `slack`, and `calendar`
* Fake normalized source foundations are the default MVP path
* Persists sanitized generated WorkUnits when repositories are available
* Repeated fetches reuse stable IDs and do not duplicate persisted WorkUnits
* Development fallback may still return generated WorkUnits when persistence is unavailable
* Dev session access requires `AUTH_ADAPTER=dev` and `ALLOW_DEV_SESSION=true`
* Production JWT access requires `AUTH_ADAPTER=jwt` and `JWT_AUTH_SECRET`
* JWT verifies identity only; tenant and role still come from control DB active membership
* Local bootstrap of the dev user/tenant/membership requires `ALLOW_DEV_WORKSPACE_BOOTSTRAP=true`
* Production anonymous access is rejected by default
* Tenant ownership is always derived from the server session, not from client input

## 7. UI Requirements

### WorkUnit Launcher
* Search/list overlay — each result shows: title, ROI/priority, status, source, urgency, next step
* Loading / error / empty states
* AI agents should read `docs/CANONICAL_DECISION_INDEX.md` and `docs/CONTEXT_INDEX.md` before touching UI paths
* Current implementation path is `WorkUnitOSDashboard`
* Current visual implementation lives in `app/components/workunit-os/adopted/AdoptedWorkUnitDashboard.tsx`; its dashboard naming is implementation history
* Accepted UI layout is WorkUnit Launcher + WorkUnit Graph + right-side Action Field
* The current shell fetches real WorkUnits through `/api/workunit/inbox` and maps them through `app/lib/application/dashboard/adoptedDashboardViewModel.ts`
* Empty/loading/error states must be explicit; the UI must not show sample WorkUnits as live data

### WorkUnit Graph
* Open WorkUnit → graph workspace with connected Nodes
* Select Node → Action Field updates to the selected Node
* Visual selection indicator

### Action Field
* Right-side Action Field is the selected Node work surface
* Preview / Approval client lives in `app/lib/application/actionField/dashboardPreviewClient.ts`
* Linked context and generated drafts are shown as editable work material, not raw source readers
* Preview group is derived from selected real WorkUnit via `selectedWorkUnitPreviewModel.ts`
* Action Field can create ActionPreviews through existing APIs without changing request trust boundaries
* Approval and execution readiness must not be shown as complete unless preview/approval state exists
* Older `WorkUnitActionField` remains only as a migration reference
* External execution is still disabled
* Compatibility paths remain in place during Architecture Reduction Phase 1; deletion is deferred until imports reach zero

### Feedback Controls
* Useful / Not useful / Later / Done buttons
* Persist feedback through `POST /api/workunit/:id/feedback`
* `later` / `done` updates persisted WorkUnit status

## 7.5 Current persistence and usage behavior

* Inbox fetch records a usage event when the usage repository is available
* Feedback creation records a usage event when the usage repository is available
* Integration status reads record a usage event when the usage repository is available
* UI audit reads are tenant-scoped and sanitize metadata before returning it to the client
* Usage metadata is sanitized and excludes raw payloads, tokens, and secrets
* Current UI also reads tenant-scoped integration status and recent audit summaries through client-safe application helpers

## 8. Out of Scope

* GitHub OAuth / Slack OAuth / Calendar OAuth
* Real Slack / Calendar API clients
* Webhooks
* Raw payload validation
* External tool execution
* Token storage
* Billing / pricing
* Real cookie or OIDC authentication adapter

## 9. Success Metrics

* User sees normalized WorkUnits from mock signals
* User can search, open, select, and inspect WorkUnits
* Selected WorkUnit Node contextualizes the Action Field
* Repeated inbox refresh does not duplicate persisted WorkUnits
* UI feels responsive and minimal
* All tests pass (transform + API + UI smoke)
* Zero real external API calls
* Architecture cleanup reduces compatibility imports without changing runtime behavior
