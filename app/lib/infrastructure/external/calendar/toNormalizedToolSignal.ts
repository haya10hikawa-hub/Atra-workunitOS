/**
 * Calendar Event → NormalizedToolSignal Mapper
 */

import type { NormalizedToolSignal } from "../../../ports/toolSignal/types.ts"
import type { CalendarNormalizedEvent } from "./types.ts"

const ONE_DAY_MS = 86400_000

export type CalendarSignalMappingOptions = {
  now?: Date
}

// ─── Single Event ───────────────────────────────────────────────

export function calendarEventToNormalizedToolSignal(
  event: CalendarNormalizedEvent,
  options: CalendarSignalMappingOptions = {},
): NormalizedToolSignal {
  const priorityHint = defaultPriority(event, options.now ?? new Date())

  return {
    id: `signal:${event.id}`,
    tenantId: event.tenantId,
    provider: "calendar",
    signalType: "calendar_deadline",
    title: event.title,
    summary: event.summary,
    sourceUrl: event.url,
    actor: event.actor,
    assignee: event.assignee,
    priorityHint,
    createdAt: event.updatedAt,
    updatedAt: event.updatedAt,
    dueAt: event.dueAt,
  }
}

// ─── Batch ──────────────────────────────────────────────────────

export function calendarEventsToNormalizedToolSignals(
  events: CalendarNormalizedEvent[],
  options: CalendarSignalMappingOptions = {},
): NormalizedToolSignal[] {
  return events.map((event) => calendarEventToNormalizedToolSignal(event, options))
}

// ─── Helpers ────────────────────────────────────────────────────

function defaultPriority(
  event: CalendarNormalizedEvent,
  now: Date,
): NormalizedToolSignal["priorityHint"] {
  const dueMs = new Date(event.dueAt).getTime()
  const nowMs = now.getTime()
  if (!Number.isFinite(dueMs) || !Number.isFinite(nowMs)) return "medium"
  if (dueMs - nowMs <= 2 * ONE_DAY_MS) return "high"
  return "medium"
}
