import test from "node:test"
import assert from "node:assert/strict"
import { tmpdir } from "node:os"
import { spawn as realSpawn } from "node:child_process"
import { runHermeticSmoke, createChildRegistry, spawnCapture } from "../scripts/lib/localJwtSmokeRunner.mjs"
import { queryLocalD1JsonAsync } from "../scripts/cf-d1-bootstrap-jwt-local.mjs"

// Real-process timeout tests: a timed-out operation must report the timeout WITHOUT
// marking the child exited, and cleanup must confirm the whole owned process group
// (leader + descendant) actually exited — never treating "signal sent" as exit.

// A real child that spawns a descendant (same process group), announces the
// descendant's pid, and never exits on its own.
const CHILD_SRC =
  "const cp=require('node:child_process');" +
  "const d=cp.spawn(process.execPath,['-e','setInterval(()=>{},1e9)'],{stdio:'ignore'});" +
  "process.stdout.write('DESC '+d.pid+'\\n');" +
  "setInterval(()=>{},1e9)"

const isAlive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function waitGone(pid: number, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return true
    await sleep(25)
  }
  return !isAlive(pid)
}

function realProcDeps() {
  return {
    spawn: (bin: string, args: string[], opts: object) => realSpawn(bin, args, opts),
    killProcess: (pid: number, sig: string) => {
      try {
        process.kill(pid, sig as NodeJS.Signals)
        return true
      } catch {
        return false
      }
    },
    isAlive,
    setTimer: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clearTimer: (t: ReturnType<typeof setTimeout>) => clearTimeout(t),
    now: () => Date.now(),
    sleep,
  }
}

function descPidOf(stdout: unknown): number {
  const m = String(stdout ?? "").match(/DESC (\d+)/)
  return m ? Number(m[1]) : 0
}

test("real build timeout: reports timeout, kill != exit, then confirmed exit reaps leader + descendant", async () => {
  const childRegistry = createChildRegistry()
  const d = realProcDeps()
  const outcome = await spawnCapture(d as never, "opennext-build", process.execPath, ["-e", CHILD_SRC], {
    cwd: tmpdir(),
    deadline: Date.now() + 15_000,
    cap: 400,
    childRegistry,
    capture: true,
  })
  assert.equal(outcome.outcome, "timeout")
  assert.equal(outcome.timedOut, true)
  const entry = childRegistry.entries()[0]
  // "kill requested" is NOT "exit confirmed".
  assert.notEqual(entry.state, "exited")
  const descPid = descPidOf(outcome.stdout)
  assert.ok(descPid > 0, "descendant pid announced")
  assert.ok(isAlive(descPid) || true) // may already be dying; confirmed below
  await Promise.race([outcome.exitConfirmation, sleep(10_000)])
  assert.equal(entry.state, "exited", "exit confirmed only after the real exit event")
  assert.notEqual(entry.exitConfirmedAt, null)
  assert.equal(await waitGone(entry.pid!, 10_000), true, "leader exit confirmed")
  assert.equal(await waitGone(descPid, 10_000), true, "descendant terminated by process-group kill")
})

test("real D1 exec timeout: async seam reports timeout; whole group confirmed exited", async () => {
  const childRegistry = createChildRegistry()
  const d = realProcDeps()
  let descPid = 0
  const exec = async (_args: string[], { label }: { label: string }) => {
    const o = await spawnCapture(d as never, `d1:${label}`, process.execPath, ["-e", CHILD_SRC], {
      cwd: tmpdir(),
      deadline: Date.now() + 15_000,
      cap: 400,
      childRegistry,
      capture: true,
    })
    descPid = descPidOf(o.stdout)
    return o
  }
  await assert.rejects(
    () => queryLocalD1JsonAsync({ sql: "SELECT 1", exec }),
    (e: unknown) => Boolean(e && (e as { timedOut?: boolean }).timedOut === true),
  )
  const entry = childRegistry.entries()[0]
  await Promise.race([entry.exitConfirmation, sleep(10_000)])
  assert.equal(entry.state, "exited")
  assert.ok(descPid > 0)
  assert.equal(await waitGone(entry.pid!, 10_000), true, "D1 leader exit confirmed")
  assert.equal(await waitGone(descPid, 10_000), true, "D1 descendant terminated")
})

// ─── timeout-exit race + root-removal ordering (full run, hybrid deps) ──
//
// Real process group + REAL kill/liveness, but an in-memory fs so the "owned root"
// is deterministic. The build times out (real child + descendant), so the run fails
// with build_timeout; cleanup must CONFIRM the real group exited before removing the
// root, and the root must still exist at the moment exit is confirmed.

