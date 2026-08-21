/**
 * P6-FIX-012 (Issue #145): architecture / boundary source guards for the Runtime
 * Authorization layers. Proves the pure module imports nothing side-effectful,
 * the client request type carries no evidence/identity/hash/authorization fields,
 * no provider client is called, the receipt is not wired to an external client,
 * the legacy unbound claim is unused by the gate, the P7.1 MAC stays unwired, and
 * no D1 evidence migration is added.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

const ROOT = join(import.meta.dirname!, "..")
const PURE_DIR = join(ROOT, "app/lib/phase6/runtimeAuthorization")

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf-8")
}

/** Non-comment source lines only (JSDoc / `//` lines describe what code avoids). */
function codeOnly(src: string): string {
  return src
    .split("\n")
    .filter((l) => {
      const t = l.trimStart()
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*")
    })
    .join("\n")
}

function pureFiles(): string[] {
  return readdirSync(PURE_DIR).filter((f) => f.endsWith(".ts")).map((f) => join(PURE_DIR, f))
}

// ─── Pure module import boundary ────────────────────────────────

const FORBIDDEN_PURE_IMPORTS = [
  /from ".*\/api\//,
  /from ".*\/persistence\//,
  /from ".*\/d1\//,
  /from ".*approvalStore/i,
  /from ".*Resolver/,
  /from ".*\/security\/session/,
  /from ".*externalToolClients/,
  /from ".*\/llm\//,
  /process\.env/,
  /from "next/,
  /from ".*electron/i,
  /from ".*approvalMac/,
]

test("pure runtimeAuthorization files import nothing side-effectful", () => {
  for (const file of pureFiles()) {
    const src = readFileSync(file, "utf-8")
    for (const pattern of FORBIDDEN_PURE_IMPORTS) {
      assert.ok(!pattern.test(src), `${file} must not match ${pattern}`)
    }
  }
})

test("pure module only imports approved inert Phase 6 + hash/timestamp leaves", () => {
  // The only cross-module imports allowed: sibling phase6 policy modules and the
  // shared security hash + iso timestamp leaves.
  const eligibility = read("app/lib/phase6/runtimeAuthorization/eligibility.ts")
  assert.ok(eligibility.includes("../approvalLinkage/index.ts"))
  assert.ok(eligibility.includes("../canonicalIdentity/index.ts"))
  assert.ok(eligibility.includes("../shared/isoUtcTimestamp.ts"))
})

// ─── Client request type: no evidence / identity / hash ─────────

test("the client tools request type carries no runtime-authorization evidence", () => {
  const src = read("app/types/toolBackend.ts")
  for (const banned of ["humanDecision", "reviewEvidence", "approvalLinkage", "linkageContext", "executorId", "linkage_verified", "authorization_allowed", "targetHash", "payloadHash"]) {
    assert.ok(!src.includes(banned), `ToolBackendRequest must not carry ${banned}`)
  }
})

// ─── Gate + resolver boundaries ─────────────────────────────────

test("the evidence resolver never reads a client body", () => {
  const src = read("app/lib/security/runtimeAuthorizationEvidenceResolver.ts")
  for (const banned of ["request.json", "readBoundedJson", "req.body", ".body"]) {
    assert.ok(!src.includes(banned), `resolver must not read ${banned}`)
  }
})

test("the gate calls no provider client and creates no ExecutionResult", () => {
  const src = codeOnly(read("app/lib/security/runtimeAuthorizationGate.ts"))
  for (const banned of ["externalToolClients", "ExecutionResult", "externalRef", "createTaskDraft", "runApprovedExternal", "fetch("]) {
    assert.ok(!src.includes(banned), `gate must not reference ${banned}`)
  }
})

test("receipt construction occurs only after a successful claim (call-site order)", () => {
  // Match CALL SITES (with the opening paren), stripped of comments/imports, so
  // the check reflects real code order rather than doc-comment mentions.
  const src = codeOnly(read("app/lib/security/runtimeAuthorizationGate.ts"))
  const claimIdx = src.indexOf(".claimApprovalForRuntime(")
  const constructIdx = src.indexOf("constructRuntimeAuthorizationReceipt(")
  assert.ok(claimIdx > 0 && constructIdx > 0)
  assert.ok(claimIdx < constructIdx, "the claim call must precede any receipt construction call")
})

