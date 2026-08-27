import { readFile } from "node:fs/promises"
import { multisetDifference } from "../typescriptModuleGraph.mjs"
import { buildAdjacency, CLASSIFICATIONS, computeReachability, scanTrackedModuleEdges } from "./closure.mjs"
import { discoverEntrypoints, ENTRY_CLASSES } from "./entrypoints.mjs"
import { buildInventory } from "./inventory.mjs"
import { REFERENCE_TYPES, scanNonImportReferences } from "./references.mjs"
import { RESOLUTION_STATUSES } from "./targets.mjs"

export const SURFACE_VERSION = 1

// Reference classes that name something to execute. An executable reference
// that does not resolve is a broken operator or documented command, and is
// fatal rather than reconciled.
const executableReferenceTypes = new Set(["PACKAGE_SCRIPT", "OPERATOR_COMMAND", "DOCUMENTATION_COMMAND"])

/**
 * Non-vacuity controls. These are known current references, not deletion
 * candidates: if the instrument stops reporting them it has gone blind, and
 * saying so is more useful than a clean report.
 */
export const POSITIVE_CONTROLS = {
  pathStringTargets: [
    "app/lib/workunitInbox",
    "app/lib/actionField",
    "app/components/workunitInbox",
    "app/components/legacy/workunitInbox",
  ],
  documentationCommandTargets: [
    "prototypes/proactive-voice-secretary/voiceLoop.mts",
  ],
}

export async function computeReachabilitySurface(rootDir, options = {}) {
  const inventory = await buildInventory(rootDir, options.listFilesFor)
  const { references, documentationAnomalies } = await scanNonImportReferences(rootDir, inventory)
  const entrypoints = discoverEntrypoints(inventory, references)
  const moduleEdges = await scanTrackedModuleEdges(rootDir, inventory)
  const classifications = computeReachability(inventory, entrypoints, buildAdjacency(inventory, moduleEdges, references))

  const report = {
    version: SURFACE_VERSION,
    instrument: "reachability-surface",
    counts: buildCounts(inventory, moduleEdges, references, entrypoints, classifications),
    entrypoints,
    classifications: Object.fromEntries(classifications.map((entry) => [
      entry.file,
      { classification: entry.classification, reachedBy: entry.reachedBy },
    ])),
    moduleReferences: buildModuleReferences(inventory, references),
    unresolvedReferences: selectReferences(references, "unresolved"),
    ambiguousReferences: selectReferences(references, "ambiguous_basename"),
    documentationAnomalies,
    positiveControls: evaluatePositiveControls(references),
  }
  return { report, inventory, references, moduleEdges, entrypoints, classifications }
}

/**
 * Every condition under which the instrument refuses to report a clean surface.
 * Nothing here degrades to a warning: an unclassifiable entry point or an
 * unresolved executable reference means the measurement is incomplete, and an
 * incomplete measurement must not read as evidence that a module is dead.
 */
export function collectFailures(report, contract, { enforcePositiveControls = false } = {}) {
  const failures = []

  const unknownEntrypoints = report.entrypoints.filter((entry) => entry.entryClass === "UNKNOWN")
  for (const entry of unknownEntrypoints) {
    failures.push(`Entry point could not be classified: ${entry.file} (discovered via ${entry.discoveredVia.join(", ")})`)
  }

  for (const [file, entry] of Object.entries(report.classifications)) {
    if (entry.classification === "UNKNOWN") failures.push(`Module classification is UNKNOWN: ${file}`)
  }

  for (const reference of report.unresolvedReferences) {
    if (executableReferenceTypes.has(reference.referenceType)) {
      failures.push(`Executable reference does not resolve: ${reference.sourceFile} -> ${reference.referencedValue} (${reference.referenceType})`)
    }
  }

  // The positive controls name references that exist in this repository, so
  // they are only meaningful against it — a synthetic fixture legitimately has
  // none of them.
  if (enforcePositiveControls) {
    for (const failure of positiveControlFailures(report.positiveControls)) failures.push(failure)
  }
  for (const failure of machineIndependenceFailures(report)) failures.push(failure)
  if (contract !== undefined) for (const failure of driftFailures(report, contract)) failures.push(failure)

  return failures
}

export function driftFailures(report, contract) {
  const failures = []
  if (contract.version !== report.version) {
    failures.push(`Artifact version ${contract.version} does not match instrument version ${report.version}`)
    return failures
  }
  const actual = canonicalJson(stripCounts(report))
  const expected = canonicalJson(stripCounts(contract))
  if (actual === expected) {
    if (canonicalJson(report.counts) !== canonicalJson(contract.counts)) {
      failures.push("Reconciliation artifact counts drifted from the live scan")
    }
    return failures
  }
  for (const line of describeDrift(report, contract)) failures.push(line)
  if (failures.length === 0) failures.push("Reconciliation artifact drifted from the live scan")
  return failures
}

