/** Type declarations for cf:d1:migrations:apply (P0-PERSIST-015, operator-gated). */
import type { Binding, MigrationApplyMode } from "./lib/d1MigrationManifest.d.mts"
import type { DeployConfigAuthority } from "./lib/cfDeployConfigAuthority.d.mts"

export interface ApplyGateInput {
  env?: Record<string, string | undefined>
  argv?: string[]
  repoRoot?: string
  configPath?: string
}
export interface ApplyCommand { binding: Binding; name: string; apply: MigrationApplyMode; args: string[] }

export interface ApplyGateResult {
  ok: boolean
  /** Safe reason codes only. */
  blocked: string[]
  /**
   * The retained deploy-config authority — returned ONLY when every gate
   * passed, so a caller that forgets to check `ok` cannot execute.
   */
  configAuthority: DeployConfigAuthority | null
}

export declare const MIGRATE_CONFIRM_PHRASE: string
export declare function evaluateApplyGates(input?: ApplyGateInput): ApplyGateResult
/**
 * The operator-visible PLAN of what an apply would do. `displayConfigPath` only
 * labels it for a human — it is never passed to Wrangler.
 */
export declare function buildApplyCommands(repoRoot: string, displayConfigPath: string): ApplyCommand[]
