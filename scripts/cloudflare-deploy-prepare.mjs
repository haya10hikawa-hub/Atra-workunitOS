#!/usr/bin/env node
/**
 * Cloudflare Deploy Prepare
 *
 * Assembles an UNTRACKED deploy config from validated deployment environment
 * variables. The generated config carries real D1 database IDs and is written
 * only as the git-ignored repository-root file `wrangler.deploy.json`.
 *
 * Inputs (environment):
 *   CLOUDFLARE_CONTROL_DB_ID        → CONTROL_DB.database_id
 *   CLOUDFLARE_TENANT_DB_DEFAULT_ID → TENANT_DB_DEFAULT.database_id
 *
 * SAFETY:
 *   - Never prints any database ID; only safe field names / categories.
 *   - Deletes any stale generated config FIRST, so a failed preparation cannot
 *     leave a config that a later deploy silently reuses.
 *   - Writes the generated config with 0600 permissions.
 *   - Performs NO network access and NO deployment.
 *
 * Exit code: 0 on success, non-zero otherwise.
 */

import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs"
import {
  loadConfigFile,
  buildConfigWithIds,
  validateD1Id,
  validateDeployConfig,
  REQUIRED_D1_BINDINGS,
} from "./lib/cfDeployConfig.mjs"

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, "..")
const BASE_CONFIG_PATH = resolve(REPO_ROOT, "wrangler.json")
export const GENERATED_CONFIG_BASENAME = "wrangler.deploy.json"
export const GENERATED_CONFIG_PATH = resolve(REPO_ROOT, GENERATED_CONFIG_BASENAME)

const ENV_BY_BINDING = {
  CONTROL_DB: "CLOUDFLARE_CONTROL_DB_ID",
  TENANT_DB_DEFAULT: "CLOUDFLARE_TENANT_DB_DEFAULT_ID",
}

function main() {
  // Always clear a stale generated config first (fail-safe: no silent reuse).
  if (existsSync(GENERATED_CONFIG_PATH)) {
    rmSync(GENERATED_CONFIG_PATH, { force: true })
  }

  const base = loadConfigFile(BASE_CONFIG_PATH)
  if (!base.ok) {
    console.error(`prepare: FAIL ${base.error} (wrangler.json)`)
    process.exit(1)
  }

  // Validate the deployment IDs (never echo values).
  const ids = {}
  const failures = []
  for (const binding of REQUIRED_D1_BINDINGS) {
    const envName = ENV_BY_BINDING[binding]
    const value = process.env[envName]
    const res = validateD1Id(value)
    if (!res.ok) {
      failures.push(`d1_id_${res.reason}:${binding} (${envName})`)
    } else {
      ids[binding] = value
    }
  }
  if (failures.length > 0) {
    for (const f of failures) console.error(`prepare: FAIL ${f}`)
    console.error("prepare: invalid deployment IDs — no config written.")
    process.exit(1)
  }

  const generated = buildConfigWithIds(base.config, ids)

  // Final validation before persisting (defense in depth).
  const check = validateDeployConfig(generated, {
    repoRoot: REPO_ROOT,
    configPath: GENERATED_CONFIG_PATH,
  })
  if (!check.ok) {
    for (const f of check.failures) console.error(`prepare: FAIL ${f}`)
    console.error("prepare: generated config failed validation — no config written.")
    process.exit(1)
  }

  mkdirSync(dirname(GENERATED_CONFIG_PATH), { recursive: true })
  writeFileSync(GENERATED_CONFIG_PATH, JSON.stringify(generated, null, 2) + "\n", { mode: 0o600 })

  console.log(`prepare: OK — wrote ${GENERATED_CONFIG_BASENAME} (0600, git-ignored).`)
  process.exit(0)
}

main()
