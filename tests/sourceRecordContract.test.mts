/**
 * WU-01B: permanent contract tests for SourceRecordV1 and its sole validator.
 *
 * Each group is an executable statement of a boundary the record must keep:
 * exact tenant-bound identity, identity separated from content integrity,
 * opaque declared references, unknown-means-unknown temporal nulls, no
 * masquerade as a later lifecycle stage, and no persistence, provider, clock
 * or compatibility-tenant dependency. Boundaries stated only in prose decay
 * silently; these fail.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { scanModuleGraph } from "../scripts/lib/typescriptModuleGraph.mjs"
// T13 only. The module under test deliberately does NOT import this shadow
// guard; the test is what keeps the two profiles from drifting apart.
import { isIsoUtcTimestamp } from "../app/lib/phase6/shared/isoUtcTimestamp.ts"
import { SOURCE_RECORD_VERSION, validateSourceRecordV1 } from "../app/lib/domain/source/index.ts"
import type { SourceRecordV1 } from "../app/lib/domain/source/types.ts"

const rootDir = fileURLToPath(new URL("../", import.meta.url))
const MODULE_DIR = "app/lib/domain/source"
const MODULE_FILES = ["types.ts", "validateSourceRecord.ts", "index.ts"]
const CANONICAL_TENANT = "app/lib/domain/tenant/types.ts"
const COMPAT_TENANT = "app/lib/tenant/types.ts"
const PHASE6_TENANT_ALIAS = "app/lib/phase6/artifacts/types.ts"

const OTHER_DIGEST = "sha256:1f0e2d3c4b5a69788796a5b4c3d2e1f01f0e2d3c4b5a69788796a5b4c3d2e1f0"

const FAILURE_CODES = [
  "input_unreadable", "unknown_field", "missing_field", "unsupported_record_version",
  "invalid_tenant_id", "invalid_provider", "invalid_provider_object_key",
  "invalid_declared_source_ref", "invalid_source_url", "invalid_instant",
  "recorded_before_observed", "invalid_content_digest",
]

type Fixture = {
  valid: Record<string, unknown>
  rejects: { failureCode: string; patch?: Record<string, unknown>; remove?: string[] }[]
  isoVectors: string[]
}

const fixture: Fixture = JSON.parse(
  await readFile(path.join(rootDir, "tests/fixtures/domain/source/sourceRecord.v1.json"), "utf8"))

async function moduleSource(file: string): Promise<string> {
  return readFile(path.join(rootDir, MODULE_DIR, file), "utf8")
}

function base(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...structuredClone(fixture.valid), ...overrides }
}

function accept(input: unknown): SourceRecordV1 {
  const result = validateSourceRecordV1(input)
  if (!result.ok) assert.fail(`expected acceptance, got ${result.failureCode}`)
  return result.record
}

function reject(input: unknown): string {
  const result = validateSourceRecordV1(input)
  if (result.ok) assert.fail("expected rejection, got a record")
  return result.failureCode
}

/** The identity tuple, and nothing else. Used everywhere a claim about identity is made. */
function identityOf(record: SourceRecordV1): string {
  return JSON.stringify([record.tenantId, record.provider, record.providerObjectKey])
}

function without(key: string): Record<string, unknown> {
  const value = base()
  delete value[key]
  return value
}

// ─── T1 — exact tenant-bound identity ───────────────────────────────────────

test("T1: identity is exactly (tenantId, provider, providerObjectKey)", () => {
  const record = accept(base())
  assert.equal(record.recordVersion, SOURCE_RECORD_VERSION)

  for (const [field, other] of [
    ["tenantId", "tenant-beta"], ["provider", "slack"], ["providerObjectKey", "other-object"],
  ] as const) {
    assert.notEqual(identityOf(accept(base({ [field]: other }))), identityOf(record),
      `${field} must participate in identity`)
  }

  // Every non-identity field may differ without producing a different source.
  assert.equal(identityOf(accept(base({
    declaredSourceRef: "ref-1", sourceUrl: null, observedAt: "2020-05-06T07:08:09Z",
    recordedAt: "2021-05-06T07:08:09Z", sourceEventAt: "2019-01-01T00:00:00Z",
    contentDigest: OTHER_DIGEST,
  }))), identityOf(record), "no field outside the tuple may affect identity")

  assert.equal(reject(without("tenantId")), "missing_field")
})

