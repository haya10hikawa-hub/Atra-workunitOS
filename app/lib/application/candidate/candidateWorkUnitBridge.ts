/**
 * Candidate-only WorkUnit Bridge.
 *
 * Converts mock / manual normalized signals into SafeWorkUnitCandidate data that
 * the frontend can consume. This bridge is strictly candidate-only:
 *
 *   - source defaults to "mock_candidate_pipeline"
 *   - mode is always "candidate_only"
 *   - providerCallsEnabled is literal false (no real LLM call this sprint)
 *   - externalExecutionEnabled / approvalCreationEnabled are literal false
 *   - humanReviewRequired is literal true
 *   - containsRawPayload is literal false
 *
 * It does NOT:
 *   - call any real provider, make network calls, or read environment variables
 *   - call the external tools route
 *   - create a Formal Node, Approval, or Execution
 *   - persist or write to a database
 *
 * Every emitted candidate passes through projectSafeWorkUnitCandidate (allowlist
 * projection) so forbidden fields can never leak.
 */

import type { NormalizedToolSignal, NormalizedToolProvider, NormalizedToolSignalType } from "../workunitInbox/types.ts"
import { MOCK_SIGNALS } from "../workunitInbox/mockSignals.ts"
import {
  projectSafeWorkUnitCandidate,
  type SafeWorkUnitCandidate,
} from "./safeWorkUnitCandidate.ts"

export type CandidatePipelineSource = "mock_candidate_pipeline" | "dev_gated_llm_candidate_pipeline"

export type CandidateWorkUnitBridgeResult = {
  readonly workUnits: readonly SafeWorkUnitCandidate[]
  readonly source: CandidatePipelineSource
  readonly mode: "candidate_only"
  readonly safety: {
    readonly externalExecutionEnabled: false
    readonly approvalCreationEnabled: false
    readonly providerCallsEnabled: false
    readonly humanReviewRequired: true
    readonly containsRawPayload: false
  }
}

export type CandidateWorkUnitBridgeInput = {
  readonly signals?: readonly NormalizedToolSignal[]
}

/**
 * Build a candidate-only bridge result from mock/manual signals.
 *
 * For this sprint `source` is always "mock_candidate_pipeline" and
 * `providerCallsEnabled` is always literal false. The dev-gated LLM input path is
 * handled separately and remains fail-closed (see devGatedLlmCandidatePipeline).
 */
export function candidateWorkUnitBridge(
  input: CandidateWorkUnitBridgeInput = {},
): CandidateWorkUnitBridgeResult {
  const signals = input.signals ?? MOCK_SIGNALS
  const workUnits = signals.map((signal) =>
    projectSafeWorkUnitCandidate(buildRawCandidateFromSignal(signal)),
  )
  return {
    workUnits,
    source: "mock_candidate_pipeline",
    mode: "candidate_only",
    safety: {
      externalExecutionEnabled: false,
      approvalCreationEnabled: false,
      providerCallsEnabled: false,
      humanReviewRequired: true,
      containsRawPayload: false,
    },
  }
}

/**
 * Map a normalized signal to a candidate-shaped record. Reads only safe display
 * fields from the signal — it never reads tenant/identity/raw fields. The result
 * is still passed through the allowlist projection by the caller.
 */
function buildRawCandidateFromSignal(signal: NormalizedToolSignal): Record<string, unknown> {
  const sourceLabel = providerLabel(signal.provider)
  const sourceDetail = `${sourceLabel} · ${signalTypeLabel(signal.signalType)}`
  const priority = signal.priorityHint ?? "medium"
  const ownerLabel = signal.assignee ?? signal.actor ?? signal.repository ?? "PM"
  const nextStep = deriveNextStep(signal)
  return {
    id: `candidate:${signal.id}`,
    title: signal.title,
    summary: signal.summary,
    source: sourceLabel,
    sourceDetail,
    status: deriveStatus(signal.signalType),
    roi: deriveRoi(priority, signal.signalType),
    urgency: deriveUrgency(priority),
    nextStep,
    objective: `Review this ${signalTypeLabel(signal.signalType)} and decide the next PM-owned step.`,
    priority,
    ownerLabel,
    kind: deriveKind(signal.signalType),
    candidateType: "work_unit_candidate",
    evidenceSummary: signal.summary,
    candidateId: `candidate:${signal.id}`,
    evidenceSourceIds: [signal.id],
    contextSourceIds: [],
    missingInformation: [],
    graph: buildCandidateGraph(signal, sourceLabel),
    actionFieldDraft: buildCandidateActionFieldDraft(signal, nextStep),
    humanReviewRequired: true,
    candidateOnly: true,
  }
}

