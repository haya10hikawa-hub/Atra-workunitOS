/** Type declarations for the Cloudflare deploy orchestrator. */

import type { DeployConfigAuthority } from "./lib/cfDeployConfigAuthority.d.mts"

/**
 * A pipeline step. A `usesConfig` step names `--config <scoped>` in its `args`, where
 * the scoped config is a fresh short-lived file minted from the retained authority
 * for that one invocation — no step is ever handed the original generated config, and
 * no config survives between steps.
 *
 * `verify-remote-schema` has no `cmd`: it runs in-process against the same retained
 * authority the deploy uses (`inProcess`), returning a digest the orchestrator matches
 * before deploy — rather than spawning a child that would snapshot the config again.
 */
export interface DeployStep {
  name: string
  cmd?: string
  args?: (executionConfig?: string) => string[]
  remote?: boolean
  /** Runs before the authority is loaded (only `prepare`, which produces it). */
  beforeAuthority?: boolean
  /** Runs in-process through the shared library rather than a child process. */
  inProcess?: string
  /** Needs a scoped execution config minted from the authority for its call. */
  usesConfig?: boolean
  /** Safe `[a-z][a-z0-9-]{0,23}` filename label for this step's scoped config. */
  purpose?: string
}

export interface RunPipelineDeps {
  verifyRemoteSchemas?: (
    authority: DeployConfigAuthority,
    options: { repoRoot: string; spawn?: unknown },
  ) => { ok: boolean; failures: string[]; authorityDigest: string | null }
  run?: (step: DeployStep, authority: DeployConfigAuthority, spawn?: unknown) => boolean
  /** Injectable spawn for tests; nothing contacts Cloudflare when stubbed. */
  spawn?: unknown
}

export declare const DEPLOY_STEPS: DeployStep[]

/**
 * Run the pipeline after `prepare`. Returns an exit code and never calls
 * `process.exit`. Every Wrangler call runs against a fresh scoped config derived from
 * `authority`; there is no reusable execution-config path.
 */
export declare function runPipeline(
  authority: DeployConfigAuthority,
  execute: boolean,
  deps?: RunPipelineDeps,
): number
