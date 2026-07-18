/**
 * Type declarations for the reproducible D1 migration runner + environment gate
 * (P0-FIX-D1-OPERATIONAL-CONTRACT). The implementation is `d1MigrationRunner.mjs`.
 */

import type { Binding, Manifest, PlanStep } from "./d1MigrationManifest.mjs"

export declare const KNOWN_BINDINGS: readonly Binding[]
export declare const KNOWN_ENVIRONMENTS: readonly string[]
export declare const KNOWN_VERBS: readonly string[]

export type MigrationEnvironment = "local" | "staging"
export type MigrationVerb = "plan" | "apply" | "verify"

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

export interface RegistryCouplingResult {
  ok: boolean
  registry_version_matches_manifest: boolean
  ledger_matches_manifest: boolean
  physical_schema_matches_contract: boolean
}

export interface TrustedStagingContext {
  account?: string
  project?: string
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
export declare function verifyRegistryCoupling(
  dbFor: (binding: string) => unknown,
  repoRoot: string,
  registrySchemaVersion: string,
): RegistryCouplingResult
export declare function parseMigrateArgs(argv: string[]): { flags: MigrateFlags; unknown: string[] }
export declare function validateInvocation(
  verb: string,
  flags: MigrateFlags,
  unknown?: string[],
  expected?: TrustedStagingContext,
): InvocationDecision
export declare function loadTrustedStagingContext(env?: Record<string, string | undefined>): TrustedStagingContext
