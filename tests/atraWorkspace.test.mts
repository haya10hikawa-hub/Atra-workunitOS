/**
 * Atra workspace (Action Field) tests.
 *
 * Locks the candidate-only safety invariants and the target design fidelity of
 * the Atra Node Canvas + Action Field. Forbidden-key strings below are negative
 * controls; static guards scan the product sources, not this test.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { deriveAtraWorkspaceViewModel } from "../app/lib/application/atra/deriveAtraWorkspaceViewModel.ts"
import { ATRA_PROCESS_TEMPLATE } from "../app/lib/application/atra/atraWorkspaceModel.ts"
import type { LauncherWorkUnit } from "../app/lib/application/launcher/workUnitSelectionModel.ts"
import { FORBIDDEN_CANDIDATE_FIELDS } from "../app/lib/application/candidate/safeWorkUnitCandidate.ts"

const COMPONENT = readFileSync(join(process.cwd(), "app/components/atra/AtraWorkspace.tsx"), "utf-8")
const MODEL = readFileSync(join(process.cwd(), "app/lib/application/atra/atraWorkspaceModel.ts"), "utf-8")
const DERIVER = readFileSync(join(process.cwd(), "app/lib/application/atra/deriveAtraWorkspaceViewModel.ts"), "utf-8")
const CSS = readFileSync(join(process.cwd(), "app/components/atra/Atra.module.css"), "utf-8")
const LAUNCHER = readFileSync(join(process.cwd(), "app/components/workunit-os/launcher/WorkUnitLauncher.tsx"), "utf-8")
const PALETTE = readFileSync(join(process.cwd(), "app/components/workunit-os/launcher/CommandPaletteView.tsx"), "utf-8")

function sampleWorkUnit(over: Partial<LauncherWorkUnit> & { id: string }): LauncherWorkUnit {
  return {
    id: over.id,
    title: over.title ?? "Quarterly review presentation",
    source: over.source ?? "Calendar",
    status: over.status ?? "READY",
    roi: over.roi ?? 7.9,
    summary: over.summary ?? "Prepare the quarterly review deck.",
    objective: over.objective ?? "Decide the next PM-owned step.",
    kind: over.kind ?? "deadline",
    priority: over.priority ?? "high",
    ownerLabel: over.ownerLabel ?? "PM",
    sourceIcon: { id: "google-calendar", label: "Calendar", assetPath: null, fallbackBadge: "CA", sourceType: "fallback_badge" },
    nextStep: over.nextStep ?? "Prepare the deliverable before the deadline",
  }
}

function deepForbiddenKeys(value: unknown): string[] {
  const found: string[] = []
  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk)
    if (node && typeof node === "object") {
      for (const key of Object.keys(node as Record<string, unknown>)) {
        if ((FORBIDDEN_CANDIDATE_FIELDS as readonly string[]).includes(key)) found.push(key)
        walk((node as Record<string, unknown>)[key])
      }
    }
  }
  walk(value)
  return found
}

// ─── View model: candidate-only ───────────────────────────────
test("Atra view model is candidate-only and human-review-required", () => {
  const m = deriveAtraWorkspaceViewModel({ workUnit: sampleWorkUnit({ id: "wu-1" }) })
  assert.equal(m.actionField.candidateOnly, true)
  assert.equal(m.actionField.humanReviewRequired, true)
  assert.equal(m.actionField.readOnlyCandidatePreview, true)
})

test("Atra view model emits no forbidden fields", () => {
  assert.deepEqual(deepForbiddenKeys(deriveAtraWorkspaceViewModel({ workUnit: sampleWorkUnit({ id: "wu-1" }) })), [])
})

// ─── View model: stable process template + dynamic objective ──
test("Atra view model keeps the stable process-stage template", () => {
  const m = deriveAtraWorkspaceViewModel({ workUnit: sampleWorkUnit({ id: "wu-1" }) })
  assert.deepEqual(
    m.processNodes.map((n) => n.label),
    ["Orient", "Plan", "Compose", "Verify", "Resolve", "Review", ""],
  )
  const compose = m.processNodes.find((n) => n.id === "compose")!
  assert.equal(compose.state, "selected")
  assert.equal(compose.output?.label, "Slide Deck (v4)")
  assert.deepEqual(compose.badges, [])
  // Template is exported as a stable design constant.
  assert.equal(ATRA_PROCESS_TEMPLATE.length, 7)
})

test("a Calendar-only candidate does not project unrelated providers as source evidence", () => {
  const m = deriveAtraWorkspaceViewModel({
    workUnit: sampleWorkUnit({ id: "calendar-only", source: "Calendar" }),
  })
  assert.deepEqual(
    m.processNodes.flatMap((node) => node.badges.map((badge) => badge.code)),
    [],
  )
})

test("Atra view model core objective is derived from the selected WorkUnit", () => {
  const m = deriveAtraWorkspaceViewModel({ workUnit: sampleWorkUnit({ id: "wu-1", title: "PR #142: rate limiting", roi: 9.4 }) })
  assert.equal(m.workspaceTitle, "PR #142: rate limiting")
  assert.equal(m.coreObjective.label, "PR #142: rate limiting")
  assert.equal(typeof m.coreObjective.score, "number")
})

test("Atra view model action field defaults to Compose / Slide Deck (v4)", () => {
  const m = deriveAtraWorkspaceViewModel({ workUnit: sampleWorkUnit({ id: "wu-1" }) })
  assert.equal(m.actionField.path, "Compose / Slide Deck (v4)")
  assert.equal(m.actionField.outputTitle, "Slide Deck")
  assert.equal(m.actionField.draftFilename, "candidate-preview.md")
  assert.ok(m.actionField.draftBlocks.length > 0)
})

test("Atra view model carries explicit Action Field visibility", () => {
  const workUnit = sampleWorkUnit({ id: "wu-1" })
  assert.equal(deriveAtraWorkspaceViewModel({ workUnit }).actionField.visible, true)
  assert.equal(deriveAtraWorkspaceViewModel({ workUnit, actionFieldOpen: false }).actionField.visible, false)
})

// ─── Component: target UI strings ─────────────────────────────
test("Atra component renders the target shell labels", () => {
  for (const label of [
    ">Atra<", "Workspace", "Command Palette", "Action Field", "Output:",
    "Linked Context:", "Candidate preview — read-only", "Safety Protocol",
    "Finalization Queue", "System Logs",
  ]) {
    assert.ok(COMPONENT.includes(label), `component should render ${label}`)
  }
})

test("Atra Action Field exposes a read-only candidate preview without an edit affordance", () => {
  assert.equal(COMPONENT.includes('aria-label="Edit output"'), false)
  assert.equal(COMPONENT.includes("styles.afCursor"), false)
  assert.equal(COMPONENT.includes("Candidate preview — read-only"), true)
})

test("Atra Action Field closes by hiding its region and selection paths reopen it", () => {
  assert.equal(COMPONENT.includes("workspace.actionField.visible ?"), true)
  assert.equal(COMPONENT.includes("onCloseActionField"), true)
  assert.equal(LAUNCHER.includes("setActionFieldOpen(false)"), true)
  assert.equal(LAUNCHER.includes("setActionFieldOpen(true)"), true)
  assert.equal(LAUNCHER.includes("actionFieldOpen"), true)
})

test("handlerless Atra header and rail controls are honestly unavailable", () => {
  for (const label of ["Menu", "Settings", "Help", "Notifications", "Focus", "Fit view", "Groups", "Filter"]) {
    assert.equal(COMPONENT.includes(`aria-label="${label} unavailable in this preview"`), true, label)
  }
  assert.equal((COMPONENT.match(/disabled/g) ?? []).length >= 8, true)
  assert.equal(CSS.includes(".iconBtn:disabled"), true)
  assert.equal(CSS.includes(".railBtn:disabled"), true)
  assert.equal(COMPONENT.includes("onClick={onOpenPalette}"), true)
  assert.equal(COMPONENT.includes("onClick={onCloseActionField}"), true)
  assert.equal(COMPONENT.includes("onClick={props.onSelect}"), true)
})

test("Command Palette does not offer pagination it cannot perform", () => {
  assert.equal(PALETTE.includes("Show more results"), false)
  assert.equal(PALETTE.includes("All supplied results shown"), true)
  assert.equal(PALETTE.includes("Enter = Open Detail"), false)
  assert.equal(PALETTE.includes("Enter = Open Action Field"), true)
})

// ─── Safety: no execution / forbidden routes / forbidden data ─
test("Atra surface has no execution CTA copy", () => {
  const cta = /\b(send|approve|execute|publish|finalize)\b/i
  assert.equal(cta.test(COMPONENT), false, "component CTA")
  assert.equal(cta.test(MODEL), false, "model CTA")
  assert.equal(cta.test(DERIVER), false, "deriver CTA")
})

test("Atra surface has no forbidden runtime paths or providers", () => {
  for (const src of [COMPONENT, MODEL, DERIVER, LAUNCHER]) {
    assert.equal(src.includes("/api/workunit/tools"), false)
    assert.equal(src.includes("fetch("), false)
    assert.equal(src.includes("process.env"), false)
    for (const sdk of ["openai", "@anthropic-ai", "deepseekProvider", "createDeepseek"]) {
      assert.equal(src.includes(sdk), false, `provider ${sdk}`)
    }
  }
})

test("Atra surface emits no forbidden field identifiers", () => {
  for (const src of [COMPONENT, MODEL, DERIVER]) {
    for (const key of FORBIDDEN_CANDIDATE_FIELDS) {
      assert.equal(src.includes(key), false, `forbidden field ${key}`)
    }
  }
})

test("Atra component uses inline icons (no external icon package, no raster images)", () => {
  assert.equal(COMPONENT.includes("lucide-react"), false)
  assert.equal(CSS.includes(".png"), false)
  assert.equal(COMPONENT.includes("<img"), false)
  assert.equal(COMPONENT.includes(".png"), false)
})

// ─── Layout stability (viewport-independent graph) ─────────────

function cssBlock(selector: string): string {
  const at = CSS.indexOf(`${selector} {`)
  if (at < 0) return ""
  const start = CSS.indexOf("{", at)
  const end = CSS.indexOf("}", start)
  return CSS.slice(start, end + 1)
}

test("graph uses a stable graph-stage coordinate wrapper", () => {
  assert.ok(CSS.includes(".graphStage"), "CSS must define .graphStage")
  assert.ok(COMPONENT.includes("styles.graphStage"), "component must render the graph stage")
  // Stage is a fixed logical px size, not viewport-derived.
  assert.ok(COMPONENT.includes("STAGE_W") && COMPONENT.includes("STAGE_H"))
  assert.equal(/const STAGE_W = \d+/.test(COMPONENT), true)
  assert.equal(/const STAGE_H = \d+/.test(COMPONENT), true)
})

test("edge SVG and graph nodes live inside the same graph stage", () => {
  const stageIdx = COMPONENT.indexOf("styles.graphStage")
  const edgesIdx = COMPONENT.indexOf("styles.edges")
  const nodesIdx = COMPONENT.indexOf("ProcessNodeCard")
  const outputIdx = COMPONENT.indexOf("styles.outputNode")
  assert.ok(stageIdx > 0)
  assert.ok(stageIdx < edgesIdx, "edge SVG must be inside the graph stage")
  assert.ok(stageIdx < nodesIdx, "nodes must be inside the graph stage")
  assert.ok(stageIdx < outputIdx, "output node must be inside the graph stage")
})

test("edge SVG shares the node coordinate system (fixed viewBox, not stretched)", () => {
  assert.ok(COMPONENT.includes("viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}"))
  assert.equal(COMPONENT.includes('preserveAspectRatio="none"'), false)
})

test("root card and process nodes use no viewport units or percentage positioning", () => {
  for (const selector of [".coreCard", ".node", ".outputNode", ".graphStage"]) {
    const block = cssBlock(selector)
    assert.ok(block.length > 0, `${selector} block must exist`)
    assert.equal(/\d(vw|vh)\b/.test(block), false, `${selector} must not use vw/vh`)
  }
  // Root card / node / output positions are not percentage-based in CSS.
  for (const selector of [".coreCard", ".node", ".outputNode"]) {
    const block = cssBlock(selector)
    assert.equal(/left:\s*\d+%/.test(block), false, `${selector} must not use percentage left`)
    assert.equal(/top:\s*\d+%/.test(block), false, `${selector} must not use percentage top`)
  }
  // Node graph tops are px, not percent.
  assert.equal(COMPONENT.includes("${top}px"), true)
  assert.equal(COMPONENT.includes("${top}%"), false)
})

test("Action Field column width is clamped (bounded), not fixed to viewport drift", () => {
  const body = cssBlock(".body")
  assert.ok(body.includes("grid-template-columns"))
  assert.ok(body.includes("clamp("), "Action Field column must be clamped")
})

test("closed Action Field layout wins the responsive body rule", () => {
  assert.ok(CSS.includes(".body.bodyActionFieldClosed {"), "closed layout needs higher specificity")
  const closed = cssBlock(".body.bodyActionFieldClosed")
  assert.match(closed, /grid-template-columns:\s*56px minmax\(0, 1fr\)/)
})

test("typography stays in px (no viewport-scaled font sizes)", () => {
  assert.equal(/font-size:[^;]*\d(vw|vh)/.test(CSS), false)
  assert.equal(/font-size:\s*clamp\([^)]*vw/.test(CSS), false)
})
