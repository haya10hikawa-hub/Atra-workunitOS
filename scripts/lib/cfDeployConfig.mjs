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

import { readFileSync, existsSync, statSync } from "node:fs"

// ─── Expected Workers/OpenNext target ────────────────────────────

export const EXPECTED_WORKER_MAIN = ".open-next/worker.js"
export const EXPECTED_ASSETS_DIR = ".open-next/assets"
export const REQUIRED_COMPAT_FLAG = "nodejs_compat"
export const REQUIRED_D1_BINDINGS = ["CONTROL_DB", "TENANT_DB_DEFAULT"]

// Generated deploy configs (carrying real D1 IDs) live at the repo root under
// this basename prefix and are git-ignored via `/wrangler.deploy*.json`. They
// MUST sit at the repo root so wrangler resolves `main`/`assets` relative to it.
export const GENERATED_CONFIG_BASENAME_RE = /^wrangler\.deploy[.\w-]*\.json$/

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

  // D1 bindings: required, unique, valid IDs.
  const dbs = Array.isArray(config.d1_databases) ? config.d1_databases : []
  const seen = new Map()
  for (const db of dbs) {
    if (!db || typeof db !== "object" || typeof db.binding !== "string") {
      failures.push("d1_binding_malformed")
      continue
    }
    seen.set(db.binding, (seen.get(db.binding) ?? 0) + 1)
  }
  for (const name of REQUIRED_D1_BINDINGS) {
    const count = seen.get(name) ?? 0
    if (count === 0) {
      failures.push(`d1_binding_missing:${name}`)
    } else if (count > 1) {
      failures.push(`d1_binding_duplicate:${name}`)
    }
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
    // config (basename `wrangler.deploy*.json`), never the committed base.
    if (hasRealId && configPath) {
      const basename = configPath.split("\\").join("/").split("/").pop() ?? ""
      if (!GENERATED_CONFIG_BASENAME_RE.test(basename)) {
        failures.push("generated_config_not_ignored")
      }
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
