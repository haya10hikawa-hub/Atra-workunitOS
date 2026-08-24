import test from "node:test"
import assert from "node:assert/strict"
import { candidateWorkUnitBridge } from "../app/lib/application/candidate/candidateWorkUnitBridge.ts"
import { projectCandidate } from "../app/lib/application/phase1/candidateProjection.ts"
import { candidateToLauncherWorkUnit } from "../app/lib/application/launcher/candidateToLauncherWorkUnit.ts"
import { readFile } from "node:fs/promises"

test("Launcher carries the C0 projection, not grouping truth", () => {
  const candidate = candidateWorkUnitBridge().workUnits[0]!
  const projection = projectCandidate(candidate)
  const launcher = candidateToLauncherWorkUnit(candidate)
  assert.deepEqual(launcher.candidateProjection, projection)
  assert.equal("correlationGroupId" in launcher, false)
  assert.equal(projection.humanReviewRequired, true)
  assert.deepEqual(projection.missingInformation, [])
  assert.ok(projection.sourceIds.length > 0)
})

test("Launcher preview exposes projection evidence and never adds authority", async () => {
  const source = await readFile("app/components/workunit-os/launcher/CommandPaletteView.tsx", "utf8")
  for (const label of ["Candidate evidence", "Source records", "Context", "Missing information", "Human review required"]) {
    assert.equal(source.includes(label), true, label)
  }
  for (const forbidden of ["approve", "execute", "/api/workunit/tools", "correlationGroupId"]) {
    assert.equal(source.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden)
  }
})

test("missing information is preserved by the projection", () => {
  const candidate = { ...candidateWorkUnitBridge().workUnits[0]!, missingInformation: ["owner"] }
  assert.deepEqual(projectCandidate(candidate).missingInformation, ["owner"])
})
