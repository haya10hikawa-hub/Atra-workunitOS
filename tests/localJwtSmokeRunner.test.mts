import test from "node:test"
import assert from "node:assert/strict"
import {
  runHermeticSmoke,
  createOwnedPathRegistry,
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

// ─── in-memory dependency doubles ───────────────────────────────────
//
// Every side effect (fs, build, spawn, HTTP, D1, git) is injected so the state
// machine runs with NO real I/O. `buildWorker` is mocked to a runner-owned bundle;
// real `generateLocalJwt`/`verifyLocalJwt` exercise JWT authority for real. The one
// live integration run lives in the smoke command (`npm run auth:jwt:smoke-local`).

const HEAD = "1111111111111111111111111111111111111111"
const MOCK_WRANGLER_JSON = JSON.stringify({
  main: ".open-next/worker.js",
  assets: { directory: ".open-next/assets", binding: "ASSETS" },
  vars: { PERSISTENCE_MODE: "d1" },
  d1_databases: [{ binding: "CONTROL_DB", database_name: "workunit-control-db", database_id: "X" }],
})

interface MockOptions {
  buildHead?: string
  expectedHead?: string
  buildThrows?: string
  bootstrap?: () => { ok: boolean; reason?: string; counts?: Record<string, number> }
  queryD1?: () => Array<Record<string, unknown>>
  queryThrowsTimedOut?: boolean
  fetchStatusFor?: (kind: "none" | "hs256" | "rs256" | "expired" | "readiness") => number
  fetchThrows?: boolean
  chmodThrows?: boolean
  spawnThrows?: boolean
  isAliveForever?: boolean
  portReleased?: boolean
  gitStatusSequence?: Array<string | null>
  operatorHashSequence?: Array<string | null>
  fixedSecret?: string
  totalMs?: number
  configMainOutsideRoot?: boolean
}

function b64urlJson(seg: string): { alg?: string; exp?: number } {
  return JSON.parse(Buffer.from(seg, "base64url").toString("utf8"))
}

function makeDeps(opts: MockOptions = {}) {
  const existing = new Set<string>()
  const writes: Array<{ path: string; mode?: number; data: string }> = []
  const rms: string[] = []
  const kills: Array<{ pid: number; signal: string }> = []
  const closedFds: number[] = []
  const spawns: string[][] = []
  let spawnCount = 0
  const alive = new Set<number>()
  const gitSeq = opts.gitStatusSequence ?? ["CONST", "CONST"]
  let gitIdx = 0
  const opHashSeq = opts.operatorHashSequence ?? ["OPHASH", "OPHASH"]
  let opHashIdx = 0
  const logLines: string[] = []
  let clock = 1_000_000

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
    tmpdir: () => "/mock-tmp",
    timeouts: { readinessMs: 2_000, pollIntervalMs: 10, stopGraceMs: 50, httpMs: 500, totalMs: opts.totalMs ?? 60_000 },
    fs: {
      mkdtemp: async (prefix: string) => {
        const p = `${prefix}abc123`
        existing.add(p)
        return p
      },
      mkdir: async (p: string) => {
        existing.add(p)
      },
      writeFile: async (p: string, data: string, o?: { mode?: number }) => {
        writes.push({ path: p, mode: o?.mode, data })
        existing.add(p)
      },
      chmod: async () => {
        if (opts.chmodThrows) throw new Error("injected_chmod_failure")
      },
      rm: async (p: string) => {
        rms.push(p)
        for (const e of [...existing]) if (e === p || e.startsWith(p + "/")) existing.delete(e)
      },
      readFile: async (p: string) => {
        if (p.endsWith("wrangler.json")) return MOCK_WRANGLER_JSON
        return ""
      },
      existsSync: (p: string) => existing.has(p),
    },
    openLogFd: () => 7,
    closeFd: (fd: number) => {
      closedFds.push(fd)
    },
    randomBytes: (n: number) => (opts.fixedSecret ? Buffer.from(opts.fixedSecret.padEnd(n, "A").slice(0, n)) : Buffer.alloc(n, 3)),
    hashFile: () => "x",
    gitHead: () => opts.expectedHead ?? HEAD,
    gitStatus: () => (gitIdx < gitSeq.length ? gitSeq[gitIdx++] : gitSeq[gitSeq.length - 1]),
    hashOperatorArtifact: () => (opHashIdx < opHashSeq.length ? opHashSeq[opHashIdx++] : opHashSeq[opHashSeq.length - 1]),
    buildWorker: async ({ root }: { root: string }) => {
      if (opts.buildThrows) {
        const { SmokeError } = await import("../scripts/lib/localJwtSmokeRunner.mjs")
        throw new SmokeError(opts.buildThrows)
      }
      const snapshotDir = `${root}/src`
      const workerPath = opts.configMainOutsideRoot ? "/repo/.open-next/worker.js" : `${snapshotDir}/.open-next/worker.js`
      existing.add(snapshotDir)
      existing.add(workerPath)
      return {
        snapshotDir,
        workerPath,
        assetsPath: `${snapshotDir}/.open-next/assets`,
        wranglerJsonPath: `${snapshotDir}/wrangler.json`,
        builtHead: opts.buildHead ?? HEAD,
      }
    },
    pickPort: async () => 40000 + spawnCount,
    isPortFree: async () => opts.portReleased ?? true,
    spawn: (_bin: string, args: string[]) => {
      spawnCount++
      spawns.push(args)
      if (opts.spawnThrows) throw new Error("injected_spawn_failure")
      const pid = 5000 + spawnCount
      alive.add(pid)
      const handlers: Record<string, () => void> = {}
      return {
        pid,
        on: (ev: string, cb: () => void) => {
          handlers[ev] = cb
        },
      }
    },
    killProcess: (pid: number, signal: string) => {
      kills.push({ pid, signal })
      if (!opts.isAliveForever) alive.delete(Math.abs(pid))
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
    now: () => (clock += 5),
    sleep: async () => {},
    log: (line: string) => logLines.push(line),
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
  return { deps, writes, rms, kills, spawns, closedFds, logLines }
}

// ─── pure helpers ───────────────────────────────────────────────────

test("owned-path registry only tracks what it registered", () => {
  const r = createOwnedPathRegistry()
  r.register("/a/root", "root")
  r.register("/a/root/.dev.vars", "env")
  assert.equal(r.has("/a/root/.dev.vars"), true)
  assert.equal(r.has("/operator/.dev.vars"), false)
})

test("hermetic env is fully fail-closed and local-only", () => {
  const env = buildHermeticEnv("s".repeat(40), "nonce")
  assert.equal(env.AUTH_ADAPTER, "jwt")
  assert.match(env.CF_D1_BOOTSTRAP_IDENTITY_EMAIL, /@example\.invalid$/)
  for (const flag of HERMETIC_FALSE_FLAGS) assert.equal(env[flag], "false")
})

test("buildHermeticConfig points main/assets at the runner-owned bundle", () => {
  const cfg = JSON.parse(buildHermeticConfig(MOCK_WRANGLER_JSON, "/tmp/root/src/.open-next/worker.js", "/tmp/root/src/.open-next/assets"))
  assert.equal(cfg.main, "/tmp/root/src/.open-next/worker.js")
  assert.equal(cfg.assets.directory, "/tmp/root/src/.open-next/assets")
})

test("buildRs256Token relabels the header alg without touching payload/signature", () => {
  const rs = buildRs256Token("aaa.bbb.ccc")
  const [h, p, s] = rs.split(".")
  assert.equal(b64urlJson(h).alg, "RS256")
  assert.equal(p, "bbb")
  assert.equal(s, "ccc")
})

test("alignmentSql is COUNT-only and never selects a raw value column", () => {
  const sql = alignmentSql(buildHermeticEnv("s".repeat(40), "n"))
  assert.match(sql, /COUNT\(\*\)/)
  assert.doesNotMatch(sql, /SELECT provider_subject|SELECT email/)
})

test("evaluateProof requires the exact HTTP shape AND the build-source proofs", () => {
  const good = {
    no_jwt_status: 401, hs256_status: 200, work_units_key: true, rs256_status: 401, expired_status: 401,
    jwt_authority_aligned: true, d1_alignment: true, worker_source_match: true, worker_bundle_owned: true,
  }
  assert.equal(evaluateProof(good), true)
  assert.equal(evaluateProof({ ...good, worker_source_match: false }), false)
  assert.equal(evaluateProof({ ...good, hs256_status: 500 }), false)
})

test("formatResults emits only safe keys, never an unknown key", () => {
  const out = formatResults({ status: "PASS", hs256_status: 200, secret_field: "SUPERSECRET" })
  assert.match(out, /status=PASS/)
  assert.equal(out.includes("SUPERSECRET"), false)
  for (const line of out.trim().split("\n")) assert.ok(SAFE_RESULT_KEYS.includes(line.split("=")[0]))
})

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
  assert.equal(results.work_units_key, true)
  assert.equal(results.rs256_status, 401)
  assert.equal(results.expired_status, 401)
  assert.equal(results.jwt_authority_aligned, true)
  assert.equal(results.d1_alignment, true)
  assert.equal(results.cleanup, true)
  assert.equal(results.operator_build_artifact_untouched, true)
})

