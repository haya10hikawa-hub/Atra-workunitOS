/**
 * Real SQLite-backed D1DatabaseLike adapter (test-only).
 *
 * Unlike FakeD1Database (a Map-per-table simulation that does NOT enforce
 * PRIMARY KEY / UNIQUE constraints — a duplicate id silently overwrites), this
 * adapter runs the ACTUAL committed migration schema on an in-memory SQLite
 * database via node:sqlite. It therefore exercises REAL constraint behavior:
 * the global `id PRIMARY KEY` columns of the shared tenant D1 reject a
 * cross-tenant id collision at the database level.
 *
 * Use this — never FakeD1Database — to make any claim about PRIMARY KEY behavior.
 */

import { DatabaseSync } from "node:sqlite"
import { readFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import type { D1DatabaseLike, D1PreparedStatementLike } from "../../app/lib/persistence/d1/types.ts"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")

// node:sqlite only binds null/number/bigint/string/Uint8Array. Coerce the values
// the repositories pass (they already use `?? null`, but guard undefined/boolean).
function coerce(value: unknown): unknown {
  if (value === undefined) return null
  if (typeof value === "boolean") return value ? 1 : 0
  return value
}

class SqliteStatement implements D1PreparedStatementLike {
  private values: unknown[] = []
  private readonly db: DatabaseSync
  private readonly sql: string

  constructor(db: DatabaseSync, sql: string) {
    this.db = db
    this.sql = sql
  }

  bind(...values: unknown[]): D1PreparedStatementLike {
    this.values = values.map(coerce)
    return this
  }

  async first<T = unknown>(): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...(this.values as never[]))
    return (row ?? null) as T | null
  }

  async all<T = unknown>(): Promise<{ results: T[] }> {
    const rows = this.db.prepare(this.sql).all(...(this.values as never[]))
    return { results: rows as T[] }
  }

  async run(): Promise<{ success: boolean; meta?: { rows_written?: number } }> {
    // Throws on a constraint violation (e.g. "UNIQUE constraint failed:
    // work_units.id") — exactly the behavior real D1 exhibits and FakeD1 cannot.
    const info = this.db.prepare(this.sql).run(...(this.values as never[]))
    return { success: true, meta: { rows_written: Number(info.changes) } }
  }
}

export class SqliteD1Database implements D1DatabaseLike {
  private readonly db: DatabaseSync

  constructor(options: { migrations: string[]; foreignKeys?: boolean }) {
    this.db = new DatabaseSync(":memory:")
    if (options.foreignKeys) this.db.exec("PRAGMA foreign_keys = ON")
    for (const migration of options.migrations) {
      this.db.exec(readFileSync(resolve(REPO_ROOT, migration), "utf8"))
    }
  }

  prepare(query: string): D1PreparedStatementLike {
    return new SqliteStatement(this.db, query)
  }

  /** Direct read for byte-equivalence assertions (bypasses repository mapping). */
  rawRow(sql: string, ...params: unknown[]): Record<string, unknown> | null {
    return (this.db.prepare(sql).get(...(params.map(coerce) as never[])) ?? null) as Record<string, unknown> | null
  }

  close(): void {
    this.db.close()
  }
}

/** The committed shared tenant-data D1 migrations, in order. */
export const TENANT_DB_MIGRATIONS = [
  "migrations/0002_tenant_core.sql",
  "migrations/0003_tenant_persistence_foundation.sql",
  "migrations/0006_action_preview_creator.sql",
]
