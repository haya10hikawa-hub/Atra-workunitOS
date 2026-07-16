/**
 * Type declarations for the shared deploy-config authority (P0-PERSIST-015).
 * The implementation is `cfDeployConfigAuthority.mjs`.
 */

/**
 * A validated, retained deploy config. `bytes` — not a re-serialization of
 * `snapshot` — is the execution authority.
 */
export interface DeployConfigAuthority {
  /** The EXACT validated bytes written to a private execution config. */
  readonly bytes: string
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
 * Write the authority's exact retained bytes to a fresh private (0600, exclusively
 * created) execution config and return only its path.
 */
export declare function createPrivateExecutionConfig(authority: DeployConfigAuthority, input: PrivateExecutionConfigInput): string

/** Remove a private execution config. Safe with null/undefined. */
export declare function removePrivateExecutionConfig(path: string | null | undefined): void
