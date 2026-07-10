/**
 * P6-I5S: isolated behavioral + source-guard tests for the pure, fail-closed
 * no-append linkage validator.
 *
 * Imports ONLY node:test, node:assert/strict, the new inert module surface, and
 * — for the static source guard only — node:fs / node:url to READ (never
 * mutate) the module source files. No app runtime, no app/lib/persistence, no
 * fixtures, no harnesses, no P6-I5J..I5R tests, no network, no GitHub API, no
 * child_process, no file mutation, no secrets, no database, no query-language
 * execution, no approval-store, no external clients, no model providers. The
 * validator is exercised over in-memory objects only.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { join } from "node:path"
import {
  validateLinkageCandidate,
  LINKAGE_VALIDATION_ISSUE_CODES,
  LINKAGE_CANDIDATE_REQUIRED_FIELDS,
  LINKAGE_CANDIDATE_LINEAGE_VARIANT_FIELDS,
  LINKAGE_CANDIDATE_ALLOWED_FIELDS,
  LINKAGE_CANDIDATE_FORBIDDEN_GRANT_FIELDS,
  LINKAGE_CANDIDATE_FORBIDDEN_SECRET_FIELDS,
  LINKAGE_CANDIDATE_FORBIDDEN_RAW_PAYLOAD_FIELDS,
} from "../app/lib/phase6/recorderAuditSummaryEvidenceLedgerLinkage/index.ts"

const HASH = "a".repeat(64)

function baseCandidate(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    summary_id: "ras_tenant_fixture_001",
    payload_hash: HASH,
    tenant_id: "tenant_recorder_summary_fixture",
    summary_scope: "tenant",
    created_at: "2026-07-10T00:00:00Z",
    source_loop: "P6-I5N",
    source_recorder_loop: "P6-I5J",
    source_validator_loop: "P6-I5L",
    source_fixture_loop: "P6-I5N",
    non_authorization_statement:
      "This reference is descriptive: not approval, not execution permission, not production readiness.",
    evidence_ledger_reference_purpose: "human traceability of the reviewed summary record",
    human_review_required: true,
    append_allowed: false,
    graph_write_allowed: false,
    ...overrides,
  }
}

function withoutField(base: Record<string, unknown>, field: string): Record<string, unknown> {
  const r = { ...base }
  delete r[field]
  return r
}

function hasCode(result: { issues: readonly { code: string }[] }, code: string): boolean {
  return result.issues.some((i) => i.code === code)
}

// ─── Valid candidates ───────────────────────────────────────────

// 1
test("valid minimal candidate passes", () => {
  const r = validateLinkageCandidate(baseCandidate())
  assert.equal(r.ok, true, JSON.stringify(r.issues))
  assert.deepEqual([...r.issues], [])
})

// 2
test("valid fixture-lineage candidate passes", () => {
  const r = validateLinkageCandidate(baseCandidate({ source_fixture_loop: "P6-I5N" }))
  assert.equal(r.ok, true, JSON.stringify(r.issues))
})

// 3
test("valid harness-lineage candidate passes", () => {
  const c = withoutField(baseCandidate(), "source_fixture_loop")
  c.source_harness_loop = "P6-I5O"
  const r = validateLinkageCandidate(c)
  assert.equal(r.ok, true, JSON.stringify(r.issues))
})

// 4 — both lineage variants present is also valid
test("candidate with both lineage variants passes", () => {
  const r = validateLinkageCandidate(baseCandidate({ source_harness_loop: "P6-I5O" }))
  assert.equal(r.ok, true, JSON.stringify(r.issues))
})

// ─── Non-object / null / array ──────────────────────────────────

// 5
test("non-object inputs fail closed", () => {
  for (const bad of [42, "x", true, undefined, () => 1]) {
    const r = validateLinkageCandidate(bad)
    assert.equal(r.ok, false, JSON.stringify(bad))
    assert.equal(r.issues[0]?.code, "invalid_input")
  }
})

// 6
test("null fails closed with invalid_input", () => {
  const r = validateLinkageCandidate(null)
  assert.equal(r.ok, false)
  assert.equal(r.issues[0]?.code, "invalid_input")
})

// 7
test("arrays fail closed with not_object", () => {
  for (const arr of [[], [baseCandidate()]]) {
    const r = validateLinkageCandidate(arr)
    assert.equal(r.ok, false)
    assert.equal(r.issues[0]?.code, "not_object")
  }
})

// ─── Required field enforcement ─────────────────────────────────

// 8
test("every required field is enforced (missing -> missing_required_field)", () => {
  for (const field of LINKAGE_CANDIDATE_REQUIRED_FIELDS) {
    const r = validateLinkageCandidate(withoutField(baseCandidate(), field))
    assert.equal(r.ok, false, field)
    assert.ok(hasCode(r, "missing_required_field"), `${field} should be missing_required_field`)
    assert.ok(
      r.issues.some((i) => i.code === "missing_required_field" && i.field === field),
      `${field} missing not reported`,
    )
  }
})

// 9
test("null required field fails with null_required_field", () => {
  const r = validateLinkageCandidate(baseCandidate({ summary_id: null }))
  assert.equal(r.ok, false)
  assert.ok(r.issues.some((i) => i.code === "null_required_field" && i.field === "summary_id"))
})

// ─── Payload hash ───────────────────────────────────────────────

// 10
test("malformed payload hashes fail", () => {
  for (const bad of ["", "xyz", "a".repeat(63), "a".repeat(65), "g".repeat(64), 12345]) {
    const r = validateLinkageCandidate(baseCandidate({ payload_hash: bad }))
    assert.equal(r.ok, false, JSON.stringify(bad))
    assert.ok(hasCode(r, "invalid_payload_hash"), JSON.stringify(bad))
  }
})

// 11
test("uppercase payload hash fails", () => {
  const r = validateLinkageCandidate(baseCandidate({ payload_hash: "A".repeat(64) }))
  assert.equal(r.ok, false)
  assert.ok(hasCode(r, "invalid_payload_hash"))
})

// ─── Scope / tenant / lineage / created_at ──────────────────────

// 12
test("invalid summary_scope fails", () => {
  for (const bad of ["bogus_scope", "", 42]) {
    const r = validateLinkageCandidate(baseCandidate({ summary_scope: bad }))
    assert.equal(r.ok, false, JSON.stringify(bad))
    assert.ok(hasCode(r, "invalid_summary_scope"), JSON.stringify(bad))
  }
})

// 13
test("invalid or missing tenant fails", () => {
  assert.ok(hasCode(validateLinkageCandidate(baseCandidate({ tenant_id: "" })), "invalid_tenant"))
  assert.ok(hasCode(validateLinkageCandidate(baseCandidate({ tenant_id: 7 })), "invalid_tenant"))
  assert.ok(
    hasCode(validateLinkageCandidate(withoutField(baseCandidate(), "tenant_id")), "missing_required_field"),
  )
})

// 14
test("invalid base lineage fails", () => {
  for (const field of ["source_loop", "source_recorder_loop", "source_validator_loop"]) {
    const r = validateLinkageCandidate(baseCandidate({ [field]: "" }))
    assert.equal(r.ok, false, field)
    assert.ok(
      r.issues.some((i) => i.code === "invalid_source_lineage" && i.field === field),
      field,
    )
  }
})

// 15
test("missing both lineage variants fails with invalid_source_lineage", () => {
  const r = validateLinkageCandidate(withoutField(baseCandidate(), "source_fixture_loop"))
  assert.equal(r.ok, false)
  assert.ok(
    r.issues.some(
      (i) => i.code === "invalid_source_lineage" && i.field.includes("source_fixture_loop"),
    ),
  )
})

// 16
test("present-but-empty lineage variant fails", () => {
  const r = validateLinkageCandidate(baseCandidate({ source_fixture_loop: "" }))
  assert.equal(r.ok, false)
  assert.ok(
    r.issues.some((i) => i.code === "invalid_source_lineage" && i.field === "source_fixture_loop"),
  )
})

// 17
test("non-ISO created_at fails with invalid_field_type", () => {
  const r = validateLinkageCandidate(baseCandidate({ created_at: "not-a-timestamp" }))
  assert.equal(r.ok, false)
  assert.ok(r.issues.some((i) => i.code === "invalid_field_type" && i.field === "created_at"))
})

// 18
test("empty non_authorization_statement fails", () => {
  const r = validateLinkageCandidate(baseCandidate({ non_authorization_statement: "" }))
  assert.equal(r.ok, false)
  assert.ok(hasCode(r, "invalid_non_authorization_statement"))
})

// ─── Literal invariants ─────────────────────────────────────────

// 19
test("human_review_required !== true fails", () => {
  for (const bad of [false, "true", 1, null]) {
    const r = validateLinkageCandidate(baseCandidate({ human_review_required: bad }))
    assert.equal(r.ok, false, JSON.stringify(bad))
    assert.ok(
      hasCode(r, "human_review_required_must_be_true") || hasCode(r, "null_required_field"),
      JSON.stringify(bad),
    )
  }
})

// 20
test("append_allowed !== false fails", () => {
  for (const bad of [true, "false", 0, null]) {
    const r = validateLinkageCandidate(baseCandidate({ append_allowed: bad }))
    assert.equal(r.ok, false, JSON.stringify(bad))
    assert.ok(
      hasCode(r, "append_allowed_must_be_false") || hasCode(r, "null_required_field"),
      JSON.stringify(bad),
    )
  }
})

// 21
test("graph_write_allowed !== false fails", () => {
  for (const bad of [true, "false", 0, null]) {
    const r = validateLinkageCandidate(baseCandidate({ graph_write_allowed: bad }))
    assert.equal(r.ok, false, JSON.stringify(bad))
    assert.ok(
      hasCode(r, "graph_write_allowed_must_be_false") || hasCode(r, "null_required_field"),
      JSON.stringify(bad),
    )
  }
})

// ─── Forbidden fields ───────────────────────────────────────────

// 22
test("every forbidden grant-like field fails", () => {
  for (const field of LINKAGE_CANDIDATE_FORBIDDEN_GRANT_FIELDS) {
    const r = validateLinkageCandidate(baseCandidate({ [field]: true }))
    assert.equal(r.ok, false, field)
    assert.ok(
      r.issues.some((i) => i.code === "grant_like_field_present" && i.field === field),
      field,
    )
  }
})

// 23
test("every forbidden secret-like field fails", () => {
  for (const field of LINKAGE_CANDIDATE_FORBIDDEN_SECRET_FIELDS) {
    const r = validateLinkageCandidate(baseCandidate({ [field]: "sensitive" }))
    assert.equal(r.ok, false, field)
    assert.ok(
      r.issues.some((i) => i.code === "secret_like_value_present" && i.field === field),
      field,
    )
  }
})

// 24
test("raw_event_payload fails", () => {
  for (const field of LINKAGE_CANDIDATE_FORBIDDEN_RAW_PAYLOAD_FIELDS) {
    const r = validateLinkageCandidate(baseCandidate({ [field]: { a: 1 } }))
    assert.equal(r.ok, false, field)
    assert.ok(
      r.issues.some((i) => i.code === "raw_event_payload_present" && i.field === field),
      field,
    )
  }
})

// 25
test("extra grant/secret/raw name variants fail with forbidden_field_present", () => {
  for (const field of ["approval", "api_key", "raw_payload"]) {
    const r = validateLinkageCandidate(baseCandidate({ [field]: "x" }))
    assert.equal(r.ok, false, field)
    assert.ok(
      r.issues.some((i) => i.code === "forbidden_field_present" && i.field === field),
      field,
    )
  }
})

// 26
test("unknown top-level field fails with unknown_field", () => {
  const r = validateLinkageCandidate(baseCandidate({ some_random_extra: "x" }))
  assert.equal(r.ok, false)
  assert.ok(r.issues.some((i) => i.code === "unknown_field" && i.field === "some_random_extra"))
})

// ─── Non-echoing / secret safety ────────────────────────────────

// 27
test("issue messages do not echo supplied values", () => {
  const secretValue = "TOP-SECRET-VALUE-should-never-leak-42"
  const r = validateLinkageCandidate(
    baseCandidate({ secret: secretValue, token: secretValue, raw_event_payload: secretValue }),
  )
  assert.equal(r.ok, false)
  for (const i of r.issues) {
    assert.ok(!i.message.includes(secretValue), i.message)
    assert.ok(!i.field.includes(secretValue), i.field)
  }
})

// 28
test("secret values do not appear in serialized results", () => {
  const secretValue = "sk-live-DO-NOT-LEAK-0000"
  const r = validateLinkageCandidate(baseCandidate({ credential: secretValue, summary_scope: secretValue }))
  const serialized = JSON.stringify(r)
  assert.ok(!serialized.includes(secretValue), serialized)
})

// ─── Determinism / immutability / no mutation ───────────────────

// 29
test("repeated validation is deterministic", () => {
  const c = baseCandidate({ append_allowed: true, tenant_id: "" })
  assert.deepEqual(validateLinkageCandidate(c), validateLinkageCandidate(c))
})

// 30
test("validator does not mutate input", () => {
  const c = baseCandidate({ secret: "x", approval_granted: true })
  const before = JSON.stringify(c)
  validateLinkageCandidate(c)
  assert.equal(JSON.stringify(c), before)
})

// 31
test("validator does not return the raw input", () => {
  const c = baseCandidate()
  const r = validateLinkageCandidate(c) as unknown as Record<string, unknown>
  assert.notEqual(r, c)
  assert.equal(Object.prototype.hasOwnProperty.call(r, "summary_id"), false)
})

// 32 (expanded by P6-FIX-001, Issue #119): every required field and both
// lineage variant fields are read exactly once — not zero times (which would
// mean the field is ignored) and not multiple times (which would reopen the
// getter-TOCTOU window). Uses the canonical exported field constants.
test("every required and lineage field getter is read exactly once", () => {
  const fields = [
    ...LINKAGE_CANDIDATE_REQUIRED_FIELDS,
    ...LINKAGE_CANDIDATE_LINEAGE_VARIANT_FIELDS,
  ]
  assert.ok(fields.length >= 15, `expected the full contract surface, got ${fields.length}`)
  for (const field of fields) {
    // Both lineage variants present so each can carry a counting getter.
    const c = baseCandidate({ source_harness_loop: "P6-I5O" })
    const original = c[field]
    delete c[field]
    let reads = 0
    Object.defineProperty(c, field, {
      enumerable: true,
      configurable: true,
      get() {
        reads += 1
        return original
      },
    })
    const r = validateLinkageCandidate(c)
    assert.equal(reads, 1, `${field} must be read exactly once (got ${reads})`)
    assert.equal(r.ok, true, `${field}: ${JSON.stringify(r.issues)}`)
  }
})

// 33
test("throwing getters fail closed with a generic issue", () => {
  const c = baseCandidate()
  Object.defineProperty(c, "tenant_id", {
    enumerable: true,
    configurable: true,
    get() {
      throw new Error("boom-should-not-leak")
    },
  })
  const r = validateLinkageCandidate(c)
  assert.equal(r.ok, false)
  assert.ok(hasCode(r, "validator_exception"))
  for (const i of r.issues) assert.ok(!i.message.includes("boom"), i.message)
})

// 34
test("output and issue collection are frozen", () => {
  const r = validateLinkageCandidate(baseCandidate({ append_allowed: true }))
  assert.ok(Object.isFrozen(r))
  assert.ok(Object.isFrozen(r.issues))
})

// 35
test("result keys are allowlisted", () => {
  const okR = validateLinkageCandidate(baseCandidate())
  assert.deepEqual(Object.keys(okR).sort(), ["issues", "ok"])
  const failR = validateLinkageCandidate(null)
  assert.deepEqual(Object.keys(failR).sort(), ["issues", "ok"])
})

// ─── ok: true grants nothing ────────────────────────────────────

// 36
test("ok: true grants no append / approval / execution / production-readiness fields", () => {
  const r = validateLinkageCandidate(baseCandidate()) as unknown as Record<string, unknown>
  assert.equal(r.ok, true)
  for (const key of [
    "approval",
    "approved",
    "authorized",
    "execution_allowed",
    "append_allowed",
    "append_performed",
    "persisted",
    "ledger_entry",
    "graph_write",
    "promoted",
    "production_ready",
  ]) {
    assert.equal(Object.prototype.hasOwnProperty.call(r, key), false, key)
  }
})

// ─── Issue-code surface ─────────────────────────────────────────

// 37
test("issue codes are the stable exported set", () => {
  assert.deepEqual(
    [...LINKAGE_VALIDATION_ISSUE_CODES],
    [
      "invalid_input",
      "not_object",
      "missing_required_field",
      "null_required_field",
      "invalid_field_type",
      "unknown_field",
      "forbidden_field_present",
      "invalid_payload_hash",
      "invalid_summary_scope",
      "invalid_tenant",
      "invalid_source_lineage",
      "invalid_non_authorization_statement",
      "append_allowed_must_be_false",
      "graph_write_allowed_must_be_false",
      "human_review_required_must_be_true",
      "secret_like_value_present",
      "raw_event_payload_present",
      "grant_like_field_present",
      "validator_exception",
    ],
  )
})

// 38
test("index exports the intended inert surface", () => {
  assert.equal(typeof validateLinkageCandidate, "function")
  assert.ok(Array.isArray(LINKAGE_VALIDATION_ISSUE_CODES))
  assert.ok(Array.isArray(LINKAGE_CANDIDATE_REQUIRED_FIELDS))
  assert.ok(Array.isArray(LINKAGE_CANDIDATE_ALLOWED_FIELDS))
})

// 39
test("no self-match trap: valid passes, corrupt fails, both observable", () => {
  assert.equal(validateLinkageCandidate(baseCandidate()).ok, true)
  assert.equal(validateLinkageCandidate(baseCandidate({ append_allowed: true })).ok, false)
  assert.equal(validateLinkageCandidate({}).ok, false)
})

// ─── Runtime-consumer audit (no app/ file imports the module) ───

// ─── Runtime-consumer scan (P6-FIX-001, Issue #119) ─────────────

const LINKAGE_MODULE_DIR_NAME = "recorderAuditSummaryEvidenceLedgerLinkage"

/**
 * Pure predicate: does this source text reference the linkage module by name?
 * Any static import, dynamic import(), require() call, or direct module-path
 * reference must contain the module directory name, so a name match is the
 * common denominator of every consumption form.
 */
