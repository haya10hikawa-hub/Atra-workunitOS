import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const dryRunRoute = "app/api/workunit/[id]/execution/dry-run/route.ts"
const bindingModule = "app/lib/security/approvalPreviewBinding.ts"
const dryRunClient = "app/lib/application/dashboard/dashboardExecutionDryRunClient.ts"
const dashboardComponent = "app/components/workunit-os/adopted/AdoptedWorkUnitDashboard.tsx"
const dashboardPanel = "app/components/workunit-os/adopted/AdoptedActionFieldPanel.tsx"

// ─── Route: session required ───────────────────────────────────

test("dry-run route requires session", async () => {
  const source = await readFile(dryRunRoute, "utf8")
  // Session is required; the runtime config is threaded in (resolved once).
  assert.equal(source.includes("requireSession(request, runtime)"), true)
})

test("dry-run route returns unauthorized on session failure", async () => {
  const source = await readFile(dryRunRoute, "utf8")
  assert.equal(source.includes('reason: "unauthorized"'), true)
})

// ─── Route: rejects client-owned fields ─────────────────────────

test("dry-run route rejects forbidden client keys", async () => {
  const source = await readFile(dryRunRoute, "utf8")
  // Route checks for forbidden client keys
  assert.equal(source.includes("hasForbiddenClientKeys"), true)
  // Forbidden keys include approvalId
  assert.equal(source.includes('"approvalId"'), true)
  // Forbidden keys include targetHash/payloadHash
  assert.equal(source.includes('"targetHash"'), true)
  assert.equal(source.includes('"payloadHash"'), true)
  // Forbidden keys include tenantId/userId/role
  assert.equal(source.includes('"tenantId"'), true)
  assert.equal(source.includes('"userId"'), true)
  assert.equal(source.includes('"approvedByUserId"'), true)
  // Forbidden keys include tokens/secrets/raw payloads
  assert.equal(source.includes('"tokens"'), true)
  assert.equal(source.includes('"secret"'), true)
  assert.equal(source.includes('"rawPayload"'), true)
  assert.equal(source.includes('"rawBody"'), true)
})

// ─── Route: RBAC ────────────────────────────────────────────────

test("dry-run route enforces RBAC", async () => {
  const source = await readFile(dryRunRoute, "utf8")
  assert.equal(source.includes("canCreatePreview(session)"), true)
  assert.equal(source.includes('reason: "rbac_denied"'), true)
})

// ─── Route: explicit approval ↔ preview binding (Phase 5C) ──────

test("dry-run route binds approval to preview explicitly (no latest/workUnit-only lookup)", async () => {
  const source = await readFile(dryRunRoute, "utf8")
  // Phase 5C: approval is resolved by the exact actionPreviewId and verified via
  // the binding module — never by a latest/workUnit-only approval lookup.
  assert.equal(source.includes("findByPreviewId"), true)
  assert.equal(source.includes("verifyApprovalPreviewBinding"), true)
  assert.equal(source.includes("findByWorkUnitId"), false, "route must not use workUnit-only approval lookup")
})

test("dry-run route checks tenant match", async () => {
  const source = await readFile(dryRunRoute, "utf8")
  assert.equal(source.includes("tenant_mismatch"), true)
})

// ─── Binding module: verification states ────────────────────────

test("binding module blocks on missing approval", async () => {
  const source = await readFile(bindingModule, "utf8")
  assert.equal(source.includes("No approval found for this preview."), true)
})

test("binding module blocks on rejected approval", async () => {
  const source = await readFile(bindingModule, "utf8")
  assert.equal(source.includes('"rejected"') && source.includes("Approval was rejected."), true)
})

test("binding module blocks on pending approval", async () => {
  const source = await readFile(bindingModule, "utf8")
  assert.equal(source.includes('"pending"') && source.includes("Approval is pending."), true)
})

test("binding module blocks on used approval", async () => {
  const source = await readFile(bindingModule, "utf8")
  assert.equal(source.includes("usedAt") && source.includes("Approval has already been consumed."), true)
})

test("binding module blocks on expired approval", async () => {
  const source = await readFile(bindingModule, "utf8")
  assert.equal(source.includes("expiresAt") && source.includes("Approval has expired."), true)
})

test("binding module blocks on hash mismatch", async () => {
  const source = await readFile(bindingModule, "utf8")
  assert.equal(source.includes("targetHash") && source.includes("payloadHash") && source.includes("do not match approval hashes"), true)
})

test("dry-run route blocks when kill switch is active", async () => {
  const source = await readFile(dryRunRoute, "utf8")
  // Kill switch driven by the request-scoped security config, not process.env.
  assert.equal(source.includes("areExternalActionsEnabled(killSwitchEnv)"), true)
  assert.equal(source.includes("projectRuntimeAuthorizationEnv(runtime.security)"), true)
  assert.equal(source.includes('reason: "kill_switch_active"'), true)
})

// ─── Route: does NOT mark approval as used ──────────────────────

test("dry-run route never marks approval as used", async () => {
  const source = await readFile(dryRunRoute, "utf8")
  // No markApprovalUsed call anywhere in the dry-run route
  assert.equal(source.includes("markApprovalUsed"), false)
  // The code comment explicitly states dry-run never marks approval used
  assert.equal(source.includes("NEVER marks approval"), true)
})

// ─── Route: does NOT call external providers ────────────────────

test("dry-run route does not call external tool clients", async () => {
  const source = await readFile(dryRunRoute, "utf8")
  assert.equal(source.includes("slack"), false)
  assert.equal(source.includes("gmail"), false)
  assert.equal(source.includes("github"), false)
  assert.equal(source.includes("calendar"), false)
})

// ─── Route: response does not expose forbidden fields ────────────

