/**
 * Security P3 — CI Safety Gate workflow contract.
 *
 * Static guards (matching the repo's alpha-safety-gate / electron-invariant test
 * convention) so a future edit cannot silently drop a validation gate, widen the
 * triggers, add secrets, or turn CI into a deployment.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync, existsSync } from "node:fs"
import path from "node:path"

const root = process.cwd()
const WORKFLOW = path.join(root, ".github/workflows/ci.yml")
const ci = existsSync(WORKFLOW) ? readFileSync(WORKFLOW, "utf8") : ""

test("1. CI workflow file exists", () => {
  assert.equal(existsSync(WORKFLOW), true)
  assert.ok(ci.length > 0)
})

test("2. CI triggers on pull_request to main and push to main", () => {
  assert.match(ci, /pull_request:/)
  assert.match(ci, /push:/)
  // Both triggers scope to the main branch.
  assert.match(ci, /branches:\s*\n\s*-\s*main/)
})

test("3. CI runs the full manual validation sequence", () => {
  for (const cmd of [
    "npm ci",
    "npm test",
    "npm run alpha:safety-gate",
    "npm run lint",
    "npm run build",
    "npm run cf:build",
    "npm run electron:build:check",
    "git diff --check",
  ]) {
    assert.ok(ci.includes(cmd), `CI must run: ${cmd}`)
  }
})

test("4. CI uses least-privilege read-only permissions", () => {
  assert.match(ci, /permissions:\s*\n\s*contents:\s*read/)
})

test("5. CI uses no secrets", () => {
  assert.equal(ci.includes("secrets."), false, "CI must not reference secrets")
  assert.equal(/\benv:\s*\n\s+[A-Z_]+:\s*\$\{\{\s*secrets/.test(ci), false)
})

test("6. CI does not deploy", () => {
  for (const bad of ["wrangler deploy", "npm run deploy", "actions/deploy", "cf:dev"]) {
    assert.equal(ci.includes(bad), false, `CI must not deploy via ${bad}`)
  }
  // The bare deploy command is forbidden, but the non-deploying, synthetic-only
  // gates `cf:deploy:preflight` / `cf:deploy:dry-run` are allowed (and required).
  assert.equal(/cf:deploy(?![:\w-])/.test(ci), false, "CI must not run the bare cf:deploy command")
  assert.ok(ci.includes("cf:deploy:preflight"), "CI must run the deploy preflight gate")
  assert.ok(ci.includes("cf:deploy:dry-run"), "CI must run the non-deploying dry-run gate")
})

test("7. CI does not enable external execution or real LLM", () => {
  for (const bad of ["EXTERNAL_ACTIONS_ENABLED", "DEEPSEEK_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"]) {
    assert.equal(ci.includes(bad), false, `CI must not set ${bad}`)
  }
})

test("8. CI uses Node 22 (required for --experimental-strip-types tests)", () => {
  assert.match(ci, /node-version:\s*22/)
})
