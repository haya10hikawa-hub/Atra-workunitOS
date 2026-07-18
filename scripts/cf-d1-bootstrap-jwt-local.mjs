#!/usr/bin/env node
/**
 * Local-only JWT D1 bootstrap for Wrangler/OpenNext smoke testing.
 *
 * Seeds the local CONTROL_DB with a JWT auth identity, user, active tenant,
 * active membership, and tenant registry row. Applies local migrations first.
 * Never uses --remote; never logs JWTs, secrets, subject, email, or DB IDs.
 */

import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { KNOWN_BINDINGS, loadManifest, resolveMigrationPath, tenantRegistrySchemaVersion, validateManifest } from "./lib/d1MigrationManifest.mjs"
import { resolveLocalJwtAuthority, validateLocalJwtEnv } from "./lib/localJwt.mjs"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const WRANGLER_BIN = resolve(REPO_ROOT, "node_modules/.bin/wrangler")
const LOCAL_TENANT_DB_ID = "00000000-0000-4000-8000-000000000010"
const LOCAL_TENANT_ID = "local-dev-tenant"
const LOCAL_TENANT_NAME = "Local Dev Tenant"
const LOCAL_TENANT_SLUG = "local-dev-tenant"
const LOCAL_TENANT_DB_NAME = "local-dev-tenant-db"
const LOCAL_ROLE = "owner"

function fail(reason) {
  console.error(`cf:d1:bootstrap:jwt-local: FAIL — ${reason}`)
  process.exit(1)
}

function hash12(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12)
}

