/** Type declarations for cf:d1:bootstrap:apply (P0-PERSIST-015, operator-gated). */

import type { DeployConfigAuthority } from "./lib/cfDeployConfigAuthority.d.mts"

export interface BootstrapGateInput {
  env?: Record<string, string | undefined>
  argv?: string[]
  repoRoot?: string
  configPath?: string
  sqlPath?: string
}

export interface GateResult {
  ok: boolean
  /** Safe reason codes only — never an operator value. */
  blocked: string[]
}

/**
 * Gate evaluation returns the two authority-bearing snapshots to execute with:
 * the canonical SQL bytes and the validated deploy config. Both are null whenever
 * any gate blocked, so a caller that forgets to check `ok` cannot execute.
 */
export interface BootstrapGateResult extends GateResult {
  /**
   * The canonical SQL reconstructed from the current operator authority, retained
   * so the caller executes THESE bytes rather than re-reading a mutable path.
   */
  canonicalSql: string | null
  /**
   * The retained deploy-config authority, from the SHARED library. The private
   * execution config is written from its EXACT bytes — never from a re-read of the
   * operator's mutable path, and never from a re-serialized parsed object.
   */
  configAuthority: DeployConfigAuthority | null
  /** The authority's recursively immutable parsed view, for comparisons. */
  configSnapshot: Readonly<Record<string, unknown>> | null
}

export type CanonicalArtifactResult =
  | { ok: true; sql: string }
  | { ok: false; blocked: string[] }

export declare const BOOTSTRAP_CONFIRM_PHRASE: string
export declare const BOOTSTRAP_BINDING: "CONTROL_DB"
/**
 * The five INSERTs commit before the read-only verification runs, so a verification
 * failure is an operator-action state — never described as a rollback.
 */
export declare const VERIFICATION_FAILED_AFTER_COMMIT: "bootstrap_verification_failed_after_commit"

export declare function inspectBootstrapArtifact(path?: string, repoRoot?: string): GateResult
export declare function validateCanonicalArtifact(input: { values: unknown; path?: string }): CanonicalArtifactResult
export declare function evaluateRegistryBinding(values: unknown, config: unknown): GateResult
export declare function parseBindingArg(argv: string[]): string
export declare function evaluateBootstrapGates(input?: BootstrapGateInput): BootstrapGateResult