test("T1 (type level): tenantId is the branded TenantId, never a bare string", async () => {
  const ts = (await import("typescript")).default
  const dir = path.join(rootDir, MODULE_DIR)
  const brandedProbe = path.join(dir, "__wu01b.branded.probe.ts")
  const bareProbe = path.join(dir, "__wu01b.bare.probe.ts")
  // Virtual files: overlaid on the compiler host, never written to disk.
  const sources: Record<string, string> = {
    [brandedProbe]: 'import type { SourceRecordV1 } from "./types.ts"\n'
      + 'import type { TenantId } from "../tenant/types.ts"\n'
      + 'export const probe: SourceRecordV1["tenantId"] = "t" as TenantId\n',
    [bareProbe]: 'import type { SourceRecordV1 } from "./types.ts"\n'
      + 'const raw: string = "t"\n'
      + 'export const probe: SourceRecordV1["tenantId"] = raw\n',
  }
  const options = {
    strict: true, noEmit: true, target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler, allowImportingTsExtensions: true,
    skipLibCheck: true,
  }
  const host = ts.createCompilerHost(options)
  const getSourceFile = host.getSourceFile.bind(host)
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) =>
    sources[fileName] !== undefined
      ? ts.createSourceFile(fileName, sources[fileName], languageVersion, true)
      : getSourceFile(fileName, languageVersion, onError, shouldCreate)
  const fileExists = host.fileExists.bind(host)
  host.fileExists = (fileName) => sources[fileName] !== undefined || fileExists(fileName)
  const hostReadFile = host.readFile.bind(host)
  host.readFile = (fileName) => sources[fileName] ?? hostReadFile(fileName)

  const program = ts.createProgram(Object.keys(sources), options, host)
  const diagnostics = ts.getPreEmitDiagnostics(program)
  const forFile = (file: string): string[] => diagnostics
    .filter((entry) => entry.file?.fileName === file)
    .map((entry) => ts.flattenDiagnosticMessageText(entry.messageText, " "))

  assert.deepEqual(forFile(brandedProbe), [], "the canonical branded TenantId must be assignable")
  assert.ok(forFile(bareProbe).length > 0,
    "an unbranded string must not be assignable to the record's tenant identity")
})

// ─── T2 — source identity vs content integrity ──────────────────────────────

test("T2: contentDigest is integrity evidence, never identity or equality", () => {
  const record = accept(base())
  const revised = accept(base({ contentDigest: OTHER_DIGEST }))
  assert.equal(identityOf(revised), identityOf(record), "a revised digest is the same source")
  assert.notEqual(revised.contentDigest, record.contentDigest)

  const elsewhere = accept(base({ providerObjectKey: "different-object" }))
  assert.equal(elsewhere.contentDigest, record.contentDigest)
  assert.notEqual(identityOf(elsewhere), identityOf(record),
    "identical content must not merge two distinct sources")

  // Lowercase only: an uppercase-hex digest is rejected, never folded.
  assert.equal(reject(base({ contentDigest: record.contentDigest.toUpperCase() })), "invalid_content_digest")
  assert.equal(reject(base({ contentDigest: `sha256:${"g".repeat(64)}` })), "invalid_content_digest")
})

// ─── T3 — providerObjectKey exactness ───────────────────────────────────────

