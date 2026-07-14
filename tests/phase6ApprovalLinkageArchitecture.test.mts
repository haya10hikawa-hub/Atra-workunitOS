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
import { execSync } from "node:child_process"
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

test("the live Approval and ActionPreview routes are byte-identical to main", () => {
  for (const rel of [
    "app/api/workunit/[id]/approval/route.ts",
    "app/api/workunit/[id]/action-preview/route.ts",
    "app/lib/security/approvalStore.ts",
  ]) {
    const diff = execSync(`git -C "${REPO_ROOT}" diff origin/main -- "${rel}"`, { encoding: "utf8" })
    assert.equal(diff.trim(), "", `${rel} must be unchanged vs origin/main`)
  }
})
