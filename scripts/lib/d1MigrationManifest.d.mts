/**
 * Type declarations for the dependency-free D1 migration manifest library
 * (P0-PERSIST-015). The implementation is `d1MigrationManifest.mjs`.
 */

export type Binding = "CONTROL_DB" | "TENANT_DB_DEFAULT"
export type MigrationKind = "schema" | "index"

/**
 * How a migration may be applied.
 *   - `replay_safe`: raw SQL is re-runnable against an already-migrated database.
 *   - `once`: raw SQL is NOT re-runnable; applied exactly once via the ledger.
 * There is deliberately no "deferred"/"skip" mode: a required migration is never
 * hidden from operations.
 */
export type MigrationApplyMode = "replay_safe" | "once"

/** Deterministic schema probe proving a `once` migration's change landed. */
export interface MigrationEffect {
  type: "column_exists"
  table: string
  column: string
}

export interface MigrationEntry {
  sequence: number
  binding: Binding
  path: string
  sha256: string
  kind: MigrationKind
  apply: MigrationApplyMode
  /** Required when `apply` is `once`. */
  effect?: MigrationEffect
  note?: string
}

/**
 * The canonical registry declaration for a binding: the ONE source of
 * `tenant_databases.schema_version`, pinned to a digest of the lane it describes.
 */
export interface RegistryDeclaration {
  schemaVersion: string
  planDigest: string
  note?: string
}

export interface Manifest {
  patchId: string
  version: number
  description?: string
  applyModes?: Record<MigrationApplyMode, string>
  bindings: Binding[]
  registry: Partial<Record<Binding, RegistryDeclaration>>
  lanes: Record<Binding, MigrationEntry[]>
}

export interface PlanStep {
  binding: Binding
  sequence: number
  path: string
  name: string
  kind: MigrationKind
  apply: MigrationApplyMode
  effect?: MigrationEffect
  sha256: string
}

export type LoadManifestResult =
  | { ok: true; manifest: Manifest }
  | { ok: false; error: string }

export type PathResolution =
  | { ok: true; absPath: string; name: string }
  | { ok: false; failure: string; name: string }

export interface FailureReport { ok: boolean; failures: string[] }

export declare const MANIFEST_RELATIVE_PATH: string
export declare const KNOWN_BINDINGS: readonly Binding[]
export declare const KNOWN_KINDS: readonly MigrationKind[]
export declare const MIGRATION_APPLY_MODES: readonly MigrationApplyMode[]

export declare function loadManifest(repoRoot: string): LoadManifestResult
export declare function resolveMigrationPath(repoRoot: string, relPath: unknown): PathResolution
export declare function computeDigest(absPath: string): string
export declare function isValidEffectProbe(effect: unknown): boolean
export declare function listCommittedMigrationFiles(repoRoot: string): string[]

export declare const REGISTRY_BINDING: "TENANT_DB_DEFAULT"
/** Deterministic digest of a binding's ordered lane. */
export declare function computeRegistryPlanDigest(manifest: unknown, binding?: string): string
/**
 * The canonical `tenant_databases.schema_version`, or null when the manifest does
 * not declare a valid one. Never derived from operator input.
 */
export declare function tenantRegistrySchemaVersion(manifest: unknown): string | null
export declare function validateManifest(manifest: unknown, repoRoot: string): FailureReport
export declare function buildPlan(manifest: unknown, binding: string): PlanStep[]
export declare function buildAllPlans(manifest: unknown): Record<Binding, PlanStep[]>
export declare function scanMigrationSqlSafety(repoRoot: string, manifest: unknown): FailureReport
export declare function manifestDigest(manifest: unknown): string
