/**
 * Minimal ambient types for `node:sqlite` (test-only).
 *
 * The installed `@types/node` (v20) predates Node 22's experimental
 * `node:sqlite` module, so tsc cannot resolve it. This declares only the narrow
 * surface used by tests/helpers/sqliteD1.ts. Runtime behavior is provided by
 * Node itself; this file affects type-checking only.
 */
declare module "node:sqlite" {
  export class StatementSync {
    get(...params: unknown[]): unknown
    all(...params: unknown[]): unknown[]
    run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint }
  }
  export class DatabaseSync {
    constructor(path: string)
    exec(sql: string): void
    prepare(sql: string): StatementSync
    close(): void
  }
}
