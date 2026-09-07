/**
 * Derive the Atra workspace view model from a selected candidate-safe WorkUnit.
 *
 * This is the single source of truth that turns launcher data into the Atra
 * presentation model. It reuses the existing actionFieldEditorDraftModel so the
 * Action Field draft is not re-implemented. Pure and candidate-only:
 *   - no execution, no approval, no provider call, no fetch, no forbidden fields.
 *
 * Data seam: input is a LauncherWorkUnit (adapted from SafeWorkUnitCandidate by
 * candidateToLauncherWorkUnit). Switching the upstream source from mock to the
 * candidate bridge requires no change here.
 */

import type { LauncherWorkUnit } from "../launcher/workUnitSelectionModel.ts"
import { deriveActionFieldEditorDraft } from "../launcher/actionFieldEditorDraftModel.ts"
import {
  ATRA_APP_VERSION,
  ATRA_PROCESS_TEMPLATE,
  ATRA_TOKEN_TONE,
  type AtraDraftBlock,
  type AtraDraftSpan,
  type AtraProcessNode,
  type AtraWorkspaceModel,
} from "./atraWorkspaceModel.ts"

export type AtraWorkspaceViewModel = AtraWorkspaceModel & {
  readonly selectedNodeId: string
}

export type DeriveAtraWorkspaceInput = {
  readonly workUnit: LauncherWorkUnit | null
  readonly selectedNodeId?: string | null
  readonly actionFieldOpen?: boolean
}

const COMPOSE = ATRA_PROCESS_TEMPLATE.find((node) => node.output) ?? ATRA_PROCESS_TEMPLATE[0]!

export function deriveAtraWorkspaceViewModel(input: DeriveAtraWorkspaceInput): AtraWorkspaceViewModel {
  const workUnit = input.workUnit
  const selectableIds = new Set<string>([
    ...ATRA_PROCESS_TEMPLATE.map((node) => node.id),
    ...(COMPOSE.output ? [COMPOSE.output.id] : []),
  ])
  const selectedId =
    input.selectedNodeId && selectableIds.has(input.selectedNodeId) ? input.selectedNodeId : COMPOSE.id

  const processNodes: readonly AtraProcessNode[] = ATRA_PROCESS_TEMPLATE.map((node) => ({
    id: node.id,
    label: node.label,
    badges: node.badges,
    output: node.output,
    state: node.id === selectedId ? "selected" : node.label === "" ? "muted" : "default",
  }))

  // The focus stage drives the Action Field. Selecting the output node focuses its
  // owning Compose stage.
  const focusTemplate = ATRA_PROCESS_TEMPLATE.find((node) => node.id === selectedId) ?? COMPOSE
  const output = COMPOSE.output
  const focusForDraft = selectedId === COMPOSE.id ? null : { id: selectedId, label: focusTemplate.label }
  const draft = deriveActionFieldEditorDraft(workUnit, focusForDraft)

  return {
    appVersion: ATRA_APP_VERSION,
    workspaceTitle: workUnit?.title ?? "WorkUnit Plan",
    coreObjective: {
      label: workUnit?.title ?? "No WorkUnit selected",
      score: deriveScore(workUnit),
    },
    processNodes,
    actionField: {
      visible: input.actionFieldOpen ?? true,
      path: output ? `${focusTemplate.label} / ${output.label}` : focusTemplate.label,
      outputTitle: output ? output.label.replace(/\s*\(v\d+\)\s*$/, "") : "Draft",
      linkedContext: [],
      draftFilename: "candidate-preview.md",
      readOnlyCandidatePreview: true,
      candidateOnly: true,
      humanReviewRequired: true,
      draftBlocks: markdownToDraftBlocks(draft.body),
    },
    selectedNodeId: selectedId,
  }
}

function deriveScore(workUnit: LauncherWorkUnit | null): number {
  if (!workUnit) return 0
  const raw = workUnit.roi <= 10 ? workUnit.roi * 10 : workUnit.roi
  return Math.max(0, Math.min(99, Math.round(raw)))
}

/** Minimal markdown → draft blocks. Source codes render as colored inline spans. */
export function markdownToDraftBlocks(body: string): readonly AtraDraftBlock[] {
  const blocks: AtraDraftBlock[] = []
  for (const rawLine of body.split("\n")) {
    const line = rawLine.trimEnd()
    if (line.trim() === "") continue
    if (/^#{1,3}\s+/.test(line)) {
      blocks.push({ kind: "h1", text: line.replace(/^#{1,3}\s+/, "") })
      continue
    }
    if (/^-\s+/.test(line)) {
      blocks.push({ kind: "bullet", spans: colorizeSourceSpans(line.replace(/^-\s+/, "")) })
      continue
    }
    const trimmed = line.trim()
    if (trimmed.startsWith("//") || (trimmed.startsWith("_") && trimmed.endsWith("_"))) {
      blocks.push({ kind: "note", text: trimmed.replace(/^_/, "").replace(/_$/, "") })
      continue
    }
    blocks.push({ kind: "p", spans: colorizeSourceSpans(line) })
  }
  return blocks
}

function colorizeSourceSpans(text: string): readonly AtraDraftSpan[] {
  const parts = text.split(/\b(SL|DB|NO|DR|GH|EM|CA)\b/)
  return parts
    .filter((part) => part !== "")
    .map((part) => (ATRA_TOKEN_TONE[part] ? { text: part, tone: ATRA_TOKEN_TONE[part] } : { text: part }))
}
