import { toCanonicalLauncherItem, type CanonicalLauncherItem } from "../launcher/canonicalLauncherItem.ts"
import { projectCandidate } from "./candidateProjection.ts"
import { formWorkUnitCandidate } from "./workUnitCandidate.ts"

// Mirror the frozen C0 fixture without creating an application -> tests runtime dependency.
const fixture = Object.freeze({
  artifactClass: "VALIDATION_FIXTURE",
  dataset: { members: [
    { sourceId: "src-github-issue-207" },
    { sourceId: "src-github-pull-229" },
  ] },
  correlationGroup: {
    groupId: "group-work-001",
    memberSourceIds: ["src-github-issue-207", "src-github-pull-229"],
    ruleVersion: "c0.v1",
    reason: "fixture only",
  },
  candidate: {
    candidateId: "candidate-work-001",
    title: "Atra Phase-1 correlation work",
    contextSourceIds: [] as string[],
    missingInformation: [] as string[],
    humanReviewRequired: true,
  },
  projection: { summary: "Read-only candidate projection" },
} as const)

export type C0LauncherInputResult =
  | { readonly ok: true; readonly items: readonly CanonicalLauncherItem[] }
  | { readonly ok: false; readonly reason: "invalid_c0_validation_fixture" }

// Fail closed if the validation-only input no longer satisfies the canonical Candidate contract.
export function loadC0LauncherValidationInput(): C0LauncherInputResult {
  try {
    if (fixture.artifactClass !== "VALIDATION_FIXTURE" || fixture.candidate.humanReviewRequired !== true) {
      return { ok: false, reason: "invalid_c0_validation_fixture" }
    }
    const sourceIds = fixture.dataset.members.map((member) => member.sourceId)
    const candidate = formWorkUnitCandidate(
      fixture.correlationGroup,
      sourceIds,
      fixture.candidate.title,
      fixture.candidate.contextSourceIds,
      fixture.candidate.missingInformation,
    )
    if (candidate.candidateId !== fixture.candidate.candidateId) {
      return { ok: false, reason: "invalid_c0_validation_fixture" }
    }
    const item = toCanonicalLauncherItem(projectCandidate(candidate, fixture.projection.summary))
    return { ok: true, items: Object.freeze([item]) }
  } catch {
    return { ok: false, reason: "invalid_c0_validation_fixture" }
  }
}
