/**
 * WorkUnit Inbox Types
 *
 * Owns the inbox WorkUnit projection model. The normalized signal family is
 * declared by the provider-ingress port at app/lib/ports/toolSignal/types.ts;
 * the re-export below is a type-only compatibility surface for existing
 * consumers, never a second declaration.
 */

import type { NormalizedToolProvider, WorkUnitPriority } from "../../ports/toolSignal/types.ts"

export type {
  NormalizedToolProvider,
  NormalizedToolSignalType,
  WorkUnitPriority,
  NormalizedToolSignal,
} from "../../ports/toolSignal/types.ts"

// ─── Inbox WorkUnit ─────────────────────────────────────────────

export type InboxWorkUnitKind =
  | "missed_response"
  | "review_waiting"
  | "blocker"
  | "deadline"
  | "assigned_issue"

export type InboxWorkUnitStatus =
  | "open"
  | "useful"
  | "not_useful"
  | "later"
  | "done"

export type InboxWorkUnit = {
  id: string
  signalId: string
  tenantId: string
  title: string
  kind: InboxWorkUnitKind
  priority: WorkUnitPriority
  sourceProvider: NormalizedToolProvider
  reason: string
  evidence: string
  nextAction: string
  sourceUrl?: string
  actor?: string
  assignee?: string
  repository?: string
  dueAt?: string
  createdAt: string
  status: InboxWorkUnitStatus
}
