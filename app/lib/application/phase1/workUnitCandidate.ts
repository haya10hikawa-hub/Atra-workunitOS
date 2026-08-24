export type CorrelationGroup = {
  readonly groupId: string
  readonly memberSourceIds: readonly string[]
  readonly ruleVersion: string
  readonly reason?: string
}

export type WorkUnitCandidate = {
  readonly candidateId: string
  readonly correlationGroupId: string
  readonly evidenceSourceIds: readonly string[]
  readonly contextSourceIds: readonly string[]
  readonly title: string
  readonly missingInformation: readonly string[]
  readonly humanReviewRequired: true
}

export function formWorkUnitCandidate(
  group: CorrelationGroup,
  validSourceIds: readonly string[],
  title: string,
  contextSourceIds: readonly string[] = [],
  missingInformation: readonly string[] = [],
): WorkUnitCandidate {
  const valid = new Set(validSourceIds)
  const unknown = [...group.memberSourceIds, ...contextSourceIds].filter((id) => !valid.has(id))
  if (!group.groupId || !group.ruleVersion || group.memberSourceIds.length === 0 || unknown.length > 0) {
    throw new Error("CorrelationGroup contains invalid candidate source membership")
  }
  return Object.freeze({
    candidateId: group.groupId.replace(/^group-/, "candidate-"),
    correlationGroupId: group.groupId,
    evidenceSourceIds: Object.freeze([...group.memberSourceIds]),
    contextSourceIds: Object.freeze([...contextSourceIds]),
    title,
    missingInformation: Object.freeze([...missingInformation]),
    humanReviewRequired: true as const,
  })
}
