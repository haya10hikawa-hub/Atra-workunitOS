// Hermetic local JWT/D1 HTTP smoke runner (testable core).
//
// ── Current-source, runner-owned build isolation ──
// A smoke run must never silently consume the operator's repository-root
// `.open-next/worker.js` (which may be stale) and must never create/modify repo
// build state. OpenNext's build derives its app dir from `process.cwd()` and
// writes BOTH `.next` and `.open-next` there, so its output cannot be safely
// redirected. Instead the runner snapshots the EXACT current HEAD with
// `git archive HEAD` into its own temp root, symlinks the installed
// `node_modules` (read-only; `rm` unlinks the symlink, never its target), and
// builds the Worker INSIDE that snapshot. The temp wrangler config then points
// only at the snapshot's `.open-next`. The operator `.open-next` is never read,
// written, or created.
//
// ── Isolation mechanism (Wrangler 4.99.0, verified from `wrangler … --help`) ──
// Every stateful artifact lives inside ONE private temp root (mode 0700) that this
// invocation owns and removes: the exact-HEAD source snapshot + its build, a 0600
// `.dev.vars` (the ONLY secret-bearing file), a temp `wrangler --config` with
// absolute snapshot paths, an isolated `--persist-to` D1 shared by BOTH the
// bootstrap and the Worker, and captured logs. The secret is generated in memory
// and only written to the 0600 file, never passed as a command-line argument.
// No `--remote`, no `wrangler whoami`, no deploy: local only.
//
// ── One global deadline ──
// `deadline = start + totalMs`. Every blocking step (build, bootstrap, D1 query,
// Wrangler startup, readiness, each HTTP request, graceful stop) receives the
// remaining budget and fails closed with a stable category. A timeout triggers
// exact-child termination and owned-state cleanup.
//
// ── Fail-closed status ──
// The final status is a two-stage AND of `proof_passed` and `cleanup_passed`, so
// `status=PASS` is impossible unless cleanup fully succeeded.

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
// Nothing else is ever deleted — an operator's pre-existing files are out of reach
// because they are never registered.

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

/** Temp wrangler config pointing `main`/assets at the runner-owned snapshot build.
 *  D1 bindings and vars are preserved from the committed config. */
export function buildHermeticConfig(repoConfigText, workerPath, assetsPath) {
  const cfg = JSON.parse(repoConfigText)
  cfg.main = workerPath
  if (cfg.assets && cfg.assets.directory) cfg.assets.directory = assetsPath
  return JSON.stringify(cfg, null, 2) + "\n"
}

// ─── token shaping (no RSA dependency) ──────────────────────────────

/** Relabel a valid HS256 token's header as RS256, keeping payload+signature.
 *  The Worker rejects a non-HS256 `alg` before any signature check → 401. */
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
  // roots. Prefer a shallow, writable `/tmp` base (== the location where `cf:build`
  // already works). The base is realpath-canonicalized: `/tmp` is a symlink to
  // `/private/tmp` on macOS, and the migration-manifest validator rejects paths
  // that resolve outside the (non-canonical) repo root as `path_escapes_repo`.
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
      mkdtemp: (prefix) => fsp.mkdtemp(prefix),
      mkdir: (p, opts) => fsp.mkdir(p, opts),
      writeFile: (p, data, opts) => fsp.writeFile(p, data, opts),
      chmod: (p, mode) => fsp.chmod(p, mode),
      rm: (p, opts) => fsp.rm(p, opts),
      readFile: (p, enc) => fsp.readFile(p, enc),
      existsSync: (p) => fs.existsSync(p),
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
    spawnSyncBounded: (bin, args, opts) => cp.spawnSync(bin, args, opts),
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
  stopGraceMs: 4_000,
  cleanupMs: 15_000,
})

// ─── deadline helpers ───────────────────────────────────────────────

const remainingMs = (d, deadline) => deadline - d.now()

function budget(d, deadline, cap) {
  const rem = remainingMs(d, deadline)
  if (rem <= 0) throw new SmokeError("total_deadline_exceeded")
  return Math.max(1, Math.min(cap, rem))
}

// ─── current-source, runner-owned Worker build ──────────────────────

/**
 * Snapshot the exact current HEAD into `<root>/src`, symlink `node_modules`, and
 * build the OpenNext Worker inside the snapshot. Returns runner-owned paths and
 * the built HEAD. Throws SmokeError("build_timeout"|"build_failed").
 */
