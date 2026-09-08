#!/usr/bin/env node
/**
 * Phase 7B: Alpha safety gate.
 *
 * Dependency-free, read-only governance gate. It scans the Phase 7A release matrix,
 * package.json, and selected source files, and exits non-zero with actionable
 * messages if any alpha No-Go boundary or Phase 5B–7A safety guarantee is weakened.
 *
 * It performs NO network access, reads NO secrets / .env files, calls NO external
 * commands, modifies NO files, and requires NO npm dependencies (node:fs only).
 *
 * Usage: node scripts/alpha-safety-gate.mjs   (or: npm run alpha:safety-gate)
 */

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { evaluateElectronDependencyPolicy } from "./electronDependencyPolicy.mjs"
import { loadManifest, buildPlan } from "./lib/d1MigrationManifest.mjs"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const failures = []
const checks = []

/**
 * Resolve a migration path from the CANONICAL manifest (P0-PERSIST-015) rather
 * than hardcoding it — the manifest is the single source of truth for which
 * migration exists in which lane.
 */
function manifestMigrationPath(binding, kind) {
  const loaded = loadManifest(REPO_ROOT)
  if (!loaded.ok) return null
  return buildPlan(loaded.manifest, binding).find((s) => s.kind === kind)?.path ?? null
}

function read(path) {
  try {
    return readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
  } catch {
    return null
  }
}

/** Register a check: ok must be truthy, else `message` is recorded as a failure. */
function check(name, ok, message) {
  checks.push(name)
  if (!ok) failures.push(`${name}: ${message}`)
}