function describeDrift(report, contract) {
  const failures = []
  const compare = (label, actualKeys, expectedKeys) => {
    for (const added of multisetDifference(actualKeys, expectedKeys)) failures.push(`${label} added: ${added}`)
    for (const removed of multisetDifference(expectedKeys, actualKeys)) failures.push(`${label} removed: ${removed}`)
  }
  compare("Entry point", report.entrypoints.map(entrypointKey).sort(), (contract.entrypoints ?? []).map(entrypointKey).sort())
  compare(
    "Classification",
    Object.entries(report.classifications).map(classificationKey).sort(),
    Object.entries(contract.classifications ?? {}).map(classificationKey).sort(),
  )
  compare(
    "Module reference",
    flattenModuleReferences(report.moduleReferences),
    flattenModuleReferences(contract.moduleReferences ?? {}),
  )
  compare("Unresolved reference", report.unresolvedReferences.map(referenceLine).sort(), (contract.unresolvedReferences ?? []).map(referenceLine).sort())
  compare("Ambiguous reference", report.ambiguousReferences.map(referenceLine).sort(), (contract.ambiguousReferences ?? []).map(referenceLine).sort())
  compare("Documentation anomaly", report.documentationAnomalies.map(anomalyLine).sort(), (contract.documentationAnomalies ?? []).map(anomalyLine).sort())
  if (canonicalJson(report.positiveControls) !== canonicalJson(contract.positiveControls ?? {})) {
    failures.push("Positive controls drifted from the live scan")
  }
  if (canonicalJson(report.counts) !== canonicalJson(contract.counts)) {
    failures.push("Reconciliation artifact counts drifted from the live scan")
  }
  return failures
}

/**
 * The canonical output must be a function of the tree alone. An absolute path,
 * a home directory or a user name would make the artifact unreconcilable on any
 * other machine, so its presence is a failure rather than a cosmetic issue.
 */
export function machineIndependenceFailures(report) {
  const failures = []
  const serialized = canonicalJson(report)
  const patterns = [
    [/"\/[^"]*"/, "absolute path"],
    [/[A-Za-z]:\\\\/, "absolute Windows path"],
    [/\/(?:Users|home|root)\//, "home directory"],
    [/\bfile:\/\//, "file URL"],
    [/\d{13}|"\d{4}-\d{2}-\d{2}T/, "timestamp"],
  ]
  for (const [pattern, label] of patterns) {
    const match = pattern.exec(serialized)
    if (match !== null) failures.push(`Canonical output contains a machine-dependent ${label}: ${match[0].slice(0, 120)}`)
  }
  return failures
}

function positiveControlFailures(positiveControls) {
  return Object.entries(positiveControls)
    .flatMap(([control, entries]) => Object.entries(entries)
      .filter(([, count]) => count === 0)
      .map(([target]) => `Positive control produced no reference: ${control} ${target}`))
}

function evaluatePositiveControls(references) {
  const countFor = (referenceType, target) => references.filter((reference) =>
    reference.referenceType === referenceType
    && (reference.normalizedTarget === target || (reference.normalizedTarget ?? "").startsWith(`${target}/`))).length
  return {
    pathStringTargets: Object.fromEntries(POSITIVE_CONTROLS.pathStringTargets
      .map((target) => [target, countFor("PATH_STRING", target)])),
    documentationCommandTargets: Object.fromEntries(POSITIVE_CONTROLS.documentationCommandTargets
      .map((target) => [target, countFor("DOCUMENTATION_COMMAND", target)])),
  }
}

function buildCounts(inventory, moduleEdges, references, entrypoints, classifications) {
  return {
    trackedFiles: inventory.files.length,
    modules: inventory.modules.length,
    moduleEdges: moduleEdges.length,
    entrypoints: entrypoints.length,
    entrypointsByClass: tally(ENTRY_CLASSES, entrypoints.map((entry) => entry.entryClass)),
    classificationsByKind: tally(CLASSIFICATIONS, classifications.map((entry) => entry.classification)),
    referencesByType: tally(REFERENCE_TYPES, references.map((reference) => reference.referenceType)),
    referencesByResolution: tally([...RESOLUTION_STATUSES, "package_script"], references.map((reference) => reference.resolution)),
  }
}

function buildModuleReferences(inventory, references) {
  const grouped = new Map()
  for (const reference of references) {
    const target = reference.normalizedTarget
    if (target === undefined || !inventory.hasFile(target)) continue
    if (!grouped.has(target)) grouped.set(target, new Set())
    grouped.get(target).add(`${reference.referenceType} ${reference.sourceFile}`)
  }
  return Object.fromEntries([...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([target, entries]) => [target, [...entries].sort()]))
}

function selectReferences(references, resolution) {
  return references
    .filter((reference) => reference.resolution === resolution)
    .map((reference) => ({
      sourceFile: reference.sourceFile,
      referenceType: reference.referenceType,
      referencedValue: reference.referencedValue,
      normalizedTarget: reference.normalizedTarget ?? null,
    }))
    .sort((a, b) => referenceLine(a).localeCompare(referenceLine(b)))
}

function tally(keys, values) {
  const counts = new Map(keys.map((key) => [key, 0]))
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return Object.fromEntries([...counts.entries()].filter(([, count]) => count > 0).sort(([a], [b]) => a.localeCompare(b)))
}

function stripCounts(report) {
  return Object.fromEntries(Object.entries(report).filter(([key]) => key !== "counts"))
}

function entrypointKey(entry) {
  return `${entry.file} | ${entry.entryClass} | ${entry.discoveredVia.join(",")}`
}

function classificationKey([file, entry]) {
  return `${file} | ${entry.classification} | ${entry.reachedBy.join(",")}`
}

function flattenModuleReferences(moduleReferences) {
  return Object.entries(moduleReferences)
    .flatMap(([target, entries]) => entries.map((entry) => `${target} | ${entry}`))
    .sort()
}

function referenceLine(reference) {
  return `${reference.sourceFile} | ${reference.referenceType} | ${reference.referencedValue} | ${reference.normalizedTarget ?? ""}`
}

function anomalyLine(anomaly) {
  return `${anomaly.file} | ${anomaly.anomaly} | ${anomaly.line}`
}

/** Stable serialisation: key order is the insertion order the builders fixed. */
export function canonicalJson(value) {
  return `${JSON.stringify(value, undefined, 2)}\n`
}

export async function readContract(fixturePath) {
  return JSON.parse(await readFile(fixturePath, "utf8"))
}
