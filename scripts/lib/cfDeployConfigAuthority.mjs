/**
 * Deploy-config AUTHORITY — one shared snapshot for every remote D1 command
 * (P0-PERSIST-015)
 *
 * WHY THIS EXISTS
 * ---------------
 * The generated deploy config is authority-bearing: it selects the physical
 * databases and the Worker deployment configuration. Validating one read and then
 * handing Wrangler the original mutable path leaves a validate-then-execute window.
 * That was closed for the bootstrap in an earlier repair, but migration apply,
 * standalone remote schema verification, and the Worker deploy orchestrator still
 * re-read `wrangler.deploy.json` at execution time. Reproduced against the audited
 * head: a post-validation edit REDIRECTED a schema-verification query to a different
 * database mid-run, and `verify-remote-schema` and `deploy` each re-read the file
 * independently — so the config verified and the config deployed could differ.
 *
 * This library is the ONE implementation. A command loads authority once, writes a
 * single private execution config from the EXACT retained bytes, and gives Wrangler
 * only that. There is deliberately no bootstrap-only variant.
 *
 * A FILESYSTEM PATH IS NOT AUTHORITY
 * ----------------------------------
 * An earlier repair wrote ONE private execution config per command and reused its
 * PATH for every Wrangler invocation. A path is a mutable filesystem file: it can be
 * altered between the Control and Tenant migration operations, between remote
 * verification queries, or after remote schema verification but before the Worker
 * upload. Path identity across two invocations is therefore NOT proof that both
 * executed the same bytes.
 *
 * The authority is the retained bytes and their SHA-256. Every Wrangler invocation
 * gets its OWN short-lived config, derived directly from the retained bytes and
 * removed the instant its one call returns (`withPrivateExecutionConfig`). No
 * reusable mutable file serves as authority between invocations, so mutating an
 * earlier scoped file cannot redirect a later call.
 *
 * SAFETY:
 *   - Dependency-free (node: builtins + the shared validator).
 *   - Performs NO network access and NO SQL.
 *   - Failures are safe categories. NEVER returns a database ID, database name,
 *     config content, raw filesystem path, or secret.
 *   - The EXACT validated bytes are the execution authority — never a later
 *     `JSON.stringify` of a mutable parsed object.
 *   - `authority.sha256` is safe evidence: it is a digest over the exact bytes and
 *     contains no database ID or config content. It is NEVER written into the config
 *     file; it exists only in memory, to bind verification and deploy by byte
 *     identity rather than by a false same-path claim.
 */

import { readFileSync, writeFileSync, lstatSync, rmSync, chmodSync } from "node:fs"
import { resolve as resolvePath } from "node:path"
import { randomBytes, createHash } from "node:crypto"
import { validateDeployConfig, validateGeneratedConfigLocation } from "./cfDeployConfig.mjs"

/** SHA-256 hex of the exact bytes — the safe authority digest. */
function digestOf(bytes) {
  return createHash("sha256").update(bytes).digest("hex")
}

/** Hard size cap, enforced BEFORE the config is read or parsed. */
export const DEPLOY_CONFIG_MAX_BYTES = 64 * 1024

/**
 * Recursively freeze a parsed config so no later step can quietly retarget the
 * write in memory. A shallow `Object.freeze` would leave
 * `config.d1_databases[0].database_id` writable — i.e. the one field that decides
 * which physical database is hit.
 */
export function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value
  // Freeze BEFORE recursing: `Object.isFrozen` is then the cycle guard. Freezing
  // afterwards would recurse forever on a self-referential object, since the node
  // is still unfrozen when its own child is visited.
  Object.freeze(value)
  for (const key of Object.getOwnPropertyNames(value)) deepFreeze(value[key])
  return value
}

/**
 * Load, validate, and RETAIN a deploy config as an immutable authority.
 *
 * Order matters: location → type → permissions → size → single read → size
 * re-check → strict parse → shared validation. Nothing is read before we have
 * established it is a plain, private file at the approved location, and nothing is
 * parsed before the size is bounded.
 *
 * Returns `{ ok: true, authority }` where `authority` is:
 *   - `bytes`    — the EXACT validated bytes (the execution authority);
 *   - `sha256`   — the digest over those exact bytes (safe evidence);
 *   - `snapshot` — a recursively immutable parsed view, for comparisons only.
 * On failure returns `{ ok: false, blocked: [...] }` with safe categories only, and
 * NO authority bytes.
 */
