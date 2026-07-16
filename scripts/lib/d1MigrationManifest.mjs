/**
 * D1 Migration Manifest — validation library (P0-PERSIST-015)
 *
 * Dependency-free (node: builtins only). The SINGLE source of truth for which
 * migration files exist, in which lane, in which order, and with which pinned
 * SHA-256 digest. Used by the migration check/plan/bootstrap/apply commands and
 * their tests.
 *
 * SAFETY:
 *   - Performs NO network access and NO SQL execution.
 *   - Never returns/logs database IDs, secrets, seed values, or SQL file
 *     contents. Failures are safe categories keyed by binding name and migration
 *     BASENAME only (basenames like `0003_tenant_persistence_foundation.sql` are
 *     non-sensitive).
 *   - Resolves every path strictly within the repository root and rejects
 *     absolute paths, `..` traversal, and symlink escapes (realpath-checked).
 */

import { readFileSync, existsSync, realpathSync, lstatSync, readdirSync } from "node:fs"
import { resolve as resolvePath, basename, isAbsolute, sep } from "node:path"
import { createHash } from "node:crypto"

export const MANIFEST_RELATIVE_PATH = "migrations/manifest.json"
export const KNOWN_BINDINGS = ["CONTROL_DB", "TENANT_DB_DEFAULT"]
export const KNOWN_KINDS = ["schema", "index"]

/**
 * How a migration may be applied.
 *   - `replay_safe`: every statement is `IF NOT EXISTS`-guarded, so the raw SQL
 *     can be re-executed against an already-migrated database. Applied every run.
 *   - `once`: the raw SQL is NOT re-runnable (SQLite has no
 *     `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`). Applied exactly once and
 *     recorded in the migration ledger; later runs skip it.
 * A required migration is NEVER hidden from operations to dodge replay-safety —
 * that produces a bootstrap schema the application cannot use.
 */
export const MIGRATION_APPLY_MODES = ["replay_safe", "once"]

const SHA256_RE = /^[0-9a-f]{64}$/
const MIGRATIONS_PREFIX = "migrations/"
const MIGRATIONS_DIR = "migrations"
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

// ─── Load ────────────────────────────────────────────────────────

/** Load + strictly parse the manifest JSON. Fails closed on any malformation. */
export function loadManifest(repoRoot) {
  const path = resolvePath(repoRoot, MANIFEST_RELATIVE_PATH)
  let text
  try {
    text = readFileSync(path, "utf8")
  } catch {
    return { ok: false, error: "manifest_unreadable" }
  }
  let value
  try {
    value = JSON.parse(text)
  } catch {
    return { ok: false, error: "manifest_unparseable" }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "manifest_structure_invalid" }
  }
  return { ok: true, manifest: value }
}

// ─── Path safety ─────────────────────────────────────────────────

function realpathSafe(p) {
  try { return realpathSync(p) } catch { return null }
}

/**
 * Resolve a manifest-declared migration path strictly inside the repo. Rejects
 * absolute paths, `..` traversal, out-of-repo resolution, and symlink escapes.
 * Returns a safe failure category (never the raw path), plus the basename.
 */
export function resolveMigrationPath(repoRoot, relPath) {
  const name = typeof relPath === "string" ? basename(relPath) : "?"
  if (typeof relPath !== "string" || relPath.length === 0) {
    return { ok: false, failure: "path_missing", name }
  }
  if (isAbsolute(relPath)) {
    return { ok: false, failure: "path_absolute", name }
  }
  if (relPath.split(/[\\/]/).includes("..")) {
    return { ok: false, failure: "path_traversal", name }
  }
  // Must live under migrations/ (the only approved migration directory).
  if (!relPath.startsWith(MIGRATIONS_PREFIX)) {
    return { ok: false, failure: "path_outside_migrations_dir", name }
  }
  const realRoot = realpathSafe(resolvePath(repoRoot)) ?? resolvePath(repoRoot)
  const resolved = resolvePath(repoRoot, relPath)
  // Nominal containment.
  if (resolved !== realRoot && !resolved.startsWith(realRoot + sep)) {
    return { ok: false, failure: "path_escapes_repo", name }
  }
  if (!existsSync(resolved)) {
    return { ok: false, failure: "migration_file_missing", name }
  }
  // A migration file must be a plain file, never a symlink (which could escape).
  let ls
  try { ls = lstatSync(resolved) } catch { return { ok: false, failure: "migration_file_missing", name } }
  if (ls.isSymbolicLink()) {
    return { ok: false, failure: "path_symlink_escape", name }
  }
  // Real path must still be inside the repo (defense in depth).
  const real = realpathSafe(resolved)
  if (!real || (real !== realRoot && !real.startsWith(realRoot + sep))) {
    return { ok: false, failure: "path_symlink_escape", name }
  }
  return { ok: true, absPath: resolved, name }
}

