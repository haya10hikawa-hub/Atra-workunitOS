import type { SafeWorkUnitCandidate } from "../candidate/safeWorkUnitCandidate.ts"

export type CandidateProjection = {
  readonly candidateId: string
  readonly title: string
  readonly sourceIds: readonly string[]
  readonly summary: string
  readonly missingInformation: readonly string[]
  readonly humanReviewRequired: true
}

export function projectCandidate(candidate: SafeWorkUnitCandidate): CandidateProjection {
  return Object.freeze({
    candidateId: candidate.candidateId,
    title: candidate.title,
    sourceIds: Object.freeze([...candidate.evidenceSourceIds]),
    summary: candidate.summary,
    missingInformation: Object.freeze([...candidate.missingInformation]),
    humanReviewRequired: true,
  })
}