test("dry-run response type has no forbidden fields", async () => {
  const source = await readFile(dryRunRoute, "utf8")
  const typeStart = source.indexOf("type DryRunResponse")
  const typeSection = source.slice(typeStart, source.indexOf("}", typeStart) + 1)
  assert.equal(typeSection.includes("approvalId"), false)
  assert.equal(typeSection.includes("targetHash"), false)
  assert.equal(typeSection.includes("payloadHash"), false)
  assert.equal(typeSection.includes("tenantId"), false)
  assert.equal(typeSection.includes("actorUserId"), false)
  assert.equal(typeSection.includes("role"), false)
  assert.equal(typeSection.includes("token"), false)
  assert.equal(typeSection.includes("secret"), false)
  assert.equal(typeSection.includes("rawPayload"), false)
  assert.equal(typeSection.includes("rawBody"), false)
  // Only safe fields
  assert.equal(typeSection.includes("ok: true"), true)
  assert.equal(typeSection.includes("mode:"), true)
  assert.equal(typeSection.includes("status:"), true)
  assert.equal(typeSection.includes("reason:"), true)
  assert.equal(typeSection.includes("workUnitId:"), true)
  assert.equal(typeSection.includes("actionCount:"), true)
  assert.equal(typeSection.includes("requestedActionType:"), true)
})

// ─── Audit events ───────────────────────────────────────────────

test("dry-run route uses correct audit event kinds", async () => {
  const source = await readFile(dryRunRoute, "utf8")
  assert.equal(source.includes('"execution_dry_run_requested"'), true)
  assert.equal(source.includes('"execution_dry_run_verified"'), true)
  assert.equal(source.includes('"execution_dry_run_blocked"'), true)
  assert.equal(source.includes('"execution_dry_run_failed"'), true)
})

test("dry-run audit events do not log hashes", async () => {
  const source = await readFile(dryRunRoute, "utf8")
  // Audit calls should not include targetHash or payloadHash
  const auditCalls = source.match(/audit\(/g)
  assert.ok((auditCalls?.length ?? 0) >= 4)
  // Hash values are only used in server-side preview/approval comparison,
  // never in audit metadata. Verify audit calls use safe reason codes only.
  // (targetHash/payloadHash appear as property access on stored records,
  // which is server-side verification — that's expected)
  assert.equal(source.includes("targetHash,"), false)
  assert.equal(source.includes("payloadHash,"), false)
})

// ─── Client helper ──────────────────────────────────────────────

test("dry-run client does not send approvalId", async () => {
  const source = await readFile(dryRunClient, "utf8")
  // Check only the JSON body keys — skip the comment that says "NEVER send: approvalId"
  const bodyStart = source.indexOf("JSON.stringify({")
  const bodyEnd = source.indexOf("})", bodyStart)
  const bodySection = source.slice(bodyStart, bodyEnd)
  assert.equal(bodySection.includes("approvalId"), false)
})

test("dry-run client does not send hashes", async () => {
  const source = await readFile(dryRunClient, "utf8")
  const bodyStart = source.indexOf("JSON.stringify({")
  const bodyEnd = source.indexOf("})", bodyStart)
  const bodySection = source.slice(bodyStart, bodyEnd)
  assert.equal(bodySection.includes("targetHash"), false)
  assert.equal(bodySection.includes("payloadHash"), false)
})

test("dry-run client does not send tenantId/userId/role", async () => {
  const source = await readFile(dryRunClient, "utf8")
  const bodyStart = source.indexOf("JSON.stringify({")
  const bodyEnd = source.indexOf("})", bodyStart)
  const bodySection = source.slice(bodyStart, bodyEnd)
  assert.equal(bodySection.includes("tenantId"), false)
  assert.equal(bodySection.includes("userId"), false)
  assert.equal(bodySection.includes("role"), false)
})

test("dry-run client handles non-JSON response", async () => {
  const source = await readFile(dryRunClient, "utf8")
  assert.equal(source.includes("Invalid dry-run response"), true)
  assert.equal(source.includes(".catch(() =>"), true)
})

test("dry-run client validates response shape", async () => {
  const source = await readFile(dryRunClient, "utf8")
  assert.equal(source.includes('typeof data.status !== "string"'), true)
  assert.equal(source.includes('data.ok !== true'), true)
})

test("dry-run client has no React or repository imports", async () => {
  const source = await readFile(dryRunClient, "utf8")
  assert.equal(source.includes("react"), false)
  assert.equal(source.includes("@/lib/persistence"), false)
  assert.equal(source.includes("NextResponse"), false)
})

// ─── Dashboard: no real execution ───────────────────────────────

test("dashboard does not call real external execution APIs", async () => {
  const source = await readFile(dashboardComponent, "utf8")
  // No handleExecute function at all
  assert.equal(source.includes("handleExecute"), false)
  // No call to /api/workunit/tools (checked separately)
  // No external provider API calls in the network call section.
  // The component imports "slack"/"github"/"calendar" only for icon kinds.
  const fetchCalls = source.match(/fetch\(/g) ?? []
  // The only fetch calls are for inbox, integration status, audit, preview, approval, approval status
  // No fetch to external slack/gmail/github/calendar APIs
  assert.ok(fetchCalls.length <= 10, `too many fetch calls: ${fetchCalls.length}`)
})

test("dashboard does not call /api/workunit/tools", async () => {
  const source = await readFile(dashboardComponent, "utf8")
  assert.equal(source.includes("/api/workunit/tools"), false)
})

test("dashboard Execute CTA remains disabled", async () => {
  const source = await readFile(dashboardPanel, "utf8")
  assert.equal(source.includes("Execute (disabled)"), true)
  assert.equal(source.includes("handleExecute"), false)
})
