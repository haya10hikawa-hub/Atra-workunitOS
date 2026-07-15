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

export declare const BOOTSTRAP_SQL_BASENAME: string
export declare const BOOTSTRAP_SQL_PATH: string
export declare const ALLOWED_ROLES: readonly string[]
export declare const ALLOWED_PROVIDERS: readonly string[]
export declare const REQUIRED_ENV: readonly string[]

export declare function readOperatorInput(env: Record<string, string | undefined>): OperatorInputResult
export declare function buildBootstrapSql(values: OperatorValues, now?: string): string
export declare function writeBootstrapSql(sql: string, path?: string): string
export declare function removeBootstrapSql(path?: string): void
