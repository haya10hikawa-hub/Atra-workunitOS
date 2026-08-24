import type { InboxWorkUnit } from "@/lib/application/workunitInbox/types"
import { resolveSourceAppIcon, type SourceAppIconView } from "./sourceAppIconModel.ts"
import type { CandidateProjection } from "../phase1/candidateProjection.ts"

export type LauncherWorkUnit = {
  readonly id: string
  readonly title: string
  readonly source: string
  readonly status: string
  readonly roi: number
  readonly summary: string
  readonly objective: string
  readonly kind: string
  readonly priority: string
  readonly ownerLabel: string
  readonly sourceIcon: SourceAppIconView
  readonly statusTone?: "green" | "yellow" | "blue" | "purple" | "gray"
  readonly sourceDetail?: string
  readonly urgency?: string
  readonly nextStep?: string
  readonly candidateProjection?: CandidateProjection
}

export function mapInboxWorkUnitToLauncherWorkUnit(workUnit: InboxWorkUnit): LauncherWorkUnit {
  return {
    id: workUnit.id,
    title: workUnit.title || "Untitled WorkUnit",
    source: providerLabel(workUnit.sourceProvider),
    status: statusLabel(workUnit),
    roi: calculateLauncherRoi(workUnit),
    summary: workUnit.reason || workUnit.evidence || workUnit.nextAction || "Safe inbox signal is available.",
    objective: workUnit.nextAction || "Review the WorkUnit and decide the next PM-owned step.",
    kind: workUnit.kind.replace(/_/g, " "),
    priority: workUnit.priority,
    ownerLabel: workUnit.assignee ?? workUnit.actor ?? workUnit.repository ?? "PM",
    sourceIcon: resolveSourceAppIcon(workUnit),
    statusTone: toneForWorkUnit(workUnit),
    sourceDetail: `${providerLabel(workUnit.sourceProvider)} signal`,
    urgency: workUnit.priority === "high" ? "High impact" : "Normal priority",
    nextStep: workUnit.nextAction || "Review and decide next step",
  }
}

export function fallbackLauncherWorkUnits(): LauncherWorkUnit[] {
  return [
    {
      id: "pr-289",
      title: "PR #289: Admin dashboard",
      source: "GitHub",
      status: "Needs Review",
      roi: 9.4,
      summary: "Implement admin dashboard with key metrics and filters",
      objective: "Add admin dashboard with key metrics, filters, and export. Includes charts, tables, and role-based access.",
      kind: "review waiting",
      priority: "high",
      ownerLabel: "PM",
      sourceIcon: resolveSourceAppIcon({ sourceProvider: "github", repository: "acme/admin", title: "PR #289" }),
      statusTone: "green",
      sourceDetail: "GitHub · pull request #289",
      urgency: "High impact · Requested by stakeholders",
      nextStep: "Address review comments and update tests",
    },
    {
      id: "postgres-analytics",
      title: "Should we use Postgres for analytics?",
      source: "Notion",
      status: "In Progress",
      roi: 7.8,
      summary: "Evaluate Postgres vs ClickHouse for event analytics",
      objective: "Compare data-store options for analytics planning.",
      kind: "decision memo",
      priority: "medium",
      ownerLabel: "PM",
      sourceIcon: resolveSourceAppIcon({ sourceProvider: "notion", title: "Postgres analytics memo" }),
      statusTone: "yellow",
      sourceDetail: "Notion · architecture memo",
      urgency: "Medium impact · Planning dependency",
      nextStep: "Review tradeoffs and pick evaluation criteria",
    },
    {
      id: "roi-79",
      title: "Quarterly review presentation",
      source: "Slides",
      status: "Needs Review",
      roi: 7.9,
      summary: "Q1 results, growth analysis, and roadmap",
      objective: "Deliver a clear, data-driven quarterly review to the executive team and obtain approval to proceed with Q3 initiatives as planned.",
      kind: "deadline",
      priority: "medium",
      ownerLabel: "PM",
      sourceIcon: resolveSourceAppIcon({ kind: "presentation", title: "Quarterly review presentation" }),
      statusTone: "gray",
      sourceDetail: "Slides · quarterly review",
      urgency: "Executive review · This week",
      nextStep: "Edit the Q3 plan and verify readiness",
    },
    {
      id: "deployments-incident",
      title: "#deployments: incident follow-up",
      source: "Team",
      status: "FYI",
      roi: 6.6,
      summary: "Investigate 5xx errors in checkout service",
      objective: "Summarize the incident follow-up and keep the team aligned.",
      kind: "missed response",
      priority: "low",
      ownerLabel: "SRE",
      sourceIcon: resolveSourceAppIcon({ sourceProvider: "slack", title: "#deployments incident follow-up" }),
      statusTone: "blue",
      sourceDetail: "Team · #deployments",
      urgency: "Informational · Service review",
      nextStep: "Check incident notes before next review",
    },
    {
      id: "task-612",
      title: "TASK-612: Refactor auth flow",
      source: "Jira",
      status: "In Progress",
      roi: 8.2,
      summary: "Simplify session refresh and auth handling",
      objective: "Prepare the auth-flow refactor details for review.",
      kind: "assigned issue",
      priority: "medium",
      ownerLabel: "Platform",
      sourceIcon: resolveSourceAppIcon({ sourceProvider: "jira", title: "TASK-612" }),
      statusTone: "purple",
      sourceDetail: "Jira · TASK-612",
      urgency: "Medium impact · Reliability work",
      nextStep: "Validate scope and session edge cases",
    },
    {
      id: "onboarding-q2",
      title: "Onboarding plan for Q2",
      source: "Docs",
      status: "Draft",
      roi: 6.1,
      summary: "Plan to onboard 10 new engineers",
      objective: "Review onboarding plan draft before stakeholder circulation.",
      kind: "draft",
      priority: "low",
      ownerLabel: "People Ops",
      sourceIcon: resolveSourceAppIcon({ sourceProvider: "docs", title: "Onboarding plan for Q2" }),
      statusTone: "gray",
      sourceDetail: "Docs · onboarding plan",
      urgency: "Low impact · Draft review",
      nextStep: "Fill missing onboarding checkpoints",
    },
  ]
}

