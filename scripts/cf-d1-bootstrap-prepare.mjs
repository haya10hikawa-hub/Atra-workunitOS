#!/usr/bin/env node
/**
 * cf:d1:bootstrap:prepare (P0-PERSIST-015) — OPERATOR-GATED production bootstrap.
 *
 * Prepares (does NOT apply) the control-registry bootstrap SQL for a REAL tenant
 * from OPERATOR-PROVIDED environment variables. There are NO implicit defaults and
 * NO committed identity data — every value must be supplied explicitly and passes
 * strict validation. The generated SQL is written to an untracked repository-root
 * file with 0600 permissions and is removed after apply or failure.
 *
 * SAFETY:
 *   - NEVER logs any operator value (tenant/user/email/subject/database id).
 *   - The database id uses the SAME UUID validation as the deployment config.
 *   - Generated SQL is git-ignored and must never be committed.
 *   - Applying is a SEPARATE, repository-controlled, fully gated command
 *     (`cf:d1:bootstrap:apply`) — this command only prepares. Applying the
 *     generated file with a raw `wrangler d1 execute` is NOT the supported
 *     workflow: it would bypass every gate, the post-apply verification, and the
 *     guaranteed cleanup.
 *   - Missing-parent and duplicate-identity conditions fail closed (plain INSERTs
 *     + declared foreign keys; internal parent consistency is validated here).
 */

import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { writeFileSync, rmSync, existsSync } from "node:fs"
import { validateD1Id } from "./lib/cfDeployConfig.mjs"
import { loadManifest, tenantRegistrySchemaVersion } from "./lib/d1MigrationManifest.mjs"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
export const BOOTSTRAP_SQL_BASENAME = "bootstrap.control.sql"
export const BOOTSTRAP_SQL_PATH = resolve(REPO_ROOT, BOOTSTRAP_SQL_BASENAME)
export const ALLOWED_ROLES = ["owner", "manager", "editor", "viewer"]
export const ALLOWED_PROVIDERS = ["jwt"]

