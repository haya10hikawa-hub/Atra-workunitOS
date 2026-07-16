/**
 * P0-PERSIST-015 — atomic production bootstrap (Issue #155).
 *
 * The bootstrap writes five related control-registry records. Either ALL of them
 * commit or NONE do: a half-written tenant (say, a tenant + registry row with no
 * identity) is a broken, unauthenticatable workspace that an operator would have to
 * clean up by hand in production.
 *
 * MECHANISM (verified against this repository's pinned Wrangler 4.99.0):
 *   D1 REJECTS explicit `BEGIN IMMEDIATE; … COMMIT;` — the textbook shape cannot be
 *   used. A multi-statement `wrangler d1 execute --file` IS applied as ONE implicit
 *   atomic batch, with foreign keys enforced. So the single `--file` invocation IS
 *   the atomic boundary, and `applyAtomicBatch` models exactly those semantics over
 *   real node:sqlite — proving the guarantees offline, on the SAME generated SQL
 *   text Wrangler would receive.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { DatabaseSync } from "node:sqlite"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { buildBootstrapSql } from "../scripts/cf-d1-bootstrap-prepare.mjs"
import { applyAtomicBatch, hasExplicitTransactionControl } from "../scripts/lib/d1AtomicBatch.mjs"
import { verifyBootstrapDatabase } from "../scripts/lib/d1BootstrapVerify.mjs"
import { loadManifest, tenantRegistrySchemaVersion } from "../scripts/lib/d1MigrationManifest.mjs"
import { applyLaneWithLedger, splitStatements } from "../scripts/lib/d1MigrationLedger.mjs"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")

/** The operator-supplied values the bootstrap SQL is generated from. */
type BootstrapValues = {
  tenantId: string; tenantName: string; tenantSlug: string; tenantStatus: string
  databaseName: string; databaseId: string; schemaVersion: string
  userId: string; userEmail: string
  membershipId: string; membershipRole: string; membershipStatus: string
  identityId: string; identityProvider: string; identitySubject: string
}

/** The ONE canonical registry schema version — never a hand-picked digit string. */
function canonicalSchemaVersion(): string {
  const loaded = loadManifest(REPO_ROOT)
  if (!loaded.ok) throw new Error(`manifest unreadable: ${loaded.error}`)
  const version = tenantRegistrySchemaVersion(loaded.manifest)
  if (version === null) throw new Error("the manifest must declare a canonical registry schema version")
  return version
}

/** Test-only synthetic operator values. Nothing here is real. */
const VALUES: BootstrapValues = {
  tenantId: "acme", tenantName: "Acme", tenantSlug: "acme", tenantStatus: "active",
  databaseName: "acme-db", databaseId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301", schemaVersion: canonicalSchemaVersion(),
  userId: "user-1", userEmail: "ops@example.com",
  membershipId: "mem-1", membershipRole: "owner", membershipStatus: "active",
  identityId: "ident-1", identityProvider: "jwt", identitySubject: "auth0|abc123",
}

const TABLES = ["tenants", "tenant_databases", "users", "tenant_memberships", "auth_identities"]

/** A freshly bootstrapped, EMPTY Control DB (real SQLite, canonical lane). */
function freshControlDb() {
  const loaded = loadManifest(REPO_ROOT)
  if (!loaded.ok) throw new Error(`manifest unreadable: ${loaded.error}`)
  const db = new DatabaseSync(":memory:")
  applyLaneWithLedger(db, loaded.manifest, "CONTROL_DB", REPO_ROOT)
  return db
}

const counts = (db: DatabaseSync) =>
  Object.fromEntries(TABLES.map((t) => [t, Number((db.prepare(`SELECT COUNT(*) AS c FROM "${t}"`).get() as { c: number }).c)]))
const ZERO = Object.fromEntries(TABLES.map((t) => [t, 0]))

const sqlFor = (over: Partial<BootstrapValues> = {}) => buildBootstrapSql({ ...VALUES, ...over }, "2026-07-16T00:00:00.000Z")

// ─── 1. the happy path ───────────────────────────────────────────

