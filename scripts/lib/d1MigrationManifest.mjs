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

import { readFileSync, existsSync, realpathSync, lstatSync } from "node:fs"
import { resolve as resolvePath, basename, isAbsolute, sep } from "node:path"
import { createHash } from "node:crypto"

export const MANIFEST_RELATIVE_PATH = "migrations/manifest.json"
export const KNOWN_BINDINGS = ["CONTROL_DB", "TENANT_DB_DEFAULT"]
export const KNOWN_KINDS = ["schema", "index"]
const SHA256_RE = /^[0-9a-f]{64}$/
const MIGRATIONS_PREFIX = "migrations/"

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
  if (typeof entry.idempotent !== "boolean") {
    failures.push(`idempotent_flag_invalid:${laneBinding}:${name}`)
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

  // Deferred (non-lane) migrations are also digest-pinned + path-safe so the
  // manifest is canonical over EVERY committed migration.
  const deferred = Array.isArray(manifest.deferred) ? manifest.deferred : []
  for (const entry of deferred) {
    const name = entry && typeof entry.path === "string" ? basename(entry.path) : "?"
    if (!entry || typeof entry !== "object") { failures.push("deferred_entry_invalid"); continue }
    if (!KNOWN_BINDINGS.includes(entry.binding)) failures.push(`unknown_binding:deferred:${name}`)
    if (typeof entry.sha256 !== "string" || !SHA256_RE.test(entry.sha256)) { failures.push(`digest_format_invalid:deferred:${name}`); continue }
    if (typeof entry.path === "string") {
      if (seenPaths.has(entry.path)) failures.push(`duplicate_path:${name}`)
      seenPaths.add(entry.path)
    }
    const resolved = resolveMigrationPath(repoRoot, entry.path)
    if (!resolved.ok) { failures.push(`${resolved.failure}:deferred:${name}`); continue }
    if (computeDigest(resolved.absPath) !== entry.sha256) failures.push(`digest_mismatch:deferred:${name}`)
  }

  return { ok: failures.length === 0, failures }
}

// ─── Ordered plan ────────────────────────────────────────────────

/**
 * Deterministic ordered plan for a binding: the lane sorted by sequence. Returns
 * only safe fields (binding, sequence, path, name, kind, idempotent, sha256).
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
      idempotent: e.idempotent,
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
  for (const e of Array.isArray(manifest.deferred) ? manifest.deferred : []) steps.push(e.path)
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

/** SHA-256 digest of the manifest's pinned-digest set (safe, ID-free). */
export function manifestDigest(manifest) {
  const parts = []
  for (const binding of KNOWN_BINDINGS) {
    for (const e of buildPlan(manifest, binding)) parts.push(`${binding}:${e.sequence}:${e.name}:${e.sha256}`)
  }
  for (const e of (Array.isArray(manifest.deferred) ? manifest.deferred : [])) {
    parts.push(`deferred:${basename(e.path)}:${e.sha256}`)
  }
  return createHash("sha256").update(parts.join("\n")).digest("hex")
}
