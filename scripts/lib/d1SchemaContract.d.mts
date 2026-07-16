/**
 * Type declarations for the D1 schema-contract verifier (P0-PERSIST-015).
 * The implementation is `d1SchemaContract.mjs`.
 */

/** Minimal read handle: node:sqlite `DatabaseSync` and test doubles satisfy this. */
export interface SqlQueryable {
  prepare(sql: string): { all(...params: unknown[]): unknown[]; get?(...params: unknown[]): unknown }
}

export type SchemaFailureCategory =
  | "missing_table" | "missing_column" | "incompatible_column"
  | "missing_index" | "missing_constraint" | "missing_foreign_key"
  | "unexpected_table" | "global_id_contract_violation" | "query_failure"

export interface SchemaFailure { category: SchemaFailureCategory; table?: string; name?: string }
export interface VerifyResult { ok: boolean; failures: SchemaFailure[] }

export interface IntrospectedColumn { name: string; notnull: boolean; pk: number }
export interface IntrospectedForeignKey { column: string; references: string; to: string }
export interface IntrospectedTable {
  columns: IntrospectedColumn[]
  primaryKey: string[]
  indexes: string[]
  foreignKeys: IntrospectedForeignKey[]
  sql: string
}
export interface Introspection { tables: Record<string, IntrospectedTable> }

export interface ColumnSpec { name: string; notnull?: boolean; pk?: boolean }
export interface TableSpec {
  primaryKey?: string[]
  globalObjectId?: boolean
  columns?: ColumnSpec[]
  checks?: string[]
  indexes?: string[]
  foreignKeys?: { column: string; references: string; to: string }[]
}
export interface DatabaseSpec {
  tables: Record<string, TableSpec>
  /**
   * Tables created by the migration apply mechanism rather than by a lane (the
   * `__atra_d1_migrations` ledger). Exempt from drift reporting; not required.
   */
  infrastructureTables?: string[]
}
export interface SchemaContract {
  patchId: string
  version: number
  description?: string
  notes?: Record<string, string>
  databases: Record<string, DatabaseSpec>
}

export type LoadContractResult =
  | { ok: true; contract: SchemaContract }
  | { ok: false; error: string }

/** A read-only query runner: returns rows for an introspection query. */
export type ReadOnlyRunner = (sql: string) => unknown[]

export declare const SCHEMA_CONTRACT_RELATIVE_PATH: string

export declare function loadSchemaContract(repoRoot: string): LoadContractResult
export declare function introspect(db: SqlQueryable): Introspection
export declare function introspectViaRunner(runner: ReadOnlyRunner): Introspection
export declare function verifyIntrospection(actual: Introspection, contractDbSection: DatabaseSpec): VerifyResult
export declare function verifyDatabase(db: SqlQueryable, contractDbSection: DatabaseSpec): VerifyResult
export declare function verifyViaRunner(runner: ReadOnlyRunner, contractDbSection: DatabaseSpec): VerifyResult
export declare function schemaSignature(db: SqlQueryable): string
export declare function schemaContractDigest(contract: unknown): string
export declare function isReadOnlyIntrospectionSql(sql: string): boolean
