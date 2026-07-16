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
import { createHash } from "node:crypto"
import { readFileSync, writeFileSync, rmSync, existsSync, statSync, symlinkSync, chmodSync, mkdtempSync, readdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import {
  loadValidatedDeployConfigAuthority, withPrivateExecutionConfig,
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

/**
 * Remove any scoped execution config THIS suite left behind. Scoped to the purposes
 * this file uses (`test-exec`, and the `exec` fallback) — `node --test` runs test
 * FILES in parallel, and matching every `*-exec-*` would delete a sibling suite's
 * live config at the shared repository root.
 */
const OWN_EXEC = /^wrangler\.deploy\.(test-exec-|exec-)[0-9a-f]+\.json$/
function clearPrivateConfigs() {
  for (const f of readdirSync(REPO_ROOT)) if (OWN_EXEC.test(f)) rmSync(resolve(REPO_ROOT, f), { force: true })
}

// ─── 1–10. the shared authority ──────────────────────────────────

test("1. a valid generated config produces retained authority BYTES and their SHA-256", () => {
  withConfig((configPath) => {
    const result = load(configPath)
    assert.equal(result.ok, true, `a valid config must load: ${result.ok ? "" : result.blocked.join(",")}`)
    if (!result.ok) return
    // The EXACT file bytes are the authority — not a re-serialization.
    assert.equal(result.authority.bytes, readFileSync(configPath, "utf8"))
    assert.equal(JSON.parse(result.authority.bytes).d1_databases.length, 2)
    assert.ok(result.authority.snapshot)
    // The digest is over the EXACT retained bytes — safe evidence, no ID or content.
    assert.equal(result.authority.sha256, createHash("sha256").update(result.authority.bytes).digest("hex"))
    assert.match(result.authority.sha256, /^[0-9a-f]{64}$/)
    assert.equal(result.authority.sha256.includes(SYNTHETIC_D1_IDS.CONTROL_DB), false, "the digest carries no database ID")
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

// ─── The scoped execution-config lease ───────────────────────────
//
// A filesystem path is NOT authority: a reusable private file that survives between
// two Wrangler calls can be altered in between. The only way execution bytes reach
// Wrangler is a callback-scoped lease that mints a fresh file from the retained
// bytes, verifies it, invokes the callback, and removes it — the path never escapes.

const authorityOf = (configPath: string) => {
  const result = load(configPath)
  if (!result.ok) throw new Error(`authority must load: ${result.blocked.join(",")}`)
  return result.authority
}

test("4 + 5 + 6 + 7 + 10. a scoped config carries EXACT bytes, is 0400 & exclusive, exists only inside the callback, and each lease is a fresh path", () => {
  withConfig((configPath) => {
    const authority = authorityOf(configPath)
    let insidePath = ""
    let insideMode = -1
    let insideBytes = ""
    let existedInside = false
    let nestedPath = ""

    const ret = withPrivateExecutionConfig(authority, { repoRoot: REPO_ROOT, purpose: "test-exec" }, (cfg) => {
      insidePath = cfg
      existedInside = existsSync(cfg)
      insideMode = statSync(cfg).mode & 0o777
      insideBytes = readFileSync(cfg, "utf8")
      // 6. Exclusive creation: a pre-placed file could never have been overwritten or
      // followed — proven by the fact that re-creating this exact path fails.
      assert.throws(() => writeFileSync(cfg, "hijacked", { flag: "wx" }), /EEXIST/)
      // 10. A nested lease gets a DIFFERENT random path.
      withPrivateExecutionConfig(authority, { repoRoot: REPO_ROOT, purpose: "test-exec" }, (c2) => { nestedPath = c2 })
      // 8. The nested lease's file is already gone once its callback returned.
      assert.equal(existsSync(nestedPath), false, "the nested lease is removed before we resume")
      return "CALLBACK_RESULT"
    })

    // The function returns the CALLBACK's value — the path never escapes.
    assert.equal(ret, "CALLBACK_RESULT")
    assert.equal(existedInside, true, "7. the config exists inside the callback")
    assert.equal(insideBytes, authority.bytes, "4. EXACT retained bytes, never a re-serialization")
    // 5. Read-only (0400), and in any case never broader than 0600.
    assert.equal(insideMode, 0o400, "the scoped config must be read-only 0400")
    assert.equal(insideMode & ~0o600, 0, "…and never broader than 0600")
    const name = insidePath.slice(REPO_ROOT.length + 1)
    assert.match(name, /^wrangler\.deploy\.test-exec-[0-9a-f]{24}\.json$/, "approved, collision-resistant, repo-root name")
    assert.equal(name.includes(SYNTHETIC_D1_IDS.CONTROL_DB), false, "the filename must never carry a database ID")
    assert.notEqual(nestedPath, insidePath, "10. each lease produces a fresh random path")
    // 8. Removed after callback success.
    assert.equal(existsSync(insidePath), false, "8. the scoped config is removed after the callback succeeds")
  })
  clearPrivateConfigs()
})

test("9. a scoped config is removed after the callback THROWS", () => {
  withConfig((configPath) => {
    const authority = authorityOf(configPath)
    let path = ""
    assert.throws(() => withPrivateExecutionConfig(authority, { repoRoot: REPO_ROOT, purpose: "test-exec" }, (cfg) => {
      path = cfg
      assert.equal(existsSync(cfg), true)
      throw new Error("callback_boom")
    }), /callback_boom/)
    assert.notEqual(path, "")
    assert.equal(existsSync(path), false, "the scoped config must be removed even when the callback throws")
  })
  clearPrivateConfigs()
})

test("11. changing an earlier lease's path cannot affect a later lease", () => {
  withConfig((configPath) => {
    const authority = authorityOf(configPath)
    let firstPath = ""
    withPrivateExecutionConfig(authority, { repoRoot: REPO_ROOT, purpose: "test-exec" }, (cfg) => { firstPath = cfg })
    // The first lease's file is gone; drop a hostile file back at that exact path.
    writeFileSync(firstPath, JSON.stringify({ d1_databases: [{ database_id: "dddddddd-dead" }] }), { mode: 0o600 })
    try {
      let secondBytes = ""
      let secondPath = ""
      withPrivateExecutionConfig(authority, { repoRoot: REPO_ROOT, purpose: "test-exec" }, (cfg) => {
        secondPath = cfg
        secondBytes = readFileSync(cfg, "utf8")
      })
      assert.notEqual(secondPath, firstPath, "a later lease never reuses an earlier path")
      assert.equal(secondBytes, authority.bytes, "the later lease carries the authority bytes, immune to the stale earlier file")
      assert.doesNotMatch(secondBytes, /dead/, "the hostile earlier file cannot reach the later Wrangler call")
    } finally {
      rmSync(firstPath, { force: true })
    }
  })
  clearPrivateConfigs()
})

test("a scoped lease refuses to run without authority bytes+digest or a callback", () => {
  for (const bad of [null, undefined, {}, { bytes: "" }, { bytes: 42 }, { bytes: "x" }]) {
    // Missing/empty bytes OR a missing sha256 fails closed the same way.
    assert.throws(() => withPrivateExecutionConfig(bad as never, { repoRoot: REPO_ROOT }, () => {}), /execution_authority_missing/)
  }
  withConfig((configPath) => {
    const authority = authorityOf(configPath)
    assert.throws(() => (withPrivateExecutionConfig as unknown as (a: unknown, o: unknown) => void)(authority, { repoRoot: REPO_ROOT }), /execution_operation_missing/)
    // An unsafe purpose label cannot escape the approved filename form.
    withPrivateExecutionConfig(authority, { repoRoot: REPO_ROOT, purpose: "../../etc/passwd" }, (cfg) => {
      assert.match(cfg.slice(REPO_ROOT.length + 1), /^wrangler\.deploy\.exec-[0-9a-f]{24}\.json$/, "an unsafe label must fall back to the safe default")
    })
  })
  clearPrivateConfigs()
})

test("no scoped execution config survives this suite", () => {
  clearPrivateConfigs()
  // Scoped to this file's own purposes — a sibling suite may legitimately hold a live
  // config of its own at the shared repository root while running in parallel.
  assert.deepEqual(readdirSync(REPO_ROOT).filter((f) => OWN_EXEC.test(f)), [])
  assert.equal(existsSync(CONFIG_PATH), false)
})
