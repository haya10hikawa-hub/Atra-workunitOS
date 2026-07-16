/**
 * Cloudflare Deploy Config — shared validation library
 *
 * Dependency-free (node: builtins only). Used by:
 *   - scripts/cloudflare-deploy-preflight.mjs
 *   - scripts/cloudflare-deploy-prepare.mjs
 *   - scripts/cloudflare-deploy-dry-run.mjs
 *   - scripts/cloudflare-deploy.mjs
 *   - tests/cloudflareDeployConfig.test.mts
 *
 * SAFETY:
 *   - Never returns or logs real database IDs — failures are category-level,
 *     keyed by safe binding/field names only.
 *   - Performs NO network access and NO deployment.
 *   - Fails closed on ambiguous / malformed input.
 */

import { readFileSync, existsSync, statSync, realpathSync, lstatSync } from "node:fs"
import { resolve as resolvePath, dirname, basename as pathBasename } from "node:path"

// ─── Expected Workers/OpenNext target ────────────────────────────

export const EXPECTED_WORKER_MAIN = ".open-next/worker.js"
export const EXPECTED_ASSETS_DIR = ".open-next/assets"
export const REQUIRED_COMPAT_FLAG = "nodejs_compat"
export const REQUIRED_D1_BINDINGS = ["CONTROL_DB", "TENANT_DB_DEFAULT"]

// Generated deploy configs (carrying real D1 IDs) live at the repo root under
// this basename prefix and are git-ignored via `/wrangler.deploy*.json`. They
// MUST sit at the repo root so wrangler resolves `main`/`assets` relative to it.
export const GENERATED_CONFIG_BASENAME_RE = /^wrangler\.deploy[.\w-]*\.json$/

// The exact `.gitignore` rule that MUST ignore generated deploy configs.
export const GENERATED_CONFIG_GITIGNORE_RULE = "/wrangler.deploy*.json"

/**
 * Strictly validate that a config carrying real D1 IDs lives at the approved,
 * git-ignored location: EXACTLY a repository-root file named `wrangler.deploy*.json`.
 *
 * Fails closed on: paths outside repoRoot, any subdirectory, a non-approved
 * basename, and symlink/traversal escapes (resolved via realpath where the path
 * or its parent exists). Returns a safe category string, never the path value.
 */
export function validateGeneratedConfigLocation(configPath, repoRoot) {
  if (typeof configPath !== "string" || configPath.length === 0) {
    return { ok: false, failure: "generated_config_path_missing" }
  }
  const realRoot = realpathSyncSafe(resolvePath(repoRoot))
  const resolved = resolvePath(configPath)
  const parent = dirname(resolved)
  // Resolve symlinks on the parent dir where it exists — a symlinked parent that
  // escapes the repo root is rejected. The file itself may not exist yet.
  const realParent = realpathSyncSafe(parent)

  // The file's (real) parent directory must be exactly the (real) repo root.
  if (realParent !== realRoot) {
    // Distinguish subdirectory-within-repo from fully-outside for clearer signal.
    if (realParent === parent && (parent === realRoot || parent.startsWith(realRoot + "/"))) {
      return { ok: false, failure: "generated_config_in_subdirectory" }
    }
    if (parent.startsWith(realRoot + "/")) {
      // parent is nominally under root but realpath differs → symlink escape.
      return { ok: false, failure: "generated_config_symlink_escape" }
    }
    return { ok: false, failure: "generated_config_outside_repo_root" }
  }

  // Basename must be an approved generated-config filename.
  if (!GENERATED_CONFIG_BASENAME_RE.test(pathBasename(resolved))) {
    return { ok: false, failure: "generated_config_not_ignored" }
  }

  // Reject a config file that is ITSELF a symbolic link — a generated config must
  // be a plain repository-root file, never a link that could escape the repo (a
  // valid parent + basename is not sufficient). `lstat` does not follow the link.
  // A not-yet-created path (prepare stage) has no lstat and is allowed.
  let linkStat = null
  try {
    linkStat = lstatSync(resolved)
  } catch {
    linkStat = null
  }
  if (linkStat && linkStat.isSymbolicLink()) {
    return { ok: false, failure: "generated_config_symlink_escape" }
  }

  return { ok: true }
}

/** realpathSync that falls back to the input when the path does not exist yet. */
function realpathSyncSafe(p) {
  try {
    return realpathSync(p)
  } catch {
    return p
  }
}

// Pages-only directives that must never appear in a Workers config.
export const PAGES_ONLY_KEYS = ["pages_build_output_dir"]

// Markers that indicate a non-real placeholder ID.
export const PLACEHOLDER_MARKERS = ["REPLACE", "PLACEHOLDER", "TODO", "CHANGEME", "XXXX"]

// Cloudflare D1 database IDs are UUIDs (8-4-4-4-12 hex).
export const D1_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Synthetic, clearly non-production IDs for self-check / dry-run / CI.
export const SYNTHETIC_D1_IDS = {
  CONTROL_DB: "00000000-0000-4000-8000-000000000001",
  TENANT_DB_DEFAULT: "00000000-0000-4000-8000-000000000002",
}

