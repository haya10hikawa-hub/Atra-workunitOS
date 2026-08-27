/**
 * Adapter: server InboxWorkUnit -> SafeWorkUnitCandidate.
 *
 * This is the Launcher's real-read counterpart to `candidateWorkUnitBridge`,
 * which performs the same job for mock/manual NormalizedToolSignal fixtures.
 * Both funnel through the SAME safety chokepoint — `projectSafeWorkUnitCandidate`
 * — so the Launcher can never consume a server row directly.
 *
 * Safety properties:
 *   - Reads only display-safe fields off the server row.
 *   - The allowlist projection drops everything else, so `tenantId`, `signalId`,
 *     `sourceUrl`, `dueAt`, `createdAt` and any forbidden/unknown server-owned
 *     field cannot reach Launcher state.
 *   - The projection is NOT widened here. `sourceUrl` stays dropped; StartHub
 *     source-jump wiring is a separate vertical slice.
 *   - Pure: no fetch, no provider call, no persistence, no execution.
 */

import type { InboxWorkUnit, InboxWorkUnitKind, NormalizedToolProvider } from "../workunitInbox/types.ts"
import {
  projectSafeWorkUnitCandidate,
  type SafeWorkUnitCandidate,
} from "../candidate/safeWorkUnitCandidate.ts"

/**
 * Project one server WorkUnit into a candidate-only, allowlisted record.
 *
 * The raw record below is deliberately built field-by-field and then passed
 * through the allowlist projection: spreading the server row here would defeat
 * the boundary even though the projection would still drop the extra keys.
 */
export function inboxWorkUnitToSafeCandidate(workUnit: InboxWorkUnit): SafeWorkUnitCandidate {
  const sourceLabel = providerLabel(workUnit.sourceProvider)
  const kindLabel = kindToLabel(workUnit.kind)
  const summary = firstNonEmpty(
    [workUnit.reason, workUnit.evidence, workUnit.nextAction],
    "Safe inbox signal is available.",
  )
  const nextStep = firstNonEmpty([workUnit.nextAction], defaultNextStep(workUnit.kind))
  return projectSafeWorkUnitCandidate({
    id: workUnit.id,
    title: firstNonEmpty([workUnit.title], "Untitled WorkUnit"),
    summary,
    source: sourceLabel,
    sourceDetail: `${sourceLabel} · ${kindLabel}`,
    status: deriveStatus(workUnit),
    roi: deriveRoi(workUnit),
    urgency: deriveUrgency(workUnit.priority),
    nextStep,
    objective: `Review this ${kindLabel} and decide the next PM-owned step.`,
    priority: workUnit.priority,
    ownerLabel: firstNonEmpty(
      [workUnit.assignee, workUnit.actor, workUnit.repository],
      "PM",
    ),
    kind: kindLabel,
    candidateType: "work_unit_candidate",
    evidenceSummary: firstNonEmpty([workUnit.evidence, workUnit.reason], summary),
    graph: {
      rootLabel: workUnit.title,
      nodes: [
        { id: "source", label: `${sourceLabel} source`, groupId: "sources", relation: "origin" },
        { id: "evidence", label: clip(summary), groupId: "evidence", relation: "supports" },
        { id: "next-step", label: nextStep, groupId: "subtasks", relation: "proposed" },
      ],
    },
    actionFieldDraft: {
      title: workUnit.title,
      objective: `Decide the next PM-owned step for: ${workUnit.title}`,
      body: [
        `## Candidate summary`,
        summary,
        ``,
        `## Proposed next step (candidate only)`,
        nextStep,
        ``,
        `_Human review required. This is a candidate draft, not a formal node, approval, or execution._`,
      ].join("\n"),
      editableLabel: "AI-generated draft — editable",
      verificationState:
        "Local draft only. Human review required. Preview and approval remain outside this phase.",
    },
    // Forced literal true by the projection; declared here for readability only.
    humanReviewRequired: true,
    candidateOnly: true,
  })
}

export function inboxWorkUnitsToSafeCandidates(
  workUnits: readonly InboxWorkUnit[],
): SafeWorkUnitCandidate[] {
  return workUnits.map(inboxWorkUnitToSafeCandidate)
}

function providerLabel(provider: NormalizedToolProvider): string {
  if (provider === "github") return "GitHub"
  if (provider === "slack") return "Slack"
  if (provider === "calendar") return "Calendar"
  return "Team"
}

function kindToLabel(kind: InboxWorkUnitKind): string {
  return kind.replace(/_/g, " ")
}

function deriveStatus(workUnit: InboxWorkUnit): string {
  if (workUnit.status === "done" || workUnit.status === "useful") return "READY"
  if (workUnit.status === "later") return "DRAFT"
  if (workUnit.status === "not_useful") return "BLOCKED"
  if (workUnit.kind === "blocker") return "BLOCKED"
  if (workUnit.kind === "missed_response" || workUnit.kind === "review_waiting") return "NEEDS REVIEW"
  return "READY"
}

function deriveUrgency(priority: InboxWorkUnit["priority"]): string {
  if (priority === "high") return "High impact"
  if (priority === "low") return "Low impact"
  return "Normal priority"
}

/** Same 0–10 display scale the candidate bridge emits, keyed on the inbox kind. */
function deriveRoi(workUnit: InboxWorkUnit): number {
  const base = workUnit.priority === "high" ? 9 : workUnit.priority === "low" ? 6.2 : 7.6
  const bonus = workUnit.kind === "review_waiting" ? 0.4 : workUnit.kind === "blocker" ? 0.3 : 0
  return Number((base + bonus).toFixed(1))
}

function defaultNextStep(kind: InboxWorkUnitKind): string {
  switch (kind) {
    case "review_waiting":
      return "Review the changes and leave sign-off comments"
    case "assigned_issue":
      return "Scope the issue and plan the implementation"
    case "blocker":
      return "Identify the blocker owner and unblock the dependency"
    case "missed_response":
      return "Reply to the request or delegate the next action"
    case "deadline":
      return "Prepare the deliverable before the deadline"
    default:
      return "Review and decide the next step"
  }
}

function firstNonEmpty(values: readonly (string | undefined)[], fallback: string): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") return value
  }
  return fallback
}

function clip(value: string, max = 80): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}
