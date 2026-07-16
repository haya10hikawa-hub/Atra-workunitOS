/**
 * Type declarations for post-bootstrap Control DB verification (P0-PERSIST-015).
 * The implementation is `d1BootstrapVerify.mjs`.
 */

import type { DatabaseSync } from "node:sqlite"

/** The operator-supplied identifiers a bootstrap wrote. Never logged. */
export interface BootstrapVerifyValues {
  tenantId: string
  userId: string
  membershipId: string
  identityId: string
}

/** A single category-level check. Each query returns exactly one integer `c`. */
export interface VerificationQuery {
  category: string
  sql: string
}

/** Category names only — never a row value. */
export interface VerificationResult {
  ok: boolean
  failures: string[]
}

export declare function buildVerificationQueries(values: BootstrapVerifyValues): VerificationQuery[]
export declare function isCountOnlyQuery(sql: string): boolean
export declare function verifyBootstrapVia(
  runner: (sql: string) => Array<Record<string, unknown>>,
  values: BootstrapVerifyValues,
): VerificationResult
export declare function verifyBootstrapDatabase(db: DatabaseSync, values: BootstrapVerifyValues): VerificationResult
