/**
 * P5.3 — Alpha operator runbook / manual review protocol contract.
 *
 * Static, read-only guards (matching the repo's alpha-safety-gate / readiness-gate /
 * dry-run test convention) so a future edit cannot silently drop the human-decision
 * requirement, a safety boundary, or the explicit non-authorizations.
 *
 * This test does NOT touch the network, the GitHub API, child_process, or the filesystem
 * (read-only). It only reads three docs under docs/ and asserts their content.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync, existsSync } from "node:fs"
import path from "node:path"

const root = process.cwd()

const RUNBOOK = path.join(root, "docs/legacy/ALPHA_OPERATOR_RUNBOOK.md")
const PROTOCOL = path.join(root, "docs/legacy/MANUAL_REVIEW_PROTOCOL.md")
const SIGNOFF = path.join(root, "docs/legacy/ALPHA_SIGNOFF_TEMPLATE.md")

const read = (p: string): string => (existsSync(p) ? readFileSync(p, "utf8") : "")
const runbook = read(RUNBOOK)
const protocol = read(PROTOCOL)
const signoff = read(SIGNOFF)

// ── Files exist ──────────────────────────────────────────────

test("1. docs/legacy/ALPHA_OPERATOR_RUNBOOK.md exists", () => {
  assert.equal(existsSync(RUNBOOK), true)
  assert.ok(runbook.length > 0)
})

test("2. docs/legacy/MANUAL_REVIEW_PROTOCOL.md exists", () => {
  assert.equal(existsSync(PROTOCOL), true)
  assert.ok(protocol.length > 0)
})

test("3. docs/legacy/ALPHA_SIGNOFF_TEMPLATE.md exists", () => {
  assert.equal(existsSync(SIGNOFF), true)
  assert.ok(signoff.length > 0)
})

// ── Operator runbook: human decision + forbidden actions ─────

test("4. operator runbook states the human operator makes the release decision", () => {
  assert.match(runbook, /making the release decision|human operator makes the release decision/i)
  assert.match(runbook, /must not decide autonomously/i)
})

test("5. operator runbook forbids all risky capabilities", () => {
  // The single authorization-limit line pins 9 of the 10 capabilities in a forbidding
  // context (not a bare mention), so a future edit cannot flip one to "authorize".
  assert.match(
    runbook,
    /does not authorize real LLM, external execution, OAuth, token storage, production deployment, publishing, release creation, release tags, or artifact upload/i,
  )
  // The remaining two are pinned via their specific §12 forbidding phrases.
  assert.match(runbook, /weaken the ruleset/i)
  assert.match(runbook, /bypass human approval/i)
})

// ── Manual review protocol: boundaries + governance ──────────

test("6. manual review protocol preserves the core boundaries", () => {
  for (const boundary of [
    "candidate != formal WorkUnit",
    "preview != approval",
    "approval != execution",
    "draft != sent",
    "LLM confidence cannot skip human review",
    "Electron shell must not increase authority",
    "Action Field is workspace, not execution plane",
  ]) {
    assert.ok(protocol.includes(boundary), `protocol must preserve boundary: ${boundary}`)
  }
})

test("7. manual review protocol requires validate + Main Safety Gate confirmation", () => {
  assert.match(protocol, /Main Safety Gate remains active|Main Safety Gate/i)
  assert.match(protocol, /required check is validate|required check is `validate`/i)
})

test("8. manual review protocol requires confirming risky capabilities are off", () => {
  assert.match(protocol, /real LLM is disabled/i)
  assert.match(protocol, /external execution is disabled/i)
  assert.match(protocol, /OAuth\/token storage is absent|OAuth.*absent/i)
  assert.match(protocol, /deployment was not performed/i)
  assert.match(protocol, /publish\/release\/tag\/upload was not performed/i)
})

// ── Sign-off template: decision + non-authorizations ─────────

test("9. sign-off template includes a standalone Go / Conditional Go / No-Go decision", () => {
  // "**Go**" is the standalone bolded decision option; it is NOT a substring of
  // "**Conditional Go**" or "**No-Go**", so this pins the standalone Go specifically.
  assert.ok(signoff.includes("**Go**"), "sign-off must offer a standalone Go option")
  assert.match(signoff, /Conditional Go/)
  assert.match(signoff, /No-Go/)
})

test("10. sign-off template includes explicit non-authorizations", () => {
  for (const line of [
    "This sign-off does not authorize real LLM enablement.",
    "This sign-off does not authorize external execution.",
    "This sign-off does not authorize OAuth or token storage.",
    "This sign-off does not authorize production deployment.",
    "This sign-off does not authorize publishing, release creation, release tags, or artifact upload.",
  ]) {
    assert.ok(signoff.includes(line), `sign-off must include: ${line}`)
  }
})
