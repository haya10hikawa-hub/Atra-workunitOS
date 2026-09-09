#!/usr/bin/env node
// WU-10 pre-cleanup measurement. Reports entry-point-rooted reachability and
// non-import references over the source-controlled tree, and reconciles the
// result against the checked-in surface artifact.
//
// This command measures. It authorises no deletion: a module classified
// UNREACHABLE is a candidate for human adjudication, not a cleanup target, and
// reachability is not a product-disposition decision.
//
//   node scripts/report-reachability-surface.mjs [--write]

import path from "node:path"
import { fileURLToPath } from "node:url"
import { writeFile } from "node:fs/promises"
import {
  canonicalJson,
  collectFailures,
  computeReachabilitySurface,
  readContract,
} from "./lib/reachability/surface.mjs"

const rootDir = fileURLToPath(new URL("../", import.meta.url))
const fixturePath = path.join(rootDir, "tests/fixtures/architecture/reachability-surface.v1.json")
const write = process.argv.includes("--write")

const { report } = await computeReachabilitySurface(rootDir)

if (write) {
  await writeFile(fixturePath, canonicalJson(report))
  console.log(`Wrote ${path.relative(rootDir, fixturePath)}`)
}

const contract = await readContract(fixturePath)
const failures = collectFailures(report, contract, { enforcePositiveControls: true })

printSection("Modules", {
  "tracked files": report.counts.trackedFiles,
  modules: report.counts.modules,
  "module edges": report.counts.moduleEdges,
})
printSection("Entry points", report.counts.entrypointsByClass)
printSection("Reachability classifications", report.counts.classificationsByKind)
printSection("Non-import references by type", report.counts.referencesByType)
printSection("Non-import references by resolution", report.counts.referencesByResolution)
printSection("Unknown and unresolved", {
  "unknown entry points": report.entrypoints.filter((entry) => entry.entryClass === "UNKNOWN").length,
  "unknown classifications": Object.values(report.classifications).filter((entry) => entry.classification === "UNKNOWN").length,
  "unresolved references": report.unresolvedReferences.length,
  "ambiguous references": report.ambiguousReferences.length,
  "documentation anomalies": report.documentationAnomalies.length,
})

console.log("Positive controls:")
for (const [control, entries] of Object.entries(report.positiveControls)) {
  for (const [target, count] of Object.entries(entries)) {
    console.log(`- ${control} ${target}: ${count}`)
  }
}

console.log(`Drift status: ${failures.length === 0 ? "clean" : `${failures.length} failure(s)`}`)
for (const failure of failures) console.log(`- ${failure}`)
if (failures.length > 0) process.exitCode = 1

function printSection(label, entries) {
  console.log(`${label}:`)
  for (const [key, value] of Object.entries(entries)) console.log(`- ${key}: ${value}`)
}
