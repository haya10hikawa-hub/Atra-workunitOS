// Hermetic local JWT/D1 HTTP smoke runner (testable core).
//
// ── Current-source, runner-owned build isolation ──
// A smoke run must never silently consume the operator's repository-root
// `.open-next/worker.js` (which may be stale) and must never create/modify repo
// build state. OpenNext's build derives its app dir from `process.cwd()` and
// writes BOTH `.next` and `.open-next` there, so its output cannot be safely
// redirected. Instead the runner snapshots the EXACT current HEAD with
// `git archive HEAD` into its own temp root, copy-on-write clones the installed
// `node_modules` into the snapshot (a real directory, so Next infers the correct
// workspace root; CoW isolates any build-time write so the operator tree is never
// modified; cleanup `rm -rf` frees the clone), and builds the Worker INSIDE that
// snapshot. The temp wrangler config then points only at the snapshot's
// `.open-next`. The operator `.open-next` is never read, written, or created.
//
// ── Signal-safe ownership ──
// One private temp root (mode 0700) is published ATOMICALLY (synchronous create →
// chmod → 0600 ownership marker → marker verify → register) so no signal can
// observe a half-initialized, unremovable root. Every long-running operation
// (git archive, tar, node_modules copy, OpenNext build, wrangler D1, wrangler dev)
// runs as a DETACHED child in its own process group, registered in a central child
// registry the instant it spawns and unregistered only on confirmed exit. A signal
// (SIGINT→130 / SIGTERM→143) terminates every live owned group, runs bounded
// cleanup, then exits; a second signal force-kills all groups but deletes no
// unverified path. No process is ever killed by name.
//
// ── One global deadline + bounded cleanup ──
// `deadline = start + totalMs` bounds every blocking step. Cleanup has its own
// `cleanupMs` budget with stable timeout categories (child_cleanup_timeout /
// root_removal_timeout / port_release_timeout → cleanup_timeout).
//
// ── Fail-closed status ──
// `status=PASS` requires BOTH the proof gate and cleanup to pass, so `status=PASS`
// with `cleanup=false` is impossible.

import { join } from "node:path"

/** Byte length required of the generated local HS256 secret. */
export const MIN_SECRET_BYTES = 32
/** Keys the runner writes into its private `.dev.vars`. */
export const HERMETIC_FALSE_FLAGS = Object.freeze([
  "ALLOW_DEV_SESSION",
  "ALLOW_DEV_CONTROLLESS_SESSION",
  "ALLOW_DEV_WORKSPACE_BOOTSTRAP",
  "ALLOW_IN_MEMORY_PERSISTENCE",
  "ALLOW_IN_MEMORY_APPROVAL_STORE",
  "ALLOW_MOCK_LLM",
])

/** The safe, machine-readable keys printed on stdout (never a secret or value). */
export const SAFE_RESULT_KEYS = Object.freeze([
  "status",
  "worker_source_match",
  "worker_bundle_owned",
  "no_jwt_status",
  "hs256_status",
  "work_units_key",
  "rs256_status",
  "expired_status",
  "jwt_authority_aligned",
  "d1_alignment",
  "cleanup",
])

export class SmokeError extends Error {
  constructor(category) {
    super(category)
    this.name = "SmokeError"
    this.category = category
  }
}

// ─── owned-path registry ────────────────────────────────────────────
//
// The runner may ONLY remove a path it registered as created by THIS invocation.

export function createOwnedPathRegistry() {
  const entries = []
  return {
    register(path, kind) {
      entries.push({ path, kind })
      return path
    },
    list() {
      return entries.map((e) => ({ ...e }))
    },
    has(path) {
      return entries.some((e) => e.path === path)
    },
  }
}

// ─── central owned-child registry ───────────────────────────────────
//
// Every detached child (process-group leader, so pgid === pid) is registered the
// instant it spawns and marked settled only on confirmed exit. Signal + cleanup
// iterate `live()` and kill each group; no process is ever matched by name.

export function createChildRegistry() {
  const entries = []
  return {
    register(kind, child) {
      const entry = { kind, pid: child?.pid ?? null, pgid: child?.pid ?? null, started: Date.now(), settled: false, child }
      entries.push(entry)
      return entry
    },
    markSettled(child) {
      for (const e of entries) if (e.child === child) e.settled = true
    },
    live() {
      return entries.filter((e) => !e.settled && typeof e.pid === "number")
    },
    all() {
      return entries.map((e) => ({ kind: e.kind, pid: e.pid, pgid: e.pgid, started: e.started, settled: e.settled }))
    },
  }
}

// ─── synthetic, local-only identity ─────────────────────────────────

/**
 * Build the in-memory hermetic auth env. Secret + identity are synthetic.
 * @param {string} secret
 * @param {string} nonce
 * @returns {Record<string, string>}
 */
