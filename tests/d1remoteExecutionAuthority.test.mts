/**
 * P0-PERSIST-015 — every remote D1 command executes against ONE immutable config
 * authority (Issue #155).
 *
 * Reproduced against the audited head: the standalone schema verifier handed
 * Wrangler the ORIGINAL mutable config path, so an edit between the CONTROL query
 * and the TENANT query REDIRECTED the verified database mid-run; and the deploy
 * orchestrator's `verify-remote-schema` and `deploy` steps each re-read
 * `wrangler.deploy.json` independently, so the config verified and the config
 * deployed could differ.
 *
 * `spawnSync` is stubbed everywhere. NOTHING here contacts Cloudflare, queries a
 * remote database, migrates, or deploys.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync, writeFileSync, rmSync, existsSync, readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { makeWranglerReadOnlyRunner, verifyRemoteSchemasWithAuthority } from "../scripts/cf-d1-schema-verify-remote.mjs"
import { DEPLOY_STEPS, runPipeline } from "../scripts/cloudflare-deploy.mjs"
import { loadValidatedDeployConfigAuthority } from "../scripts/lib/cfDeployConfigAuthority.mjs"
import { buildConfigWithIds, loadConfigFile, SYNTHETIC_D1_IDS } from "../scripts/lib/cfDeployConfig.mjs"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const CONFIG_PATH = resolve(REPO_ROOT, "wrangler.deploy.remoteauthtest.json")
const MIGRATE_SRC = resolve(REPO_ROOT, "scripts/cf-d1-migrations-apply.mjs")

const baseConfig = (loadConfigFile(resolve(REPO_ROOT, "wrangler.json")) as { config: Record<string, unknown> }).config
const HIJACK_ID = "dddddddd-0000-4000-8000-00000000dead"

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

/** A spawn stub that records the `--config` each Wrangler call received. */
function recordingSpawn(calls: Array<{ binding: string; config: string; bytes: string }>, options: { fail?: boolean } = {}) {
  return (_bin: string, args: string[]) => {
    const config = args[args.indexOf("--config") + 1]
    calls.push({ binding: args[2], config, bytes: readFileSync(config, "utf8") })
    if (options.fail) return { status: 1, stdout: "" }
    return { status: 0, stdout: JSON.stringify([{ results: [] }]) }
  }
}

function clearPrivateConfigs() {
  for (const f of readdirSync(REPO_ROOT)) if (/^wrangler\.deploy\..*-exec-/.test(f)) rmSync(resolve(REPO_ROOT, f), { force: true })
}

// ─── Remote schema verification: one snapshot for both bindings ──

test("1 + 2. Control and Tenant verification use ONE private config — the original path never reaches Wrangler", () => {
  withConfig((configPath) => {
    const calls: Array<{ binding: string; config: string; bytes: string }> = []
    const result = verifyRemoteSchemasWithAuthority(authorityFor(configPath), { repoRoot: REPO_ROOT, spawn: recordingSpawn(calls) })
    assert.ok(calls.length >= 2, "both bindings must be queried")
    assert.deepEqual([...new Set(calls.map((c) => c.binding))], ["CONTROL_DB", "TENANT_DB_DEFAULT"])
    // ONE private config for every query of every binding.
    const configs = [...new Set(calls.map((c) => c.config))]
    assert.equal(configs.length, 1, "every query must use the same private config")
    assert.notEqual(configs[0], configPath, "the original path must NEVER reach Wrangler")
    assert.match(configs[0].slice(REPO_ROOT.length + 1), /^wrangler\.deploy\.verify-exec-[0-9a-f]{24}\.json$/)
    assert.equal([...new Set(calls.map((c) => c.bytes))].length, 1, "every query must see the same bytes")
    // The schema is empty in this stub, so verification legitimately reports
    // failures — what matters here is WHICH config every query used.
    assert.equal(typeof result.ok, "boolean")
  })
  clearPrivateConfigs()
})

