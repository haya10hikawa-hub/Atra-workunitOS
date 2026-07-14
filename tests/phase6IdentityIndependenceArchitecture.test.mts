/**
 * P6-FIX-010: architecture and boundary tests for the Phase 6 canonical
 * identity core and identity-independence gate (Issue #143).
 *
 * Pins, via READ-ONLY source inspection and public-namespace inspection:
 * the module file sets, the one-way dependency direction (canonicalIdentity →
 * reviewEvidence → identityIndependence), the module-private compile-time
 * brand, the absence of capability-bearing imports, the single canonical
 * issue-code source of truth, and — WITHOUT altering the route — the existing
 * ActionPreview approval route's local self-approval defense.
 *
 * Imports ONLY node:test, node:assert/strict, node:fs / node:url (to READ,
 * never mutate, repository sources), and the two new module public surfaces.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import * as identityIndependenceModule from "../app/lib/phase6/identityIndependence/index.ts"

const CANONICAL_DIR = fileURLToPath(
  new URL("../app/lib/phase6/canonicalIdentity/", import.meta.url),
)
const INDEPENDENCE_DIR = fileURLToPath(
  new URL("../app/lib/phase6/identityIndependence/", import.meta.url),
)
const REVIEW_EVIDENCE_DIR = fileURLToPath(
  new URL("../app/lib/phase6/reviewEvidence/", import.meta.url),
)
const APPROVAL_ROUTE = fileURLToPath(
  new URL("../app/api/workunit/[id]/approval/route.ts", import.meta.url),
)

const CANONICAL_FILES = ["constructors.ts", "index.ts", "types.ts", "validation.ts"] as const
const INDEPENDENCE_FILES = [
  "audit.ts",
  "index.ts",
  "types.ts",
  "validation.ts",
  "verifier.ts",
] as const

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")
}

function readSrc(dir: string, rel: string): string {
  return readFileSync(`${dir}${rel}`, "utf8")
}

function importsOf(code: string): string[] {
  return (code.match(/from "([^"]+)"/g) ?? []).map((m) => m.slice(6, -1))
}

// ─── Module file sets ───────────────────────────────────────────

test("module file sets are exactly the declared files", () => {
  assert.deepEqual(readdirSync(CANONICAL_DIR).sort(), [...CANONICAL_FILES])
  assert.deepEqual(readdirSync(INDEPENDENCE_DIR).sort(), [...INDEPENDENCE_FILES])
})

// ─── Dependency direction ───────────────────────────────────────

test("canonicalIdentity is a leaf: only sibling files, shared leaf utils, and type-only canonical type sources", () => {
  const allowed = new Set([
    "./types.ts",
    "./validation.ts",
    "./constructors.ts",
    "../shared/isoUtcTimestamp.ts",
    "../../domain/auth/types.ts",
    "../../persistence/types.ts",
  ])
  for (const rel of CANONICAL_FILES) {
    const code = stripComments(readSrc(CANONICAL_DIR, rel))
    for (const spec of importsOf(code)) {
      assert.ok(allowed.has(spec), `${rel}: unexpected import ${spec}`)
    }
    // Never the higher layers, artifacts, stores, repositories, or routes.
    for (const forbidden of [
      "reviewEvidence",
      "identityIndependence",
      "../artifacts",
      "approvalStore",
      "ApprovalStore",
      "repositories",
      "Repository",
      "/api/",
      "next/server",
    ]) {
      assert.ok(!code.includes(forbidden), `${rel}: must not reference ${forbidden}`)
    }
  }
  // SessionContext and ActionPreviewRow enter as TYPE-ONLY imports.
  const typesCode = stripComments(readSrc(CANONICAL_DIR, "types.ts"))
  assert.ok(/import type \{ SessionContext \} from "\.\.\/\.\.\/domain\/auth\/types\.ts"/.test(typesCode))
  assert.ok(/import type \{ ActionPreviewRow \} from "\.\.\/\.\.\/persistence\/types\.ts"/.test(typesCode))
  for (const rel of ["validation.ts", "constructors.ts", "index.ts"]) {
    const code = stripComments(readSrc(CANONICAL_DIR, rel))
    assert.ok(!code.includes("persistence/types"), `${rel}: row type stays in types.ts`)
    assert.ok(!code.includes("domain/auth"), `${rel}: session type stays in types.ts`)
  }
})

test("identityIndependence consumes only the sanctioned public surfaces", () => {
  const allowed = new Set([
    "./types.ts",
    "./validation.ts",
    "./verifier.ts",
    "./audit.ts",
    "../canonicalIdentity/index.ts",
    "../reviewEvidence/index.ts",
    "../artifacts/index.ts",
    "../shared/isoUtcTimestamp.ts",
  ])
  for (const rel of INDEPENDENCE_FILES) {
    const code = stripComments(readSrc(INDEPENDENCE_DIR, rel))
    for (const spec of importsOf(code)) {
      assert.ok(allowed.has(spec), `${rel}: unexpected import ${spec}`)
    }
  }
})

test("no circular dependency: reviewEvidence never imports the independence gate", () => {
  for (const rel of readdirSync(REVIEW_EVIDENCE_DIR)) {
    const code = stripComments(readSrc(REVIEW_EVIDENCE_DIR, rel))
    assert.ok(!code.includes("identityIndependence"), `${rel}: no upward import`)
    // reviewEvidence may import canonicalIdentity only via its public index.
    const canonicalImports = code.match(/from "\.\.\/canonicalIdentity\/[^"]*"/g) ?? []
    for (const found of canonicalImports) {
      assert.equal(
        found,
        'from "../canonicalIdentity/index.ts"',
        `${rel}: canonicalIdentity must be imported via index.ts only`,
      )
    }
  }
})

// ─── Opaque brand stays private ─────────────────────────────────

test("the canonical identity brand is compile-time only and never exported", () => {
  const code = stripComments(readSrc(CANONICAL_DIR, "types.ts"))
  assert.ok(/declare const canonicalIdentityBrand: unique symbol/.test(code))
  for (const rel of CANONICAL_FILES) {
    const fileCode = stripComments(readSrc(CANONICAL_DIR, rel))
    assert.ok(
      !/export\s+(?:declare\s+)?const\s+\w*[Bb]rand/.test(fileCode),
      `${rel}: brand is not exported`,
    )
    assert.ok(!/export\s+function\s+\w*[Bb]rand/.test(fileCode), `${rel}: no branding helper`)
  }
})

// ─── No capability-bearing imports ──────────────────────────────

test("neither module carries any capability-bearing import or call", () => {
  const forbidden = [
    ["fet", "ch("],
    ["process", ".env"],
    ["child_", "process"],
    ["node:", "fs"],
    ['from "', 'fs"'],
    ["require", "("],
    ["import", "("],
    ["globalThis", "["],
    ["Date", ".now"],
    ["new ", "Date"],
    ["Date", ".parse"],
    ["Math", ".random"],
    ["random", "UUID"],
    ["Approval", "Store"],
    ["approval", "Mac"],
    ["append", "EvidenceLedger"],
    ["write", "Graph"],
    ["execute", "External"],
    ["D1", "Database"],
    [".prep", "are("],
  ]
  for (const [dir, files] of [
    [CANONICAL_DIR, CANONICAL_FILES],
    [INDEPENDENCE_DIR, INDEPENDENCE_FILES],
  ] as const) {
    for (const rel of files) {
      const code = stripComments(readSrc(dir, rel))
      for (const [a, b] of forbidden) {
        assert.ok(!code.includes(a + b), `${rel} must not contain: <<<${a + b}>>>`)
      }
    }
  }
})

// ─── Single issue-code source of truth ──────────────────────────

test("the canonical issue-code list exists exactly once", () => {
  const declarations: string[] = []
  for (const [dir, files] of [
    [CANONICAL_DIR, CANONICAL_FILES],
    [INDEPENDENCE_DIR, INDEPENDENCE_FILES],
  ] as const) {
    for (const rel of files) {
      const code = stripComments(readSrc(dir, rel))
      if (/const CANONICAL_IDENTITY_ISSUE_CODES\s*=\s*\[/.test(code)) {
        declarations.push(rel)
      }
      // The gate must not declare a rival code list of its own.
      if (dir === INDEPENDENCE_DIR) {
        assert.ok(
          !/const\s+\w*ISSUE_CODES\s*=\s*\[/.test(code),
          `${rel}: no duplicated issue-code list`,
        )
      }
    }
  }
  assert.deepEqual(declarations, ["validation.ts"], "declared once, in canonicalIdentity")
})

// ─── Public namespace is closed and non-authorizing ─────────────

test("the identityIndependence public namespace is exactly the declared surface", () => {
  assert.deepEqual(Object.keys(identityIndependenceModule).sort(), [
    "IDENTITY_INDEPENDENCE_AUDIT_EVENT_KINDS",
    "createIdentityIndependenceAuditEvent",
    "identityIndependenceIssue",
    "identityIndependenceResultOf",
    "rescopeIssueField",
    "sanitizeIdentityIndependenceAuditIssueCodes",
    "verifyIdentityIndependence",
  ])
  // No export name suggests approval, authorization, or execution capability.
  for (const name of Object.keys(identityIndependenceModule)) {
    for (const grant of ["approve", "authorize", "execute", "grant", "permit", "promote"]) {
      assert.ok(
        !name.toLowerCase().includes(grant),
        `export ${name} must not look grant-like`,
      )
    }
  }
})

// ─── Existing approval route: local defense pinned, gate not wired ──

test("route source guard: the ActionPreview approval route keeps its local self-approval defense", () => {
  const code = stripComments(readFileSync(APPROVAL_ROUTE, "utf8"))
  // Creator comes from the STORED preview row; approver from the SESSION.
  assert.ok(
    code.includes("!preview.creatorUserId || preview.creatorUserId === session.userId"),
    "missing-creator and same-user rejection must both remain",
  )
  // The rejection emits the canonical stable code.
  assert.ok(code.includes('"self_approval_forbidden"'), "self_approval_forbidden is emitted")
  // The approver recorded on approval is the session user, never client input.
  assert.ok(
    code.includes('approvedByUserId: decision === "approve" ? session.userId : undefined'),
    "approver must be derived from the authenticated session",
  )
})

test("route source guard: the new identity gate is NOT wired into the route before Issue #144", () => {
  const code = stripComments(readFileSync(APPROVAL_ROUTE, "utf8"))
  for (const forbidden of [
    "identityIndependence",
    "canonicalIdentity",
    "verifyIdentityIndependence",
    "createCanonicalSessionIdentity",
  ]) {
    assert.ok(!code.includes(forbidden), `route must not reference ${forbidden} yet`)
  }
})

test("route regression tests still exercise the self-approval defense", () => {
  // The behavioral tests for the route's defense live in
  // tests/actionPreviewApprovalSecurity.test.mts; pin that they still cover
  // missing-creator and same-user rejection so the defense cannot be
  // silently un-tested.
  const testSrc = readFileSync(
    fileURLToPath(new URL("./actionPreviewApprovalSecurity.test.mts", import.meta.url)),
    "utf8",
  )
  assert.ok(testSrc.includes("self_approval_forbidden"), "same-user rejection is tested")
  assert.ok(testSrc.includes('creatorUserId: "dev-user"'), "self-approval fixture present")
  assert.ok(testSrc.includes("preview:missing-creator"), "missing-creator rejection is tested")
})
