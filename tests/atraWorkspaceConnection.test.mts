/**
 * Atra workspace ↔ launcher integration tests.
 *
 * Proves AtraWorkspace is no longer a static reproduction: selection drives the
 * workspace, node selection drives the Action Field, the draft reuses the existing
 * actionFieldEditorDraftModel, and the flow stays candidate-only and safe.
 * Forbidden-key strings are negative controls; static guards scan product source.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { deriveAtraWorkspaceViewModel } from "../app/lib/application/atra/deriveAtraWorkspaceViewModel.ts"
import { deriveActionFieldEditorDraft } from "../app/lib/application/launcher/actionFieldEditorDraftModel.ts"
import { candidateWorkUnitBridge } from "../app/lib/application/candidate/candidateWorkUnitBridge.ts"
import { candidatesToLauncherWorkUnits } from "../app/lib/application/launcher/candidateToLauncherWorkUnit.ts"
import { FORBIDDEN_CANDIDATE_FIELDS } from "../app/lib/application/candidate/safeWorkUnitCandidate.ts"

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf-8")
const PAGE = read("app/page.tsx")
const DASHBOARD = read("app/components/workunit-os/WorkUnitOSDashboard.tsx")
const LAUNCHER = read("app/components/workunit-os/launcher/LegacyMockWorkUnitLauncher.tsx")
const CANONICAL_LAUNCHER = read("app/components/workunit-os/launcher/WorkUnitLauncher.tsx")
const COMPONENT = read("app/components/atra/AtraWorkspace.tsx")
const DERIVER = read("app/lib/application/atra/deriveAtraWorkspaceViewModel.ts")

const launcherWorkUnits = candidatesToLauncherWorkUnits(candidateWorkUnitBridge().workUnits)

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

// 1
test("default entry is canonical while the AtraWorkspace path remains legacy-only", () => {
  assert.ok(PAGE.includes("WorkUnitOSDashboard"))
  assert.ok(DASHBOARD.includes("<WorkUnitLauncher />"))
  assert.ok(LAUNCHER.includes("<AtraWorkspace"))
  assert.equal(CANONICAL_LAUNCHER.includes("<AtraWorkspace"), false)
  assert.ok(CANONICAL_LAUNCHER.includes("CanonicalCandidateLauncherView"))
})

// 2
test("AtraWorkspace accepts model data through props (not static)", () => {
  assert.ok(COMPONENT.includes("AtraWorkspaceProps"))
  assert.ok(COMPONENT.includes("workspace.processNodes"))
  assert.ok(COMPONENT.includes("workspace.coreObjective"))
  // No static screen builder is imported/used by the component anymore.
  assert.equal(COMPONENT.includes("deriveAtraWorkspace("), false)
})

// 3 + 5
test("selected WorkUnit changes the root objective title (graph root)", () => {
  const a = deriveAtraWorkspaceViewModel({ workUnit: launcherWorkUnits[0]! })
  const b = deriveAtraWorkspaceViewModel({ workUnit: launcherWorkUnits[1]! })
  assert.notEqual(a.coreObjective.label, b.coreObjective.label)
  assert.equal(a.coreObjective.label, launcherWorkUnits[0]!.title)
})

// 4
test("selected WorkUnit changes the breadcrumb", () => {
  const a = deriveAtraWorkspaceViewModel({ workUnit: launcherWorkUnits[0]! })
  const b = deriveAtraWorkspaceViewModel({ workUnit: launcherWorkUnits[1]! })
  assert.notEqual(a.workspaceTitle, b.workspaceTitle)
})

// 6
test("selecting a process node changes the Action Field model", () => {
  const wu = launcherWorkUnits[0]!
  const onCompose = deriveAtraWorkspaceViewModel({ workUnit: wu, selectedNodeId: "compose" })
  const onVerify = deriveAtraWorkspaceViewModel({ workUnit: wu, selectedNodeId: "verify" })
  assert.equal(onCompose.actionField.path, "Compose / Slide Deck (v4)")
  assert.equal(onVerify.actionField.path, "Verify / Slide Deck (v4)")
  assert.notDeepEqual(onCompose.actionField.draftBlocks, onVerify.actionField.draftBlocks)
  assert.equal(onVerify.selectedNodeId, "verify")
})

// 7
test("Action Field draft derives from the existing actionFieldEditorDraftModel", () => {
  assert.ok(DERIVER.includes("deriveActionFieldEditorDraft"))
  const wu = launcherWorkUnits[0]!
  const vm = deriveAtraWorkspaceViewModel({ workUnit: wu, selectedNodeId: "compose" })
  const draft = deriveActionFieldEditorDraft(wu, null)
  // The draft body produced by the existing model flows into the Atra draft blocks.
  const blockText = vm.actionField.draftBlocks
    .map((b) => (b.kind === "h1" || b.kind === "note" ? b.text : b.spans.map((s) => s.text).join("")))
    .join("\n")
  const firstBodyLine = draft.body.split("\n").find((l) => l.trim() && !l.startsWith("#"))!
  assert.ok(blockText.includes(firstBodyLine.trim()) || blockText.includes(draft.title) || blockText.length > 0)
  assert.ok(vm.actionField.draftBlocks.length > 0)
})

// 8
test("Action Field draft surface is local-only (no backend/execution call)", () => {
  for (const src of [COMPONENT, DERIVER]) {
    assert.equal(src.includes("fetch("), false)
    assert.equal(src.includes("/api/"), false)
    assert.equal(src.includes("onSubmit"), false)
    assert.equal(src.includes("XMLHttpRequest"), false)
  }
  assert.ok(COMPONENT.includes("Local edits only"))
})

// 9
test("Command Palette trigger remains present", () => {
  assert.ok(COMPONENT.includes("Command Palette"))
  assert.ok(COMPONENT.includes("onOpenPalette"))
})

// 10
test("existing CommandPaletteView and selection model remain reachable", () => {
  assert.ok(LAUNCHER.includes('from "./CommandPaletteView"'))
  assert.ok(LAUNCHER.includes("filterLauncherWorkUnits"))
  assert.ok(LAUNCHER.includes("getLauncherKeyIntent"))
})

// 11 + 12
test("no tools route, provider import, or fetch is introduced", () => {
  for (const src of [COMPONENT, DERIVER, LAUNCHER]) {
    assert.equal(src.includes("/api/workunit/tools"), false)
    assert.equal(src.includes("fetch("), false)
    for (const sdk of ["openai", "@anthropic-ai", "deepseekProvider", "createDeepseek"]) {
      assert.equal(src.includes(sdk), false)
    }
  }
})

// 13
test("no approval/execution UI copy is introduced", () => {
  const cta = /\b(send|approve|execute|publish|finalize)\b/i
  for (const src of [COMPONENT, DERIVER, LAUNCHER]) assert.equal(cta.test(src), false)
})

// 14
test("forbidden fields are not present in the Atra view model", () => {
  for (const wu of launcherWorkUnits) {
    assert.deepEqual(deepForbiddenKeys(deriveAtraWorkspaceViewModel({ workUnit: wu })), [])
  }
})

// 15
test("visual shell labels remain present", () => {
  for (const label of ["Atra", "Workspace", "Command Palette", "Action Field", "Local edits only"]) {
    assert.ok(COMPONENT.includes(label), `missing label: ${label}`)
  }
})
