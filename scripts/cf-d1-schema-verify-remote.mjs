#!/usr/bin/env node
/**
 * cf:d1:schema:verify:remote (P0-PERSIST-015) — OPERATOR-GATED, READ-ONLY.
 *
 * Verifies the production D1 schemas against the committed schema contract WITHOUT
 * writing. Runs ONLY when gated:
 *   - a validated generated deploy config (`--config wrangler.deploy*.json`) with
 *     REAL, non-placeholder IDs and EXACTLY the approved bindings;
 *   - explicit remote verification (`--remote`).
 * Issues ONLY read-only introspection queries (SELECT on sqlite_master; read-only
 * PRAGMA). NEVER mutates, seeds, runs migrations, prints database IDs, or reads
 * application row data. This patch never invokes it remotely.
 */

import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { spawnSync } from "node:child_process"
import { loadSchemaContract, verifyViaRunner, isReadOnlyIntrospectionSql } from "./lib/d1SchemaContract.mjs"
import { KNOWN_BINDINGS } from "./lib/d1MigrationManifest.mjs"
// ONE shared config-authority implementation, used by every remote D1 command.
import {
  loadValidatedDeployConfigAuthority, createPrivateExecutionConfig, removePrivateExecutionConfig,
} from "./lib/cfDeployConfigAuthority.mjs"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const WRANGLER_BIN = resolve(REPO_ROOT, "node_modules/.bin/wrangler")

/**
 * Evaluate remote-verify gates and RETAIN the deploy-config authority.
 * Returns the authority ONLY when every gate passed. Pure — no network, no SQL.
 */
export function evaluateRemoteVerifyGates({ argv = [], repoRoot = REPO_ROOT, configPath } = {}) {
  const blocked = []
  if (!argv.includes("--remote")) blocked.push("missing_remote_flag")
  // Loaded + validated ONCE through the SHARED authority library — including the
  // physical-separation rule, so a same-id config issues ZERO queries.
  const config = loadValidatedDeployConfigAuthority({ configPath, repoRoot, allowPlaceholderIds: false })
  if (!config.ok) blocked.push(...config.blocked)

  const ok = blocked.length === 0
  return { ok, blocked: [...new Set(blocked)], configAuthority: ok ? config.authority : null }
}

/**
 * A wrangler-backed read-only runner for a binding. Every SQL is asserted
 * read-only before execution; a mutation attempt throws (never reaches Wrangler).
 *
 * `executionConfig` is the PRIVATE config written from the retained authority —
 * never the operator's mutable path, which could be edited between one binding's
 * queries and the next (reproduced against the audited head: a post-validation edit
 * redirected the TENANT introspection to a different database mid-run).
 */
export function makeWranglerReadOnlyRunner(binding, executionConfig, spawn = spawnSync) {
  return (sql) => {
    if (!isReadOnlyIntrospectionSql(sql)) throw new Error("non_read_only_query_blocked")
    const res = spawn(WRANGLER_BIN, ["d1", "execute", binding, "--command", sql, "--remote", "--config", executionConfig, "--json"], { cwd: REPO_ROOT, encoding: "utf8" })
    if (res.status !== 0) throw new Error("wrangler_query_failed")
    const parsed = JSON.parse(res.stdout)
    // wrangler --json returns [{ results: [...] }] (or { results }).
    if (Array.isArray(parsed)) return parsed[0] && Array.isArray(parsed[0].results) ? parsed[0].results : []
    return Array.isArray(parsed.results) ? parsed.results : []
  }
}

/**
 * Verify BOTH bindings' schemas against the committed contract using ONE already-
 * retained authority.
 *
 * Exported as an internal library function so the deploy orchestrator can pass the
 * SAME authority it will deploy with — rather than spawning a child that creates a
 * second, unrelated snapshot of a file that may have changed in between. Writes one
 * private execution config, uses it for every Control and Tenant query, and removes
 * it unconditionally.
 *
 * Returns `{ ok, failures }` — safe categories only; never a database ID, config
 * content, or application row data.
 */
export function verifyRemoteSchemasWithAuthority(authority, { repoRoot = REPO_ROOT, spawn = spawnSync } = {}) {
  const contract = loadSchemaContract(repoRoot)
  if (!contract.ok) return { ok: false, failures: [contract.error] }

  let executionConfig = null
  try {
    executionConfig = createPrivateExecutionConfig(authority, { repoRoot, purpose: "verify-exec" })
    const failures = []
    for (const binding of KNOWN_BINDINGS) {
      // The SAME private config for every binding — the pair verified is always the
      // pair the authority names.
      const runner = makeWranglerReadOnlyRunner(binding, executionConfig, spawn)
      let result
      try { result = verifyViaRunner(runner, contract.contract.databases[binding]) } catch (err) {
        failures.push(`${binding}:${err instanceof Error ? err.message : "query_failed"}`)
        continue
      }
      if (result.ok) console.log(`cf:d1:schema:verify:remote: ${binding} OK`)
      else {
        for (const f of result.failures) failures.push(`${binding}:${f.category}:${f.table || ""}${f.name ? ":" + f.name : ""}`)
      }
    }
    return { ok: failures.length === 0, failures }
  } finally {
    // Unconditional: success, query failure, parse failure, or an unexpected throw.
    removePrivateExecutionConfig(executionConfig)
  }
}

function parseConfigArg(argv) {
  const i = argv.indexOf("--config")
  return i >= 0 && argv[i + 1] ? resolve(argv[i + 1]) : undefined
}

function main() {
  const argv = process.argv.slice(2)
  const configPath = parseConfigArg(argv)
  const gates = evaluateRemoteVerifyGates({ argv, repoRoot: REPO_ROOT, configPath })
  if (!gates.ok) {
    console.error(`cf:d1:schema:verify:remote: STOPPED — gate(s) not satisfied: ${gates.blocked.join(", ")}`)
    process.exit(1)
  }
  // One retained authority → one private execution config → every Control and
  // Tenant query. Cleanup is inside the library's own `finally`.
  const result = verifyRemoteSchemasWithAuthority(gates.configAuthority, { repoRoot: REPO_ROOT })
  if (!result.ok) console.error(`cf:d1:schema:verify:remote: FAIL — ${result.failures.join(", ")}`)
  process.exit(result.ok ? 0 : 1)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