/**
 * Strip line (`//`) and block (`/* *​/`) comments so boundary scans match real
 * code, not documentation that legitimately *names* a forbidden pattern (e.g. a
 * comment stating "approvedByPm is stripped").
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .filter((l) => !l.trim().startsWith("*"))
    .join("\n")
}

// ── Inputs ──────────────────────────────────────────────────────
const checklist = read("docs/legacy/PHASE_7A_ALPHA_RELEASE_SAFETY_CHECKLIST.md") ?? ""
const matrixRaw = read("docs/release/ALPHA_RELEASE_MATRIX.json") ?? "{}"
const pkg = read("package.json") ?? "{}"
let matrix = {}
try { matrix = JSON.parse(matrixRaw) } catch { failures.push("matrix: ALPHA_RELEASE_MATRIX.json is not valid JSON") }
let pkgJson = {}
try { pkgJson = JSON.parse(pkg) } catch { failures.push("package.json: not valid JSON") }
const deps = { ...(pkgJson.dependencies ?? {}), ...(pkgJson.devDependencies ?? {}) }

const approvalRepo = read("app/lib/persistence/d1/approvalRecordRepository.ts") ?? ""
const binding = read("app/lib/security/approvalPreviewBinding.ts") ?? ""
const store = read("app/lib/security/approvalStore.ts") ?? ""
const previewRepo = read("app/lib/persistence/d1/actionPreviewRepository.ts") ?? ""
const rowHelpers = read("app/lib/persistence/d1/rowHelpers.ts") ?? ""
const hash = read("app/lib/security/hash.ts") ?? ""
// Tenant index-hardening migration, resolved via the canonical manifest.
const indexMigrationPath = manifestMigrationPath("TENANT_DB_DEFAULT", "index")
const migration = (indexMigrationPath ? read(indexMigrationPath) : null) ?? ""
const workUnitRepo = read("app/lib/persistence/d1/workUnitRepository.ts") ?? ""
const externalActions = read("app/lib/security/externalActions.ts") ?? ""
const toolBackend = read("app/lib/toolBackend.ts") ?? ""
const toolsRoute = read("app/api/workunit/tools/route.ts") ?? ""
const dryRun = read("app/api/workunit/[id]/execution/dry-run/route.ts") ?? ""

// ── Product principle ───────────────────────────────────────────
check("product-principle", checklist.includes("AI proposes. Rules guard. Humans decide."),
  "Phase 7A checklist must state the product principle")

// ── Release matrix classifications ──────────────────────────────
const modes = matrix.releaseModes ?? {}
check("matrix-local-demo", modes.local_technical_demo === "Conditional Go", "local technical demo must be Conditional Go")
check("matrix-closed-alpha", modes.closed_alpha === "Conditional Go", "closed alpha must be Conditional Go")
check("matrix-pilot", modes.customer_observed_pilot === "Conditional Go", "customer-observed pilot must be Conditional Go")
check("matrix-saas-nogo", modes.commercial_saas_production === "No-Go", "commercial SaaS production must be No-Go")
check("matrix-electron-alpha-nogo", modes.electron_desktop_alpha === "No-Go", "Electron desktop alpha must be No-Go")
check("matrix-electron-prod-nogo", modes.electron_production_release === "No-Go", "Electron production release must be No-Go")

// ── No-Go flags ─────────────────────────────────────────────────
const noGo = matrix.noGo ?? {}
check("nogo-external-execution", noGo.externalExecution === true, "external execution must remain No-Go")
check("nogo-real-provider-writes", noGo.realProviderWrites === true, "real provider writes must remain No-Go")
check("nogo-oauth", noGo.oauthTokenVault === true, "OAuth/token vault must remain No-Go")
check("nogo-billing", noGo.billing === true, "billing must remain No-Go")
check("matrix-external-disabled", matrix.externalExecution === "disabled", "matrix must mark external execution disabled")
check("matrix-live-provider-disabled", matrix.liveProviderWrites === "disabled", "matrix must mark live provider writes disabled")

// ── Preview/approval/execution separation + human approval ──────
check("dry-run-not-execution", /dry-run is .*not.* execution/i.test(checklist), "checklist must state dry-run is not execution")
check("preview-not-approval", /preview is .*not.* approval/i.test(checklist), "checklist must state preview is not approval")
check("approval-not-execution", /approval is .*not.* execution/i.test(checklist), "checklist must state approval is not execution")
check("human-approval-required", /human approval is .*required/i.test(checklist), "checklist must state human approval is required")
check("local-state-not-approval", /desktop state.*approval source/i.test(checklist) && matrix.localDesktopStateIsApprovalSource === false,
  "local desktop state must not be an approval source")
check("approval-server-authoritative", /approval records.*server-authoritative/i.test(checklist) && matrix.approvalAuthority === "server",
  "approval records must remain server-authoritative")
check("preview-verification-authoritative", /ActionPreview verification remains.*server\/database-authoritative/i.test(checklist),
  "ActionPreview verification must remain server/database-authoritative")
check("dry-run-not-consuming", matrix.dryRunConsumesApproval === false, "dry-run must not consume approvals")

// ── Dependency boundaries ───────────────────────────────────────
// Electron dependency policy (Phase E0.5): Electron may exist ONLY as a
// devDependency, and only while the safe-shell guards exist (electron:build:check
// script + Electron security-invariant test). It must never be a runtime/optional/
// peer dependency, and packaging/updater/signing dependencies remain forbidden. This
// replaces the previous blanket ban; allowing the dev dependency does not package or
// release Electron.
const electronPolicy = evaluateElectronDependencyPolicy(pkgJson, {
  buildCheckScriptOk: (pkgJson.scripts ?? {})["electron:build:check"] === "node scripts/electron-build-check.mjs",
  invariantTestExists: read("tests/electronSecurityInvariants.test.mts") !== null,
})
check("electron-dependency-policy", electronPolicy.ok,
  `electron dependency policy violated: ${electronPolicy.failures.join(", ")}`)
// Backstop: if Electron appears in the merged dependency surface at all, it must be
// exactly the devDependency form (never a runtime/optional/peer dependency).
check("electron-devdep-only", !("electron" in deps) || ("electron" in (pkgJson.devDependencies ?? {})),
  "electron may appear only as a devDependency")
const providerSdks = ["openai", "@anthropic-ai/sdk", "cohere-ai", "@google/generative-ai", "ollama", "mistralai"]
check("no-provider-sdk-dep", !providerSdks.some((s) => s in deps), "package.json must not add a provider SDK dependency")

// ── App-code boundary scans (comments stripped: match real code only) ───
const toolCode = stripComments(toolBackend) + stripComments(toolsRoute)
const verifyCode = stripComments(dryRun) + stripComments(toolBackend) + stripComments(binding) + stripComments(store)
check("no-provider-write-markers", !/executionPayload|providerRequest|providerResponse/.test(toolCode + stripComments(dryRun)),
  "tool/dry-run paths must not create provider write payloads")
check("no-approvedbypm-trust", !/approvedByPm/.test(toolCode),
  "tool authorization path must not trust approvedByPm")
check("no-latest-approval-verification", !/findByWorkUnitId|latestApproval|findLatestApproval|approvalRecords\[0\]/.test(verifyCode),
  "verification paths must not use latest/workUnit-only approval lookup")
check("kill-switch-contract", externalActions.includes('EXTERNAL_ACTIONS_ENABLED === "true"'),
  "external execution kill switch contract must remain (default off)")
check("dry-run-non-consuming-route", !dryRun.includes("markApprovalUsed") && dryRun.includes("areExternalActionsEnabled"),
  "dry-run route must not mark approvals used and must keep the kill switch")

// ── Phase 5B–6C source guards ───────────────────────────────────
check("phase5b-cas", /status = 'approved'/.test(approvalRepo) && /used_at IS NULL/i.test(approvalRepo) && /expires_at\s*>\s*\?/.test(approvalRepo) && approvalRepo.includes("rows_written"),
  "Phase 5B markUsed CAS guard missing")
check("phase5c-binding", binding.includes("verifyApprovalPreviewBinding") && store.includes("record.actionPreviewId !== input.actionPreviewId"),
  "Phase 5C approval-preview binding guard missing")
check("phase5d-json", previewRepo.includes("readJsonColumn") && previewRepo.includes("toJsonColumn") && !previewRepo.includes("JSON.parse") && rowHelpers.includes("export function readJsonColumn"),
  "Phase 5D ActionPreview JSON hardening guard missing")
check("phase5e-hmac-no-env", !hash.includes("process.env") && hash.includes("computeTenantHmacSha256Hash"),
  "Phase 5E HMAC no-env guard missing")
const migStatements = migration.split("\n").filter((l) => !l.trim().startsWith("--") && l.trim()).join(" ").split(";").map((s) => s.trim()).filter(Boolean)
check("phase6b-additive", migStatements.length > 0 && migStatements.every((s) => /^CREATE (UNIQUE )?INDEX IF NOT EXISTS/i.test(s)),
  "Phase 6B migration must remain additive (CREATE INDEX IF NOT EXISTS only)")
check("phase6c-tenant-update", /UPDATE work_units[\s\S]*?WHERE id = \? AND tenant_id = \?/.test(workUnitRepo),
  "Phase 6C workUnit updateStatus tenant guard missing")

// ── Report ──────────────────────────────────────────────────────
if (failures.length > 0) {
  console.error(`\n❌ Alpha safety gate FAILED (${failures.length}/${checks.length} checks):\n`)
  for (const f of failures) console.error(`  - ${f}`)
  console.error("")
  process.exit(1)
}
console.log(`✅ Alpha safety gate passed (${checks.length} checks). External execution, Electron, and commercial SaaS production remain No-Go.`)
process.exit(0)
