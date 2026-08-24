export type GroupMembership = { readonly groupId: string; readonly sourceIds: readonly string[] }
export type PairErrorResult = { readonly falseMergePairs: readonly string[]; readonly falseSplitPairs: readonly string[] }

const pair = (left: string, right: string): string => [left, right].sort().join("|")

export function calculatePairErrors(
  gold: readonly GroupMembership[], predicted: readonly GroupMembership[],
): PairErrorResult {
  const goldBySource = new Map(gold.flatMap((group) => group.sourceIds.map((id) => [id, group.groupId] as const)))
  const predictedBySource = new Map(predicted.flatMap((group) => group.sourceIds.map((id) => [id, group.groupId] as const)))
  const sources = [...goldBySource.keys()].sort()
  const falseMergePairs: string[] = []
  const falseSplitPairs: string[] = []
  for (let i = 0; i < sources.length; i++) for (let j = i + 1; j < sources.length; j++) {
    const key = pair(sources[i], sources[j])
    const leftPredictedGroup = predictedBySource.get(sources[i])
    const rightPredictedGroup = predictedBySource.get(sources[j])
    const predictedSame = leftPredictedGroup !== undefined
      && rightPredictedGroup !== undefined
      && leftPredictedGroup === rightPredictedGroup
    if (predictedSame
      && goldBySource.get(sources[i]) !== goldBySource.get(sources[j])) falseMergePairs.push(key)
    if (goldBySource.get(sources[i]) === goldBySource.get(sources[j])
      && !predictedSame) falseSplitPairs.push(key)
  }
  return Object.freeze({ falseMergePairs, falseSplitPairs })
}
