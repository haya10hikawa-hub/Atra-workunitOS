/**
 * Type declarations for the dependency-free D1 migration manifest library
 * (P0-PERSIST-015). The implementation is `d1MigrationManifest.mjs`.
 */

export type Binding = "CONTROL_DB" | "TENANT_DB_DEFAULT"
export type MigrationKind = "schema" | "index"

export interface MigrationEntry {
  sequence: number
  binding: Binding
  path: string
  sha256: string
  kind: MigrationKind
  idempotent: boolean
}

export interface DeferredEntry {
  binding: Binding
  path: string
  sha256: string
  kind: string
  idempotent: boolean
  reason?: string
  note?: string
}

export interface Manifest {
  patchId: string
  version: number
  description?: string
  bindings: Binding[]
  lanes: Record<Binding, MigrationEntry[]>
  deferred?: DeferredEntry[]
}

export interface PlanStep {
  binding: Binding
  sequence: number
  path: string
  name: string
  kind: MigrationKind
  idempotent: boolean
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

export declare function loadManifest(repoRoot: string): LoadManifestResult
export declare function resolveMigrationPath(repoRoot: string, relPath: unknown): PathResolution
export declare function computeDigest(absPath: string): string
export declare function validateManifest(manifest: unknown, repoRoot: string): FailureReport
export declare function buildPlan(manifest: unknown, binding: string): PlanStep[]
export declare function buildAllPlans(manifest: unknown): Record<Binding, PlanStep[]>
export declare function scanMigrationSqlSafety(repoRoot: string, manifest: unknown): FailureReport
export declare function manifestDigest(manifest: unknown): string
