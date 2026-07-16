#!/usr/bin/env node
/**
 * Cloudflare Deploy Preflight
 *
 * Deterministic, fail-closed gate that runs BEFORE any Cloudflare deploy.
 * Performs NO network access and NO deployment. Never prints database IDs —
 * only safe field names and category-level failures.
 *
 * Usage:
 *   node scripts/cloudflare-deploy-preflight.mjs [--config <path>] [--check-artifacts]
 *
 *   (no --config)  Self-check: validates the committed base wrangler.json for
 *                  the Workers/OpenNext target, and validates a synthetic deploy
 *                  config to exercise D1-ID validation. Safe to run in CI.
 *   --config <p>   Validates the resolved deploy config at <p> (full, incl. IDs).
 *   --check-artifacts  Also require .open-next/worker.js + .open-next/assets.
 *
 * Exit code: 0 when all checks pass, non-zero otherwise.
 */

import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import {
  loadConfigFile,
  validateDeployConfig,
  buildConfigWithIds,
  SYNTHETIC_D1_IDS,
} from "./lib/cfDeployConfig.mjs"
import { loadValidatedDeployConfigAuthority } from "./lib/cfDeployConfigAuthority.mjs"
import { beginEvidenceOperation, emitWorkerPreflightReceipt } from "./lib/d1EvidenceReceipts.mjs"

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, "..")
const BASE_CONFIG_PATH = resolve(REPO_ROOT, "wrangler.json")

/** Parse args, failing closed on unknown flags or `--config` without a value. */
export function parseArgs(argv) {
  const args = { config: null, checkArtifacts: false }
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (token === "--config") {
      const value = argv[i + 1]
      if (value === undefined || value.startsWith("--")) {
        return { ok: false, error: "missing_config_value" }
      }
      args.config = value
      i += 1
    } else if (token === "--check-artifacts") {
      args.checkArtifacts = true
    } else {
      return { ok: false, error: "unknown_argument" }
    }
  }
  return { ok: true, args }
}

function fail(category, detail) {
  // Only safe field names / categories — never values.
  console.error(`preflight: FAIL ${category}${detail ? ` (${detail})` : ""}`)
}

function main() {
  const parsed = parseArgs(process.argv.slice(2))
  if (!parsed.ok) {
    fail(parsed.error)
    process.exit(1)
  }
  const args = parsed.args
  const failures = []

  // Evidence session (optional): the boundary opens before the checks run; the
  // receipt is emitted after the result is known, from this real result path.
  const evidenceSessionDir = process.env.CF_D1_EVIDENCE_SESSION_DIR
  const evidenceBegun = evidenceSessionDir ? beginEvidenceOperation() : null

  if (args.config) {
    // ── Validate a resolved deploy config ──
    const configPath = resolve(process.cwd(), args.config)
    const loaded = loadConfigFile(configPath)
    if (!loaded.ok) {
      fail(loaded.error)
      process.exit(1)
    }
    const res = validateDeployConfig(loaded.config, {
      checkArtifacts: args.checkArtifacts,
      repoRoot: REPO_ROOT,
      configPath,
    })
    failures.push(...res.failures)
  } else {
    // ── Self-check (no --config) ──
    const base = loadConfigFile(BASE_CONFIG_PATH)
    if (!base.ok) {
      fail(base.error, "wrangler.json")
      process.exit(1)
    }
    // 1) Base structure must be a valid Workers/OpenNext target. Placeholder D1
    //    IDs are allowed here (the committed base is safe to publish).
    const baseRes = validateDeployConfig(base.config, {
      allowPlaceholderIds: true,
      checkArtifacts: args.checkArtifacts,
      repoRoot: REPO_ROOT,
    })
    for (const f of baseRes.failures) failures.push(`base:${f}`)

    // 2) A synthetic deploy config (real-shaped IDs) must fully validate,
    //    proving the deploy pipeline yields a deployable, non-placeholder config.
    const synthetic = buildConfigWithIds(base.config, SYNTHETIC_D1_IDS)
    const synthRes = validateDeployConfig(synthetic, {
      checkArtifacts: false,
      repoRoot: REPO_ROOT,
      // synthetic config is validated in-memory; approved git-ignored basename.
      configPath: `${REPO_ROOT}/wrangler.deploy.synthetic.json`,
    })
    for (const f of synthRes.failures) failures.push(`synthetic:${f}`)
  }

  // Command-bound receipt from THIS result path. A successful receipt requires
  // the validated deploy-config authority (--config) AND --check-artifacts with a
  // real built Worker artifact — the emitter derives everything else itself.
  if (evidenceSessionDir) {
    const authority = args.config
      ? loadValidatedDeployConfigAuthority({ configPath: resolve(process.cwd(), args.config), repoRoot: REPO_ROOT, allowPlaceholderIds: false })
      : { ok: false }
    const receipt = emitWorkerPreflightReceipt(evidenceSessionDir, {
      repoRoot: REPO_ROOT, authority: authority.ok ? authority.authority : null, begun: evidenceBegun,
      preflightResult: { ok: failures.length === 0, failures, checkedArtifacts: args.checkArtifacts },
    })
    if (receipt.ok) console.log("evidence: receipt recorded (worker_preflight_completed)")
    else console.error(`evidence: receipt FAILED — ${receipt.blocked.join(", ")}`)
  }

  if (failures.length > 0) {
    for (const f of failures) fail(f)
    console.error(`preflight: ${failures.length} failure(s) — deploy blocked.`)
    process.exit(1)
  }

  console.log("preflight: OK (Workers/OpenNext target, bindings, safe defaults verified).")
  process.exit(0)
}

// Run only when invoked directly (importing for tests must not execute).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
