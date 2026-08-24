/**
 * Adapter: SafeWorkUnitCandidate -> LauncherWorkUnit.
 *
 * The launcher UI consumes LauncherWorkUnit. This adapter maps candidate-only
 * data into that shape. Because its input is a SafeWorkUnitCandidate (allowlisted
 * by construction), no forbidden field can flow into the frontend model.
 */

import type { SafeWorkUnitCandidate } from "../candidate/safeWorkUnitCandidate.ts"
import type { LauncherWorkUnit } from "./workUnitSelectionModel.ts"
import { resolveSourceAppIcon } from "./sourceAppIconModel.ts"

export function candidateToLauncherWorkUnit(candidate: SafeWorkUnitCandidate): LauncherWorkUnit {
  return {
    id: candidate.id,
    title: candidate.title,
    source: candidate.source,
    status: candidate.status,
    roi: candidate.roi,
    summary: candidate.summary,
    objective: candidate.objective,
    kind: candidate.kind,
    priority: candidate.priority,
    ownerLabel: candidate.ownerLabel,
    sourceIcon: resolveSourceAppIcon({
      sourceProvider: candidate.source,
      kind: candidate.kind,
      title: candidate.title,
    }),
    statusTone: toneForStatus(candidate.status),
    sourceDetail: candidate.sourceDetail,
    urgency: candidate.urgency,
    nextStep: candidate.nextStep,
  }
}

export function candidatesToLauncherWorkUnits(
  candidates: readonly SafeWorkUnitCandidate[],
): LauncherWorkUnit[] {
  return candidates.map(candidateToLauncherWorkUnit)
}

function toneForStatus(status: string): LauncherWorkUnit["statusTone"] {
  if (status === "BLOCKED") return "yellow"
  if (status === "NEEDS REVIEW") return "green"
  if (status === "DRAFT") return "gray"
  return "blue"
}
