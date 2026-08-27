import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFile } from "node:fs/promises"
import path from "node:path"
import test from "node:test"

const root = process.cwd()
const launcherFiles = [
  "app/components/workunit-os/launcher/WorkUnitLauncher.tsx",
  "app/components/workunit-os/launcher/CommandPaletteView.tsx",
  "app/components/workunit-os/launcher/ActionFieldView.tsx",
  "app/components/workunit-os/launcher/ActionFieldEditor.tsx",
  "app/components/workunit-os/launcher/WorkUnitTreeMap.tsx",
  "app/components/workunit-os/launcher/ReadinessCards.tsx",
  "app/components/workunit-os/launcher/WorkUnitLauncher.module.css",
  "app/lib/application/launcher/workUnitSelectionModel.ts",
  "app/lib/application/launcher/paletteCommandRegistry.ts",
  "app/lib/application/launcher/forbiddenCommandFilter.ts",
  "app/lib/application/launcher/keyboardNavigationModel.ts",
  "app/lib/application/launcher/workUnitTreeModel.ts",
  "app/lib/application/launcher/actionFieldEditorDraftModel.ts",
]

async function source(file: string): Promise<string> {
  return readFile(path.join(root, file), "utf8")
}

test("WorkUnitLauncherMode and launcher components exist", async () => {
  const launcher = await source(launcherFiles[0])
  const palette = await source(launcherFiles[1])
  const actionField = await source(launcherFiles[2])
  const editor = await source(launcherFiles[3])
  const tree = await source(launcherFiles[4])
  assert.equal(launcher.includes('type WorkUnitLauncherMode = "palette" | "action-field"'), true)
  assert.equal(launcher.includes("export function WorkUnitLauncher"), true)
  assert.equal(palette.includes("export function CommandPaletteView"), true)
  assert.equal(actionField.includes("export function ActionFieldView"), true)
  assert.equal(editor.includes("export function ActionFieldEditor"), true)
  assert.equal(tree.includes("export function WorkUnitTreeMap"), true)
})

test("WorkUnitOSDashboard renders launcher by default with legacy flag fallback", async () => {
  const entry = await source("app/components/workunit-os/WorkUnitOSDashboard.tsx")
  assert.equal(entry.includes("<WorkUnitLauncher />"), true)
  assert.equal(entry.includes("NEXT_PUBLIC_WORKUNIT_LEGACY_DASHBOARD"), true)
  assert.equal(entry.includes("useLegacyDashboard ? <AdoptedWorkUnitDashboard /> : <WorkUnitLauncher />"), true)
})

test("launcher keyboard model remains represented", async () => {
  const keyboard = await source("app/lib/application/launcher/keyboardNavigationModel.ts")
  assert.equal(keyboard.includes('return "open_palette"'), true)
  assert.equal(keyboard.includes('return "confirm"'), true)
})

test("launcher entry renders the Atra workspace and feeds it model data", async () => {
  const launcher = await source("app/components/workunit-os/launcher/WorkUnitLauncher.tsx")
  assert.equal(launcher.includes("export function WorkUnitLauncher"), true)
  assert.equal(launcher.includes("<AtraWorkspace"), true)
  // Atra workspace is props-driven from the real Inbox read path, not static and
  // not the mock candidate bridge.
  assert.equal(launcher.includes("loadLauncherWorkUnits"), true)
  assert.equal(launcher.includes("candidateWorkUnitBridge"), false)
  assert.equal(launcher.includes("deriveAtraWorkspaceViewModel"), true)
  assert.equal(launcher.includes("workspace={workspace}"), true)
  // Command Palette is reachable via the existing CommandPaletteView.
  assert.equal(launcher.includes("CommandPaletteView"), true)
})

test("launcher files do not include forbidden command strings or tools route", async () => {
  const combined = (await Promise.all(launcherFiles.map(source))).join("\n")
  const forbidden = [
    "Send" + " Email",
    "Post" + " Slack",
    "Create" + " GitHub" + " Issue",
    "Create" + " Calendar" + " Event",
    "Database" + " Update",
    "External" + " Execute",
    "/api/workunit" + "/tools",
    "slack" + "_post",
    "gmail" + "_send",
    "github" + "_issue",
    "calendar" + "_create",
    "database" + "_update",
    "Direct" + " provider" + " mutation",
  ]
  for (const term of forbidden) assert.equal(combined.includes(term), false, term)
})