function referencesLinkageModule(text: string): boolean {
  return text.includes(LINKAGE_MODULE_DIR_NAME)
}

// 40
test("no app runtime file imports the new module", () => {
  // Read-only scan of app/ for imports of the new module path. The test file
  // itself lives under tests/, not app/, so it is not scanned.
  const appDir = fileURLToPath(new URL("../app", import.meta.url))
  // Recursive read-only walk of app/ (no child_process).
  const results: string[] = []
  walk(appDir, results)
  const importers = results.filter((f) => {
    const text = readFileSync(f, "utf8")
    // The module's own files legitimately reference the directory name in paths;
    // exclude the module directory itself.
    if (f.includes(`/${LINKAGE_MODULE_DIR_NAME}/`)) return false
    return referencesLinkageModule(text)
  })
  assert.deepEqual(importers, [], `unexpected importers: ${importers.join(", ")}`)
})

// 40b (P6-FIX-001): the consumer predicate detects every consumption form —
// static import, dynamic import(), require(), aliased path, and bare path
// reference — proven synthetically without touching any repository file.
test("runtime-consumer scan detects static, dynamic, require, and path reference forms", () => {
  const consumptionForms = [
    `import { validateLinkageCandidate } from "../lib/phase6/${LINKAGE_MODULE_DIR_NAME}/index.ts"`,
    `const m = await import("./phase6/${LINKAGE_MODULE_DIR_NAME}/validators.ts")`,
    `const m = require("app/lib/phase6/${LINKAGE_MODULE_DIR_NAME}")`,
    `export * from "@/lib/phase6/${LINKAGE_MODULE_DIR_NAME}/index.ts"`,
    `const p = "app/lib/phase6/${LINKAGE_MODULE_DIR_NAME}/types.ts"`,
  ]
  for (const form of consumptionForms) {
    assert.equal(referencesLinkageModule(form), true, `must detect: <<<${form}>>>`)
  }
  assert.equal(
    referencesLinkageModule('import { other } from "./some/unrelated/module.ts"'),
    false,
    "must not flag unrelated sources",
  )
})

