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

// A wrangler invocation is fully described by { bin, cwd, extraArgs, remaining }.
// Threading these through every d1 call is what lets the hermetic smoke runner
// point BOTH the migrations and the seed at an isolated `--config` + `--persist-to`
// without the CLI default path (operator `.dev.vars` / default `.wrangler`)
// changing. `remaining()` returns the caller's remaining time budget (ms); each
// spawn is bounded by it and a timeout is surfaced as `err.timedOut` so the
// hermetic runner can report a stable `*_timeout` category.
function timedOutError(label) {
  const e = new Error(label ?? "wrangler_timeout")
  e.timedOut = true
  return e
}

function createWranglerRunner({ wranglerBin = WRANGLER_BIN, cwd = REPO_ROOT, extraArgs = [], remaining } = {}) {
  return function run(args, opts = {}) {
    const spawnOpts = { cwd, encoding: "utf8", ...opts }
    if (typeof remaining === "function") {
      const rem = remaining()
      if (!(rem > 0)) throw timedOutError(opts.safeLabel)
      spawnOpts.timeout = rem
    }
    const result = spawnSync(wranglerBin, [...args, ...extraArgs], spawnOpts)
    if (result.signal || (result.error && result.error.code === "ETIMEDOUT")) {
      throw timedOutError(opts.safeLabel)
    }
    if (result.status !== 0) {
      throw new Error(opts.safeLabel ?? "wrangler_failed")
    }
    return result.stdout
  }
}

function executeFile(run, binding, file, label) {
  run(["d1", "execute", binding, "--local", "--file", file], { safeLabel: label })
}

