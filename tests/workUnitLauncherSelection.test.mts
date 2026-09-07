import assert from "node:assert/strict"
import test from "node:test"
import { deriveActionFieldEditorDraft, deriveLauncherReadinessCards } from "../app/lib/application/launcher/actionFieldEditorDraftModel.ts"
import { filterForbiddenPaletteCommands } from "../app/lib/application/launcher/forbiddenCommandFilter.ts"
import { getLauncherKeyIntent, nextLauncherIndex } from "../app/lib/application/launcher/keyboardNavigationModel.ts"
import { getSafePaletteCommands } from "../app/lib/application/launcher/paletteCommandRegistry.ts"
import { resolveSourceAppIcon } from "../app/lib/application/launcher/sourceAppIconModel.ts"
import { deriveWorkUnitTreeMap } from "../app/lib/application/launcher/workUnitTreeModel.ts"
import {
  clampLauncherActiveIndex,
  filterLauncherWorkUnits,
  getActiveLauncherWorkUnit,
  type LauncherWorkUnit,
} from "../app/lib/application/launcher/workUnitSelectionModel.ts"

const workUnits: LauncherWorkUnit[] = [
  {
    id: "wu-1",
    title: "Review request",
    source: "GitHub",
    status: "READY",
    roi: 91,
    summary: "Needs review",
    objective: "Review the request",
    kind: "review waiting",
    priority: "high",
    ownerLabel: "PM",
    sourceIcon: resolveSourceAppIcon({ sourceProvider: "github", title: "Review request" }),
  },
  {
    id: "wu-2",
    title: "Team follow-up",
    source: "Team",
    status: "NEEDS REVIEW",
    roi: 82,
    summary: "Waiting on PM",
    objective: "Follow up",
    kind: "missed response",
    priority: "medium",
    ownerLabel: "PM",
    sourceIcon: resolveSourceAppIcon({ sourceProvider: "team", title: "Team follow-up" }),
  },
]

test("filterLauncherWorkUnits filters by query", () => {
  assert.deepEqual(filterLauncherWorkUnits(workUnits, "team").map((w) => w.id), ["wu-2"])
})

test("clampLauncherActiveIndex clamps active index", () => {
  assert.equal(clampLauncherActiveIndex(-4, workUnits.length), 0)
  assert.equal(clampLauncherActiveIndex(40, workUnits.length), 1)
  assert.equal(clampLauncherActiveIndex(Number.NaN, workUnits.length), 0)
})

test("getActiveLauncherWorkUnit returns active WorkUnit", () => {
  assert.equal(getActiveLauncherWorkUnit(workUnits, 1)?.id, "wu-2")
})

test("getActiveLauncherWorkUnit returns null for empty list", () => {
  assert.equal(getActiveLauncherWorkUnit([], 0), null)
})

test("palette command registry excludes forbidden commands", () => {
  const commands = getSafePaletteCommands(workUnits)
  assert.equal(commands.some((command) => command.kind === "open_workunit"), true)
  assert.equal(commands.every((command) => ["open_workunit", "open_archive", "open_audit", "open_settings", "noop"].includes(command.kind)), true)
})

test("forbidden command filter removes dangerous commands", () => {
  const dangerousLabel = ["Send", "Email"].join(" ")
  const dangerousKind = ["slack", "post"].join("_")
  const dangerousRoute = ["/api/workunit", "/tools"].join("")
  const filtered = filterForbiddenPaletteCommands([
    { kind: dangerousKind, label: dangerousLabel },
    { kind: "open_workunit", label: "Open WorkUnit", endpoint: dangerousRoute },
    { kind: "open_archive", label: "Open archive" },
  ])
  assert.deepEqual(filtered.map((command) => command.kind), ["open_archive"])
})

test("keyboard navigation model resolves launcher keys", () => {
  assert.equal(getLauncherKeyIntent({ key: "k", metaKey: true }), "open_palette")
  assert.equal(getLauncherKeyIntent({ key: "k", ctrlKey: true }), "open_palette")
  assert.equal(getLauncherKeyIntent({ key: "Escape" }), "close")
  assert.equal(getLauncherKeyIntent({ key: "Enter" }), "confirm")
  assert.equal(nextLauncherIndex(0, "next", 2), 1)
  // Loop navigation: ArrowUp from the first row wraps to the last.
  assert.equal(nextLauncherIndex(0, "previous", 2), 1)
})

test("workUnit tree model keeps nodes inside bounds", () => {
  const tree = deriveWorkUnitTreeMap(workUnits[0])
  assert.deepEqual(tree.groups.map((group) => group.title), ["Sources", "Subtasks", "Evidence", "Drafts", "Dependencies", "Approval Context"])
  assert.equal(new Set(tree.groups.map((group) => group.id)).size, tree.groups.length)
  for (const group of tree.groups) {
    for (const node of group.nodes) {
      assert.equal(node.x >= 10 && node.x <= 90, true)
      assert.equal(node.y >= 10 && node.y <= 90, true)
    }
  }
})

test("action field draft model marks generated draft editable", () => {
  const draft = deriveActionFieldEditorDraft(workUnits[0])
  assert.equal(draft.editable, true)
  assert.equal(draft.aiGenerated, true)
  assert.equal(draft.editableLabel, "AI-generated draft — editable")
  assert.equal(deriveLauncherReadinessCards(workUnits[0]).length, 5)
})