export function buildHermeticEnv(secret, nonce) {
  return {
    AUTH_ADAPTER: "jwt",
    JWT_AUTH_SECRET: secret,
    JWT_AUTH_ISSUER: "workunit-os",
    JWT_AUTH_AUDIENCE: "workunit-os-api",
    LOCAL_JWT_TTL_SECONDS: "300",
    CF_D1_BOOTSTRAP_IDENTITY_PROVIDER: "jwt",
    CF_D1_BOOTSTRAP_IDENTITY_SUBJECT: `hermetic-smoke:${nonce}`,
    // Non-routable `.invalid` address — can never reach a real mailbox.
    CF_D1_BOOTSTRAP_IDENTITY_EMAIL: `hermetic-${nonce}@example.invalid`,
    PERSISTENCE_MODE: "d1",
    EXTERNAL_ACTIONS_ENABLED: "false",
    ALLOW_LEGACY_INGEST_FALLBACK: "false",
    ...Object.fromEntries(HERMETIC_FALSE_FLAGS.map((k) => [k, "false"])),
  }
}

/** Render an env object as dotenv lines (values are quoted; no inline comments). */
export function renderDevVars(env) {
  return (
    Object.entries(env)
      .map(([k, v]) => `${k}=${JSON.stringify(String(v))}`)
      .join("\n") + "\n"
  )
}

/** Temp wrangler config pointing `main`/assets at the runner-owned snapshot build. */
export function buildHermeticConfig(repoConfigText, workerPath, assetsPath) {
  const cfg = JSON.parse(repoConfigText)
  cfg.main = workerPath
  if (cfg.assets && cfg.assets.directory) cfg.assets.directory = assetsPath
  return JSON.stringify(cfg, null, 2) + "\n"
}

// ─── token shaping (no RSA dependency) ──────────────────────────────

/** Relabel a valid HS256 token's header as RS256, keeping payload+signature. */
export function buildRs256Token(hs256Token) {
  const parts = String(hs256Token).split(".")
  if (parts.length !== 3) throw new SmokeError("rs256_construction_failed")
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url")
  return `${header}.${parts[1]}.${parts[2]}`
}

// ─── COUNT-only D1 alignment query ──────────────────────────────────

function sqlLit(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

/** Predicate-shaped SQL returning only counts (never a stored value). */
export function alignmentSql(env) {
  const sub = sqlLit(env.CF_D1_BOOTSTRAP_IDENTITY_SUBJECT)
  const email = sqlLit(env.CF_D1_BOOTSTRAP_IDENTITY_EMAIL)
  return (
    "SELECT " +
    `(SELECT COUNT(*) FROM auth_identities WHERE provider='jwt' AND provider_subject=${sub}) AS identity_match, ` +
    `(SELECT COUNT(*) FROM users u JOIN auth_identities ai ON ai.user_id=u.id WHERE ai.provider='jwt' AND ai.provider_subject=${sub} AND u.email=${email}) AS user_email_match, ` +
    `(SELECT COUNT(*) FROM tenant_memberships m JOIN auth_identities ai ON ai.user_id=m.user_id WHERE ai.provider='jwt' AND ai.provider_subject=${sub} AND m.status='active') AS active_membership, ` +
    "(SELECT COUNT(*) FROM tenants WHERE status='active') AS active_tenant;"
  )
}

function toNumber(value) {
  const n = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10)
  return Number.isFinite(n) ? n : 0
}

// ─── result evaluation + safe formatting ────────────────────────────

/** The HTTP + authority + build-source proof gate (cleanup is evaluated separately). */
export function evaluateProof(r) {
  return (
    r.no_jwt_status === 401 &&
    r.hs256_status === 200 &&
    r.work_units_key === true &&
    r.rs256_status === 401 &&
    r.expired_status === 401 &&
    r.jwt_authority_aligned === true &&
    r.d1_alignment === true &&
    r.worker_source_match === true &&
    r.worker_bundle_owned === true
  )
}

/** Machine-readable, secret-free stdout. Only SAFE_RESULT_KEYS are emitted. */
export function formatResults(r) {
  return SAFE_RESULT_KEYS.filter((k) => r[k] !== undefined).map((k) => `${k}=${r[k]}`).join("\n") + "\n"
}

// ─── default dependency wiring ──────────────────────────────────────

