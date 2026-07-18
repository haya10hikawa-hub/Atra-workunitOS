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
 * root (never the operator's repository-root `.open-next`). The runner OWNS every
 * child process group and stateful artifact it creates, installs its own orderly
 * SIGINT/SIGTERM handling, and runs bounded cleanup on success, failure, or signal.
 * It never reads or modifies an operator's `.open-next`, `.dev.vars`, default
 * `.wrangler/`, JWT env var, or local D1 state, and never uses `--remote`, a
 * deploy, or `wrangler whoami`. Stdout is machine-readable and secret-free.
 *
 * This is the PRODUCTION entrypoint: it wires only real dependencies and installs
 * no test hooks. Signal/hang integration tests use a separate test-only harness.
 */

import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { spawn, spawnSync } from "node:child_process"
import { runHermeticSmoke } from "./lib/localJwtSmokeRunner.mjs"
import { generateLocalJwt, verifyLocalJwt } from "./lib/localJwt.mjs"
import { runLocalJwtBootstrapAsync, queryLocalD1JsonAsync } from "./cf-d1-bootstrap-jwt-local.mjs"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const WRANGLER_BIN = resolve(REPO_ROOT, "node_modules/.bin/wrangler")
const OPENNEXT_BIN = resolve(REPO_ROOT, "node_modules/.bin/opennextjs-cloudflare")

/** Read-only, value-free repository status snapshot (the "before" capture). */
function gitStatus() {
  const r = spawnSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: REPO_ROOT, encoding: "utf8", timeout: 15_000 })
  return r.status === 0 ? r.stdout : null
}

/** Cleanup-time git status as a bounded async child, held to the remaining budget. */
function gitStatusAsync(timeoutMs) {
  return new Promise((resolve) => {
    let out = ""
    let done = false
    const child = spawn("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: REPO_ROOT, detached: true, stdio: ["ignore", "pipe", "ignore"] })
    const finish = (v) => {
      if (done) return
      done = true
      clearTimeout(t)
      resolve(v)
    }
    const t = setTimeout(() => {
      try { process.kill(-child.pid, "SIGKILL") } catch { /* gone */ }
      try { process.kill(child.pid, "SIGKILL") } catch { /* gone */ }
      finish({ timedOut: true, value: null })
    }, Math.max(1, timeoutMs))
    if (child.stdout) child.stdout.on("data", (c) => { out += c })
    child.on("exit", (code) => finish({ timedOut: false, value: code === 0 ? out : null }))
    child.on("error", () => finish({ timedOut: false, value: null }))
  })
}

/** Exact current committed HEAD (the source the Worker must be built from). */
function gitHead() {
  const r = spawnSync("git", ["rev-parse", "HEAD"], { cwd: REPO_ROOT, encoding: "utf8", timeout: 10_000 })
  return r.status === 0 ? r.stdout.trim() : null
}

/** Structured operator-artifact state — absent vs present(hash) vs unreadable. The
 *  hash is never printed; only the derived unchanged/failed verdict is reported. */
function operatorArtifactState() {
  const p = resolve(REPO_ROOT, ".open-next/worker.js")
  try {
    if (!existsSync(p)) return { state: "absent" }
    return { state: "present", hash: createHash("sha256").update(readFileSync(p)).digest("hex") }
  } catch {
    return { state: "unreadable" }
  }
}

const { exitCode } = await runHermeticSmoke({
  repoRoot: REPO_ROOT,
  wranglerBin: WRANGLER_BIN,
  openNextBin: OPENNEXT_BIN,
  runBootstrap: runLocalJwtBootstrapAsync,
  queryD1: queryLocalD1JsonAsync,
  generateLocalJwt,
  verifyLocalJwt,
  gitStatus,
  gitStatusAsync,
  gitHead,
  operatorArtifactState,
})

// The runner installs its own signal handlers and runs bounded cleanup; it returns
// the exit code (0 pass, 1 fail, 130 SIGINT, 143 SIGTERM) for the caller to apply,
// so there is a single exit authority.
process.exit(exitCode)
