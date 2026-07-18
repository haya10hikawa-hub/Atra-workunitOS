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
 * The Worker bundle is built from the EXACT current HEAD inside a runner-owned temp
 * root (never the operator's repository-root `.open-next`). The runner OWNS and
 * cleans up every stateful artifact it creates (source snapshot + build, 0600
 * `.dev.vars`, temp wrangler config, isolated `--persist-to` D1 state, captured
 * logs). It never reads or modifies an operator's `.open-next`, `.dev.vars`,
 * default `.wrangler/`, JWT env var, or local D1 state, and never uses `--remote`,
 * a deploy, or `wrangler whoami`. Stdout is machine-readable and secret-free.
 */

import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createHash } from "node:crypto"
import { readFileSync, rmSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { runHermeticSmoke } from "./lib/localJwtSmokeRunner.mjs"
import { generateLocalJwt, verifyLocalJwt } from "./lib/localJwt.mjs"
import { runLocalJwtBootstrap, queryLocalD1Json } from "./cf-d1-bootstrap-jwt-local.mjs"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const WRANGLER_BIN = resolve(REPO_ROOT, "node_modules/.bin/wrangler")
const OPENNEXT_BIN = resolve(REPO_ROOT, "node_modules/.bin/opennextjs-cloudflare")

/** Read-only, value-free repository status snapshot for the cleanup proof. */
function gitStatus() {
  const r = spawnSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: REPO_ROOT, encoding: "utf8", timeout: 15_000 })
  return r.status === 0 ? r.stdout : null
}

/** Exact current committed HEAD (the source the Worker must be built from). */
function gitHead() {
  const r = spawnSync("git", ["rev-parse", "HEAD"], { cwd: REPO_ROOT, encoding: "utf8", timeout: 10_000 })
  return r.status === 0 ? r.stdout.trim() : null
}

/** Hash of the operator's `.open-next/worker.js` (or null) — proves it is untouched. */
function hashOperatorArtifact() {
  try {
    return createHash("sha256").update(readFileSync(resolve(REPO_ROOT, ".open-next/worker.js"))).digest("hex")
  } catch {
    return null
  }
}

// Capture the owned child + temp root (+ ownership token) so a signal can tear
// them down even mid-await. The root is deleted ONLY after its non-secret
// ownership marker is verified — never on a bare path-prefix match.
const captured = { child: null, root: null, token: null }
let signalling = false
function ownsRoot() {
  if (!captured.root || !captured.token) return false
  try {
    return readFileSync(resolve(captured.root, ".smoke-owner"), "utf8") === captured.token
  } catch {
    return false
  }
}
function emergencyCleanup(code) {
  if (signalling) return
  signalling = true
  try {
    if (captured.child && typeof captured.child.pid === "number") {
      try { process.kill(-captured.child.pid, "SIGKILL") } catch { /* group gone */ }
      try { process.kill(captured.child.pid, "SIGKILL") } catch { /* proc gone */ }
    }
  } finally {
    try { if (ownsRoot()) rmSync(captured.root, { recursive: true, force: true }) } catch { /* already gone */ }
    process.exit(code)
  }
}
process.on("SIGINT", () => emergencyCleanup(130))
process.on("SIGTERM", () => emergencyCleanup(143))

const { ok } = await runHermeticSmoke({
  repoRoot: REPO_ROOT,
  wranglerBin: WRANGLER_BIN,
  openNextBin: OPENNEXT_BIN,
  runBootstrap: runLocalJwtBootstrap,
  queryD1: queryLocalD1Json,
  generateLocalJwt,
  verifyLocalJwt,
  gitStatus,
  gitHead,
  hashOperatorArtifact,
  onRoot: (root, token) => { captured.root = root; captured.token = token },
  onSpawn: (child) => { captured.child = child },
})

process.exit(ok ? 0 : 1)
