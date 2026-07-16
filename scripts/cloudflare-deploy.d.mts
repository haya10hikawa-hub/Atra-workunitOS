/** Type declarations for the Cloudflare deploy orchestrator. */

import type { DeployConfigAuthority } from "./lib/cfDeployConfigAuthority.d.mts"

/**
 * A pipeline step. `args` is a FUNCTION of the PRIVATE execution config — no step
 * may name the original generated config, so none can be handed a file that changed
 * after validation.
 *
 * `verify-remote-schema` has no `cmd`: it runs in-process against the same retained
 * authority the deploy uses (`inProcess`), rather than spawning a child that would
 * snapshot the config a second time.
 */
export interface DeployStep {
  name: string
  cmd?: string
  args?: (executionConfig: string) => string[]
  remote?: boolean
  /** Runs before the authority is loaded (only `prepare`, which produces it). */
  beforeAuthority?: boolean
  /** Runs in-process through the shared library rather than a child process. */
  inProcess?: string
}

export interface RunPipelineDeps {
  verifyRemoteSchemas?: (authority: DeployConfigAuthority, options: { repoRoot: string }) => { ok: boolean; failures: string[] }
  run?: (step: DeployStep, executionConfig: string) => boolean
}

export declare const DEPLOY_STEPS: DeployStep[]

/**
 * Run the pipeline after `prepare`. Returns an exit code and never calls
 * `process.exit` — the caller's `finally` must remove the private execution config
 * first.
 */
export declare function runPipeline(
  authority: DeployConfigAuthority,
  executionConfig: string,
  execute: boolean,
  deps?: RunPipelineDeps,
): number
