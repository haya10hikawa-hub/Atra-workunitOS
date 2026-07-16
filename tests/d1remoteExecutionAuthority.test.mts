/**
 * P0-PERSIST-015 — every remote D1 command executes EXACT bytes from ONE retained
 * authority, via short-lived scoped execution configs (Issue #155).
 *
 * A filesystem path is NOT immutable authority. An earlier repair wrote one private
 * execution config per command and reused its PATH for every Wrangler invocation — a
 * reusable mutable file that could be altered between the Control and Tenant lanes,
 * between verification queries, or after remote verification but before upload. The
 * report even claimed remote verification and deploy "cannot receive different config
 * paths"; they always did (verify-exec vs deploy-exec), and the test never observed
 * the real paths to notice.
 *
 * The corrected invariant is byte identity, not path identity: every Wrangler call
 * gets its OWN ephemeral config derived directly from the retained bytes, verified to
 * hash to `authority.sha256`, and removed the instant its call returns. Verification
 * and deploy may use different ephemeral paths, but they execute byte-for-byte
 * identical authority bytes bound by one digest.
 *
 * `spawnSync` is stubbed everywhere. NOTHING here contacts Cloudflare, queries a
 * remote database, migrates, or deploys.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync, writeFileSync, rmSync, existsSync, statSync, readdirSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import {
  makeWranglerReadOnlyRunner, verifyRemoteSchemasWithAuthority, evaluateRemoteVerifyGates,
} from "../scripts/cf-d1-schema-verify-remote.mjs"
import { DEPLOY_STEPS, runPipeline } from "../scripts/cloudflare-deploy.mjs"
import { loadValidatedDeployConfigAuthority, withPrivateExecutionConfig } from "../scripts/lib/cfDeployConfigAuthority.mjs"
import { buildConfigWithIds, loadConfigFile, SYNTHETIC_D1_IDS } from "../scripts/lib/cfDeployConfig.mjs"
import { loadManifest } from "../scripts/lib/d1MigrationManifest.mjs"
import { bootstrapInMemory } from "../scripts/lib/d1LocalBootstrap.mjs"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const CONFIG_PATH = resolve(REPO_ROOT, "wrangler.deploy.remoteauthtest.json")
const MIGRATE_SRC = resolve(REPO_ROOT, "scripts/cf-d1-migrations-apply.mjs")

const baseConfig = (loadConfigFile(resolve(REPO_ROOT, "wrangler.json")) as { config: Record<string, unknown> }).config
const HIJACK_ID = "dddddddd-0000-4000-8000-00000000dead"
const digestOf = (bytes: string) => createHash("sha256").update(bytes).digest("hex")

/** The brace-matched body of every `finally` block — there is more than one. */
function finallyBodies(src: string): string[] {
  const marker = "} finally {"
  const out: string[] = []
  let i = src.indexOf(marker)
  while (i >= 0) {
    let depth = 1
    let j = i + marker.length
    const start = j
    while (j < src.length && depth > 0) {
      if (src[j] === "{") depth++
      else if (src[j] === "}") depth--
      j++
    }
    out.push(src.slice(start, j - 1))
    i = src.indexOf(marker, j)
  }
  return out
}

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
/** Rewrite the original config to point at a different database. */
function hijack(configPath: string) {
  const cfg = JSON.parse(readFileSync(configPath, "utf8"))
  for (const db of cfg.d1_databases) db.database_id = HIJACK_ID
  writeFileSync(configPath, JSON.stringify(cfg, null, 2), { mode: 0o600 })
}

interface Call { binding: string; config: string | null; bytes: string | null; mode: number | null; cmd: string; args: string[]; execFilesPresent: string[] }

/**
 * Scoped execution configs THIS file's commands create, left at the repository root.
 * Scoped to only the purposes this file exercises (migrate/verify/preflight/artifacts/
 * deploy) — `node --test` runs test FILES in parallel, and the bootstrap suite writes
 * its own `bootstrap-exec-*` at the same root; matching every `*-exec-*` would pick up
 * (and clearPrivateConfigs would delete) a sibling file's live config.
 */
