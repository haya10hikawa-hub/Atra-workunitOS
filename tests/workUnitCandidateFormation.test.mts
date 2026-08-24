import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import path from "node:path"
import { formWorkUnitCandidate } from "../app/lib/application/phase1/workUnitCandidate.ts"

const root = fileURLToPath(new URL("../", import.meta.url))
const fixture = JSON.parse(await readFile(path.join(root, "tests/fixtures/phase1/c0.v1.json"), "utf8"))
const group = fixture.correlationGroup
const validSourceIds = fixture.dataset.members.map((member: { sourceId: string }) => member.sourceId)

test("forms the frozen C0 group into a deterministic candidate", () => {
  const candidate = formWorkUnitCandidate(group, validSourceIds, fixture.candidate.title)
  assert.deepEqual(candidate, fixture.candidate)
  assert.equal(candidate.candidateId, "candidate-work-001")
  assert.equal(candidate.correlationGroupId, group.groupId)
  assert.deepEqual(candidate.evidenceSourceIds, group.memberSourceIds)
  assert.deepEqual(formWorkUnitCandidate(group, validSourceIds, fixture.candidate.title), candidate)
  assert.equal(candidate.humanReviewRequired, true)
  assert.ok(Object.isFrozen(candidate))
})

test("rejects unknown group or context source IDs", () => {
  assert.throws(() => formWorkUnitCandidate({ ...group, memberSourceIds: [...group.memberSourceIds, "unknown"] }, validSourceIds, "x"))
  assert.throws(() => formWorkUnitCandidate(group, validSourceIds, "x", ["unknown"]))
})

test("candidate has no approval or execution authority fields", () => {
  const candidate = formWorkUnitCandidate(group, validSourceIds, "x", [validSourceIds[0]])
  for (const field of ["approvalId", "approvedBy", "execution", "reviewedWorkUnitId", "payload"]) {
    assert.equal(Object.hasOwn(candidate, field), false)
  }
  assert.deepEqual(candidate.contextSourceIds, [validSourceIds[0]])
})