async function defaultDeps() {
  const fs = await import("node:fs")
  const fsp = fs.promises
  const net = await import("node:net")
  const crypto = await import("node:crypto")
  const cp = await import("node:child_process")
  const os = await import("node:os")
  // The OpenNext/Next build resolves internal temp paths from the project location
  // and fails to `mkdir` under deeply-nested macOS `/var/folders` (`os.tmpdir()`)
  // roots. Prefer a shallow, writable `/tmp` base; realpath-canonicalize it because
  // `/tmp` is a symlink to `/private/tmp` on macOS and the migration-manifest
  // validator rejects paths resolving outside the (non-canonical) repo root.
  const pickTempBase = () => {
    for (const c of ["/tmp", os.tmpdir()]) {
      try {
        fs.accessSync(c, fs.constants.W_OK)
        return fs.realpathSync(c)
      } catch {
        /* try next */
      }
    }
    return os.tmpdir()
  }
  const hashFile = (p) => {
    try {
      return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex")
    } catch {
      return null
    }
  }
  return {
    tmpdir: pickTempBase,
    fs: {
      mkdir: (p, opts) => fsp.mkdir(p, opts),
      writeFile: (p, data, opts) => fsp.writeFile(p, data, opts),
      rm: (p, opts) => fsp.rm(p, opts),
      readFile: (p, enc) => fsp.readFile(p, enc),
      existsSync: (p) => fs.existsSync(p),
      // synchronous ops for the atomic owned-root publication
      mkdtempSync: (prefix) => fs.mkdtempSync(prefix),
      chmodSync: (p, mode) => fs.chmodSync(p, mode),
      statSync: (p) => fs.statSync(p),
      writeFileSync: (p, data, opts) => fs.writeFileSync(p, data, opts),
      readFileSync: (p, enc) => fs.readFileSync(p, enc),
      rmSync: (p, opts) => fs.rmSync(p, opts),
    },
    openLogFd: (p) => fs.openSync(p, "a", 0o600),
    closeFd: (fd) => {
      try {
        fs.closeSync(fd)
      } catch {
        /* already closed */
      }
    },
    randomBytes: (n) => crypto.randomBytes(n),
    hashFile,
    gitHead: () => {
      const r = cp.spawnSync("git", ["rev-parse", "HEAD"], { cwd: undefined, encoding: "utf8", timeout: 10_000 })
      return r.status === 0 ? r.stdout.trim() : null
    },
    pickPort: () =>
      new Promise((res, rej) => {
        const s = net.createServer()
        s.on("error", rej)
        s.listen(0, "127.0.0.1", () => {
          const port = s.address().port
          s.close(() => res(port))
        })
      }),
    isPortFree: (port) =>
      new Promise((res) => {
        const s = net.createServer()
        s.once("error", () => res(false))
        s.once("listening", () => s.close(() => res(true)))
        s.listen(port, "127.0.0.1")
      }),
    spawn: (bin, args, opts) => cp.spawn(bin, args, opts),
    killProcess: (pid, signal) => {
      try {
        process.kill(pid, signal)
        return true
      } catch {
        return false
      }
    },
    isAlive: (pid) => {
      try {
        process.kill(pid, 0)
        return true
      } catch {
        return false
      }
    },
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (t) => clearTimeout(t),
    fetchImpl: (url, opts) => fetch(url, opts),
    now: () => Date.now(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    log: (line) => process.stdout.write(line),
    installSignalHandlers: (handler) => {
      const si = () => handler("SIGINT")
      const st = () => handler("SIGTERM")
      process.on("SIGINT", si)
      process.on("SIGTERM", st)
      return () => {
        process.off("SIGINT", si)
        process.off("SIGTERM", st)
      }
    },
    exit: (code) => process.exit(code),
  }
}

const DEFAULT_TIMEOUTS = Object.freeze({
  totalMs: 420_000,
  buildMs: 240_000,
  bootstrapMs: 90_000,
  d1QueryMs: 30_000,
  readinessMs: 60_000,
  httpMs: 20_000,
  pollIntervalMs: 400,
  cleanupMs: 15_000,
})

// ─── deadline helpers ───────────────────────────────────────────────

const remainingMs = (d, deadline) => deadline - d.now()

function budget(d, deadline, cap) {
  const rem = remainingMs(d, deadline)
  if (rem <= 0) throw new SmokeError("total_deadline_exceeded")
  return Math.max(1, Math.min(cap, rem))
}

/** Race an async factory against a deadline; never rejects. */
function raceDeadline(d, deadline, factory, category) {
  const ms = Math.max(0, deadline - d.now())
  return new Promise((resolve) => {
    let done = false
    const timer = d.setTimer(() => {
      if (done) return
      done = true
      resolve({ timedOut: true, category })
    }, ms)
    Promise.resolve()
      .then(factory)
      .then(
        (value) => {
          if (done) return
          done = true
          d.clearTimer(timer)
          resolve({ timedOut: false, value })
        },
        () => {
          if (done) return
          done = true
          d.clearTimer(timer)
          resolve({ timedOut: false, value: undefined })
        },
      )
  })
}

// ─── atomic owned-root publication ──────────────────────────────────

/**
 * Create, harden, and publish the private temp root as ONE synchronous unit so no
 * signal handler can observe a half-created, unremovable root. On any failure the
 * partially created root is removed and a SmokeError is thrown.
 * @returns {{ root: string, token: string }}
 */
export function createOwnedRoot(d, { registry }) {
  const root = d.fs.mkdtempSync(join(d.tmpdir(), "atra-jwt-smoke-"))
  try {
    d.fs.chmodSync(root, 0o700)
    const mode = d.fs.statSync(root).mode & 0o777
    if (mode !== 0o700) throw new SmokeError("root_mode_invalid")
    const token = d.randomBytes(16).toString("hex")
    const markerPath = join(root, ".smoke-owner")
    d.fs.writeFileSync(markerPath, token, { mode: 0o600 })
    if (d.fs.readFileSync(markerPath, "utf8") !== token) throw new SmokeError("root_marker_mismatch")
    // Publish only AFTER the marker is written and verified (no race).
    registry.register(root, "root")
    return { root, token }
  } catch (err) {
    try {
      d.fs.rmSync(root, { recursive: true, force: true })
    } catch {
      /* best effort */
    }
    throw err instanceof SmokeError ? err : new SmokeError("root_init_failed")
  }
}

function markerMatches(d, root, token) {
  if (!token) return false
  try {
    return d.fs.readFileSync(join(root, ".smoke-owner"), "utf8") === token
  } catch {
    return false
  }
}

// ─── bounded child spawn (detached, registered, deadline-bounded) ────

/**
 * Spawn a detached child in its own process group, register it centrally, and
 * resolve `{ status, signal, stdout, timedOut, spawnFailed }`. On timeout the
 * process group is SIGKILLed. Never rejects.
 */
function spawnCapture(d, kind, bin, args, { cwd, deadline, cap, childRegistry, logFd = null, capture = false } = {}) {
  const ms = budget(d, deadline, cap)
  return new Promise((resolve) => {
    let child
    try {
      const stdio = capture ? ["ignore", "pipe", "pipe"] : ["ignore", logFd ?? "ignore", logFd ?? "ignore"]
      child = d.spawn(bin, args, { cwd, detached: true, stdio })
    } catch {
      resolve({ status: null, stdout: "", spawnFailed: true })
      return
    }
    childRegistry.register(kind, child)
    if (typeof d.onOwnedChildSpawn === "function") d.onOwnedChildSpawn(kind, child)
    let out = ""
    if (capture && child.stdout && typeof child.stdout.on === "function") child.stdout.on("data", (c) => { out += c })
    let settled = false
    const finish = (res) => {
      if (settled) return
      settled = true
      d.clearTimer(timer)
      childRegistry.markSettled(child)
      if (typeof d.onOwnedChildExit === "function") d.onOwnedChildExit(kind, child)
      resolve(res)
    }
    const timer = d.setTimer(() => {
      if (typeof child.pid === "number") {
        d.killProcess(-child.pid, "SIGKILL")
        d.killProcess(child.pid, "SIGKILL")
      }
      finish({ status: null, stdout: out, timedOut: true })
    }, ms)
    if (typeof child.on === "function") {
      child.on("exit", (code, signal) => finish({ status: code, signal, stdout: out }))
      child.on("error", () => finish({ status: null, stdout: out, spawnFailed: true }))
    }
  })
}

// ─── current-source, runner-owned Worker build ──────────────────────

async function defaultBuildWorker(d, { root, deadline, timeouts, childRegistry }) {
  const builtHead = d.gitHead()
  if (!builtHead) throw new SmokeError("build_failed")
  const snapshotDir = join(root, "src")
  await d.fs.mkdir(snapshotDir, { recursive: true })
  const tarPath = join(root, "src.tar")

  const step = (r) => {
    if (r.timedOut) throw new SmokeError("build_timeout")
    if (r.spawnFailed || r.status !== 0) throw new SmokeError("build_failed")
  }

  // 1. exact-HEAD source snapshot (git archive is committed-tree only)
  step(await spawnCapture(d, "git-archive", "git", ["-C", d.repoRoot, "archive", "--format=tar", "-o", tarPath, builtHead], { cwd: d.repoRoot, deadline, cap: timeouts.buildMs, childRegistry }))
  step(await spawnCapture(d, "tar-extract", "tar", ["-xf", tarPath, "-C", snapshotDir], { cwd: root, deadline, cap: timeouts.buildMs, childRegistry }))
  await d.fs.rm(tarPath, { force: true })

  // 2. installed deps as a REAL directory (CoW clone; isolates any build write).
  const cpArgs = process.platform === "darwin" ? ["-R", "-c"] : ["-R"]
  step(await spawnCapture(d, "node-modules-copy", "cp", [...cpArgs, join(d.repoRoot, "node_modules"), join(snapshotDir, "node_modules")], { cwd: root, deadline, cap: timeouts.buildMs, childRegistry }))

  // 3. build the Worker INSIDE the snapshot (cancellable async child)
  const logFd = typeof d.openLogFd === "function" ? d.openLogFd(join(root, "build.log")) : null
  try {
    step(await spawnCapture(d, "opennext-build", d.openNextBin, ["build"], { cwd: snapshotDir, deadline, cap: timeouts.buildMs, childRegistry, logFd }))
  } finally {
    if (typeof d.closeFd === "function" && logFd != null) d.closeFd(logFd)
  }

  const workerPath = join(snapshotDir, ".open-next", "worker.js")
  if (!d.fs.existsSync(workerPath)) throw new SmokeError("build_failed")
  return {
    snapshotDir,
    workerPath,
    assetsPath: join(snapshotDir, ".open-next", "assets"),
    wranglerJsonPath: join(snapshotDir, "wrangler.json"),
    builtHead,
  }
}

// ─── Worker process lifecycle (wrangler dev) ────────────────────────

async function startWorker(d, { runRoot, configPath, persistTo, logPath, deadline, timeouts, childRegistry }) {
  for (let attempt = 0; attempt < 5; attempt++) {
    if (remainingMs(d, deadline) <= 0) throw new SmokeError("total_deadline_exceeded")
    const port = await d.pickPort()
    const logFd = typeof d.openLogFd === "function" ? d.openLogFd(logPath) : null
    let child
    try {
      child = d.spawn(
        d.wranglerBin,
        ["dev", "--config", configPath, "--persist-to", persistTo, "--port", String(port), "--ip", "127.0.0.1", "--local"],
        { cwd: runRoot, detached: true, stdio: ["ignore", logFd ?? "ignore", logFd ?? "ignore"] },
      )
    } catch {
      if (typeof d.closeFd === "function" && logFd != null) d.closeFd(logFd)
      throw new SmokeError("worker_start_failed")
    }
    childRegistry.register("wrangler-dev", child)
    if (typeof d.onOwnedChildSpawn === "function") d.onOwnedChildSpawn("wrangler-dev", child)
    let exitedEarly = false
    if (typeof child.on === "function") {
      child.on("exit", () => {
        exitedEarly = true
        childRegistry.markSettled(child)
        if (typeof d.onOwnedChildExit === "function") d.onOwnedChildExit("wrangler-dev", child)
      })
      child.on("error", () => {
        exitedEarly = true
      })
    }
    let ready
    try {
      ready = await waitForReady(d, port, deadline, timeouts, () => exitedEarly)
    } finally {
      if (typeof d.closeFd === "function" && logFd != null) d.closeFd(logFd)
    }
    if (ready === "ready") return { child, port }
    // startup failure / port race: the child stays registered and is reaped by cleanup.
    if (ready === "timeout") throw new SmokeError("readiness_timeout")
    if (ready === "deadline") throw new SmokeError("total_deadline_exceeded")
  }
  throw new SmokeError("worker_start_failed")
}

async function waitForReady(d, port, deadline, timeouts, exitedEarly) {
  const localDeadline = d.now() + timeouts.readinessMs
  const url = `http://127.0.0.1:${port}/api/workunit/inbox`
  while (d.now() < localDeadline) {
    if (remainingMs(d, deadline) <= 0) return "deadline"
    if (exitedEarly && exitedEarly()) return "exited"
    try {
      const r = await d.fetchImpl(url, { method: "GET", signal: abortAfter(d, Math.min(timeouts.httpMs, budget(d, deadline, timeouts.httpMs))) })
      if (typeof r.status === "number") return "ready"
    } catch {
      /* not up yet */
    }
    await d.sleep(timeouts.pollIntervalMs)
  }
  return "timeout"
}

function abortAfter(d, ms) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") return AbortSignal.timeout(ms)
  const ac = new AbortController()
  d.setTimer(() => ac.abort(), ms)
  return ac.signal
}

