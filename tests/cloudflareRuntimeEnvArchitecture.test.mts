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

test("auth adapters and their selection never read process.env", () => {
  for (const f of [
    "app/lib/application/auth/jwtAuthAdapter.ts",
    "app/lib/application/auth/devAuthAdapter.ts",
    "app/lib/application/auth/noopProductionAuthAdapter.ts",
    // WU-06 moved adapter SELECTION to the request composition root. The rule
    // follows the code: the module that picks an implementation is exactly the
    // module most tempted to read the environment to decide.
    "app/lib/composition/authAdapterSelection.ts",
  ]) {
    assert.doesNotMatch(read(f), /process\.env/, `${f} must not read process.env`)
  }
})

test("the session use case reads no config at all — it is handed one", () => {
  // Before WU-06 this asserted the use case RESOLVED the validated config when
  // none was threaded in. It no longer resolves anything: the composition root
  // owns that, and the use case receives already-resolved capabilities. The
  // assertion is therefore stronger, not merely relocated — the use case may
  // name neither `process.env` nor the runtime configuration module.
  const src = read("app/lib/application/auth/sessionResolver.ts")
  assert.doesNotMatch(src, /process\.env/)
  assert.doesNotMatch(src, /requestRuntimeConfig|resolveValidatedRequestRuntimeConfig/)
  assert.match(src, /dependencies: SessionDependencies/)
})

test("the request composition root resolves config once and reads no process.env", () => {
  const src = read("app/lib/composition/requestSession.ts")
  assert.doesNotMatch(src, /process\.env/)
  assert.match(src, /resolveValidatedRequestRuntimeConfig/)
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

// ─── Blocker 2: genuine Cloudflare context outranks test injection ──

test("the resolver checks the genuine Cloudflare context before test injection", () => {
  const src = read("app/lib/runtime/requestRuntimeConfig.ts")
  const fnStart = src.indexOf("export function resolveValidatedRequestRuntimeConfig")
  assert.ok(fnStart >= 0)
  const body = src.slice(fnStart)
  const genuine = body.indexOf("getRequestRuntimeEnv()")
  const injected = body.indexOf("peekInjectedRuntimeEnv()")
  assert.ok(genuine >= 0 && injected >= 0)
  // Genuine context MUST be read before the injection seam is consulted.
  assert.ok(genuine < injected, "genuine Cloudflare context must be checked before test injection")
})

// ─── Blocker 4: one runtime snapshot per route ──────────────────

test("every route threads the runtime config into session and repositories (no no-arg combo)", () => {
  const routeFiles = walk("app/api").filter((f) => f.endsWith("route.ts"))
  assert.ok(routeFiles.length > 0)
  for (const f of routeFiles) {
    const src = read(f)
    if (/requireSession\(/.test(src) || /resolveRouteRepositories\(/.test(src)) {
      // A route that resolves config twice would call these with no runtime arg.
      assert.doesNotMatch(src, /requireSession\(request\)/, `${f}: requireSession must receive the runtime config`)
      assert.doesNotMatch(src, /resolveRouteRepositories\([^,)]*\)/, `${f}: resolveRouteRepositories must receive the runtime config`)
      // And it must resolve the config once per request.
      assert.match(src, /resolveValidatedRequestRuntimeConfig\(\)/, `${f}: must resolve the runtime config once`)
    }
  }
})
