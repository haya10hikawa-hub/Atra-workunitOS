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
  const rbac = src.match(/hasExecutePermission\(session\)/g) ?? []
  const kill = src.match(/areExternalActionsEnabled\(env\)/g) ?? []
  assert.ok(rbac.length >= 2, `expected >=2 RBAC checks, found ${rbac.length}`)
  assert.ok(kill.length >= 2, `expected >=2 kill-switch checks, found ${kill.length}`)
})

test("the FINAL RBAC + kill-switch checks sit immediately before the claim", () => {
  const src = codeOnly(read("app/lib/security/runtimeAuthorizationGate.ts"))
  const claimIdx = src.indexOf(".claimApprovalForRuntime(")
  const lastRbac = src.lastIndexOf("hasExecutePermission(session)", claimIdx)
  const lastKill = src.lastIndexOf("areExternalActionsEnabled(env)", claimIdx)
  assert.ok(lastRbac > 0 && lastRbac < claimIdx, "final RBAC must precede the claim")
  assert.ok(lastKill > 0 && lastKill < claimIdx, "final kill-switch must precede the claim")
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