const OWN_EXEC = /^wrangler\.deploy\.(migrate|verify|preflight|artifacts|deploy)-exec-[0-9a-f]+\.json$/
const execFilesAtRoot = () => readdirSync(REPO_ROOT).filter((f) => OWN_EXEC.test(f))

/**
 * A spawn stub that records, for every Wrangler-style call, the `--config` path (if
 * any), the exact bytes behind it, its mode, and which scoped execution configs
 * exist AT THE MOMENT OF THE CALL — captured while the ephemeral file is still live.
 */
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

/**
 * Drive the REAL `runPipeline` and the REAL remote-schema verifier end to end with
 * an injected spawn. Introspection queries are answered from freshly bootstrapped
 * in-memory SQLite databases (the same manifest lanes deploy would verify), so
 * verification legitimately PASSES and the pipeline reaches `deploy` — letting the
 * test observe the actual `--config` bytes of BOTH the verification queries and the
 * upload. Nothing contacts Cloudflare.
 */
function withRealPipeline(authority: ReturnType<typeof authorityFor>, fn: (calls: Call[], code: number) => void) {
  const loaded = loadManifest(REPO_ROOT)
  if (!loaded.ok) throw new Error("manifest must load for the real verification harness")
  const { dbs } = bootstrapInMemory(REPO_ROOT, loaded.manifest) as { dbs: Record<string, { prepare(sql: string): { all(): unknown[] }; close(): void }> }
  try {
    const calls: Call[] = []
    const spawn = (bin: string, args: string[]) => {
      const ci = args.indexOf("--config")
      const config = ci >= 0 ? args[ci + 1] : null
      calls.push({
        binding: args[2] ?? "", config,
        bytes: config ? readFileSync(config, "utf8") : null,
        mode: config ? statSync(config).mode & 0o777 : null,
        cmd: bin, args, execFilesPresent: execFilesAtRoot(),
      })
      const cmi = args.indexOf("--command")
      if (cmi >= 0) {
        // A read-only introspection query — answer it from the real bootstrapped DB.
        const db = dbs[args[2]]
        let rows: unknown[] = []
        try { rows = db.prepare(args[cmi + 1]).all() } catch { rows = [] }
        return { status: 0, stdout: JSON.stringify([{ results: rows }]) }
      }
      return { status: 0, stdout: JSON.stringify([{ results: [] }]) }
    }
    fn(calls, runPipeline(authority, true, { spawn }))
  } finally {
    for (const db of Object.values(dbs)) { try { db.close() } catch { /* already closed */ } }
  }
}

// ─── Migration apply: a fresh scoped config for EVERY Wrangler call ──
//
// The two leaf Wrangler functions are sliced from source and driven with `spawnSync`
// stubbed, but the REAL `withPrivateExecutionConfig`. This observes the actual
// `--config` file (and its bytes) each remote call hands Wrangler — nothing runs.

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
    // A read (command), a write (--file), a probe (command) — spanning both bindings.
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
    // 4. different remote calls receive different ephemeral paths.
    assert.equal(new Set(calls.map((c) => c.config)).size, 3, "each call uses a distinct ephemeral path")
    // 3 + 7. every call reports the same authority digest — Control and Tenant alike.
    assert.equal(new Set(calls.map((c) => digestOf(c.bytes!))).size, 1)
    assert.equal(digestOf(calls[0].bytes!), authority.sha256)
    // 8. no scoped config survives success.
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
    // Drop a hostile file back where the first call's config was.
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
    // The temporary migration SQL and every scoped config are gone.
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

// ─── Migration apply: structural guards on the threaded authority ──

