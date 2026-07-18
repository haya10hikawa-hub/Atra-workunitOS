import test from "node:test"
import assert from "node:assert/strict"
import {
  runHermeticSmoke,
  createOwnedPathRegistry,
  createChildRegistry,
  createOwnedRoot,
  buildHermeticEnv,
  buildHermeticConfig,
  buildRs256Token,
  alignmentSql,
  evaluateProof,
  formatResults,
  SAFE_RESULT_KEYS,
  HERMETIC_FALSE_FLAGS,
  MIN_SECRET_BYTES,
} from "../scripts/lib/localJwtSmokeRunner.mjs"
import { generateLocalJwt, verifyLocalJwt } from "../scripts/lib/localJwt.mjs"
import { EventEmitter } from "node:events"

type ArtifactState = { state: "absent" } | { state: "present"; hash: string } | { state: "unreadable" }

const HEAD = "1111111111111111111111111111111111111111"
const MOCK_WRANGLER_JSON = JSON.stringify({
  main: ".open-next/worker.js",
  assets: { directory: ".open-next/assets", binding: "ASSETS" },
  vars: { PERSISTENCE_MODE: "d1" },
  d1_databases: [{ binding: "CONTROL_DB", database_name: "workunit-control-db", database_id: "X" }],
})

function b64urlJson(seg: string): { alg?: string; exp?: number } {
  return JSON.parse(Buffer.from(seg, "base64url").toString("utf8"))
}

// In-memory fs supporting both the sync ops used by atomic root publication and
// the async ops used by the run/cleanup.
function makeMockFs(opts: { chmodThrows?: boolean; statBadMode?: boolean; markerWriteThrows?: boolean; markerCorrupt?: boolean } = {}) {
  const files = new Map<string, string>()
  const dirs = new Set<string>()
  const modes = new Map<string, number>()
  let counter = 0
  const removeUnder = (p: string) => {
    for (const k of [...files.keys()]) if (k === p || k.startsWith(p + "/")) files.delete(k)
    for (const dd of [...dirs]) if (dd === p || dd.startsWith(p + "/")) dirs.delete(dd)
  }
  const exists = (p: string) =>
    files.has(p) || dirs.has(p) || [...files.keys()].some((x) => x.startsWith(p + "/")) || [...dirs].some((x) => x.startsWith(p + "/"))
  return {
    files,
    dirs,
    mkdtempSync: (prefix: string) => {
      const p = `${prefix}${(counter++).toString(36)}root`
      dirs.add(p)
      modes.set(p, 0o700)
      return p
    },
    chmodSync: (p: string, mode: number) => {
      if (opts.chmodThrows) throw new Error("injected_chmod_failure")
      modes.set(p, mode)
    },
    statSync: (p: string) => ({ mode: opts.statBadMode ? 0o755 : modes.get(p) ?? 0o700 }),
    writeFileSync: (p: string, data: string, o?: { mode?: number }) => {
      if (opts.markerWriteThrows && p.endsWith(".smoke-owner")) throw new Error("injected_marker_write_failure")
      files.set(p, opts.markerCorrupt && p.endsWith(".smoke-owner") ? "CORRUPT" : String(data))
      if (o?.mode) modes.set(p, o.mode)
    },
    readFileSync: (p: string) => {
      if (!files.has(p)) throw new Error("ENOENT")
      return files.get(p)!
    },
    rmSync: (p: string) => removeUnder(p),
    mkdir: async (p: string) => {
      dirs.add(p)
    },
    writeFile: async (p: string, data: string, o?: { mode?: number }) => {
      files.set(p, String(data))
      if (o?.mode) modes.set(p, o.mode)
    },
    rm: async (p: string) => removeUnder(p),
    readFile: async (p: string) => (p.endsWith("wrangler.json") ? MOCK_WRANGLER_JSON : files.get(p) ?? ""),
    existsSync: (p: string) => exists(p),
  }
}