export function filterLauncherWorkUnits(
  workUnits: readonly LauncherWorkUnit[],
  query: string,
): LauncherWorkUnit[] {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return [...workUnits]

  return workUnits.filter((workUnit) => {
    const haystack = [
      workUnit.id,
      workUnit.title,
      workUnit.source,
      workUnit.status,
      workUnit.summary,
      workUnit.objective,
      workUnit.kind,
      workUnit.priority,
      workUnit.ownerLabel,
      String(workUnit.roi),
      workUnit.sourceDetail ?? "",
      workUnit.urgency ?? "",
      workUnit.nextStep ?? "",
    ].join(" ").toLowerCase()
    return haystack.includes(normalized)
  })
}

export function clampLauncherActiveIndex(index: number, length: number): number {
  if (length <= 0) return -1
  if (!Number.isFinite(index)) return 0
  return Math.min(Math.max(Math.trunc(index), 0), length - 1)
}

export function getActiveLauncherWorkUnit(
  workUnits: readonly LauncherWorkUnit[],
  activeIndex: number,
): LauncherWorkUnit | null {
  const index = clampLauncherActiveIndex(activeIndex, workUnits.length)
  return index === -1 ? null : workUnits[index] ?? null
}

function providerLabel(provider: InboxWorkUnit["sourceProvider"]): string {
  if (provider === "github") return "GitHub"
  if (provider === "calendar") return "Calendar"
  return "Team"
}

function statusLabel(workUnit: InboxWorkUnit): string {
  if (workUnit.status === "done" || workUnit.status === "useful") return "READY"
  if (workUnit.status === "later") return "DRAFT"
  if (workUnit.status === "not_useful") return "BLOCKED"
  if (workUnit.kind === "blocker") return "BLOCKED"
  if (workUnit.kind === "missed_response") return "NEEDS REVIEW"
  return "READY"
}

function calculateLauncherRoi(workUnit: InboxWorkUnit): number {
  const priorityBase = workUnit.priority === "high" ? 84 : workUnit.priority === "medium" ? 74 : 64
  const kindBonus = workUnit.kind === "review_waiting"
    ? 8
    : workUnit.kind === "missed_response"
      ? 6
      : workUnit.kind === "deadline"
        ? 5
        : workUnit.kind === "assigned_issue"
          ? 4
          : 0
  const statusDelta = workUnit.status === "later" ? -9 : workUnit.status === "not_useful" ? -64 : 0
  return Math.max(0, Number((priorityBase + kindBonus + statusDelta).toFixed(1)))
}

function toneForWorkUnit(workUnit: InboxWorkUnit): LauncherWorkUnit["statusTone"] {
  if (workUnit.status === "later") return "gray"
  if (workUnit.kind === "blocker" || workUnit.status === "not_useful") return "yellow"
  if (workUnit.kind === "missed_response") return "green"
  return "gray"
}
