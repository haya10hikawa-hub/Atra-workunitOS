/**
 * P0-PERSIST-015 — ONE deploy-config authority for every remote D1 command (#155).
 *
 * WHAT THIS EXISTS TO CATCH
 * -------------------------
 * The generated deploy config selects the physical databases and the Worker
 * deployment configuration, so it is authority-bearing. The bootstrap was bound to
 * an immutable snapshot in an earlier repair, but migration apply, standalone remote
 * schema verification, and the Worker deploy orchestrator still validated one read
 * and later handed Wrangler the ORIGINAL mutable path. Reproduced against the
 * audited head: a post-validation edit REDIRECTED a schema-verification query to a
 * different database mid-run, and `verify-remote-schema` and `deploy` each re-read
 * `wrangler.deploy.json` independently — so the config verified and the config
 * deployed could differ.
 *
 * `spawnSync` is stubbed throughout. NOTHING here contacts Cloudflare, queries a
 * remote database, migrates, or deploys.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync, writeFileSync, rmSync, existsSync, statSync, symlinkSync, chmodSync, mkdtempSync, readdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import {
  loadValidatedDeployConfigAuthority, createPrivateExecutionConfig, removePrivateExecutionConfig,
  deepFreeze, DEPLOY_CONFIG_MAX_BYTES,
} from "../scripts/lib/cfDeployConfigAuthority.mjs"
import { buildConfigWithIds, loadConfigFile, SYNTHETIC_D1_IDS } from "../scripts/lib/cfDeployConfig.mjs"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const CONFIG_PATH = resolve(REPO_ROOT, "wrangler.deploy.authoritytest.json")
const SAME_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3300"

const baseConfig = (loadConfigFile(resolve(REPO_ROOT, "wrangler.json")) as { config: Record<string, unknown> }).config
const validConfig = (ids: Record<string, string> = SYNTHETIC_D1_IDS) => buildConfigWithIds(baseConfig, ids)

/** Write a generated config at the approved location, run `fn`, always clean up. */
function withConfig(fn: (path: string) => void, options: { body?: string; mode?: number; config?: unknown } = {}) {
  const body = options.body ?? JSON.stringify(options.config ?? validConfig(), null, 2)
  try {
    writeFileSync(CONFIG_PATH, body, { mode: options.mode ?? 0o600 })
    fn(CONFIG_PATH)
  } finally {
    rmSync(CONFIG_PATH, { force: true })
  }
}

const load = (configPath: string) => loadValidatedDeployConfigAuthority({ configPath, repoRoot: REPO_ROOT, allowPlaceholderIds: false })

/** Remove any private execution config a test left behind. */
function clearPrivateConfigs() {
  for (const f of readdirSync(REPO_ROOT)) {
    if (/^wrangler\.deploy\.(bootstrap|migrate|verify|deploy|exec)-exec-|^wrangler\.deploy\.exec-/.test(f)) rmSync(resolve(REPO_ROOT, f), { force: true })
  }
}

// ─── 1–10. the shared authority ──────────────────────────────────

test("1. a valid generated config produces retained authority BYTES", () => {
  withConfig((configPath) => {
    const result = load(configPath)
    assert.equal(result.ok, true, `a valid config must load: ${result.ok ? "" : result.blocked.join(",")}`)
    if (!result.ok) return
    // The EXACT file bytes are the authority — not a re-serialization.
    assert.equal(result.authority.bytes, readFileSync(configPath, "utf8"))
    assert.equal(JSON.parse(result.authority.bytes).d1_databases.length, 2)
    assert.ok(result.authority.snapshot)
  })
})

test("2. a symlinked config fails", () => {
  const outside = mkdtempSync(resolve(tmpdir(), "authority-evil-"))
  const target = resolve(outside, "evil.json")
  try {
    writeFileSync(target, JSON.stringify(validConfig()), { mode: 0o600 })
    rmSync(CONFIG_PATH, { force: true })
    symlinkSync(target, CONFIG_PATH)
    const result = load(CONFIG_PATH)
    assert.equal(result.ok, false)
    assert.deepEqual(result.ok ? [] : result.blocked, ["deploy_config_symlink"])
  } finally {
    rmSync(CONFIG_PATH, { force: true })
    rmSync(outside, { recursive: true, force: true })
  }
})

