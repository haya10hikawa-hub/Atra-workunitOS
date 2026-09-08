/**
 * P5.2 — Alpha Release Candidate dry-run contract.
 *
 * Static, read-only guards (matching the repo's alpha-safety-gate / readiness-gate test
 * convention) so a future edit cannot silently drop a dry-run command, weaken a forbidden
 * action, or turn the Alpha "package" into a publish/deploy/release path.
 *
 * This test does NOT touch the network, the GitHub API, child_process, or the filesystem
 * (read-only). It only reads two docs under docs/ and asserts their content.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync, existsSync } from "node:fs"
import path from "node:path"

const root = process.cwd()

const DRYRUN = path.join(root, "docs/legacy/ALPHA_RC_DRY_RUN.md")
const PKG = path.join(root, "docs/legacy/ALPHA_PACKAGE_VERIFICATION.md")

const read = (p: string): string => (existsSync(p) ? readFileSync(p, "utf8") : "")
const dry = read(DRYRUN)
const pkg = read(PKG)

// ── Files exist ──────────────────────────────────────────────

test("1. docs/legacy/ALPHA_RC_DRY_RUN.md exists", () => {
  assert.equal(existsSync(DRYRUN), true)
  assert.ok(dry.length > 0)
})

test("2. docs/legacy/ALPHA_PACKAGE_VERIFICATION.md exists", () => {
  assert.equal(existsSync(PKG), true)
  assert.ok(pkg.length > 0)
})

// ── Dry-run command sequence ─────────────────────────────────

test("3. dry-run doc lists all required commands", () => {
  for (const cmd of [
    "git status --short",
    "git fetch origin",
    "git pull origin main",
    "npm test",
    "npm run alpha:safety-gate",
    "npm run lint",
    "npm run build",
    "npm run cf:build",
    "npm run electron:build:check",
    "git diff --check",
  ]) {
    assert.ok(dry.includes(cmd), `dry-run doc must list: ${cmd}`)
  }
})

// ── Forbidden deploy / publish / release actions ─────────────

test("4. dry-run doc explicitly forbids deploy/publish/release actions", () => {
  for (const forbidden of [
    "wrangler deploy",
    "npm publish",
    "gh release create",
    "git tag",
    "electron publish",
    "uploading artifacts",
  ]) {
    assert.ok(dry.includes(forbidden), `dry-run doc must forbid: ${forbidden}`)
  }
  // The forbidden section must actually be framed as prohibition.
  assert.match(dry, /MUST NOT|forbidden|must not/i)
})

test("5. dry-run doc forbids real LLM, external execution, OAuth/token storage, ruleset changes", () => {
  assert.match(dry, /real LLM/i)
  assert.match(dry, /external execution/i)
  assert.match(dry, /OAuth/i)
  assert.match(dry, /token storage/i)
  assert.match(dry, /ruleset/i)
})

// ── Package verification doc ─────────────────────────────────

test("6. package verification doc states an Alpha package is not a public release or deployment", () => {
  assert.match(
    pkg,
    /not a public release, not a deployment/i,
  )
  assert.match(pkg, /Alpha package/i)
})

test("7. package verification doc requires no secrets / credentials / provider keys / OAuth tokens", () => {
  for (const req of [
    "no secrets in artifacts",
    "no production credentials",
    "no real LLM provider keys",
    "no external-action credentials",
    "no OAuth tokens",
  ]) {
    assert.ok(pkg.includes(req), `package verification doc must require: ${req}`)
  }
})

test("8. package verification doc requires no publish/upload step", () => {
  assert.ok(pkg.includes("no publish/upload step"))
})

// ── Meaningfulness / no-op-rot guard ─────────────────────────

test("9. dry-run doc ties back to the RC gate authorization limit", () => {
  assert.match(
    dry,
    /does not authorize real LLM, external execution, OAuth, token storage, or production deployment/i,
  )
})

test("10. package verification doc forbids deployment-target mutation and requires operator review", () => {
  assert.ok(pkg.includes("no deployment target mutation"))
  assert.match(pkg, /operator review|operator confirms|human reviews/i)
})
