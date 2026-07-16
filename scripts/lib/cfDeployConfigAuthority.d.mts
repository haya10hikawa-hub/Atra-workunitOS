/**
 * Type declarations for the shared deploy-config authority (P0-PERSIST-015).
 * The implementation is `cfDeployConfigAuthority.mjs`.
 */

/**
 * A validated, retained deploy config. `bytes` — not a re-serialization of
 * `snapshot` — is the execution authority.
 */
export interface DeployConfigAuthority {
  /** The EXACT validated bytes written to every scoped execution config. */
  readonly bytes: string
  /**
   * SHA-256 of the exact bytes. Safe evidence — no database ID or config content —
   * used to bind verification and deploy by byte identity, never written into a
   * config file.
   */
  readonly sha256: string
  /** A recursively immutable parsed view, for comparisons only. */
  readonly snapshot: Readonly<Record<string, unknown>>
}

export type DeployConfigAuthorityResult =
  | { ok: true; authority: DeployConfigAuthority }
  /** Safe category codes only — never an ID, name, path, or config content. */
  | { ok: false; blocked: string[] }

export interface LoadAuthorityInput {
  configPath?: string
  repoRoot: string
  allowPlaceholderIds?: boolean
}

export interface PrivateExecutionConfigInput {
  repoRoot: string
  /** A safe `[a-z][a-z0-9-]{0,23}` label for the filename. Never a value. */
  purpose?: string
}

/** Hard size cap, enforced before the config is read or parsed. */
export declare const DEPLOY_CONFIG_MAX_BYTES: number

/** Recursively freeze — a shallow freeze would leave `database_id` writable. */
export declare function deepFreeze<T>(value: T): Readonly<T>

/**
 * Load + validate a deploy config ONCE and retain it as an immutable authority.
 * Returns authority bytes only when every validation passes.
 */
export declare function loadValidatedDeployConfigAuthority(input: LoadAuthorityInput): DeployConfigAuthorityResult

/**
 * Run ONE Wrangler-invoking `operation` against a short-lived config carrying the
 * authority's exact retained bytes, then remove it. The scoped path is created
 * exclusively (`wx`), tightened to read-only (0400), confirmed to hash to
 * `authority.sha256` before the callback, and removed in `finally`. It is never
 * returned, cached, or reused across invocations.
 */
export declare function withPrivateExecutionConfig<T>(
  authority: DeployConfigAuthority,
  input: PrivateExecutionConfigInput,
  operation: (executionConfig: string) => T,
): T
