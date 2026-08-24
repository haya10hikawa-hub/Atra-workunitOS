import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import path from "node:path"
import { formWorkUnitCandidate } from "../app/lib/application/phase1/workUnitCandidate.ts"
import { projectCandidate } from "../app/lib/application/phase1/candidateProjection.ts"

const root = fileURLToPath(new URL("../", import.meta.url))
const fixture = JSON.parse(await readFile(path.join(root, "tests/fixtures/phase1/c0.v1.json"), "utf8"))
const validSourceIds = fixture.dataset.members.map((member: { sourceId: string }) => member.sourceId)

function formFixtureCandidate() {
  return formWorkUnitCandidate(
    fixture.correlationGroup,
    validSourceIds,
    fixture.candidate.title,
    fixture.candidate.contextSourceIds,
    fixture.candidate.missingInformation,
  )
}

test("forms the canonical P1-3 candidate and projects the frozen C0 fixture", () => {
  const candidate = formFixtureCandidate()
  const before = structuredClone(candidate)
  const projection = projectCandidate(candidate, fixture.projection.summary)

  assert.equal(projection.candidateId, candidate.candidateId)
  assert.equal(projection.title, candidate.title)
  assert.deepEqual(projection.sourceIds, candidate.evidenceSourceIds)
  assert.deepEqual(projection.missingInformation, candidate.missingInformation)
  assert.equal(projection.humanReviewRequired, candidate.humanReviewRequired)
  assert.equal(projection.summary, fixture.projection.summary)
  assert.deepEqual(projection, fixture.projection)
  assert.deepEqual(candidate, before)
  assert.deepEqual(candidate.evidenceSourceIds, fixture.correlationGroup.memberSourceIds)
  assert.deepEqual(projectCandidate(candidate, fixture.projection.summary), projection)
})

test("projection summary is explicit and cannot mutate the candidate", () => {
  const candidate = formFixtureCandidate()
  const before = structuredClone(candidate)
  projectCandidate(candidate, "another read-only summary")
  assert.deepEqual(candidate, before)
})

test("projection preserves evidence then context membership without scalar collapse", () => {
  const candidate = {
    ...formFixtureCandidate(),
    evidenceSourceIds: Object.freeze(["evidence-2", "evidence-1"]),
    contextSourceIds: Object.freeze(["context-2", "context-1"]),
  }
  assert.deepEqual(
    projectCandidate(candidate, "explicit summary").sourceIds,
    ["evidence-2", "evidence-1", "context-2", "context-1"],
  )
})

test("unknown membership fails in P1-3 before projection", () => {
  assert.throws(() =>
    formWorkUnitCandidate(
      { ...fixture.correlationGroup, memberSourceIds: [...fixture.correlationGroup.memberSourceIds, "unknown"] },
      validSourceIds,
      fixture.candidate.title,
    ),
  )
})