interface MockOptions {
  buildHead?: string
  expectedHead?: string
  buildThrows?: string
  bootstrap?: () => { ok: boolean; reason?: string; counts?: Record<string, number> }
  queryD1?: () => Array<Record<string, unknown>>
  queryThrowsTimedOut?: boolean
  fetchStatusFor?: (kind: "none" | "hs256" | "rs256" | "expired" | "readiness") => number
  fetchThrows?: boolean
  spawnThrows?: boolean
  isAliveForever?: boolean
  portReleased?: boolean
  portHangs?: boolean
  rmHangs?: boolean
  gitStatusSequence?: Array<string | null>
  gitStatusAsyncTimedOut?: boolean
  gitStatusAsyncSlow?: boolean
  operatorStateSequence?: ArtifactState[]
  fixedSecret?: string
  totalMs?: number
  cleanupMs?: number
  realClock?: boolean
  configMainOutsideRoot?: boolean
  fsOpts?: Parameters<typeof makeMockFs>[0]
}

function makeDeps(opts: MockOptions = {}) {
  const fs = makeMockFs(opts.fsOpts)
  const writes: Array<{ path: string; mode?: number; data: string }> = []
  const rms: string[] = []
  const kills: Array<{ pid: number; signal: string }> = []
  const spawns: string[][] = []
  const signalHandlers: Array<(sig: string) => void> = []
  let spawnCount = 0
  const alive = new Set<number>()
  const pidToChild = new Map<number, EventEmitter & { pid: number; stdout: EventEmitter }>()
  const gitSeq = opts.gitStatusSequence ?? ["CONST", "CONST"]
  let gitIdx = 0
  const opStateSeq: ArtifactState[] = opts.operatorStateSequence ?? [
    { state: "present", hash: "H" },
    { state: "present", hash: "H" },
  ]
  let opStateIdx = 0
  const logLines: string[] = []
  const exitCodes: number[] = []
  let clock = 1_000_000

  // record fs writes for assertions
  const wrappedWriteFile = fs.writeFile
  fs.writeFile = async (p: string, data: string, o?: { mode?: number }) => {
    writes.push({ path: p, mode: o?.mode, data })
    return wrappedWriteFile(p, data, o)
  }
  const wrappedRm = fs.rm
  fs.rm = async (p: string) => {
    rms.push(p)
    if (opts.rmHangs) return new Promise<void>(() => {}) // never resolves
    return wrappedRm(p)
  }

  const classify = (token: string | null): number => {
    if (!token) return opts.fetchStatusFor?.("none") ?? 401
    const parts = token.split(".")
    if (parts.length !== 3) return 401
    let header: { alg?: string }
    try {
      header = b64urlJson(parts[0])
    } catch {
      return 401
    }
    if (header.alg !== "HS256") return opts.fetchStatusFor?.("rs256") ?? 401
    let payload: { exp?: number }
    try {
      payload = b64urlJson(parts[1])
    } catch {
      return 401
    }
    if (typeof payload.exp === "number" && payload.exp * 1000 < clock) return opts.fetchStatusFor?.("expired") ?? 401
    return opts.fetchStatusFor?.("hs256") ?? 200
  }

  const deps = {
    repoRoot: "/repo",
    wranglerBin: "/repo/node_modules/.bin/wrangler",
    openNextBin: "/repo/node_modules/.bin/opennextjs-cloudflare",
    tmpdir: () => "/mock-tmp/",
    timeouts: {
      readinessMs: 2_000,
      pollIntervalMs: 10,
      httpMs: 500,
      totalMs: opts.totalMs ?? 60_000,
      cleanupMs: opts.cleanupMs ?? 5_000,
    },
    fs,
    openLogFd: () => 7,
    closeFd: () => {},
    randomBytes: (n: number) => (opts.fixedSecret ? Buffer.from(opts.fixedSecret.padEnd(n, "A").slice(0, n)) : Buffer.alloc(n, 3)),
    hashFile: () => "x",
    gitHead: () => opts.expectedHead ?? HEAD,
    gitStatus: () => (gitIdx < gitSeq.length ? gitSeq[gitIdx++] : gitSeq[gitSeq.length - 1]),
    gitStatusAsync: async (ms: number) => {
      if (opts.gitStatusAsyncTimedOut) return { timedOut: true, value: null }
      // Self-bounding: a git command that would exceed the remaining budget consumes
      // (at most) that budget and then reports timeout — never a fresh 15 s command.
      if (opts.gitStatusAsyncSlow) {
        await new Promise((r) => setTimeout(r, Math.max(1, ms)))
        return { timedOut: true, value: null }
      }
      const v = gitIdx < gitSeq.length ? gitSeq[gitIdx++] : gitSeq[gitSeq.length - 1]
      return { timedOut: false, value: v }
    },
    operatorArtifactState: () => (opStateIdx < opStateSeq.length ? opStateSeq[opStateIdx++] : opStateSeq[opStateSeq.length - 1]),
    buildWorker: async ({ root }: { root: string }) => {
      if (opts.buildThrows) {
        const { SmokeError } = await import("../scripts/lib/localJwtSmokeRunner.mjs")
        throw new SmokeError(opts.buildThrows)
      }
      const snapshotDir = `${root}/src`
      const workerPath = opts.configMainOutsideRoot ? "/repo/.open-next/worker.js" : `${snapshotDir}/.open-next/worker.js`
      fs.dirs.add(snapshotDir)
      fs.files.set(workerPath, "worker")
      return { snapshotDir, workerPath, assetsPath: `${snapshotDir}/.open-next/assets`, wranglerJsonPath: `${snapshotDir}/wrangler.json`, builtHead: opts.buildHead ?? HEAD }
    },
    pickPort: async () => 40000 + spawnCount,
    isPortFree: async () => {
      if (opts.portHangs) return new Promise<boolean>(() => {})
      return opts.portReleased ?? true
    },
    spawn: (_bin: string, args: string[]) => {
      spawnCount++
      spawns.push(args)
      if (opts.spawnThrows) throw new Error("injected_spawn_failure")
      const pid = 5000 + spawnCount
      alive.add(pid)
      // A real EventEmitter so the registry's exit/close listeners fire on kill —
      // exit confirmation comes only from the emitted event, never "signal sent".
      const child = Object.assign(new EventEmitter(), { pid, stdout: new EventEmitter() })
      pidToChild.set(pid, child as EventEmitter & { pid: number; stdout: EventEmitter })
      return child
    },
    killProcess: (pid: number, signal: string) => {
      kills.push({ pid, signal })
      const real = Math.abs(pid)
      if (!opts.isAliveForever && alive.has(real)) {
        alive.delete(real)
        const child = pidToChild.get(real)
        if (child) queueMicrotask(() => { child.emit("exit", null, signal); child.emit("close", null, signal) })
      }
      return true
    },
    isAlive: (pid: number) => alive.has(pid),
    setTimer: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clearTimer: (t: ReturnType<typeof setTimeout>) => clearTimeout(t),
    fetchImpl: async (url: string, o?: { headers?: Record<string, string> }) => {
      if (opts.fetchThrows) throw new Error("ECONNREFUSED")
      const auth = o?.headers?.authorization
      if (!auth) return { status: opts.fetchStatusFor?.("readiness") ?? 401, json: async () => ({}) }
      const status = classify(auth.replace(/^Bearer /, ""))
      return { status, json: async () => (status === 200 ? { workUnits: [] } : { error: "x" }) }
    },
    now: () => (opts.realClock ? Date.now() : (clock += 5)),
    sleep: (ms: number) => (opts.realClock ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve()),
    log: (line: string) => logLines.push(line),
    installSignalHandlers: (handler: (sig: string) => void) => {
      signalHandlers.push(handler)
      return () => {}
    },
    exit: (code: number) => {
      exitCodes.push(code)
    },
    generateLocalJwt,
    verifyLocalJwt,
    runBootstrap: async () =>
      opts.bootstrap ? opts.bootstrap() : { ok: true, counts: { tenants: 1, tenant_databases: 1, users: 1, tenant_memberships: 1, auth_identities: 1 } },
    queryD1: async () => {
      if (opts.queryThrowsTimedOut) {
        const e = new Error("d1_timeout")
        ;(e as Error & { timedOut?: boolean }).timedOut = true
        throw e
      }
      return opts.queryD1 ? opts.queryD1() : [{ identity_match: 1, user_email_match: 1, active_membership: 1, active_tenant: 1 }]
    },
  }
  return { deps, fs, writes, rms, kills, spawns, logLines, exitCodes, signalHandlers }
}

