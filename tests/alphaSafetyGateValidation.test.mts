/**
 * Phase 7B: Automated alpha safety gate + PR validation contract tests.
 *
 * Documentation-contract + source-scan tests, plus an actual invocation of the
 * dependency-free safety gate script (must exit 0 on current main).
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { execFileSync } from "node:child_process"

const DOC = "docs/legacy/PHASE_7B_ALPHA_SAFETY_GATE_VALIDATION.md"
const GATE = "scripts/alpha-safety-gate.mjs"
const PKG = "package.json"
const EXTERNAL = "app/lib/security/externalActions.ts"

async function read(p: string): Promise<string> { return readFile(p, "utf8") }
let docCache: string | null = null
async function doc(): Promise<string> { return (docCache ??= await read(DOC)) }
let gateCache: string | null = null
async function gate(): Promise<string> { return (gateCache ??= await read(GATE)) }

// ─── Doc contract (1-13) ────────────────────────────────────────

test("1. Phase 7B doc exists", async () => { assert.ok((await doc()).length > 0) })
test("2. doc defines PR validation contract", async () => { assert.ok((await doc()).includes("## PR Validation Contract")) })
test("3. doc requires alpha safety gate before alpha readiness claims", async () => {
  assert.ok(/cannot claim alpha readiness unless the alpha safety gate passes/i.test(await doc()))
})
test("4. doc keeps commercial SaaS production No-Go", async () => {
  assert.ok(/commercial SaaS production[\s\S]{0,40}No-Go/i.test(await doc()))
})
test("5. doc keeps Electron desktop alpha No-Go", async () => {
  assert.ok(/Electron desktop alpha[:\s].*No-Go/i.test(await doc()))
})
test("6. doc keeps Electron production release No-Go", async () => {
  assert.ok(/Electron production release[:\s].*No-Go/i.test(await doc()))
})
test("7. doc keeps external execution No-Go", async () => {
  assert.ok(/External execution[:\s].*No-Go/i.test(await doc()))
})
test("8. doc states dry-run is not execution", async () => { assert.ok(/dry-run is not execution/i.test(await doc())) })
test("9. doc states preview is not approval", async () => { assert.ok(/preview is not approval/i.test(await doc())) })
test("10. doc states approval is not execution", async () => { assert.ok(/approval is not execution/i.test(await doc())) })
test("11. doc states human approval is required", async () => { assert.ok(/human approval is required/i.test(await doc())) })
test("12. doc states local desktop state is not approval source", async () => {
  assert.ok(/local desktop state is not\s+an approval source/i.test(await doc()))
})
test("13. doc includes Phase 7C handoff", async () => { assert.ok((await doc()).includes("## Phase 7C Handoff")) })

// ─── Gate script properties (14-29) ─────────────────────────────

test("14. alpha safety gate script exists", async () => { assert.ok((await gate()).length > 0) })
test("15. gate is dependency-free (node: builtins or local relative modules only)", async () => {
  // "Dependency-free" means no npm/third-party packages: every import must be a
  // node: builtin or a local relative module (e.g. ./electronDependencyPolicy.mjs).
  // A bare specifier (an npm dependency) is forbidden.
  const imports = [...(await gate()).matchAll(/^import .*from ["']([^"']+)["']/gm)].map((m) => m[1])
  for (const i of imports) {
    assert.ok(i.startsWith("node:") || i.startsWith("./") || i.startsWith("../"), `npm dependency import forbidden in gate: ${i}`)
  }
})
test("16. gate does not read .env", async () => {
  // No actual .env file access (mentioning it in the doc comment is fine).
  assert.equal(/readFileSync\([^)]*\.env|read\(["'][^"']*\.env/.test(await gate()), false)
})
test("17. gate does not call fetch/network", async () => {
  const g = await gate()
  assert.equal(g.includes("fetch("), false)
  assert.equal(/https?:\/\//.test(g.replace(/https?:\/\/[^\s]*authoritative/g, "")), false)
})
test("18. gate does not modify files (no write APIs)", async () => {
  const g = await gate()
  for (const bad of ["writeFileSync", "writeFile(", "appendFile", "rmSync", "unlink", "mkdir", "execSync", "spawn"]) {
    assert.equal(g.includes(bad), false, `gate must not use ${bad}`)
  }
})
test("19. gate checks the release matrix", async () => {
  assert.ok((await gate()).includes("ALPHA_RELEASE_MATRIX.json") && (await gate()).includes("releaseModes"))
})
test("20. gate checks package.json for Electron dependency", async () => {
  assert.ok(/no-electron-dep|"electron" in deps|electron.*in deps/.test(await gate()))
})
test("21. gate checks external execution No-Go", async () => {
  assert.ok((await gate()).includes("nogo-external-execution") || /externalExecution === true/.test(await gate()))
})
test("22. gate checks dry-run / preview / approval separation", async () => {
  const g = await gate()
  assert.ok(g.includes("dry-run-not-execution") && g.includes("preview-not-approval") && g.includes("approval-not-execution"))
})
test("23. gate checks local desktop state is not approval source", async () => {
  assert.ok((await gate()).includes("local-state-not-approval"))
})
test("24. gate checks Phase 5B CAS guard", async () => { assert.ok((await gate()).includes("phase5b-cas")) })
test("25. gate checks Phase 5C binding guard", async () => { assert.ok((await gate()).includes("phase5c-binding")) })
test("26. gate checks Phase 5D JSON guard", async () => { assert.ok((await gate()).includes("phase5d-json")) })
test("27. gate checks Phase 5E HMAC no-env guard", async () => { assert.ok((await gate()).includes("phase5e-hmac-no-env")) })
test("28. gate checks Phase 6B additive migration guard", async () => { assert.ok((await gate()).includes("phase6b-additive")) })
test("29. gate checks Phase 6C workUnit tenant guard", async () => { assert.ok((await gate()).includes("phase6c-tenant-update")) })

// ─── package script + invocation (30,31) ────────────────────────

test("30. package.json contains alpha:safety-gate script", async () => {
  const pkg = JSON.parse(await read(PKG))
  assert.equal(pkg.scripts["alpha:safety-gate"], "node scripts/alpha-safety-gate.mjs")
})
test("31. running the alpha safety gate exits 0 on current main", () => {
  // Throws if exit code is non-zero.
  const out = execFileSync("node", ["scripts/alpha-safety-gate.mjs"], { encoding: "utf8" })
  assert.match(out, /Alpha safety gate passed/)
})

// ─── Boundary scans (32-36) ─────────────────────────────────────

test("32. no Electron dependency in package.json", async () => {
  const pkg = JSON.parse(await read(PKG))
  assert.equal("electron" in { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }, false)
})
test("33. no external execution enablement change (kill switch contract intact)", async () => {
  assert.ok((await read(EXTERNAL)).includes('EXTERNAL_ACTIONS_ENABLED === "true"'))
})
test("34. no provider SDK import / fetch / network added in gate or doc", async () => {
  // The gate legitimately *names* provider SDKs as forbidden deps to scan for, so
  // assert there is no actual provider-SDK import statement or fetch() call.
  for (const src of [await gate(), await doc()]) {
    assert.equal(/\bimport\b[^\n]*\b(openai|anthropic|cohere|mistralai|ollama)\b/i.test(src), false, "no provider SDK import")
    assert.equal(/fetch\s*\(/.test(src), false, "no fetch call")
  }
})
test("35. no secrets/tokens introduced in gate or matrix", async () => {
  const matrix = await read("docs/release/ALPHA_RELEASE_MATRIX.json")
  for (const src of [await gate(), matrix]) {
    for (const bad of ["sk-", "Bearer ", "API_KEY=", "password:"]) {
      assert.equal(src.includes(bad), false, `must not include ${bad}`)
    }
  }
})
test("36. Phase 7A matrix remains unchanged (still strict)", async () => {
  const m = JSON.parse(await read("docs/release/ALPHA_RELEASE_MATRIX.json"))
  assert.equal(m.releaseModes.commercial_saas_production, "No-Go")
  assert.equal(m.releaseModes.electron_desktop_alpha, "No-Go")
  assert.equal(m.releaseModes.electron_production_release, "No-Go")
  assert.equal(m.releaseModes.closed_alpha, "Conditional Go")
})
