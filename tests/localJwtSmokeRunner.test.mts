import test from "node:test"
import assert from "node:assert/strict"
import {
  runHermeticSmoke,
  createOwnedPathRegistry,
  buildHermeticEnv,
  buildHermeticConfig,
  buildRs256Token,
  alignmentSql,
  evaluatePass,
  formatResults,
  SAFE_RESULT_KEYS,
  HERMETIC_FALSE_FLAGS,
  MIN_SECRET_BYTES,
} from "../scripts/lib/localJwtSmokeRunner.mjs"
import { generateLocalJwt, verifyLocalJwt } from "../scripts/lib/localJwt.mjs"

// ─── in-memory dependency doubles ───────────────────────────────────
//
// Every side effect (fs, spawn, HTTP, D1, git) is injected so the state machine
// runs with NO real I/O. Real `generateLocalJwt`/`verifyLocalJwt` are pure, so JWT
// authority alignment is exercised for real. The one live integration run lives in
// the smoke command itself (`npm run auth:jwt:smoke-local`).

const MOCK_WRANGLER_JSON = JSON.stringify({
  main: ".open-next/worker.js",
  assets: { directory: ".open-next/assets", binding: "ASSETS" },
  vars: { PERSISTENCE_MODE: "d1" },
  d1_databases: [{ binding: "CONTROL_DB", database_name: "workunit-control-db", database_id: "X" }],
})

type SpawnPlan = "ready" | "exit-then-ready" | "always-exit"

interface MockOptions {
  spawn?: SpawnPlan
  bootstrap?: () => { ok: boolean; reason?: string; counts?: Record<string, number> }
  queryD1?: () => Array<Record<string, unknown>>
  fetchStatusFor?: (kind: "none" | "hs256" | "rs256" | "expired" | "readiness") => number
  writeFileThrowsOn?: string
  fixedSecret?: string
  timeouts?: Record<string, number>
  gitStatusSequence?: string[]
}

function b64urlJson(seg: string): { alg?: string; exp?: number } {
  return JSON.parse(Buffer.from(seg, "base64url").toString("utf8"))
}

