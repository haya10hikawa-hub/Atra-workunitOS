import { calculatePairErrors, type GroupMembership } from "./c0Evaluation.ts"

export type CorrectionAction = "accept" | "merge" | "split" | "remove-member"
export type HumanJudgment = Readonly<{
  sameReferent: boolean
  relatedContextExcluded: boolean
  understandable: boolean
}>

export type CorrectionRecord = Readonly<{
  correctionId: string
  candidateId: string
  actorId: string
  action: CorrectionAction
  sourceId?: string
  sourceIds?: readonly string[]
  groupId?: string
  groupIds?: readonly string[]
  reason: string
}>

export type MeasurementEvent = Readonly<{
  measurementId: string
  datasetId: string
  goldSetId: string
  predictedGroupIds: readonly string[]
  falseMergePairs: readonly string[]
  falseSplitPairs: readonly string[]
  judgment: HumanJudgment
  pass: boolean
}>

const frozen = <T extends object>(value: T): T => Object.freeze(value)

export function createCorrectionRecord(input: CorrectionRecord): CorrectionRecord {
  return frozen({
    ...input,
    ...(input.sourceIds ? { sourceIds: frozen([...input.sourceIds]) } : {}),
    ...(input.groupIds ? { groupIds: frozen([...input.groupIds]) } : {}),
  })
}

export function measureOriginalPrediction(input: {
  measurementId: string
  datasetId: string
  goldSetId: string
  gold: readonly GroupMembership[]
  originalPrediction: readonly GroupMembership[]
  judgment: HumanJudgment
}): MeasurementEvent {
  const errors = calculatePairErrors(input.gold, input.originalPrediction)
  const judgment = frozen({ ...input.judgment })
  return frozen({
    measurementId: input.measurementId,
    datasetId: input.datasetId,
    goldSetId: input.goldSetId,
    predictedGroupIds: frozen(input.originalPrediction.map(({ groupId }) => groupId)),
    falseMergePairs: frozen([...errors.falseMergePairs]),
    falseSplitPairs: frozen([...errors.falseSplitPairs]),
    judgment,
    pass: errors.falseMergePairs.length === 0
      && errors.falseSplitPairs.length === 0
      && judgment.sameReferent
      && judgment.relatedContextExcluded
      && judgment.understandable,
  })
}
