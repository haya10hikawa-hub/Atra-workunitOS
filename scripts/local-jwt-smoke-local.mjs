#!/usr/bin/env node
/**
 * `npm run auth:jwt:smoke-local` — one deterministic, isolated, local-only proof
 * that the JWT auth flow works end to end against a local Worker + local D1:
 *
 *   No JWT          -> 401
 *   Fresh HS256 JWT -> 200 (body contains `workUnits`)
 *   RS256 JWT       -> 401
 *   Expired JWT     -> 401
 *
 * The runner OWNS and cleans up every stateful artifact it creates (a private
 * temp root: `.dev.vars`, temp wrangler config, isolated `--persist-to` D1 state,
 * captured log). It never reads or modifies an operator's `.dev.vars`, default
 * `.wrangler/`, JWT env var, or local D1 state, and never uses `--remote`, a
 * deploy, or `wrangler whoami`. Stdout is machine-readable and secret-free; a
 * seeded subject/email/secret/JWT/DB row is never printed.
 */

import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { existsSync } from "node:fs"
import { rmSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { runHermeticSmoke } from "./lib/localJwtSmokeRunner.mjs"
import { generateLocalJwt, verifyLocalJwt } from "./lib/localJwt.mjs"
import { runLocalJwtBootstrap, queryLocalD1Json } from "./cf-d1-bootstrap-jwt-local.mjs"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const WRANGLER_BIN = resolve(REPO_ROOT, "node_modules/.bin/wrangler")

/** Read-only, value-free repository status snapshot for the cleanup proof. */
function gitStatus() {
  const r = spawnSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: REPO_ROOT, encoding: "utf8" })
  return r.status === 0 ? r.stdout : null
}

/** Ensure the OpenNext Worker bundle exists (git-ignored build artifact). */
function ensureWorkerBuilt() {
  if (existsSync(resolve(REPO_ROOT, ".open-next/worker.js"))) return
  const r = spawnSync("npm", ["run", "cf:build"], { cwd: REPO_ROOT, stdio: "ignore" })
  if (r.status !== 0) throw new Error("worker_build_failed")
}

// Capture the owned child + temp root so a signal can tear them down even if it
// arrives mid-await (the runner's own `finally` cleanup is idempotent with this).
const captured = { child: null, root: null }
let signalling = false
function emergencyCleanup(code) {
  if (signalling) return
  signalling = true
  try {
    if (captured.child && typeof captured.child.pid === "number") {
      try { process.kill(-captured.child.pid, "SIGKILL") } catch { /* group gone */ }
      try { process.kill(captured.child.pid, "SIGKILL") } catch { /* proc gone */ }
    }
  } finally {
    try { if (captured.root) rmSync(captured.root, { recursive: true, force: true }) } catch { /* already gone */ }
    process.exit(code)
  }
}
process.on("SIGINT", () => emergencyCleanup(130))
process.on("SIGTERM", () => emergencyCleanup(143))

const { ok } = await runHermeticSmoke({
  repoRoot: REPO_ROOT,
  wranglerBin: WRANGLER_BIN,
  runBootstrap: runLocalJwtBootstrap,
  queryD1: queryLocalD1Json,
  generateLocalJwt,
  verifyLocalJwt,
  gitStatus,
  ensureWorkerBuilt,
  onRoot: (root) => { captured.root = root },
  onSpawn: (child) => { captured.child = child },
})

process.exit(ok ? 0 : 1)
