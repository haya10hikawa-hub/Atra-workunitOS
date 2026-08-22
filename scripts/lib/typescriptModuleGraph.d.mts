export type ModuleReferenceKind = "import" | "import-type" | "export" | "import-equals" | "dynamic-import" | "require" | "import-type-expression"
export type ModuleReference = { kind: ModuleReferenceKind; specifier: string }
export type ModuleEdge = ModuleReference & { file: string; resolvedTarget: string }
export type LegacyEdge = ModuleEdge & { category: "legacy-target" | "legacy-surface" }

/** Structural status of one ratified WU-10 legacy root identity. */
export type LegacyRootStatus = "OPEN" | "CLOSED"
export type LegacyRootScan = {
  /** The ratified identity, always present even when the root is CLOSED. */
  root: string
  status: LegacyRootStatus
  /** Whether the physical directory exists. A CLOSED root may be present and empty, or absent. */
  present: boolean
  /** Repo-relative paths, sorted. Empty exactly when the root is CLOSED. */
  files: string[]
}

/**
 * The four ratified WU-10 legacy root identities. Permanent measurement identities: a root closes
 * by being emptied, never by leaving this list.
 */
export const LEGACY_ROOT_IDENTITIES: readonly string[]

export function listFiles(dir: string): Promise<string[]>
export function scanLegacyRoot(rootDir: string, identity: string): Promise<LegacyRootScan>
export function scanLegacyRoots(rootDir: string, identities?: readonly string[]): Promise<LegacyRootScan[]>
export function legacyEdgesTouchingRoot<T extends { file: string; resolvedTarget: string }>(
  edges: T[], identity: string): T[]
export function isCodeFilePath(filePath: string): boolean
export function extractModuleReferences(source: string, filePath?: string): ModuleReference[]
export function scanModuleGraph(rootDir: string, scanRoots: string[]): Promise<ModuleEdge[]>
export function legacyEdgeKey(edge: ModuleEdge): string
export function findLegacyEdges(edges: ModuleEdge[]): LegacyEdge[]
export function multisetDifference(left: string[], right: string[]): string[]
export function resolveModuleTarget(rootDir: string, filePath: string, specifier: string): string