test("1. a complete bootstrap succeeds and commits all five records", () => {
  const db = freshControlDb()
  const result = applyAtomicBatch(db, sqlFor())
  assert.equal(result.ok, true, `bootstrap must apply cleanly: ${result.ok ? "" : result.error}`)
  assert.deepEqual(counts(db), { tenants: 1, tenant_databases: 1, users: 1, tenant_memberships: 1, auth_identities: 1 })
  // Post-bootstrap verification passes on the real committed schema.
  assert.deepEqual(verifyBootstrapDatabase(db, VALUES).failures, [])
  db.close()
})

// ─── 2–5. every failure rolls back EVERYTHING ────────────────────

test("2. a duplicate provider/subject identity rolls back the tenant, registry, user, and membership inserts", () => {
  const db = freshControlDb()
  assert.equal(applyAtomicBatch(db, sqlFor()).ok, true)
  const before = counts(db)

  // A SECOND bootstrap reusing the same provider/subject but otherwise new.
  const dup = applyAtomicBatch(db, sqlFor({
    tenantId: "acme2", tenantSlug: "acme2", databaseName: "acme2-db", userId: "user-2",
    userEmail: "ops2@example.com", membershipId: "mem-2", identityId: "ident-2",
  }))
  assert.equal(dup.ok, false, "a duplicate provider/subject must fail closed")
  assert.deepEqual(counts(db), before, "ZERO new rows may survive a failed bootstrap")
})

test("3. a duplicate user email rolls back the prior inserts", () => {
  const db = freshControlDb()
  assert.equal(applyAtomicBatch(db, sqlFor()).ok, true)
  const before = counts(db)
  const dup = applyAtomicBatch(db, sqlFor({
    tenantId: "acme3", tenantSlug: "acme3", databaseName: "acme3-db", userId: "user-3",
    membershipId: "mem-3", identityId: "ident-3", identitySubject: "auth0|different",
  }))
  assert.equal(dup.ok, false, "a duplicate user email must fail closed")
  assert.deepEqual(counts(db), before, "the new tenant and registry rows must be rolled back")
})

test("3b. a duplicate tenant id and a duplicate slug each roll back with zero new rows", () => {
  for (const over of [
    { tenantSlug: "other", databaseName: "other-db", userId: "u9", userEmail: "u9@example.com", membershipId: "m9", identityId: "i9", identitySubject: "auth0|9" },
    { tenantId: "other", databaseName: "other-db", userId: "u8", userEmail: "u8@example.com", membershipId: "m8", identityId: "i8", identitySubject: "auth0|8" },
  ]) {
    const db = freshControlDb()
    assert.equal(applyAtomicBatch(db, sqlFor()).ok, true)
    const before = counts(db)
    assert.equal(applyAtomicBatch(db, sqlFor(over)).ok, false, "a duplicate tenant id/slug must fail closed")
    assert.deepEqual(counts(db), before)
    db.close()
  }
})

test("4. a missing user parent rolls back ALL inserts", () => {
  const db = freshControlDb()
  // Drop the users INSERT: the membership and identity then reference a user that
  // does not exist. D1 enforces foreign keys, so the whole batch must fail.
  const orphaned = sqlFor().split("\n").filter((line) => !line.startsWith("INSERT INTO users ")).join("\n")
  const result = applyAtomicBatch(db, orphaned)
  assert.equal(result.ok, false, "a missing user parent must fail closed")
  assert.match(result.error ?? "", /FOREIGN KEY/i)
  assert.deepEqual(counts(db), ZERO, "no partial tenant or identity state may remain")
  db.close()
})

test("5. a duplicate membership rolls back ALL inserts", () => {
  const db = freshControlDb()
  assert.equal(applyAtomicBatch(db, sqlFor()).ok, true)
  const before = counts(db)
  // Same (tenant_id, user_id) membership pair → UNIQUE violation.
  const dup = applyAtomicBatch(db, sqlFor({ membershipId: "mem-dup", identityId: "ident-dup", identitySubject: "auth0|dup" }))
  assert.equal(dup.ok, false, "a duplicate membership must fail closed")
  assert.deepEqual(counts(db), before)
  db.close()
})

// ─── 6. re-application ───────────────────────────────────────────