test("the gate performs BOTH an early and a final RBAC + kill-switch check", () => {
  // Defense in depth: two RBAC checks and two kill-switch checks. Removing
  // either (skip early / skip final recheck) drops the count and fails here, so
  // a single-point skip is observable even though the redundant check masks its
  // runtime effect.
  const src = codeOnly(read("app/lib/security/runtimeAuthorizationGate.ts"))
  const rbac = src.match(/hasExecutePermission\(/g) ?? []
  const kill = src.match(/areExternalActionsEnabled\(/g) ?? []
  assert.ok(rbac.length >= 2, `expected >=2 RBAC checks, found ${rbac.length}`)
  assert.ok(kill.length >= 2, `expected >=2 kill-switch checks, found ${kill.length}`)
})

/** The body of the consuming gate function (authorizeRuntimeCommand). */
function consumingGateBody(): string {
  const src = codeOnly(read("app/lib/security/runtimeAuthorizationGate.ts"))
  const start = src.indexOf("export async function authorizeRuntimeCommand")
  assert.ok(start > 0, "authorizeRuntimeCommand must exist")
  const dryRun = src.indexOf("export async function evaluateRuntimeAuthorizationDryRun")
  return src.slice(start, dryRun > start ? dryRun : undefined)
}

test("the FINAL RBAC + kill-switch recheck occur in the consuming gate, before the claim", () => {
  // MB1: BOTH an early and a final RBAC + kill-switch check must live in the
  // consuming authorization function (authorizeRuntimeCommand) — not inside an
  // async core — and the final ones precede the claim. Moving either check out
  // of the consuming function drops its count here.
  const body = consumingGateBody()
  const rbac = body.match(/hasExecutePermission\(/g) ?? []
  const kill = body.match(/areExternalActionsEnabled\(/g) ?? []
  assert.ok(rbac.length >= 2, `consuming gate must hold >=2 RBAC checks, found ${rbac.length}`)
  assert.ok(kill.length >= 2, `consuming gate must hold >=2 kill-switch checks, found ${kill.length}`)
  const lastRbac = body.lastIndexOf("hasExecutePermission(")
  const lastKill = body.lastIndexOf("areExternalActionsEnabled(")
  const claimIdx = body.indexOf(".claimApprovalForRuntime(")
  assert.ok(claimIdx > 0 && lastRbac < claimIdx, "final RBAC precedes the claim")
  assert.ok(lastKill < claimIdx, "final kill-switch precedes the claim")
})

test("no await, callback, or audit emission sits between the final checks and the claim", () => {
  // MB1/MB2: on the passing path there must be no `await`, sink flush/emit,
  // logger, or other externally-supplied callback between the final kill-switch
  // check and the claim invocation. The critical window runs from the
  // CLAIM-ADJACENT marker (which sits after the kill-switch if-block closes) to
  // the claim call. Read RAW source so the marker comment survives.
  const raw = read("app/lib/security/runtimeAuthorizationGate.ts")
  const gateStart = raw.indexOf("export async function authorizeRuntimeCommand")
  const markerIdx = raw.indexOf("CLAIM-ADJACENT", gateStart)
  const claimIdx = raw.indexOf(".claimApprovalForRuntime(", gateStart)
  assert.ok(markerIdx > gateStart && claimIdx > markerIdx, "CLAIM-ADJACENT marker precedes the claim")
  // Start after the marker comment LINE (which itself names await/callback/emit).
  const afterMarkerLine = raw.indexOf("\n", markerIdx)
  const window = raw.slice(afterMarkerLine, claimIdx)
  for (const forbidden of ["await", "sink.", ".flush(", ".emit(", "flushAndReturn(", "events.push", "persistAuditEvent", "writeAuditLog", "callback"]) {
    assert.ok(!window.includes(forbidden), `no "${forbidden}" may appear between the final kill-switch check and the claim`)
  }
})

test("the audit flush trigger is only reached on terminal return paths (buffered flush)", () => {
  // MB2: `flushAndReturn(` (the only place `sink.flush` is invoked) must never be
  // called between the final checks and the claim; it is only used on terminal
  // returns. The window test above already forbids it in the critical window;
  // here assert the flush helper is invoked (buffered lifecycle actually flushes).
  const body = consumingGateBody()
  assert.ok(body.includes("await sink.flush(events)"), "flush must await the batch sink")
  assert.ok((body.match(/flushAndReturn\(/g) ?? []).length >= 2, "every terminal path flushes")
})

test("the final gate does not use the legacy unbound single-id claim", () => {
  const src = read("app/lib/security/runtimeAuthorizationGate.ts")
  assert.ok(!src.includes("markApprovalUsed"))
})

// ─── No external client accepts the receipt ─────────────────────

test("no external-tool client imports RuntimeAuthorizationReceipt", () => {
  const src = read("app/lib/externalToolClients.ts")
  assert.ok(!src.includes("RuntimeAuthorizationReceipt"))
})

test("the tools route returns authorized_not_executed, never executed/sent for the gate path", () => {
  const src = read("app/api/workunit/tools/route.ts")
  assert.ok(src.includes("authorized_not_executed"))
  // The runtime-authorization success branch must not claim execution.
  const authFn = src.slice(src.indexOf("async function authorizeExternalOperation"))
  for (const banned of ["externalRef", '"executed"', "created_on_provider", "runToolBackendRequest"]) {
    assert.ok(!authFn.includes(banned), `authorizeExternalOperation must not reference ${banned}`)
  }
})

// ─── Dry-run does not import the claim ──────────────────────────

test("the dry-run route imports no Approval claim function", () => {
  const src = read("app/api/workunit/[id]/execution/dry-run/route.ts")
  assert.ok(!src.includes("claimApprovalForRuntime"))
  assert.ok(!src.includes("markApprovalUsed"))
  assert.ok(!src.includes("constructRuntimeAuthorizationReceipt"))
})

test("the dry-run route requires the real execute permission", () => {
  const src = read("app/api/workunit/[id]/execution/dry-run/route.ts")
  assert.ok(src.includes("canExecuteExternalAction"))
})

// ─── P7.1 MAC remains unwired ───────────────────────────────────

test("the P7.1 approvalMac MAC module remains unwired by runtime authorization", () => {
  for (const file of pureFiles()) {
    assert.ok(!codeOnly(readFileSync(file, "utf-8")).includes("approvalMac"), `${file} must not import approvalMac`)
  }
  assert.ok(!codeOnly(read("app/lib/security/runtimeAuthorizationGate.ts")).includes("approvalMac"))
})

// ─── No D1 evidence migration added ─────────────────────────────

test("no Phase 6 evidence D1 migration is added in this patch", () => {
  const resolver = read("app/lib/security/runtimeAuthorizationEvidenceResolver.ts")
  assert.ok(!/CREATE TABLE/i.test(resolver))
  assert.ok(!resolver.includes("MIGRATION"))
})

// ─── F4: the receipt constructor is server-private, gate-only ────

test("only the gate imports the server-private receipt constructor module", () => {
  const importers: string[] = []
  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name)
      if (entry.isDirectory()) { if (!/node_modules|\.next|\.open-next/.test(p)) walk(p); continue }
      if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".tsx")) continue
      if (p.endsWith("runtimeAuthorizationReceipt.ts")) continue
      const src = readFileSync(p, "utf-8")
      if (/from ["'][^"']*runtimeAuthorizationReceipt(\.ts)?["']/.test(src)) importers.push(p)
    }
  }
  walk(join(ROOT, "app"))
  assert.deepEqual(
    importers.map((p) => p.replace(ROOT + "/", "")),
    ["app/lib/security/runtimeAuthorizationGate.ts"],
  )
})