// ─── pure helpers ───────────────────────────────────────────────────

test("owned-path registry only tracks what it registered", () => {
  const r = createOwnedPathRegistry()
  r.register("/a/root", "root")
  assert.equal(r.has("/a/root"), true)
  assert.equal(r.has("/operator/.dev.vars"), false)
})

test("child registry: explicit lifecycle; only a real exit event settles it", async () => {
  const cr = createChildRegistry()
  const child = Object.assign(new EventEmitter(), { pid: 4242 })
  const entry = cr.register("opennext-build", child)
  assert.equal(entry.state, "running")
  assert.equal(cr.live()[0].pgid, 4242)
  // "kill requested" (terminating) is NOT exit — the entry stays live.
  cr.markTerminating(child)
  assert.equal(entry.state, "terminating")
  assert.equal(cr.live().length, 1, "terminating child remains visible to cleanup")
  // Only a real exit event confirms exit and resolves the confirmation promise.
  let confirmed = false
  entry.exitConfirmation.then(() => { confirmed = true })
  child.emit("exit", 0, null)
  await entry.exitConfirmation
  assert.equal(confirmed, true)
  assert.equal(entry.state, "exited")
  assert.equal(entry.exitConfirmedAt !== null, true)
  assert.equal(cr.live().length, 0)
})