// ─── bounded cleanup ────────────────────────────────────────────────

async function waitChildrenExit(d, childRegistry, cleanupDeadline) {
  let escalated = false
  while (d.now() < cleanupDeadline) {
    const live = childRegistry.live().filter((e) => d.isAlive(e.pid))
    if (live.length === 0) return true
    if (!escalated) {
      for (const e of live) {
        d.killProcess(-e.pgid, "SIGKILL")
        d.killProcess(e.pgid, "SIGKILL")
      }
      escalated = true
    }
    await d.sleep(50)
  }
  return childRegistry.live().every((e) => !d.isAlive(e.pid))
}

async function performCleanup(d, { childRegistry, registry, port, repoStatusBefore, operatorHashBefore, token, timeouts }) {
  const cleanupDeadline = d.now() + timeouts.cleanupMs
  const report = {}
  let timeoutCategory = null

  // 1. terminate every live owned process group (idempotent).
  for (const e of childRegistry.live()) {
    d.killProcess(-e.pgid, "SIGTERM")
    d.killProcess(e.pgid, "SIGTERM")
  }
  // 2. wait for confirmed exits (bounded; escalates to SIGKILL).
  report.children_stopped = await waitChildrenExit(d, childRegistry, cleanupDeadline)
  if (!report.children_stopped) timeoutCategory = timeoutCategory ?? "child_cleanup_timeout"

  // 4. remove the marker-verified owned root (bounded).
  const rootEntry = registry.list().find((e) => e.kind === "root")
  if (rootEntry) {
    if (markerMatches(d, rootEntry.path, token)) {
      const r = await raceDeadline(d, cleanupDeadline, () => d.fs.rm(rootEntry.path, { recursive: true, force: true }), "root_removal_timeout")
      if (r.timedOut) timeoutCategory = timeoutCategory ?? "root_removal_timeout"
    }
    report.root_removed = !d.fs.existsSync(rootEntry.path)
  } else {
    report.root_removed = true
  }

  // 5. verify registered artifacts are gone.
  const gone = (p) => !d.fs.existsSync(p)
  const byKind = (k) => registry.list().find((e) => e.kind === k)
  report.temporary_env_removed = !byKind("env") || gone(byKind("env").path)
  report.temporary_config_removed = !byKind("config") || gone(byKind("config").path)
  report.temporary_tokens_removed = true // tokens live only in memory; none written to disk
  report.temporary_d1_state_removed = !byKind("d1") || gone(byKind("d1").path)
  report.temporary_logs_removed = !byKind("log") || gone(byKind("log").path)
  report.temporary_build_removed = !byKind("root") || gone(join(byKind("root").path, "src"))

  // 6. port release (bounded).
  if (port == null) {
    report.port_released = true
  } else {
    const r = await raceDeadline(d, cleanupDeadline, () => d.isPortFree(port), "port_release_timeout")
    if (r.timedOut) {
      report.port_released = false
      timeoutCategory = timeoutCategory ?? "port_release_timeout"
    } else {
      report.port_released = r.value === true
    }
  }

  // 7. git status must be readable before AND after, and unchanged.
  const after = safeGitStatus(d)
  report.repository_status_unchanged = repoStatusBefore != null && after != null && after === repoStatusBefore
  // 8. operator artifact byte-identical (or stays absent).
  const opAfter = typeof d.hashOperatorArtifact === "function" ? d.hashOperatorArtifact() : null
  report.operator_build_artifact_untouched = operatorHashBefore === opAfter

  if (timeoutCategory) {
    report.cleanup_category = timeoutCategory
    report.cleanup_timeout = true
  }
  report.cleanup =
    !timeoutCategory &&
    report.children_stopped &&
    report.root_removed &&
    report.temporary_env_removed &&
    report.temporary_config_removed &&
    report.temporary_tokens_removed &&
    report.temporary_d1_state_removed &&
    report.temporary_logs_removed &&
    report.temporary_build_removed &&
    report.port_released &&
    report.repository_status_unchanged &&
    report.operator_build_artifact_untouched
  return report
}

