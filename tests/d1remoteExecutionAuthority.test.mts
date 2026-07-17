/**
 * P0-PERSIST-015 — the migration-apply command executes EXACT bytes from ONE retained
 * authority, via short-lived scoped execution configs (Issue #155).
 *
 * A filesystem path is NOT immutable authority: every Wrangler call gets its OWN
 * ephemeral config derived from the retained bytes, verified to hash to
 * `authority.sha256`, and removed the instant its call returns.
 *
 * `spawnSync` is stubbed everywhere. NOTHING here contacts Cloudflare, queries a
 * remote database, migrates, or deploys.
 *
 * NOTE (P0-FIX-018): the deploy-orchestrator and schema-command remote paths that
 * this file used to drive through the exported `runPipeline` /
 * `verifyRemoteSchemasWithAuthority` are gone — those functions are no longer
 * exported. Their (now entrypoint-only) behaviour is covered by
 * `cloudflareRemoteGateBoundaries.test.mts`.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync, writeFileSync, rmSync, existsSync, statSync, readdirSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { evaluateRemoteVerifyGates } from "../scripts/cf-d1-schema-verify-remote.mjs"
import { loadValidatedDeployConfigAuthority, withPrivateExecutionConfig } from "../scripts/lib/cfDeployConfigAuthority.mjs"
import { buildConfigWithIds, loadConfigFile, SYNTHETIC_D1_IDS } from "../scripts/lib/cfDeployConfig.mjs"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const CONFIG_PATH = resolve(REPO_ROOT, "wrangler.deploy.remoteauthtest.json")
const MIGRATE_SRC = resolve(REPO_ROOT, "scripts/cf-d1-migrations-apply.mjs")

const baseConfig = (loadConfigFile(resolve(REPO_ROOT, "wrangler.json")) as { config: Record<string, unknown> }).config
const HIJACK_ID = "dddddddd-0000-4000-8000-00000000dead"
const digestOf = (bytes: string) => createHash("sha256").update(bytes).digest("hex")

function withConfig(fn: (path: string) => void) {
  try {
    writeFileSync(CONFIG_PATH, JSON.stringify(buildConfigWithIds(baseConfig, SYNTHETIC_D1_IDS), null, 2), { mode: 0o600 })
    fn(CONFIG_PATH)
  } finally {
    rmSync(CONFIG_PATH, { force: true })
  }
}
const authorityFor = (configPath: string) => {
  const result = loadValidatedDeployConfigAuthority({ configPath, repoRoot: REPO_ROOT, allowPlaceholderIds: false })
  if (!result.ok) throw new Error(`authority must load: ${result.blocked.join(",")}`)
  return result.authority
}
function hijack(configPath: string) {
  const cfg = JSON.parse(readFileSync(configPath, "utf8"))
  for (const db of cfg.d1_databases) db.database_id = HIJACK_ID
  writeFileSync(configPath, JSON.stringify(cfg, null, 2), { mode: 0o600 })
}

interface Call { binding: string; config: string | null; bytes: string | null; mode: number | null; cmd: string; args: string[]; execFilesPresent: string[] }

const OWN_EXEC = /^wrangler\.deploy\.(migrate|verify|preflight|artifacts|deploy)-exec-[0-9a-f]+\.json$/
const execFilesAtRoot = () => readdirSync(REPO_ROOT).filter((f) => OWN_EXEC.test(f))

function recordingSpawn(calls: Call[], options: { fail?: boolean } = {}) {
  return (bin: string, args: string[]) => {
    const ci = args.indexOf("--config")
    const config = ci >= 0 ? args[ci + 1] : null
    calls.push({
      binding: args[2] ?? "", config,
      bytes: config ? readFileSync(config, "utf8") : null,
      mode: config ? statSync(config).mode & 0o777 : null,
      cmd: bin, args, execFilesPresent: execFilesAtRoot(),
    })
    if (options.fail) return { status: 1, stdout: "" }
    return { status: 0, stdout: JSON.stringify([{ results: [] }]) }
  }
}

function clearPrivateConfigs() {
  for (const f of execFilesAtRoot()) rmSync(resolve(REPO_ROOT, f), { force: true })
}

/** Slice the migration command's Wrangler-invoking leaves and drive them offline. */
function driveMigrationLeafs(options: { fail?: boolean } = {}) {
  const src = readFileSync(MIGRATE_SRC, "utf8")
  const slice = (name: string) => {
    const start = src.indexOf(`function ${name}(`)
    return src.slice(start, src.indexOf("\n}", start) + 2)
  }
  const calls: Call[] = []
  const fns = new Function("deps", `
    const { spawnSync, withPrivateExecutionConfig, requireAuthorizedExecution, writeFileSync, rmSync,
            mkdtempSync, resolve, tmpdir, WRANGLER_BIN, REPO_ROOT } = deps
    ${slice("remoteQuery")}
    ${slice("execRemoteSqlText")}
    return { remoteQuery, execRemoteSqlText }
  `)({
    spawnSync: recordingSpawn(calls, options),
    withPrivateExecutionConfig, requireAuthorizedExecution: () => {},
    writeFileSync, rmSync, mkdtempSync, resolve, tmpdir,
    WRANGLER_BIN: "/nonexistent/wrangler", REPO_ROOT,
  }) as { remoteQuery: (...a: unknown[]) => unknown; execRemoteSqlText: (...a: unknown[]) => unknown }
  return { fns, calls }
}

