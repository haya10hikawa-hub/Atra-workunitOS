/**
 * Architecture guards for tenant-isolated persistence (P0-PERSIST-014).
 * Source scans (comment-stripped) that fail if a safety property regresses.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/([^:])\/\/.*$/gm, "$1")
    .replace(/^\s*\/\/.*$/gm, "")
}
const read = (p: string) => stripComments(readFileSync(resolve(REPO_ROOT, p), "utf8"))

const RESOLVER = "app/lib/persistence/tenantDbResolver.ts"
const REPO_RESOLVER = "app/lib/persistence/repositoryResolver.ts"
const ROUTE_REPOS = "app/lib/persistence/routeRepositories.ts"
const INMEM = "app/lib/persistence/inMemoryRepositories.ts"
const ENFORCED = "app/lib/persistence/relationshipEnforcedRepositories.ts"
const WRITE_GUARDS = "app/lib/persistence/d1/writeGuards.ts"
const ROUTES = ["app/api/audit/recent/route.ts", "app/api/workunit/inbox/route.ts", "app/api/integrations/status/route.ts"]

test("D1TenantDbResolver returns the tenant DB, never the control DB", () => {
  const src = read(RESOLVER)
  assert.match(src, /db:\s*this\.tenantDb/)
  assert.doesNotMatch(src, /db:\s*this\.controlDb/)
  // The stored database_id is validated (Blocker 3) but NEVER used to construct or
  // fetch a binding — the returned db is always the statically bound tenantDb.
  assert.match(src, /D1_DATABASE_ID_PATTERN/)
  assert.doesNotMatch(src, /db:\s*[^,\n}]*database_id/i)
})

test("route repository resolution builds + passes the tenant resolver in production", () => {
  const src = read(ROUTE_REPOS)
  assert.match(src, /new D1TenantDbResolver/)
  assert.match(src, /rt\.source === "cloudflare"/)
  // Cloudflare production goes through the mandatory-resolver production API; local
  // goes through the explicitly named local API.
  assert.match(src, /resolveProductionRepositories/)
  assert.match(src, /resolveLocalRepositories/)
})

test("the production D1 path validates via the resolver (no unchecked TENANT_DB_DEFAULT bundle)", () => {
  const src = read(REPO_RESOLVER)
  // Production resolution flows ONLY through resolveProductionRepositories, whose
  // resolver parameter is required and which consumes the resolver strictly.
  assert.match(src, /resolveProductionRepositories/)
  assert.match(src, /resolveViaTenantResolver\(authority\.resolver,\s*tenantId,\s*\{\s*strict:\s*true,\s*controlDb:\s*p\.CONTROL_DB\s*\}\)/)
  // Strict validation rejects control-DB, mismatched tenant, and non-D1 stores.
  assert.match(src, /store === opts\.controlDb/)
  assert.match(src, /ctx\.tenantId !== tenantId/)
  assert.match(src, /!isD1Like\(store\)/)
})

test("Blocker 1: production resolver parameter is mandatory (structural), never inferred", () => {
  const src = read(REPO_RESOLVER)
  // resolveProductionRepositories takes a REQUIRED resolver (not `resolver?`).
  assert.match(src, /resolveProductionRepositories\([\s\S]*?resolver:\s*TenantDbResolver\b/)
  // The production authority discriminant carries a required resolver.
  assert.match(src, /kind:\s*"cloudflare_production"[\s\S]*?resolver:\s*TenantDbResolver/)
  // Direct binding is only reachable through the explicitly named local API, which
  // demands an explicit allowDirectBinding flag (never inferred from omission).
  assert.match(src, /resolveLocalRepositories/)
  assert.match(src, /allowDirectBinding:\s*true/)
})

test("Blocker 1 GUARD: persistence.mode==='d1' with resolver===undefined can NOT yield a bundle", () => {
  const src = read(REPO_RESOLVER)
  // The dangerous direct-bundle expression must be gone: the persistence d1 branch
  // fails closed when no resolver is supplied and never bundles TENANT_DB_DEFAULT
  // directly on a missing resolver.
  assert.match(src, /if\s*\(!options\.resolver\)\s*return\s*\{\s*ok:\s*false/)
  assert.doesNotMatch(src, /options\.d1Binding\s*\?\?\s*p\.TENANT_DB_DEFAULT/)
  // resolveProductionRepositories (the only production bundle producer) never reads
  // a caller-supplied binding — ctx.db is authoritative.
  const prodStart = src.indexOf("export async function resolveProductionRepositories")
  assert.ok(prodStart >= 0)
  const prodEnd = src.indexOf("export async function resolveLocalRepositories", prodStart)
  const prodBlock = src.slice(prodStart, prodEnd)
  assert.doesNotMatch(prodBlock, /d1Binding/)
})

test("d1Binding cannot override ctx.db in the strict (production) resolver path", () => {
  const src = read(REPO_RESOLVER)
  // The strict block resolves the store from ctx.db only; it must not read d1Binding.
  const strictStart = src.indexOf("if (opts.strict)")
  assert.ok(strictStart >= 0)
  const strictBlock = src.slice(strictStart, src.indexOf("return { ok: true, store, ctx }", strictStart) + 40)
  assert.doesNotMatch(strictBlock, /d1Binding/)
  // The production path passes strict:true with the control DB and no d1Binding.
  assert.match(src, /\{\s*strict:\s*true,\s*controlDb:\s*p\.CONTROL_DB\s*\}/)
})

test("in-memory writes derive tenant from ctx (never key/store on row.tenantId)", () => {
  const src = read(INMEM)
  // No write keys or summary keys built from the caller-supplied row.tenantId.
  assert.doesNotMatch(src, /keyFor\(row\.tenantId/)
  assert.doesNotMatch(src, /\$\{row\.tenantId\}/)
  assert.doesNotMatch(src, /store\.set\(row\.id,/)
  // Writes derive the stored tenant from ctx.
  assert.match(src, /tenantId:\s*_ctx\.tenantId/)
})

test("tenant updates are tenant-scoped before mutation", () => {
  // In-memory approval updateStatus checks the tenant before mutating.
  assert.match(read(INMEM), /r\.tenantId !== _ctx\.tenantId/)
  // D1 updates include a tenant predicate.
  assert.match(read("app/lib/persistence/d1/workUnitRepository.ts"), /UPDATE work_units[\s\S]*tenant_id = \?/)
  assert.match(read("app/lib/persistence/d1/approvalRecordRepository.ts"), /UPDATE approval_records[\s\S]*tenant_id = \?/)
})

for (const route of ROUTES) {
  test(`${route} gates fallback on the central helper, never ambient process.env.NODE_ENV or source alone`, () => {
    const src = read(route)
    // Blocker 2 requirement 6: no route reads process.env.NODE_ENV.
    assert.doesNotMatch(src, /process\.env\.NODE_ENV/)
    // Blocker 2 requirement 5: the fallback decision is NOT made from runtime.source
    // alone — it is delegated to the central authority helper.
    assert.match(src, /canUseLocalPersistenceFallback\(runtime\)/)
    assert.doesNotMatch(src, /runtime\.source\s*===\s*"cloudflare"/)
  })
}

test("Blocker 2: the fallback helper requires local + non-production + dev adapter + dev capability + no CF ctx", () => {
  const src = read("app/lib/runtime/localFallbackAuthority.ts")
  assert.match(src, /runtime\.source !== "local"/)
  assert.match(src, /runtime\.auth\.isProduction !== false/)
  assert.match(src, /runtime\.auth\.adapter !== "dev"/)
  assert.match(src, /runtime\.security\.allowDevSession !== true/)
  assert.match(src, /getRequestRuntimeEnv\(\) !== null/)
  // No new ALLOW_* capability and no NODE_ENV read.
  assert.doesNotMatch(src, /process\.env/)
})

test("the resolver failure reason type carries no tenantId / disclosure field", () => {
  const src = read("app/lib/persistence/repositories.ts")
  const typeStart = src.indexOf("export type TenantDbResolution")
  assert.ok(typeStart >= 0)
  const block = src.slice(typeStart, typeStart + 220)
  // The failure arm is `{ ok: false; reason: ... }` — no tenantId / message field.
  assert.doesNotMatch(block, /tenantId/)
  assert.doesNotMatch(block, /message/)
})

// ─── Round 2 guards: runtimeEnv bypass, resolver-mandatory, relationships ─

function runtimeEnvBlock(src: string): string {
  const start = src.indexOf("if (options.runtimeEnv)")
  assert.ok(start >= 0, "runtimeEnv branch must exist")
  // Up to the next branch (the local process.env config section).
  const end = src.indexOf("const config = resolvePersistenceConfig", start)
  return src.slice(start, end > start ? end : start + 800)
}

test("Blocker 1 GUARD: the runtimeEnv branch never creates a D1 bundle directly", () => {
  const src = read(REPO_RESOLVER)
  const block = runtimeEnvBlock(src)
  // No direct d1Bundle(...) and no direct TENANT_DB_DEFAULT bundling in this branch.
  assert.doesNotMatch(block, /d1Bundle\(/)
  assert.doesNotMatch(block, /options\.d1Binding\s*\?\?\s*validated\.env/)
  // It fails closed without a resolver and routes through the mandatory-resolver API.
  assert.match(block, /if \(!options\.resolver\) return \{ ok: false/)
  assert.match(block, /resolveProductionRepositories/)
})

test("Blocker 1 GUARD: validated.env.TENANT_DB_DEFAULT is never passed to d1Bundle", () => {
  const src = read(REPO_RESOLVER)
  assert.doesNotMatch(src, /d1Bundle\([^)]*validated\.env/)
  // No legacy helper that pulls a raw binding out of the runtime env.
  assert.doesNotMatch(src, /resolveRuntimeBinding/)
  assert.doesNotMatch(src, /getCloudflareD1Bindings/)
})

test("Blocker 1 GUARD: no production-capable API accepts an OPTIONAL tenant resolver", () => {
  const src = read(REPO_RESOLVER)
  const prodStart = src.indexOf("export async function resolveProductionRepositories")
  assert.ok(prodStart >= 0)
  const sig = src.slice(prodStart, src.indexOf("{", src.indexOf("Promise<RepositoryResolutionResult>", prodStart)))
  assert.match(sig, /resolver:\s*TenantDbResolver/)   // required
  assert.doesNotMatch(sig, /resolver\?:/)             // never optional
})

test("Blocker 2 GUARD: Feedback create verifies parent WorkUnit ownership", () => {
  const src = read(ENFORCED)
  const start = src.indexOf("export function enforceFeedbackParent")
  const block = src.slice(start, src.indexOf("export function", start + 10) > start ? src.indexOf("export function", start + 10) : src.length)
  assert.match(block, /async create/)
  assert.match(block, /assertWorkUnitOwned\(deps\.workUnits/)
})

test("Blocker 2 GUARD: ActionPreview create verifies parent WorkUnit ownership", () => {
  const src = read(ENFORCED)
  const start = src.indexOf("export function enforceActionPreviewParent")
  const block = src.slice(start, src.indexOf("export function", start + 10))
  assert.match(block, /async create/)
  assert.match(block, /assertWorkUnitOwned\(deps\.workUnits/)
})

test("Blocker 2 GUARD: Approval create verifies parent Preview AND WorkUnit ownership", () => {
  const src = read(ENFORCED)
  const start = src.indexOf("export function enforceApprovalParents")
  const block = src.slice(start, src.indexOf("export function", start + 10))
  assert.match(block, /async create/)
  assert.match(block, /deps\.actionPreviews\.findById/)
  assert.match(block, /assertWorkUnitOwned\(deps\.workUnits/)
  assert.match(block, /preview\.workUnitId !== row\.workUnitId/)
  // The single opaque failure is used, never a disclosing message.
  assert.match(block, /parentBoundaryViolation\(\)/)
})

test("Blocker 2 GUARD: both bundles wire the relationship-enforcing wrappers", () => {
  const src = read(REPO_RESOLVER)
  for (const w of ["enforceActionPreviewParent", "enforceApprovalParents", "enforceFeedbackParent"]) {
    // Used in BOTH d1Bundle and inMemoryBundle (≥2 call sites each).
    const count = src.split(w).length - 1
    assert.ok(count >= 2, `${w} must wrap both the D1 and in-memory bundles (found ${count})`)
  }
})

test("Blocker 2 GUARD: the opaque parent failure discloses nothing", () => {
  const src = read(ENFORCED)
  // The single failure throws exactly the opaque code, with no interpolation.
  assert.match(src, /new D1RepositoryError\("parent_boundary_violation"\)/)
  assert.doesNotMatch(src, /parent_boundary_violation.*\$\{/)
})

test("Blocker 3 GUARD: isUniqueConstraintViolation has NO generic 'constraint failed' alternative", () => {
  const src = read(WRITE_GUARDS)
  // Only qualified UNIQUE / PRIMARY KEY forms — never a bare `|constraint failed`.
  assert.match(src, /unique constraint failed\|primary key constraint failed/)
  assert.doesNotMatch(src, /\|\s*constraint failed/i)
})

test("Blocker 3 GUARD: non-UNIQUE driver failures map to write_failed (not object_id_conflict)", () => {
  const src = read(WRITE_GUARDS)
  // runInsertGuarded: unique → object_id_conflict; everything else → write_failed.
  assert.match(src, /if \(isUniqueConstraintViolation\(error\)\) throw new D1RepositoryError\("object_id_conflict"\)/)
  assert.match(src, /throw new D1RepositoryError\("write_failed"\)/)
})

test("Blocker 2 GUARD: no test positively asserts a cross-tenant parent reference SUCCEEDS", () => {
  const dir = resolve(REPO_ROOT, "tests")
  // Exclude THIS guard file, whose assertions necessarily contain the forbidden
  // phrases as regex literals.
  const files = readdirSync(dir).filter((f) => f.endsWith(".test.mts") && f !== "tenantIsolationArchitecture.test.mts")
  for (const f of files) {
    const src = read(resolve(dir, f))
    // The removed accepting pattern must not return: both tenants attaching feedback
    // to the same (foreign) WorkUnit and treating it as a success.
    assert.doesNotMatch(src, /both tenants attach feedback referencing that/i, `${f} must not accept cross-tenant feedback`)
    assert.doesNotMatch(src, /creates no observable cross-tenant relationship/i, `${f} must not keep the old accepting test`)
  }
})

// ─── Round 3 guards: legacy env seam is local/test-only (Node prod fails closed) ─

function legacyEnvBlock(src: string): string {
  const start = src.indexOf("const config = resolvePersistenceConfig(options.env)")
  assert.ok(start >= 0, "legacy env block must exist")
  const end = src.indexOf("let inMemoryActionPreviewRepo", start)
  return src.slice(start, end > start ? end : src.length)
}

test("Round 3 GUARD: the production fail-closed check precedes any mode dispatch", () => {
  const block = legacyEnvBlock(read(REPO_RESOLVER))
  const prodCheck = block.indexOf("if (config.isProduction)")
  const switchIdx = block.indexOf("switch (config.mode)")
  const localDispatch = block.indexOf("resolveLocalRepositories")
  assert.ok(prodCheck >= 0, "must have an isProduction fail-closed check")
  assert.ok(switchIdx > prodCheck, "the switch must come AFTER the production check")
  assert.ok(localDispatch > prodCheck, "resolveLocalRepositories must be reachable only AFTER the production check")
  // The production check returns fail-closed (never a bundle).
  assert.match(block, /if \(config\.isProduction\) \{\s*return \{ ok: false/)
})

test("Round 3 GUARD: a production config cannot reach resolveLocalRepositories or consume d1Binding", () => {
  const block = legacyEnvBlock(read(REPO_RESOLVER))
  const prodCheck = block.indexOf("if (config.isProduction)")
  // options.d1Binding is only read AFTER the production fail-closed return.
  const bindingUse = block.indexOf("options.d1Binding")
  assert.ok(bindingUse === -1 || bindingUse > prodCheck, "options.d1Binding must not be consumed before the production check")
  // The legacy env block never builds a D1 bundle directly.
  assert.doesNotMatch(block, /d1Bundle\(/)
})

test("Round 3 GUARD: only routeRepositories imports resolveLocalRepositories, and only in the local branch", () => {
  const dir = resolve(REPO_ROOT, "app")
  // Recursively collect .ts files under app/.
  const stack = [dir]
  const importers: string[] = []
  while (stack.length) {
    const d = stack.pop()!
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = resolve(d, entry.name)
      if (entry.isDirectory()) stack.push(p)
      else if (entry.name.endsWith(".ts")) {
        const rel = p.slice(REPO_ROOT.length + 1)
        if (rel === "app/lib/persistence/repositoryResolver.ts") continue // definition site
        const src = read(rel)
        if (/import[\s\S]*?resolveLocalRepositories[\s\S]*?from/.test(src)) importers.push(rel)
      }
    }
  }
  assert.deepEqual(importers, ["app/lib/persistence/routeRepositories.ts"], `unexpected resolveLocalRepositories importers: ${importers.join(", ")}`)
  // In routeRepositories, the Cloudflare branch uses the production API; the local
  // API is used only in the else (local) branch. Match CALL SITES, not imports.
  const rr = read(ROUTE_REPOS)
  const cf = rr.indexOf('rt.source === "cloudflare"')
  const prodCall = rr.indexOf("await resolveProductionRepositories")
  const localCall = rr.indexOf("await resolveLocalRepositories")
  assert.ok(cf >= 0 && prodCall > cf, "the production API is called inside the cloudflare branch")
  assert.ok(localCall > prodCall, "resolveLocalRepositories is called only after (outside) the cloudflare production dispatch")
})