function safeGitStatus(d) {
  if (typeof d.gitStatus !== "function") return null
  try {
    const v = d.gitStatus()
    return typeof v === "string" ? v : null
  } catch {
    return null
  }
}

// ─── the state machine ──────────────────────────────────────────────

/**
 * Run the full hermetic smoke. Installs signal handlers, owns all children and the
 * temp root, and always runs bounded cleanup — on success, failure, or signal.
 * `status=PASS` requires BOTH the proof gate and cleanup to pass.
 *
 * @param {Record<string, unknown>} [overrides] injectable dependencies (see defaults)
 * @returns {Promise<{ ok: boolean, results: Record<string, unknown>, exitCode: number }>}
 */
export async function runHermeticSmoke(overrides = {}) {
  const base = await defaultDeps()
  const d = { ...base, ...overrides, timeouts: { ...DEFAULT_TIMEOUTS, ...(overrides.timeouts || {}) } }
  if (!d.repoRoot) throw new SmokeError("repo_root_required")
  if (!d.wranglerBin) throw new SmokeError("wrangler_bin_required")
  const buildWorker = typeof d.buildWorker === "function" ? d.buildWorker : (args) => defaultBuildWorker(d, args)
  const timeouts = d.timeouts
  const deadline = d.now() + timeouts.totalMs

  const registry = createOwnedPathRegistry()
  const childRegistry = createChildRegistry()
  const results = {}
  const repoStatusBefore = safeGitStatus(d)
  const operatorHashBefore = typeof d.hashOperatorArtifact === "function" ? d.hashOperatorArtifact() : null
  const expectedHead = typeof d.gitHead === "function" ? d.gitHead() : null
  let port = null
  let ownerToken = null

  let aborting = false
  let signalCode = null
  let finalized = false
  let finalizePromise = null
  const abortController = new AbortController()

  async function finalize({ signal = false } = {}) {
    if (finalized) return finalizePromise
    finalized = true
    finalizePromise = (async () => {
      const cleanupReport = await performCleanup(d, { childRegistry, registry, port, repoStatusBefore, operatorHashBefore, token: ownerToken, timeouts })
      Object.assign(results, cleanupReport)
      const proofPassed = evaluateProof(results)
      results.status = proofPassed && cleanupReport.cleanup === true && !signal ? "PASS" : "FAIL"
      d.log(formatResults(results))
      return results
    })()
    return finalizePromise
  }

  // Conclude the run: the CALLER owns `process.exit(exitCode)`, so there is a single
  // exit authority and no race between a signal handler and the caller.
  function conclude() {
    removeSignals()
    const exitCode = aborting ? signalCode ?? 1 : results.status === "PASS" ? 0 : 1
    return { ok: results.status === "PASS" && !aborting, results, exitCode }
  }

  function onSignal(sig) {
    const code = sig === "SIGINT" ? 130 : 143
    if (aborting) {
      // second signal: force-kill every owned group; delete no unverified path.
      for (const e of childRegistry.live()) {
        d.killProcess(-e.pgid, "SIGKILL")
        d.killProcess(e.pgid, "SIGKILL")
      }
      return
    }
    aborting = true
    signalCode = code
    results.error_category = results.error_category ?? "aborted_by_signal"
    // Interrupt any test-only pause hook and any abort-aware wait, then terminate
    // every live owned group and run bounded cleanup. The main run awaits the same
    // `finalizePromise` and returns the signal exit code to the caller.
    try {
      abortController.abort()
    } catch {
      /* no-op */
    }
    for (const e of childRegistry.live()) {
      d.killProcess(-e.pgid, "SIGTERM")
      d.killProcess(e.pgid, "SIGTERM")
    }
    void finalize({ signal: true })
  }

  const removeSignals = typeof d.installSignalHandlers === "function" ? d.installSignalHandlers(onSignal) : () => {}

  try {
    // 1. atomic owned-root publication (synchronous — no signal can interleave).
    const owned = createOwnedRoot(d, { registry })
    const root = owned.root
    ownerToken = owned.token
    if (typeof d.onRootReady === "function") d.onRootReady(root, ownerToken)
    // test-only async pause point (never enabled by the production CLI).
    if (d.hooks && typeof d.hooks.afterRootReady === "function") await d.hooks.afterRootReady(abortController.signal)
    if (aborting) { await finalizePromise; return conclude() }

    const envPath = registry.register(join(root, ".dev.vars"), "env")
    const configPath = registry.register(join(root, "wrangler.hermetic.json"), "config")
    const persistTo = registry.register(join(root, "state"), "d1")
    const logPath = registry.register(join(root, "dev.log"), "log")

    // 2. current-source, runner-owned Worker build.
    const build = await buildWorker({ root, deadline, timeouts, childRegistry })
    if (aborting) { await finalizePromise; return conclude() }
    results.worker_source_match =
      typeof build.builtHead === "string" && build.builtHead.length > 0 && build.builtHead === expectedHead
    results.worker_bundle_owned =
      typeof build.workerPath === "string" && build.workerPath.startsWith(root) && d.fs.existsSync(build.workerPath)

    // 3. synthetic secret + identity (secret is never a CLI argument).
    const secret = d.randomBytes(48).toString("base64url")
    if (Buffer.byteLength(secret, "utf8") < MIN_SECRET_BYTES) throw new SmokeError("secret_too_short")
    const nonce = d.randomBytes(6).toString("hex")
    const env = buildHermeticEnv(secret, nonce)

    // 4. write the ONLY secret-bearing file (0600) + temp config (0600).
    await d.fs.writeFile(envPath, renderDevVars(env), { mode: 0o600 })
    const repoConfigText = await d.fs.readFile(build.wranglerJsonPath, "utf8")
    await d.fs.writeFile(configPath, buildHermeticConfig(repoConfigText, build.workerPath, build.assetsPath), { mode: 0o600 })

    // 5. bootstrap migrations + identity into the ISOLATED D1 (async, cancellable).
    if (remainingMs(d, deadline) <= 0) throw new SmokeError("total_deadline_exceeded")
    const makeExec = (cap) => (wargs, { label } = {}) =>
      spawnCapture(d, `d1:${label ?? "exec"}`, d.wranglerBin, [...wargs, "--config", configPath, "--persist-to", persistTo], {
        cwd: build.snapshotDir,
        deadline,
        cap,
        childRegistry,
        capture: true,
      })
    const boot = await d.runBootstrap({ env, repoRoot: build.snapshotDir, exec: makeExec(timeouts.bootstrapMs) })
    if (aborting) { await finalizePromise; return conclude() }
    if (!boot.ok) throw new SmokeError(boot.reason === "bootstrap_timeout" ? "bootstrap_timeout" : `bootstrap_failed:${boot.reason}`)

    // JWT authority alignment (in-memory generate + verify).
    const nowSec = () => Math.floor(d.now() / 1000)
    const fresh = await d.generateLocalJwt(env, { nowSeconds: nowSec(), ttlSeconds: 300 })
    const v = await d.verifyLocalJwt(fresh, env, { nowSeconds: nowSec() + 1 })
    results.jwt_algorithm_is_hs256 = v.algorithm === "HS256"
    results.jwt_signature_valid = v.signatureValid === true
    results.jwt_issuer_matches = v.issuerMatch === true
    results.jwt_audience_matches = v.audienceMatch === true
    results.jwt_email_present = v.emailPresent === true
    results.bootstrap_provider_is_jwt = env.CF_D1_BOOTSTRAP_IDENTITY_PROVIDER === "jwt"

    // D1 alignment (COUNT-only, against the SAME isolated D1).
    if (remainingMs(d, deadline) <= 0) throw new SmokeError("total_deadline_exceeded")
    let rows
    try {
      rows = await d.queryD1({ sql: alignmentSql(env), binding: "CONTROL_DB", label: "align", exec: makeExec(timeouts.d1QueryMs) })
    } catch (err) {
      throw new SmokeError(err && err.timedOut ? "d1_query_timeout" : "d1_query_failed")
    }
    if (aborting) { await finalizePromise; return conclude() }
    const row = rows && rows[0] ? rows[0] : {}
    results.identity_user_exists = toNumber(row.identity_match) > 0
    results.bootstrap_subject_matches_jwt = toNumber(row.identity_match) > 0
    results.bootstrap_email_matches_jwt = toNumber(row.user_email_match) > 0
    results.active_membership_exists = toNumber(row.active_membership) > 0
    results.active_tenant_exists = toNumber(row.active_tenant) > 0

    // 6. start the Worker on an ephemeral port + wait for readiness.
    ;({ port } = await startWorker(d, { runRoot: build.snapshotDir, configPath, persistTo, logPath, deadline, timeouts, childRegistry }))
    // test-only async pause point (never enabled by the production CLI).
    if (d.hooks && typeof d.hooks.afterWorkerReady === "function") await d.hooks.afterWorkerReady(abortController.signal)
    if (aborting) { await finalizePromise; return conclude() }

    // 7. five HTTP cases (each request bounded by the global deadline).
    const inbox = `http://127.0.0.1:${port}/api/workunit/inbox`
    results.no_jwt_status = await httpStatus(d, inbox, null, deadline, timeouts)
    const hs = await httpJson(d, inbox, fresh, deadline, timeouts)
    results.hs256_status = hs.status
    results.work_units_key = hs.hasWorkUnits === true
    results.rs256_status = await httpStatus(d, inbox, buildRs256Token(fresh), deadline, timeouts)
    const expired = await d.generateLocalJwt(env, { nowSeconds: nowSec() - 4000, ttlSeconds: 300 })
    results.expired_status = await httpStatus(d, inbox, expired, deadline, timeouts)

    results.worker_and_bootstrap_share_local_d1 = results.hs256_status === 200
    results.jwt_authority_aligned =
      results.jwt_algorithm_is_hs256 &&
      results.jwt_signature_valid &&
      results.jwt_issuer_matches &&
      results.jwt_audience_matches &&
      results.jwt_email_present &&
      results.bootstrap_provider_is_jwt
    results.d1_alignment =
      results.identity_user_exists &&
      results.bootstrap_subject_matches_jwt &&
      results.bootstrap_email_matches_jwt &&
      results.active_membership_exists &&
      results.active_tenant_exists &&
      results.worker_and_bootstrap_share_local_d1
  } catch (err) {
    results.error_category = results.error_category ?? (err instanceof SmokeError ? err.category : "unexpected_error")
  }

  if (aborting) {
    // the signal handler triggered finalize; await its bounded cleanup, then let
    // the CALLER own the exit (single exit authority via the returned exitCode).
    await finalizePromise
    return conclude()
  }
  await finalize({})
  return conclude()
}

async function httpStatus(d, url, token, deadline, timeouts) {
  const headers = token ? { authorization: `Bearer ${token}` } : {}
  let r
  try {
    r = await d.fetchImpl(url, { method: "GET", headers, signal: abortAfter(d, budget(d, deadline, timeouts.httpMs)) })
  } catch (err) {
    if (err instanceof SmokeError) throw err
    throw new SmokeError("http_timeout")
  }
  return typeof r.status === "number" ? r.status : 0
}

async function httpJson(d, url, token, deadline, timeouts) {
  const headers = token ? { authorization: `Bearer ${token}` } : {}
  let r
  try {
    r = await d.fetchImpl(url, { method: "GET", headers, signal: abortAfter(d, budget(d, deadline, timeouts.httpMs)) })
  } catch (err) {
    if (err instanceof SmokeError) throw err
    throw new SmokeError("http_timeout")
  }
  let hasWorkUnits = false
  try {
    const body = await r.json()
    hasWorkUnits = body != null && typeof body === "object" && Object.prototype.hasOwnProperty.call(body, "workUnits")
  } catch {
    /* non-JSON */
  }
  return { status: typeof r.status === "number" ? r.status : 0, hasWorkUnits }
}