function sqlLit(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

export function buildLocalJwtBootstrapPlan(env, repoRoot = REPO_ROOT) {
  const jwtEnv = validateLocalJwtEnv(env)
  if (!jwtEnv.ok) return { ok: false, reason: jwtEnv.failures[0] ?? "jwt_env_invalid" }
  if (env.CF_D1_BOOTSTRAP_IDENTITY_PROVIDER && env.CF_D1_BOOTSTRAP_IDENTITY_PROVIDER !== "jwt") return { ok: false, reason: "identity_provider_not_jwt" }
  const loaded = loadManifest(repoRoot)
  if (!loaded.ok) return { ok: false, reason: "manifest_unreadable" }
  const schemaVersion = tenantRegistrySchemaVersion(loaded.manifest)
  if (!schemaVersion) return { ok: false, reason: "schema_version_unavailable" }
  const suffix = hash12(env.CF_D1_BOOTSTRAP_IDENTITY_SUBJECT)
  return {
    ok: true,
    values: Object.freeze({
      tenantId: LOCAL_TENANT_ID,
      tenantName: LOCAL_TENANT_NAME,
      tenantSlug: LOCAL_TENANT_SLUG,
      databaseName: LOCAL_TENANT_DB_NAME,
      databaseId: LOCAL_TENANT_DB_ID,
      schemaVersion,
      userId: `local-jwt-user-${suffix}`,
      userEmail: env.CF_D1_BOOTSTRAP_IDENTITY_EMAIL,
      membershipId: `local-jwt-membership-${suffix}`,
      membershipRole: LOCAL_ROLE,
      identityId: `local-jwt-identity-${suffix}`,
      identityProvider: "jwt",
      identitySubject: env.CF_D1_BOOTSTRAP_IDENTITY_SUBJECT,
    }),
  }
}

export function buildIdempotentBootstrapSql(values, now = new Date().toISOString()) {
  const t = sqlLit(now)
  return [
    "-- local JWT bootstrap; generated temporary file; do not commit",
    `INSERT INTO tenants (id,name,slug,status,created_at,updated_at) VALUES (${sqlLit(values.tenantId)},${sqlLit(values.tenantName)},${sqlLit(values.tenantSlug)},'active',${t},${t}) ON CONFLICT(id) DO UPDATE SET name=excluded.name, slug=excluded.slug, status='active', updated_at=excluded.updated_at;`,
    `INSERT INTO tenant_databases (tenant_id,database_name,database_id,schema_version,status,created_at,updated_at) VALUES (${sqlLit(values.tenantId)},${sqlLit(values.databaseName)},${sqlLit(values.databaseId)},${sqlLit(values.schemaVersion)},'active',${t},${t}) ON CONFLICT(tenant_id) DO UPDATE SET database_name=excluded.database_name, database_id=excluded.database_id, schema_version=excluded.schema_version, status='active', updated_at=excluded.updated_at;`,
    `INSERT INTO users (id,email,created_at,updated_at) VALUES (${sqlLit(values.userId)},${sqlLit(values.userEmail)},${t},${t}) ON CONFLICT(id) DO UPDATE SET email=excluded.email, updated_at=excluded.updated_at;`,
    `INSERT INTO tenant_memberships (id,tenant_id,user_id,role,status,created_at,updated_at) VALUES (${sqlLit(values.membershipId)},${sqlLit(values.tenantId)},${sqlLit(values.userId)},${sqlLit(values.membershipRole)},'active',${t},${t}) ON CONFLICT(tenant_id,user_id) DO UPDATE SET role=excluded.role, status='active', updated_at=excluded.updated_at;`,
    `INSERT INTO auth_identities (id,user_id,provider,provider_subject,email,created_at,updated_at) VALUES (${sqlLit(values.identityId)},${sqlLit(values.userId)},'jwt',${sqlLit(values.identitySubject)},${sqlLit(values.userEmail)},${t},${t}) ON CONFLICT(provider,provider_subject) DO UPDATE SET user_id=excluded.user_id, email=excluded.email, updated_at=excluded.updated_at;`,
    "",
  ].join("\n")
}

function runWrangler(args, opts = {}) {
  const result = spawnSync(WRANGLER_BIN, args, { cwd: REPO_ROOT, encoding: "utf8", ...opts })
  if (result.status !== 0) {
    throw new Error(opts.safeLabel ?? "wrangler_failed")
  }
  return result.stdout
}

function executeFile(binding, file, label) {
  runWrangler(["d1", "execute", binding, "--local", "--file", file], { safeLabel: label })
}

function executeSqlText(binding, sql, label) {
  const dir = mkdtempSync(resolve(tmpdir(), "d1-local-jwt-"))
  const file = resolve(dir, `${label}.sql`)
  try {
    writeFileSync(file, sql, { mode: 0o600 })
    executeFile(binding, file, label)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function queryJson(binding, sql, label) {
  const out = runWrangler(["d1", "execute", binding, "--local", "--command", sql, "--json"], { safeLabel: label })
  try {
    const parsed = JSON.parse(out)
    const first = Array.isArray(parsed) ? parsed[0] : parsed
    return Array.isArray(first?.results) ? first.results : []
  } catch {
    throw new Error(`${label}_json_unparseable`)
  }
}

function applyLocalMigrations() {
  const loaded = loadManifest(REPO_ROOT)
  if (!loaded.ok) throw new Error("manifest_unreadable")
  const checked = validateManifest(loaded.manifest, REPO_ROOT)
  if (!checked.ok) throw new Error("manifest_invalid")
  for (const binding of KNOWN_BINDINGS) {
    for (const entry of loaded.manifest.lanes[binding]) {
      if (entry.apply === "once" && onceMigrationAlreadyApplied(binding, entry)) continue
      const resolved = resolveMigrationPath(REPO_ROOT, entry.path)
      if (!resolved.ok) throw new Error(`migration_path_invalid:${binding}:${resolved.name}`)
      executeFile(binding, resolved.absPath, `migration_failed:${binding}:${resolved.name}`)
    }
  }
}

function onceMigrationAlreadyApplied(binding, entry) {
  if (entry.apply !== "once") return false
  if (!entry.effect || entry.effect.type !== "column_exists") return false
  const cols = queryJson(binding, `PRAGMA table_info(${entry.effect.table});`, `schema_probe:${binding}:${entry.effect.table}`)
  return cols.some((row) => row.name === entry.effect.column)
}

function verifyCounts() {
  const rows = queryJson("CONTROL_DB", "SELECT (SELECT COUNT(*) FROM tenants) AS tenants, (SELECT COUNT(*) FROM tenant_databases) AS tenant_databases, (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM tenant_memberships) AS tenant_memberships, (SELECT COUNT(*) FROM auth_identities) AS auth_identities;", "control_verify_counts")
  return rows[0] ?? {}
}

function main() {
  const allowEnvOverride = process.argv.includes("--allow-env-override")
  const authority = resolveLocalJwtAuthority(REPO_ROOT, process.env, { allowEnvOverride })
  if (!authority.ok) fail(`${authority.reason}:${authority.conflicts.join(",")}`)
  const plan = buildLocalJwtBootstrapPlan(authority.env)
  if (!plan.ok) fail(plan.reason)
  try {
    applyLocalMigrations()
    executeSqlText("CONTROL_DB", buildIdempotentBootstrapSql(plan.values), "bootstrap")
    const counts = verifyCounts()
    console.log("cf:d1:bootstrap:jwt-local: OK (local migrations + idempotent JWT identity bootstrap).")
    console.log(`cf:d1:bootstrap:jwt-local: verified row categories: tenants=${counts.tenants}, tenant_databases=${counts.tenant_databases}, users=${counts.users}, memberships=${counts.tenant_memberships}, identities=${counts.auth_identities}`)
    console.log("cf:d1:bootstrap:jwt-local: seeded provider=jwt, tenant status=active, membership status=active, role=owner.")
  } catch (err) {
    fail(err.message || "bootstrap_failed")
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