test("migration 1–4 + 7 + 8. every remote call mints a fresh scoped config with authority bytes; distinct paths; one digest; none survive", () => {
  withConfig((configPath) => {
    const authority = authorityFor(configPath)
    const { fns, calls } = driveMigrationLeafs()
    fns.remoteQuery("CONTROL_DB", authority, "SELECT 1;")
    fns.execRemoteSqlText("TENANT_DB_DEFAULT", authority, "CREATE TABLE x(id);", "0006_x")
    fns.remoteQuery("TENANT_DB_DEFAULT", authority, "PRAGMA table_info(\"x\");")
    assert.equal(calls.length, 3)
    for (const c of calls) {
      assert.ok(c.config, "1. every remote call receives a scoped private config")
      assert.match(c.config!.slice(REPO_ROOT.length + 1), /^wrangler\.deploy\.migrate-exec-[0-9a-f]{24}\.json$/)
      assert.equal(c.bytes, authority.bytes, "2. every call's config bytes equal authority.bytes")
      assert.equal(c.mode, 0o400, "the scoped config is read-only")
      assert.notEqual(c.config, configPath, "the original path never reaches Wrangler")
    }
    assert.equal(new Set(calls.map((c) => c.config)).size, 3, "each call uses a distinct ephemeral path")
    assert.equal(new Set(calls.map((c) => digestOf(c.bytes!))).size, 1)
    assert.equal(digestOf(calls[0].bytes!), authority.sha256)
    for (const c of calls) assert.equal(existsSync(c.config!), false)
    assert.deepEqual(execFilesAtRoot(), [])
  })
  clearPrivateConfigs()
})

test("migration 5. mutating a prior call's (removed) path cannot redirect the next call", () => {
  withConfig((configPath) => {
    const authority = authorityFor(configPath)
    const { fns, calls } = driveMigrationLeafs()
    fns.remoteQuery("CONTROL_DB", authority, "SELECT 1;")
    const firstPath = calls[0].config!
    assert.equal(existsSync(firstPath), false, "the first call's config is already gone")
    writeFileSync(firstPath, JSON.stringify({ d1_databases: [{ database_id: HIJACK_ID }] }), { mode: 0o600 })
    try {
      fns.remoteQuery("TENANT_DB_DEFAULT", authority, "SELECT 2;")
      assert.notEqual(calls[1].config, firstPath, "a later call never reuses an earlier path")
      assert.equal(calls[1].bytes, authority.bytes, "the later call still carries the authority bytes")
      assert.doesNotMatch(calls[1].bytes!, /dead/, "the hostile earlier file cannot redirect the next call")
    } finally {
      rmSync(firstPath, { force: true })
    }
  })
  clearPrivateConfigs()
})

