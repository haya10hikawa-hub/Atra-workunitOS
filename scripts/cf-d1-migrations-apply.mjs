#!/usr/bin/env node
/**
 * cf:d1:migrations:apply (P0-PERSIST-015) — OPERATOR-GATED remote migration apply.
 *
 * Impossible to run accidentally. Applies the manifest lanes to REMOTE D1 ONLY
 * when EVERY gate passes:
 *   - explicit remote mode (`--remote`);
 *   - a validated generated deploy config (`--config wrangler.deploy*.json`) with
 *     REAL, non-placeholder D1 IDs and EXACTLY the approved bindings;
 *   - `CF_D1_MIGRATE_EXECUTE=1`;
 *   - `CF_D1_MIGRATE_CONFIRM=APPLY_PRODUCTION_D1_MIGRATIONS`;
 *   - a fully valid migration manifest.
 * Without ALL of them, it STOPS before invoking Wrangler.
 *
 * Applies only the manifest LANES (idempotent). The deferred non-idempotent 0006
 * is never auto-applied here. NEVER part of Worker deploy. This patch never sets
 * the execution variables and never performs a remote apply.
 */

import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { spawnSync } from "node:child_process"
import { loadManifest, validateManifest, buildPlan, KNOWN_BINDINGS } from "./lib/d1MigrationManifest.mjs"
import { loadConfigFile, validateDeployConfig } from "./lib/cfDeployConfig.mjs"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
export const MIGRATE_CONFIRM_PHRASE = "APPLY_PRODUCTION_D1_MIGRATIONS"
const WRANGLER_BIN = resolve(REPO_ROOT, "node_modules/.bin/wrangler")

/**
 * Evaluate every gate. Returns `{ ok, blocked }` — a list of safe reason codes.
 * Pure: performs no SQL, no network, no Wrangler invocation.
 */
export function evaluateApplyGates({ env = process.env, argv = [], repoRoot = REPO_ROOT, configPath } = {}) {
  const blocked = []
  if (!argv.includes("--remote")) blocked.push("missing_remote_flag")
  if (env.CF_D1_MIGRATE_EXECUTE !== "1") blocked.push("missing_execute_flag")
  if (env.CF_D1_MIGRATE_CONFIRM !== MIGRATE_CONFIRM_PHRASE) blocked.push("missing_confirmation")
  if (!configPath) blocked.push("missing_config")

  const loaded = loadManifest(repoRoot)
  if (!loaded.ok) blocked.push("manifest_unreadable")
  else if (!validateManifest(loaded.manifest, repoRoot).ok) blocked.push("manifest_invalid")

  if (configPath) {
    const cfg = loadConfigFile(configPath)
    if (!cfg.ok) blocked.push("deploy_config_unreadable")
    else {
      const v = validateDeployConfig(cfg.config, { configPath, repoRoot, allowPlaceholderIds: false })
      if (!v.ok) blocked.push("deploy_config_invalid")
    }
  }
  return { ok: blocked.length === 0, blocked }
}

/** The ordered wrangler apply commands (safe — no IDs). Never executed unless gated. */
export function buildApplyCommands(repoRoot, configPath) {
  const manifest = loadManifest(repoRoot).manifest
  const commands = []
  for (const binding of KNOWN_BINDINGS) {
    for (const step of buildPlan(manifest, binding)) {
      commands.push({ binding, name: step.name, args: ["d1", "execute", binding, "--file", step.path, "--remote", "--config", configPath] })
    }
  }
  return commands
}

function parseConfigArg(argv) {
  const i = argv.indexOf("--config")
  return i >= 0 && argv[i + 1] ? resolve(argv[i + 1]) : undefined
}

function main() {
  const argv = process.argv.slice(2)
  const configPath = parseConfigArg(argv)
  const gates = evaluateApplyGates({ env: process.env, argv, repoRoot: REPO_ROOT, configPath })
  if (!gates.ok) {
    console.error(`cf:d1:migrations:apply: STOPPED before Wrangler — gate(s) not satisfied: ${gates.blocked.join(", ")}`)
    console.error(`Required: --remote --config wrangler.deploy.json, CF_D1_MIGRATE_EXECUTE=1, CF_D1_MIGRATE_CONFIRM=${MIGRATE_CONFIRM_PHRASE}, valid manifest + deploy config.`)
    process.exit(1)
  }
  const commands = buildApplyCommands(REPO_ROOT, configPath)
  for (const cmd of commands) {
    console.log(`cf:d1:migrations:apply → ${cmd.binding} :: ${cmd.name}`)
    const result = spawnSync(WRANGLER_BIN, cmd.args, { cwd: REPO_ROOT, stdio: "inherit" })
    if (result.status !== 0) {
      console.error(`cf:d1:migrations:apply: FAILED applying ${cmd.name} — aborting.`)
      process.exit(1)
    }
  }
  console.log("cf:d1:migrations:apply: complete.")
  process.exit(0)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