/** SHA-256 (hex) over the file bytes. Never returns file contents. */
export function computeDigest(absPath) {
  return createHash("sha256").update(readFileSync(absPath)).digest("hex")
}

// ─── Entry + lane validation ─────────────────────────────────────

/**
 * A `once` migration's effect probe — the deterministic schema question "did this
 * migration's change actually land?". Metadata only: it names a table + column,
 * never row data. Identifiers are validated because the verifier interpolates
 * them into a PRAGMA.
 */
export function isValidEffectProbe(effect) {
  if (!effect || typeof effect !== "object" || Array.isArray(effect)) return false
  if (effect.type !== "column_exists") return false
  return IDENT_RE.test(String(effect.table ?? "")) && IDENT_RE.test(String(effect.column ?? ""))
}

function validateEntry(repoRoot, entry, laneBinding, failures, seenPaths, seenSeq) {
  const name = entry && typeof entry.path === "string" ? basename(entry.path) : "?"
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    failures.push(`entry_structure_invalid:${laneBinding}`)
    return
  }
  if (!Number.isInteger(entry.sequence) || entry.sequence < 1) {
    failures.push(`entry_sequence_invalid:${laneBinding}:${name}`)
  }
  // The entry's declared binding MUST equal its lane — a control migration can
  // never appear in the tenant lane, or vice versa.
  if (entry.binding !== laneBinding) {
    failures.push(`binding_lane_mismatch:${laneBinding}:${name}`)
  }
  if (!KNOWN_KINDS.includes(entry.kind)) {
    failures.push(`kind_invalid:${laneBinding}:${name}`)
  }
  if (!MIGRATION_APPLY_MODES.includes(entry.apply)) {
    failures.push(`apply_mode_invalid:${laneBinding}:${name}`)
  }
  // A `once` migration MUST declare an effect probe: it is the only way the
  // ledger and the real schema can be reconciled deterministically after a
  // crash or a manual apply.
  if (entry.apply === "once" && !isValidEffectProbe(entry.effect)) {
    failures.push(`effect_probe_invalid:${laneBinding}:${name}`)
  }
  if (typeof entry.sha256 !== "string" || !SHA256_RE.test(entry.sha256)) {
    failures.push(`digest_format_invalid:${laneBinding}:${name}`)
    return
  }
  // Duplicate path / sequence detection.
  if (typeof entry.path === "string") {
    if (seenPaths.has(entry.path)) failures.push(`duplicate_path:${name}`)
    seenPaths.add(entry.path)
  }
  const seqKey = `${laneBinding}:${entry.sequence}`
  if (seenSeq.has(seqKey)) failures.push(`duplicate_sequence:${laneBinding}:${entry.sequence}`)
  seenSeq.add(seqKey)

  // Path safety + digest immutability.
  const resolved = resolveMigrationPath(repoRoot, entry.path)
  if (!resolved.ok) {
    failures.push(`${resolved.failure}:${laneBinding}:${name}`)
    return
  }
  const actual = computeDigest(resolved.absPath)
  if (actual !== entry.sha256) {
    failures.push(`digest_mismatch:${laneBinding}:${name}`)
  }
}

/**
 * Fully validate the manifest against the repository. Returns
 * `{ ok, failures }` — a list of safe category codes (never IDs/SQL/paths).
 */