test("T3: providerObjectKey is byte-exact and never normalized", () => {
  // Composed and decomposed forms are built from code points, so the distinction
  // survives any editor or transport that would otherwise normalize this file.
  const composed = `caf${String.fromCharCode(0xe9)}-1`
  const decomposed = `cafe${String.fromCharCode(0x301)}-1`
  const keys = [
    "Issue-42", "issue-42", " issue-42", "issue-42 ",
    composed, decomposed, "a%2Fb", "a/b",
  ]
  const identities = new Set<string>()
  for (const key of keys) {
    const record = accept(base({ providerObjectKey: key }))
    assert.equal(record.providerObjectKey, key, "the key must be carried byte-for-byte")
    identities.add(identityOf(record))
  }
  assert.equal(identities.size, keys.length,
    "case, whitespace, Unicode form and percent-encoding differences must stay distinct sources")
})

// ─── T4 — declaredSourceRef opacity ─────────────────────────────────────────

test("T4: declaredSourceRef is opaque — never identity, never parsed", () => {
  const shared = "shared-token"
  const left = accept(base({ declaredSourceRef: shared }))
  const right = accept(base({ declaredSourceRef: shared, providerObjectKey: "another-object" }))
  assert.notEqual(identityOf(left), identityOf(right),
    "a shared declared reference must not merge two sources")

  // Each of these would be rejected if it were interpreted as the thing it resembles.
  for (const lookalike of [
    "2026-02-30T00:00:00Z", "not-an-instant", "http://example.invalid/x",
    "javascript:alert(1)", "sha256:not-hex", "../../etc/passwd",
  ]) {
    assert.equal(accept(base({ declaredSourceRef: lookalike })).declaredSourceRef, lookalike,
      "a declared reference must be carried verbatim, never interpreted")
  }
  assert.equal(accept(base({ declaredSourceRef: null })).declaredSourceRef, null)
})

// ─── T5 — unknown temporal values stay unknown ──────────────────────────────

test("T5: a null sourceEventAt means unknown and nothing else", () => {
  const unknown = accept(base({ sourceEventAt: null }))
  assert.equal(unknown.sourceEventAt, null, "null must never be defaulted to a clock value")

  // The only difference a known event time makes is that one field.
  const known = accept(base({ sourceEventAt: "2019-01-01T00:00:00Z" }))
  const withoutEventTime = (record: SourceRecordV1): Record<string, unknown> => {
    const rest: Record<string, unknown> = { ...record }
    delete rest.sourceEventAt
    return rest
  }
  assert.deepEqual(withoutEventTime(unknown), withoutEventTime(known),
    "an unknown instant must not alter any other field")

  // Unknown is not "open": it participates in no ordering rule.
  assert.equal(accept(base({
    sourceEventAt: null, observedAt: "2026-01-02T03:04:05Z", recordedAt: "2026-01-02T03:04:05Z",
  })).sourceEventAt, null)
})

test("T5: recordedAt is never before observedAt, and instants are calendar-real", () => {
  assert.equal(reject(base({ recordedAt: "2026-01-02T03:04:04Z" })), "recorded_before_observed")
  // Equal instants written with different fractional precision are equal, not out of order.
  for (const [observedAt, recordedAt] of [
    ["2026-01-02T03:04:05Z", "2026-01-02T03:04:05.000Z"],
    ["2026-01-02T03:04:05.000Z", "2026-01-02T03:04:05Z"],
  ]) {
    assert.equal(accept(base({ observedAt, recordedAt })).recordedAt, recordedAt)
  }
  for (const invalid of ["2026-13-02T03:04:05Z", "2026-02-30T03:04:05Z", "2026-01-02T25:04:05Z"]) {
    assert.equal(reject(base({ observedAt: invalid, recordedAt: invalid })), "invalid_instant")
  }
})

// ─── T6 / T7 — no masquerade as a later lifecycle stage ─────────────────────

