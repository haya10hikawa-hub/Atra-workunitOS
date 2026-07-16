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
 * SAFETY:
 *   - Dependency-free (node: builtins + the shared validator).
 *   - Performs NO network access and NO SQL.
 *   - Failures are safe categories. NEVER returns a database ID, database name,
 *     config content, raw filesystem path, or secret.
 *   - The EXACT validated bytes are the execution authority — never a later
 *     `JSON.stringify` of a mutable parsed object.
 */

import { readFileSync, writeFileSync, lstatSync, rmSync } from "node:fs"
import { resolve as resolvePath } from "node:path"
import { randomBytes } from "node:crypto"
import { validateDeployConfig, validateGeneratedConfigLocation } from "./cfDeployConfig.mjs"

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

  return { ok: true, authority: Object.freeze({ bytes, snapshot: deepFreeze(parsed) }) }
}

/**
 * Write the authority's EXACT retained bytes to a fresh private execution config
 * and return only its path.
 *
 * The filename is collision-resistant and carries NO database ID; it matches the
 * approved generated-config form (`wrangler.deploy*.json`) at the repository root,
 * so Wrangler resolves it exactly as a normal generated config and `.gitignore`'s
 * `/wrangler.deploy*.json` already covers it. Exclusive creation (`wx`) means an
 * existing file can never be overwritten or followed.
 *
 * `purpose` only labels the file for an operator reading `ls`; it never carries a
 * value and is constrained to a safe token.
 */
export function createPrivateExecutionConfig(authority, { repoRoot, purpose = "exec" } = {}) {
  if (!authority || typeof authority.bytes !== "string" || authority.bytes.length === 0) {
    throw new Error("execution_authority_missing")
  }
  const label = /^[a-z][a-z0-9-]{0,23}$/.test(purpose) ? purpose : "exec"
  const path = resolvePath(repoRoot, `wrangler.deploy.${label}-${randomBytes(12).toString("hex")}.json`)
  // The EXACT validated bytes — never a re-read of the original, never a rebuild
  // from a mutable parsed object or from environment variables.
  writeFileSync(path, authority.bytes, { mode: 0o600, flag: "wx" })
  return path
}

/** Remove a private execution config. Safe to call with null/undefined. */
export function removePrivateExecutionConfig(path) {
  rmSync(path ?? "", { force: true })
}
