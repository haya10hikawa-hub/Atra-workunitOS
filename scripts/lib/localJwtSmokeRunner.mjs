// Hermetic local JWT/D1 HTTP smoke runner (testable core).
//
// ── Isolation mechanism (Wrangler 4.99.0, verified from `wrangler … --help`) ──
// Every stateful artifact lives inside ONE private temp root (mode 0700) that this
// invocation owns and removes:
//   * `<root>/.dev.vars`             — the ONLY secret-bearing file (mode 0600);
//   * `<root>/wrangler.hermetic.json`— a temp config with ABSOLUTE `main`/assets
//                                      paths, passed via `wrangler --config`;
//   * `<root>/state`                 — isolated local D1, passed via `--persist-to`
//                                      to BOTH `d1 execute` (bootstrap) and `dev`,
//                                      so the Worker and the seed share one DB;
//   * `<root>/dev.log`               — captured Worker stdout/stderr.
// `wrangler` resolves `.dev.vars` next to the `--config` file, so an operator's
// repo-root `.dev.vars` and default `.wrangler/` are never read or written. The
// secret is generated in memory and only ever written to the 0600 `.dev.vars`; it
// is never passed as a command-line argument (which would be visible in the
// process list). No `--remote`, no `wrangler whoami`, no deploy: local only.

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
  "no_jwt_status",
  "hs256_status",
  "work_units_key",
  "rs256_status",
  "expired_status",
  "jwt_authority_aligned",
  "d1_alignment",
  "cleanup",
])

