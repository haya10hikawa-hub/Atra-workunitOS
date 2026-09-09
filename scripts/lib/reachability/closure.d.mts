import type { ModuleEdge } from "../typescriptModuleGraph.d.mts"
import type { EntryClass, Entrypoint } from "./entrypoints.d.mts"
import type { Inventory } from "./inventory.d.mts"
import type { NonImportReference } from "./references.d.mts"

export type Classification =
  | "PRODUCTION_REACHABLE"
  | "OPERATOR_REACHABLE"
  | "TEST_ONLY"
  | "DOCUMENTATION_ONLY"
  | "UNREACHABLE"
  | "UNKNOWN"

export type ModuleClassification = { file: string; classification: Classification; reachedBy: EntryClass[] }

export const CLASSIFICATIONS: Classification[]

export function scanTrackedModuleEdges(rootDir: string, inventory: Inventory): Promise<ModuleEdge[]>
export function runtimeCounterparts(inventory: Inventory, target: string): string[]
export function buildAdjacency(
  inventory: Inventory,
  moduleEdges: ModuleEdge[],
  nonImportReferences: NonImportReference[],
): Map<string, Set<string>>
export function computeReachability(
  inventory: Inventory,
  entrypoints: Entrypoint[],
  adjacency: Map<string, Set<string>>,
): ModuleClassification[]
