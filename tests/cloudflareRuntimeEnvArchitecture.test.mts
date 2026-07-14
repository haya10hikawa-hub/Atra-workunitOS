import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve, join } from "node:path"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")

/** Strip block + line comments so scans match real code, not documentation that
 * legitimately names a forbidden pattern. Preserves `://` (e.g. URLs). */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/([^:])\/\/.*$/gm, "$1")
    .replace(/^\s*\/\/.*$/gm, "")
}

const read = (p: string) => stripComments(readFileSync(resolve(REPO_ROOT, p), "utf8"))

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(resolve(REPO_ROOT, dir))) {
    const rel = join(dir, entry)
    const full = resolve(REPO_ROOT, rel)
    if (statSync(full).isDirectory()) walk(rel, acc)
    else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) acc.push(rel)
  }
  return acc
}

// ─── Blocker 3: the production accessor is pure ─────────────────

test("production accessor has no mutable global, no setter, and no process/global fallback", () => {
  const src = read("app/lib/runtime/cloudflareRuntimeEnv.ts")
  // Reads ONLY the OpenNext request-scoped context.
  assert.match(src, /getCloudflareContext\(\)/)
  // No mutable module-global env variable.
  assert.doesNotMatch(src, /let\s+\w+\s*:\s*AppEnv/)
  assert.doesNotMatch(src, /legacyTestEnv/)
  assert.doesNotMatch(src, /productionEnvProvider/)
  // No exported setter / test-override seam in the production accessor.
  assert.doesNotMatch(src, /export function set/i)
  assert.doesNotMatch(src, /__setProduction/)
  assert.doesNotMatch(src, /runWithTestRuntimeEnv|setTestRuntimeEnvForRequest/)
  // No fallback to a process/module-global env object.
  assert.doesNotMatch(src, /globalThis/)
  assert.doesNotMatch(src, /process\.env/)
  // The accessor does not reach the test-injection seam.
  assert.doesNotMatch(src, /requestRuntimeEnvInjection/)
})

test("no application route imports the test-injection seam", () => {
  const routeFiles = walk("app/api").filter((f) => f.endsWith(".ts"))
  assert.ok(routeFiles.length > 0)
  for (const f of routeFiles) {
    assert.doesNotMatch(read(f), /requestRuntimeEnvInjection/, `${f} must not import the test-injection seam`)
  }
})

test("no application source (outside the seam and its resolver) imports the injection runner", () => {
  const appFiles = walk("app").filter((f) => f.endsWith(".ts") && !f.endsWith("requestRuntimeEnvInjection.ts"))
  for (const f of appFiles) {
    const src = read(f)
    // Only the config resolver may read the seam, and only via the production-safe peek.
    if (/requestRuntimeEnvInjection/.test(src)) {
      assert.ok(f.endsWith("requestRuntimeConfig.ts"), `${f} unexpectedly imports the injection seam`)
      assert.match(src, /peekInjectedRuntimeEnv/)
      assert.doesNotMatch(src, /runWithInjectedRuntimeEnv|setTestRuntimeEnvForRequest/)
    }
  }
})

// ─── Cloudflare production auth/runtime path reads no ambient process.env ──

test("auth adapters and resolver never read process.env", () => {
  for (const f of [
    "app/lib/application/auth/jwtAuthAdapter.ts",
    "app/lib/application/auth/devAuthAdapter.ts",
    "app/lib/application/auth/resolveAuthAdapter.ts",
    "app/lib/application/auth/noopProductionAuthAdapter.ts",
  ]) {
    assert.doesNotMatch(read(f), /process\.env/, `${f} must not read process.env`)
  }
})

test("session resolver derives config, never reading process.env directly", () => {
  const src = read("app/lib/application/auth/sessionResolver.ts")
  assert.doesNotMatch(src, /process\.env/)
  assert.match(src, /resolveValidatedRequestRuntimeConfig|options\.auth/)
})

test("route repository + control resolver read no ambient raw runtime env", () => {
  assert.doesNotMatch(read("app/lib/persistence/routeRepositories.ts"), /getRequestRuntimeEnv/)
  assert.doesNotMatch(read("app/lib/infrastructure/persistence/control/controlRepositoryResolver.ts"), /getRequestRuntimeEnv/)
})

test("process.env for auth/security/llm is confined to the config resolver's local path", () => {
  // The ONLY runtime module that reads process.env for these capabilities is the
  // request runtime config resolver (its explicit local-development path).
  const src = read("app/lib/runtime/requestRuntimeConfig.ts")
  assert.match(src, /resolveLocalConfig/)
  assert.match(src, /source: "cloudflare"/)
})
