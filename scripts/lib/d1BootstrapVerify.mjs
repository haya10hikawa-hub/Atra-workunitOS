/**
 * Post-bootstrap Control DB verification (P0-PERSIST-015)
 *
 * Read-only, CATEGORY-LEVEL verification of the control-registry state after a
 * bootstrap write. Answers only structural questions — "does exactly one active
 * tenant row exist?", "do the foreign keys resolve?" — and NEVER surfaces row
 * contents.
 *
 * SAFETY:
 *   - Every query is a `SELECT COUNT(*)`. The only value that can come back is an
 *     integer count, so there is no path by which an ID, email, provider subject,
 *     database ID, or any other row value can be read out, returned, or logged.
 *   - Failures are category names (`tenant_row`, `membership_row`, …), never values.
 *   - Performs NO writes.
 *
 * The operator's values ARE interpolated into the WHERE clauses (Wrangler's
 * `d1 execute --command` takes no bind parameters), so they are quote-escaped the
 * same way the generated bootstrap SQL escapes them. They are never printed.
 */

/** Single-quote escape for SQL literals. */
const lit = (v) => `'${String(v).replace(/'/g, "''")}'`

/** The roles a membership may hold. Mirrors the bootstrap input allowlist. */
const ALLOWED_ROLES = ["owner", "manager", "editor", "viewer"]

/**
 * The ordered verification queries. Each yields exactly one integer column `c`,
 * expected to equal 1.
 *
 * EVERY supplied field is a predicate. Counting a row that merely shares an id
 * would confirm almost nothing: "one row with this tenant id exists" is true even
 * if the bootstrap wrote the wrong name, the wrong database id, or a stale schema
 * version. So each query matches on ALL of the fields the bootstrap supplied for
 * that table, and the JOINs prove the foreign-key relationships resolve.
 *
 * The values appear ONLY as escaped predicates — never in a select list — so the
 * only thing that can come back is the integer count.
 */
export function buildVerificationQueries(values) {
  const t = lit(values.tenantId)
  const u = lit(values.userId)
  const m = lit(values.membershipId)
  const i = lit(values.identityId)
  const roles = ALLOWED_ROLES.map(lit).join(",")
  return [
    // Exactly one tenant: id, name, slug, active.
    {
      category: "tenant_row",
      sql: `SELECT COUNT(*) AS c FROM tenants WHERE id = ${t} AND name = ${lit(values.tenantName)} AND slug = ${lit(values.tenantSlug)} AND status = 'active';`,
    },
    // Exactly one registry row: tenant_id, database_name, database_id, the CANONICAL
    // schema_version, active — and its tenant foreign key resolves.
    {
      category: "registry_row",
      sql: `SELECT COUNT(*) AS c FROM tenant_databases td JOIN tenants tn ON tn.id = td.tenant_id WHERE td.tenant_id = ${t}`
        + ` AND td.database_name = ${lit(values.databaseName)} AND td.database_id = ${lit(values.databaseId)}`
        + ` AND td.schema_version = ${lit(values.schemaVersion)} AND td.status = 'active';`,
    },
    // Exactly one user: id and email.
    {
      category: "user_row",
      sql: `SELECT COUNT(*) AS c FROM users WHERE id = ${u} AND email = ${lit(values.userEmail)};`,
    },
    // Exactly one membership: id, tenant_id, user_id, the exact allowlisted role,
    // active — and both foreign keys resolve.
    {
      category: "membership_row",
      sql: `SELECT COUNT(*) AS c FROM tenant_memberships tm JOIN tenants tn ON tn.id = tm.tenant_id JOIN users us ON us.id = tm.user_id`
        + ` WHERE tm.id = ${m} AND tm.tenant_id = ${t} AND tm.user_id = ${u}`
        + ` AND tm.role = ${lit(values.membershipRole)} AND tm.role IN (${roles}) AND tm.status = 'active';`,
    },
    // Exactly one auth identity: id, user_id, provider, provider_subject, email —
    // and its user foreign key resolves.
    {
      category: "identity_row",
      sql: `SELECT COUNT(*) AS c FROM auth_identities ai JOIN users us ON us.id = ai.user_id WHERE ai.id = ${i} AND ai.user_id = ${u}`
        + ` AND ai.provider = ${lit(values.identityProvider)} AND ai.provider_subject = ${lit(values.identitySubject)}`
        + ` AND ai.email = ${lit(values.userEmail)};`,
    },
  ]
}

/** True only for the COUNT-shaped read-only SQL this module issues. */
export function isCountOnlyQuery(sql) {
  const s = String(sql).trim().replace(/\s+/g, " ").toLowerCase()
  if (/\b(insert|update|delete|drop|alter|create|attach|replace|vacuum|reindex|pragma)\b/.test(s)) return false
  return /^select count\(\*\) as c from /.test(s)
}

/**
 * Run the verification through an injected read-only `runner(sql) => rows`.
 * Returns `{ ok, failures }` — category names only, never values.
 */
export function verifyBootstrapVia(runner, values) {
  const failures = []
  for (const q of buildVerificationQueries(values)) {
    // Defense in depth: refuse to issue anything that is not a bare COUNT read.
    if (!isCountOnlyQuery(q.sql)) { failures.push(`${q.category}:unsafe_query`); continue }
    let rows
    try { rows = runner(q.sql) } catch { failures.push(`${q.category}:query_failure`); continue }
    const count = rows && rows.length > 0 ? Number(rows[0].c) : NaN
    // ONLY the count is examined — no row value is read, returned, or logged.
    if (count !== 1) failures.push(q.category)
  }
  return { ok: failures.length === 0, failures }
}

/** Verify against an OPEN node:sqlite database (local proof path). */
export function verifyBootstrapDatabase(db, values) {
  return verifyBootstrapVia((sql) => db.prepare(sql).all(), values)
}
