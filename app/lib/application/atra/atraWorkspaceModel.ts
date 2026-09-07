/**
 * Atra workspace types + the stable process-stage template.
 *
 * The process stages (Orient → Plan → Compose → Verify → Resolve → Review) are a
 * fixed lifecycle skeleton — design-level constants, not candidate data. The
 * dynamic content (core objective, action field draft) is derived per selected
 * WorkUnit in deriveAtraWorkspaceViewModel. Everything stays candidate-only:
 * no execution, no approval, no provider call, no forbidden fields.
 */

export type AtraBadgeTone =
  | "slack"
  | "database"
  | "notion"
  | "drive"
  | "github"
  | "email"
  | "calendar"

export type AtraSourceBadge = {
  readonly code: string
  readonly tone: AtraBadgeTone
}

export type AtraNodeState = "default" | "selected" | "muted"

export type AtraOutputNode = {
  readonly id: string
  readonly label: string
}

export type AtraProcessNode = {
  readonly id: string
  readonly label: string
  readonly badges: readonly AtraSourceBadge[]
  readonly state: AtraNodeState
  readonly output?: AtraOutputNode
}

export type AtraCoreObjective = {
  readonly label: string
  readonly score: number
}

export type AtraDraftSpan = {
  readonly text: string
  readonly tone?: AtraBadgeTone
}

export type AtraDraftBlock =
  | { readonly kind: "h1"; readonly text: string }
  | { readonly kind: "p"; readonly spans: readonly AtraDraftSpan[] }
  | { readonly kind: "bullet"; readonly spans: readonly AtraDraftSpan[] }
  | { readonly kind: "note"; readonly text: string }

export type AtraActionField = {
  readonly visible: boolean
  readonly path: string
  readonly outputTitle: string
  readonly linkedContext: readonly string[]
  readonly draftFilename: string
  readonly readOnlyCandidatePreview: true
  readonly draftBlocks: readonly AtraDraftBlock[]
  readonly candidateOnly: true
  readonly humanReviewRequired: true
}

export type AtraWorkspaceModel = {
  readonly appVersion: string
  readonly workspaceTitle: string
  readonly coreObjective: AtraCoreObjective
  readonly processNodes: readonly AtraProcessNode[]
  readonly actionField: AtraActionField
}

export const ATRA_APP_VERSION = "v1.0.4-stable"

export const ATRA_SLIDE_DECK_OUTPUT: AtraOutputNode = { id: "slide-deck-v4", label: "Slide Deck (v4)" }

/** Stable process-stage template (lifecycle skeleton, not per-candidate data). */
export type AtraProcessTemplateNode = {
  readonly id: string
  readonly label: string
  readonly badges: readonly AtraSourceBadge[]
  readonly output?: AtraOutputNode
}

export const ATRA_PROCESS_TEMPLATE: readonly AtraProcessTemplateNode[] = [
  templateNode("orient", "Orient", []),
  templateNode("plan", "Plan", []),
  { id: "compose", label: "Compose", badges: [], output: ATRA_SLIDE_DECK_OUTPUT },
  templateNode("verify", "Verify", []),
  templateNode("resolve", "Resolve", []),
  templateNode("review", "Review", []),
  templateNode("intake", "", []),
]

/** Map a known 2-letter source code to its tone (used to color inline source-code spans). */
export const ATRA_TOKEN_TONE: Readonly<Record<string, AtraBadgeTone>> = {
  SL: "slack",
  DB: "database",
  NO: "notion",
  DR: "drive",
  GH: "github",
  EM: "email",
  CA: "calendar",
}

function templateNode(id: string, label: string, badges: readonly AtraSourceBadge[]): AtraProcessTemplateNode {
  return { id, label, badges }
}
