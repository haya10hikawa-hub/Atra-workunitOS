import type { CandidateProjection } from "../phase1/candidateProjection.ts"

export type CanonicalLauncherItem = CandidateProjection & {
  readonly presentationKind: "canonical_candidate"
  readonly sourceInspection: {
    readonly status: "blocked"
    readonly reason: "source_locator_not_projected"
  }
}

// Keep the canonical Launcher contract narrower than the legacy mock presentation shape.
export function toCanonicalLauncherItem(projection: CandidateProjection): CanonicalLauncherItem {
  return Object.freeze({
    presentationKind: "canonical_candidate" as const,
    candidateId: projection.candidateId,
    title: projection.title,
    summary: projection.summary,
    sourceIds: Object.freeze([...projection.sourceIds]),
    missingInformation: Object.freeze([...projection.missingInformation]),
    humanReviewRequired: projection.humanReviewRequired,
    sourceInspection: Object.freeze({
      status: "blocked" as const,
      reason: "source_locator_not_projected" as const,
    }),
  })
}