test("the pure index does not export a branded-receipt constructor", async () => {
  const surface = await import("../app/lib/phase6/runtimeAuthorization/index.ts")
  for (const [name, value] of Object.entries(surface)) {
    if (typeof value === "function") assert.ok(!/receipt/i.test(name), `pure export ${name} must not construct a receipt`)
  }
})

// ─── MB3: durable, awaited audit persistence in the route ───────

// WU-06 final route delegation: the route still constructs the redacted,
// durable-persistence audit sink (a genuinely HTTP-facing delivery concern) and
// threads it through the composition root, but no longer calls
// `authorizeRuntimeCommand` itself — that call moved to
// `app/lib/composition/workunitTools.ts`, which wraps the gate behind the
// capability contract the Application use case declares. The two halves of this
// guard are asserted on the module that actually owns each half now.
test("the tools route constructs a durable-persistence runtime-authorization audit sink", () => {
  const src = read("app/api/workunit/tools/route.ts")
  const sinkStart = src.indexOf("const auditSink")
  const sinkEnd = src.indexOf("const outcome = await prepareAndAuthorizeExternalOperation", sinkStart)
  assert.ok(sinkStart > 0 && sinkEnd > sinkStart, "runtime-authorization audit sink exists")
  const sink = src.slice(sinkStart, sinkEnd)
  assert.ok(/async flush\s*\(/.test(sink), "sink must use an async batch flush")
  assert.ok(sink.includes("await persistAuditEvent"), "sink must AWAIT durable persistence")
  assert.ok(!/void persistAuditEvent/.test(sink), "sink must not fire-and-forget durable persistence")
  // The route must not call the gate directly (WU-06 final route delegation).
  assert.equal(src.includes("authorizeRuntimeCommand("), false, "the route must not call authorizeRuntimeCommand directly")
})

test("the tools-route composition root awaits the runtime authorization gate with the caller-supplied audit sink", () => {
  const src = read("app/lib/composition/workunitTools.ts")
  const callIdx = src.indexOf("const result = await authorizeRuntimeCommand")
  assert.ok(callIdx > 0, "composition root must call authorizeRuntimeCommand")
  const callSiteEnd = src.indexOf("})", callIdx)
  const call = src.slice(callIdx, callSiteEnd)
  assert.ok(call.includes("auditSink"), "the gate call must receive the caller-supplied audit sink")
  assert.ok(call.includes("env: projectRuntimeAuthorizationEnv(runtime.security)"), "kill-switch env must be the request-scoped projection")
})

test("the runtime-authorization audit sink is flush-based, not emit-per-event", () => {
  const audit = read("app/lib/phase6/runtimeAuthorization/audit.ts")
  assert.ok(/flush\(events: readonly RuntimeAuthorizationAuditEvent\[\]\)/.test(audit), "sink contract is a batch flush")
  assert.ok(!/\bemit\(/.test(audit), "sink contract exposes no per-event emit")
})