test("migration: helpers thread the AUTHORITY, never a reusable executionConfig path", () => {
  const src = readFileSync(MIGRATE_SRC, "utf8")
  // Every Wrangler-invoking helper takes `authority` and opens a scoped config.
  for (const helper of ["function remoteQuery(", "function execRemoteSqlText("]) {
    const start = src.indexOf(helper)
    assert.ok(start >= 0, `${helper} must exist`)
    const body = src.slice(start, src.indexOf("\n}", start))
    assert.doesNotMatch(body, /"--config", configPath/, `${helper} must never receive the original config path`)
    assert.match(body, /withPrivateExecutionConfig\(authority, \{ repoRoot: REPO_ROOT, purpose: "migrate-exec" \}, \(executionConfig\) =>/, `${helper} must open a scoped config per call`)
    assert.match(body, /"--config", executionConfig/, `${helper} must hand Wrangler the scoped config`)
  }
  assert.match(src, /function remoteQuery\(binding, authority, sql\)/)
  assert.match(src, /function readRemoteHistory\(binding, authority\)/)
  assert.match(src, /function remoteProbe\(binding, authority, effect\)/)
  assert.match(src, /function execRemoteSqlText\(binding, authority, sql, label\)/)
  assert.match(src, /function applyAllLanes\(authority\)/)
  // No reusable long-lived config: main threads the retained authority, not a path.
  assert.match(src, /exitCode = applyAllLanes\(gates\.configAuthority\)/)
  assert.doesNotMatch(src, /createPrivateExecutionConfig/, "migration apply must not create a reusable private config")
  assert.equal(src.split("withPrivateExecutionConfig(").length - 1 >= 2, true, "each Wrangler-invoking helper opens its own scoped config")
})

test("migration: the protected loop never re-reads the original config and never nested-exits", () => {
  const src = readFileSync(MIGRATE_SRC, "utf8")
  const loopStart = src.indexOf("function applyAllLanes(")
  const lanes = src.slice(loopStart, src.indexOf("\nfunction main()", loopStart))
  assert.doesNotMatch(lanes, /readFileSync\(configPath/, "a lane must never re-read the original config")
  assert.doesNotMatch(lanes, /loadConfigFile\(/, "a lane must never reload the original config")
  assert.doesNotMatch(lanes, /\bconfigPath\b/, "the original path must not even be in scope for the lanes")
  assert.doesNotMatch(lanes, /process\.exit/, "a nested exit would terminate before a scoped config's finally ran")
  assert.match(lanes, /return 1/, "failures must be reported as an exit code")
  assert.match(src, /loadValidatedDeployConfigAuthority\(\{ configPath, repoRoot, allowPlaceholderIds: false \}\)/)
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
  // The latch opens only AFTER the gate check, so a refused config reaches no Wrangler.
  const src = readFileSync(MIGRATE_SRC, "utf8")
  assert.ok(src.indexOf("executionAuthorized = true") > src.indexOf("if (!gates.ok)"), "the gate check precedes the latch")
})

// ─── Remote schema verification: scoped files, one authority digest ──

test("remote verify 1 + 2 + 3 + 5 + 6. every query mints its own scoped config; identical bytes; one digest; distinct paths; all removed", () => {
  withConfig((configPath) => {
    const authority = authorityFor(configPath)
    const calls: Call[] = []
    const result = verifyRemoteSchemasWithAuthority(authority, { repoRoot: REPO_ROOT, spawn: recordingSpawn(calls) })
    assert.ok(calls.length >= 2, "both bindings must be queried")
    assert.deepEqual([...new Set(calls.map((c) => c.binding))], ["CONTROL_DB", "TENANT_DB_DEFAULT"])
    for (const c of calls) {
      assert.equal(c.bytes, authority.bytes, "1. every query uses bytes matching the retained authority")
      assert.equal(c.mode, 0o400)
      assert.match(c.config!.slice(REPO_ROOT.length + 1), /^wrangler\.deploy\.verify-exec-[0-9a-f]{24}\.json$/)
      assert.notEqual(c.config, configPath, "the original path never reaches Wrangler")
    }
    // 3. no query reuses a previous private path.
    assert.equal(new Set(calls.map((c) => c.config)).size, calls.length, "each query uses a distinct ephemeral path")
    // 5 + 2. Control and Tenant remain ONE logical authority; the digest is reported.
    assert.equal(new Set(calls.map((c) => digestOf(c.bytes!))).size, 1)
    assert.equal(result.authorityDigest, authority.sha256, "2. the result reports the authority digest")
    // 6. every config is removed after its query.
    for (const c of calls) assert.equal(existsSync(c.config!), false)
    assert.equal(typeof result.ok, "boolean")
  })
  clearPrivateConfigs()
})

test("remote verify 4. mutating the original config (or a prior scoped path) cannot redirect the next query", () => {
  withConfig((configPath) => {
    const authority = authorityFor(configPath)
    hijack(configPath) // the operator's file is rewritten AFTER validation…
    const calls: Call[] = []
    verifyRemoteSchemasWithAuthority(authority, { repoRoot: REPO_ROOT, spawn: recordingSpawn(calls) })
    for (const c of calls) {
      assert.doesNotMatch(c.bytes!, /dead/, "a post-validation edit must not reach Wrangler")
      assert.match(c.bytes!, new RegExp(SYNTHETIC_D1_IDS.CONTROL_DB))
    }
    rmSync(configPath, { force: true }) // …and deleting it does not break verification.
    const after: Call[] = []
    assert.doesNotThrow(() => verifyRemoteSchemasWithAuthority(authority, { repoRoot: REPO_ROOT, spawn: recordingSpawn(after) }))
    assert.ok(after.length >= 2)
  })
  clearPrivateConfigs()
})

test("remote verify 6. every scoped config is removed after success AND after a query failure", () => {
  withConfig((configPath) => {
    const authority = authorityFor(configPath)
    for (const fail of [false, true]) {
      const calls: Call[] = []
      verifyRemoteSchemasWithAuthority(authority, { repoRoot: REPO_ROOT, spawn: recordingSpawn(calls, { fail }) })
      const used = calls[0]?.config
      assert.ok(used, `a query must have been attempted (fail=${fail})`)
      assert.equal(existsSync(used), false, `the scoped config must be removed (fail=${fail})`)
    }
    assert.deepEqual(execFilesAtRoot(), [])
  })
  clearPrivateConfigs()
})

test("remote verify 7. a mutation query never mints a config and never reaches Wrangler", () => {
  withConfig((configPath) => {
    const authority = authorityFor(configPath)
    const calls: Call[] = []
    const runner = makeWranglerReadOnlyRunner("CONTROL_DB", authority, recordingSpawn(calls), REPO_ROOT)
    for (const bad of ["DROP TABLE tenants", "INSERT INTO tenants (id) VALUES ('x')", "UPDATE tenants SET status='x'", "DELETE FROM tenants", "PRAGMA foreign_keys = ON"]) {
      assert.throws(() => runner(bad), /non_read_only_query_blocked/, `${bad} must never reach Wrangler`)
    }
    assert.equal(calls.length, 0, "no mutation may be spawned")
    assert.deepEqual(execFilesAtRoot(), [], "a blocked query must not even mint a scoped config")
    assert.doesNotThrow(() => runner("SELECT name FROM sqlite_master WHERE type = 'table'"))
    assert.equal(calls.length, 1)
    assert.equal(existsSync(calls[0].config!), false)
  })
  clearPrivateConfigs()
})

test("remote verify 8. a refused config yields no authority and no remote query", () => {
  // The committed base is not an approved generated config, and --remote is absent.
  const gates = evaluateRemoteVerifyGates({ argv: [], repoRoot: REPO_ROOT, configPath: resolve(REPO_ROOT, "wrangler.json") })
  assert.equal(gates.ok, false)
  assert.equal(gates.configAuthority, null, "a refused config hands back no authority, so main issues no query")
})

// ─── Worker deploy: verification + upload from ONE authority ─────────

test("worker deploy 1 + 2 + 3 + 4. verification and deploy use DIFFERENT ephemeral paths but byte-identical authority bytes and one digest", () => {
  withConfig((configPath) => {
    const authority = authorityFor(configPath)
    withRealPipeline(authority, (calls, code) => {
      assert.equal(code, 0, "the real pipeline must reach a completed deploy")
      const configCalls = calls.filter((c) => c.config !== null)
      const verifyPaths = configCalls.filter((c) => /verify-exec-/.test(c.config!)).map((c) => c.config)
      const deployPaths = configCalls.filter((c) => /deploy-exec-/.test(c.config!)).map((c) => c.config)
      assert.ok(verifyPaths.length >= 2, "both bindings are verified")
      assert.equal(deployPaths.length, 1, "exactly one upload")
      // 1. The audited head's report claimed verification and deploy shared one path;
      // they always differed (verify-exec vs deploy-exec), and now provably need not —
      // the guarantee is byte identity, not path identity.
      // 2. Verification and deploy may use different ephemeral paths…
      assert.notEqual(verifyPaths[0], deployPaths[0], "verification and deploy use different ephemeral files")
      assert.ok(new Set([...verifyPaths, ...deployPaths]).size >= 2)
      // 3. …that contain byte-for-byte identical authority bytes…
      for (const c of configCalls) assert.equal(c.bytes, authority.bytes, `${c.config} must carry the exact authority bytes`)
      // 4. …and map to the same authority digest — the one the deploy is bound to.
      assert.equal(new Set(configCalls.map((c) => digestOf(c.bytes!))).size, 1)
      const deployCall = configCalls.find((c) => /deploy-exec-/.test(c.config!))!
      assert.equal(digestOf(deployCall.bytes!), authority.sha256, "the upload executes the retained authority bytes")
    })
  })
  clearPrivateConfigs()
})

test("worker deploy 5 + 12. no execution config is long-lived — none exists during build, each config-using step has only its own, and all are removed", () => {
  withConfig((configPath) => {
    const authority = authorityFor(configPath)
    withRealPipeline(authority, (calls, code) => {
      assert.equal(code, 0)
      const build = calls.find((c) => c.args[0] === "build")
      assert.ok(build, "the build step must run")
      assert.deepEqual(build!.execFilesPresent, [], "5. no scoped execution config exists during the build")
      for (const c of calls.filter((c) => c.config !== null)) {
        assert.equal(c.execFilesPresent.length, 1, "a config-using step has exactly its own scoped config — never a reusable long-lived one")
      }
    })
    // 12. every ephemeral config is removed by the time the run ends.
    assert.deepEqual(execFilesAtRoot(), [])
  })
  clearPrivateConfigs()
})

test("worker deploy 6 + 7 + 8. mutating a verification config, or the original generated config, cannot redirect deploy; deleting the original does not break it", () => {
  withConfig((configPath) => {
    const authority = authorityFor(configPath)
    // 7. Mutate the original AFTER authority load.
    hijack(configPath)
    assert.doesNotMatch(authority.bytes, /dead/)
    withRealPipeline(authority, (calls, code) => {
      assert.equal(code, 0)
      for (const c of calls.filter((c) => c.config !== null)) assert.doesNotMatch(c.bytes!, /dead/, "a mutated original cannot redirect any step")
      // 6. Every verification config was removed before deploy — the deploy call sees
      // only its own scoped config, so a mutated/leaked verify path cannot redirect it.
      const deployCall = calls.find((c) => c.config && /deploy-exec-/.test(c.config))!
      assert.equal(deployCall.execFilesPresent.length, 1)
      assert.ok(/deploy-exec-/.test(deployCall.execFilesPresent[0]))
    })
    // 8. Deleting the original after authority load does not break deploy.
    rmSync(configPath, { force: true })
    withRealPipeline(authority, (calls, code) => {
      assert.equal(code, 0, "deleting the original after authority load must not break deploy")
      assert.ok(calls.some((c) => c.config && /deploy-exec-/.test(c.config)))
    })
  })
  clearPrivateConfigs()
})

test("worker deploy 9. a remote-verification failure PREVENTS deploy", () => {
  withConfig((configPath) => {
    const ran: string[] = []
    const code = runPipeline(authorityFor(configPath), true, {
      verifyRemoteSchemas: () => ({ ok: false, failures: ["registry_row"], authorityDigest: null }),
      run: (step) => { ran.push(step.name); return true },
    })
    assert.equal(code, 1, "the pipeline must abort")
    assert.equal(ran.includes("deploy"), false, "deploy must never run after a failed verification")
  })
})

test("worker deploy 10. an authority-digest mismatch PREVENTS deploy; a match allows it", () => {
  withConfig((configPath) => {
    const authority = authorityFor(configPath)
    const ranMismatch: string[] = []
    const mismatch = runPipeline(authority, true, {
      verifyRemoteSchemas: () => ({ ok: true, failures: [], authorityDigest: "deadbeef" }),
      run: (step) => { ranMismatch.push(step.name); return true },
    })
    assert.equal(mismatch, 1, "a verified digest ≠ deploy digest must abort")
    assert.equal(ranMismatch.includes("deploy"), false, "deploy must not run on a digest mismatch")

    const ranMatch: string[] = []
    const match = runPipeline(authority, true, {
      verifyRemoteSchemas: () => ({ ok: true, failures: [], authorityDigest: authority.sha256 }),
      run: (step) => { ranMatch.push(step.name); return true },
    })
    assert.equal(match, 0, "a matching digest allows deploy")
    assert.ok(ranMatch.includes("deploy"))
  })
})

test("worker deploy 11. offline mode performs NO remote call", () => {
  withConfig((configPath) => {
    const ran: string[] = []
    let verified = false
    const code = runPipeline(authorityFor(configPath), false, {
      verifyRemoteSchemas: () => { verified = true; return { ok: true, failures: [], authorityDigest: null } },
      run: (step) => { ran.push(step.name); return true },
    })
    assert.equal(code, 0, "an offline run stops cleanly")
    assert.equal(verified, false, "no remote schema verification without CF_DEPLOY_EXECUTE=1")
    assert.equal(ran.includes("deploy"), false, "no upload without CF_DEPLOY_EXECUTE=1")
    assert.deepEqual(ran, ["preflight", "build", "verify"], "it stops at the first remote step")
  })
})

test("worker deploy 13 + 14. Worker deploy never invokes migration apply or bootstrap apply", () => {
  const src = readFileSync(resolve(REPO_ROOT, "scripts/cloudflare-deploy.mjs"), "utf8")
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "")
  assert.doesNotMatch(code, /cf-d1-migrations-apply/, "deploy must never apply migrations")
  assert.doesNotMatch(code, /cf-d1-bootstrap-apply/, "deploy must never write bootstrap records")
  assert.doesNotMatch(code, /CF_D1_MIGRATE_EXECUTE|CF_D1_BOOTSTRAP_EXECUTE/, "deploy must never set an execution gate")
  for (const step of DEPLOY_STEPS) {
    assert.doesNotMatch(step.name, /migrat|bootstrap/i, `no deploy step may be a migration/bootstrap step (${step.name})`)
  }
})

// ─── Architecture guards ─────────────────────────────────────────

/** Source with comments stripped — prose must never satisfy or trip a guard. */
const codeOf = (rel: string) => readFileSync(resolve(REPO_ROOT, rel), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "")

const REMOTE_COMMANDS = [
  "scripts/cf-d1-migrations-apply.mjs",
  "scripts/cf-d1-schema-verify-remote.mjs",
  "scripts/cf-d1-bootstrap-apply.mjs",
  "scripts/cloudflare-deploy.mjs",
]

test("GUARD: no remote Wrangler call may receive the original configPath or generated config, and none stores a reusable execution path", () => {
  for (const file of REMOTE_COMMANDS) {
    const src = codeOf(file)
    assert.doesNotMatch(src, /"--config", configPath/, `${file} must never hand Wrangler the original config path`)
    assert.doesNotMatch(src, /"--config", GENERATED_CONFIG/, `${file} must never hand Wrangler the original generated config`)
    // No command may resurrect a reusable long-lived private-config API.
    assert.doesNotMatch(src, /createPrivateExecutionConfig|removePrivateExecutionConfig/, `${file} must not reuse a private config path across calls`)
    // Every command executes only through the scoped lease or the shared verifier.
    assert.match(src, /withPrivateExecutionConfig\(|verifyRemoteSchemasWithAuthority\(/, `${file} must run Wrangler only through a scoped lease`)
    // Every command still loads through the shared authority.
    assert.match(src, /loadValidatedDeployConfigAuthority\(|verifyRemoteSchemasWithAuthority\(/, `${file} must use the shared config authority`)
  }
})

test("GUARD: there is exactly ONE config-authority implementation and one scoped-lease writer", () => {
  for (const file of REMOTE_COMMANDS) {
    const src = codeOf(file)
    assert.doesNotMatch(src, /export function loadDeployConfigSnapshot\(/, `${file} must not define its own authority loader`)
    assert.doesNotMatch(src, /export function writeExecutionConfig\(/, `${file} must not define its own private-config writer`)
    assert.doesNotMatch(src, /flag: "wx"/, `${file} must not write its own private config — only the shared lease does`)
  }
  const shared = codeOf("scripts/lib/cfDeployConfigAuthority.mjs")
  assert.match(shared, /export function loadValidatedDeployConfigAuthority\(/)
  assert.match(shared, /export function withPrivateExecutionConfig\(/)
  assert.doesNotMatch(shared, /export function createPrivateExecutionConfig\(/, "the long-lived path API must be gone")
})

test("GUARD: the scoped lease derives bytes from the authority, never re-serializes, is exclusive, read-only, and cleans up unconditionally", () => {
  const shared = codeOf("scripts/lib/cfDeployConfigAuthority.mjs")
  const start = shared.indexOf("export function withPrivateExecutionConfig(")
  const body = shared.slice(start, shared.indexOf("\n}", start))
  // EXACT retained bytes — never a JSON.stringify of the mutable parsed object.
  assert.match(body, /writeFileSync\(path, authority\.bytes, \{ mode: 0o600, flag: "wx" \}\)/, "exclusive creation of the exact bytes")
  assert.match(body, /chmodSync\(path, 0o400\)/, "the scoped config is tightened to read-only")
  assert.doesNotMatch(body, /JSON\.stringify/, "execution bytes must not be rebuilt from a parsed object")
  // The path is confirmed to hash to the authority before it is used…
  assert.match(body, /assertScopedConfigMatchesAuthority\(path, authority, repoRoot\)/)
  // …the callback receives ONLY the path and it is removed unconditionally in finally.
  assert.match(body, /return operation\(path\)/)
  const fin = finallyBodies(shared)
  assert.ok(fin.some((b) => /^\s*rmSync\(path, \{ force: true \}\)\s*$/m.test(b)), "the scoped config is removed unconditionally")
  for (const b of fin) assert.doesNotMatch(b, /\bif\s*\(/, "no cleanup path may be conditional")
  // The confirmation is a byte/sha comparison, never broader than 0600.
  const assertBody = shared.slice(shared.indexOf("function assertScopedConfigMatchesAuthority("))
  assert.match(assertBody, /digestOf\(actual\) !== authority\.sha256/, "byte identity via the authority digest")
  assert.match(assertBody, /& ~0o600\) !== 0/, "never broader than 0600")
})

test("GUARD: the scoped-config permissions can never be broader than 0600", () => {
  const shared = codeOf("scripts/lib/cfDeployConfigAuthority.mjs")
  assert.match(shared, /flag: "wx"/, "exclusive creation")
  assert.match(shared, /chmodSync\(path, 0o400\)/, "read-only")
  assert.doesNotMatch(shared, /mode: 0o6[1-7][0-7]|mode: 0o[7-9]|chmodSync\(path, 0o[67]/, "permissions must never be broader than 0600")
})

test("GUARD: no nested process.exit can bypass a scoped lease's cleanup in any remote command", () => {
  for (const [file, loopFn] of [
    ["scripts/cf-d1-migrations-apply.mjs", "function applyAllLanes("],
    ["scripts/cloudflare-deploy.mjs", "export function runPipeline("],
  ] as const) {
    const src = codeOf(file)
    const start = src.indexOf(loopFn)
    assert.ok(start >= 0, `${file} must have a protected execution region (${loopFn})`)
    const body = src.slice(start, src.indexOf("\nfunction main()", start))
    assert.doesNotMatch(body, /process\.exit/, `${file}: the protected region must return an exit code, never exit`)
    assert.match(body, /return 1/, `${file}: failures must be reported as an exit code`)
  }
})

test("GUARD: cleanup is unconditional in the scoped lease and in every command that owns the original generated config", () => {
  for (const file of ["scripts/cf-d1-migrations-apply.mjs", "scripts/cloudflare-deploy.mjs", "scripts/cf-d1-bootstrap-apply.mjs", "scripts/lib/cfDeployConfigAuthority.mjs"]) {
    for (const body of finallyBodies(codeOf(file))) {
      assert.doesNotMatch(body, /\bif\s*\(/, `${file}: no cleanup path may be conditional`)
      assert.doesNotMatch(body, /&&|\?\./, `${file}: no cleanup path may be short-circuited`)
    }
  }
  // The orchestrator owns the original generated config and removes it unconditionally.
  const deploy = codeOf("scripts/cloudflare-deploy.mjs")
  assert.ok(finallyBodies(deploy).some((b) => /rmSync\(generatedConfig, \{ force: true \}\)/.test(b)),
    "the original generated config must not outlive the orchestrator — it carries real database IDs")
})

test("GUARD (corrected): remote verification and deploy must execute exact bytes from the same retained authority digest", () => {
  // REPLACES the misleading old claim that they "cannot receive different config
  // paths". They may — the binding is BYTE IDENTITY, proven by matching the digest
  // remote verification returns against the digest the orchestrator will deploy.
  const deploy = codeOf("scripts/cloudflare-deploy.mjs")
  // Deploy is created inside its own step, AFTER verify-remote-schema, never before.
  assert.ok(deploy.indexOf('name: "verify-remote-schema"') < deploy.indexOf('name: "deploy"'), "deploy is declared after verification")
  assert.doesNotMatch(deploy, /createPrivateExecutionConfig/, "there is no pre-created long-lived deploy config")
  // Verification runs in-process against the same authority and returns its digest…
  assert.match(deploy, /verifyRemoteSchemas\(authority, \{ repoRoot: REPO_ROOT, spawn \}\)/)
  // …and deploy is aborted unless that digest equals the orchestrator's own digest.
  assert.match(deploy, /result\.authorityDigest !== authority\.sha256/, "deploy must match the verified authority digest")
  assert.match(deploy, /Deploy aborted/)
  // Every config-using step's args are a function of the SCOPED config, never the
  // original generated config.
  for (const step of DEPLOY_STEPS) {
    if (!step.args) continue
    assert.doesNotMatch(step.args("PRIVATE").join(" "), /wrangler\.deploy\.json/, `${step.name} must not name the original generated config`)
  }
})

test("GUARD: the deploy config is created INSIDE the deploy step, after remote verification, and removed immediately", () => {
  const deploy = codeOf("scripts/cloudflare-deploy.mjs")
  // runStep mints the scoped config for a usesConfig step within the withPrivateExecutionConfig
  // callback — never a config created before the verify step completes.
  const runStep = deploy.slice(deploy.indexOf("function runStep("), deploy.indexOf("export function runPipeline("))
  assert.match(runStep, /withPrivateExecutionConfig\(authority, \{ repoRoot: REPO_ROOT, purpose: step\.purpose \}, \(cfg\) =>/,
    "a config-using step mints its scoped config only for its own single call")
  assert.match(runStep, /spawn\(step\.cmd, step\.args\(cfg\)/)
  // The deploy step is the last step and needs a config.
  const deployStep = DEPLOY_STEPS.find((s) => s.name === "deploy")!
  assert.equal((deployStep as { usesConfig?: boolean }).usesConfig, true)
  assert.equal(DEPLOY_STEPS[DEPLOY_STEPS.length - 1].name, "deploy")
})

test("GUARD: no CLI flag lets a caller claim a file is already validated", () => {
  for (const file of REMOTE_COMMANDS) {
    const src = codeOf(file)
    assert.doesNotMatch(src, /--skip-validation|--trusted-config|--pre-validated|--no-verify/, `${file} must not offer a validation bypass flag`)
  }
})

test("GUARD: EXTERNAL_ACTIONS_ENABLED stays false", () => {
  const cfg = JSON.parse(readFileSync(resolve(REPO_ROOT, "wrangler.json"), "utf8"))
  assert.equal(cfg.vars.EXTERNAL_ACTIONS_ENABLED, "false")
  assert.equal(cfg.vars.ALLOW_LEGACY_INGEST_FALLBACK, "false")
})