// ─── D1 ID validation ────────────────────────────────────────────

/**
 * Validate a D1 database ID as a bounded, non-placeholder UUID.
 * Returns a safe reason category ("empty" | "placeholder" | "malformed") — never
 * echoes the value.
 */
export function validateD1Id(id) {
  if (typeof id !== "string" || id.length === 0) return { ok: false, reason: "empty" }
  if (id.length > 64) return { ok: false, reason: "malformed" }
  const upper = id.toUpperCase()
  if (PLACEHOLDER_MARKERS.some((m) => upper.includes(m))) {
    return { ok: false, reason: "placeholder" }
  }
  if (!D1_ID_RE.test(id)) return { ok: false, reason: "malformed" }
  return { ok: true }
}

// Cloudflare D1 database names: lowercase alphanumerics and dashes, bounded.
export const D1_NAME_RE = /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/
export const D1_NAME_MAX_LENGTH = 64

/**
 * Validate a D1 `database_name` as a bounded, non-placeholder, approved-charset
 * name. Returns a safe reason category — never echoes the value.
 *
 * A name is not merely cosmetic: it is what an operator reads to tell the control
 * registry from tenant storage, and what the bootstrap registry row must match.
 */
export function validateD1Name(name) {
  if (typeof name !== "string" || name.length === 0) return { ok: false, reason: "empty" }
  if (name.length > D1_NAME_MAX_LENGTH) return { ok: false, reason: "malformed" }
  if (PLACEHOLDER_MARKERS.some((m) => name.toUpperCase().includes(m))) return { ok: false, reason: "placeholder" }
  if (!D1_NAME_RE.test(name)) return { ok: false, reason: "malformed" }
  return { ok: true }
}

// ─── Config parsing ──────────────────────────────────────────────

/** Parse strict JSON config text. Fails closed on malformed input. */
export function parseConfig(text) {
  try {
    const value = JSON.parse(text)
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { ok: false, error: "config_unparseable" }
    }
    return { ok: true, config: value }
  } catch {
    return { ok: false, error: "config_unparseable" }
  }
}

/** Load and parse a JSON config file. */
export function loadConfigFile(path) {
  let text
  try {
    text = readFileSync(path, "utf8")
  } catch {
    return { ok: false, error: "config_unreadable" }
  }
  return parseConfig(text)
}

/**
 * Produce a deploy config from a base config by injecting real/synthetic D1 IDs.
 * Deep-clones the base so the source is never mutated.
 */
export function buildConfigWithIds(base, ids) {
  const clone = structuredClone(base)
  const dbs = Array.isArray(clone.d1_databases) ? clone.d1_databases : []
  for (const db of dbs) {
    if (db && typeof db === "object" && typeof db.binding === "string") {
      if (Object.prototype.hasOwnProperty.call(ids, db.binding)) {
        db.database_id = ids[db.binding]
      }
    }
  }
  return clone
}

// ─── Config validation ───────────────────────────────────────────

/**
 * Validate a resolved *deploy* config (Workers/OpenNext target with concrete
 * D1 IDs). Returns { ok, failures } where failures is a list of safe,
 * category-level codes. Never includes any database ID value.
 *
 * options:
 *   - checkArtifacts: also require the generated worker + assets to exist.
 *   - repoRoot: root used to resolve artifact paths (default: cwd).
 *   - configPath: when set, enforce that a config carrying real (non-placeholder)
 *     IDs lives under the ignored deploy dir.
 *   - allowPlaceholderIds: skip D1 ID value validation (base-structure check only).
 */
