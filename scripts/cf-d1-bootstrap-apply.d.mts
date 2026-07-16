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

/** Gate evaluation additionally returns the validated canonical bytes to execute. */
export interface BootstrapGateResult extends GateResult {
  /**
   * The canonical SQL reconstructed from the current operator authority, retained
   * so the caller executes THESE bytes rather than re-reading a mutable path.
   * Null whenever any gate blocked.
   */
  canonicalSql: string | null
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
