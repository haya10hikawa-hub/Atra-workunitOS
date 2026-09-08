/**
 * P5.5 — Alpha exit criteria / next capability gate contract.
 *
 * Static, read-only guards (matching the repo's alpha-safety-gate / readiness-gate /
 * dry-run / operator-runbook / evidence-ledger test convention) so a future edit cannot
 * silently weaken the Alpha exit checkpoint or the per-capability gate — or let a gate
 * become an authorization to implement a risky capability.
 *
 * This test does NOT touch the network, the GitHub API, child_process, or the filesystem
 * (read-only). It only reads two docs under docs/ and asserts their content.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync, existsSync } from "node:fs"
import path from "node:path"

const root = process.cwd()

const EXIT = path.join(root, "docs/legacy/ALPHA_EXIT_CRITERIA.md")
const GATE = path.join(root, "docs/archive/v0/NEXT_CAPABILITY_GATE.md")

const read = (p: string): string => (existsSync(p) ? readFileSync(p, "utf8") : "")
const exit = read(EXIT)
const gate = read(GATE)

const requireAll = (haystack: string, needles: string[], label: string): void => {
  for (const n of needles) assert.ok(haystack.includes(n), `${label} must include: ${n}`)
}

// ── Files exist ──────────────────────────────────────────────

test("1. docs/legacy/ALPHA_EXIT_CRITERIA.md exists", () => {
  assert.equal(existsSync(EXIT), true)
  assert.ok(exit.length > 0)
})

test("2. docs/archive/v0/NEXT_CAPABILITY_GATE.md exists", () => {
  assert.equal(existsSync(GATE), true)
  assert.ok(gate.length > 0)
})

// ── Alpha exit criteria ──────────────────────────────────────

test("3. Alpha exit doc states exit does not authorize risky capabilities", () => {
  assert.match(
    exit,
    /Alpha exit means the project has completed the Alpha governance baseline\. It does not authorize real LLM enablement, external execution, OAuth\/token storage, production deployment, publishing, release creation, release tags, or artifact upload\./i,
  )
})

test("4. Alpha exit doc requires the baseline conditions", () => {
  requireAll(exit, [
    "P1 through P5.4 are present and verified",
    "Main Safety Gate remains active",
    "required check is validate",
    "full validation passes",
    "Alpha RC dry-run is reproducible",
    "operator runbook exists",
    "evidence ledger exists",
    "release decision record exists",
  ], "Alpha exit doc baseline conditions")
})

test("5. Alpha exit doc requires the unresolved-risk review", () => {
  requireAll(exit, [
    "TenantSecretProvider",
    "OAuth/token storage absent",
    "real LLM disabled",
    "external execution disabled",
    "deployment not proven",
    "audit/operator review limitations",
    "observability",
    "rollback/kill-switch assumptions",
  ], "Alpha exit doc unresolved-risk review")
})

// ── Next capability gate ─────────────────────────────────────

test("6. Next capability gate states passing it does not authorize implementation by itself", () => {
  assert.match(gate, /Passing this document does not authorize implementation by itself/i)
})

test("7. Next capability gate includes all capability categories", () => {
  requireAll(gate, [
    "real LLM provider enablement",
    "external action execution",
    "OAuth/token storage",
    "production deployment",
    "Electron authority expansion",
    "persistent runtime evidence storage",
  ], "capability categories")
})

test("8. Next capability gate includes all universal prerequisites", () => {
  requireAll(gate, [
    "P1 through P5.4 preserved",
    "Main Safety Gate active",
    "validate required",
    "full validation passing",
    "evidence ledger updated",
    "release decision record updated",
    "human sign-off recorded",
    "rollback / disable plan documented",
    "secret handling plan documented",
    "observability plan documented",
  ], "universal prerequisites")
})

test("9. Next capability gate includes real LLM gate requirements", () => {
  requireAll(gate, [
    "provider allowlist",
    "tenant-scoped secret handling",
    "fail-closed provider errors",
    "prompt/input redaction review",
    "budget/rate limits",
    "audit events for provider calls",
    "test plan without live secrets",
  ], "real LLM gate")
})

test("10. Next capability gate includes external execution gate requirements", () => {
  requireAll(gate, [
    "operation allowlist",
    "server-side authorization",
    "approval verification",
    "idempotency / replay protection",
    "dry-run preview",
    "audit events",
    "kill switch",
    "rollback plan",
  ], "external execution gate")
})

test("11. Next capability gate includes OAuth/token storage gate requirements", () => {
  requireAll(gate, [
    "threat model",
    "encrypted storage design",
    "token rotation / revocation",
    "tenant isolation",
    "least privilege scopes",
    "no token exposure in logs",
    "manual review before enabling",
  ], "OAuth/token storage gate")
})

test("12. Next capability gate includes deployment/production gate requirements", () => {
  requireAll(gate, [
    "production environment review",
    "secret management plan",
    "rollback plan",
    "monitoring / alerting",
    "incident response owner",
    "backup / retention plan",
    "no public release without human sign-off",
  ], "deployment/production gate")
})

test("13. Next capability gate carries the explicit non-authorization statement", () => {
  assert.match(
    gate,
    /This gate does not authorize real LLM, external execution, OAuth\/token storage, production deployment, publishing, release creation, release tags, artifact upload, database implementation, API routes, UI changes, or Electron authority expansion\./i,
  )
})