// Operator-provided inputs. NO defaults — a missing variable fails closed.
export const REQUIRED_ENV = [
  "CF_D1_BOOTSTRAP_TENANT_ID",
  "CF_D1_BOOTSTRAP_TENANT_NAME",
  "CF_D1_BOOTSTRAP_TENANT_SLUG",
  "CF_D1_BOOTSTRAP_TENANT_STATUS",
  "CF_D1_BOOTSTRAP_DATABASE_NAME",
  "CF_D1_BOOTSTRAP_DATABASE_ID",
  "CF_D1_BOOTSTRAP_SCHEMA_VERSION",
  "CF_D1_BOOTSTRAP_USER_ID",
  "CF_D1_BOOTSTRAP_USER_EMAIL",
  "CF_D1_BOOTSTRAP_MEMBERSHIP_ID",
  "CF_D1_BOOTSTRAP_MEMBERSHIP_ROLE",
  "CF_D1_BOOTSTRAP_MEMBERSHIP_STATUS",
  "CF_D1_BOOTSTRAP_IDENTITY_ID",
  "CF_D1_BOOTSTRAP_IDENTITY_PROVIDER",
  "CF_D1_BOOTSTRAP_IDENTITY_SUBJECT",
]

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/
const DB_NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/
const EMAIL_RE = /^[^\s@'"\\]+@[^\s@'"\\]+\.[^\s@'"\\]+$/
const NAME_RE = /^[^\r\n'"\\]{1,128}$/
const SUBJECT_RE = /^[A-Za-z0-9][A-Za-z0-9._:@|-]{0,255}$/

/**
 * Strictly validate operator input. Returns `{ ok, values }` or `{ ok:false,
 * failures }` — failures are safe FIELD-NAME categories and never echo a value.
 */
export function readOperatorInput(env, repoRoot = REPO_ROOT) {
  const failures = []
  const get = (k) => (typeof env[k] === "string" ? env[k] : undefined)

  for (const key of REQUIRED_ENV) {
    if (!get(key) || get(key).length === 0) failures.push(`missing:${key}`)
  }
  if (failures.length > 0) return { ok: false, failures }

  const check = (key, re) => { if (!re.test(get(key))) failures.push(`invalid:${key}`) }
  check("CF_D1_BOOTSTRAP_TENANT_ID", ID_RE)
  check("CF_D1_BOOTSTRAP_TENANT_NAME", NAME_RE)
  check("CF_D1_BOOTSTRAP_TENANT_SLUG", SLUG_RE)
  check("CF_D1_BOOTSTRAP_DATABASE_NAME", DB_NAME_RE)
  check("CF_D1_BOOTSTRAP_USER_ID", ID_RE)
  check("CF_D1_BOOTSTRAP_USER_EMAIL", EMAIL_RE)
  check("CF_D1_BOOTSTRAP_MEMBERSHIP_ID", ID_RE)
  check("CF_D1_BOOTSTRAP_IDENTITY_ID", ID_RE)
  check("CF_D1_BOOTSTRAP_IDENTITY_SUBJECT", SUBJECT_RE)

  // Status must be EXPLICITLY active — never inferred.
  if (get("CF_D1_BOOTSTRAP_TENANT_STATUS") !== "active") failures.push("invalid:CF_D1_BOOTSTRAP_TENANT_STATUS")
  if (get("CF_D1_BOOTSTRAP_MEMBERSHIP_STATUS") !== "active") failures.push("invalid:CF_D1_BOOTSTRAP_MEMBERSHIP_STATUS")
  // Role + provider must be allowlisted.
  if (!ALLOWED_ROLES.includes(get("CF_D1_BOOTSTRAP_MEMBERSHIP_ROLE"))) failures.push("invalid:CF_D1_BOOTSTRAP_MEMBERSHIP_ROLE")
  if (!ALLOWED_PROVIDERS.includes(get("CF_D1_BOOTSTRAP_IDENTITY_PROVIDER"))) failures.push("invalid:CF_D1_BOOTSTRAP_IDENTITY_PROVIDER")
  // Database id uses the SAME validation as the deployment config (UUID, non-placeholder).
  const dbId = validateD1Id(get("CF_D1_BOOTSTRAP_DATABASE_ID"))
  if (!dbId.ok) failures.push(`invalid:CF_D1_BOOTSTRAP_DATABASE_ID:${dbId.reason}`)

  // The registry's schema_version is CANONICAL, not an arbitrary digit string: it
  // names which tenant schema the registry row claims the database has. A bounded
  // format check cannot tell a correct version from a plausible one, so it must
  // equal the manifest's single canonical source exactly.
  const loaded = loadManifest(repoRoot)
  const canonicalVersion = loaded.ok ? tenantRegistrySchemaVersion(loaded.manifest) : null
  if (canonicalVersion === null) failures.push("invalid:CF_D1_BOOTSTRAP_SCHEMA_VERSION:canonical_version_unavailable")
  else if (get("CF_D1_BOOTSTRAP_SCHEMA_VERSION") !== canonicalVersion) failures.push("invalid:CF_D1_BOOTSTRAP_SCHEMA_VERSION:not_canonical")

  if (failures.length > 0) return { ok: false, failures }

  return {
    ok: true,
    values: {
      tenantId: get("CF_D1_BOOTSTRAP_TENANT_ID"),
      tenantName: get("CF_D1_BOOTSTRAP_TENANT_NAME"),
      tenantSlug: get("CF_D1_BOOTSTRAP_TENANT_SLUG"),
      tenantStatus: get("CF_D1_BOOTSTRAP_TENANT_STATUS"),
      databaseName: get("CF_D1_BOOTSTRAP_DATABASE_NAME"),
      databaseId: get("CF_D1_BOOTSTRAP_DATABASE_ID"),
      schemaVersion: get("CF_D1_BOOTSTRAP_SCHEMA_VERSION"),
      userId: get("CF_D1_BOOTSTRAP_USER_ID"),
      userEmail: get("CF_D1_BOOTSTRAP_USER_EMAIL"),
      membershipId: get("CF_D1_BOOTSTRAP_MEMBERSHIP_ID"),
      membershipRole: get("CF_D1_BOOTSTRAP_MEMBERSHIP_ROLE"),
      membershipStatus: get("CF_D1_BOOTSTRAP_MEMBERSHIP_STATUS"),
      identityId: get("CF_D1_BOOTSTRAP_IDENTITY_ID"),
      identityProvider: get("CF_D1_BOOTSTRAP_IDENTITY_PROVIDER"),
      identitySubject: get("CF_D1_BOOTSTRAP_IDENTITY_SUBJECT"),
    },
  }
}

const lit = (v) => `'${String(v).replace(/'/g, "''")}'`

// ─── Canonical artifact format ───────────────────────────────────

/**
 * The artifact format version. `apply` refuses any other version rather than
 * guessing how to reconstruct older bytes.
 */
export const BOOTSTRAP_ARTIFACT_VERSION = 1
export const BOOTSTRAP_ARTIFACT_MAGIC = "-- atra-bootstrap-artifact"
/**
 * Hard size cap, enforced BEFORE the artifact is parsed. The canonical artifact is
 * a few hundred bytes; anything near this is not something we generated.
 */
export const BOOTSTRAP_ARTIFACT_MAX_BYTES = 16 * 1024

/** Exactly the shape `Date.prototype.toISOString()` emits, in UTC. */
const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

/** True only for a canonical ISO-8601 UTC instant that round-trips exactly. */
export function isCanonicalTimestamp(value) {
  if (typeof value !== "string" || !ISO_UTC_RE.test(value)) return false
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value
}

/**
 * Parse the artifact's bounded, NON-SENSITIVE metadata header. It carries only a
 * format version and one `generated_at` instant — never an operator value — and it
 * exists so `apply` can reconstruct the exact canonical bytes (the timestamp is the
 * only part of the SQL that `apply` cannot derive from the environment).
 *
 * Returns `{ ok, version, generatedAt }` or `{ ok:false, failure }` — a safe
 * category, never file contents.
 */
export function parseArtifactHeader(text) {
  if (typeof text !== "string") return { ok: false, failure: "bootstrap_sql_format_invalid" }
  const lines = text.split("\n")
  const magic = new RegExp(`^${BOOTSTRAP_ARTIFACT_MAGIC} v(\\d{1,3})$`).exec(lines[0] ?? "")
  if (!magic) return { ok: false, failure: "bootstrap_sql_format_invalid" }
  const version = Number(magic[1])
  if (version !== BOOTSTRAP_ARTIFACT_VERSION) return { ok: false, failure: "bootstrap_sql_format_invalid" }
  const stamp = /^-- generated_at: (.+)$/.exec(lines[1] ?? "")
  if (!stamp || !isCanonicalTimestamp(stamp[1])) return { ok: false, failure: "bootstrap_sql_format_invalid" }
  return { ok: true, version, generatedAt: stamp[1] }
}

/**
 * Build the COMPLETE canonical bootstrap artifact — header included — as ONE
 * ATOMIC OPERATION.
 *
 * This function is the single definition of what a valid artifact IS. `prepare`
 * writes its output; `apply` re-runs it against the CURRENTLY validated operator
 * values plus the artifact's own parsed `generated_at`, and compares the whole file
 * byte-for-byte. A prepared file is therefore a reviewable plan, never execution
 * authority: authority comes from the operator environment at apply time.
 *
 * Because the comparison is over the entire byte sequence, it covers changed
 * values, a replaced table name, appended or removed statements, and reordering —
 * without ever scanning for "forbidden" keywords.
 *
 * ATOMICITY (verified against pinned Wrangler 4.99.0, not assumed):
 *   All five INSERTs live in ONE file, applied by ONE `wrangler d1 execute --file`
 *   invocation, which D1 runs as a single implicit atomic batch — a failure at any
 *   statement leaves ZERO rows. The file deliberately contains NO
 *   `BEGIN IMMEDIATE`/`COMMIT`: D1 REJECTS explicit transaction control, so adding
 *   it would break the bootstrap rather than make it atomic. The single-file batch
 *   IS the atomic boundary. See scripts/lib/d1AtomicBatch.mjs.
 *
 * Plain INSERTs (never INSERT OR IGNORE, never REPLACE), so a duplicate
 * tenant/slug/email/membership/identity FAILS CLOSED with zero new rows; D1
 * enforces the declared foreign keys, so a missing parent fails closed too.
 */
export function buildBootstrapSql(values, now = new Date().toISOString()) {
  const t = lit(now)
  return [
    `${BOOTSTRAP_ARTIFACT_MAGIC} v${BOOTSTRAP_ARTIFACT_VERSION}`,
    `-- generated_at: ${now}`,
    "-- P0-PERSIST-015 operator bootstrap (GENERATED, UNTRACKED, 0600). Do not commit.",
    "-- A reviewable PLAN, not execution authority: cf:d1:bootstrap:apply reconstructs",
    "-- these exact bytes from the operator environment and refuses any difference.",
    "-- ATOMIC: these five INSERTs are applied as ONE wrangler `d1 execute --file`",
    "-- invocation = ONE implicit D1 batch transaction (all-or-nothing).",
    "-- No BEGIN/COMMIT: D1 rejects explicit transaction control (verified).",
    "-- Plain INSERTs: a duplicate tenant/user/identity fails closed.",
    `INSERT INTO tenants (id,name,slug,status,created_at,updated_at) VALUES (${lit(values.tenantId)},${lit(values.tenantName)},${lit(values.tenantSlug)},${lit(values.tenantStatus)},${t},${t});`,
    `INSERT INTO tenant_databases (tenant_id,database_name,database_id,schema_version,status,created_at,updated_at) VALUES (${lit(values.tenantId)},${lit(values.databaseName)},${lit(values.databaseId)},${lit(values.schemaVersion)},'active',${t},${t});`,
    `INSERT INTO users (id,email,created_at,updated_at) VALUES (${lit(values.userId)},${lit(values.userEmail)},${t},${t});`,
    `INSERT INTO tenant_memberships (id,tenant_id,user_id,role,status,created_at,updated_at) VALUES (${lit(values.membershipId)},${lit(values.tenantId)},${lit(values.userId)},${lit(values.membershipRole)},${lit(values.membershipStatus)},${t},${t});`,
    `INSERT INTO auth_identities (id,user_id,provider,provider_subject,email,created_at,updated_at) VALUES (${lit(values.identityId)},${lit(values.userId)},${lit(values.identityProvider)},${lit(values.identitySubject)},${lit(values.userEmail)},${t},${t});`,
    "",
  ].join("\n")
}

/** Write the generated SQL to the untracked repo-root file with 0600 perms. */
export function writeBootstrapSql(sql, path = BOOTSTRAP_SQL_PATH) {
  writeFileSync(path, sql, { mode: 0o600 })
  return path
}

/** Remove the generated SQL (after apply or failure). */
export function removeBootstrapSql(path = BOOTSTRAP_SQL_PATH) {
  if (existsSync(path)) rmSync(path, { force: true })
}

function main() {
  const input = readOperatorInput(process.env)
  if (!input.ok) {
    // Field-name categories only — never echo a value.
    console.error(`cf:d1:bootstrap:prepare: FAIL — ${input.failures.join(", ")}`)
    removeBootstrapSql()
    process.exit(1)
  }
  try {
    writeBootstrapSql(buildBootstrapSql(input.values))
  } catch {
    removeBootstrapSql()
    console.error("cf:d1:bootstrap:prepare: FAIL — write_failed")
    process.exit(1)
  }
  // No operator value is ever logged.
  console.log(`cf:d1:bootstrap:prepare: prepared ${BOOTSTRAP_SQL_BASENAME} (untracked, 0600, 5 statements).`)
  console.log("This command does NOT apply. Inspect the plan, then apply with the repository-controlled command:")
  console.log("  npm run cf:d1:bootstrap:apply -- --remote --config wrangler.deploy.json")
  console.log("It requires CF_D1_BOOTSTRAP_EXECUTE=1 and CF_D1_BOOTSTRAP_CONFIRM=APPLY_PRODUCTION_CONTROL_BOOTSTRAP, applies the file as ONE atomic batch, verifies the result read-only, and always removes the generated SQL.")
  process.exit(0)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