test("6. applying the SAME bootstrap twice leaves no partial second state", () => {
  const db = freshControlDb()
  assert.equal(applyAtomicBatch(db, sqlFor()).ok, true)
  const after = counts(db)
  const second = applyAtomicBatch(db, sqlFor())
  assert.equal(second.ok, false, "a repeated bootstrap must fail closed — never silently upsert")
  assert.deepEqual(counts(db), after, "the second application must leave exactly the first state")
  assert.deepEqual(after, { tenants: 1, tenant_databases: 1, users: 1, tenant_memberships: 1, auth_identities: 1 })
  // The registry remains coherent afterwards.
  assert.deepEqual(verifyBootstrapDatabase(db, VALUES).failures, [])
  db.close()
})

// ─── 7. foreign keys ─────────────────────────────────────────────

test("7. foreign-key enforcement is enabled for the bootstrap batch", () => {
  const db = freshControlDb()
  applyAtomicBatch(db, sqlFor())
  assert.equal(Number((db.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number }).foreign_keys), 1)
  db.close()
})

// ─── 8. the generated statements never weaken constraints ────────

test("8. no generated statement weakens a constraint (no INSERT OR IGNORE, no REPLACE, no PRAGMA, no DDL)", () => {
  const sql = sqlFor()
  assert.doesNotMatch(sql, /INSERT\s+OR\s+IGNORE/i, "a duplicate must fail closed, never be ignored")
  assert.doesNotMatch(sql, /INSERT\s+OR\s+REPLACE/i)
  assert.doesNotMatch(sql, /\bREPLACE\s+INTO\b/i, "REPLACE would silently overwrite an existing tenant/identity")
  assert.doesNotMatch(sql, /\bON\s+CONFLICT\b/i)
  assert.doesNotMatch(sql, /foreign_keys\s*=\s*(off|0)/i, "the batch must never disable foreign keys")
  assert.doesNotMatch(sql, /\b(DROP|ALTER|CREATE|ATTACH|PRAGMA)\b/i, "the bootstrap inserts data; it must never alter schema")
  // Exactly the five expected INSERTs, in dependency order.
  const inserts = sql.split("\n").filter((l) => l.startsWith("INSERT INTO "))
  assert.equal(inserts.length, 5)
  assert.deepEqual(inserts.map((l) => l.split(" ")[2]), ["tenants", "tenant_databases", "users", "tenant_memberships", "auth_identities"])
})

test("the generated SQL carries its atomic boundary as ONE batch — and no explicit transaction control (D1 rejects it)", () => {
  const sql = sqlFor()
  // Verified against pinned Wrangler 4.99.0: a file containing BEGIN/COMMIT is
  // REJECTED by D1, so including it would break the bootstrap, not protect it.
  assert.equal(hasExplicitTransactionControl(sql), false, "D1 rejects BEGIN/COMMIT/SAVEPOINT — the file must not contain them")
  // Checked on the EXECUTABLE statements: the header comment legitimately mentions
  // BEGIN/COMMIT to explain why they are absent.
  for (const statement of splitStatements(sql)) {
    assert.doesNotMatch(statement, /\bBEGIN\b|\bCOMMIT\b|\bSAVEPOINT\b|\bROLLBACK\b/i)
  }
  // All five records are in ONE file, which is what makes the single
  // `d1 execute --file` invocation atomic.
  assert.equal(sql.split("\n").filter((l) => l.startsWith("INSERT INTO ")).length, 5)
  // …and the apply command applies that file in exactly ONE invocation.
  const applySrc = readFileSync(resolve(REPO_ROOT, "scripts/cf-d1-bootstrap-apply.mjs"), "utf8")
  assert.equal(applySrc.split(`"d1", "execute", BOOTSTRAP_BINDING, "--file"`).length - 1, 1, "the bootstrap must be ONE atomic --file invocation")
})

test("a batch that DOES contain explicit transaction control is refused (mirrors D1's real behavior)", () => {
  const db = freshControlDb()
  const wrapped = `BEGIN IMMEDIATE;\n${sqlFor()}\nCOMMIT;`
  const result = applyAtomicBatch(db, wrapped)
  assert.equal(result.ok, false)
  assert.equal(result.ok ? "" : result.error, "explicit_transaction_control_rejected")
  assert.deepEqual(counts(db), ZERO)
  db.close()
})

// ─── post-bootstrap verification is category-only ────────────────