test("buildHermeticConfig points main/assets at the runner-owned bundle", () => {
  const cfg = JSON.parse(buildHermeticConfig(MOCK_WRANGLER_JSON, "/tmp/root/src/.open-next/worker.js", "/tmp/root/src/.open-next/assets"))
  assert.equal(cfg.main, "/tmp/root/src/.open-next/worker.js")
  assert.equal(cfg.assets.directory, "/tmp/root/src/.open-next/assets")
})

test("hermetic env is fully fail-closed and local-only", () => {
  const env = buildHermeticEnv("s".repeat(40), "nonce")
  assert.match(env.CF_D1_BOOTSTRAP_IDENTITY_EMAIL, /@example\.invalid$/)
  for (const flag of HERMETIC_FALSE_FLAGS) assert.equal(env[flag], "false")
})

test("buildRs256Token relabels alg without touching payload/signature", () => {
  const rs = buildRs256Token("aaa.bbb.ccc")
  const [h, p, s] = rs.split(".")
  assert.equal(b64urlJson(h).alg, "RS256")
  assert.equal(p, "bbb")
  assert.equal(s, "ccc")
})

test("alignmentSql is COUNT-only", () => {
  const sql = alignmentSql(buildHermeticEnv("s".repeat(40), "n"))
  assert.match(sql, /COUNT\(\*\)/)
  assert.doesNotMatch(sql, /SELECT provider_subject|SELECT email/)
})

test("evaluateProof requires HTTP shape AND build-source proofs", () => {
  const good = { no_jwt_status: 401, hs256_status: 200, work_units_key: true, rs256_status: 401, expired_status: 401, jwt_authority_aligned: true, d1_alignment: true, worker_source_match: true, worker_bundle_owned: true }
  assert.equal(evaluateProof(good), true)
  assert.equal(evaluateProof({ ...good, worker_source_match: false }), false)
  assert.equal(evaluateProof({ ...good, hs256_status: 500 }), false)
})

test("formatResults emits only safe keys", () => {
  const out = formatResults({ status: "PASS", hs256_status: 200, secret_field: "SUPERSECRET" })
  assert.equal(out.includes("SUPERSECRET"), false)
  for (const line of out.trim().split("\n")) assert.ok(SAFE_RESULT_KEYS.includes(line.split("=")[0]))
})

// ─── atomic owned-root publication ──────────────────────────────────

test("createOwnedRoot publishes an atomic, marker-verified root", () => {
  const { deps } = makeDeps()
  const registry = createOwnedPathRegistry()
  const { root, token } = createOwnedRoot(deps, { registry })
  assert.ok(root.startsWith("/mock-tmp/atra-jwt-smoke-"))
  assert.equal(registry.list().some((e) => e.kind === "root" && e.path === root), true)
  assert.equal(deps.fs.readFileSync(`${root}/.smoke-owner`), token)
})

