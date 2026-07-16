/** Type declarations for cf:d1:bootstrap:apply (P0-PERSIST-015, operator-gated). */

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
   * The immutable (frozen) parsed deploy config the registry comparisons were made
   * against. The private execution config is written from THIS, never from a
   * re-read of the operator's mutable path.
   */
  configSnapshot: Readonly<Record<string, unknown>> | null
}

export type DeployConfigSnapshotResult =
  | { ok: true; snapshot: Readonly<Record<string, unknown>> }
  | { ok: false; blocked: string[] }

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

/** Hard size cap for the generated deploy config, enforced before parsing. */
export declare const DEPLOY_CONFIG_MAX_BYTES: number

export declare function inspectBootstrapArtifact(path?: string, repoRoot?: string): GateResult
export declare function validateCanonicalArtifact(input: { values: unknown; path?: string }): CanonicalArtifactResult
/**
 * Read + validate the generated deploy config ONCE and return an immutable
 * snapshot. The original path is never re-read after validation.
 */
export declare function loadDeployConfigSnapshot(configPath?: string, repoRoot?: string): DeployConfigSnapshotResult
/**
 * Write the validated snapshot to a fresh private (0600, exclusively created)
 * execution config and return its path. Content is exactly the snapshot.
 */
export declare function writeExecutionConfig(snapshot: unknown, repoRoot?: string): string
export declare function evaluateRegistryBinding(values: unknown, config: unknown): GateResult
export declare function parseBindingArg(argv: string[]): string
export declare function evaluateBootstrapGates(input?: BootstrapGateInput): BootstrapGateResult