export function validateManifest(manifest, repoRoot) {
  const failures = []
  if (!manifest || typeof manifest !== "object") {
    return { ok: false, failures: ["manifest_structure_invalid"] }
  }
  const lanes = manifest.lanes
  if (!lanes || typeof lanes !== "object" || Array.isArray(lanes)) {
    return { ok: false, failures: ["lanes_missing"] }
  }
  const seenPaths = new Set()
  const seenSeq = new Set()

  // Only known bindings may key a lane.
  for (const laneKey of Object.keys(lanes)) {
    if (!KNOWN_BINDINGS.includes(laneKey)) failures.push(`unknown_binding:${laneKey}`)
  }
  // Both required lanes must be present + non-empty + validated.
  for (const binding of KNOWN_BINDINGS) {
    const lane = lanes[binding]
    if (!Array.isArray(lane) || lane.length === 0) {
      failures.push(`lane_empty:${binding}`)
      continue
    }
    for (const entry of lane) validateEntry(repoRoot, entry, binding, failures, seenPaths, seenSeq)
  }

  // `deferred` is NOT a supported concept. A committed migration parked outside
  // the lanes is invisible to `migrations:plan`/`bootstrap` and silently yields a
  // schema the application cannot use (this is exactly how action_previews shipped
  // without created_by_user_id). Non-idempotent SQL is expressed with
  // `apply: "once"` + the ledger — never by hiding the migration.
  if ("deferred" in manifest) failures.push("deferred_migrations_not_supported")

  // Completeness: every committed migration file must be in exactly one lane.
  for (const name of listCommittedMigrationFiles(repoRoot)) {
    if (!seenPaths.has(`${MIGRATIONS_PREFIX}${name}`)) failures.push(`migration_not_in_any_lane:${name}`)
  }

  // The canonical tenant registry schema version, bound to the lane it describes.
  validateRegistry(manifest, failures)

  return { ok: failures.length === 0, failures }
}

/**
 * Committed migration basenames, sorted. Never reads file contents.
 *
 * Only conventionally NUMBERED migrations (`NNNN_name.sql`) count. That is the risk
 * the completeness rule exists to close: a file that looks like part of the ordered
 * sequence but is invisible to operations — exactly how 0006 shipped outside the
 * lanes. A `migrations/` file that is not numbered is not part of the sequence and
 * is inert unless a lane references it, in which case it is validated as a lane
 * member anyway.
 *
 * It also keeps the rule from being non-deterministic: tests write transient
 * `_scratch.sql` fixtures here, and the runner executes test files in parallel, so
 * counting every `.sql` would make an unrelated suite's manifest validation fail
 * depending on timing.
 */
const NUMBERED_MIGRATION_RE = /^\d{4}_[A-Za-z0-9_]+\.sql$/

export function listCommittedMigrationFiles(repoRoot) {
  let entries
  try { entries = readdirSync(resolvePath(repoRoot, MIGRATIONS_DIR)) } catch { return [] }
  return entries.filter((n) => NUMBERED_MIGRATION_RE.test(n)).sort()
}

// ─── Ordered plan ────────────────────────────────────────────────

/**
 * Deterministic ordered plan for a binding: the lane sorted by sequence. Returns
 * only safe fields (binding, sequence, path, name, kind, apply, effect, sha256).
 * Never resolves DB IDs and never reads SQL contents.
 */
export function buildPlan(manifest, binding) {
  const lane = manifest && manifest.lanes && Array.isArray(manifest.lanes[binding]) ? manifest.lanes[binding] : []
  return [...lane]
    .sort((a, b) => a.sequence - b.sequence)
    .map((e) => ({
      binding,
      sequence: e.sequence,
      path: e.path,
      name: basename(e.path),
      kind: e.kind,
      apply: e.apply,
      effect: e.effect,
      sha256: e.sha256,
    }))
}

/** Ordered plans for every known binding. */
export function buildAllPlans(manifest) {
  const plans = {}
  for (const binding of KNOWN_BINDINGS) plans[binding] = buildPlan(manifest, binding)
  return plans
}

/**
 * SQL-safety scan: every manifest migration (lane + deferred) must be pure DDL.
 * A migration must NEVER seed data — no INSERT / REPLACE / UPDATE / DELETE — and
 * must not ATTACH another database. This enforces "no migration inserts a default
 * production tenant, user, identity, membership, API key, or provider credential."
 * Comments are stripped first. Returns safe category codes keyed by basename.
 */