test("Action Field and WorkUnit Tree include required final UI structure", async () => {
  const editor = await source("app/components/workunit-os/launcher/ActionFieldEditor.tsx")
  const treeModel = await source("app/lib/application/launcher/workUnitTreeModel.ts")
  const actionField = await source("app/components/workunit-os/launcher/ActionFieldView.tsx")
  const combined = `${editor}\n${treeModel}\n${actionField}`
  assert.equal(actionField.includes("Focused WorkUnit"), false)
  for (const label of ["Sources", "Subtasks", "Evidence", "Drafts", "Dependencies", "Approval Context"]) {
    assert.equal(treeModel.includes(label), true, label)
  }
  assert.equal(editor.includes("AI-generated draft — editable"), true)
  assert.equal(editor.includes(">Edit<"), true)
  assert.equal(editor.includes(">Preview<"), true)
  for (const forbidden of ["Action Summary", "Evidence Capsule", "Detected Tools", "Decision Trace"]) {
    assert.equal(combined.includes(forbidden), false, forbidden)
  }
})

test("Action Field layout uses sibling cards without dominant global header", async () => {
  const css = await source("app/components/workunit-os/launcher/WorkUnitLauncher.module.css")
  const actionField = await source("app/components/workunit-os/launcher/ActionFieldView.tsx")
  assert.equal(actionField.includes("actionHeader"), false)
  assert.equal(css.includes("grid-template-columns: minmax(0, 46%) minmax(0, 54%)"), true)
  assert.equal(css.includes(".treePanel,\n.editorPanel"), true)
})

test("Action Field toolbar controls are code-based, grouped, and accessible", async () => {
  const editor = await source("app/components/workunit-os/launcher/ActionFieldEditor.tsx")
  const css = await source("app/components/workunit-os/launcher/WorkUnitLauncher.module.css")
  for (const label of ["Text style", "Bold", "Italic", "Underline", "Ordered list", "Bullet list", "Code", "Quote", "Link", "Mention", "More"]) {
    assert.equal(editor.includes(`label: "${label}"`), true, label)
  }
  assert.equal(editor.includes("function ToolbarIcon"), true)
  assert.equal(editor.includes("<svg"), true)
  assert.equal(editor.includes("<img"), false)
  assert.equal(editor.includes(".png"), false)
  assert.equal(editor.includes(".jpg"), false)
  assert.equal(editor.includes("aria-label={tool.label}"), true)
  assert.equal(editor.includes("aria-pressed={tool.toggle ? isActive : undefined}"), true)
  assert.equal(editor.includes("title={tool.label}"), true)
  for (const className of [
    ".editorToolbar",
    ".editorToolbarGroup",
    ".editorToolbarSelect",
    ".editorToolbarButton",
    ".editorToolbarButtonActive",
    ".editorToolbarSeparator",
    ".editorToolbarIcon",
  ]) {
    assert.equal(css.includes(className), true, className)
  }
  assert.equal(css.includes(".editorToolbarButton:focus-visible"), true)
  assert.equal(css.includes("stroke: currentColor"), true)
  const forbiddenLabels = [
    "Send" + " Email",
    "Post" + " Slack",
    "Create" + " GitHub" + " Issue",
    "Create" + " Calendar" + " Event",
    "Database" + " Update",
    "External" + " Execute",
  ]
  for (const forbidden of forbiddenLabels) {
    assert.equal(editor.includes(forbidden), false, forbidden)
  }
})

test("launcher icon usage is local and does not add external icon packages", async () => {
  const packageJson = await source("package.json")
  const selection = await source("app/lib/application/launcher/workUnitSelectionModel.ts")
  const sourceIcon = await source("app/components/workunit-os/launcher/SourceAppIcon.tsx")
  assert.equal(packageJson.includes("lucide-react"), false)
  assert.equal(selection.includes("sourceIcon: resolveSourceAppIcon"), true)
  assert.equal(selection.includes("iconSrc"), false)
  assert.equal(sourceIcon.includes("isLocalSourceAppIconAssetPath"), true)
})

test("generated artifacts are not tracked", () => {
  const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
  const forbiddenPrefixes = [
    "desktop/",
    ".dev.vars",
    ".env.local",
    ".next/",
    ".open-next/",
    ".npm-cache/",
    ".wrangler/",
    "_app_semantic_inventory",
    "_app_tree_audit",
    "_tmp_revert",
  ]
  for (const prefix of forbiddenPrefixes) assert.equal(tracked.includes(prefix), false, prefix)
})
