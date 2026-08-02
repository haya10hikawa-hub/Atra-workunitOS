/**
 * Normalized Tool Signal Port
 *
 * Provider-ingress port contract, and the sole declaration site of the
 * normalized signal family. Provider adapters under
 * app/lib/infrastructure/external/** depend downward on this port instead of
 * upward on the application layer.
 *
 * Boundaries recorded by WU-02, none of them incidental:
 *
 * - Not domain truth. This is the shape provider adapters emit at the read
 *   boundary; nothing correlates, validates or persists it.
 * - Not SourceRecordV1, and unrelated to it: no alias, no subtype, no
 *   conversion. The two differ on identity, validation, integrity, temporal
 *   semantics, provider vocabulary, tenant type and mutability.
 * - `tenantId` is deliberately `string`, not the branded canonical `TenantId`.
 *   Every provider event declares `tenantId: string` and every mapper copies it
 *   through unvalidated, so branding here would assert a guarantee this
 *   boundary does not make. Assigned to a later WorkUnit, not omitted.
 * - `priorityHint` is an application-owned interpretation, not a provider fact:
 *   no provider states it, every mapper computes it. WU-02 relocates it
 *   unchanged and decides nothing about its ownership.
 *
 * This module imports nothing and declares no runtime value.
 */

// ─── Providers ──────────────────────────────────────────────────

export type NormalizedToolProvider = "github" | "slack" | "calendar"

export type NormalizedToolSignalType =
  | "github_pr_review_requested"
  | "github_issue_assigned"
  | "github_issue_blocked"
  | "slack_mention_request"
  | "calendar_deadline"

// ─── Signal ─────────────────────────────────────────────────────

export type WorkUnitPriority = "low" | "medium" | "high"

export type NormalizedToolSignal = {
  id: string
  tenantId: string
  provider: NormalizedToolProvider
  signalType: NormalizedToolSignalType
  title: string
  summary: string
  sourceUrl?: string
  actor?: string
  assignee?: string
  repository?: string
  priorityHint?: WorkUnitPriority
  dueAt?: string
  createdAt: string
  updatedAt: string
}
