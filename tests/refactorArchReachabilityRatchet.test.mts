/**
 * Runtime-reachability ratchet (Refactor Program; Issue #137 quantification).
 *
 * On the program base (origin/main @ 0b20218d), 367 TS/TSX files under app
 * split into: 181 reachable from the runtime entry points (page.tsx,
 * layout.tsx, and every route.ts under app/api), 120 reachable only from
 * tests, and 66 imported by nothing (docs/refactor/DEPENDENCY_MAP.md).
 *
 * This test recomputes the import graph and enforces CEILINGS so unreachable
 * code can only shrink. When staged deletions land (workstream
 * refactor/test-deployment-platform), lower the ceilings in the same PR.
 */

import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

// Ceilings measured on the program base. LOWER them as cleanup lands; never raise.
const MAX_RUNTIME_UNREACHABLE = 186
const MAX_FULLY_ORPHANED = 66

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

function resolveRelative(fromFile: string, spec: string): string | null {
  let base: string
  if (spec.startsWith("@/")) base = path.join(appRoot, spec.slice(2))
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(fromFile), spec)
  else return null
  const candidates = [base, ...EXTS.map((e) => base + e), ...EXTS.map((e) => path.join(base, "index" + e))]
  for (const c of candidates) {
    try { if (fs.statSync(c).isFile()) return c } catch { /* keep looking */ }
  }
  return null
}

function reachableFrom(entries: string[]): Set<string> {
  const seen = new Set<string>()
  const queue = [...entries]
  while (queue.length > 0) {
    const file = queue.pop() as string
    if (seen.has(file)) continue
    seen.add(file)
    let src: string
    try { src = fs.readFileSync(file, "utf8") } catch { continue }
    for (const m of src.matchAll(/from\s+["']([^"']+)["']/g)) {
      const resolved = resolveRelative(file, m[1])
      if (resolved !== null && !seen.has(resolved)) queue.push(resolved)
    }
  }
  return seen
}

function runtimeEntryPoints(): string[] {
  const entries = [path.join(appRoot, "page.tsx"), path.join(appRoot, "layout.tsx")]
  const apiRoot = path.join(appRoot, "api")
  const stack = [apiRoot]
  while (stack.length > 0) {
    const dir = stack.pop() as string
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name)
      if (entry.isDirectory()) stack.push(p)
      else if (entry.name === "route.ts") entries.push(p)
    }
  }
  return entries
}

test("runtime-unreachable app code does not grow (ratchet)", () => {
  const allAppFiles = listSourceFiles(appRoot)
  const runtimeReachable = reachableFrom(runtimeEntryPoints())
  const testReachable = reachableFrom(listSourceFiles(path.join(repoRoot, "tests")))

  const runtimeUnreachable = allAppFiles.filter((f) => !runtimeReachable.has(f))
  const fullyOrphaned = runtimeUnreachable.filter((f) => !testReachable.has(f))

  assert.ok(
    runtimeUnreachable.length <= MAX_RUNTIME_UNREACHABLE,
    `runtime-unreachable app files grew: ${runtimeUnreachable.length} > ${MAX_RUNTIME_UNREACHABLE}. ` +
      "New code must be wired to a runtime entry point (or lower the ceiling if this is cleanup).",
  )
  assert.ok(
    fullyOrphaned.length <= MAX_FULLY_ORPHANED,
    `fully-orphaned app files grew: ${fullyOrphaned.length} > ${MAX_FULLY_ORPHANED}.`,
  )
})

test("runtime entry points exist and are non-trivial", () => {
  const entries = runtimeEntryPoints()
  // page + layout + the 9 API routes on the program base; more routes are fine.
  assert.ok(entries.length >= 11, `expected >= 11 entry points, found ${entries.length}`)
})
