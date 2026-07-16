/**
 * D1 Schema Contract — verifier library (P0-PERSIST-015)
 *
 * Dependency-free except for the node: builtins (`node:sqlite`). Introspects a
 * SQLite database (a node:sqlite `DatabaseSync`, or a compatible read handle) and
 * compares it against the committed `migrations/schema-contract.json`.
 *
 * SAFETY:
 *   - Reads ONLY schema metadata (sqlite_master, PRAGMA table_info /
 *     foreign_key_list). NEVER reads application ROW data.
 *   - Never mutates the database.
 *   - Failures are canonical CATEGORIES keyed by safe object names
 *     (table/column/index) — never row values, database IDs, or secrets.
 *   - Canonicalizes introspection so ordering never produces a false failure.
 */

import { readFileSync } from "node:fs"
import { resolve as resolvePath } from "node:path"
import { createHash } from "node:crypto"

export const SCHEMA_CONTRACT_RELATIVE_PATH = "migrations/schema-contract.json"
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

/** Load + strictly parse the schema contract. */
export function loadSchemaContract(repoRoot) {
  const path = resolvePath(repoRoot, SCHEMA_CONTRACT_RELATIVE_PATH)
  let text
  try { text = readFileSync(path, "utf8") } catch { return { ok: false, error: "schema_contract_unreadable" } }
  let value
  try { value = JSON.parse(text) } catch { return { ok: false, error: "schema_contract_unparseable" } }
  if (!value || typeof value !== "object" || !value.databases) return { ok: false, error: "schema_contract_structure_invalid" }
  return { ok: true, contract: value }
}

function safeIdent(name) {
  if (typeof name !== "string" || !IDENT_RE.test(name)) throw new Error("unsafe_identifier")
  return name
}

/**
 * Canonical schema introspection (metadata only). Returns
 * `{ tables: { <name>: { columns, primaryKey, indexes, foreignKeys, sql } } }`.
 * `columns` are sorted by name; indexes/foreignKeys canonicalized.
 */
export function introspect(db) {
  const tables = {}
  const tableRows = db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all()
  for (const t of tableRows) {
    const name = safeIdent(t.name)
    const cols = db.prepare(`PRAGMA table_info("${name}")`).all()
    const fks = db.prepare(`PRAGMA foreign_key_list("${name}")`).all()
    const idxRows = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = ?").all(name)
    const columns = cols
      .map((c) => ({ name: String(c.name), notnull: Number(c.notnull) === 1, pk: Number(c.pk) }))
      .sort((a, b) => a.name.localeCompare(b.name))
    const primaryKey = cols.filter((c) => Number(c.pk) > 0).sort((a, b) => Number(a.pk) - Number(b.pk)).map((c) => String(c.name))
    const indexes = idxRows.map((r) => String(r.name)).filter((n) => !n.startsWith("sqlite_")).sort()
    const foreignKeys = fks
      .map((f) => ({ column: String(f.from), references: String(f.table), to: String(f.to) }))
      .sort((a, b) => `${a.column}:${a.references}:${a.to}`.localeCompare(`${b.column}:${b.references}:${b.to}`))
    tables[name] = { columns, primaryKey, indexes, foreignKeys, sql: String(t.sql || "").replace(/\s+/g, " ").toLowerCase() }
  }
  return { tables }
}

/**
 * Read-only introspection via an injected `runner(sql) => rows`. Used by the
 * REMOTE schema verifier so the SAME verification logic runs against production
 * D1 through read-only queries. The runner MUST reject any non-read-only SQL
 * (enforced by the caller). Identifiers interpolated into PRAGMA are validated.
 */
export function introspectViaRunner(runner) {
  const tables = {}
  const master = runner("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE type IN ('table','index') AND name NOT LIKE 'sqlite_%'")
  for (const t of master.filter((r) => r.type === "table")) {
    const name = safeIdent(t.name)
    const cols = runner(`PRAGMA table_info("${name}")`)
    const fks = runner(`PRAGMA foreign_key_list("${name}")`)
    const columns = cols
      .map((c) => ({ name: String(c.name), notnull: Number(c.notnull) === 1, pk: Number(c.pk) }))
      .sort((a, b) => a.name.localeCompare(b.name))
    const primaryKey = cols.filter((c) => Number(c.pk) > 0).sort((a, b) => Number(a.pk) - Number(b.pk)).map((c) => String(c.name))
    const indexes = master.filter((r) => r.type === "index" && r.tbl_name === name).map((r) => String(r.name)).filter((n) => !n.startsWith("sqlite_")).sort()
    const foreignKeys = fks
      .map((f) => ({ column: String(f.from), references: String(f.table), to: String(f.to) }))
      .sort((a, b) => `${a.column}:${a.references}:${a.to}`.localeCompare(`${b.column}:${b.references}:${b.to}`))
    tables[name] = { columns, primaryKey, indexes, foreignKeys, sql: String(t.sql || "").replace(/\s+/g, " ").toLowerCase() }
  }
  return { tables }
}