function executeSqlText(run, binding, sql, label) {
  const dir = mkdtempSync(resolve(tmpdir(), "d1-local-jwt-"))
  const file = resolve(dir, `${label}.sql`)
  try {
    writeFileSync(file, sql, { mode: 0o600 })
    executeFile(run, binding, file, label)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function queryJson(run, binding, sql, label) {
  const out = run(["d1", "execute", binding, "--local", "--command", sql, "--json"], { safeLabel: label })
  try {
    const parsed = JSON.parse(out)
    const first = Array.isArray(parsed) ? parsed[0] : parsed
    return Array.isArray(first?.results) ? first.results : []
  } catch {
    throw new Error(`${label}_json_unparseable`)
  }
}

function applyLocalMigrations(run, repoRoot) {
  const loaded = loadManifest(repoRoot)
  if (!loaded.ok) throw new Error("manifest_unreadable")
  const checked = validateManifest(loaded.manifest, repoRoot)
  if (!checked.ok) throw new Error("manifest_invalid")
  for (const binding of KNOWN_BINDINGS) {
    for (const entry of loaded.manifest.lanes[binding]) {
      if (entry.apply === "once" && onceMigrationAlreadyApplied(run, binding, entry)) continue
      const resolved = resolveMigrationPath(repoRoot, entry.path)
      if (!resolved.ok) throw new Error(`migration_path_invalid:${binding}:${resolved.name}`)
      executeFile(run, binding, resolved.absPath, `migration_failed:${binding}:${resolved.name}`)
    }
  }
}

function onceMigrationAlreadyApplied(run, binding, entry) {
  if (entry.apply !== "once") return false
  if (!entry.effect || entry.effect.type !== "column_exists") return false
  const cols = queryJson(run, binding, `PRAGMA table_info(${entry.effect.table});`, `schema_probe:${binding}:${entry.effect.table}`)
  return cols.some((row) => row.name === entry.effect.column)
}

function verifyCounts(run) {
  const rows = queryJson(run, "CONTROL_DB", "SELECT (SELECT COUNT(*) FROM tenants) AS tenants, (SELECT COUNT(*) FROM tenant_databases) AS tenant_databases, (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM tenant_memberships) AS tenant_memberships, (SELECT COUNT(*) FROM auth_identities) AS auth_identities;", "control_verify_counts")
  return rows[0] ?? {}
}

/** Extra wrangler args expressing an isolated config + persistence directory. */
function isolationArgs(wrangler = {}) {
  const extraArgs = []
  if (wrangler.configPath) extraArgs.push("--config", wrangler.configPath)
  if (wrangler.persistTo) extraArgs.push("--persist-to", wrangler.persistTo)
  return extraArgs
}

/**
 * Apply local migrations and seed the idempotent JWT identity into a caller-chosen
 * (possibly isolated) local D1. Returns safe row-count CATEGORIES only — never a
 * seeded value. `wrangler` selects the binary, working directory, and the
 * `--config`/`--persist-to` isolation used by the hermetic smoke runner.
 *
 * @param {{ env: Record<string,string|undefined>, repoRoot?: string, wrangler?: { bin?: string, cwd?: string, configPath?: string, persistTo?: string, remaining?: () => number } }} params
 * @returns {{ ok: true, counts: Record<string, number> } | { ok: false, reason: string }}
 */
export function runLocalJwtBootstrap({ env, repoRoot = REPO_ROOT, wrangler = {} } = {}) {
  const plan = buildLocalJwtBootstrapPlan(env, repoRoot)
  if (!plan.ok) return { ok: false, reason: plan.reason }
  const run = createWranglerRunner({ wranglerBin: wrangler.bin, cwd: wrangler.cwd, extraArgs: isolationArgs(wrangler), remaining: wrangler.remaining })
  try {
    applyLocalMigrations(run, repoRoot)
    executeSqlText(run, "CONTROL_DB", buildIdempotentBootstrapSql(plan.values), "bootstrap")
    return { ok: true, counts: verifyCounts(run) }
  } catch (err) {
    if (err && err.timedOut) return { ok: false, reason: "bootstrap_timeout" }
    return { ok: false, reason: err instanceof Error ? err.message : "bootstrap_failed" }
  }
}

/**
 * Run a COUNT-only (or metadata-only) query against a caller-chosen isolated local
 * D1. Callers must pass predicate-shaped SQL that returns numbers, never values.
 * A wrangler timeout propagates as an Error with `.timedOut === true`.
 *
 * @param {{ sql: string, binding?: string, label?: string, wrangler?: { bin?: string, cwd?: string, configPath?: string, persistTo?: string, remaining?: () => number } }} params
 * @returns {Array<Record<string, unknown>>}
 */
export function queryLocalD1Json({ sql, binding = "CONTROL_DB", label = "query", wrangler = {} }) {
  const run = createWranglerRunner({ wranglerBin: wrangler.bin, cwd: wrangler.cwd, extraArgs: isolationArgs(wrangler), remaining: wrangler.remaining })
  return queryJson(run, binding, sql, label)
}

// ─── async, cancellable execution path (hermetic smoke runner) ──────
//
// The sync path above blocks the Node event loop inside `spawnSync`, so a signal
// arriving during a long wrangler call cannot be handled until it returns. The
// hermetic runner instead injects `exec(args, { label }) => Promise<{ status,
// stdout, timedOut }>`, backed by a detached, centrally-registered, deadline-bounded
// child, so a signal promptly terminates the in-flight D1 child. The SQL/plan logic
// is identical to the sync path; only the process launch differs.

const CONTROL_COUNTS_SQL =
  "SELECT (SELECT COUNT(*) FROM tenants) AS tenants, (SELECT COUNT(*) FROM tenant_databases) AS tenant_databases, (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM tenant_memberships) AS tenant_memberships, (SELECT COUNT(*) FROM auth_identities) AS auth_identities;"

function parseD1Results(out, label) {
  try {
    const parsed = JSON.parse(out)
    const first = Array.isArray(parsed) ? parsed[0] : parsed
    return Array.isArray(first?.results) ? first.results : []
  } catch {
    throw new Error(`${label}_json_unparseable`)
  }
}

async function execCheck(exec, args, label) {
  const r = await exec(args, { label })
  if (r.timedOut) {
    const e = new Error(label)
    e.timedOut = true
    throw e
  }
  if (r.status !== 0) throw new Error(label)
  return r.stdout ?? ""
}

async function executeFileAsync(exec, binding, file, label) {
  await execCheck(exec, ["d1", "execute", binding, "--local", "--file", file], label)
}

async function executeSqlTextAsync(exec, binding, sql, label) {
  const dir = mkdtempSync(resolve(tmpdir(), "d1-local-jwt-"))
  const file = resolve(dir, `${label}.sql`)
  try {
    writeFileSync(file, sql, { mode: 0o600 })
    await executeFileAsync(exec, binding, file, label)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

async function queryJsonAsync(exec, binding, sql, label) {
  const out = await execCheck(exec, ["d1", "execute", binding, "--local", "--command", sql, "--json"], label)
  return parseD1Results(out, label)
}

async function onceMigrationAlreadyAppliedAsync(exec, binding, entry) {
  if (entry.apply !== "once") return false
  if (!entry.effect || entry.effect.type !== "column_exists") return false
  const cols = await queryJsonAsync(exec, binding, `PRAGMA table_info(${entry.effect.table});`, `schema_probe:${binding}:${entry.effect.table}`)
  return cols.some((row) => row.name === entry.effect.column)
}

async function applyLocalMigrationsAsync(exec, repoRoot) {
  const loaded = loadManifest(repoRoot)
  if (!loaded.ok) throw new Error("manifest_unreadable")
  const checked = validateManifest(loaded.manifest, repoRoot)
  if (!checked.ok) throw new Error("manifest_invalid")
  for (const binding of KNOWN_BINDINGS) {
    for (const entry of loaded.manifest.lanes[binding]) {
      if (entry.apply === "once" && (await onceMigrationAlreadyAppliedAsync(exec, binding, entry))) continue
      const resolved = resolveMigrationPath(repoRoot, entry.path)
      if (!resolved.ok) throw new Error(`migration_path_invalid:${binding}:${resolved.name}`)
      await executeFileAsync(exec, binding, resolved.absPath, `migration_failed:${binding}:${resolved.name}`)
    }
  }
}

/**
 * Async, cancellable sibling of {@link runLocalJwtBootstrap}. `exec` launches a
 * detached, registered, deadline-bounded wrangler child (isolation args already
 * applied by the caller) and resolves `{ status, stdout, timedOut }`.
 *
 * @param {{ env: Record<string,string|undefined>, repoRoot?: string, exec: (args: string[], opts: { label: string }) => Promise<{ status: number|null, stdout?: string, timedOut?: boolean }> }} params
 * @returns {Promise<{ ok: true, counts: Record<string, number> } | { ok: false, reason: string }>}
 */
export async function runLocalJwtBootstrapAsync({ env, repoRoot = REPO_ROOT, exec } = {}) {
  const plan = buildLocalJwtBootstrapPlan(env, repoRoot)
  if (!plan.ok) return { ok: false, reason: plan.reason }
  try {
    await applyLocalMigrationsAsync(exec, repoRoot)
    await executeSqlTextAsync(exec, "CONTROL_DB", buildIdempotentBootstrapSql(plan.values), "bootstrap")
    const rows = await queryJsonAsync(exec, "CONTROL_DB", CONTROL_COUNTS_SQL, "control_verify_counts")
    return { ok: true, counts: rows[0] ?? {} }
  } catch (err) {
    if (err && err.timedOut) return { ok: false, reason: "bootstrap_timeout" }
    return { ok: false, reason: err instanceof Error ? err.message : "bootstrap_failed" }
  }
}

/** Async, cancellable sibling of {@link queryLocalD1Json}. */
export async function queryLocalD1JsonAsync({ sql, binding = "CONTROL_DB", label = "query", exec } = {}) {
  return queryJsonAsync(exec, binding, sql, label)
}

function main() {
  const allowEnvOverride = process.argv.includes("--allow-env-override")
  const authority = resolveLocalJwtAuthority(REPO_ROOT, process.env, { allowEnvOverride })
  if (!authority.ok) fail(`${authority.reason}:${authority.conflicts.join(",")}`)
  const result = runLocalJwtBootstrap({ env: authority.env, repoRoot: REPO_ROOT })
  if (!result.ok) fail(result.reason)
  const counts = result.counts
  console.log("cf:d1:bootstrap:jwt-local: OK (local migrations + idempotent JWT identity bootstrap).")
  console.log(`cf:d1:bootstrap:jwt-local: verified row categories: tenants=${counts.tenants}, tenant_databases=${counts.tenant_databases}, users=${counts.users}, memberships=${counts.tenant_memberships}, identities=${counts.auth_identities}`)
  console.log("cf:d1:bootstrap:jwt-local: seeded provider=jwt, tenant status=active, membership status=active, role=owner.")
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
