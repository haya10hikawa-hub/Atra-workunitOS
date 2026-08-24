import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import path from "node:path"
import { calculatePairErrors } from "../app/lib/application/phase1/c0Evaluation.ts"

const root = fileURLToPath(new URL("../", import.meta.url))
const fixture = JSON.parse(await readFile(path.join(root, "tests/fixtures/phase1/c0.v1.json"), "utf8"))
const sourceIds = fixture.dataset.members.map((member: { sourceId: string }) => member.sourceId)

test("C0 fixture is frozen, ordered, and explicitly non-admissible", () => {
  assert.equal(fixture.contractVersion, "c0.v1")
  assert.equal(fixture.artifactClass, "VALIDATION_FIXTURE")
  assert.equal(fixture.admissibility.status, "BLOCKED")
  assert.deepEqual(sourceIds, ["src-github-issue-207", "src-github-pull-229"])
  assert.equal(new Set(sourceIds).size, sourceIds.length)
  assert.equal(fixture.admissibility.independentProviderCount, 1)
})

test("gold, groups, candidate, projection, correction, and measurement use frozen IDs", () => {
  const memberSet = new Set(sourceIds)
  const gold = fixture.goldSet.groups[0]
  assert.equal(fixture.goldSet.labelsFrozen, true)
  assert.ok(gold.memberSourceIds.every((id: string) => memberSet.has(id)))
  assert.deepEqual(fixture.correlationGroup.memberSourceIds, [...new Set(fixture.correlationGroup.memberSourceIds)].sort())
  assert.equal(fixture.candidate.correlationGroupId, fixture.correlationGroup.groupId)
  assert.ok(fixture.candidate.evidenceSourceIds.every((id: string) => memberSet.has(id)))
  assert.deepEqual(fixture.candidate.evidenceSourceIds, fixture.correlationGroup.memberSourceIds)
  assert.deepEqual(fixture.projection.sourceIds, fixture.candidate.evidenceSourceIds)
  assert.equal(fixture.projection.candidateId, fixture.candidate.candidateId)
  assert.ok(memberSet.has(fixture.correction.sourceId))
  assert.equal(fixture.measurement.datasetId, fixture.dataset.datasetId)
  assert.equal(fixture.measurement.goldSetId, fixture.goldSet.goldSetId)
})

test("false merge and false split calculations are deterministic", () => {
  const gold = [{ groupId: "g1", sourceIds }]
  assert.deepEqual(calculatePairErrors(gold, [{ groupId: "p1", sourceIds }]), { falseMergePairs: [], falseSplitPairs: [] })
  assert.deepEqual(calculatePairErrors(gold, [{ groupId: "p1", sourceIds: [sourceIds[0]] }, { groupId: "p2", sourceIds: [sourceIds[1]] }]), { falseMergePairs: [], falseSplitPairs: [sourceIds.slice().sort().join("|")] })
  assert.deepEqual(calculatePairErrors([{ groupId: "g1", sourceIds: [sourceIds[0]] }, { groupId: "g2", sourceIds: [sourceIds[1]] }], [{ groupId: "p1", sourceIds }]), { falseMergePairs: [sourceIds.slice().sort().join("|")], falseSplitPairs: [] })
})