function buildCandidateGraph(signal: NormalizedToolSignal, sourceLabel: string) {
  return {
    rootLabel: signal.title,
    nodes: [
      { id: "source", label: `${sourceLabel} source`, groupId: "sources", relation: "origin" },
      { id: "evidence", label: clip(signal.summary), groupId: "evidence", relation: "supports" },
      { id: "next-step", label: deriveNextStep(signal), groupId: "subtasks", relation: "proposed" },
    ],
  }
}

function buildCandidateActionFieldDraft(signal: NormalizedToolSignal, nextStep: string) {
  return {
    title: signal.title,
    objective: `Decide the next PM-owned step for: ${signal.title}`,
    body: [
      `## Candidate summary`,
      signal.summary,
      ``,
      `## Proposed next step (candidate only)`,
      nextStep,
      ``,
      `_Human review required. This is a candidate draft, not a formal node, approval, or execution._`,
    ].join("\n"),
    editableLabel: "AI-generated draft — editable",
    verificationState:
      "Local draft only. Human review required. Preview and approval remain outside this phase.",
  }
}

function providerLabel(provider: NormalizedToolProvider): string {
  if (provider === "github") return "GitHub"
  if (provider === "slack") return "Slack"
  if (provider === "calendar") return "Calendar"
  return "Team"
}

function signalTypeLabel(signalType: NormalizedToolSignalType): string {
  switch (signalType) {
    case "github_pr_review_requested":
      return "pull request review request"
    case "github_issue_assigned":
      return "assigned issue"
    case "github_issue_blocked":
      return "blocked issue"
    case "slack_mention_request":
      return "mention request"
    case "calendar_deadline":
      return "deadline"
    default:
      return "signal"
  }
}

function deriveKind(signalType: NormalizedToolSignalType): string {
  switch (signalType) {
    case "github_pr_review_requested":
      return "review waiting"
    case "github_issue_assigned":
      return "assigned issue"
    case "github_issue_blocked":
      return "blocker"
    case "slack_mention_request":
      return "missed response"
    case "calendar_deadline":
      return "deadline"
    default:
      return "candidate"
  }
}

function deriveStatus(signalType: NormalizedToolSignalType): string {
  if (signalType === "github_issue_blocked") return "BLOCKED"
  if (signalType === "github_pr_review_requested" || signalType === "slack_mention_request") return "NEEDS REVIEW"
  return "READY"
}

function deriveUrgency(priority: string): string {
  if (priority === "high") return "High impact"
  if (priority === "low") return "Low impact"
  return "Normal priority"
}

function deriveRoi(priority: string, signalType: NormalizedToolSignalType): number {
  const base = priority === "high" ? 9 : priority === "low" ? 6.2 : 7.6
  const bonus = signalType === "github_pr_review_requested" ? 0.4 : signalType === "github_issue_blocked" ? 0.3 : 0
  return Number((base + bonus).toFixed(1))
}

function deriveNextStep(signal: NormalizedToolSignal): string {
  switch (signal.signalType) {
    case "github_pr_review_requested":
      return "Review the changes and leave sign-off comments"
    case "github_issue_assigned":
      return "Scope the issue and plan the implementation"
    case "github_issue_blocked":
      return "Identify the blocker owner and unblock the dependency"
    case "slack_mention_request":
      return "Reply to the request or delegate the next action"
    case "calendar_deadline":
      return "Prepare the deliverable before the deadline"
    default:
      return "Review and decide the next step"
  }
}

function clip(value: string, max = 80): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}
