import test from "node:test"
import assert from "node:assert/strict"
import {
  createCorrectionRecord,
  measureOriginalPrediction,
  type HumanJudgment,
} from "../app/lib/application/phase1/correctionMeasurement.ts"
import type { GroupMembership } from "../app/lib/application/phase1/c0Evaluation.ts"

const judgment: HumanJudgment = { sameReferent: true, relatedContextExcluded: true, understandable: true }
const gold: GroupMembership[] = [{ groupId: "gold-a", sourceIds: ["a", "b"] }, { groupId: "gold-b", sourceIds: ["c"] }]
const grouped: GroupMembership[] = [{ groupId: "pred-a", sourceIds: ["a", "b"] }, { groupId: "pred-c", sourceIds: ["c"] }]
const measure = (originalPrediction: readonly GroupMembership[], answers = judgment) => measureOriginalPrediction({
  measurementId: "measurement-1", datasetId: "dataset-1", goldSetId: "gold-1", gold, originalPrediction, judgment: answers,
})

test("correction records preserve the original machine output for every action", () => {
  const original = structuredClone(grouped)
  for (const action of ["accept", "remove-member", "split", "merge"] as const) {
    const correction = createCorrectionRecord({ correctionId: `correction-${action}`, candidateId: "candidate-1", actorId: "human-1", action, sourceId: "b", groupIds: ["pred-a"], reason: "human fact" })
    assert.equal(correction.action, action)
    assert.deepEqual(grouped, original)
  }
})

test("measurement captures original errors, judgment, and exact pass formula", () => {
  assert.equal(measure(grouped).pass, true)
  assert.deepEqual(measure([{ groupId: "pred-a", sourceIds: ["a", "b", "c"] }]).falseMergePairs, ["a|c", "b|c"])
  assert.deepEqual(measure([{ groupId: "pred-a", sourceIds: ["a"] }, { groupId: "pred-b", sourceIds: ["b"] }, { groupId: "pred-c", sourceIds: ["c"] }]).falseSplitPairs, ["a|b"])
  for (const key of ["sameReferent", "relatedContextExcluded", "understandable"] as const) assert.equal(measure(grouped, { ...judgment, [key]: false }).pass, false)
})

test("unassigned sources follow frozen pair semantics", () => {
  const sameGold = [{ groupId: "gold-a", sourceIds: ["a", "b"] }]
  const differentGold = [{ groupId: "gold-a", sourceIds: ["a"] }, { groupId: "gold-b", sourceIds: ["b"] }]
  const common = { measurementId: "m", datasetId: "d", goldSetId: "g", originalPrediction: [] as GroupMembership[], judgment }
  assert.deepEqual(measureOriginalPrediction({ ...common, gold: sameGold }).falseSplitPairs, ["a|b"])
  assert.deepEqual(measureOriginalPrediction({ ...common, gold: differentGold }).falseMergePairs, [])
})

test("gold and measurement values are not changed by correction or later input mutation", () => {
  const before = structuredClone(gold)
  const event = measure(grouped)
  createCorrectionRecord({ correctionId: "c", candidateId: "candidate-1", actorId: "human-1", action: "remove-member", sourceId: "b", reason: "wrong member" })
  assert.deepEqual(gold, before)
  assert.equal(Object.isFrozen(event), true)
  assert.equal(measure(grouped).pass, measure(grouped).pass)
})

test("correction content does not change measurement pass", () => {
  const first = measure(grouped)
  const second = measure(grouped)
  createCorrectionRecord({ correctionId: "accept", candidateId: "candidate-1", actorId: "human-1", action: "accept", reason: "accepted" })
  createCorrectionRecord({ correctionId: "split", candidateId: "candidate-1", actorId: "human-1", action: "split", groupId: "pred-a", reason: "split fact" })
  assert.equal(first.pass, second.pass)
  assert.deepEqual(first, second)
})
