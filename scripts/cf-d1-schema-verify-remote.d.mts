/**
 * Type declarations for cf:d1:schema:verify:remote (P0-PERSIST-015, read-only;
 * hardened P0-FIX-018).
 *
 * Remote schema verification is ENTRYPOINT-ONLY. The Wrangler-backed runner and the
 * multi-binding verifier are PRIVATE to the module and are deliberately NOT declared
 * here — no `makeWranglerReadOnlyRunner`, no `verifyRemoteSchemasWithAuthority`, no
 * `VerifyWithAuthorityOptions`, no remote process-runner seam. The only exported
 * surface is the pure gate evaluation, which spawns nothing and returns the retained
 * authority ONLY when `--remote` and a validated deploy config are both present.
 */
import type { DeployConfigAuthority } from "./lib/cfDeployConfigAuthority.d.mts"

export interface RemoteVerifyGateInput { argv?: string[]; repoRoot?: string; configPath?: string }

export interface RemoteVerifyGateResult {
  ok: boolean
  /** Safe reason codes only. */
  blocked: string[]
  /** The retained authority — returned ONLY when every gate passed. */
  configAuthority: DeployConfigAuthority | null
}

export declare function evaluateRemoteVerifyGates(input?: RemoteVerifyGateInput): RemoteVerifyGateResult