function inMemoryFs() {
  const files = new Map<string, string>()
  const dirs = new Set<string>()
  const modes = new Map<string, number>()
  let n = 0
  const removeUnder = (p: string) => {
    for (const k of [...files.keys()]) if (k === p || k.startsWith(p + "/")) files.delete(k)
    for (const d of [...dirs]) if (d === p || d.startsWith(p + "/")) dirs.delete(d)
  }
  const exists = (p: string) => files.has(p) || dirs.has(p) || [...files.keys(), ...dirs].some((x) => x.startsWith(p + "/"))
  return {
    files,
    dirs,
    mkdtempSync: (prefix: string) => {
      const p = `${prefix}${n++}root`
      dirs.add(p)
      modes.set(p, 0o700)
      return p
    },
    chmodSync: (p: string, mode: number) => modes.set(p, mode),
    statSync: (p: string) => ({ mode: modes.get(p) ?? 0o700 }),
    writeFileSync: (p: string, data: string) => files.set(p, String(data)),
    readFileSync: (p: string) => {
      if (!files.has(p)) throw new Error("ENOENT")
      return files.get(p)!
    },
    rmSync: (p: string) => removeUnder(p),
    mkdir: async (p: string) => {
      dirs.add(p)
    },
    writeFile: async (p: string, data: string) => {
      files.set(p, String(data))
    },
    rm: async (p: string) => removeUnder(p),
    readFile: async () => "{}",
    existsSync: (p: string) => exists(p),
  }
}

test("timeout-exit race: root is removed only AFTER the real owned group is exit-confirmed", async () => {
  const childRegistry = createChildRegistry()
  const proc = realProcDeps()
  const fs = inMemoryFs()
  let descPid = 0
  let rootExistedAtExit: boolean | null = null

  const { results } = await runHermeticSmoke({
    repoRoot: "/repo",
    wranglerBin: "/wr",
    openNextBin: "/on",
    ...proc,
    fs,
    tmpdir: () => "/mem-tmp/",
    timeouts: { totalMs: 30_000, cleanupMs: 12_000, readinessMs: 2_000, pollIntervalMs: 10, httpMs: 500 },
    randomBytes: (len: number) => Buffer.alloc(len, 7),
    gitHead: () => "H",
    gitStatus: () => "S",
    gitStatusAsync: async () => ({ timedOut: false, value: "S" }),
    operatorArtifactState: () => ({ state: "absent" as const }),
    installSignalHandlers: () => () => {},
    log: () => {},
    generateLocalJwt: async () => "x.y.z",
    verifyLocalJwt: async () => ({ algorithm: "HS256" }),
    runBootstrap: async () => ({ ok: true, counts: {} }),
    queryD1: async () => [{}],
    // The build spawns a REAL child+descendant and times out (cap << child lifetime).
    buildWorker: async ({ root, childRegistry: cr }: { root: string; childRegistry: typeof childRegistry }) => {
      const o = await spawnCapture(proc as never, "opennext-build", process.execPath, ["-e", CHILD_SRC], {
        cwd: tmpdir(),
        deadline: Date.now() + 15_000,
        cap: 400,
        childRegistry: cr,
        capture: true,
      })
      descPid = descPidOf(o.stdout)
      // Observe: at the moment the leader's exit is confirmed, the owned root must
      // still exist (cleanup removes it only afterwards).
      const entry = cr.entries().find((e) => e.kind === "opennext-build")!
      entry.exitConfirmation.then(() => {
        rootExistedAtExit = fs.existsSync(root)
      })
      const { SmokeError } = await import("../scripts/lib/localJwtSmokeRunner.mjs")
      if (o.timedOut) throw new SmokeError("build_timeout")
      return { snapshotDir: root, workerPath: `${root}/w`, assetsPath: `${root}/a`, wranglerJsonPath: `${root}/wrangler.json`, builtHead: "H" }
    },
  })

  void childRegistry
  assert.equal(results.error_category, "build_timeout")
  assert.equal(results.children_stopped, true, "owned group confirmed stopped")
  assert.equal(results.root_removed, true, "root removed after confirmed exit")
  assert.equal(results.cleanup, true)
  assert.equal(results.status, "FAIL")
  assert.equal(rootExistedAtExit, true, "root still existed at the moment exit was confirmed")
  assert.equal(await waitGone(descPid, 10_000), true, "descendant terminated")
})