test("invariant: status=PASS is impossible when cleanup fails", async () => {
  const m = makeDeps({ portReleased: false }) // cleanup fails: port not released
  const { ok, results } = await runHermeticSmoke(m.deps)
  assert.equal(results.port_released, false)
  assert.equal(results.cleanup, false)
  assert.equal(results.status, "FAIL")
  assert.equal(ok, false)
})

test("secret + JWT never appear in runner stdout", async () => {
  const raw = "KNOWN-RAW-BYTES-FOR-LEAK-TEST-PADDED-TO-48-CHARS"
  const m = makeDeps({ fixedSecret: raw })
  await runHermeticSmoke(m.deps)
  const actualSecret = Buffer.from(raw.padEnd(48, "A").slice(0, 48)).toString("base64url")
  const out = m.logLines.join("")
  assert.equal(out.includes(actualSecret), false)
  assert.doesNotMatch(out, /[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/)
  const envWrite = m.writes.find((w) => w.path.endsWith(".dev.vars"))
  assert.ok(envWrite)
  assert.equal(envWrite!.mode, 0o600)
  assert.equal(envWrite!.data.includes(actualSecret), true)
})

test("temp config points main at the runner-owned bundle, never the operator .open-next", async () => {
  const m = makeDeps()
  await runHermeticSmoke(m.deps)
  const cfgWrite = m.writes.find((w) => w.path.endsWith("wrangler.hermetic.json"))!
  const cfg = JSON.parse(cfgWrite.data)
  assert.match(cfg.main, /\/mock-tmp\/atra-jwt-smoke-[^/]+\/src\/\.open-next\/worker\.js$/)
  assert.equal(cfg.main.startsWith("/repo/.open-next"), false)
})

test("owned root is registered BEFORE chmod: a chmod failure still cleans up", async () => {
  const m = makeDeps({ chmodThrows: true })
  const { results } = await runHermeticSmoke(m.deps)
  assert.equal(results.status, "FAIL")
  assert.ok(m.rms.some((p) => p.startsWith("/mock-tmp/atra-jwt-smoke-")), "root removed despite chmod failure")
})

test("child is stopped by its exact process group, never by name", async () => {
  const m = makeDeps()
  await runHermeticSmoke(m.deps)
  assert.ok(m.kills.some((k) => k.pid === -5001), "process-group signal expected")
  assert.ok(m.kills.every((k) => Math.abs(k.pid) === 5001), "only the owned pid is ever signalled")
})

test("cleanup removes only the registered temp root, never an operator path", async () => {
  const m = makeDeps()
  await runHermeticSmoke(m.deps)
  assert.ok(m.rms.length >= 1)
  for (const p of m.rms) assert.ok(p.startsWith("/mock-tmp/atra-jwt-smoke-"), `rm touched non-owned path: ${p}`)
})

test("repeated invocations use independent temp roots and both pass", async () => {
  const a = makeDeps()
  const b = makeDeps()
  assert.equal((await runHermeticSmoke(a.deps)).ok, true)
  assert.equal((await runHermeticSmoke(b.deps)).ok, true)
})

// ─── build-freshness proofs ─────────────────────────────────────────

test("a stale/mismatched bundle (built head != expected head) cannot pass", async () => {
  const m = makeDeps({ buildHead: "deadbeef", expectedHead: HEAD })
  const { ok, results } = await runHermeticSmoke(m.deps)
  assert.equal(results.worker_source_match, false)
  assert.equal(results.status, "FAIL")
  assert.equal(ok, false)
})

test("a bundle outside the runner-owned root is not accepted as owned", async () => {
  const m = makeDeps({ configMainOutsideRoot: true })
  const { results } = await runHermeticSmoke(m.deps)
  assert.equal(results.worker_bundle_owned, false)
  assert.equal(results.status, "FAIL")
})

test("operator build artifact drift (hash changes across the run) fails closed", async () => {
  const m = makeDeps({ operatorHashSequence: ["OPHASH", "DIFFERENT"] })
  const { results } = await runHermeticSmoke(m.deps)
  assert.equal(results.operator_build_artifact_untouched, false)
  assert.equal(results.cleanup, false)
  assert.equal(results.status, "FAIL")
})

// ─── failure injection: cleanup must always run ─────────────────────

async function assertCleanedUp(m: ReturnType<typeof makeDeps>, res: { ok: boolean; results: Record<string, unknown> }, category?: string) {
  assert.equal(res.results.status, "FAIL")
  assert.equal(res.ok, false)
  if (category) assert.equal(res.results.error_category, category)
  assert.ok(m.rms.some((p: string) => p.startsWith("/mock-tmp/atra-jwt-smoke-")), "owned root removed")
}

test("failure @ Worker build (failure) cleans up", async () => {
  const m = makeDeps({ buildThrows: "build_failed" })
  await assertCleanedUp(m, await runHermeticSmoke(m.deps), "build_failed")
})

test("failure @ Worker build (timeout) cleans up", async () => {
  const m = makeDeps({ buildThrows: "build_timeout" })
  await assertCleanedUp(m, await runHermeticSmoke(m.deps), "build_timeout")
})

test("failure @ bootstrap hang (timeout) cleans up", async () => {
  const m = makeDeps({ bootstrap: () => ({ ok: false, reason: "bootstrap_timeout" }) })
  await assertCleanedUp(m, await runHermeticSmoke(m.deps), "bootstrap_timeout")
})

test("failure @ bootstrap (failure) cleans up", async () => {
  const m = makeDeps({ bootstrap: () => ({ ok: false, reason: "manifest_invalid" }) })
  const res = await runHermeticSmoke(m.deps)
  await assertCleanedUp(m, res)
})

test("failure @ D1 query hang (timeout) cleans up", async () => {
  const m = makeDeps({ queryThrowsTimedOut: true })
  await assertCleanedUp(m, await runHermeticSmoke(m.deps), "d1_query_timeout")
})

test("failure @ HTTP request hang cleans up", async () => {
  const m = makeDeps({ fetchThrows: true })
  // fetch throws during readiness → worker never ready → readiness_timeout
  const res = await runHermeticSmoke(m.deps)
  assert.equal(res.results.status, "FAIL")
  assert.ok(m.rms.some((p) => p.startsWith("/mock-tmp/atra-jwt-smoke-")))
})

test("failure @ child spawn throwing synchronously cleans up + closes log fd", async () => {
  const m = makeDeps({ spawnThrows: true })
  const res = await runHermeticSmoke(m.deps)
  await assertCleanedUp(m, res, "worker_start_failed")
  assert.ok(m.closedFds.includes(7), "log descriptor closed after spawn failure")
})

test("failure @ global deadline expiration cleans up", async () => {
  const m = makeDeps({ totalMs: 0 })
  await assertCleanedUp(m, await runHermeticSmoke(m.deps), "total_deadline_exceeded")
})

test("failure @ cleanup (child cannot be stopped) → status FAIL", async () => {
  const m = makeDeps({ isAliveForever: true })
  const { results } = await runHermeticSmoke(m.deps)
  assert.equal(results.wrangler_process_stopped, false)
  assert.equal(results.cleanup, false)
  assert.equal(results.status, "FAIL")
})

test("unavailable git status (null) fails closed — not treated as unchanged", async () => {
  const m = makeDeps({ gitStatusSequence: [null, null] })
  const { results } = await runHermeticSmoke(m.deps)
  assert.equal(results.repository_status_unchanged, false)
  assert.equal(results.cleanup, false)
  assert.equal(results.status, "FAIL")
})

test("repository drift (status differs) fails closed", async () => {
  const m = makeDeps({ gitStatusSequence: ["BEFORE", "AFTER-DRIFT"] })
  const { results } = await runHermeticSmoke(m.deps)
  assert.equal(results.repository_status_unchanged, false)
  assert.equal(results.status, "FAIL")
})

test("port not released → cleanup fails → status FAIL", async () => {
  const m = makeDeps({ portReleased: false })
  const { results } = await runHermeticSmoke(m.deps)
  assert.equal(results.port_released, false)
  assert.equal(results.status, "FAIL")
})

test("generated secret is at least the required byte length", async () => {
  const m = makeDeps()
  await runHermeticSmoke(m.deps)
  const envWrite = m.writes.find((w) => w.path.endsWith(".dev.vars"))!
  const line = envWrite.data.split("\n").find((l) => l.startsWith("JWT_AUTH_SECRET="))!
  const value = JSON.parse(line.slice("JWT_AUTH_SECRET=".length))
  assert.ok(Buffer.byteLength(value, "utf8") >= MIN_SECRET_BYTES)
})