test("post-bootstrap verification issues ONLY COUNT reads and returns categories — never row values", () => {
  const db = freshControlDb()
  applyAtomicBatch(db, sqlFor())
  const issued: string[] = []
  const result = verifyBootstrapDatabase(db, VALUES)
  assert.deepEqual(result.failures, [])

  // Capture every query the verifier issues.
  const spy = {
    prepare: (sql: string) => { issued.push(sql); return db.prepare(sql) },
  } as unknown as DatabaseSync
  verifyBootstrapDatabase(spy, VALUES)
  assert.ok(issued.length > 0)
  for (const sql of issued) {
    assert.match(sql, /^SELECT COUNT\(\*\) AS c FROM /, `only COUNT reads are permitted: ${sql}`)
    assert.doesNotMatch(sql, /\b(insert|update|delete|drop|alter|create)\b/i)
  }
  db.close()
})

test("a broken registry state FAILS post-bootstrap verification with a category (not a value)", () => {
  const db = freshControlDb()
  applyAtomicBatch(db, sqlFor())
  // Simulate a half-written registry: remove the identity row.
  db.exec("DELETE FROM auth_identities")
  const result = verifyBootstrapDatabase(db, VALUES)
  assert.equal(result.ok, false)
  assert.deepEqual(result.failures, ["identity_row"])
  for (const f of result.failures) assert.match(f, /^[a-z0-9_]+$/, "failures are category names only")
  db.close()
})

// ─── Field-level verification matrix (20–26) ─────────────────────

/**
 * Bootstrap a control DB, then corrupt ONE field and assert the matching category
 * fails. Counting a row that merely shares an id would confirm almost nothing —
 * "a tenant with this id exists" is true even if the bootstrap wrote the wrong
 * database id or a stale schema version.
 */
function expectVerificationFailure(corrupt: string, expected: string) {
  const db = freshControlDb()
  assert.equal(applyAtomicBatch(db, sqlFor()).ok, true)
  assert.deepEqual(verifyBootstrapDatabase(db, VALUES).failures, [], "the pristine bootstrap must verify")
  db.exec(corrupt)
  const result = verifyBootstrapDatabase(db, VALUES)
  assert.equal(result.ok, false, `${corrupt} must fail verification`)
  assert.deepEqual(result.failures, [expected])
  for (const f of result.failures) assert.match(f, /^[a-z0-9_]+$/, "failures are category names only")
  db.close()
}

test("20. registry verification fails on the WRONG database ID", () => {
  expectVerificationFailure("UPDATE tenant_databases SET database_id = '3f2504e0-4f89-41d3-9a0c-0305e82c3399'", "registry_row")
})

test("21. registry verification fails on the WRONG database name", () => {
  expectVerificationFailure("UPDATE tenant_databases SET database_name = 'some-other-db'", "registry_row")
})

test("22. registry verification fails on the WRONG schema version", () => {
  expectVerificationFailure("UPDATE tenant_databases SET schema_version = '1'", "registry_row")
})

test("23. user verification fails on the WRONG email", () => {
  expectVerificationFailure("UPDATE users SET email = 'someone-else@example.com'", "user_row")
})

test("24. membership verification fails on the WRONG role", () => {
  // Still an allowlisted role — but not the one the operator authorized.
  expectVerificationFailure("UPDATE tenant_memberships SET role = 'viewer'", "membership_row")
})

test("25. identity verification fails on the WRONG provider", () => {
  expectVerificationFailure("UPDATE auth_identities SET provider = 'saml'", "identity_row")
})

test("26. identity verification fails on the WRONG provider subject", () => {
  expectVerificationFailure("UPDATE auth_identities SET provider_subject = 'auth0|someone-else'", "identity_row")
})

test("tenant verification fails on a wrong name or slug, and identity on a wrong email", () => {
  expectVerificationFailure("UPDATE tenants SET name = 'Renamed'", "tenant_row")
  expectVerificationFailure("UPDATE tenants SET slug = 'renamed'", "tenant_row")
  expectVerificationFailure("UPDATE auth_identities SET email = 'other@example.com'", "identity_row")
})

