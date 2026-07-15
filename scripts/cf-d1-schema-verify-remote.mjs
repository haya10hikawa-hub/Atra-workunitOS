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
import { loadConfigFile, validateDeployConfig } from "./lib/cfDeployConfig.mjs"
import { loadSchemaContract, verifyViaRunner, isReadOnlyIntrospectionSql } from "./lib/d1SchemaContract.mjs"
import { KNOWN_BINDINGS } from "./lib/d1MigrationManifest.mjs"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const WRANGLER_BIN = resolve(REPO_ROOT, "node_modules/.bin/wrangler")

/** Evaluate remote-verify gates. Pure — no network, no SQL. */
export function evaluateRemoteVerifyGates({ argv = [], repoRoot = REPO_ROOT, configPath } = {}) {
  const blocked = []
  if (!argv.includes("--remote")) blocked.push("missing_remote_flag")
  if (!configPath) blocked.push("missing_config")
  else {
    const cfg = loadConfigFile(configPath)
    if (!cfg.ok) blocked.push("deploy_config_unreadable")
    else if (!validateDeployConfig(cfg.config, { configPath, repoRoot, allowPlaceholderIds: false }).ok) blocked.push("deploy_config_invalid")
  }
  return { ok: blocked.length === 0, blocked }
}

/**
 * A wrangler-backed read-only runner for a binding. Every SQL is asserted
 * read-only before execution; a mutation attempt throws (never reaches Wrangler).
 */
export function makeWranglerReadOnlyRunner(binding, configPath, spawn = spawnSync) {
  return (sql) => {
    if (!isReadOnlyIntrospectionSql(sql)) throw new Error("non_read_only_query_blocked")
    const res = spawn(WRANGLER_BIN, ["d1", "execute", binding, "--command", sql, "--remote", "--config", configPath, "--json"], { cwd: REPO_ROOT, encoding: "utf8" })
    if (res.status !== 0) throw new Error("wrangler_query_failed")
    const parsed = JSON.parse(res.stdout)
    // wrangler --json returns [{ results: [...] }] (or { results }).
    if (Array.isArray(parsed)) return parsed[0] && Array.isArray(parsed[0].results) ? parsed[0].results : []
    return Array.isArray(parsed.results) ? parsed.results : []
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
  const contract = loadSchemaContract(REPO_ROOT)
  if (!contract.ok) { console.error(`cf:d1:schema:verify:remote: FAIL — ${contract.error}`); process.exit(1) }

  let ok = true
  for (const binding of KNOWN_BINDINGS) {
    const runner = makeWranglerReadOnlyRunner(binding, configPath)
    const result = verifyViaRunner(runner, contract.contract.databases[binding])
    if (result.ok) console.log(`cf:d1:schema:verify:remote: ${binding} OK`)
    else { ok = false; console.error(`cf:d1:schema:verify:remote: ${binding} FAIL — ${result.failures.map((f) => `${f.category}:${f.table || ""}${f.name ? ":" + f.name : ""}`).join(", ")}`) }
  }
  process.exit(ok ? 0 : 1)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
