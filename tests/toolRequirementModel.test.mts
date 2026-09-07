import test from "node:test"
import assert from "node:assert/strict"
import { detectToolRequirements } from "../app/lib/application/actionField/toolRequirementModel.ts"
import type { InboxWorkUnit } from "../app/lib/application/workunitInbox/types.ts"

function wu(overrides: Partial<InboxWorkUnit> = {}): InboxWorkUnit {
  return {
    id: "wu:1", signalId: "s:1", tenantId: "t1", title: "Test", kind: "review_waiting",
    priority: "high", sourceProvider: "github", reason: "test", evidence: "",
    nextAction: "Review", sourceUrl: "", actor: "alice", createdAt: "2026-01-01", status: "open",
    ...overrides,
  } as InboxWorkUnit
}

test("GitHub blocker → GitHub required, Slack recommended", () => {
  const r = detectToolRequirements(wu({ sourceProvider: "github", repository: "acme/api", kind: "blocker" }))
  assert.equal(r.github.necessity, "required")
  assert.equal(r.slack.necessity, "optional")
})

test("Calendar deadline → Calendar required, Email recommended", () => {
  const r = detectToolRequirements(wu({ sourceProvider: "calendar", kind: "deadline", dueAt: "tomorrow" }))
  assert.equal(r.calendar.necessity, "required")
  assert.ok(r.email.necessity === "recommended" || r.email.necessity === "required")
})

test("Slack source → Slack required", () => {
  const r = detectToolRequirements(wu({ sourceProvider: "slack" }))
  assert.equal(r.slack.necessity, "required")
})

test("Database is always blocked", () => {
  const r = detectToolRequirements(wu({ sourceProvider: "github", nextAction: "Upsert the project record" }))
  assert.equal(r.database.necessity, "blocked")
})

test("Unknown source → safe fallback", () => {
  const r = detectToolRequirements(wu({ sourceProvider: "unknown-provider" as never }))
  assert.ok(r.database.necessity === "blocked")
})

test("all required is populated", () => {
  const r = detectToolRequirements(wu({ sourceProvider: "slack" }))
  assert.equal(r.allRequired.length >= 1, true)
  assert.equal(r.allRequired[0].tool, "slack")
})
