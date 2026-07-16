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

/**
 * The ordered verification queries. Each yields exactly one integer column `c`,
 * expected to equal 1. The JOINs are what prove the foreign-key relationships
 * resolve; the status predicates prove tenant and membership are active.
 */
export function buildVerificationQueries(values) {
  const t = lit(values.tenantId)
  const u = lit(values.userId)
  const m = lit(values.membershipId)
  const i = lit(values.identityId)
  return [
    // Exactly one target tenant row exists, and it is active.
    { category: "tenant_row", sql: `SELECT COUNT(*) AS c FROM tenants WHERE id = ${t} AND status = 'active';` },
    // Exactly one matching registry row exists, active, and its tenant FK resolves.
    { category: "registry_row", sql: `SELECT COUNT(*) AS c FROM tenant_databases td JOIN tenants tn ON tn.id = td.tenant_id WHERE td.tenant_id = ${t} AND td.status = 'active';` },
    // Exactly one user exists.
    { category: "user_row", sql: `SELECT COUNT(*) AS c FROM users WHERE id = ${u};` },
    // Exactly one ACTIVE membership exists and both of its FKs resolve.
    { category: "membership_row", sql: `SELECT COUNT(*) AS c FROM tenant_memberships tm JOIN tenants tn ON tn.id = tm.tenant_id JOIN users us ON us.id = tm.user_id WHERE tm.id = ${m} AND tm.tenant_id = ${t} AND tm.user_id = ${u} AND tm.status = 'active';` },
    // Exactly one auth identity exists and its user FK resolves.
    { category: "identity_row", sql: `SELECT COUNT(*) AS c FROM auth_identities ai JOIN users us ON us.id = ai.user_id WHERE ai.id = ${i} AND ai.user_id = ${u};` },
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