for (const step of ["chmodThrows", "statBadMode", "markerWriteThrows", "markerCorrupt"] as const) {
  test(`createOwnedRoot leaves NO root when init fails at: ${step}`, () => {
    const { deps, fs } = makeDeps({ fsOpts: { [step]: true } })
    const registry = createOwnedPathRegistry()
    assert.throws(() => createOwnedRoot(deps, { registry }))
    // No root directory survived, and nothing was published.
    assert.equal(fs.dirs.size, 0, "partial root removed")
    assert.equal(registry.list().some((e) => e.kind === "root"), false, "nothing published")
  })
}

// ─── orchestration: happy path ──────────────────────────────────────

test("happy path: full smoke passes and cleans up owned state", async () => {
  const m = makeDeps()
  const { ok, results } = await runHermeticSmoke(m.deps)
  assert.equal(ok, true)
  assert.equal(results.status, "PASS")
  assert.equal(results.worker_source_match, true)
  assert.equal(results.worker_bundle_owned, true)
  assert.equal(results.no_jwt_status, 401)
  assert.equal(results.hs256_status, 200)
  assert.equal(results.rs256_status, 401)
  assert.equal(results.expired_status, 401)
  assert.equal(results.cleanup, true)
  assert.equal(results.children_stopped, true)
  assert.equal(results.root_removed, true)
  assert.equal(m.fs.dirs.size, 0, "temp root removed")
})

test("invariant: status=PASS impossible when cleanup fails (port not released)", async () => {
  const m = makeDeps({ portReleased: false })
  const { ok, results } = await runHermeticSmoke(m.deps)
  assert.equal(results.port_released, false)
  assert.equal(results.cleanup, false)
  assert.equal(results.status, "FAIL")
  assert.equal(ok, false)
})

