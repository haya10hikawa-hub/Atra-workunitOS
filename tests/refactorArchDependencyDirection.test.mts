/**
 * Architecture dependency-direction guards (Refactor Program, ADR-0002).
 *
 * Locks the layering rules from docs/refactor/TARGET_ARCHITECTURE.md as
 * executable tests over the real import graph (no regex source-guards):
 *
 *   1. Domain (`app/lib/domain/**`) imports ONLY domain + tenant types and
 *      never reads `process.env`.
 *   2. Application (`app/lib/application/**`) does not import infrastructure,
 *      D1 implementations, or provider adapters — except the exact, ratcheted
 *      allowlist of pre-existing edges below. The allowlist may only SHRINK.
 *
 * These are ratchets: they characterize the boundary as it exists on the
 * program base (origin/main @ 0b20218d) and fail when a NEW violation appears.
 */

import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const appRoot = path.join(repoRoot, "app")
const EXTS = [".ts", ".tsx", ".mts"]

function listSourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listSourceFiles(p))
    else if (EXTS.some((e) => entry.name.endsWith(e))) out.push(p)
  }
  return out
}

function importSpecifiers(file: string): string[] {
  const src = fs.readFileSync(file, "utf8")
  const specs: string[] = []
  for (const m of src.matchAll(/from\s+["']([^"']+)["']/g)) specs.push(m[1])
  for (const m of src.matchAll(/import\s*\(\s*["']([^"']+)["']\s*\)/g)) specs.push(m[1])
  return specs
}

function resolveRelative(fromFile: string, spec: string): string | null {
  let base: string
  if (spec.startsWith("@/")) base = path.join(appRoot, spec.slice(2))
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(fromFile), spec)
  else return null // bare package import — out of scope here
  const candidates = [base, ...EXTS.map((e) => base + e), ...EXTS.map((e) => path.join(base, "index" + e))]
  for (const c of candidates) {
    try { if (fs.statSync(c).isFile()) return c } catch { /* keep looking */ }
  }
  return null
}

const rel = (p: string) => path.relative(repoRoot, p).split(path.sep).join("/")

// ─── 1. Domain purity ───────────────────────────────────────────

test("domain modules import only domain + tenant types", () => {
  const domainDir = path.join(appRoot, "lib", "domain")
  const violations: string[] = []
  for (const file of listSourceFiles(domainDir)) {
    for (const spec of importSpecifiers(file)) {
      const resolved = resolveRelative(file, spec)
      if (resolved === null) {
        // A bare import in domain would itself be a violation (provider SDKs,
        // node builtins carrying ambient authority). Only type-free "node:"
        // imports are tolerated if they ever appear; today there are none.
        violations.push(`${rel(file)} → bare import "${spec}"`)
        continue
      }
      const target = rel(resolved)
      const allowed = target.startsWith("app/lib/domain/") || target.startsWith("app/lib/tenant/")
      if (!allowed) violations.push(`${rel(file)} → ${target}`)
    }
  }
  assert.deepEqual(violations, [], `domain layer gained forbidden imports:\n${violations.join("\n")}`)
})

test("domain modules never read process.env", () => {
  const domainDir = path.join(appRoot, "lib", "domain")
  const offenders = listSourceFiles(domainDir)
    .filter((f) => fs.readFileSync(f, "utf8").includes("process.env"))
    .map(rel)
  assert.deepEqual(offenders, [])
})

// ─── 2. Application → infrastructure ratchet ────────────────────

// Pre-existing edges on the program base. Fixing one means REMOVING it here.
// Adding a new edge fails the test — route new capability through ports
// composed at the runtime composition root instead (ADR-0002/0003).
const APPLICATION_INFRA_ALLOWLIST: ReadonlySet<string> = new Set([
  // sessionResolver constructs control repositories directly (to be inverted
  // behind a port in workstream refactor/tenant-security).
  "app/lib/application/auth/sessionResolver.ts",
])

const FORBIDDEN_APPLICATION_TARGETS = [
  "app/lib/infrastructure/",
  "app/lib/persistence/d1/", // implementation classes; the `types.ts` type-only module is tolerated below
  "app/lib/workunitInbox/sources/",
]

test("application modules do not gain infrastructure/provider imports", () => {
  const applicationDir = path.join(appRoot, "lib", "application")
  const violations: string[] = []
  for (const file of listSourceFiles(applicationDir)) {
    const from = rel(file)
    for (const spec of importSpecifiers(file)) {
      const resolved = resolveRelative(file, spec)
      if (resolved === null) continue
      const target = rel(resolved)
      if (target === "app/lib/persistence/d1/types.ts") continue // shared type shapes only
      if (!FORBIDDEN_APPLICATION_TARGETS.some((prefix) => target.startsWith(prefix))) continue
      if (APPLICATION_INFRA_ALLOWLIST.has(from)) continue
      violations.push(`${from} → ${target}`)
    }
  }
  assert.deepEqual(violations, [], `application layer gained infrastructure imports:\n${violations.join("\n")}`)
})

test("application→infrastructure allowlist entries still exist (ratchet hygiene)", () => {
  for (const entry of APPLICATION_INFRA_ALLOWLIST) {
    assert.ok(
      fs.existsSync(path.join(repoRoot, entry)),
      `${entry} no longer exists — remove it from the allowlist`,
    )
  }
})