export function validateDeployConfig(config, options = {}) {
  const failures = []
  const { checkArtifacts = false, repoRoot = process.cwd(), configPath, allowPlaceholderIds = false } = options

  // Target: no Pages-only directives.
  for (const key of PAGES_ONLY_KEYS) {
    if (key in config) failures.push(`pages_directive_present:${key}`)
  }

  // Target: Workers entrypoint.
  if (config.main !== EXPECTED_WORKER_MAIN) {
    failures.push("worker_main_mismatch")
  }

  // Assets.
  const assets = config.assets
  if (!assets || typeof assets !== "object" || assets.directory !== EXPECTED_ASSETS_DIR) {
    failures.push("assets_dir_mismatch")
  }

  // Compatibility flags.
  const flags = Array.isArray(config.compatibility_flags) ? config.compatibility_flags : []
  if (!flags.includes(REQUIRED_COMPAT_FLAG)) {
    failures.push("compat_flags_missing")
  }
  if (typeof config.compatibility_date !== "string" || config.compatibility_date.length === 0) {
    failures.push("compat_date_missing")
  }

  // Safe-default vars.
  const vars = config.vars && typeof config.vars === "object" ? config.vars : {}
  if (vars.EXTERNAL_ACTIONS_ENABLED !== "false") {
    failures.push("external_actions_not_false")
  }
  if (vars.ALLOW_LEGACY_INGEST_FALLBACK !== "false") {
    failures.push("legacy_ingest_not_false")
  }

  // D1 bindings: required, unique, EXACTLY the approved set, valid IDs.
  const dbs = Array.isArray(config.d1_databases) ? config.d1_databases : []
  const seen = new Map()
  for (const db of dbs) {
    if (!db || typeof db !== "object" || typeof db.binding !== "string") {
      failures.push("d1_binding_malformed")
      continue
    }
    seen.set(db.binding, (seen.get(db.binding) ?? 0) + 1)
    // Exact allowlist: a deploy config must not silently gain extra database
    // capabilities. Only CONTROL_DB and TENANT_DB_DEFAULT are approved D1 bindings.
    if (!REQUIRED_D1_BINDINGS.includes(db.binding)) {
      failures.push(`d1_binding_unknown:${db.binding}`)
    }
  }
  for (const name of REQUIRED_D1_BINDINGS) {
    const count = seen.get(name) ?? 0
    if (count === 0) {
      failures.push(`d1_binding_missing:${name}`)
    } else if (count > 1) {
      failures.push(`d1_binding_duplicate:${name}`)
    }
  }

  // ── Physical separation ──────────────────────────────────────
  // `CONTROL_DB is never tenant-data storage` is an ARCHITECTURE guarantee, not a
  // naming convention: the control registry holds tenants/users/identities and
  // decides which database a tenant's data lives in. Validating each ID on its own
  // cannot see that the same physical database was assigned to both bindings —
  // which would put tenant rows inside the control registry and let a tenant lane
  // migrate the control database. The two bindings must therefore be DIFFERENT
  // physical databases, and this check belongs to the SHARED validator so every
  // command (prepare, preflight, dry-run, deploy, migration apply, bootstrap apply,
  // remote verification) inherits it.
  //
  // Deliberately independent of `allowPlaceholderIds`: the rule is about CONCRETE
  // ids. It compares only once both bindings carry individually valid, non-
  // placeholder ids, so the committed placeholder config is unaffected.
  const controlEntry = dbs.find((d) => d && d.binding === "CONTROL_DB")
  const tenantEntry = dbs.find((d) => d && d.binding === "TENANT_DB_DEFAULT")
  if (controlEntry && tenantEntry
    && validateD1Id(controlEntry.database_id).ok && validateD1Id(tenantEntry.database_id).ok
    && controlEntry.database_id === tenantEntry.database_id) {
    // Category only — never the id.
    failures.push("d1_database_id_collision:CONTROL_DB:TENANT_DB_DEFAULT")
  }

  // Every required binding needs a real, bounded, non-placeholder name…
  for (const binding of REQUIRED_D1_BINDINGS) {
    const entry = dbs.find((d) => d && d.binding === binding)
    if (!entry) continue // missing already reported
    const res = validateD1Name(entry.database_name)
    if (!res.ok) failures.push(`d1_name_${res.reason}:${binding}`)
  }
  // …and the two approved bindings must be distinguishable. Wrangler resolves a D1
  // binding by id, so an alias would not by itself misroute — but two bindings
  // sharing one name make every operator-facing artifact (plan output, wrangler
  // prompts, the bootstrap registry row that must match `TENANT_DB_DEFAULT`)
  // ambiguous about which database is meant. Fail closed on distinct names.
  if (controlEntry && tenantEntry
    && validateD1Name(controlEntry.database_name).ok && validateD1Name(tenantEntry.database_name).ok
    && controlEntry.database_name === tenantEntry.database_name) {
    failures.push("d1_database_name_collision:CONTROL_DB:TENANT_DB_DEFAULT")
  }

  if (!allowPlaceholderIds) {
    let hasRealId = false
    for (const name of REQUIRED_D1_BINDINGS) {
      const entry = dbs.find((d) => d && d.binding === name)
      if (!entry) continue // missing already reported
      const res = validateD1Id(entry.database_id)
      if (!res.ok) {
        failures.push(`d1_id_${res.reason}:${name}`)
      } else {
        hasRealId = true
      }
    }
    // A config carrying real IDs must be an approved, git-ignored generated
    // config: EXACTLY a repository-root `wrangler.deploy*.json` — never the
    // committed base, a subdirectory, an outside path, or a symlink escape.
    if (hasRealId && configPath) {
      const loc = validateGeneratedConfigLocation(configPath, repoRoot)
      if (!loc.ok) failures.push(loc.failure)
    }
  }

  // Artifact existence (post-build).
  if (checkArtifacts) {
    const workerPath = `${repoRoot}/${EXPECTED_WORKER_MAIN}`
    const assetsPath = `${repoRoot}/${EXPECTED_ASSETS_DIR}`
    if (!existsSync(workerPath) || !statSync(workerPath).isFile()) {
      failures.push("worker_artifact_missing")
    }
    if (!existsSync(assetsPath) || !statSync(assetsPath).isDirectory()) {
      failures.push("assets_artifact_missing")
    }
  }

  return { ok: failures.length === 0, failures }
}