const LATER_STAGE_FIELDS = [
  "status", "trustLevel", "reviewedBy", "reviewedByUserId", "reviewedAt", "approvedBy",
  "approvedByUserId", "workUnitId", "candidateId", "draftId", "reviewedWorkUnitId",
  "confidence", "score", "priority", "goal", "nextAction", "missingFields", "payload",
]

test("T6: a source record cannot carry or acquire a later-stage field", async () => {
  const declared = await moduleSource("types.ts")
  for (const field of LATER_STAGE_FIELDS) {
    assert.equal(new RegExp(`readonly\\s+${field}\\b`).test(declared), false,
      `SourceRecordV1 must not declare ${field}`)
    assert.equal(reject(base({ [field]: "x" })), "unknown_field",
      `${field} must be rejected, never silently ignored`)
  }
})

const FORBIDDEN_SYMBOLS = [
  "CanonicalSourceRecordV1", "CorrelationGroupV1", "WorkUnitCandidateV1", "WorkUnitCorrectionV1",
  "WorkUnitReviewV1", "ReviewedWorkUnitV1", "ActionPreparationV1", "SourceCandidate",
  "WorkUnitDraft", "ActionPreview", "ActionApprovalRecord", "ExecutionCommand", "ExecutionResult",
  "promote", "toCandidate", "toWorkUnit", "approve", "execute", "correlate", "group", "pair", "match",
]

test("T7: the module declares no candidate, review, approval, execution or grouping symbol", async () => {
  const offenders: string[] = []
  for (const file of MODULE_FILES) {
    const source = await moduleSource(file)
    for (const symbol of FORBIDDEN_SYMBOLS) {
      if (new RegExp(`\\b(?:type|interface|class|enum|const|function)\\s+${symbol}\\b`, "i").test(source)) {
        offenders.push(`${file} declares ${symbol}`)
      }
    }
  }
  assert.deepEqual(offenders, [], `WU-01B introduces one record only:\n${offenders.join("\n")}`)

  const surface = await import("../app/lib/domain/source/index.ts")
  assert.deepEqual(Object.keys(surface).sort(), ["SOURCE_RECORD_VERSION", "validateSourceRecordV1"],
    "the runtime surface is the version constant and the validator, nothing else")
})

// ─── T8 — prior evidence is preserved, never corrected in place ─────────────

test("T8: the record is frozen, freshly built, and has no in-place update surface", async () => {
  const input = base()
  const pristine = structuredClone(input)
  const record = accept(input)

  assert.ok(Object.isFrozen(record), "the returned record must be frozen")
  assert.throws(() => { (record as { providerObjectKey: string }).providerObjectKey = "x" },
    "a frozen record must reject mutation in strict mode")
  assert.notEqual(record as unknown, input, "the validator must not return the caller's object")
  assert.deepEqual(input, pristine, "the validator must not mutate its argument")

  const surface = await import("../app/lib/domain/source/index.ts")
  const functions = Object.entries(surface).filter(([, value]) => typeof value === "function")
  assert.deepEqual(functions.map(([name]) => name), ["validateSourceRecordV1"],
    "no second function may accept a SourceRecordV1 and update it")
  assert.equal(/SourceRecordV1\s*\)/.test(await moduleSource("validateSourceRecord.ts")), false,
    "no exported function may take a SourceRecordV1 as input")
})

// ─── T9 — unknown version fails closed ──────────────────────────────────────

test("T9: an unknown recordVersion fails closed and is never defaulted", () => {
  for (const version of ["2", "0", 1, "", null, true, ["1"]]) {
    assert.equal(reject(base({ recordVersion: version })), "unsupported_record_version")
  }
  assert.equal(reject(without("recordVersion")), "missing_field")
  // Checked before every other field check, so a bad version is never masked.
  assert.equal(reject(base({ recordVersion: "2", tenantId: "", contentDigest: "nope" })),
    "unsupported_record_version")
})

// ─── T10 / T11 — dependency boundaries ──────────────────────────────────────

