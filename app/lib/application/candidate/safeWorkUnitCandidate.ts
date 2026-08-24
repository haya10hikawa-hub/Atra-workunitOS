/**
 * SafeWorkUnitCandidate — candidate-only WorkUnit contract.
 *
 * This is the ONLY shape the candidate bridge may emit toward the frontend.
 * It is candidate-only by construction:
 *   - Candidate ≠ Formal Node
 *   - Preview ≠ Approval
 *   - Approval ≠ Execution
 *   - Draft ≠ Sent
 *
 * Safety invariants:
 *   - Only allowlisted fields exist (see SAFE_WORK_UNIT_CANDIDATE_FIELDS).
 *   - Forbidden fields can never be emitted (allowlist projection drops them).
 *   - humanReviewRequired and candidateOnly are literal true.
 *   - No provider call, no fetch, no persistence, no execution.
 */

// Allowed candidate fields (the public contract surface).
export const SAFE_WORK_UNIT_CANDIDATE_FIELDS = [
  "id",
  "title",
  "summary",
  "source",
  "sourceDetail",
  "status",
  "roi",
  "urgency",
  "nextStep",
  "objective",
  "priority",
  "ownerLabel",
  "kind",
  "graph",
  "actionFieldDraft",
  "candidateType",
  "evidenceSummary",
  "candidateId",
  "evidenceSourceIds",
  "contextSourceIds",
  "missingInformation",
  "humanReviewRequired",
  "candidateOnly",
] as const

// Forbidden candidate fields. These must never appear on a SafeWorkUnitCandidate.
// They are listed here only so the allowlist projection and tests can assert their
// absence; they are never read from input.
export const FORBIDDEN_CANDIDATE_FIELDS = [
  "approvalId",
  "targetHash",
  "payloadHash",
  "tenantId",
  "actorUserId",
  "role",
  "rawPayload",
  "providerPayload",
  "token",
  "secret",
  "authorization",
  "cookie",
] as const

export type SafeCandidateGraphNode = {
  readonly id: string
  readonly label: string
  readonly groupId: string
  readonly relation: string
}

export type SafeCandidateGraph = {
  readonly rootLabel: string
  readonly nodes: readonly SafeCandidateGraphNode[]
}

export type SafeCandidateActionFieldDraft = {
  readonly title: string
  readonly objective: string
  readonly body: string
  readonly editableLabel: string
  readonly verificationState: string
}

export type SafeWorkUnitCandidate = {
  readonly id: string
  readonly title: string
  readonly summary: string
  readonly source: string
  readonly sourceDetail: string
  readonly status: string
  readonly roi: number
  readonly urgency: string
  readonly nextStep: string
  readonly objective: string
  readonly priority: string
  readonly ownerLabel: string
  readonly kind: string
  readonly graph: SafeCandidateGraph
  readonly actionFieldDraft: SafeCandidateActionFieldDraft
  readonly candidateType: string
  readonly evidenceSummary: string
  readonly candidateId: string
  readonly evidenceSourceIds: readonly string[]
  readonly contextSourceIds: readonly string[]
  readonly missingInformation: readonly string[]
  readonly humanReviewRequired: true
  readonly candidateOnly: true
}

/**
 * Allowlist projection — the candidate safety chokepoint.
 *
 * Builds a SafeWorkUnitCandidate by reading ONLY allowlisted keys from `raw`.
 * Any extra/forbidden key present on `raw` is never read and therefore can never
 * reach the output. humanReviewRequired and candidateOnly are forced to true.
 */
export function projectSafeWorkUnitCandidate(raw: Record<string, unknown>): SafeWorkUnitCandidate {
  return {
    id: text(raw.id, "candidate:unknown"),
    title: text(raw.title, "Untitled WorkUnit"),
    summary: text(raw.summary, "Safe candidate signal is available."),
    source: text(raw.source, "Team"),
    sourceDetail: text(raw.sourceDetail, "Candidate signal"),
    status: text(raw.status, "READY"),
    roi: number(raw.roi, 0),
    urgency: text(raw.urgency, "Normal priority"),
    nextStep: text(raw.nextStep, "Review and decide the next step"),
    objective: text(raw.objective, "Review the WorkUnit and decide the next PM-owned step."),
    priority: text(raw.priority, "medium"),
    ownerLabel: text(raw.ownerLabel, "PM"),
    kind: text(raw.kind, "candidate"),
    graph: projectGraph(raw.graph),
    actionFieldDraft: projectActionFieldDraft(raw.actionFieldDraft),
    candidateType: text(raw.candidateType, "work_unit_candidate"),
    evidenceSummary: text(raw.evidenceSummary, ""),
    candidateId: text(raw.candidateId, text(raw.id, "candidate:unknown")),
    evidenceSourceIds: strings(raw.evidenceSourceIds),
    contextSourceIds: strings(raw.contextSourceIds),
    missingInformation: strings(raw.missingInformation),
    humanReviewRequired: true,
    candidateOnly: true,
  }
}

function projectGraph(value: unknown): SafeCandidateGraph {
  const record = isRecord(value) ? value : {}
  const rawNodes = Array.isArray(record.nodes) ? record.nodes : []
  return {
    rootLabel: text(record.rootLabel, "Selected WorkUnit"),
    nodes: rawNodes.map((node) => {
      const n = isRecord(node) ? node : {}
      return {
        id: text(n.id, "node"),
        label: text(n.label, "Node"),
        groupId: text(n.groupId, "sources"),
        relation: text(n.relation, "related"),
      }
    }),
  }
}

function projectActionFieldDraft(value: unknown): SafeCandidateActionFieldDraft {
  const record = isRecord(value) ? value : {}
  return {
    title: text(record.title, "Untitled draft"),
    objective: text(record.objective, ""),
    body: text(record.body, ""),
    editableLabel: text(record.editableLabel, "AI-generated draft — editable"),
    verificationState: text(
      record.verificationState,
      "Local draft only. Human review required. Preview and approval remain outside this phase.",
    ),
  }
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback
}

function number(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function strings(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}
