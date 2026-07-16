/** Type declarations for cf:d1:schema:verify:remote (P0-PERSIST-015, read-only). */
import type { ReadOnlyRunner } from "./lib/d1SchemaContract.d.mts"
import type { DeployConfigAuthority } from "./lib/cfDeployConfigAuthority.d.mts"

export interface RemoteVerifyGateInput { argv?: string[]; repoRoot?: string; configPath?: string }

export interface RemoteVerifyGateResult {
  ok: boolean
  /** Safe reason codes only. */
  blocked: string[]
  /** The retained authority — returned ONLY when every gate passed. */
  configAuthority: DeployConfigAuthority | null
}

export interface RemoteVerifyResult {
  ok: boolean
  /** Safe categories only — never a database ID, config content, or row data. */
  failures: string[]
}

export interface VerifyWithAuthorityOptions {
  repoRoot?: string
  /** Injectable for tests; nothing contacts Cloudflare when stubbed. */
  spawn?: unknown
}

export declare function evaluateRemoteVerifyGates(input?: RemoteVerifyGateInput): RemoteVerifyGateResult

/**
 * `executionConfig` is the PRIVATE config written from the retained authority —
 * never the operator's mutable path.
 */
export declare function makeWranglerReadOnlyRunner(binding: string, executionConfig: string, spawn?: unknown): ReadOnlyRunner

/**
 * Verify BOTH bindings against the committed contract using ONE already-retained
 * authority: one private execution config for every Control and Tenant query,
 * removed unconditionally. Exported so the deploy orchestrator can pass the same
 * authority it will deploy with, rather than snapshotting the config a second time.
 */
export declare function verifyRemoteSchemasWithAuthority(
  authority: DeployConfigAuthority,
  options?: VerifyWithAuthorityOptions,
): RemoteVerifyResult
