import test from "node:test"
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { existsSync, readFileSync, rmSync, statSync } from "node:fs"
import { createHash } from "node:crypto"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

// Real-subprocess signal integration tests. They launch the runner (via a test-only
// DI harness) as a child process, send it a REAL SIGINT/SIGTERM at a deterministic
// point, and verify — on the real filesystem and against real PIDs — that every
// owned child group is terminated and the owned root is removed. Nothing is mocked
// away: real signal handlers, real `rm`, real process-group kills.

const HERE = dirname(fileURLToPath(import.meta.url))
const HARNESS = resolve(HERE, "helpers", "smokeSignalHarness.mjs")
const REPO_ROOT = resolve(HERE, "..")

const isAlive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function waitFor(pred: () => boolean, timeoutMs: number, stepMs = 50) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (pred()) return true
    await sleep(stepMs)
  }
  return pred()
}

function launchHarness(mode: string) {
  const child = spawn(process.execPath, [HARNESS, mode, REPO_ROOT], { stdio: ["ignore", "pipe", "pipe"] })
  const lines: string[] = []
  let buf = ""
  child.stdout.on("data", (c) => {
    buf += c
    let i
    while ((i = buf.indexOf("\n")) >= 0) {
      lines.push(buf.slice(0, i))
      buf = buf.slice(i + 1)
    }
  })
  let exited: { code: number | null; signal: NodeJS.Signals | null } | null = null
  const exitP = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((r) =>
    child.on("exit", (code, signal) => {
      exited = { code, signal }
      r({ code, signal })
    }),
  )
  const find = (re: RegExp) => lines.map((l) => l.match(re)).find(Boolean) ?? null
  return {
    child,
    lines,
    exitP,
    isDone: () => exited !== null,
    waitLine: (re: RegExp, timeoutMs: number) => waitFor(() => find(re) !== null, timeoutMs).then(() => find(re)),
  }
}

const opHash = () => {
  try {
    return createHash("sha256").update(readFileSync(resolve(REPO_ROOT, ".open-next/worker.js"))).digest("hex")
  } catch {
    return null
  }
}

test("SIGTERM during owned-root initialization: no root, no child, non-zero exit", async () => {
  const opBefore = opHash()
  const h = launchHarness("root-init")
  try {
    const rootLine = (await h.waitLine(/^ROOT (.+)$/, 15_000)) as RegExpMatchArray | null
    assert.ok(rootLine, "harness published a root")
    const root = rootLine[1]
    assert.ok(existsSync(root), "root exists before signal")
    process.kill(h.child.pid!, "SIGTERM")
    const { code } = await h.exitP
    assert.notEqual(code, 0, "non-zero exit")
    assert.equal(await waitFor(() => !existsSync(root), 10_000), true, "owned root removed")
    // no CHILD was ever spawned (signal hit before build)
    assert.equal(h.lines.some((l) => l.startsWith("CHILD ")), false)
    assert.equal(opHash(), opBefore, "operator .open-next unchanged")
  } finally {
    if (!h.isDone()) h.child.kill("SIGKILL")
  }
})

test("SIGTERM during build: build process group + root removed, non-zero exit", async () => {
  const opBefore = opHash()
  const h = launchHarness("build")
  let buildPid: number | null = null
  let root: string | null = null
  try {
    const rootLine = (await h.waitLine(/^ROOT (.+)$/, 15_000)) as RegExpMatchArray | null
    assert.ok(rootLine)
    root = rootLine[1]
    const childLine = (await h.waitLine(/^CHILD opennext-build (\d+)$/, 15_000)) as RegExpMatchArray | null
    assert.ok(childLine, "build child spawned")
    buildPid = Number(childLine[1])
    assert.ok(isAlive(buildPid), "build child alive before signal")
    process.kill(h.child.pid!, "SIGTERM")
    const { code } = await h.exitP
    assert.notEqual(code, 0)
    assert.equal(await waitFor(() => !isAlive(buildPid!), 10_000), true, "build process group stopped")
    assert.equal(await waitFor(() => !existsSync(root!), 10_000), true, "owned root removed")
    assert.equal(opHash(), opBefore, "operator .open-next unchanged")
  } finally {
    if (buildPid && isAlive(buildPid)) {
      try {
        process.kill(-buildPid, "SIGKILL")
      } catch {
        /* gone */
      }
    }
    if (!h.isDone()) h.child.kill("SIGKILL")
    if (root && existsSync(root)) rmSync(root, { recursive: true, force: true })
  }
})

test("SIGINT during Wrangler dev: dev group + descendant + root removed, non-zero exit", async () => {
  const opBefore = opHash()
  const h = launchHarness("dev")
  let devPid: number | null = null
  let descPid: number | null = null
  let root: string | null = null
  try {
    const rootLine = (await h.waitLine(/^ROOT (.+)$/, 15_000)) as RegExpMatchArray | null
    assert.ok(rootLine)
    root = rootLine[1]
    const devLine = (await h.waitLine(/^CHILD wrangler-dev (\d+)$/, 20_000)) as RegExpMatchArray | null
    assert.ok(devLine, "wrangler-dev child spawned")
    assert.equal(existsSync(resolve(root, "worker.js")) && statSync(resolve(root, "worker.js")).isFile(), true, "fake worker exists")
    assert.equal(existsSync(resolve(root, "assets")) && statSync(resolve(root, "assets")).isDirectory(), true, "fake assets exist")
    devPid = Number(devLine[1])
    // the fake dev server records its descendant pid in the snapshot cwd
    await waitFor(() => existsSync(resolve(root!, "desc.pid")), 10_000)
    descPid = Number(readFileSync(resolve(root!, "desc.pid"), "utf8").trim())
    assert.ok(isAlive(devPid), "dev child alive")
    assert.ok(descPid && isAlive(descPid), "descendant alive")
    process.kill(h.child.pid!, "SIGINT")
    const { code } = await h.exitP
    assert.notEqual(code, 0)
    assert.equal(await waitFor(() => !isAlive(devPid!), 10_000), true, "dev group stopped")
    assert.equal(await waitFor(() => !isAlive(descPid!), 10_000), true, "descendant stopped")
    assert.equal(await waitFor(() => !existsSync(root!), 10_000), true, "owned root removed")
    assert.equal(opHash(), opBefore, "operator .open-next unchanged")
  } finally {
    for (const p of [devPid, descPid]) {
      if (p && isAlive(p)) {
        try {
          process.kill(-p, "SIGKILL")
        } catch {
          /* gone */
        }
        try {
          process.kill(p, "SIGKILL")
        } catch {
          /* gone */
        }
      }
    }
    if (!h.isDone()) h.child.kill("SIGKILL")
    if (root && existsSync(root)) rmSync(root, { recursive: true, force: true })
  }
})
