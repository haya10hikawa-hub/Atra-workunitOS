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

export declare const BOOTSTRAP_CONFIRM_PHRASE: string
export declare const BOOTSTRAP_BINDING: "CONTROL_DB"

export declare function inspectBootstrapArtifact(path?: string, repoRoot?: string): GateResult
export declare function parseBindingArg(argv: string[]): string
export declare function evaluateBootstrapGates(input?: BootstrapGateInput): GateResult