export function scanMigrationSqlSafety(repoRoot, manifest) {
  const failures = []
  const steps = []
  for (const binding of KNOWN_BINDINGS) for (const e of buildPlan(manifest, binding)) steps.push(e.path)
  const forbidden = [
    { code: "insert", re: /\binsert\b/i },
    { code: "replace_into", re: /\breplace\s+into\b/i },
    { code: "update", re: /\bupdate\b/i },
    { code: "delete", re: /\bdelete\b/i },
    { code: "attach", re: /\battach\b/i },
  ]
  for (const relPath of steps) {
    const name = basename(relPath)
    const resolved = resolveMigrationPath(repoRoot, relPath)
    if (!resolved.ok) { failures.push(`${resolved.failure}:${name}`); continue }
    let sql = readFileSync(resolved.absPath, "utf8")
    sql = sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "")
    for (const f of forbidden) if (f.re.test(sql)) failures.push(`forbidden_sql_${f.code}:${name}`)
  }
  return { ok: failures.length === 0, failures }
}

// ─── Registry schema version (canonical) ─────────────────────────

/**
 * The ONE canonical source of the tenant registry's `schema_version`.
 *
 * `tenant_databases.schema_version` must not be an arbitrary operator-supplied
 * digit string: it names WHICH tenant schema the registry row claims the database
 * has. The tenant resolver's bounded format check (digits, bounded length) is
 * necessary but cannot tell a correct version from a plausible one.
 *
 * The version is PINNED alongside a digest of the tenant lane it describes, so the
 * active migration plan cannot change without the version being reconsidered —
 * `validateManifest` fails with `registry_plan_digest_mismatch` until both are
 * updated together.
 */
export const REGISTRY_BINDING = "TENANT_DB_DEFAULT"
const SCHEMA_VERSION_RE = /^[0-9]{1,10}$/

/** Deterministic digest of a binding's ordered lane (safe: names + modes + digests). */
export function computeRegistryPlanDigest(manifest, binding = REGISTRY_BINDING) {
  const parts = buildPlan(manifest, binding).map((e) => `${e.sequence}:${e.name}:${e.apply}:${e.sha256}`)
  return createHash("sha256").update(parts.join("\n")).digest("hex")
}

/**
 * The canonical tenant registry schema version, or `null` when the manifest does
 * not declare one (which `validateManifest` rejects). Never guessed or derived
 * from operator input.
 */
export function tenantRegistrySchemaVersion(manifest) {
  const declared = manifest && manifest.registry && manifest.registry[REGISTRY_BINDING]
  const version = declared && declared.schemaVersion
  return typeof version === "string" && SCHEMA_VERSION_RE.test(version) ? version : null
}

function validateRegistry(manifest, failures) {
  const declared = manifest.registry && manifest.registry[REGISTRY_BINDING]
  if (!declared || typeof declared !== "object") { failures.push(`registry_missing:${REGISTRY_BINDING}`); return }
  if (tenantRegistrySchemaVersion(manifest) === null) failures.push(`registry_schema_version_invalid:${REGISTRY_BINDING}`)
  if (typeof declared.planDigest !== "string" || !SHA256_RE.test(declared.planDigest)) {
    failures.push(`registry_plan_digest_invalid:${REGISTRY_BINDING}`)
    return
  }
  // The version is bound to the plan it describes: changing the active lane
  // without reconsidering the registry schema version fails closed here.
  if (computeRegistryPlanDigest(manifest, REGISTRY_BINDING) !== declared.planDigest) {
    failures.push(`registry_plan_digest_mismatch:${REGISTRY_BINDING}`)
  }
}

/** SHA-256 digest of the manifest's pinned-digest set (safe, ID-free). */
export function manifestDigest(manifest) {
  const parts = []
  for (const binding of KNOWN_BINDINGS) {
    for (const e of buildPlan(manifest, binding)) parts.push(`${binding}:${e.sequence}:${e.name}:${e.apply}:${e.sha256}`)
  }
  return createHash("sha256").update(parts.join("\n")).digest("hex")
}
