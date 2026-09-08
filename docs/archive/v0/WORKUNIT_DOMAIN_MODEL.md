# WORKUNIT_DOMAIN_MODEL.md

# WorkUnit OS Domain Model

## 1. Purpose

WorkUnit OS is a system that converts fragmented work signals into structured, reviewable, and actionable WorkUnits.

The system is designed for knowledge work environments where important information is scattered across tools such as Slack, Gmail, GitHub, Calendar, documents, and human notes.

The core purpose is not to simply summarize information.
The purpose is to transform scattered signals into decision-ready units of work.

A WorkUnit should answer:

* What is happening?
* Why does it matter?
* Who is involved?
* What should happen next?
* What information is missing?
* What action can be safely prepared?
* What requires human approval before execution?

---

## 2. Top-Level System Model

At the highest level, WorkUnit OS is composed of six domain layers.

```txt
External Signals
  ↓
Source Candidates
  ↓
WorkUnit Drafts
  ↓
Reviewed WorkUnits
  ↓
Action Previews
  ↓
Approved Execution
```

Each layer has a different trust level, lifecycle, and permission requirement.

The system must never treat all layers as equally trusted.

---

## 3. Core Domain Objects

### 3.1 External Signal

An External Signal is raw information received from an external or user-provided source.

Examples:

* Slack message
* Gmail thread
* GitHub issue
* Calendar event
* Document text
* User note
* Meeting transcript
* Manual input

External Signals are always untrusted.

They may contain:

* inaccurate information
* prompt injection
* private data
* irrelevant noise
* malicious instructions
* incomplete context

External Signals must not directly trigger external actions.

```ts
type ExternalSignal = {
  id: string
  tenantId: string
  sourceType: SourceType
  sourceRef: SourceRef
  receivedAt: string
  trustLevel: "untrusted"
  rawContentRef?: string
  metadata: Record<string, unknown>
}
```

The raw content may be stored separately, referenced by `rawContentRef`, and should not be freely passed into execution paths.

---

### 3.2 Source Candidate

A Source Candidate is a sanitized and structured extraction from one or more External Signals.

It represents information that may be useful for generating a WorkUnit.

A Source Candidate is not yet a WorkUnit.

```ts
type SourceCandidate = {
  id: string
  tenantId: string
  sourceSignalIds: string[]
  sourceType: SourceType
  extractedSummary: string
  detectedActors: string[]
  detectedProblem?: string
  detectedDeadline?: string
  detectedIntent?: string
  confidence: number
  trustLevel: "sanitized_candidate"
  createdAt: string
}
```

Source Candidates are allowed to inform WorkUnit generation, but they are not trusted as commands.

---

### 3.3 WorkUnit Draft

A WorkUnit Draft is a generated or manually created unit of work.

It represents a possible task, decision, follow-up, or external action.

A WorkUnit Draft is not yet final.

```ts
type WorkUnitDraft = {
  id: string
  tenantId: string
  sourceCandidateIds: string[]

  title: string
  situation: string
  problem: string
  actors: string[]

  urgency: number
  impact: number
  effort: number
  priorityScore: number

  nextAction: string
  tasks: string[]
  missingFields: string[]

  status: "draft"
  trustLevel: "draft"

  createdBy: "system" | "ai" | "user"
  createdAt: string
  updatedAt: string
}
```

A WorkUnit Draft may be edited by the user.

However, editing a draft does not automatically approve external execution.

---

### 3.4 Reviewed WorkUnit

A Reviewed WorkUnit is a WorkUnit that a user has reviewed and accepted as meaningful.

This means the WorkUnit is valid as a unit of work.

It does not mean external actions are approved.

```ts
type ReviewedWorkUnit = {
  id: string
  tenantId: string
  sourceCandidateIds: string[]

  title: string
  situation: string
  problem: string
  actors: string[]

  urgency: number
  impact: number
  effort: number
  priorityScore: number

  nextAction: string
  tasks: string[]
  missingFields: string[]

  status: "reviewed"
  trustLevel: "reviewed"

  reviewedByUserId: string
  reviewedAt: string
  updatedAt: string
}
```

Reviewing a WorkUnit means:

* the user accepts the work item as relevant
* the user may continue editing it
* the WorkUnit may be used for planning and prioritization

Reviewing a WorkUnit does not mean:

* send an email
* post to Slack
* create a GitHub issue
* schedule a Calendar event
* perform any irreversible external operation

---

### 3.5 Action Preview

An Action Preview is a proposed external or internal action generated from a WorkUnit.

Examples:

* Slack reply draft
* Gmail reply draft
* GitHub issue draft
* Calendar event draft
* internal task draft

An Action Preview must show exactly what would happen before execution.

```ts
type ActionPreview = {
  id: string
  tenantId: string
  workUnitId: string

  actionType:
    | "internal_task"
    | "slack_reply"
    | "gmail_reply"
    | "github_issue"
    | "calendar_event"

  targetPreview: ActionTargetPreview
  payloadPreview: ActionPayloadPreview

  requiresApproval: boolean
  status: "preview"

  payloadHash: string
  targetHash: string

  createdAt: string
  expiresAt?: string
}
```

