import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { toCanonicalLauncherItem } from "../app/lib/application/launcher/canonicalLauncherItem.ts"
import { loadC0LauncherValidationInput } from "../app/lib/application/phase1/c0LauncherValidationInput.ts"

const projection = Object.freeze({
  candidateId: "candidate-1",
  title: "Inspect canonical candidate",
  sourceIds: Object.freeze(["source-b", "source-a"]),
  summary: "Explicit summary",
  missingInformation: Object.freeze(["owner"]),
  humanReviewRequired: true as const,
})

test("canonical Launcher handoff preserves projection truth and excludes legacy semantics", () => {
  const before = structuredClone(projection)
  const item = toCanonicalLauncherItem(projection)
  assert.deepEqual(item.sourceIds, ["source-b", "source-a"])
  assert.deepEqual(item.missingInformation, ["owner"])
  assert.equal(item.candidateId, "candidate-1")
  assert.equal(item.summary, "Explicit summary")
  assert.equal(item.humanReviewRequired, true)
  assert.deepEqual(projection, before)
  for (const field of ["source", "status", "roi", "objective", "kind", "priority", "ownerLabel", "sourceIcon"]) {
    assert.equal(Object.hasOwn(item, field), false, `${field} must not be synthesized`)
  }
})

test("source inspection is fail-closed when CandidateProjection has no locator", () => {
  const item = toCanonicalLauncherItem(projection)
  assert.deepEqual(item.sourceInspection, {
    status: "blocked",
    reason: "source_locator_not_projected",
  })
  assert.equal(Object.hasOwn(item, "sourceUrl"), false)
})

test("default Launcher input is the frozen canonical C0 projection", () => {
  const result = loadC0LauncherValidationInput()
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.deepEqual(result.items.map((item) => item.candidateId), ["candidate-work-001"])
  assert.deepEqual(result.items[0]?.sourceIds, ["src-github-issue-207", "src-github-pull-229"])
})

test("runtime validation input stays equal to the non-admissible C0 fixture", async () => {
  const fixture = JSON.parse(await readFile(path.join(process.cwd(), "tests/fixtures/phase1/c0.v1.json"), "utf8"))
  const result = loadC0LauncherValidationInput()
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.deepEqual(result.items[0], {
    presentationKind: "canonical_candidate",
    ...fixture.projection,
    sourceInspection: { status: "blocked", reason: "source_locator_not_projected" },
  })
})

test("canonical runtime path cannot route through SafeWorkUnitCandidate or the legacy adapter", async () => {
  const adapter = await readFile(new URL("../app/lib/application/launcher/canonicalLauncherItem.ts", import.meta.url), "utf8")
  const launcher = await readFile(new URL("../app/components/workunit-os/launcher/WorkUnitLauncher.tsx", import.meta.url), "utf8")
  assert.doesNotMatch(adapter, /SafeWorkUnitCandidate|candidateToLauncherWorkUnit/)
  assert.match(adapter, /projection: CandidateProjection/)
  assert.match(launcher, /loadC0LauncherValidationInput/)
  assert.doesNotMatch(launcher, /candidateWorkUnitBridge|candidatesToLauncherWorkUnits|SafeWorkUnitCandidate/)
  const legacy = await readFile(new URL("../app/components/workunit-os/launcher/LegacyMockWorkUnitLauncher.tsx", import.meta.url), "utf8")
  assert.match(legacy, /Compatibility only: this mock presentation path is not canonical product authority/)
})
