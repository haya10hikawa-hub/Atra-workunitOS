export type ModuleReferenceKind = "import" | "import-type" | "export" | "import-equals" | "dynamic-import" | "require" | "import-type-expression"
export type ModuleReference = { kind: ModuleReferenceKind; specifier: string }
export type ModuleEdge = ModuleReference & { file: string; resolvedTarget: string }
export type LegacyEdge = ModuleEdge & { category: "legacy-target" | "legacy-surface" }

export function listFiles(dir: string): Promise<string[]>
export function isCodeFilePath(filePath: string): boolean
export function extractModuleReferences(source: string, filePath?: string): ModuleReference[]
export function scanModuleGraph(rootDir: string, scanRoots: string[]): Promise<ModuleEdge[]>
export function legacyEdgeKey(edge: ModuleEdge): string
export function findLegacyEdges(edges: ModuleEdge[]): LegacyEdge[]
export function multisetDifference(left: string[], right: string[]): string[]
export function resolveModuleTarget(rootDir: string, filePath: string, specifier: string): string
