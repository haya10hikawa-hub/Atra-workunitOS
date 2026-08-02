/**
 * Slack Event → NormalizedToolSignal Mapper
 */

import type { NormalizedToolSignal } from "../../../ports/toolSignal/types.ts"
import type { SlackNormalizedEvent } from "./types.ts"

// ─── Single Event ───────────────────────────────────────────────

export function slackEventToNormalizedToolSignal(
  event: SlackNormalizedEvent,
): NormalizedToolSignal {
  const priorityHint = defaultPriority(event.eventType)

  return {
    id: `signal:${event.id}`,
    tenantId: event.tenantId,
    provider: "slack",
    signalType: "slack_mention_request",
    title: event.title,
    summary: event.summary,
    sourceUrl: event.url,
    actor: event.actor,
    assignee: event.assignee,
    priorityHint,
    createdAt: event.updatedAt,
    updatedAt: event.updatedAt,
  }
}

// ─── Batch ──────────────────────────────────────────────────────

export function slackEventsToNormalizedToolSignals(
  events: SlackNormalizedEvent[],
): NormalizedToolSignal[] {
  return events.map(slackEventToNormalizedToolSignal)
}

// ─── Helpers ────────────────────────────────────────────────────

function defaultPriority(
  eventType: SlackNormalizedEvent["eventType"],
): NormalizedToolSignal["priorityHint"] {
  switch (eventType) {
    case "decision_request":
      return "high"
    case "mention_request":
      return "high"
    case "thread_needs_reply":
      return "medium"
  }
}