function makeDeps(opts: MockOptions = {}) {
  const existing = new Set<string>()
  const writes: Array<{ path: string; mode?: number; data: string }> = []
  const rms: string[] = []
  const kills: Array<{ pid: number; signal: string }> = []
  const spawns: string[][] = []
  let clock = 1_000_000
  let spawnCount = 0
  const gitSeq = opts.gitStatusSequence ?? []
  let gitIdx = 0
  const logLines: string[] = []
  const alive = new Set<number>()

  const classify = (token: string | null, nowMs: number): number => {
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
    if (typeof payload.exp === "number" && payload.exp * 1000 < nowMs) return opts.fetchStatusFor?.("expired") ?? 401
    return opts.fetchStatusFor?.("hs256") ?? 200
  }

  const deps = {
    repoRoot: "/repo",
    wranglerBin: "/repo/node_modules/.bin/wrangler",
    tmpdir: () => "/mock-tmp",
    timeouts: { readinessMs: 2_000, pollIntervalMs: 10, stopGraceMs: 50, totalMs: 5_000, ...(opts.timeouts ?? {}) },
    fs: {
      mkdtemp: async (prefix: string) => {
        const p = `${prefix}abc123`
        existing.add(p)
        return p
      },
      writeFile: async (p: string, data: string, o?: { mode?: number }) => {
        if (opts.writeFileThrowsOn && p.endsWith(opts.writeFileThrowsOn)) throw new Error("injected_write_failure")
        writes.push({ path: p, mode: o?.mode, data })
        existing.add(p)
      },
      chmod: async () => {},
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
    closeFd: () => {},
    randomBytes: (n: number) => (opts.fixedSecret ? Buffer.from(opts.fixedSecret.padEnd(n, "A").slice(0, n)) : Buffer.alloc(n, 3)),
    pickPort: async () => 40000 + spawnCount,
    isPortFree: async () => true,
    spawn: (_bin: string, args: string[]) => {
      spawnCount++
      spawns.push(args)
      const pid = 5000 + spawnCount
      alive.add(pid)
      const handlers: Record<string, () => void> = {}
      const plan = opts.spawn ?? "ready"
      const willExit = plan === "always-exit" || (plan === "exit-then-ready" && spawnCount === 1)
      if (willExit) queueMicrotask(() => handlers["exit"]?.())
      return {
        pid,
        on: (ev: string, cb: () => void) => {
          handlers[ev] = cb
        },
      }
    },
    killProcess: (pid: number, signal: string) => {
      kills.push({ pid, signal })
      alive.delete(Math.abs(pid))
      return true
    },
    isAlive: (pid: number) => alive.has(pid),
    fetchImpl: async (url: string, o?: { headers?: Record<string, string> }) => {
      const auth = o?.headers?.authorization
      const plan = opts.spawn ?? "ready"
      // While a doomed child is up, the server is unreachable.
      if ((plan === "always-exit") || (plan === "exit-then-ready" && spawnCount === 1)) {
        throw new Error("ECONNREFUSED")
      }
      if (!auth) {
        const s = opts.fetchStatusFor?.("readiness") ?? 401
        return { status: s, json: async () => ({}) }
      }
      const token = auth.replace(/^Bearer /, "")
      const status = classify(token, clock)
      return { status, json: async () => (status === 200 ? { workUnits: [] } : { error: "x" }) }
    },
    now: () => (clock += 30),
    sleep: async () => {},
    log: (line: string) => logLines.push(line),
    generateLocalJwt,
    verifyLocalJwt,
    runBootstrap: async () => (opts.bootstrap ? opts.bootstrap() : { ok: true, counts: { tenants: 1, tenant_databases: 1, users: 1, tenant_memberships: 1, auth_identities: 1 } }),
    queryD1: async () => (opts.queryD1 ? opts.queryD1() : [{ identity_match: 1, user_email_match: 1, active_membership: 1, active_tenant: 1 }]),
    gitStatus: () => (gitSeq.length ? gitSeq[Math.min(gitIdx++, gitSeq.length - 1)] : "CONST"),
  }
  return { deps, writes, rms, kills, spawns, logLines }
}

// ─── pure helpers ───────────────────────────────────────────────────

test("owned-path registry only tracks what it registered", () => {
  const r = createOwnedPathRegistry()
  r.register("/a/root", "root")
  r.register("/a/root/.dev.vars", "env")
  assert.equal(r.has("/a/root/.dev.vars"), true)
  assert.equal(r.has("/operator/.dev.vars"), false)
  assert.equal(r.list().length, 2)
})

test("hermetic env is fully fail-closed and local-only", () => {
  const env = buildHermeticEnv("s".repeat(40), "nonce")
  assert.equal(env.AUTH_ADAPTER, "jwt")
  assert.equal(env.CF_D1_BOOTSTRAP_IDENTITY_PROVIDER, "jwt")
  assert.match(env.CF_D1_BOOTSTRAP_IDENTITY_EMAIL, /@example\.invalid$/)
  for (const flag of HERMETIC_FALSE_FLAGS) assert.equal(env[flag], "false")
})

test("buildHermeticConfig rewrites main/assets to absolute repo paths", () => {
  const cfg = JSON.parse(buildHermeticConfig(MOCK_WRANGLER_JSON, "/repo"))
  assert.equal(cfg.main, "/repo/.open-next/worker.js")
  assert.equal(cfg.assets.directory, "/repo/.open-next/assets")
  assert.ok(Array.isArray(cfg.d1_databases))
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

test("evaluatePass requires the exact 401/200/401/401 shape", () => {
  const good = { no_jwt_status: 401, hs256_status: 200, work_units_key: true, rs256_status: 401, expired_status: 401, jwt_authority_aligned: true, d1_alignment: true }
  assert.equal(evaluatePass(good), true)
  assert.equal(evaluatePass({ ...good, hs256_status: 500 }), false)
  assert.equal(evaluatePass({ ...good, rs256_status: 200 }), false)
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
  assert.equal(results.no_jwt_status, 401)
  assert.equal(results.hs256_status, 200)
  assert.equal(results.work_units_key, true)
  assert.equal(results.rs256_status, 401)
  assert.equal(results.expired_status, 401)
  assert.equal(results.jwt_authority_aligned, true)
  assert.equal(results.d1_alignment, true)
  assert.equal(results.worker_and_bootstrap_share_local_d1, true)
  assert.equal(results.cleanup, true)
  // every cleanup sub-proof holds
  for (const k of ["wrangler_process_stopped", "temporary_env_removed", "temporary_config_removed", "temporary_tokens_removed", "temporary_d1_state_removed", "temporary_logs_removed", "port_released", "repository_status_unchanged"]) {
    assert.equal(results[k], true, k)
  }
})

test("secret + JWT never appear in runner stdout", async () => {
  const raw = "KNOWN-RAW-BYTES-FOR-LEAK-TEST-PADDED-TO-48-CHARS"
  const m = makeDeps({ fixedSecret: raw })
  await runHermeticSmoke(m.deps)
  // The actual secret is the base64url of the 48 random bytes (derived identically).
  const actualSecret = Buffer.from(raw.padEnd(48, "A").slice(0, 48)).toString("base64url")
  const out = m.logLines.join("")
  assert.equal(out.includes(actualSecret), false)
  // no JWT (3 base64url segments) leaked to stdout
  assert.doesNotMatch(out, /[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/)
  // .dev.vars WAS written 0600 and DID carry the secret (that is correct + expected)
  const envWrite = m.writes.find((w) => w.path.endsWith(".dev.vars"))
  assert.ok(envWrite)
  assert.equal(envWrite!.mode, 0o600)
  assert.equal(envWrite!.data.includes(actualSecret), true)
})

test("temp config + .dev.vars are written mode 0600", async () => {
  const m = makeDeps()
  await runHermeticSmoke(m.deps)
  for (const suffix of [".dev.vars", "wrangler.hermetic.json"]) {
    const w = m.writes.find((x) => x.path.endsWith(suffix))
    assert.ok(w, suffix)
    assert.equal(w!.mode, 0o600, suffix)
  }
})

test("child is stopped by its exact process group, never by name", async () => {
  const m = makeDeps()
  await runHermeticSmoke(m.deps)
  // spawned pid is 5001 (first attempt); group kill uses -pid
  assert.ok(m.kills.some((k) => k.pid === -5001), "process-group SIGTERM expected")
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
  const r1 = await runHermeticSmoke(a.deps)
  const r2 = await runHermeticSmoke(b.deps)
  assert.equal(r1.ok, true)
  assert.equal(r2.ok, true)
  // each run rm'd its own root; nothing shared
  assert.ok(a.rms.every((p) => p.startsWith("/mock-tmp/atra-jwt-smoke-")))
})

test("port collision before bind: retries a fresh port and still passes", async () => {
  const m = makeDeps({ spawn: "exit-then-ready" })
  const { ok, results } = await runHermeticSmoke(m.deps)
  assert.equal(ok, true)
  assert.equal(results.status, "PASS")
  assert.ok(m.spawns.length >= 2, "expected a retry spawn after the raced port")
})

// ─── failure injection: cleanup must always run ─────────────────────

async function assertCleanedUpAfterFailure(m: ReturnType<typeof makeDeps>, res: { ok: boolean; results: Record<string, unknown> }) {
  assert.equal(res.results.status, "FAIL")
  assert.equal(res.ok, false)
  assert.equal(res.results.cleanup, true, "cleanup must run after failure")
  // owned temp root was removed
  assert.ok(m.rms.some((p: string) => p.startsWith("/mock-tmp/atra-jwt-smoke-")))
}

test("failure @ temp-config creation still cleans up", async () => {
  const m = makeDeps({ writeFileThrowsOn: "wrangler.hermetic.json" })
  const res = await runHermeticSmoke(m.deps)
  await assertCleanedUpAfterFailure(m, res)
})

test("failure @ bootstrap still cleans up", async () => {
  const m = makeDeps({ bootstrap: () => ({ ok: false, reason: "manifest_unreadable" }) })
  const res = await runHermeticSmoke(m.deps)
  await assertCleanedUpAfterFailure(m, res)
})

test("failure @ wrangler startup still cleans up", async () => {
  const m = makeDeps({ spawn: "always-exit" })
  const res = await runHermeticSmoke(m.deps)
  await assertCleanedUpAfterFailure(m, res)
  assert.equal(res.results.error_category, "worker_start_failed")
})

test("failure @ readiness timeout still cleans up", async () => {
  const m = makeDeps({ fetchStatusFor: () => 0, timeouts: { readinessMs: 40 } })
  // readiness: make fetch reject during polling by using a plan that never readies
  m.deps.fetchImpl = async () => {
    throw new Error("ECONNREFUSED")
  }
  const res = await runHermeticSmoke(m.deps)
  await assertCleanedUpAfterFailure(m, res)
  assert.equal(res.results.error_category, "readiness_timeout")
})

test("failure @ valid-JWT HTTP assertion (500) fails closed and cleans up", async () => {
  const m = makeDeps({ fetchStatusFor: (k) => (k === "hs256" ? 500 : k === "none" || k === "readiness" ? 401 : 401) })
  const res = await runHermeticSmoke(m.deps)
  assert.equal(res.results.hs256_status, 500)
  await assertCleanedUpAfterFailure(m, res)
})

test("failure @ D1 alignment query still cleans up", async () => {
  const m = makeDeps()
  m.deps.queryD1 = async () => {
    throw new Error("align_json_unparseable")
  }
  const res = await runHermeticSmoke(m.deps)
  await assertCleanedUpAfterFailure(m, res)
})

test("repository_status_unchanged is false if git status drifts during the run", async () => {
  const m = makeDeps({ gitStatusSequence: ["BEFORE", "AFTER-DRIFT"] })
  const res = await runHermeticSmoke(m.deps)
  assert.equal(res.results.repository_status_unchanged, false)
  assert.equal(res.results.cleanup, false)
})

test("generated secret is at least the required byte length", async () => {
  const m = makeDeps()
  await runHermeticSmoke(m.deps)
  const envWrite = m.writes.find((w) => w.path.endsWith(".dev.vars"))!
  const line = envWrite.data.split("\n").find((l) => l.startsWith("JWT_AUTH_SECRET="))!
  const value = JSON.parse(line.slice("JWT_AUTH_SECRET=".length))
  assert.ok(Buffer.byteLength(value, "utf8") >= MIN_SECRET_BYTES)
})
