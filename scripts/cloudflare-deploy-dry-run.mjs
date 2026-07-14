#!/usr/bin/env node
/**
 * Cloudflare Deploy Dry-Run
 *
 * Builds a SYNTHETIC (non-production) deploy config, runs the preflight against
 * it, then runs `wrangler deploy --dry-run` which bundles + validates locally
 * and exits WITHOUT uploading. Performs NO real deploy and requires NO real
 * Cloudflare credentials.
 *
 * Requires the OpenNext artifacts to exist first (`npm run cf:build`).
 *
 * Exit code: 0 on success, non-zero otherwise.
 */

import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { spawnSync } from "node:child_process"
import { writeFileSync, rmSync, existsSync } from "node:fs"
import {
  loadConfigFile,
  buildConfigWithIds,
  validateDeployConfig,
  SYNTHETIC_D1_IDS,
  EXPECTED_WORKER_MAIN,
} from "./lib/cfDeployConfig.mjs"

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, "..")
const BASE_CONFIG_PATH = resolve(REPO_ROOT, "wrangler.json")
const SYNTHETIC_CONFIG_PATH = resolve(REPO_ROOT, "wrangler.deploy.synthetic.json")
const WRANGLER_BIN = resolve(REPO_ROOT, "node_modules/.bin/wrangler")

function cleanup() {
  if (existsSync(SYNTHETIC_CONFIG_PATH)) rmSync(SYNTHETIC_CONFIG_PATH, { force: true })
}

function main() {
  // Fail-safe: never reuse a stale synthetic config.
  cleanup()

  if (!existsSync(resolve(REPO_ROOT, EXPECTED_WORKER_MAIN))) {
    console.error("dry-run: FAIL worker_artifact_missing — run `npm run cf:build` first.")
    process.exit(1)
  }

  const base = loadConfigFile(BASE_CONFIG_PATH)
  if (!base.ok) {
    console.error(`dry-run: FAIL ${base.error} (wrangler.json)`)
    process.exit(1)
  }

  const synthetic = buildConfigWithIds(base.config, SYNTHETIC_D1_IDS)
  const res = validateDeployConfig(synthetic, {
    checkArtifacts: true,
    repoRoot: REPO_ROOT,
    configPath: SYNTHETIC_CONFIG_PATH,
  })
  if (!res.ok) {
    for (const f of res.failures) console.error(`dry-run: FAIL ${f}`)
    cleanup()
    process.exit(1)
  }

  writeFileSync(SYNTHETIC_CONFIG_PATH, JSON.stringify(synthetic, null, 2) + "\n", { mode: 0o600 })

  // Local, non-uploading bundle + validation. No shell interpolation (array args).
  // Empty token env guarantees no authenticated network operation is attempted.
  const result = spawnSync(
    WRANGLER_BIN,
    ["deploy", "--dry-run", "--config", SYNTHETIC_CONFIG_PATH],
    {
      cwd: REPO_ROOT,
      stdio: "inherit",
      env: { ...process.env, CLOUDFLARE_API_TOKEN: "", CI: "1" },
    },
  )

  cleanup()

  if (result.status !== 0) {
    console.error(`dry-run: FAIL wrangler_dry_run_exit_${result.status}`)
    process.exit(result.status ?? 1)
  }

  console.log("dry-run: OK (synthetic config bundled + validated; no upload performed).")
  process.exit(0)
}

main()
