/**
 * P5.4 — Alpha evidence ledger / release decision record contract.
 *
 * Static, read-only guards (matching the repo's alpha-safety-gate / readiness-gate /
 * dry-run / operator-runbook test convention) so a future edit cannot silently drop a
 * required evidence entry, a decision state, a non-authorization, or the human-decision
 * requirement — or turn the ledger into a database / backend / runtime feature.
 *
 * This test does NOT touch the network, the GitHub API, child_process, or the filesystem
 * (read-only). It only reads two docs under docs/ and asserts their content.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync, existsSync } from "node:fs"
import path from "node:path"

const root = process.cwd()

const LEDGER = path.join(root, "docs/legacy/ALPHA_EVIDENCE_LEDGER.md")
const RDR = path.join(root, "docs/legacy/RELEASE_DECISION_RECORD.md")

const read = (p: string): string => (existsSync(p) ? readFileSync(p, "utf8") : "")
const ledger = read(LEDGER)
const rdr = read(RDR)

// ── Files exist ──────────────────────────────────────────────

test("1. docs/legacy/ALPHA_EVIDENCE_LEDGER.md exists", () => {
  assert.equal(existsSync(LEDGER), true)
  assert.ok(ledger.length > 0)
})

test("2. docs/legacy/RELEASE_DECISION_RECORD.md exists", () => {
  assert.equal(existsSync(RDR), true)
  assert.ok(rdr.length > 0)
})

// ── Evidence ledger: identity + non-database framing ─────────

test("3. evidence ledger states it is a human-readable record", () => {
  assert.match(ledger, /human-readable review record/i)
})

test("4. evidence ledger states it is not a database / backend / deployment artifact / permission", () => {
  assert.match(
    ledger,
    /not a database, not an audit-log backend, not a deployment artifact, and not permission to enable real integrations/i,
  )
})

test("5. evidence ledger requires all required evidence entries", () => {
  for (const [label, re] of [
    ["candidate commit SHA", /candidate commit SHA/i],
    ["PR number / branch", /PR number \/ branch/i],
    ["validation command results", /validation command results/i],
    ["GitHub validate check result", /GitHub .?validate.? check result/i],
    ["Main Safety Gate readback", /Main Safety Gate readback/i],
    ["risky capability No-Go confirmation", /risky capability No-Go confirmation/i],
    ["deploy/publish/release/tag/upload non-execution", /deploy \/ publish \/ release \/ tag \/ upload non-execution/i],
    ["known limitations accepted", /known limitations accepted/i],
    ["reviewer identity", /reviewer identity/i],
    ["decision state", /decision state/i],
    ["follow-up actions", /follow-up actions/i],
  ] as [string, RegExp][]) {
    assert.match(ledger, re, `evidence ledger must require: ${label}`)
  }
})

test("6. evidence ledger forbids secrets / keys / tokens / credentials / prod env values", () => {
  for (const [label, re] of [
    ["secrets", /secrets/i],
    ["API keys", /API keys/i],
    ["OAuth tokens", /OAuth tokens/i],
    ["credentials", /credentials/i],
    ["production environment values", /production environment values/i],
  ] as [string, RegExp][]) {
    assert.match(ledger, re, `evidence ledger must forbid: ${label}`)
  }
  // The prohibition must be framed as such.
  assert.match(ledger, /must not contain|Prohibited entries|must never contain/i)
})

// ── Release decision record: fields + decision + limits ──────

test("7. release decision record includes all required fields", () => {
  for (const [label, re] of [
    ["record id", /record id/i],
    ["candidate commit", /candidate commit/i],
    ["PR / branch", /PR \/ branch/i],
    ["reviewer", /reviewer/i],
    ["date / time", /date \/ time/i],
    ["validation summary", /validation summary/i],
    ["evidence references", /evidence references/i],
    ["known limitations", /known limitations/i],
    ["follow-up actions", /follow-up actions/i],
    ["final human sign-off", /final human sign-off/i],
  ] as [string, RegExp][]) {
    assert.match(rdr, re, `release decision record must include field: ${label}`)
  }
})

test("8. release decision record defines Go / Conditional Go / No-Go", () => {
  // "**Go**" is the standalone bolded state; NOT a substring of "**Conditional Go**"/"**No-Go**".
  assert.ok(rdr.includes("**Go**"), "RDR must define a standalone Go state")
  assert.match(rdr, /Conditional Go/)
  assert.match(rdr, /No-Go/)
})

test("9. release decision record carries the non-authorization statements", () => {
  for (const [label, re] of [
    ["real LLM", /does not authorize real LLM/i],
    ["external execution", /does not authorize external execution/i],
    ["OAuth / token storage", /does not authorize OAuth or token storage/i],
    ["production deployment", /does not authorize production deployment/i],
    ["publishing", /does not authorize publishing/i],
  ] as [string, RegExp][]) {
    assert.match(rdr, re, `RDR must state non-authorization: ${label}`)
  }
  // release tags + artifact upload must also be named in the non-authorization set.
  assert.match(rdr, /release tags/i)
  assert.match(rdr, /artifact upload/i)
})

test("10. release decision record requires a final human sign-off", () => {
  assert.match(rdr, /final human sign-off/i)
  assert.match(rdr, /must be made by a human operator/i)
})

test("11. release decision record states AI must not make or auto-approve the decision", () => {
  assert.match(rdr, /must not make or auto-approve the decision/i)
})
