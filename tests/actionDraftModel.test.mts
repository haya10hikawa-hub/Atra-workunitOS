import test from "node:test"
import assert from "node:assert/strict"
import { buildActionDrafts } from "../app/lib/application/actionField/actionDraftModel.ts"
import { detectToolRequirements } from "../app/lib/application/actionField/toolRequirementModel.ts"
import type { InboxWorkUnit } from "../app/lib/application/workunitInbox/types.ts"

function wu(overrides: Partial<InboxWorkUnit> = {}): InboxWorkUnit {
  return {
    id: "wu:1", signalId: "s:1", tenantId: "t1", title: "Test", kind: "review_waiting",
    priority: "high", sourceProvider: "github", reason: "test", evidence: "ev",
    nextAction: "Review code", sourceUrl: "", actor: "alice", repository: "acme/api",
    createdAt: "2026-01-01", status: "open",
    ...overrides,
  } as InboxWorkUnit
}

test("builds drafts for required tools", () => {
  const w = wu({ sourceProvider: "slack" })
  const req = detectToolRequirements(w)
  const drafts = buildActionDrafts(w, req.allRequired)
  assert.ok(drafts.drafts.length >= 1)
})

test("Slack draft has editable message field", () => {
  const r = detectToolRequirements(wu({ sourceProvider: "slack" }))
  const drafts = buildActionDrafts(wu({ sourceProvider: "slack" }), [r.slack])
  const draft = drafts.drafts.find((d) => d.tool === "slack")
  assert.ok(draft)
  assert.ok(draft!.editableFields.some((f) => f.key === "message"))
})

test("GitHub draft has editable title/body", () => {
  const r = detectToolRequirements(wu({ sourceProvider: "github", kind: "blocker", repository: "acme/api" }))
  const drafts = buildActionDrafts(wu({ sourceProvider: "github", kind: "blocker", repository: "acme/api" }), [r.github])
  const draft = drafts.drafts.find((d) => d.tool === "github")
  assert.ok(draft)
  assert.ok(draft!.editableFields.some((f) => f.key === "issue_title"))
  assert.ok(draft!.editableFields.some((f) => f.key === "issue_body"))
})

test("Email draft has editable subject/body/recipients", () => {
  const emailWorkUnit = wu({ sourceProvider: "github", nextAction: "Email the customer" })
  const r = detectToolRequirements(emailWorkUnit)
  const drafts = buildActionDrafts(emailWorkUnit, [r.email])
  const draft = drafts.drafts.find((d) => d.tool === "email")
  assert.ok(draft)
  assert.ok(draft!.editableFields.some((f) => f.key === "subject"))
  assert.ok(draft!.editableFields.some((f) => f.key === "body"))
})

test("Database draft includes safety notes", () => {
  const databaseWorkUnit = wu({ sourceProvider: "github", nextAction: "Upsert the project record" })
  const r = detectToolRequirements(databaseWorkUnit)
  const drafts = buildActionDrafts(databaseWorkUnit, [r.database])
  const draft = drafts.drafts.find((d) => d.tool === "database")
  assert.ok(draft, "Database draft should exist")
  assert.ok(draft!.safetyNotes.length >= 2, `Got ${draft?.safetyNotes.length} notes: ${JSON.stringify(draft?.safetyNotes)}`)
})

test("forbidden fields never in drafts", () => {
  const r = detectToolRequirements(wu({ sourceProvider: "slack" }))
  const drafts = buildActionDrafts(wu({ sourceProvider: "slack" }), r.allRequired)
  const json = JSON.stringify(drafts)
  for (const forbidden of ["approvalId", "targetHash", "payloadHash", "tenantId", "userId", "approvedByUserId", "usedAt", "token", "secret"]) {
    assert.equal(json.includes(forbidden), false, `draft contains ${forbidden}`)
  }
})