export function loadValidatedDeployConfigAuthority({ configPath, repoRoot, allowPlaceholderIds = false } = {}) {
  if (!configPath) return { ok: false, blocked: ["missing_config"] }

  // An approved, git-ignored repository-root `wrangler.deploy*.json` — never the
  // committed base, a subdirectory, an outside path, or a symlink. The location
  // check already refuses a symlinked config; keep that distinction rather than
  // collapsing it, so an operator sees WHY.
  const location = validateGeneratedConfigLocation(configPath, repoRoot)
  if (!location.ok) {
    return { ok: false, blocked: [location.failure === "generated_config_symlink_escape" ? "deploy_config_symlink" : "deploy_config_unapproved_location"] }
  }

  let stats
  try { stats = lstatSync(configPath) } catch { return { ok: false, blocked: ["deploy_config_unreadable"] } }
  // Defence in depth — `lstat` again, so a symlink is seen rather than followed.
  if (stats.isSymbolicLink()) return { ok: false, blocked: ["deploy_config_symlink"] }
  if (!stats.isFile()) return { ok: false, blocked: ["deploy_config_not_plain_file"] }
  if ((stats.mode & 0o777 & ~0o600) !== 0) return { ok: false, blocked: ["deploy_config_permissions_too_broad"] }
  if (stats.size > DEPLOY_CONFIG_MAX_BYTES) return { ok: false, blocked: ["deploy_config_too_large"] }

  // EXACTLY ONE read. Everything downstream uses these retained bytes.
  let bytes
  try { bytes = readFileSync(configPath, "utf8") } catch { return { ok: false, blocked: ["deploy_config_unreadable"] } }
  // `lstat` and `read` are two syscalls — the file could have grown between them.
  if (Buffer.byteLength(bytes) > DEPLOY_CONFIG_MAX_BYTES) return { ok: false, blocked: ["deploy_config_too_large"] }

  let parsed
  try { parsed = JSON.parse(bytes) } catch { return { ok: false, blocked: ["deploy_config_unparseable"] } }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, blocked: ["deploy_config_unparseable"] }

  // The shared validator — including physical separation of CONTROL_DB and
  // TENANT_DB_DEFAULT and strict database-name rules.
  if (!validateDeployConfig(parsed, { configPath, repoRoot, allowPlaceholderIds }).ok) {
    return { ok: false, blocked: ["deploy_config_invalid"] }
  }

  return { ok: true, authority: Object.freeze({ bytes, sha256: digestOf(bytes), snapshot: deepFreeze(parsed) }) }
}

/** Hard size cap for a scoped execution config — the same bound as the source. */
const SCOPED_CONFIG_MAX_BYTES = DEPLOY_CONFIG_MAX_BYTES

/**
 * Confirm, immediately before it is handed to Wrangler, that a scoped config is
 * EXACTLY the retained authority: a plain private file at the approved location,
 * whose bytes hash to `authority.sha256`. This is what makes byte identity — not a
 * path — the guarantee: even if something raced the file between creation and use,
 * a single non-matching byte is refused before the call.
 *
 * Throws a safe category error (never a path or config content).
 */
function assertScopedConfigMatchesAuthority(path, authority, repoRoot) {
  const location = validateGeneratedConfigLocation(path, repoRoot)
  if (!location.ok) throw new Error("scoped_config_unapproved_location")
  const stats = lstatSync(path)
  if (stats.isSymbolicLink()) throw new Error("scoped_config_symlink")
  if (!stats.isFile()) throw new Error("scoped_config_not_plain_file")
  // Never broader than 0600 — normal execution tightens to 0400.
  if ((stats.mode & 0o777 & ~0o600) !== 0) throw new Error("scoped_config_permissions_too_broad")
  if (stats.size > SCOPED_CONFIG_MAX_BYTES) throw new Error("scoped_config_too_large")
  if (stats.size !== Buffer.byteLength(authority.bytes)) throw new Error("scoped_config_size_mismatch")
  const actual = readFileSync(path, "utf8")
  if (digestOf(actual) !== authority.sha256) throw new Error("scoped_config_bytes_mismatch")
}

/**
 * Run ONE Wrangler-invoking `operation` against a short-lived config that carries
 * the authority's EXACT retained bytes, and remove that config the instant the
 * operation returns.
 *
 * This is the ONLY way execution bytes reach Wrangler. There is deliberately no API
 * that returns a reusable path: a long-lived private file is still a mutable
 * filesystem file, and one that survives between two Wrangler calls can be altered
 * in between to redirect the second call. A fresh lease per invocation closes that
 * window — the file exists only inside `operation`, is verified to equal the
 * authority before the call, and is gone before the next lease is taken.
 *
 * Behaviour:
 *   - the filename is collision-resistant, carries NO database ID, and matches the
 *     approved generated-config form (`wrangler.deploy*.json`) at the repository
 *     root, so Wrangler resolves it as a normal generated config and `.gitignore`
 *     already covers it;
 *   - the file is created EXCLUSIVELY (`wx`) — a pre-placed file is never overwritten
 *     or followed — with the EXACT retained bytes, then tightened to read-only
 *     (0400, never broader than 0600);
 *   - before the callback it is re-confirmed to be a plain private file at the
 *     approved location whose bytes hash to `authority.sha256`;
 *   - the callback receives ONLY the path, and it is removed in `finally` on success
 *     or throw. The path is never returned to, cached by, or reused across callers.
 *
 * `purpose` only labels the file for an operator reading `ls`; it never carries a
 * value and is constrained to a safe token.
 */
export function withPrivateExecutionConfig(authority, { repoRoot, purpose = "exec" } = {}, operation) {
  if (!authority || typeof authority.bytes !== "string" || authority.bytes.length === 0) {
    throw new Error("execution_authority_missing")
  }
  if (typeof authority.sha256 !== "string" || authority.sha256.length === 0) {
    throw new Error("execution_authority_missing")
  }
  if (typeof operation !== "function") throw new Error("execution_operation_missing")
  const label = /^[a-z][a-z0-9-]{0,23}$/.test(purpose) ? purpose : "exec"
  const path = resolvePath(repoRoot, `wrangler.deploy.${label}-${randomBytes(12).toString("hex")}.json`)
  try {
    // The EXACT validated bytes — never a re-read of the original, never a rebuild
    // from a mutable parsed object or from environment variables. Exclusive creation
    // first, then read-only, so the file Wrangler reads can never be rewritten.
    writeFileSync(path, authority.bytes, { mode: 0o600, flag: "wx" })
    chmodSync(path, 0o400)
    assertScopedConfigMatchesAuthority(path, authority, repoRoot)
    return operation(path)
  } finally {
    // Unconditional, on success or throw — a scoped config never outlives its call.
    rmSync(path, { force: true })
  }
}
