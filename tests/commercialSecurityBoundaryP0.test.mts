import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { resolveRepositories, resetInMemoryReposForTests } from "../app/lib/persistence/repositoryResolver.ts"
import type { TenantId } from "../app/lib/tenant/types.ts"
import nextConfig from "../next.config.ts"

const MUTATING_ROUTES = [
  "app/api/workunit/tools/route.ts",
  "app/api/workunit/[id]/approval/route.ts",
  "app/api/workunit/[id]/feedback/route.ts",
  "app/api/workunit/[id]/action-preview/route.ts",
  "app/api/workunit/[id]/execution/dry-run/route.ts",
  "app/api/workunit/inbox/refresh/route.ts",
]

test("P0: every current mutating WorkUnit route enforces request integrity", async () => {
  // WU-02S: the Origin/Referer decision moved behind the header-only mutation
  // guard, which owns method, target Host, Origin, Referer fallback, body-size
  // precheck and Content-Type. The guard consumes csrfProtection.ts rather than
  // duplicating it, so the authority is unchanged — only the call site moved.
  for (const path of MUTATING_ROUTES) {
    const source = await readFile(path, "utf8")
    assert.ok(source.includes("checkMutationRequestIntegrity(request, {"), path)
    // The trusted-origin list must come from the request-scoped runtime config.
    // Scoped to ORIGIN authority per DEV-G: this WorkUnit prohibits ambient-env
    // origin authority in the guard and CSRF modules, and forbids a route from
    // sourcing its own origins. It does not claim to remove every unrelated
    // ambient-env reader from the application.
    assert.ok(source.includes("trustedOrigins: runtime.security.trustedOrigins"), `${path}: request-scoped origins`)
    for (const forbidden of ["ALLOWED_ORIGINS", "NEXT_PUBLIC_APP_URL"]) {
      assert.equal(source.includes(forbidden), false, `${path}: must not source origins from ${forbidden}`)
    }
  }
})

test("P0: legacy provider selector cannot import a real provider", async () => {
  const source = await readFile("app/lib/llm/providerConfig.ts", "utf8")
  assert.equal(source.includes("deepseekProvider"), false)
  assert.equal(source.includes("createDeepSeekProvider"), false)
})

test("P0: GitHub source resolver cannot select the real client", async () => {
  const source = await readFile("app/lib/infrastructure/external/github/resolveGitHubSource.ts", "utf8")
  assert.equal(source.includes("realGitHubClient"), false)
  assert.ok(source.includes('mode === "real") return "real_disabled"'))
})

test("P0: in-memory action previews are isolated by tenant", async () => {
  resetInMemoryReposForTests()
  const env = { NODE_ENV: "development", ALLOW_IN_MEMORY_PERSISTENCE: "true" }
  const tenantA = await resolveRepositories("tenant-a" as TenantId, { env })
  const tenantB = await resolveRepositories("tenant-b" as TenantId, { env })
  assert.equal(tenantA.ok, true)
  assert.equal(tenantB.ok, true)
  if (!tenantA.ok || !tenantB.ok) return

  const now = new Date().toISOString()
  // A preview must reference a same-tenant WorkUnit (enforced at the bundle boundary).
  await tenantA.bundle.workUnits.upsert(tenantA.bundle.ctx, {
    id: "wu:shared-id", tenantId: "tenant-a" as TenantId, title: "t", kind: "task", priority: "medium",
    sourceProvider: "mock", reason: "r", evidence: "e", nextAction: "n", status: "open", createdAt: now, updatedAt: now,
  })
  await tenantA.bundle.actionPreviews.create(tenantA.bundle.ctx, {
    id: "preview:shared-id",
    tenantId: "tenant-a" as TenantId,
    workUnitId: "wu:shared-id",
    actionType: "slack_reply",
    targetPreview: JSON.stringify({ destination: "private-channel" }),
    payloadPreview: JSON.stringify({ body: "private-draft" }),
    requiresApproval: 1,
    status: "preview",
    targetHash: "target-hash",
    payloadHash: "payload-hash",
    createdAt: now,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  })

  assert.equal(await tenantB.bundle.actionPreviews.findById(tenantB.bundle.ctx, "preview:shared-id"), null)
  assert.deepEqual(await tenantB.bundle.actionPreviews.findByWorkUnitId(tenantB.bundle.ctx, "wu:shared-id"), [])
  resetInMemoryReposForTests()
})

test("P0: tools inventory GET requires session and preview GET omits server-owned hashes", async () => {
  const tools = await readFile("app/api/workunit/tools/route.ts", "utf8")
  const approval = await readFile("app/api/workunit/[id]/approval/route.ts", "utf8")
  const getStart = tools.indexOf("export async function GET")
  const postStart = tools.indexOf("export async function POST")
  assert.ok(tools.slice(getStart, postStart).includes("requireSession(request, runtimeResult.runtime)"))
  const approvalGet = approval.slice(approval.indexOf("export async function GET"))
  assert.equal(approvalGet.includes("targetHash: row.targetHash"), false)
  assert.equal(approvalGet.includes("payloadHash: row.payloadHash"), false)
  assert.equal(approvalGet.includes("tenantId: row.tenantId"), false)
})

test("commercial response headers include browser hardening controls", async () => {
  assert.equal(nextConfig.poweredByHeader, false)
  const rules = await nextConfig.headers?.()
  const headers = new Map((rules?.[0]?.headers ?? []).map((header) => [header.key, header.value]))
  for (const name of [
    "Content-Security-Policy",
    "Strict-Transport-Security",
    "X-Content-Type-Options",
    "X-Frame-Options",
    "Referrer-Policy",
    "Permissions-Policy",
  ]) assert.ok(headers.has(name), name)
  assert.match(headers.get("Content-Security-Policy") ?? "", /frame-ancestors 'none'/)
})
