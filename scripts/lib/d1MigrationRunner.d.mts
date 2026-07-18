/**
 * Type declarations for the reproducible D1 migration runner + environment gate
 * (P0-FIX-D1-OPERATIONAL-CONTRACT). The implementation is `d1MigrationRunner.mjs`.
 */

import type { Binding, Manifest, PlanStep } from "./d1MigrationManifest.mjs"

export declare const KNOWN_BINDINGS: readonly Binding[]
export declare const KNOWN_ENVIRONMENTS: readonly string[]
export declare const KNOWN_VERBS: readonly string[]

export type MigrationEnvironment = "local" | "staging"
export type MigrationVerb = "plan" | "apply" | "verify" | "preflight"

export interface LaneApplyResult {
  applied: string[]
  skipped: string[]
}

export interface VerifyBindingResult {
  ledger: { ok: boolean; failures: string[]; states: { name: string; state: string }[] }
  schema: { ok: boolean; failures: unknown[] }
}

export type ResolveManifestResult =
  | { ok: true; manifest: Manifest }
  | { ok: false; error: string; failures?: string[] }

export interface PlanResult {
  ok: boolean
  plans: Record<Binding, PlanStep[]>
  lines: string[]
  error?: string
  failures?: string[]
}

export interface ApplyResult {
  ok: boolean
  perBinding: Record<Binding, LaneApplyResult>
  error?: string
  failures?: string[]
}

export interface VerifyResult {
  ok: boolean
  perBinding: Record<Binding, VerifyBindingResult>
  error?: string
  failures?: string[]
}

export interface TenantDatabaseCouplingResult {
  ok: boolean
  registry_row_present: boolean
  registry_mapping_active: boolean
  registry_version_matches_manifest: boolean
  ledger_matches_manifest: boolean
  physical_schema_matches_contract: boolean
  binding_matches_contract: boolean
}

export interface TrustedStagingContext {
  account?: string
  project?: string
}

export interface TrustedContextEvaluation {
  ok: boolean
  /** Present when `ok` is true. */
  value?: { account: string; project: string }
  /** Present when `ok` is false. */
  error?: string
}

export interface CallerAssertionEvaluation {
  ok: boolean
  /** Present when `ok` is false. */
  error?: string
}

export interface HermeticLocalResult {
  ok: boolean
  flags: { fresh_apply: boolean; replay_noop: boolean; verify_ok: boolean; cleanup: boolean }
  runError: string | null
  cleanupError: string | null
  reported: Record<string, boolean>
}

export interface HermeticLocalOptions {
  verb: string
  repoRoot: string
  makeTempRoot: () => string
  openDatabase: (root: string, binding: string) => unknown
  closeHandle: (handle: unknown) => void
  removeRoot: (root: string) => void
  rootExists: (root: string) => boolean
  applyAllFn?: typeof applyAll
  verifyAllFn?: typeof verifyAll
  schemaSignatureFn?: (db: unknown) => string
  now?: () => string
}

export interface MigrateFlags {
  environment: string | null
  remote: boolean
  confirmStaging: boolean
  account: string | null
  project: string | null
}

export interface InvocationPlan {
  verb: MigrationVerb
  environment: MigrationEnvironment
  remote: boolean
}

export interface InvocationDecision {
  ok: boolean
  /** Present when `ok` is true. */
  plan?: InvocationPlan
  /** Present when `ok` is false. */
  error?: string
}

export declare function resolveValidatedManifest(repoRoot: string): ResolveManifestResult
export declare function planAll(repoRoot: string): PlanResult
export declare function applyAll(
  dbFor: (binding: string) => unknown,
  repoRoot: string,
  options?: { now?: () => string },
): ApplyResult
export declare function verifyAll(dbFor: (binding: string) => unknown, repoRoot: string): VerifyResult
export declare function canonicalTenantSchemaVersion(repoRoot: string): string | null
export declare function verifyTenantDatabaseCoupling(input: {
  controlDb: unknown
  tenantDb: unknown
  tenantId: string
  repoRoot: string
}): TenantDatabaseCouplingResult
export declare function parseMigrateArgs(argv: string[]): { flags: MigrateFlags; unknown: string[] }
export declare function evaluateTrustedStagingContext(expected?: TrustedStagingContext): TrustedContextEvaluation
export declare function evaluateCallerAssertions(
  flags: MigrateFlags,
  trusted: { account: string; project: string },
): CallerAssertionEvaluation
export declare function validateInvocation(
  verb: string,
  flags: MigrateFlags,
  unknown?: string[],
  expected?: TrustedStagingContext,
): InvocationDecision
export declare function loadTrustedStagingContext(env?: Record<string, string | undefined>): TrustedStagingContext
export declare function runHermeticLocal(options: HermeticLocalOptions): HermeticLocalResult