test("T10: no compatibility-tenant or unbranded-alias dependency", async () => {
  const edges = await scanModuleGraph(rootDir, [MODULE_DIR])
  assert.ok(edges.length > 0, "the scan must actually observe this module's edges")

  for (const forbidden of [COMPAT_TENANT, PHASE6_TENANT_ALIAS]) {
    assert.deepEqual(edges.filter((edge) => edge.resolvedTarget === forbidden), [],
      `${MODULE_DIR} must not reach ${forbidden}`)
  }
  assert.deepEqual(
    [...new Set(edges.map((edge) => edge.resolvedTarget))].filter((target) => !target.startsWith("app/lib/domain/")),
    [], "every dependency must stay inside app/lib/domain/")
  assert.ok(edges.some((edge) => edge.resolvedTarget === CANONICAL_TENANT),
    "tenant identity must come from the canonical branded declarations")
})

test("T11: no unmerged formation input and no grouping capability", async () => {
  // Tokens are assembled at run time so this file never contains one literally —
  // the repository-wide isolation guard forbids that in every file but its own.
  const tokens = ["formation" + "/findings", "formation" + "Findings", "feat/" + "f6-formation-findings"]
  const offenders: string[] = []
  for (const file of MODULE_FILES) {
    const source = await moduleSource(file)
    for (const token of tokens) if (source.includes(token)) offenders.push(`${file} references a blocked token`)
    if (/\bfrom\s+"(?!\.\.?\/)/.test(source)) offenders.push(`${file} imports a bare module`)
  }
  assert.deepEqual(offenders, [], offenders.join("\n"))
})

// ─── T12 — no persistence, provider, runtime import or clock ────────────────

const FORBIDDEN_RUNTIME_TOKENS = [
  "node:", "fetch(", "XMLHttpRequest", "D1Database", "wrangler", "migration",
  "Repository", "process.env", "localStorage", "require(",
]

test("T12: the module is a pure leaf with no I/O, no persistence and no provider", async () => {
  const ts = (await import("typescript")).default
  for (const file of MODULE_FILES) {
    const source = await moduleSource(file)
    for (const token of FORBIDDEN_RUNTIME_TOKENS) {
      assert.equal(source.includes(token), false, `${file} must not reference ${token}`)
    }
    // Every cross-module import is erased at build time; the only runtime edge
    // permitted is index.ts re-exporting this module's own validator.
    const emitted = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2017, isolatedModules: true },
      fileName: file,
    }).outputText
    const runtimeTargets = [...emitted.matchAll(/from\s*"([^"]+)"/g)].map((entry) => entry[1])
    assert.deepEqual(runtimeTargets.filter((target) => !/^\.\/[A-Za-z]/.test(target)), [],
      `${file} must emit no runtime import outside ${MODULE_DIR}`)
  }
})

test("T12: validation reads no clock and no randomness", () => {
  const RealDate = globalThis.Date
  const realRandom = Math.random
  let clockReads = 0
  let randomReads = 0
  class ProbeDate extends RealDate {
    constructor(...args: ConstructorParameters<typeof Date>) { clockReads += 1; super(...args) }
    static now(): number { clockReads += 1; return RealDate.now() }
  }
  globalThis.Date = ProbeDate as DateConstructor
  Math.random = () => { randomReads += 1; return realRandom() }
  try {
    assert.equal(accept(base({ sourceEventAt: null })).sourceEventAt, null)
    assert.equal(reject(base({ observedAt: "2026-02-30T00:00:00Z" })), "invalid_instant")
  } finally {
    globalThis.Date = RealDate
    Math.random = realRandom
  }
  assert.equal(clockReads, 0, "validation must not read the clock")
  assert.equal(randomReads, 0, "validation must not read randomness")
})

// ─── T13 — the duplicated timestamp profile may not drift ───────────────────