async function defaultBuildWorker(d, { root, deadline, timeouts }) {
  const builtHead = d.gitHead()
  if (!builtHead) throw new SmokeError("build_failed")
  const snapshotDir = join(root, "src")
  await d.fs.mkdir(snapshotDir, { recursive: true })
  const tarPath = join(root, "src.tar")

  // 1. exact-HEAD source snapshot (git archive is committed-tree only)
  const archive = d.spawnSyncBounded("git", ["-C", d.repoRoot, "archive", "--format=tar", "-o", tarPath, builtHead], {
    encoding: "utf8",
    timeout: budget(d, deadline, timeouts.buildMs),
  })
  if (archive.signal || (archive.error && archive.error.code === "ETIMEDOUT")) throw new SmokeError("build_timeout")
  if (archive.status !== 0) throw new SmokeError("build_failed")
  const extract = d.spawnSyncBounded("tar", ["-xf", tarPath, "-C", snapshotDir], {
    encoding: "utf8",
    timeout: budget(d, deadline, timeouts.buildMs),
  })
  if (extract.signal || (extract.error && extract.error.code === "ETIMEDOUT")) throw new SmokeError("build_timeout")
  if (extract.status !== 0) throw new SmokeError("build_failed")
  await d.fs.rm(tarPath, { force: true })

  // 2. installed deps as a REAL directory inside the snapshot. A top-level
  //    `node_modules` symlink (or per-entry symlinks) whose realpath escapes into
  //    the operator worktree makes Next infer the wrong workspace root and bake
  //    absolute `/.next/...` requires into the Worker. A copy-on-write clone
  //    (`cp -c` on APFS) is near-instant, and CoW isolates any build-time write so
  //    the operator's `node_modules` is never modified. Cleanup `rm -rf` frees the
  //    clone. On non-APFS platforms a plain recursive copy is used.
  const cpArgs = process.platform === "darwin" ? ["-R", "-c"] : ["-R"]
  const copy = d.spawnSyncBounded("cp", [...cpArgs, join(d.repoRoot, "node_modules"), join(snapshotDir, "node_modules")], {
    encoding: "utf8",
    timeout: budget(d, deadline, timeouts.buildMs),
  })
  if (copy.signal || (copy.error && copy.error.code === "ETIMEDOUT")) throw new SmokeError("build_timeout")
  if (copy.status !== 0) throw new SmokeError("build_failed")

  // 3. build the Worker INSIDE the snapshot (cancellable async child)
  const logFd = typeof d.openLogFd === "function" ? d.openLogFd(join(root, "build.log")) : null
  try {
    await runBoundedChild(d, d.openNextBin, ["build"], {
      cwd: snapshotDir,
      deadline,
      cap: timeouts.buildMs,
      timeoutCategory: "build_timeout",
      failCategory: "build_failed",
      logFd,
    })
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

/** Run a child bounded by the global deadline; kill its process group on timeout. */
function runBoundedChild(d, bin, args, { cwd, deadline, cap, timeoutCategory, failCategory, logFd }) {
  const ms = budget(d, deadline, cap)
  return new Promise((resolve, reject) => {
    let child
    try {
      child = d.spawn(bin, args, { cwd, detached: true, stdio: ["ignore", logFd ?? "ignore", logFd ?? "ignore"] })
    } catch {
      reject(new SmokeError(failCategory))
      return
    }
    let settled = false
    const timer = d.setTimer(() => {
      if (settled) return
      settled = true
      if (typeof child.pid === "number") {
        d.killProcess(-child.pid, "SIGKILL")
        d.killProcess(child.pid, "SIGKILL")
      }
      reject(new SmokeError(timeoutCategory))
    }, ms)
    if (typeof child.on === "function") {
      child.on("exit", (code) => {
        if (settled) return
        settled = true
        d.clearTimer(timer)
        if (code === 0) resolve()
        else reject(new SmokeError(failCategory))
      })
      child.on("error", () => {
        if (settled) return
        settled = true
        d.clearTimer(timer)
        reject(new SmokeError(failCategory))
      })
    }
  })
}

// ─── Worker process lifecycle (wrangler dev) ────────────────────────

async function startWorker(d, { runRoot, configPath, persistTo, logPath, deadline, timeouts }) {
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
    if (typeof d.onSpawn === "function") d.onSpawn(child)
    let exitedEarly = false
    if (typeof child.on === "function") {
      child.on("exit", () => {
        exitedEarly = true
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
    await stopChild(d, child, timeouts)
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

async function stopChild(d, child, timeouts) {
  if (!child || typeof child.pid !== "number") return true
  const pid = child.pid
  d.killProcess(-pid, "SIGTERM")
  d.killProcess(pid, "SIGTERM")
  const graceDeadline = d.now() + timeouts.stopGraceMs
  while (d.now() < graceDeadline) {
    if (!d.isAlive(pid)) return true
    await d.sleep(100)
  }
  d.killProcess(-pid, "SIGKILL")
  d.killProcess(pid, "SIGKILL")
  await d.sleep(100)
  return !d.isAlive(pid)
}

// ─── cleanup ────────────────────────────────────────────────────────

async function performCleanup(d, { child, registry, port, repoStatusBefore, operatorHashBefore, timeouts }) {
  const report = {}
  report.wrangler_process_stopped = await stopChild(d, child, timeouts)

  const root = registry.list().find((e) => e.kind === "root")
  if (root) {
    try {
      await d.fs.rm(root.path, { recursive: true, force: true })
    } catch {
      /* force:true already tolerant */
    }
  }
  const gone = (path) => !d.fs.existsSync(path)
  const byKind = (kind) => registry.list().find((e) => e.kind === kind)
  report.temporary_env_removed = !byKind("env") || gone(byKind("env").path)
  report.temporary_config_removed = !byKind("config") || gone(byKind("config").path)
  report.temporary_tokens_removed = true // tokens live only in memory; none written to disk
  report.temporary_d1_state_removed = !byKind("d1") || gone(byKind("d1").path)
  report.temporary_logs_removed = !byKind("log") || gone(byKind("log").path)
  report.temporary_build_removed = !byKind("root") || gone(join(byKind("root").path, "src"))
  report.port_released = port == null ? true : await d.isPortFree(port)

  // Fail closed if git status cannot be read either before OR after the run.
  const after = safeGitStatus(d)
  report.repository_status_unchanged = repoStatusBefore != null && after != null && after === repoStatusBefore

  // The operator's `.open-next/worker.js` must be byte-identical (or stay absent).
  const operatorHashAfter = typeof d.hashOperatorArtifact === "function" ? d.hashOperatorArtifact() : null
  report.operator_build_artifact_untouched = operatorHashBefore === operatorHashAfter

  report.cleanup =
    report.wrangler_process_stopped &&
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
 * Run the full hermetic smoke. Always cleans up owned state in `finally`, for
 * success AND every failure path. `status=PASS` requires BOTH the proof gate and
 * cleanup to pass. Returns safe results; never throws for an expected failure.
 *
 * @param {Record<string, unknown>} [overrides] injectable dependencies (see defaults)
 * @returns {Promise<{ ok: boolean, results: Record<string, unknown> }>}
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
  const results = {}
  const repoStatusBefore = safeGitStatus(d)
  const operatorHashBefore = typeof d.hashOperatorArtifact === "function" ? d.hashOperatorArtifact() : null
  const expectedHead = typeof d.gitHead === "function" ? d.gitHead() : null
  let child = null
  let port = null

  try {
    // 1. private temp root — register BEFORE any fallible post-creation step so a
    //    chmod/marker failure still removes the root.
    const root = await d.fs.mkdtemp(join(d.tmpdir(), "atra-jwt-smoke-"))
    registry.register(root, "root")
    const ownerToken = d.randomBytes(16).toString("hex")
    if (typeof d.onRoot === "function") d.onRoot(root, ownerToken)
    await d.fs.chmod(root, 0o700)
    // Non-secret ownership marker: lets the emergency handler prove the root is
    // ours before deleting it (never a bare string-prefix check).
    await d.fs.writeFile(join(root, ".smoke-owner"), ownerToken, { mode: 0o600 })

    const envPath = registry.register(join(root, ".dev.vars"), "env")
    const configPath = registry.register(join(root, "wrangler.hermetic.json"), "config")
    const persistTo = registry.register(join(root, "state"), "d1")
    const logPath = registry.register(join(root, "dev.log"), "log")

    // 2. current-source, runner-owned Worker build (fails closed on timeout)
    const build = await buildWorker({ root, deadline, timeouts })
    results.worker_source_match =
      typeof build.builtHead === "string" && build.builtHead.length > 0 && build.builtHead === expectedHead
    results.worker_bundle_owned =
      typeof build.workerPath === "string" && build.workerPath.startsWith(root) && d.fs.existsSync(build.workerPath)

    // 3. synthetic secret + identity (secret is never a CLI argument)
    const secret = d.randomBytes(48).toString("base64url")
    if (Buffer.byteLength(secret, "utf8") < MIN_SECRET_BYTES) throw new SmokeError("secret_too_short")
    const nonce = d.randomBytes(6).toString("hex")
    const env = buildHermeticEnv(secret, nonce)

    // 4. write the ONLY secret-bearing file (0600) + temp config (0600, snapshot paths)
    await d.fs.writeFile(envPath, renderDevVars(env), { mode: 0o600 })
    const repoConfigText = await d.fs.readFile(build.wranglerJsonPath, "utf8")
    await d.fs.writeFile(configPath, buildHermeticConfig(repoConfigText, build.workerPath, build.assetsPath), { mode: 0o600 })

    // 5. bootstrap migrations + identity into the ISOLATED D1 (current-source)
    if (remainingMs(d, deadline) <= 0) throw new SmokeError("total_deadline_exceeded")
    const wrangler = { bin: d.wranglerBin, cwd: build.snapshotDir, configPath, persistTo, remaining: () => Math.min(timeouts.bootstrapMs, remainingMs(d, deadline)) }
    const boot = await d.runBootstrap({ env, repoRoot: build.snapshotDir, wrangler })
    if (!boot.ok) throw new SmokeError(boot.reason === "bootstrap_timeout" ? "bootstrap_timeout" : `bootstrap_failed:${boot.reason}`)

    // JWT authority alignment (in-memory generate + verify)
    const nowSec = () => Math.floor(d.now() / 1000)
    const fresh = await d.generateLocalJwt(env, { nowSeconds: nowSec(), ttlSeconds: 300 })
    const v = await d.verifyLocalJwt(fresh, env, { nowSeconds: nowSec() + 1 })
    results.jwt_algorithm_is_hs256 = v.algorithm === "HS256"
    results.jwt_signature_valid = v.signatureValid === true
    results.jwt_issuer_matches = v.issuerMatch === true
    results.jwt_audience_matches = v.audienceMatch === true
    results.jwt_email_present = v.emailPresent === true
    results.bootstrap_provider_is_jwt = env.CF_D1_BOOTSTRAP_IDENTITY_PROVIDER === "jwt"

    // D1 alignment (COUNT-only, against the SAME isolated D1)
    if (remainingMs(d, deadline) <= 0) throw new SmokeError("total_deadline_exceeded")
    let rows
    try {
      rows = await d.queryD1({
        sql: alignmentSql(env),
        binding: "CONTROL_DB",
        label: "align",
        repoRoot: build.snapshotDir,
        wrangler: { ...wrangler, remaining: () => Math.min(timeouts.d1QueryMs, remainingMs(d, deadline)) },
      })
    } catch (err) {
      throw new SmokeError(err && err.timedOut ? "d1_query_timeout" : "d1_query_failed")
    }
    const row = rows && rows[0] ? rows[0] : {}
    results.identity_user_exists = toNumber(row.identity_match) > 0
    results.bootstrap_subject_matches_jwt = toNumber(row.identity_match) > 0
    results.bootstrap_email_matches_jwt = toNumber(row.user_email_match) > 0
    results.active_membership_exists = toNumber(row.active_membership) > 0
    results.active_tenant_exists = toNumber(row.active_tenant) > 0

    // 6. start the Worker on an ephemeral port + wait for readiness
    ;({ child, port } = await startWorker(d, { runRoot: build.snapshotDir, configPath, persistTo, logPath, deadline, timeouts }))

    // 7. five HTTP cases (each request bounded by the global deadline)
    const inbox = `http://127.0.0.1:${port}/api/workunit/inbox`
    results.no_jwt_status = await httpStatus(d, inbox, null, deadline, timeouts)
    const hs = await httpJson(d, inbox, fresh, deadline, timeouts)
    results.hs256_status = hs.status
    results.work_units_key = hs.hasWorkUnits === true
    results.rs256_status = await httpStatus(d, inbox, buildRs256Token(fresh), deadline, timeouts)
    const expired = await d.generateLocalJwt(env, { nowSeconds: nowSec() - 4000, ttlSeconds: 300 })
    results.expired_status = await httpStatus(d, inbox, expired, deadline, timeouts)

    // A 200 here can ONLY happen if the Worker read the identity the bootstrap
    // seeded into the isolated `--persist-to` DB — i.e. they share one local D1.
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
    results.error_category = err instanceof SmokeError ? err.category : "unexpected_error"
  }

  // ── two-stage, fail-closed status ──
  const proofPassed = evaluateProof(results)
  const cleanupReport = await performCleanup(d, { child, registry, port, repoStatusBefore, operatorHashBefore, timeouts })
  Object.assign(results, cleanupReport)
  const cleanupPassed = cleanupReport.cleanup === true
  results.status = proofPassed && cleanupPassed ? "PASS" : "FAIL"

  d.log(formatResults(results))
  return { ok: results.status === "PASS", results }
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