/**
 * Compare a canonical introspection against a contract section. Returns
 * `{ ok, failures }` with safe categories keyed by object names only.
 */
export function verifyIntrospection(actual, contractDbSection) {
  const failures = []
  const expected = (contractDbSection && contractDbSection.tables) || {}
  // Infrastructure tables (the migration ledger) are created by the apply
  // mechanism rather than by a lane. They are exempt from drift reporting but are
  // NOT required by this contract, which describes the APPLICATION schema.
  const infrastructure = new Set((contractDbSection && contractDbSection.infrastructureTables) || [])

  // Unexpected user tables (schema drift).
  for (const name of Object.keys(actual.tables)) {
    if (infrastructure.has(name)) continue
    if (!(name in expected)) failures.push({ category: "unexpected_table", table: name })
  }

  for (const [table, spec] of Object.entries(expected)) {
    const a = actual.tables[table]
    if (!a) { failures.push({ category: "missing_table", table }); continue }
    const actualCols = new Map(a.columns.map((c) => [c.name, c]))

    for (const col of spec.columns || []) {
      const ac = actualCols.get(col.name)
      if (!ac) { failures.push({ category: "missing_column", table, name: col.name }); continue }
      if (col.notnull === true && ac.notnull !== true) failures.push({ category: "incompatible_column", table, name: col.name })
      if (col.pk === true && ac.pk < 1) failures.push({ category: "incompatible_column", table, name: col.name })
    }

    if (Array.isArray(spec.primaryKey)) {
      if (a.primaryKey.join(",") !== spec.primaryKey.join(",")) failures.push({ category: "missing_constraint", table, name: "primary_key" })
    }

    if (spec.globalObjectId === true) {
      if (!(a.primaryKey.length === 1 && a.primaryKey[0] === "id")) failures.push({ category: "global_id_contract_violation", table })
    }

    const actualIdx = new Set(a.indexes)
    for (const idx of spec.indexes || []) if (!actualIdx.has(idx)) failures.push({ category: "missing_index", table, name: idx })

    for (const fk of spec.foreignKeys || []) {
      const found = a.foreignKeys.some((f) => f.column === fk.column && f.references === fk.references && f.to === fk.to)
      if (!found) failures.push({ category: "missing_foreign_key", table, name: fk.column })
    }

    for (let i = 0; i < (spec.checks || []).length; i++) {
      // The contract check is a normalized substring of the CREATE TABLE sql.
      if (!a.sql.includes(spec.checks[i])) failures.push({ category: "missing_constraint", table, name: `check_${i}` })
    }
  }

  return { ok: failures.length === 0, failures }
}

/**
 * Verify an OPEN node:sqlite database against a contract section.
 * `{ ok, failures }` — safe categories only.
 */
export function verifyDatabase(db, contractDbSection) {
  let actual
  try { actual = introspect(db) } catch { return { ok: false, failures: [{ category: "query_failure", name: "introspection" }] } }
  return verifyIntrospection(actual, contractDbSection)
}

/** Verify via an injected read-only `runner(sql) => rows` (remote path). */
export function verifyViaRunner(runner, contractDbSection) {
  let actual
  try { actual = introspectViaRunner(runner) } catch { return { ok: false, failures: [{ category: "query_failure", name: "introspection" }] } }
  return verifyIntrospection(actual, contractDbSection)
}

/**
 * True ONLY for read-only introspection SQL: plain `SELECT ...` (no mutation
 * keyword) or a read-only `PRAGMA table_info/foreign_key_list/index_list/
 * index_info(...)` (no `=` assignment). Everything else is rejected.
 */
export function isReadOnlyIntrospectionSql(sql) {
  const s = String(sql).trim().replace(/\s+/g, " ").toLowerCase()
  if (/\b(insert|update|delete|drop|alter|create|attach|replace|vacuum|reindex)\b/.test(s)) return false
  if (/^select\b/.test(s)) return true
  if (/^pragma\s+(table_info|foreign_key_list|index_list|index_info)\s*\(/.test(s) && !s.includes("=")) return true
  return false
}

/**
 * Deterministic schema signature (metadata only). Two databases with equivalent
 * schemas produce the same signature regardless of statement/creation order —
 * used to prove idempotence (signature unchanged after a second application).
 */
export function schemaSignature(db) {
  const actual = introspect(db)
  const parts = []
  for (const table of Object.keys(actual.tables).sort()) {
    const t = actual.tables[table]
    const cols = t.columns.map((c) => `${c.name}|nn=${c.notnull}|pk=${c.pk}`).join(",")
    const fks = t.foreignKeys.map((f) => `${f.column}->${f.references}.${f.to}`).join(",")
    parts.push(`T:${table}|cols=${cols}|pk=${t.primaryKey.join("+")}|idx=${t.indexes.join(",")}|fk=${fks}`)
  }
  return createHash("sha256").update(parts.join("\n")).digest("hex")
}

/** SHA-256 digest of the committed schema-contract file (safe, structural). */
export function schemaContractDigest(contract) {
  return createHash("sha256").update(JSON.stringify(contract)).digest("hex")
}
