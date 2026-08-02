/**
 * GitHub Event → NormalizedToolSignal Mapper
 *
 * Converts GitHubNormalizedEvents into the existing NormalizedToolSignal
 * format, feeding the existing WorkUnit Inbox pipeline.
 */

import type { NormalizedToolSignal } from "../../../ports/toolSignal/types.ts"
import type { GitHubNormalizedEvent } from "./types.ts"

// ─── Single Event ───────────────────────────────────────────────

export function githubEventToNormalizedToolSignal(
  event: GitHubNormalizedEvent,
): NormalizedToolSignal {
  const signalType = mapEventType(event.eventType)
  const priorityHint = defaultPriority(event.eventType)

  return {
    id: `signal:${event.id}`,
    tenantId: event.tenantId,
    provider: "github",
    signalType,
    title: `PR #${event.number}: ${event.title}`,
    summary: buildSummary(event),
    sourceUrl: event.url,
    actor: event.actor,
    assignee: event.assignee,
    repository: event.repository,
    priorityHint,
    createdAt: event.updatedAt,
    updatedAt: event.updatedAt,
  }
}

// ─── Batch ──────────────────────────────────────────────────────

export function githubEventsToNormalizedToolSignals(
  events: GitHubNormalizedEvent[],
): NormalizedToolSignal[] {
  return events.map(githubEventToNormalizedToolSignal)
}

// ─── Helpers ────────────────────────────────────────────────────

function mapEventType(
  eventType: GitHubNormalizedEvent["eventType"],
): NormalizedToolSignal["signalType"] {
  switch (eventType) {
    case "pull_request_review_requested":
      return "github_pr_review_requested"
    case "issue_assigned":
      return "github_issue_assigned"
    case "issue_blocked":
      return "github_issue_blocked"
  }
}

function defaultPriority(
  eventType: GitHubNormalizedEvent["eventType"],
): NormalizedToolSignal["priorityHint"] {
  switch (eventType) {
    case "pull_request_review_requested":
      return "high"
    case "issue_assigned":
      return "medium"
    case "issue_blocked":
      return "high"
  }
}

function buildSummary(event: GitHubNormalizedEvent): string {
  switch (event.eventType) {
    case "pull_request_review_requested":
      return `PR #${event.number} in ${event.repository} is waiting for review`
    case "issue_assigned":
      return `${event.assignee ?? "You"} are assigned to issue #${event.number} in ${event.repository}`
    case "issue_blocked":
      return `Issue #${event.number} in ${event.repository} is blocked`
  }
}