test("3. a non-private config fails", () => {
  for (const mode of [0o644, 0o604, 0o640, 0o660, 0o666]) {
    withConfig((configPath) => {
      chmodSync(configPath, mode)
      const result = load(configPath)
      assert.equal(result.ok, false, `mode ${mode.toString(8)} must be refused`)
      assert.deepEqual(result.ok ? [] : result.blocked, ["deploy_config_permissions_too_broad"])
    })
  }
  // 0600 and stricter are acceptable.
  withConfig((configPath) => { assert.equal(load(configPath).ok, true) }, { mode: 0o600 })
})

test("4. an oversized config fails BEFORE it is parsed", () => {
  const padded = { ...validConfig(), padding: "x".repeat(DEPLOY_CONFIG_MAX_BYTES) }
  withConfig((configPath) => {
    assert.ok(statSync(configPath).size > DEPLOY_CONFIG_MAX_BYTES)
    const result = load(configPath)
    assert.deepEqual(result.ok ? [] : result.blocked, ["deploy_config_too_large"])
  }, { config: padded })
})

test("5. malformed JSON fails", () => {
  for (const body of ["{ not json", "", "[]", "null", '"a string"']) {
    withConfig((configPath) => {
      const result = load(configPath)
      assert.equal(result.ok, false, `${JSON.stringify(body)} must be refused`)
      assert.deepEqual(result.ok ? [] : result.blocked, ["deploy_config_unparseable"])
    }, { body })
  }
})

test("6 + 7. a physical-ID collision and a database-name collision fail", () => {
  withConfig((configPath) => {
    const result = load(configPath)
    assert.deepEqual(result.ok ? [] : result.blocked, ["deploy_config_invalid"])
  }, { config: buildConfigWithIds(baseConfig, { CONTROL_DB: SAME_ID, TENANT_DB_DEFAULT: SAME_ID }) })

  const aliased = validConfig() as { d1_databases: Array<{ binding: string; database_name: string }> }
  for (const db of aliased.d1_databases) db.database_name = "same-db"
  withConfig((configPath) => {
    const result = load(configPath)
    assert.deepEqual(result.ok ? [] : result.blocked, ["deploy_config_invalid"])
  }, { config: aliased })
})

test("8. NO authority bytes are returned on any failure", () => {
  const failures = [
    () => load(resolve(REPO_ROOT, "wrangler.json")), // not an approved generated config
    () => load(resolve(REPO_ROOT, "does-not-exist.deploy.json")),
    () => loadValidatedDeployConfigAuthority({ configPath: undefined, repoRoot: REPO_ROOT }),
  ]
  for (const run of failures) {
    const result = run()
    assert.equal(result.ok, false)
    assert.equal("authority" in result, false, "a failed load must expose no authority")
  }
  withConfig((configPath) => {
    const result = load(configPath)
    assert.equal(result.ok, false)
    assert.equal("authority" in result, false)
  }, { config: buildConfigWithIds(baseConfig, { CONTROL_DB: SAME_ID, TENANT_DB_DEFAULT: SAME_ID }) })
})

test("9. the parsed snapshot cannot be mutated RECURSIVELY", () => {
  withConfig((configPath) => {
    const result = load(configPath)
    assert.equal(result.ok, true)
    if (!result.ok) return
    const snapshot = result.authority.snapshot as unknown as {
      d1_databases: Array<{ database_id: string; database_name: string }>
      vars: Record<string, string>
    }
    // A SHALLOW freeze would leave `d1_databases[0].database_id` writable — the one
    // field that decides which physical database is hit.
    assert.throws(() => { snapshot.d1_databases[0].database_id = "hijacked" }, TypeError)
    assert.throws(() => { snapshot.d1_databases[0].database_name = "hijacked" }, TypeError)
    assert.throws(() => { snapshot.d1_databases.push({ database_id: "x", database_name: "y" }) }, TypeError)
    assert.throws(() => { snapshot.vars.EXTERNAL_ACTIONS_ENABLED = "true" }, TypeError)
    assert.notEqual(snapshot.d1_databases[0].database_id, "hijacked")
    assert.ok(Object.isFrozen(snapshot.d1_databases[0]), "nested objects must be frozen")
  })
})

test("deepFreeze freezes nested objects and arrays, and tolerates primitives/cycles", () => {
  const nested = deepFreeze({ a: { b: [{ c: 1 }] } }) as { a: { b: Array<{ c: number }> } }
  assert.ok(Object.isFrozen(nested.a.b[0]))
  assert.equal(deepFreeze(null), null)
  assert.equal(deepFreeze(42), 42)
  const cyclic: Record<string, unknown> = { name: "x" }
  cyclic.self = cyclic
  assert.doesNotThrow(() => deepFreeze(cyclic), "an already-frozen node must not recurse forever")
})