Action Preview content must be visible to the user before approval.

The user must be able to distinguish:

* editable workspace content
* AI suggestion
* external action payload
* approved execution payload

---

### 3.6 Approval Record

An Approval Record is a server-side record that proves a user approved a specific action payload for a specific target.

Approval is never a client-provided boolean.

```ts
type ActionApprovalRecord = {
  id: string
  tenantId: string
  workUnitId: string
  actionPreviewId: string

  actionType:
    | "slack_reply"
    | "gmail_reply"
    | "github_issue"
    | "calendar_event"

  targetHash: string
  payloadHash: string

  status:
    | "pending"
    | "approved"
    | "rejected"
    | "expired"
    | "used"

  approvedByUserId?: string
  createdAt: string
  approvedAt?: string
  expiresAt: string
  usedAt?: string
}
```

An approval is valid only when:

* tenantId matches
* workUnitId matches
* actionPreviewId matches
* targetHash matches
* payloadHash matches
* approval status is approved
* approval is not expired
* approval has not already been used
* actor has permission to approve the action

---

### 3.7 Execution Command

An Execution Command is a server-generated command created after approval verification.

It is the first object that may trigger an external side effect.

```ts
type ExecutionCommand = {
  id: string
  tenantId: string
  workUnitId: string
  approvalId: string

  actionType:
    | "slack_reply"
    | "gmail_reply"
    | "github_issue"
    | "calendar_event"

  resolvedTarget: ResolvedExternalTarget
  resolvedPayload: ResolvedExternalPayload

  idempotencyKey: string
  createdAt: string
}
```

Execution Commands must not be built directly from client input.

They must be built from:

* reviewed WorkUnit
* server-side integration config
* verified approval record
* immutable action preview hash

---

### 3.8 Execution Result

An Execution Result records the result of an internal or external action.

```ts
type ExecutionResult = {
  id: string
  tenantId: string
  workUnitId: string
  executionCommandId: string

  status:
    | "succeeded"
    | "failed"
    | "blocked"
    | "skipped"

  provider?: IntegrationProvider
  providerResultRef?: string

  safeMessage: string
  errorCode?: string

  executedAt: string
}
```

Execution Result must not expose provider secrets or sensitive raw response bodies to the client.

---

## 4. Trust Levels

WorkUnit OS uses explicit trust levels.

```txt
untrusted
  ↓
sanitized_candidate
  ↓
draft
  ↓
reviewed
  ↓
approved
  ↓
executed
```

Trust level rules:

| Trust Level           | Meaning                                  | Can trigger external action? |
| --------------------- | ---------------------------------------- | ---------------------------: |
| `untrusted`           | Raw external or user-provided source     |                           No |
| `sanitized_candidate` | Extracted and filtered signal            |                           No |
| `draft`               | Generated WorkUnit proposal              |                           No |
| `reviewed`            | User accepted as a valid WorkUnit        |                           No |
| `approved`            | Specific action payload approved by user |                 Not directly |
| `executed`            | Action has already been performed        |             Already happened |

Only a verified server-side `ExecutionCommand` may trigger an external side effect.

---

## 5. WorkUnit Lifecycle

The standard lifecycle is:

```txt
external_signal_received
  ↓
source_candidate_created
  ↓
workunit_draft_created
  ↓
workunit_reviewed
  ↓
action_preview_created
  ↓
action_approval_requested
  ↓
action_approved
  ↓
execution_command_created
  ↓
execution_completed
```

Failure states may occur at any point:

```txt
validation_failed
rbac_denied
tenant_boundary_violation
approval_required
approval_rejected
external_actions_disabled
execution_failed
```

---

## 6. State Transition Rules

### External Signal → Source Candidate

Allowed when:

* source content is parsed
* raw content is treated as untrusted
* sensitive fields are filtered or referenced safely
* prompt injection is not treated as instruction

Not allowed when:

* raw source content is directly copied into executable payload
* source identity is unknown
* tenant boundary is unclear

---

### Source Candidate → WorkUnit Draft

Allowed when:

* the candidate has enough context
* source references are preserved
* missing fields are explicitly marked
* generated content is marked as draft

Not allowed when:

* AI-generated output is treated as final truth
* missing information is silently invented
* source references are lost

---

### WorkUnit Draft → Reviewed WorkUnit

Allowed when:

* a user explicitly reviews or accepts the draft
* required fields are present or missing fields are acknowledged
* the WorkUnit belongs to the same tenant

Not allowed when:

* a draft is auto-promoted without user review
* tenant context is missing
* user lacks permission

---

### Reviewed WorkUnit → Action Preview

Allowed when:

* action payload is generated as preview only
* target is shown to the user
* payload is shown to the user
* external action remains disabled until approval

Not allowed when:

* preview creation performs the action
* target is hidden
* payload is hidden
* approval is assumed from frontend state

---

### Action Preview → Approval Record

Allowed when:

* the user has approval permission
* target hash and payload hash are created
* approval is stored server-side
* approval has an expiration time

Not allowed when:

* approval is represented only as `approvedByPm: true`
* approval comes from client-provided JSON
* payload or target can be changed after approval without invalidating the approval

---

### Approval Record → Execution Command

Allowed when:

* approval is valid
* approval has not expired
* approval has not been used
* actor has execution permission
* external action kill switch allows execution
* integration config is resolved server-side
* idempotency key is generated

Not allowed when:

* external actions are disabled
* approval is missing
* approval is stale
* integration config comes from the client
* payload hash does not match
* target hash does not match

---

## 7. Ownership and Tenant Model

Every major domain object must belong to a tenant.

Required tenant-bound objects:

* ExternalSignal
* SourceCandidate
* WorkUnitDraft
* ReviewedWorkUnit
* ActionPreview
* ActionApprovalRecord
* ExecutionCommand
* ExecutionResult
* AuditEvent
* TenantIntegration

Minimum tenant rule:

```txt
No object may be read, modified, approved, or executed across tenant boundaries.
```

If an object does not have a tenantId, it must not be used in production execution paths.

---

## 8. Actor and Permission Model

A user interacting with the system is represented as an Actor.

```ts
type Actor = {
  userId: string
  tenantId: string
  role: Role
}
```

Core roles:

```txt
owner
admin
pm
member
viewer
```

Core permissions:

```txt
workunit.read
workunit.create
workunit.review
workunit.approve_external_action
workunit.execute_external_action
integration.read
integration.manage
audit.read
```

No action should be authorized directly by role name in UI code.

All authorization should go through policy functions.

---

## 9. External Action Safety Rules

External actions are high-risk.

Examples:

* sending an email
* posting to Slack
* creating a GitHub issue
* creating a Calendar event

Rules:

1. External actions are disabled by default.
2. External action targets must not come from the client.
3. External action payloads must be previewed before approval.
4. Approval must be server-side.
5. Approval must bind target hash and payload hash.
6. Execution must use server-resolved tenant integration config.
7. Execution must have an idempotency key.
8. Execution result must be recorded.
9. Audit log must be written.
10. Client-provided `approvedByPm` must never authorize execution.
11. Client-provided `externalConfig` must never be trusted.

---

## 10. Action Field Model

The Action Field is not just a text input.

It is a structured work area attached to a WorkUnit.

The Action Field may contain:

* notes
* task breakdown
* draft reply
* decision memo
* meeting preparation
* issue draft
* schedule proposal
* missing information checklist

The Action Field must separate:

| Content Type             | Meaning                             |
| ------------------------ | ----------------------------------- |
| Workspace text           | User working notes                  |
| AI suggestion            | Generated proposal                  |
| External payload preview | Content that may be sent externally |
| Approved payload         | Payload bound to an approval record |
| Executed result          | Result of a completed action        |

The Action Field must never silently turn workspace text into an external execution payload.

---

## 11. Audit Model

Every security-relevant event should produce an audit event.

Important audit events:

* tool_request_received
* tool_request_validated
* tool_request_rejected
* workunit_draft_created
* workunit_reviewed
* action_preview_created
* approval_requested
* approval_granted
* approval_rejected
* external_action_blocked
* execution_command_created
* external_action_executed
* external_action_failed
* tenant_boundary_violation
* rbac_denied

Audit logs must not contain:

* OAuth tokens
* API keys
* raw email bodies
* raw Slack message bodies
* full document content
* stack traces
* environment variables

---

## 12. Error Model

Errors should be safe and predictable.

External API responses should use stable error codes.

Examples:

```txt
invalid_request
unauthorized
forbidden
tenant_boundary_violation
external_actions_disabled
approval_required
approval_expired
approval_used
integration_missing
rate_limited
internal_error
```

The client should receive safe error messages.

Detailed diagnostics should go to audit or internal logs only.

---

## 13. Non-Goals

The domain model does not define:

* pricing
* billing
* marketing pages
* sales copy
* payment provider integration
* real OAuth implementation
* database schema details

Those belong to separate documents.

This document defines the core WorkUnit OS domain and safety model.

---

## 14. Required Related Documents

This model should be expanded through the following documents:

* `ACTION_FIELD_SPEC.md`
* `API_CONTRACT.md`
* `ERROR_MODEL.md`
* `INTEGRATION_SPEC.md`
* `AUDIT_LOG_SPEC.md`
* `APPROVAL_FLOW_SPEC.md`
* `DATA_MODEL.md`
* `TESTING_STRATEGY.md`

Each related document must follow the top-level rules defined here.

In particular:

```txt
External input is untrusted.
AI output is not authority.
Frontend state is not authority.
Server-side policy is authority.
Approval is server-side.
Execution is server-side.
Audit is mandatory.
Tenant boundary is mandatory.
```