class SmokeError extends Error {
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

/** Temp wrangler config: repo config with ABSOLUTE `main`/assets so it resolves
 *  from the isolated temp directory. D1 bindings and vars are preserved. */
export function buildHermeticConfig(repoConfigText, repoRoot) {
  const cfg = JSON.parse(repoConfigText)
  cfg.main = join(repoRoot, ".open-next", "worker.js")
  if (cfg.assets && cfg.assets.directory) cfg.assets.directory = join(repoRoot, ".open-next", "assets")
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

export function evaluatePass(r) {
  return (
    r.no_jwt_status === 401 &&
    r.hs256_status === 200 &&
    r.work_units_key === true &&
    r.rs256_status === 401 &&
    r.expired_status === 401 &&
    r.jwt_authority_aligned === true &&
    r.d1_alignment === true
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
  return {
    tmpdir: () => os.tmpdir(),
    fs: {
      mkdtemp: (prefix) => fsp.mkdtemp(prefix),
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
    fetchImpl: (url, opts) => fetch(url, opts),
    now: () => Date.now(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    log: (line) => process.stdout.write(line),
  }
}

const DEFAULT_TIMEOUTS = Object.freeze({ readinessMs: 60_000, pollIntervalMs: 400, stopGraceMs: 4_000, totalMs: 120_000 })

// ─── process lifecycle ──────────────────────────────────────────────

async function startWorker(d, { runRoot, configPath, persistTo, logPath, timeouts }) {
  // Ephemeral port with bounded retry if it is taken before wrangler binds.
  for (let attempt = 0; attempt < 5; attempt++) {
    const port = await d.pickPort()
    const logFd = typeof d.openLogFd === "function" ? d.openLogFd(logPath) : null
    const child = d.spawn(
      d.wranglerBin,
      ["dev", "--config", configPath, "--persist-to", persistTo, "--port", String(port), "--ip", "127.0.0.1", "--local"],
      { cwd: runRoot, detached: true, stdio: ["ignore", logFd ?? "ignore", logFd ?? "ignore"] },
    )
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
    const ready = await waitForReady(d, port, timeouts, () => exitedEarly)
    if (typeof d.closeFd === "function" && logFd != null) d.closeFd(logFd)
    if (ready === "ready") return { child, port }
    // startup failure or port race: stop this child, then retry with a fresh port.
    await stopChild(d, child, timeouts)
    if (ready === "timeout") throw new SmokeError("readiness_timeout")
  }
  throw new SmokeError("worker_start_failed")
}

async function waitForReady(d, port, timeouts, exitedEarly) {
  const deadline = d.now() + timeouts.readinessMs
  const url = `http://127.0.0.1:${port}/api/workunit/inbox`
  while (d.now() < deadline) {
    if (exitedEarly && exitedEarly()) return "exited"
    try {
      const r = await d.fetchImpl(url, { method: "GET" })
      if (typeof r.status === "number") return "ready"
    } catch {
      /* not up yet */
    }
    await d.sleep(timeouts.pollIntervalMs)
  }
  return "timeout"
}

async function stopChild(d, child, timeouts) {
  if (!child || typeof child.pid !== "number") return true
  const pid = child.pid
  // Kill the whole process group we own (wrangler + workerd) — never by name.
  d.killProcess(-pid, "SIGTERM")
  d.killProcess(pid, "SIGTERM")
  const deadline = d.now() + timeouts.stopGraceMs
  while (d.now() < deadline) {
    if (!d.isAlive(pid)) return true
    await d.sleep(100)
  }
  d.killProcess(-pid, "SIGKILL")
  d.killProcess(pid, "SIGKILL")
  await d.sleep(100)
  return !d.isAlive(pid)
}

// ─── cleanup ────────────────────────────────────────────────────────

async function performCleanup(d, { child, registry, port, repoStatusBefore, timeouts }) {
  const report = {}
  report.wrangler_process_stopped = await stopChild(d, child, timeouts)

  // Remove ONLY registered owned paths. Removing the root removes its children;
  // we then verify each registered artifact is gone.
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
  report.port_released = port == null ? true : await d.isPortFree(port)
  const after = safeGitStatus(d)
  report.repository_status_unchanged = after === repoStatusBefore
  report.cleanup =
    report.wrangler_process_stopped &&
    report.temporary_env_removed &&
    report.temporary_config_removed &&
    report.temporary_tokens_removed &&
    report.temporary_d1_state_removed &&
    report.temporary_logs_removed &&
    report.port_released &&
    report.repository_status_unchanged
  return report
}

function safeGitStatus(d) {
  if (typeof d.gitStatus !== "function") return null
  try {
    return d.gitStatus()
  } catch {
    return null
  }
}

// ─── the state machine ──────────────────────────────────────────────

/**
 * Run the full hermetic smoke. Always cleans up owned state in `finally`, for
 * success AND every failure path. Returns safe results + a cleanup report; never
 * throws for an expected failure (the CLI maps `status` to the exit code).
 *
 * @param {Record<string, unknown>} [overrides] injectable dependencies (see defaults)
 * @returns {Promise<{ ok: boolean, results: Record<string, unknown> }>}
 */
export async function runHermeticSmoke(overrides = {}) {
  const base = await defaultDeps()
  const d = { timeouts: DEFAULT_TIMEOUTS, ...base, ...overrides, timeouts: { ...DEFAULT_TIMEOUTS, ...(overrides.timeouts || {}) } }
  if (!d.repoRoot) throw new SmokeError("repo_root_required")
  if (!d.wranglerBin) throw new SmokeError("wrangler_bin_required")

  const registry = createOwnedPathRegistry()
  const results = {}
  const repoStatusBefore = safeGitStatus(d)
  let child = null
  let port = null

  try {
    // 1. private temp root (0700)
    const root = await d.fs.mkdtemp(join(d.tmpdir(), "atra-jwt-smoke-"))
    await d.fs.chmod(root, 0o700)
    registry.register(root, "root")
    if (typeof d.onRoot === "function") d.onRoot(root)
    const envPath = registry.register(join(root, ".dev.vars"), "env")
    const configPath = registry.register(join(root, "wrangler.hermetic.json"), "config")
    const persistTo = registry.register(join(root, "state"), "d1")
    const logPath = registry.register(join(root, "dev.log"), "log")

    // 2-4. synthetic secret + identity (secret is never a CLI argument)
    const secret = d.randomBytes(48).toString("base64url")
    if (Buffer.byteLength(secret, "utf8") < MIN_SECRET_BYTES) throw new SmokeError("secret_too_short")
    const nonce = d.randomBytes(6).toString("hex")
    const env = buildHermeticEnv(secret, nonce)

    // 5. write the ONLY secret-bearing file (0600) + temp config (0600)
    await d.fs.writeFile(envPath, renderDevVars(env), { mode: 0o600 })
    const repoConfigText = await d.fs.readFile(join(d.repoRoot, "wrangler.json"), "utf8")
    await d.fs.writeFile(configPath, buildHermeticConfig(repoConfigText, d.repoRoot), { mode: 0o600 })

    // ensure the OpenNext worker exists (build artifact, git-ignored)
    if (typeof d.ensureWorkerBuilt === "function") await d.ensureWorkerBuilt()

    // 8. bootstrap migrations + identity into the ISOLATED D1
    const wrangler = { bin: d.wranglerBin, cwd: root, configPath, persistTo }
    const boot = await d.runBootstrap({ env, repoRoot: d.repoRoot, wrangler })
    if (!boot.ok) throw new SmokeError(`bootstrap_failed:${boot.reason}`)

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
    const rows = await d.queryD1({ sql: alignmentSql(env), binding: "CONTROL_DB", label: "align", repoRoot: d.repoRoot, wrangler })
    const row = rows && rows[0] ? rows[0] : {}
    results.identity_user_exists = toNumber(row.identity_match) > 0
    results.bootstrap_subject_matches_jwt = toNumber(row.identity_match) > 0
    results.bootstrap_email_matches_jwt = toNumber(row.user_email_match) > 0
    results.active_membership_exists = toNumber(row.active_membership) > 0
    results.active_tenant_exists = toNumber(row.active_tenant) > 0

    // 9-12. start the Worker on an ephemeral port + wait for readiness
    ;({ child, port } = await startWorker(d, { runRoot: root, configPath, persistTo, logPath, timeouts: d.timeouts }))

    // 5 HTTP cases
    const inbox = `http://127.0.0.1:${port}/api/workunit/inbox`
    results.no_jwt_status = await httpStatus(d, inbox, null)
    const hs = await httpJson(d, inbox, fresh)
    results.hs256_status = hs.status
    results.work_units_key = hs.hasWorkUnits === true
    results.rs256_status = await httpStatus(d, inbox, buildRs256Token(fresh))
    const expired = await d.generateLocalJwt(env, { nowSeconds: nowSec() - 4000, ttlSeconds: 300 })
    results.expired_status = await httpStatus(d, inbox, expired)

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

    results.status = evaluatePass(results) ? "PASS" : "FAIL"
  } catch (err) {
    results.status = "FAIL"
    results.error_category = err instanceof SmokeError ? err.category : "unexpected_error"
  } finally {
    const cleanup = await performCleanup(d, { child, registry, port, repoStatusBefore, timeouts: d.timeouts })
    Object.assign(results, cleanup)
  }

  d.log(formatResults(results))
  return { ok: results.status === "PASS" && results.cleanup === true, results }
}

async function httpStatus(d, url, token) {
  const headers = token ? { authorization: `Bearer ${token}` } : {}
  const r = await d.fetchImpl(url, { method: "GET", headers })
  return typeof r.status === "number" ? r.status : 0
}

async function httpJson(d, url, token) {
  const headers = token ? { authorization: `Bearer ${token}` } : {}
  const r = await d.fetchImpl(url, { method: "GET", headers })
  let hasWorkUnits = false
  try {
    const body = await r.json()
    hasWorkUnits = body != null && typeof body === "object" && Object.prototype.hasOwnProperty.call(body, "workUnits")
  } catch {
    /* non-JSON */
  }
  return { status: typeof r.status === "number" ? r.status : 0, hasWorkUnits }
}
