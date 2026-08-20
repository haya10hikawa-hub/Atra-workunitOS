/**
 * P6-FIX-011: architecture and boundary source-guard tests for the Approval
 * Chain Linkage module (Issue #144). Pins the module file set, the one-way
 * dependency direction, the module-private brand, the absence of
 * capability-bearing / route / store / persistence / P7.1-MAC imports, the
 * single canonical issue-code list, and — WITHOUT changing them — that the
 * live Approval and ActionPreview routes and ApprovalStore are untouched.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { createHash } from "node:crypto"
import * as approvalLinkageModule from "../app/lib/phase6/approvalLinkage/index.ts"

const MODULE_DIR = fileURLToPath(new URL("../app/lib/phase6/approvalLinkage/", import.meta.url))
const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url))
const MODULE_FILES = [
  "audit.ts", "canonical.ts", "constructors.ts", "index.ts",
  "sourceEvaluation.ts", "types.ts", "validation.ts", "verifier.ts",
] as const

function read(rel: string): string {
  return readFileSync(`${MODULE_DIR}${rel}`, "utf8")
}
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")
}
function importsOf(code: string): string[] {
  return (code.match(/from "([^"]+)"/g) ?? []).map((m) => m.slice(6, -1))
}

test("module file set is exactly the declared eight files", () => {
  assert.deepEqual(readdirSync(MODULE_DIR).sort(), [...MODULE_FILES])
})

test("the module imports only the sanctioned upstream surfaces", () => {
  const allowed = new Set([
    "./types.ts", "./validation.ts", "./canonical.ts", "./sourceEvaluation.ts",
    "./constructors.ts", "./verifier.ts", "./audit.ts",
    "../artifacts/index.ts", "../reviewEvidence/index.ts",
    "../canonicalIdentity/index.ts", "../identityIndependence/index.ts",
    "../shared/isoUtcTimestamp.ts", "../../security/hash.ts",
    "../../persistence/types.ts",
  ])
  for (const rel of MODULE_FILES) {
    const code = stripComments(read(rel))
    for (const spec of importsOf(code)) {
      assert.ok(allowed.has(spec), `${rel}: unexpected import ${spec}`)
    }
  }
})

test("persistence rows are imported TYPE-ONLY (no runtime persistence coupling)", () => {
  const typesCode = stripComments(read("types.ts"))
  assert.ok(/import type \{[^}]*\} from "\.\.\/\.\.\/persistence\/types\.ts"/.test(typesCode))
  for (const rel of MODULE_FILES) {
    if (rel === "types.ts") continue
    const code = stripComments(read(rel))
    assert.ok(!code.includes("persistence/types"), `${rel}: persistence row type must stay in types.ts`)
  }
})

test("the module carries no route / store / persistence / MAC / capability import", () => {
  for (const rel of MODULE_FILES) {
    const code = stripComments(read(rel))
    for (const forbidden of [
      "/api/", "next/server", "approvalStore", "ApprovalStore", "approvalStoreResolver",
      "approvalPreviewBinding", "repositories", "Repository", "routeRepositories",
      "d1/", "D1Database", "approvalMac", "canonicalApprovalPayload", "computeApprovalMac",
      "markApprovalUsed", "writeAuditLog", "recordAuditEvent", "auditLog", "externalActions",
      "electron", "process.env", "fetch(", "child_process", "createHash", "Math.random",
    ]) {
      assert.ok(!code.includes(forbidden), `${rel} must not reference ${forbidden}`)
    }
  }
})

test("the opaque brand is compile-time only and never exported", () => {
  const code = stripComments(read("types.ts"))
  assert.ok(/declare const approvalLinkageRecordBrand: unique symbol/.test(code))
  for (const rel of MODULE_FILES) {
    const c = stripComments(read(rel))
    assert.ok(!/export\s+(?:declare\s+)?const\s+\w*[Bb]rand/.test(c), `${rel}: brand not exported`)
    assert.ok(!/export\s+function\s+\w*[Bb]rand/.test(c), `${rel}: no branding helper`)
  }
})

test("the canonical issue-code list is declared exactly once (in validation.ts)", () => {
  const declarations: string[] = []
  for (const rel of MODULE_FILES) {
    if (/const APPROVAL_LINKAGE_ISSUE_CODES\s*=\s*\[/.test(stripComments(read(rel)))) declarations.push(rel)
  }
  assert.deepEqual(declarations, ["validation.ts"])
})

test("the public namespace excludes sourceEvaluation and has no grant-like export", () => {
  const names = Object.keys(approvalLinkageModule)
  assert.ok(!names.includes("evaluateApprovalChain"), "sourceEvaluation stays module-private")
  for (const name of names) {
    for (const grant of ["approve", "authorize", "execute", "grant", "permit", "promote", "markused"]) {
      assert.ok(!name.toLowerCase().includes(grant), `export ${name} must not look grant-like`)
    }
  }
})

test("no live route, ApprovalStore, or binding imports the linkage module", () => {
  const targets = [
    "app/api/workunit/[id]/action-preview/route.ts",
    "app/api/workunit/[id]/approval/route.ts",
    "app/api/workunit/[id]/approval/status/route.ts",
    "app/api/workunit/[id]/execution/dry-run/route.ts",
    "app/lib/security/approvalStore.ts",
    "app/lib/security/approvalStoreResolver.ts",
    "app/lib/security/approvalPreviewBinding.ts",
  ]
  for (const rel of targets) {
    const code = readFileSync(`${REPO_ROOT}${rel}`, "utf8")
    assert.ok(!code.includes("approvalLinkage"), `${rel} must not import the linkage module`)
  }
})

test("the live Approval / ActionPreview routes are byte-identical to the P6-FIX-011 baseline; ApprovalStore is pinned at the sanctioned P6-FIX-012 content", () => {
  // CI-safe: compare content SHA-256 digests against pinned digests. This uses no
  // remote refs, no `origin/main`, no `git fetch`, and no network — so it
  // passes identically in a normal checkout AND in the shallow merge-ref
  // checkout GitHub Actions uses.
  //
  // `approvalStore.ts` is intentionally advanced by Issue #145 (P6-FIX-012): it
  // adds the exact-binding `claimApprovalForRuntime` method and harmonizes
  // `verifyApproval` expiry to inclusive-fail. Its pin stays at that content.
  //
  // The two live routes were advanced by Issue #129 (P0-RUNTIME-013, round 3):
  // each resolves the request-scoped runtime config ONCE and threads that
  // single frozen object into `requireSession(request, runtime)` and
  // `resolveRouteRepositories(tenantId, runtime)`.
  //
  // WU-02S advances them again, and ONLY these two digests move:
  //   - the inline `validateCsrfOrigin` call is replaced by
  //     `checkMutationRequestIntegrity`, which additionally binds the target
  //     Host, the body-size precheck and the Content-Type;
  //   - runtime-config resolution is hoisted to the FIRST statement, because the
  //     guard's trusted-origin policy is a projection of it;
  //   - `checkRateLimit` moves below tenant authority, and the route RBAC check
  //     moves ABOVE the body read.
  // The approval decision logic, hashing, four-eyes and RBAC predicates are
  // otherwise unchanged. `approvalStore.ts` is NOT touched and its pin is
  // deliberately left at the P6-FIX-012 content.
  //
  // A digest says "these bytes". The five-route semantic ordering assertion in
  // `securityRefactorCriteriaRatchet.test.mts` says "these bytes still enforce
  // this order" — that test is what makes re-pinning here safe. A further
  // accidental or unauthorized edit still fails.
  //
  // WU-06 advances the two route digests once more, and ONLY by their import
  // block: `requireSession` now comes from the request composition root
  // (`app/lib/composition/requestSession.ts`) instead of the security session
  // boundary, and `getSessionErrorStatus` stays where it is. No handler body,
  // ordering, predicate or hashing step is touched — the AST handler hashes in
  // `security-surface.v1.json` are unchanged, which is the independent evidence
  // that only the import line moved. `approvalStore.ts` is again NOT touched.
  const PINNED_BASELINE_DIGESTS: Readonly<Record<string, string>> = {
    "app/api/workunit/[id]/approval/route.ts":
      "07cf7ff011b7115dd252cb79462d1a6ffe1004c6411dee64fde320b814cf319c",
    "app/api/workunit/[id]/action-preview/route.ts":
      "dc9b541b900e8afd8467dd6c7dc7fa2bdb387959f92bbe5d4f5fb42cd56aaaee",
    "app/lib/security/approvalStore.ts":
      "fe95e65db109e10f60236a9ebe2870c29b7dcdd8ed837e3b9397aa9937d0c04c",
  }
  for (const [rel, pinned] of Object.entries(PINNED_BASELINE_DIGESTS)) {
    const bytes = readFileSync(`${REPO_ROOT}${rel}`)
    const digest = createHash("sha256").update(bytes).digest("hex")
    assert.equal(digest, pinned, `${rel} must be unchanged from the P6-FIX-011 baseline (content digest)`)
  }
})

test("source guard: the architecture suite uses no remote-ref or network-dependent command", () => {
  // Prove this suite itself never reaches for a remote ref, git, or the
  // network, so CI cannot regress to a shallow-checkout failure. The needles
  // are assembled from fragments so this guard does not match its own literals.
  const self = readFileSync(fileURLToPath(new URL("./phase6ApprovalLinkageArchitecture.test.mts", import.meta.url)), "utf8")
  const code = stripComments(self)
  // Needles are assembled from fragments and chosen to match only genuine
  // command usage — never a bare token that a sibling forbidden-list literal
  // (e.g. "child_process") would trip.
  const forbidden = [
    "origin" + "/main",
    "git " + "fetch",
    "git " + "diff",
    "exec" + "Sync(",
    'node:' + 'child_process',
    "http" + "s://",
  ]
  for (const needle of forbidden) {
    assert.ok(!code.includes(needle), `architecture suite must not use ${needle}`)
  }
})