test("verification requires EVERY supplied field — no query is satisfied by an id alone", () => {
  // Guard against a verifier that only counts by primary key: corrupt every
  // non-key field in turn and require a failure each time.
  for (const [corrupt, expected] of [
    ["UPDATE tenants SET name = 'x'", "tenant_row"],
    ["UPDATE tenants SET slug = 'x'", "tenant_row"],
    ["UPDATE tenant_databases SET database_name = 'x'", "registry_row"],
    ["UPDATE tenant_databases SET database_id = 'x'", "registry_row"],
    ["UPDATE tenant_databases SET schema_version = '9'", "registry_row"],
    ["UPDATE users SET email = 'x@y.z'", "user_row"],
    ["UPDATE tenant_memberships SET role = 'editor'", "membership_row"],
    ["UPDATE auth_identities SET provider = 'x'", "identity_row"],
    ["UPDATE auth_identities SET provider_subject = 'x'", "identity_row"],
    ["UPDATE auth_identities SET email = 'x@y.z'", "identity_row"],
  ] as const) {
    expectVerificationFailure(corrupt, expected)
  }
})

test("a broken foreign-key relationship fails verification", () => {
  // The JOINs are what prove the relationships resolve.
  for (const [corrupt, expected] of [
    ["UPDATE tenant_memberships SET user_id = 'ghost'", "membership_row"],
    ["UPDATE auth_identities SET user_id = 'ghost'", "identity_row"],
    ["UPDATE tenant_databases SET tenant_id = 'ghost'", "registry_row"],
  ] as const) {
    const db = freshControlDb()
    assert.equal(applyAtomicBatch(db, sqlFor()).ok, true)
    // Foreign keys are enforced, so break the link with FKs momentarily off —
    // this models a database that got into a bad state, not a legal write.
    db.exec("PRAGMA foreign_keys = OFF")
    db.exec(corrupt)
    const result = verifyBootstrapDatabase(db, VALUES)
    assert.equal(result.ok, false, `${corrupt} must fail verification`)
    assert.deepEqual(result.failures, [expected])
    db.close()
  }
})

test("27 + 28. every verification query stays COUNT-only and no output includes an operator value or SQL", () => {
  const db = freshControlDb()
  applyAtomicBatch(db, sqlFor())
  const issued: string[] = []
  const spy = { prepare: (sql: string) => { issued.push(sql); return db.prepare(sql) } } as unknown as DatabaseSync
  verifyBootstrapDatabase(spy, VALUES)

  assert.equal(issued.length, 5, "one query per record")
  for (const sql of issued) {
    // 27. COUNT-only: the ONLY thing that can come back is an integer.
    assert.match(sql, /^SELECT COUNT\(\*\) AS c FROM /, `only COUNT reads are permitted: ${sql}`)
    assert.doesNotMatch(sql, /\b(insert|update|delete|drop|alter|create|pragma)\b/i)
    // The values appear only as escaped predicates — never in a select list.
    assert.equal(/SELECT COUNT\(\*\) AS c FROM [^;]*\bWHERE\b/.test(sql), true, "every query filters")
  }
  // Every supplied field is actually used as a predicate somewhere.
  const all = issued.join("\n")
  for (const value of [VALUES.tenantId, VALUES.tenantName, VALUES.tenantSlug, VALUES.databaseName, VALUES.databaseId,
    VALUES.schemaVersion, VALUES.userId, VALUES.userEmail, VALUES.membershipId, VALUES.membershipRole,
    VALUES.identityId, VALUES.identityProvider, VALUES.identitySubject]) {
    assert.ok(all.includes(value), `${value} must be verified, not assumed`)
  }

  // 28. Failure output carries categories only — never a value or any SQL.
  db.exec("UPDATE users SET email = 'leaked@example.com'")
  const failed = verifyBootstrapDatabase(db, VALUES)
  const serialized = JSON.stringify(failed.failures)
  assert.deepEqual(failed.failures, ["user_row"])
  for (const secret of [VALUES.userEmail, "leaked@example.com", VALUES.databaseId, VALUES.identitySubject, "SELECT", "COUNT"]) {
    assert.equal(serialized.includes(secret), false, `output must never include ${secret}`)
  }
  db.close()
})

test("a suspended tenant or inactive membership FAILS verification (statuses must be active)", () => {
  for (const [sql, expected] of [
    ["UPDATE tenants SET status = 'suspended'", "tenant_row"],
    ["UPDATE tenant_memberships SET status = 'invited'", "membership_row"],
  ] as const) {
    const db = freshControlDb()
    applyAtomicBatch(db, sqlFor())
    db.exec(sql)
    const result = verifyBootstrapDatabase(db, VALUES)
    assert.equal(result.ok, false)
    assert.ok(result.failures.includes(expected))
    db.close()
  }
})