test("3. modifying the original config cannot change the verified databases", () => {
  withConfig((configPath) => {
    const authority = authorityFor(configPath)
    // The operator's file is rewritten AFTER validation…
    hijack(configPath)
    const calls: Array<{ binding: string; config: string; bytes: string }> = []
    verifyRemoteSchemasWithAuthority(authority, { repoRoot: REPO_ROOT, spawn: recordingSpawn(calls) })
    for (const call of calls) {
      assert.doesNotMatch(call.bytes, /dead/, "a post-validation edit must not reach Wrangler")
      assert.match(call.bytes, new RegExp(SYNTHETIC_D1_IDS.CONTROL_DB))
    }
    // …and deleting it entirely does not break verification.
    rmSync(configPath, { force: true })
    const afterDelete: Array<{ binding: string; config: string; bytes: string }> = []
    assert.doesNotThrow(() => verifyRemoteSchemasWithAuthority(authority, { repoRoot: REPO_ROOT, spawn: recordingSpawn(afterDelete) }))
    assert.ok(afterDelete.length >= 2)
  })
  clearPrivateConfigs()
})

test("4 + 5. the private config is removed after success AND after a query failure", () => {
  withConfig((configPath) => {
    const authority = authorityFor(configPath)
    for (const fail of [false, true]) {
      const calls: Array<{ binding: string; config: string; bytes: string }> = []
      verifyRemoteSchemasWithAuthority(authority, { repoRoot: REPO_ROOT, spawn: recordingSpawn(calls, { fail }) })
      const used = calls[0]?.config
      assert.ok(used, `a query must have been attempted (fail=${fail})`)
      assert.equal(existsSync(used), false, `the private config must be removed (fail=${fail})`)
    }
    assert.deepEqual(readdirSync(REPO_ROOT).filter((f) => f.startsWith("wrangler.deploy.verify-exec-")), [])
  })
  clearPrivateConfigs()
})

test("7. every verification SQL stays read-only — a mutation never reaches Wrangler", () => {
  const calls: Array<{ binding: string; config: string; bytes: string }> = []
  withConfig((configPath) => {
    const runner = makeWranglerReadOnlyRunner("CONTROL_DB", configPath, recordingSpawn(calls))
    for (const bad of ["DROP TABLE tenants", "INSERT INTO tenants (id) VALUES ('x')", "UPDATE tenants SET status='x'", "DELETE FROM tenants", "PRAGMA foreign_keys = ON"]) {
      assert.throws(() => runner(bad), /non_read_only_query_blocked/, `${bad} must never reach Wrangler`)
    }
    assert.equal(calls.length, 0, "no mutation may be spawned")
    assert.doesNotThrow(() => runner("SELECT name FROM sqlite_master WHERE type = 'table'"))
    assert.equal(calls.length, 1)
  })
})

// ─── Migration apply: one snapshot across both lanes ─────────────

test("1 + 2. migration apply passes the PRIVATE execution config to every remote call, never the original", () => {
  const src = readFileSync(MIGRATE_SRC, "utf8")
  // Every Wrangler-invoking helper takes `executionConfig`; none names configPath.
  for (const helper of ["function remoteQuery(", "function execRemoteSqlText("]) {
    const start = src.indexOf(helper)
    assert.ok(start >= 0, `${helper} must exist`)
    const body = src.slice(start, src.indexOf("\n}", start))
    assert.doesNotMatch(body, /"--config", configPath/, `${helper} must never receive the original config path`)
    assert.match(body, /"--config", executionConfig/, `${helper} must use the private execution config`)
  }
  // The ledger init, the history query, the effect probe, and both lanes all take
  // the single `executionConfig` threaded from main.
  assert.match(src, /execRemoteSqlText\(binding, executionConfig, CREATE_HISTORY_SQL, "ledger-init"\)/)
  assert.match(src, /function readRemoteHistory\(binding, executionConfig\)/)
  assert.match(src, /function remoteProbe\(binding, executionConfig, effect\)/)
  assert.match(src, /reconcileFromState\(manifest, binding, history, \(effect\) => remoteProbe\(binding, executionConfig, effect\)\)/)
  assert.match(src, /function applyAllLanes\(executionConfig\)/)
  // main derives exactly ONE private config from the retained authority.
  assert.match(src, /executionConfig = createPrivateExecutionConfig\(gates\.configAuthority, \{ repoRoot: REPO_ROOT, purpose: "migrate-exec" \}\)/)
  assert.equal(src.split("createPrivateExecutionConfig(").length - 1, 1, "exactly one private config may be created")
  assert.match(src, /exitCode = applyAllLanes\(executionConfig\)/)
})

