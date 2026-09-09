import type { Inventory } from "./inventory.d.mts"
import type { NonImportReference } from "./references.d.mts"

export type EntryClass = "PRODUCTION" | "OPERATOR" | "TEST" | "DOCUMENTATION" | "UNKNOWN"
export type Entrypoint = { file: string; entryClass: EntryClass; discoveredVia: string[] }

export const ENTRY_CLASSES: EntryClass[]

export function locationEntryClass(file: string): EntryClass | undefined
export function discoveryEntryClass(discoveredVia: string): EntryClass | undefined
export function isNextEntrypoint(file: string): boolean
export function isTestEntrypoint(file: string): boolean
export function isAmbientDeclaration(inventory: Inventory, file: string): boolean
export function isDeclarationFile(file: string): boolean
export function discoverEntrypoints(inventory: Inventory, references: NonImportReference[]): Entrypoint[]
