#!/usr/bin/env node
// TEST-ONLY dependency-injection entrypoint for the signal integration tests.
//
// This harness is NOT the production CLI (`scripts/local-jwt-smoke-local.mjs`) and
// is never invoked by it. It exists so the real runner — with its real signal
// handlers, real filesystem, real child spawning, and real process-group kills —
// can be paused at deterministic points (root-init / worker-ready) and exercised
// with fast fake children, without a 60s build. Modes:
//
//   root-init : pause right after the owned root is published (before build)
//   build     : run a real long-lived "build" child (a detached `sleep`)
//   dev       : fake build/bootstrap, real fake-dev-server child, pause after ready
//
// It prints `ROOT <path>` and `CHILD <kind> <pid>` on stdout so the test can verify
// real filesystem removal and real descendant termination after a signal.

import { dirname, resolve, join } from "node:path"
import { fileURLToPath } from "node:url"
import { spawn } from "node:child_process"
import { runHermeticSmoke } from "../../scripts/lib/localJwtSmokeRunner.mjs"
import { generateLocalJwt, verifyLocalJwt } from "../../scripts/lib/localJwt.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const mode = process.argv[2]
const repoRoot = process.argv[3] || resolve(HERE, "..", "..")
const FAKE_DEV = resolve(HERE, "fakeDevServer.mjs")

const print = (line) => process.stdout.write(`${line}\n`)
// A long, REAL timer (not a handle-less promise) so the paused process stays alive
// for the event loop until the test delivers its signal; the tests always signal
// within a couple of seconds, well before this elapses.
const pauseLong = (signal) =>
  new Promise((resolve) => {
    const t = setTimeout(resolve, 120_000)
    if (signal) signal.addEventListener("abort", () => { clearTimeout(t); resolve() }, { once: true })
  })

const common = {
  repoRoot,
  wranglerBin: FAKE_DEV,
  openNextBin: resolve(repoRoot, "node_modules/.bin/opennextjs-cloudflare"),
  generateLocalJwt,
  verifyLocalJwt,
  gitStatus: () => "HARNESS-CONST",
  gitHead: () => "harnesshead",
  hashOperatorArtifact: () => "HARNESS-OPHASH",
  onRootReady: (root) => print(`ROOT ${root}`),
  onOwnedChildSpawn: (kind, child) => print(`CHILD ${kind} ${child.pid}`),
  // Fast fakes so no real build/D1 runs in the signal tests.
  runBootstrap: async () => ({ ok: true, counts: { tenants: 1, tenant_databases: 1, users: 1, tenant_memberships: 1, auth_identities: 1 } }),
  queryD1: async () => [{ identity_match: 1, user_email_match: 1, active_membership: 1, active_tenant: 1 }],
}

const fakeBuild = async ({ root }) => ({
  snapshotDir: root,
  workerPath: join(root, "worker.js"),
  assetsPath: join(root, "assets"),
  // A real, existing wrangler config so the runner can read + rewrite it.
  wranglerJsonPath: resolve(repoRoot, "wrangler.json"),
  builtHead: "harnesshead",
})

let result
if (mode === "root-init") {
  result = await runHermeticSmoke({
    ...common,
    buildWorker: fakeBuild,
    hooks: { afterRootReady: pauseLong },
  })
} else if (mode === "build") {
  result = await runHermeticSmoke({
    ...common,
    // A real detached "build" child (its own process group); the runner registers
    // it, and a signal must SIGTERM/SIGKILL the whole group.
    buildWorker: async ({ root, childRegistry }) => {
      const child = spawn("sleep", ["600"], { detached: true, stdio: "ignore" })
      childRegistry.register("opennext-build", child)
      print(`CHILD opennext-build ${child.pid}`)
      await new Promise((r) => child.on("exit", r))
      return fakeBuild({ root })
    },
  })
} else if (mode === "dev") {
  result = await runHermeticSmoke({
    ...common,
    buildWorker: fakeBuild,
    hooks: { afterWorkerReady: pauseLong },
  })
} else {
  process.stderr.write(`unknown harness mode: ${mode}\n`)
  process.exit(2)
}

// Single exit authority: apply the runner's chosen exit code (130 SIGINT / 143
// SIGTERM on abort; else 0/1). The tests always signal, so this is the signal code.
process.exit(result.exitCode)