test("secret + JWT never appear in stdout; .dev.vars is 0600 and carries the secret", async () => {
  const raw = "KNOWN-RAW-BYTES-FOR-LEAK-TEST-PADDED-TO-48-CHARS"
  const m = makeDeps({ fixedSecret: raw })
  await runHermeticSmoke(m.deps)
  const actualSecret = Buffer.from(raw.padEnd(48, "A").slice(0, 48)).toString("base64url")
  const out = m.logLines.join("")
  assert.equal(out.includes(actualSecret), false)
  assert.doesNotMatch(out, /[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/)
  const envWrite = m.writes.find((w) => w.path.endsWith(".dev.vars"))!
  assert.equal(envWrite.mode, 0o600)
  assert.equal(envWrite.data.includes(actualSecret), true)
})

test("temp config points main at the runner-owned bundle, never operator .open-next", async () => {
  const m = makeDeps()
  await runHermeticSmoke(m.deps)
  const cfg = JSON.parse(m.writes.find((w) => w.path.endsWith("wrangler.hermetic.json"))!.data)
  assert.match(cfg.main, /\/mock-tmp\/atra-jwt-smoke-[^/]+\/src\/\.open-next\/worker\.js$/)
})

test("wrangler-dev child is stopped by its exact process group, never by name", async () => {
  const m = makeDeps()
  await runHermeticSmoke(m.deps)
  assert.ok(m.kills.some((k) => k.pid === -5001), "process-group signal expected")
  assert.ok(m.kills.every((k) => Math.abs(k.pid) === 5001), "only owned pid signalled")
})

// ─── build-freshness proofs ─────────────────────────────────────────

test("stale/mismatched bundle (built head != expected head) cannot pass", async () => {
  const m = makeDeps({ buildHead: "deadbeef", expectedHead: HEAD })
  const { results } = await runHermeticSmoke(m.deps)
  assert.equal(results.worker_source_match, false)
  assert.equal(results.status, "FAIL")
})

test("bundle outside the runner-owned root is not accepted as owned", async () => {
  const m = makeDeps({ configMainOutsideRoot: true })
  const { results } = await runHermeticSmoke(m.deps)
  assert.equal(results.worker_bundle_owned, false)
  assert.equal(results.status, "FAIL")
})

test("operator artifact drift (hash changed) fails closed", async () => {
  const m = makeDeps({ operatorStateSequence: [{ state: "present", hash: "A" }, { state: "present", hash: "B" }] })
  const { results } = await runHermeticSmoke(m.deps)
  assert.equal(results.operator_build_artifact_untouched, false)
  assert.equal(results.status, "FAIL")
})

test("operator artifact absent→absent is unchanged", async () => {
  const m = makeDeps({ operatorStateSequence: [{ state: "absent" }, { state: "absent" }] })
  const { results } = await runHermeticSmoke(m.deps)
  assert.equal(results.operator_build_artifact_untouched, true)
})

test("operator artifact unreadable at either point fails closed", async () => {
  const m = makeDeps({ operatorStateSequence: [{ state: "present", hash: "A" }, { state: "unreadable" }] })
  const { results } = await runHermeticSmoke(m.deps)
  assert.equal(results.operator_build_artifact_untouched, false)
  assert.equal(results.status, "FAIL")
})

test("operator artifact absent→present transition fails closed", async () => {
  const m = makeDeps({ operatorStateSequence: [{ state: "absent" }, { state: "present", hash: "A" }] })
  const { results } = await runHermeticSmoke(m.deps)
  assert.equal(results.operator_build_artifact_untouched, false)
  assert.equal(results.status, "FAIL")
})

test("cleanup git status timeout fails closed with git_status_timeout", async () => {
  const m = makeDeps({ gitStatusAsyncTimedOut: true })
  const { results } = await runHermeticSmoke(m.deps)
  assert.equal(results.repository_status_unchanged, false)
  assert.equal(results.cleanup_category, "git_status_timeout")
  assert.equal(results.cleanup, false)
  assert.equal(results.status, "FAIL")
})

// ─── failure injection: cleanup always runs ─────────────────────────

async function assertCleanedUp(m: ReturnType<typeof makeDeps>, res: { ok: boolean; results: Record<string, unknown> }, category?: string) {
  assert.equal(res.results.status, "FAIL")
  assert.equal(res.ok, false)
  if (category) assert.equal(res.results.error_category, category)
  assert.equal(m.fs.dirs.size, 0, "owned root removed")
}

test("failure @ build (failure) cleans up", async () => {
  const m = makeDeps({ buildThrows: "build_failed" })
  await assertCleanedUp(m, await runHermeticSmoke(m.deps), "build_failed")
})

test("failure @ build (timeout) cleans up", async () => {
  const m = makeDeps({ buildThrows: "build_timeout" })
  await assertCleanedUp(m, await runHermeticSmoke(m.deps), "build_timeout")
})

test("failure @ bootstrap timeout cleans up", async () => {
  const m = makeDeps({ bootstrap: () => ({ ok: false, reason: "bootstrap_timeout" }) })
  await assertCleanedUp(m, await runHermeticSmoke(m.deps), "bootstrap_timeout")
})

test("failure @ D1 query timeout cleans up", async () => {
  const m = makeDeps({ queryThrowsTimedOut: true })
  await assertCleanedUp(m, await runHermeticSmoke(m.deps), "d1_query_timeout")
})

test("failure @ HTTP hang cleans up", async () => {
  const m = makeDeps({ fetchThrows: true })
  const res = await runHermeticSmoke(m.deps)
  assert.equal(res.results.status, "FAIL")
  assert.equal(m.fs.dirs.size, 0)
})

test("failure @ child spawn throwing synchronously cleans up", async () => {
  const m = makeDeps({ spawnThrows: true })
  await assertCleanedUp(m, await runHermeticSmoke(m.deps), "worker_start_failed")
})

test("failure @ global deadline expiration cleans up", async () => {
  const m = makeDeps({ totalMs: 0 })
  await assertCleanedUp(m, await runHermeticSmoke(m.deps), "total_deadline_exceeded")
})

test("unavailable git status (null) fails closed", async () => {
  const m = makeDeps({ gitStatusSequence: [null, null] })
  const { results } = await runHermeticSmoke(m.deps)
  assert.equal(results.repository_status_unchanged, false)
  assert.equal(results.status, "FAIL")
})

test("repository drift fails closed", async () => {
  const m = makeDeps({ gitStatusSequence: ["BEFORE", "AFTER-DRIFT"] })
  const { results } = await runHermeticSmoke(m.deps)
  assert.equal(results.repository_status_unchanged, false)
  assert.equal(results.status, "FAIL")
})

// ─── bounded-cleanup HANG tests (must terminate within cleanupMs) ───

test("cleanup hang @ child exit → child_cleanup_timeout, status FAIL", async () => {
  const m = makeDeps({ isAliveForever: true, cleanupMs: 40 })
  const started = Date.now()
  const { results } = await runHermeticSmoke(m.deps)
  assert.ok(Date.now() - started < 5_000, "must not hang")
  assert.equal(results.children_stopped, false)
  assert.equal(results.cleanup_category, "child_cleanup_timeout")
  assert.equal(results.cleanup, false)
  assert.equal(results.status, "FAIL")
})

test("cleanup hang @ root removal → root_removal_timeout, status FAIL", async () => {
  const m = makeDeps({ rmHangs: true, cleanupMs: 40 })
  const started = Date.now()
  const { results } = await runHermeticSmoke(m.deps)
  assert.ok(Date.now() - started < 5_000, "must not hang")
  assert.equal(results.cleanup_category, "root_removal_timeout")
  assert.equal(results.cleanup, false)
  assert.equal(results.status, "FAIL")
})

test("cleanup hang @ port probe → port_release_timeout, status FAIL", async () => {
  const m = makeDeps({ portHangs: true, cleanupMs: 40 })
  const started = Date.now()
  const { results } = await runHermeticSmoke(m.deps)
  assert.ok(Date.now() - started < 5_000, "must not hang")
  assert.equal(results.cleanup_category, "port_release_timeout")
  assert.equal(results.cleanup, false)
  assert.equal(results.status, "FAIL")
})

// ─── absolute cleanup budget: wall time <= cleanupMs + tolerance (real clock) ──

test("absolute budget: a child that consumes cleanupMs → child_cleanup_timeout within budget", async () => {
  const cleanupMs = 250
  const m = makeDeps({ realClock: true, cleanupMs, isAliveForever: true })
  const started = Date.now()
  const { results } = await runHermeticSmoke(m.deps)
  const elapsed = Date.now() - started
  assert.equal(results.cleanup_category, "child_cleanup_timeout")
  assert.equal(results.cleanup, false)
  assert.equal(results.status, "FAIL")
  assert.ok(elapsed <= cleanupMs + 3_000, `cleanup wall time ${elapsed}ms must stay within budget`)
})

test("absolute budget: git status that would exceed remaining → git_status_timeout within budget", async () => {
  const cleanupMs = 250
  const m = makeDeps({ realClock: true, cleanupMs, gitStatusAsyncSlow: true })
  const started = Date.now()
  const { results } = await runHermeticSmoke(m.deps)
  const elapsed = Date.now() - started
  assert.equal(results.cleanup_category, "git_status_timeout")
  assert.equal(results.cleanup, false)
  assert.equal(results.status, "FAIL")
  assert.ok(elapsed <= cleanupMs + 3_000, `cleanup wall time ${elapsed}ms must stay within budget`)
})

// ─── signal state machine (unit level; real subprocess tests separate) ──

test("signal DURING run triggers orderly cleanup + exit 143, root removed", async () => {
  const m = makeDeps()
  let handler: ((sig: string) => void) | undefined
  m.deps.installSignalHandlers = (h: (sig: string) => void) => {
    handler = h
    return () => {}
  }
  // Pause right after the (already published) owned root, so the signal interleaves
  // before the build — exactly the root-init window the real subprocess test drives.
  ;(m.deps as { hooks?: unknown }).hooks = {
    afterRootReady: (signal: AbortSignal) =>
      new Promise<void>((r) => {
        const t = setTimeout(r, 5_000)
        signal?.addEventListener("abort", () => { clearTimeout(t); r() }, { once: true })
      }),
  }
  const runP = runHermeticSmoke(m.deps)
  await new Promise((r) => setTimeout(r, 5))
  handler!("SIGTERM")
  const res = await runP
  assert.equal(m.fs.dirs.size, 0, "root removed on signal")
  assert.equal(res.exitCode, 143, "signal exit code 143 selected")
  assert.equal(res.ok, false)
})

test("generated secret is at least the required byte length", async () => {
  const m = makeDeps()
  await runHermeticSmoke(m.deps)
  const line = m.writes.find((w) => w.path.endsWith(".dev.vars"))!.data.split("\n").find((l) => l.startsWith("JWT_AUTH_SECRET="))!
  assert.ok(Buffer.byteLength(JSON.parse(line.slice("JWT_AUTH_SECRET=".length)), "utf8") >= MIN_SECRET_BYTES)
})