test("3 + 4 + 5. the original config is never re-read, so mutating/deleting/replacing it cannot redirect a lane", () => {
  const src = readFileSync(MIGRATE_SRC, "utf8")
  // The protected loop never reloads — or even names — the operator's path. Scoped
  // to `applyAllLanes` itself: `main` legitimately passes configPath to the GATES,
  // which is where it is validated once and then retained.
  const loopStart = src.indexOf("function applyAllLanes(")
  const lanes = src.slice(loopStart, src.indexOf("\nfunction main()", loopStart))
  assert.doesNotMatch(lanes, /readFileSync\(configPath/, "a lane must never re-read the original config")
  assert.doesNotMatch(lanes, /loadConfigFile\(/, "a lane must never reload the original config")
  assert.doesNotMatch(lanes, /\bconfigPath\b/, "the original path must not even be in scope for the lanes")
  // The bytes come from the retained authority, so the file's later state is
  // irrelevant — the shared-library suite proves the byte-retention itself.
  assert.match(src, /loadValidatedDeployConfigAuthority\(\{ configPath, repoRoot, allowPlaceholderIds: false \}\)/)
})

test("6–9. private-config cleanup is unconditional, and no nested process.exit can bypass it", () => {
  const src = readFileSync(MIGRATE_SRC, "utf8")
  // The protected loop RETURNS an exit code; only main exits, after the finally.
  const loopStart = src.indexOf("function applyAllLanes(")
  const loopBody = src.slice(loopStart, src.indexOf("\nfunction main()", loopStart))
  assert.doesNotMatch(loopBody, /process\.exit/, "a nested exit would terminate before cleanup and leave a config with real database IDs")
  assert.match(loopBody, /return 1/, "failures must be reported as an exit code")

  // EVERY finally body must be unconditional, and one of them must remove the
  // private config. Brace-matched: the first `} finally {` in this file is
  // execRemoteSqlText's temporary-SQL cleanup, not main's.
  const bodies = finallyBodies(src)
  assert.ok(bodies.length >= 2, "the temporary SQL dir and the private config each have a cleanup path")
  for (const body of bodies) {
    assert.doesNotMatch(body.replace(/\/\/[^\n]*/g, ""), /\bif\s*\(/, "no cleanup path may be conditional")
  }
  assert.ok(bodies.some((b) => /^\s*removePrivateExecutionConfig\(executionConfig\)\s*$/m.test(b)),
    "the private execution config must be removed unconditionally")
  assert.ok(bodies.some((b) => /^\s*rmSync\(dir, \{ recursive: true, force: true \}\)\s*$/m.test(b)),
    "the temporary migration SQL must be removed unconditionally")
  // Every exit is outside the protected region.
  const mainBody = src.slice(src.indexOf("function main()"))
  const exitsAfterFinally = mainBody.slice(mainBody.indexOf("} finally {"))
  assert.match(exitsAfterFinally, /process\.exit\(exitCode\)/, "main exits only after cleanup ran")
})

// ─── Worker deploy: one snapshot for verification AND upload ─────

test("1 + 2. preflight, artifact verification, remote verification, and deploy are tied to ONE authority", () => {
  withConfig((configPath) => {
    const authority = authorityFor(configPath)
    const executionConfig = "/tmp/PRIVATE-EXEC.json"
    const ran: Array<{ name: string; config: string | null }> = []
    let verifiedWith: unknown = null

    const code = runPipeline(authority, executionConfig, true, {
      verifyRemoteSchemas: (a) => { verifiedWith = a; ran.push({ name: "verify-remote-schema", config: null }); return { ok: true, failures: [] } },
      run: (step, cfg) => { ran.push({ name: step.name, config: cfg }); return true },
    })
    assert.equal(code, 0)
    assert.deepEqual(ran.map((r) => r.name), ["preflight", "build", "verify", "verify-remote-schema", "deploy"])
    // Every spawned step receives the SAME private execution config…
    for (const r of ran.filter((r) => r.config !== null)) {
      assert.equal(r.config, executionConfig, `${r.name} must use the private execution config`)
    }
    // …and remote verification runs against the SAME retained authority the deploy
    // uses, not a second snapshot of a mutable file.
    assert.equal(verifiedWith, authority, "verification and deploy must share one authority")
  })
})

test("3 + 4. mutating or deleting wrangler.deploy.json after the snapshot cannot redirect deploy", () => {
  withConfig((configPath) => {
    const authority = authorityFor(configPath)
    // The snapshot already holds the exact validated bytes.
    assert.match(authority.bytes, new RegExp(SYNTHETIC_D1_IDS.CONTROL_DB))
    hijack(configPath)
    assert.doesNotMatch(authority.bytes, /dead/, "the retained bytes are immune to a later edit")
    rmSync(configPath, { force: true })
    // The pipeline still runs from the snapshot with the original file gone.
    const ran: string[] = []
    const code = runPipeline(authority, "/tmp/PRIVATE-EXEC.json", true, {
      verifyRemoteSchemas: () => ({ ok: true, failures: [] }),
      run: (step) => { ran.push(step.name); return true },
    })
    assert.equal(code, 0, "deleting the original after the snapshot must not break the pipeline")
    assert.ok(ran.includes("deploy"))
  })
})

test("5. a remote verification failure PREVENTS deploy", () => {
  withConfig((configPath) => {
    const ran: string[] = []
    const code = runPipeline(authorityFor(configPath), "/tmp/PRIVATE-EXEC.json", true, {
      verifyRemoteSchemas: () => ({ ok: false, failures: ["registry_row"] }),
      run: (step) => { ran.push(step.name); return true },
    })
    assert.equal(code, 1, "the pipeline must abort")
    assert.equal(ran.includes("deploy"), false, "deploy must never run after a failed verification")
  })
})

test("6. offline mode performs NO remote call", () => {
  withConfig((configPath) => {
    const ran: string[] = []
    let verified = false
    const code = runPipeline(authorityFor(configPath), "/tmp/PRIVATE-EXEC.json", false, {
      verifyRemoteSchemas: () => { verified = true; return { ok: true, failures: [] } },
      run: (step) => { ran.push(step.name); return true },
    })
    assert.equal(code, 0, "an offline run stops cleanly")
    assert.equal(verified, false, "no remote schema verification without CF_DEPLOY_EXECUTE=1")
    assert.equal(ran.includes("deploy"), false, "no upload without CF_DEPLOY_EXECUTE=1")
    assert.deepEqual(ran, ["preflight", "build", "verify"], "it stops at the first remote step")
  })
})

test("8 + 9. Worker deploy never invokes migration apply or bootstrap apply", () => {
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

test("GUARD: no remote Wrangler call may receive the original configPath", () => {
  for (const file of REMOTE_COMMANDS) {
    const src = codeOf(file)
    assert.doesNotMatch(src, /"--config", configPath/, `${file} must never hand Wrangler the original config path`)
    assert.doesNotMatch(src, /"--config", GENERATED_CONFIG/, `${file} must never hand Wrangler the original generated config`)
  }
  // Every remote command loads through the shared authority and executes a private
  // config derived from it.
  for (const file of REMOTE_COMMANDS) {
    assert.match(codeOf(file), /loadValidatedDeployConfigAuthority\(|createPrivateExecutionConfig\(|verifyRemoteSchemasWithAuthority\(/,
      `${file} must use the shared config authority`)
  }
})

test("GUARD: there is exactly ONE config-authority implementation", () => {
  // A bootstrap-only (or any per-command) loader would drift from the shared rules.
  for (const file of REMOTE_COMMANDS) {
    const src = codeOf(file)
    assert.doesNotMatch(src, /export function loadDeployConfigSnapshot\(/, `${file} must not define its own authority loader`)
    assert.doesNotMatch(src, /export function writeExecutionConfig\(/, `${file} must not define its own private-config writer`)
    assert.doesNotMatch(src, /flag: "wx"/, `${file} must not write its own private config`)
  }
  const shared = codeOf("scripts/lib/cfDeployConfigAuthority.mjs")
  assert.match(shared, /export function loadValidatedDeployConfigAuthority\(/)
  assert.match(shared, /export function createPrivateExecutionConfig\(/)
})

test("GUARD: the authority reads the config exactly once and never re-serializes it for execution", () => {
  const shared = codeOf("scripts/lib/cfDeployConfigAuthority.mjs")
  const start = shared.indexOf("export function loadValidatedDeployConfigAuthority(")
  const body = shared.slice(start, shared.indexOf("\n}", start))
  assert.equal(body.split("readFileSync(configPath").length - 1, 1, "the config must be read exactly once per authority load")
  // The EXECUTION bytes are the retained bytes — never a JSON.stringify of the
  // mutable parsed object, which could diverge from what was validated.
  const writer = shared.slice(shared.indexOf("export function createPrivateExecutionConfig("))
  assert.match(writer, /writeFileSync\(path, authority\.bytes, \{ mode: 0o600, flag: "wx" \}\)/)
  assert.doesNotMatch(writer.slice(0, writer.indexOf("\n}")), /JSON\.stringify/, "execution bytes must not be rebuilt from a parsed object")
  // …and the snapshot is RECURSIVELY frozen (a shallow freeze leaves database_id writable).
  assert.match(shared, /deepFreeze\(parsed\)/)
  assert.match(shared, /Object\.freeze\(value\)\n  for \(const key of Object\.getOwnPropertyNames\(value\)\) deepFreeze\(value\[key\]\)/)
})

test("GUARD: private config creation is exclusive and never broader than 0600", () => {
  const shared = codeOf("scripts/lib/cfDeployConfigAuthority.mjs")
  assert.match(shared, /flag: "wx"/, "exclusive creation")
  assert.match(shared, /mode: 0o600/, "private")
  assert.doesNotMatch(shared, /mode: 0o6[1-7][0-7]|mode: 0o[7-9]/, "permissions must never be broader than 0600")
})

test("GUARD: no nested process.exit can bypass cleanup in any remote command", () => {
  // Migration apply and the deploy orchestrator both own a private config; a nested
  // exit inside their protected regions would leave a file with real database IDs.
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

test("GUARD: cleanup is unconditional in every remote command that owns a private config", () => {
  for (const file of ["scripts/cf-d1-migrations-apply.mjs", "scripts/cloudflare-deploy.mjs", "scripts/cf-d1-bootstrap-apply.mjs", "scripts/lib/cfDeployConfigAuthority.mjs"]) {
    for (const body of finallyBodies(codeOf(file))) {
      assert.doesNotMatch(body, /\bif\s*\(/, `${file}: no cleanup path may be conditional`)
      assert.doesNotMatch(body, /&&|\?\./, `${file}: no cleanup path may be short-circuited`)
    }
  }
  // The orchestrator owns BOTH the private config and the generated config.
  const deploy = codeOf("scripts/cloudflare-deploy.mjs")
  const bodies = finallyBodies(deploy)
  assert.ok(bodies.some((b) => /removePrivateExecutionConfig\(executionConfig\)/.test(b)))
  assert.ok(bodies.some((b) => /rmSync\(generatedConfig, \{ force: true \}\)/.test(b)),
    "the original generated config must not outlive the orchestrator — it carries real database IDs")
})

test("GUARD: remote verification and deploy cannot receive different config paths", () => {
  const deploy = codeOf("scripts/cloudflare-deploy.mjs")
  // Exactly one private config is created for the whole pipeline…
  assert.equal(deploy.split("createPrivateExecutionConfig(").length - 1, 1, "exactly one private config per deploy")
  assert.equal(deploy.split("loadValidatedDeployConfigAuthority(").length - 1, 1, "exactly one authority per deploy")
  // …verification runs in-process against that same authority…
  assert.match(deploy, /verifyRemoteSchemas\(authority, \{ repoRoot: REPO_ROOT \}\)/)
  // …and every spawned step is given that same executionConfig.
  assert.match(deploy, /run\(step, executionConfig\)/)
  for (const step of DEPLOY_STEPS) {
    if (!step.args) continue
    assert.doesNotMatch(step.args("PRIVATE").join(" "), /wrangler\.deploy\.json/, `${step.name} must not name the original generated config`)
  }
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
