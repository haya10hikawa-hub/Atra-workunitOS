import type { Inventory } from "./inventory.d.mts"
import type { ResolutionStatus } from "./targets.d.mts"

export type ReferenceType =
  | "PATH_STRING"
  | "CONFIG_REFERENCE"
  | "PACKAGE_SCRIPT"
  | "OPERATOR_COMMAND"
  | "DOCUMENTATION_COMMAND"

export type NonImportReference = {
  sourceFile: string
  referenceType: ReferenceType
  referencedValue: string
  normalizedTarget: string | undefined
  resolution: ResolutionStatus | "package_script"
  location: string | undefined
}

export type DocumentationAnomaly = { file: string; anomaly: "unterminated_code_fence"; line: number }
export type WorkflowRunStep = { command: string; location: string }

export const REFERENCE_TYPES: ReferenceType[]

export function isConfigFile(file: string): boolean
export function isDocumentationFile(file: string): boolean
export function scanNonImportReferences(rootDir: string, inventory: Inventory): Promise<{
  references: NonImportReference[]
  documentationAnomalies: DocumentationAnomaly[]
}>
export function readDocumentationCommands(source: string, file?: string): {
  commands: string[]
  anomalies: DocumentationAnomaly[]
}
export function readWorkflowRunSteps(source: string, file?: string): WorkflowRunStep[]
export function collectSourceStringLiterals(source: string, filePath?: string): string[]
export function referenceKey(reference: NonImportReference): string
