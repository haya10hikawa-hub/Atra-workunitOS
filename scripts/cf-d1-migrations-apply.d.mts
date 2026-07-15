/** Type declarations for cf:d1:migrations:apply (P0-PERSIST-015, operator-gated). */
import type { Binding } from "./lib/d1MigrationManifest.d.mts"

export interface ApplyGateInput {
  env?: Record<string, string | undefined>
  argv?: string[]
  repoRoot?: string
  configPath?: string
}
export interface ApplyCommand { binding: Binding; name: string; args: string[] }

export declare const MIGRATE_CONFIRM_PHRASE: string
export declare function evaluateApplyGates(input?: ApplyGateInput): { ok: boolean; blocked: string[] }
export declare function buildApplyCommands(repoRoot: string, configPath: string): ApplyCommand[]