test("T13: the local instant guard and the Phase 6 guard agree on every vector", () => {
  const far = "9999-12-31T23:59:59.999Z"
  const localAccepts = (value: string): boolean =>
    validateSourceRecordV1(base({ observedAt: value, recordedAt: far })).ok

  for (const vector of fixture.isoVectors) {
    assert.equal(localAccepts(vector), isIsoUtcTimestamp(vector),
      `the two ISO-8601 UTC guards disagree on ${JSON.stringify(vector)}`)
  }
  // The vector set must exercise both verdicts, so agreement is not vacuous.
  assert.ok(fixture.isoVectors.some(isIsoUtcTimestamp), "some vector must be accepted")
  assert.ok(fixture.isoVectors.some((vector) => !isIsoUtcTimestamp(vector)), "some vector must be rejected")
})

// ─── T14 — the provider vocabulary is exactly SourceType ────────────────────

test("T14: the accepted provider set equals the SourceType union member for member", async () => {
  const source = await readFile(path.join(rootDir, "app/lib/domain/types.ts"), "utf8")
  const union = /export type SourceType =([\s\S]*?)\n\n/.exec(source)
  assert.ok(union, "app/lib/domain/types.ts must keep declaring SourceType")
  const members = [...union[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1])
  assert.ok(members.length > 0, "SourceType must have members")

  for (const member of members) {
    assert.equal(validateSourceRecordV1(base({ provider: member })).ok, true,
      `${member} is a SourceType member and must be accepted`)
  }
  for (const outsider of ["linear", "jira", "GitHub", "", "slack "]) {
    assert.equal(reject(base({ provider: outsider })), "invalid_provider")
  }
  // A widening is caught too: nothing outside the union may be accepted.
  const validator = await moduleSource("validateSourceRecord.ts")
  const vocabulary = /ACCEPTED_PROVIDERS: Record<SourceType, true> = \{([\s\S]*?)\}/.exec(validator)
  assert.ok(vocabulary, "the validator must keep declaring its provider vocabulary")
  const accepted = [...vocabulary[1].matchAll(/(\w+): true/g)].map((entry) => entry[1])
  assert.deepEqual(accepted.sort(), [...members].sort(), "the accepted set must equal the union")
})

// ─── T16 — determinism, purity and the closed failure vocabulary ────────────

test("T16: validation is deterministic and insensitive to key insertion order", () => {
  const input = base({ declaredSourceRef: "ref", sourceEventAt: "2020-01-01T00:00:00Z" })
  assert.deepEqual(accept(input), accept(structuredClone(input)))

  const permuted: Record<string, unknown> = {}
  for (const key of Object.keys(input).reverse()) permuted[key] = input[key]
  assert.deepEqual(accept(permuted), accept(input), "key insertion order must not change the result")
})

test("golden vectors: every declared failure code is produced, value-free", async () => {
  const produced = new Set<string>()
  for (const vector of fixture.rejects) {
    const input = base(vector.patch ?? {})
    for (const key of vector.remove ?? []) delete input[key]
    const result = validateSourceRecordV1(input)
    if (result.ok) assert.fail(`expected ${vector.failureCode} for ${JSON.stringify(vector)}`)
    assert.equal(result.failureCode, vector.failureCode, JSON.stringify(vector))
    assert.deepEqual(Object.keys(result), ["ok", "failureCode"], "a failure must echo no caller value")
    produced.add(result.failureCode)
  }
  for (const unreadable of [null, undefined, 42, "x", [], [base()], new Date(), Object.create({ a: 1 })]) {
    assert.equal(reject(unreadable), "input_unreadable")
  }
  produced.add("input_unreadable")
  assert.deepEqual([...produced].sort(), [...FAILURE_CODES].sort(),
    "the fixture must exercise the whole closed vocabulary")

  const declared = [...(await moduleSource("types.ts")).matchAll(/\| "([a-z_]+)"/g)].map((entry) => entry[1])
  assert.deepEqual(declared.sort(), [...FAILURE_CODES].sort(), "the declared union must stay closed")
})