// 40c (P6-FIX-001): the one form a name-based scan cannot see is a dedicated
// tsconfig path alias that hides the module name at the import site. Pin that
// tsconfig.json defines no such alias (its target mapping would have to name
// the module directory).
test("tsconfig defines no path alias that could hide the linkage module name", () => {
  const tsconfig = readFileSync(fileURLToPath(new URL("../tsconfig.json", import.meta.url)), "utf8")
  assert.equal(
    referencesLinkageModule(tsconfig),
    false,
    "a dedicated tsconfig path alias for the linkage module would blind the name-based consumer scan",
  )
})

// ─── Static source guard ────────────────────────────────────────

const SRC_TYPES = fileURLToPath(
  new URL("../app/lib/phase6/recorderAuditSummaryEvidenceLedgerLinkage/types.ts", import.meta.url),
)
const SRC_VALIDATORS = fileURLToPath(
  new URL("../app/lib/phase6/recorderAuditSummaryEvidenceLedgerLinkage/validators.ts", import.meta.url),
)
const SRC_INDEX = fileURLToPath(
  new URL("../app/lib/phase6/recorderAuditSummaryEvidenceLedgerLinkage/index.ts", import.meta.url),
)

const FORBIDDEN_SOURCE_SUBSTRINGS = [
  "Date.now",
  "new Date",
  "randomUUID",
  "Math.random",
  "fetch(",
  "child_process",
  "process.env",
  'from "fs"',
  "from 'fs'",
  "D1Database",
  ".prepare(",
  "ApprovalStore",
  "StartHubRuntime",
  "starthubExecute",
  "externalAction",
  "executeExternal",
  "appendEvidenceLedger",
  "writeGraph",
  "emitAudit",
  "summaryEmitter",
  // P6-FIX-001 (Issue #119): bypass forms the original list missed. Each maps
  // to a concrete evasion of an already-forbidden capability:
  'from "node:fs"', // node:-prefixed filesystem import evades the bare "fs" needle
  "from 'node:fs'", // single-quoted variant of the same evasion
  "import(", // dynamic import can load any forbidden capability at runtime
  "require(", // CommonJS require can load any forbidden capability at runtime
  "globalThis[", // computed global access can reach fetch/process via bracket lookup
]