test("10. no failure contains a database ID, database name, config content, or path", () => {
  const secrets = [SAME_ID, SYNTHETIC_D1_IDS.CONTROL_DB, SYNTHETIC_D1_IDS.TENANT_DB_DEFAULT,
    "workunit-tenant", "workunit-control-db", "same-db", "d1_databases", CONFIG_PATH, REPO_ROOT]
  const results: Array<{ ok: boolean; blocked?: string[] }> = []
  withConfig((p) => results.push(load(p)), { config: buildConfigWithIds(baseConfig, { CONTROL_DB: SAME_ID, TENANT_DB_DEFAULT: SAME_ID }) })
  withConfig((p) => results.push(load(p)), { body: "{ not json" })
  withConfig((p) => { chmodSync(p, 0o644); results.push(load(p)) })
  results.push(load(resolve(REPO_ROOT, "wrangler.json")))

  for (const result of results) {
    assert.equal(result.ok, false)
    const serialized = JSON.stringify(result.blocked)
    assert.match(serialized, /^\["[a-z0-9_]+"\]$/, `only a safe category may be returned: ${serialized}`)
    for (const secret of secrets) assert.equal(serialized.includes(secret), false, `must never echo ${secret}`)
  }
})

// ─── The private execution config ────────────────────────────────

test("the private execution config is exclusive, 0600, collision-resistant, and carries the EXACT bytes", () => {
  withConfig((configPath) => {
    const result = load(configPath)
    assert.equal(result.ok, true)
    if (!result.ok) return
    const first = createPrivateExecutionConfig(result.authority, { repoRoot: REPO_ROOT, purpose: "test-exec" })
    const second = createPrivateExecutionConfig(result.authority, { repoRoot: REPO_ROOT, purpose: "test-exec" })
    try {
      // EXACT retained bytes — never a re-serialization of the parsed object.
      assert.equal(readFileSync(first, "utf8"), result.authority.bytes)
      assert.equal(statSync(first).mode & 0o777, 0o600, "the execution config must be private")
      // An approved, git-ignored, repository-root generated-config form, with a
      // collision-resistant name that carries NO database ID.
      const name = first.slice(REPO_ROOT.length + 1)
      assert.match(name, /^wrangler\.deploy\.test-exec-[0-9a-f]{24}\.json$/)
      assert.equal(name.includes(SYNTHETIC_D1_IDS.CONTROL_DB), false, "the filename must never carry a database ID")
      assert.notEqual(first, second, "each call must produce a fresh file")
      // Exclusive creation: a pre-placed file is never overwritten or followed.
      assert.throws(() => writeFileSync(first, "hijacked", { flag: "wx" }), /EEXIST/)
    } finally {
      removePrivateExecutionConfig(first)
      removePrivateExecutionConfig(second)
    }
    assert.deepEqual(readdirSync(REPO_ROOT).filter((f) => f.startsWith("wrangler.deploy.test-exec-")), [])
  })
})

test("a private execution config cannot be created without authority bytes", () => {
  for (const bad of [null, undefined, {}, { bytes: "" }, { bytes: 42 }]) {
    assert.throws(() => createPrivateExecutionConfig(bad as never, { repoRoot: REPO_ROOT }), /execution_authority_missing/)
  }
  // An unsafe purpose label cannot escape the approved filename form.
  withConfig((configPath) => {
    const result = load(configPath)
    if (!result.ok) throw new Error("expected a valid config")
    const path = createPrivateExecutionConfig(result.authority, { repoRoot: REPO_ROOT, purpose: "../../etc/passwd" })
    try {
      assert.match(path.slice(REPO_ROOT.length + 1), /^wrangler\.deploy\.exec-[0-9a-f]{24}\.json$/, "an unsafe label must fall back to the safe default")
    } finally { removePrivateExecutionConfig(path) }
  })
})

test("removePrivateExecutionConfig is safe with null/undefined and a missing file", () => {
  assert.doesNotThrow(() => removePrivateExecutionConfig(null))
  assert.doesNotThrow(() => removePrivateExecutionConfig(undefined))
  assert.doesNotThrow(() => removePrivateExecutionConfig(resolve(REPO_ROOT, "wrangler.deploy.never-existed.json")))
})

test("no private execution config survives this suite", () => {
  clearPrivateConfigs()
  assert.deepEqual(readdirSync(REPO_ROOT).filter((f) => /^wrangler\.deploy\..*-exec-/.test(f)), [])
  assert.equal(existsSync(CONFIG_PATH), false)
})
