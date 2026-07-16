/** Type declarations for cf:d1:bootstrap:prepare (P0-PERSIST-015, operator-gated). */

export interface OperatorValues {
  tenantId: string; tenantName: string; tenantSlug: string; tenantStatus: string
  databaseName: string; databaseId: string; schemaVersion: string
  userId: string; userEmail: string
  membershipId: string; membershipRole: string; membershipStatus: string
  identityId: string; identityProvider: string; identitySubject: string
}

export type OperatorInputResult =
  | { ok: true; values: OperatorValues }
  | { ok: false; failures: string[] }

/** The parsed, bounded, NON-SENSITIVE artifact header. */
export interface ArtifactHeader {
  version: number
  /** The one instant `apply` cannot derive from the environment. */
  generatedAt: string
}

export type ArtifactHeaderResult =
  | ({ ok: true } & ArtifactHeader)
  | { ok: false; failure: string }

export declare const BOOTSTRAP_SQL_BASENAME: string
export declare const BOOTSTRAP_SQL_PATH: string
export declare const ALLOWED_ROLES: readonly string[]
export declare const ALLOWED_PROVIDERS: readonly string[]
export declare const REQUIRED_ENV: readonly string[]

/** The canonical artifact format `apply` reconstructs and compares against. */
export declare const BOOTSTRAP_ARTIFACT_VERSION: number
export declare const BOOTSTRAP_ARTIFACT_MAGIC: string
/** Hard size cap, enforced BEFORE the artifact is read or parsed. */
export declare const BOOTSTRAP_ARTIFACT_MAX_BYTES: number

export declare function isCanonicalTimestamp(value: unknown): boolean
export declare function parseArtifactHeader(text: unknown): ArtifactHeaderResult

/**
 * `repoRoot` resolves the manifest that declares the CANONICAL registry schema
 * version — the supplied version must equal it exactly.
 */
export declare function readOperatorInput(env: Record<string, string | undefined>, repoRoot?: string): OperatorInputResult
/**
 * The COMPLETE canonical artifact (header included). The single definition of what
 * a valid artifact is: `apply` re-runs this against current authority and compares
 * the whole file byte-for-byte.
 */
export declare function buildBootstrapSql(values: OperatorValues, now?: string): string
export declare function writeBootstrapSql(sql: string, path?: string): string
export declare function removeBootstrapSql(path?: string): void
