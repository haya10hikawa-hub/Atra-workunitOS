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
  /**
   * SHA-256 of the exact retained authority bytes — the deploy orchestrator matches
   * this against its own digest before uploading. Safe evidence: no ID, name, path,
   * or config content. `null` only when no authority was supplied.
   */
  authorityDigest: string | null
}

export interface VerifyWithAuthorityOptions {
  repoRoot?: string
  /** Injectable for tests; nothing contacts Cloudflare when stubbed. */
  spawn?: unknown
}

export declare function evaluateRemoteVerifyGates(input?: RemoteVerifyGateInput): RemoteVerifyGateResult

/**
 * A read-only runner bound to the retained `authority`. Every query opens its own
 * short-lived scoped execution config from the authority bytes and drops it when the
 * call returns — never a reusable path.
 */
export declare function makeWranglerReadOnlyRunner(binding: string, authority: DeployConfigAuthority, spawn?: unknown, repoRoot?: string): ReadOnlyRunner

/**
 * Verify BOTH bindings against the committed contract using ONE already-retained
 * authority: every Control and Tenant query derives its own scoped execution config
 * from the same authority bytes. Exported so the deploy orchestrator can pass the
 * same authority it will deploy with and match `authorityDigest` before uploading.
 */
export declare function verifyRemoteSchemasWithAuthority(
  authority: DeployConfigAuthority,
  options?: VerifyWithAuthorityOptions,
): RemoteVerifyResult
