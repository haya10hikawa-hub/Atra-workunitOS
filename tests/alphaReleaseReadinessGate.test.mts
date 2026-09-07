/**
 * P5.1 — Alpha Release Readiness Gate contract.
 *
 * Static, read-only guards (matching the repo's alpha-safety-gate / CI-workflow test
 * convention) so a future edit cannot silently drop the Alpha readiness definition, the
 * Release Candidate gate, or the risk register — or quietly authorize a risky capability.
 *
 * This test does NOT touch the network, the GitHub API, secrets, or the filesystem
 * (read-only). It only reads three docs under docs/ and asserts their content.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync, existsSync } from "node:fs"
import path from "node:path"

const root = process.cwd()

const ALPHA = path.join(root, "docs/legacy/ALPHA_RELEASE_READINESS.md")
const RC = path.join(root, "docs/legacy/RELEASE_CANDIDATE_GATE.md")
const RISK = path.join(root, "docs/legacy/RISK_REGISTER.md")

const read = (p: string): string => (existsSync(p) ? readFileSync(p, "utf8") : "")
const alpha = read(ALPHA)
const rc = read(RC)
const risk = read(RISK)

// ── Files exist ──────────────────────────────────────────────

test("1. docs/legacy/ALPHA_RELEASE_READINESS.md exists", () => {
  assert.equal(existsSync(ALPHA), true)
  assert.ok(alpha.length > 0)
})

test("2. docs/legacy/RELEASE_CANDIDATE_GATE.md exists", () => {
  assert.equal(existsSync(RC), true)
  assert.ok(rc.length > 0)
})

test("3. docs/legacy/RISK_REGISTER.md exists", () => {
  assert.equal(existsSync(RISK), true)
  assert.ok(risk.length > 0)
})

// ── RC gate content ──────────────────────────────────────────

test("4. RC gate mentions all required validation commands", () => {
  for (const cmd of [
    "npm test",
    "npm run alpha:safety-gate",
    "npm run lint",
    "npm run build",
    "npm run cf:build",
    "npm run electron:build:check",
    "git diff --check",
  ]) {
    assert.ok(rc.includes(cmd), `RC gate must require: ${cmd}`)
  }
})

test("5. RC gate names `validate` as the required GitHub check", () => {
  assert.match(rc, /validate/)
  assert.match(rc, /required check `validate`|`validate` required on the GitHub PR/)
})

test("6. RC gate keeps risky capabilities No-Go and does not authorize them", () => {
  // The explicit authorization-limit statement must be present.
  assert.match(
    rc,
    /does not authorize real LLM, external execution, OAuth, token storage, or production deployment/i,
  )
  for (const nogo of ["real LLM disabled", "external execution disabled"]) {
    assert.ok(rc.includes(nogo), `RC gate Part C must state: ${nogo}`)
  }
})

test("7. RC gate preserves the Main Safety Gate governance requirements", () => {
  assert.match(rc, /Main Safety Gate/)
  assert.match(rc, /required check `validate`|context `validate`/)
  assert.match(rc, /non_fast_forward/)
  assert.match(rc, /deletion/)
  assert.match(rc, /bypass[_ ]actors\s*(empty|:\s*\[\])/i)
})

// ── Alpha doc explicit prohibitions ──────────────────────────

test("8. Alpha docs explicitly forbid real LLM enablement", () => {
  assert.match(alpha, /MUST NOT call real LLM/i)
})

test("9. Alpha docs explicitly forbid external execution", () => {
  assert.match(alpha, /MUST NOT enable external execution/i)
})

test("10. Alpha docs explicitly forbid OAuth / token storage", () => {
  assert.match(alpha, /MUST NOT store OAuth or provider tokens/i)
})

test("11. Alpha docs explicitly forbid production deployment", () => {
  assert.match(alpha, /MUST NOT deploy production/i)
})

test("12. Alpha docs forbid bypassing human approval and CI / branch protection", () => {
  assert.match(alpha, /MUST NOT bypass human approval/i)
  assert.match(alpha, /MUST NOT bypass CI or branch protection/i)
})

// ── Risk register required risks ─────────────────────────────

test("13. Risk register includes the TenantSecretProvider / token-storage risk", () => {
  assert.ok(
    /TenantSecretProvider/i.test(risk) || /token storage/i.test(risk),
    "risk register must cover TenantSecretProvider or token storage",
  )
})

test("14. Risk register includes an audit / operator-review limitation", () => {
  assert.match(risk, /audit/i)
  assert.match(risk, /operator[- ]?review|operator-facing|audit viewer/i)
})

test("15. Risk register includes deployment-not-proven", () => {
  assert.match(risk, /deployment not proven|not been proven|deploy.*not.*proven/i)
})

// ── Meaningfulness / no-op-rot guard ─────────────────────────

test("16. Alpha doc states the strict non-production, non-autonomous definition", () => {
  assert.match(alpha, /controlled, non-production, non-autonomous evaluation build/i)
})