/** Pure helper: returns which forbidden forms appear in the given source text. */
function findForbiddenSubstrings(sourceText: string): string[] {
  return FORBIDDEN_SOURCE_SUBSTRINGS.filter((needle) => sourceText.includes(needle))
}

// 41
test("source guard confirms module sources contain no forbidden runtime capability substrings", () => {
  for (const src of [SRC_TYPES, SRC_VALIDATORS, SRC_INDEX]) {
    const text = readFileSync(src, "utf8")
    assert.deepEqual(
      findForbiddenSubstrings(text),
      [],
      `${src} must contain no forbidden capability form`,
    )
  }
})

// 41b (P6-FIX-001): guard sensitivity proven synthetically — every forbidden
// form embedded in a harmless in-memory source string is detected, and a clean
// string is not flagged. No repository file is mutated for this proof.
test("source guard is non-vacuous: each forbidden form is detected in synthetic source", () => {
  for (const needle of FORBIDDEN_SOURCE_SUBSTRINGS) {
    const synthetic = `// harmless synthetic module\nconst inert = true\n${needle}\nexport {}\n`
    assert.ok(
      findForbiddenSubstrings(synthetic).includes(needle),
      `guard must detect synthetic occurrence of: <<<${needle}>>>`,
    )
  }
  const clean = `// harmless synthetic module\nconst inert = true\nexport {}\n`
  assert.deepEqual(findForbiddenSubstrings(clean), [], "clean synthetic source must not be flagged")
})

// ─── local fs walk helper (read-only) ───────────────────────────

function walk(dir: string, out: string[]): void {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const entry of entries) {
    const full = join(dir, entry)
    let s
    try {
      s = statSync(full)
    } catch {
      continue
    }
    if (s.isDirectory()) {
      if (entry === "node_modules" || entry === ".next" || entry === ".open-next") continue
      walk(full, out)
    } else if (/\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(entry)) {
      out.push(full)
    }
  }
}