test("migration 9 + 10 + 11. no scoped config survives a query failure or a migration (write) failure", () => {
  withConfig((configPath) => {
    const authority = authorityFor(configPath)
    const { fns, calls } = driveMigrationLeafs({ fail: true })
    assert.throws(() => fns.remoteQuery("CONTROL_DB", authority, "SELECT 1;"), /remote_query_failed/)
    assert.throws(() => fns.execRemoteSqlText("CONTROL_DB", authority, "CREATE TABLE x(id);", "l"), /remote_exec_failed/)
    for (const c of calls) assert.equal(existsSync(c.config!), false, "the scoped config is removed even on failure")
    assert.deepEqual(execFilesAtRoot(), [])
  })
  clearPrivateConfigs()
})

test("migration 6. deleting or replacing the original generated config has no effect on the retained bytes", () => {
  withConfig((configPath) => {
    const authority = authorityFor(configPath)
    hijack(configPath)
    assert.doesNotMatch(authority.bytes, /dead/, "the retained bytes are immune to a later edit")
    rmSync(configPath, { force: true })
    const { fns, calls } = driveMigrationLeafs()
    assert.doesNotThrow(() => fns.remoteQuery("CONTROL_DB", authority, "SELECT 1;"))
    assert.equal(calls[0].bytes, authority.bytes, "execution runs from the retained bytes, original gone")
  })
  clearPrivateConfigs()
})

test("migration: helpers thread the AUTHORITY, never a reusable executionConfig path", () => {
  const src = readFileSync(MIGRATE_SRC, "utf8")
  for (const helper of ["function remoteQuery(", "function execRemoteSqlText("]) {
    const start = src.indexOf(helper)
    assert.ok(start >= 0, `${helper} must exist`)
    const body = src.slice(start, src.indexOf("\n}", start))
    assert.doesNotMatch(body, /"--config", configPath/, `${helper} must never receive the original config path`)
    assert.match(body, /withPrivateExecutionConfig\(authority, \{ repoRoot: REPO_ROOT, purpose: "migrate-exec" \}, \(executionConfig\) =>/, `${helper} must open a scoped config per call`)
    assert.match(body, /"--config", executionConfig/, `${helper} must hand Wrangler the scoped config`)
  }
  assert.match(src, /function applyAllLanes\(authority\)/)
  assert.match(src, /exitCode = applyAllLanes\(gates\.configAuthority\)/)
  assert.doesNotMatch(src, /createPrivateExecutionConfig/, "migration apply must not create a reusable private config")
})

test("migration 12. a same-ID config yields no authority and opens no execution latch — zero Wrangler calls", async () => {
  const { evaluateApplyGates } = await import("../scripts/cf-d1-migrations-apply.mjs")
  const SAME = "3f2504e0-4f89-41d3-9a0c-0305e82c3300"
  const samePath = resolve(REPO_ROOT, "wrangler.deploy.migsameid.json")
  writeFileSync(samePath, JSON.stringify(buildConfigWithIds(baseConfig, { CONTROL_DB: SAME, TENANT_DB_DEFAULT: SAME }), null, 2), { mode: 0o600 })
  try {
    const gates = evaluateApplyGates({
      env: { CF_D1_MIGRATE_EXECUTE: "1", CF_D1_MIGRATE_CONFIRM: "APPLY_PRODUCTION_D1_MIGRATIONS" },
      argv: ["--remote"], repoRoot: REPO_ROOT, configPath: samePath,
    })
    assert.equal(gates.ok, false, "a same-ID config must fail the gates")
    assert.ok(gates.blocked.includes("deploy_config_invalid"))
    assert.equal(gates.configAuthority, null, "no authority is handed back, so no lane can run")
  } finally {
    rmSync(samePath, { force: true })
  }
  const src = readFileSync(MIGRATE_SRC, "utf8")
  assert.ok(src.indexOf("executionAuthorized = true") > src.indexOf("if (!gates.ok)"), "the gate check precedes the latch")
})

test("remote verify: a refused config yields no authority and no remote query", () => {
  const gates = evaluateRemoteVerifyGates({ argv: [], repoRoot: REPO_ROOT, configPath: resolve(REPO_ROOT, "wrangler.json") })
  assert.equal(gates.ok, false)
  assert.equal(gates.configAuthority, null, "a refused config hands back no authority, so main issues no query")
})
