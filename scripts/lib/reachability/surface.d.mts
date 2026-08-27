import type { ModuleEdge } from "../typescriptModuleGraph.d.mts"
import type { Classification, ModuleClassification } from "./closure.d.mts"
import type { EntryClass, Entrypoint } from "./entrypoints.d.mts"
import type { Inventory } from "./inventory.d.mts"
import type { DocumentationAnomaly, NonImportReference, ReferenceType } from "./references.d.mts"

export type ReferenceRecord = {
  sourceFile: string
  referenceType: ReferenceType
  referencedValue: string
  normalizedTarget: string | null
}

export type SurfaceCounts = {
  trackedFiles: number
  modules: number
  moduleEdges: number
  entrypoints: number
  entrypointsByClass: Partial<Record<EntryClass, number>>
  classificationsByKind: Partial<Record<Classification, number>>
  referencesByType: Partial<Record<ReferenceType, number>>
  referencesByResolution: Record<string, number>
}

export type ReachabilitySurface = {
  version: number
  instrument: "reachability-surface"
  counts: SurfaceCounts
  entrypoints: Entrypoint[]
  classifications: Record<string, { classification: Classification; reachedBy: EntryClass[] }>
  moduleReferences: Record<string, string[]>
  unresolvedReferences: ReferenceRecord[]
  ambiguousReferences: ReferenceRecord[]
  documentationAnomalies: DocumentationAnomaly[]
  positiveControls: {
    pathStringTargets: Record<string, number>
    documentationCommandTargets: Record<string, number>
  }
}

export const SURFACE_VERSION: number
export const POSITIVE_CONTROLS: { pathStringTargets: string[]; documentationCommandTargets: string[] }

export function computeReachabilitySurface(
  rootDir: string,
  options?: { listFilesFor?: (rootDir: string) => Promise<string[]> },
): Promise<{
  report: ReachabilitySurface
  inventory: Inventory
  references: NonImportReference[]
  moduleEdges: ModuleEdge[]
  entrypoints: Entrypoint[]
  classifications: ModuleClassification[]
}>
export function collectFailures(
  report: ReachabilitySurface,
  contract?: ReachabilitySurface,
  options?: { enforcePositiveControls?: boolean },
): string[]
export function driftFailures(report: ReachabilitySurface, contract: ReachabilitySurface): string[]
export function machineIndependenceFailures(report: ReachabilitySurface): string[]
export function canonicalJson(value: unknown): string
export function readContract(fixturePath: string): Promise<ReachabilitySurface>
