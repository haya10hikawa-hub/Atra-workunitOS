import test from "node:test"
import assert from "node:assert/strict"
import { readFile, readdir } from "node:fs/promises"
import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { isCodeFilePath, scanModuleGraph, type ModuleEdge } from "../scripts/lib/typescriptModuleGraph.mjs"

// WU-02 — the normalized signal contract lives at a neutral port, so provider adapters depend
// downward instead of upward on the application layer. Every assertion below is a durable module,
// authority or behavioural invariant: none encodes a base SHA, a changed-file set or a one-shot
// diff. Exact slice scope is proven by the implementation record and exact-head review instead.

const rootDir = fileURLToPath(new URL("../", import.meta.url))
const SIGNAL_PORT = "app/lib/ports/toolSignal/types.ts"
const COMPAT_MODULE = "app/lib/application/workunitInbox/types.ts"
const CONTRACT_FIXTURE = "tests/fixtures/architecture/normalized-signal-contract.v1.json"
const DEBT_LEDGER = "tests/fixtures/architecture/declared-boundary-debt.v1.json"

const RELOCATED_SYMBOLS = ["NormalizedToolProvider", "NormalizedToolSignal", "NormalizedToolSignalType", "WorkUnitPriority"]
const INBOX_SYMBOLS = ["InboxWorkUnit", "InboxWorkUnitKind", "InboxWorkUnitStatus"]

// A different, structurally unrelated WorkUnitPriority. Identity in this file is always by
// resolved path: a name-only assertion here would be either vacuous or false.
const UNRELATED_PRIORITY_MODULE = "app/types/workunit.ts"
const UNRELATED_PRIORITY_MEMBERS = ["Critical", "High", "Normal"]

const MAPPERS = ["calendar", "github", "slack"].map((provider) =>
  `app/lib/infrastructure/external/${provider}/toNormalizedToolSignal.ts`)

// WU-02S: signal resolution and the source vocabulary moved out of the route
// module and into the shared Inbox application service, which both
// `GET /api/workunit/inbox` and `POST /api/workunit/inbox/refresh` call. The
// pins are re-pointed at that module; neither assertion is weakened.
const INBOX_SERVICE = "app/lib/application/workunitInbox/inboxService.ts"
const SIGNAL_CONSUMERS = [
  "app/lib/application/workunitInbox/transform.ts",
  "app/lib/application/workunitInbox/mockSignals.ts",
  "app/lib/application/candidate/candidateWorkUnitBridge.ts",
  "app/lib/application/workunitInbox/inboxService.ts",
]

// The eight legacy compatibility shims this slice must leave untouched: three bare mapper
// re-exports and five application shims with a fixed header comment. Ten further `export *` shims
// under app/lib/workunitInbox/sources/** are outside this set by ratified decision, and stay
// pinned by the frozen 62-edge legacy fixture.
const BARE_SHIMS = ["calendar", "github", "slack"].map((provider) => ({
  file: `app/lib/workunitInbox/sources/${provider}/toNormalizedToolSignal.ts`,
  specifier: `../../../infrastructure/external/${provider}/toNormalizedToolSignal.ts`,
}))
const COMMENTED_SHIMS = ["types", "transform", "mockSignals", "actionPreviewMapping", "persistenceMapping"]
  .map((name) => ({ file: `app/lib/workunitInbox/${name}.ts`, specifier: `../application/workunitInbox/${name}.ts` }))

const PROVIDER_AND_INBOX_SUITES = [
  "githubNormalizedSignalSource", "slackNormalizedSignalSource", "calendarNormalizedSignalSource",
  "githubClientSkeleton", "workunitInboxTransform", "workunitInboxSourceAll", "workunitInboxApi",
  "phase1Wireup", "workunitInboxActionPreviewMapping",
].map((name) => `tests/${name}.test.mts`)
// Count-pinned, so a silently dropped test fails; a deliberate addition updates this literal.
const PROVIDER_AND_INBOX_TEST_COUNT = 84

type TS = typeof import("typescript")
type SF = import("typescript").SourceFile
type FieldDescriptor = { name: string; optional: boolean; type: string }
type MapperCase = {
  name: string; provider: "github" | "slack" | "calendar"; eventType: string; now?: string
  event: Record<string, unknown>; ownKeys: string[]; output: Record<string, unknown>
}
type ContractFixture = {
  declaration: { path: string; symbols: string[]; compatibilityReExport: string }
  vocabularies: Record<string, string[]>; signalFields: FieldDescriptor[]
  requiredFieldCount: number; optionalFieldCount: number; mapperCases: MapperCase[]
}

// No catch anywhere below: an unreadable or malformed fixture must fail the gate, never skip it.
async function readContractFixture(): Promise<ContractFixture> {
  return JSON.parse(await readFile(path.join(rootDir, CONTRACT_FIXTURE), "utf8")) as ContractFixture
}

async function readSource(relative: string): Promise<string> {
  return readFile(path.join(rootDir, relative), "utf8")
}

async function typescript() {
  return (await import("typescript")).default
}

async function parseModule(relative: string) {
  const ts = await typescript()
  const source = await readSource(relative)
  const sourceFile = ts.createSourceFile(relative, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)
  return { ts, source, sourceFile }
}

function typeAliases(ts: TS, sourceFile: SF) {
  const aliases = new Map<string, import("typescript").TypeAliasDeclaration>()
  for (const statement of sourceFile.statements) {
    if (ts.isTypeAliasDeclaration(statement)) aliases.set(statement.name.text, statement)
  }
  return aliases
}

function stringUnionMembers(ts: TS, alias: import("typescript").TypeAliasDeclaration): string[] {
  const node = alias.type
  const parts = ts.isUnionTypeNode(node) ? [...node.types] : [node]
  return parts.map((part) => {
    assert.ok(ts.isLiteralTypeNode(part) && ts.isStringLiteral(part.literal),
      `${alias.name.text} must be a union of string literals`)
    return (part.literal as import("typescript").StringLiteral).text
  }).sort()
}

function objectFields(ts: TS, alias: import("typescript").TypeAliasDeclaration, sourceFile: SF): FieldDescriptor[] {
  assert.ok(ts.isTypeLiteralNode(alias.type), `${alias.name.text} must be an object type literal`)
  return alias.type.members.map((member) => {
    assert.ok(ts.isPropertySignature(member) && member.name !== undefined && ts.isIdentifier(member.name),
      `${alias.name.text} members must be plain property signatures`)
    assert.ok(member.type !== undefined, `${alias.name.text}.${member.name.getText(sourceFile)} needs a type`)
    return { name: member.name.text, optional: member.questionToken !== undefined, type: member.type.getText(sourceFile) }
  })
}

async function collectCodeFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const files: string[] = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...(await collectCodeFiles(full)))
    else if (isCodeFilePath(entry.name)) files.push(full)
  }
  return files
}

async function declaringFiles(symbol: string): Promise<string[]> {
  const pattern = new RegExp(`\\b(?:type|interface|class|enum|const|function|let|var)\\s+${symbol}\\b`)
  const found: string[] = []
  let scanned = 0
  for (const root of ["app", "scripts"]) {
    for (const file of await collectCodeFiles(path.join(rootDir, root))) {
      scanned += 1
      if (pattern.test(await readFile(file, "utf8"))) found.push(path.relative(rootDir, file))
    }
  }
  // Non-vacuity: an empty result is only meaningful if the sweep actually read files.
  assert.ok(scanned > 100, `declaration sweep for ${symbol} visited only ${scanned} files`)
  return found.sort()
}

// Comments are documentation, not code: a header that *describes* the port boundary must not be
// mistaken for a runtime specifier or for a SourceRecordV1 relationship. Stripping uses the
// TypeScript scanner rather than a regex, so a "//" inside a string literal is never miscounted.
function stripComments(ts: TS, source: string): string {
  const scanner = ts.createScanner(ts.ScriptTarget.ES2022, false, ts.LanguageVariant.Standard, source)
  let stripped = ""
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (token === ts.SyntaxKind.SingleLineCommentTrivia || token === ts.SyntaxKind.MultiLineCommentTrivia) continue
    stripped += scanner.getTokenText()
  }
  return stripped
}

function emit(ts: TS, source: string): string {
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2017, isolatedModules: true },
    fileName: "probe.ts",
  }).outputText
}

function referencesPortAtRuntime(emitted: string): boolean {
  return /toolSignal/.test(emitted)
    || /\b(?:require|import|export)\b[^\n]*\bfrom\b\s*["'][^"']*ports[^"']*["']/.test(emitted)
    || /\brequire\(\s*["'][^"']*ports[^"']*["']\s*\)/.test(emitted)
}

// ─── T1 — one declaration authority, and no runtime value in the port ────────────

test("T1: the four relocated symbols are declared exactly once, at the port, with no runtime value", async () => {
  const { ts, sourceFile } = await parseModule(SIGNAL_PORT)
  const aliases = typeAliases(ts, sourceFile)
  assert.deepEqual([...aliases.keys()].sort(), RELOCATED_SYMBOLS,
    "the port must declare exactly the four relocated symbols")

  // Correction B: the port must export no runtime value at all. This is what makes a compatibility
  // surface incapable of acquiring a runtime edge by construction rather than by inspection.
  const runtimeDeclarations = sourceFile.statements.filter((statement) =>
    ts.isVariableStatement(statement) || ts.isFunctionDeclaration(statement)
    || ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement))
  assert.deepEqual(runtimeDeclarations.map((statement) => statement.getText(sourceFile).slice(0, 60)), [],
    "the port must declare no const, function, class or enum")

  for (const symbol of ["NormalizedToolProvider", "NormalizedToolSignalType", "NormalizedToolSignal"]) {
    assert.deepEqual(await declaringFiles(symbol), [SIGNAL_PORT], `${symbol} must have exactly one declaration site`)
  }

  // WorkUnitPriority is the one name that legitimately exists twice. Both sites are pinned, and the
  // unrelated one is pinned by its members so the two vocabularies can never silently converge.
  assert.deepEqual(await declaringFiles("WorkUnitPriority"), [UNRELATED_PRIORITY_MODULE, SIGNAL_PORT].sort(),
    "WorkUnitPriority may exist only at the port and at the unrelated pre-existing declaration")
  const unrelated = await parseModule(UNRELATED_PRIORITY_MODULE)
  const unrelatedAlias = typeAliases(unrelated.ts, unrelated.sourceFile).get("WorkUnitPriority")
  assert.ok(unrelatedAlias, `${UNRELATED_PRIORITY_MODULE} must still declare its own WorkUnitPriority`)
  assert.deepEqual(stringUnionMembers(unrelated.ts, unrelatedAlias), UNRELATED_PRIORITY_MEMBERS,
    "the unrelated WorkUnitPriority must keep its distinct members")
})

// ─── T2, T3 — closed vocabularies ────────────────────────────────────────────────

test("T2: NormalizedToolProvider is exactly the three declared providers", async () => {
  const fixture = await readContractFixture()
  const { ts, sourceFile } = await parseModule(SIGNAL_PORT)
  const alias = typeAliases(ts, sourceFile).get("NormalizedToolProvider")
  assert.ok(alias, "the port must declare NormalizedToolProvider")
  const members = stringUnionMembers(ts, alias)
  assert.equal(members.length, 3, "the provider vocabulary is pinned at three members")
  assert.deepEqual(members, fixture.vocabularies.NormalizedToolProvider)
})

test("T3: NormalizedToolSignalType is exactly the five declared signal types", async () => {
  const fixture = await readContractFixture()
  const { ts, sourceFile } = await parseModule(SIGNAL_PORT)
  const alias = typeAliases(ts, sourceFile).get("NormalizedToolSignalType")
  assert.ok(alias, "the port must declare NormalizedToolSignalType")
  const members = stringUnionMembers(ts, alias)
  assert.equal(members.length, 5, "the signal-type vocabulary is pinned at five members")
  assert.deepEqual(members, fixture.vocabularies.NormalizedToolSignalType)

  const priority = typeAliases(ts, sourceFile).get("WorkUnitPriority")
  assert.ok(priority, "the port must declare WorkUnitPriority")
  assert.deepEqual(stringUnionMembers(ts, priority), fixture.vocabularies.WorkUnitPriority)
})

// ─── T4 — field shape and optionality ────────────────────────────────────────────

test("T4: NormalizedToolSignal keeps its exact fields, types and required/optional split", async () => {
  const fixture = await readContractFixture()
  assert.equal(fixture.signalFields.length, 14, "the frozen descriptor must cover all 14 fields")
  assert.equal(fixture.signalFields.filter((field) => !field.optional).length, fixture.requiredFieldCount)
  assert.equal(fixture.signalFields.filter((field) => field.optional).length, fixture.optionalFieldCount)
  // 8 required + 6 optional, read off the declaration itself. The sealed charter's prose says
  // "9 required, 5 optional"; its own per-field table says otherwise, and the code is authority.
  assert.equal(fixture.requiredFieldCount, 8)
  assert.equal(fixture.optionalFieldCount, 6)

  const { ts, sourceFile } = await parseModule(SIGNAL_PORT)
  const alias = typeAliases(ts, sourceFile).get("NormalizedToolSignal")
  assert.ok(alias, "the port must declare NormalizedToolSignal")
  // Declaration order is part of the contract, so this is an ordered comparison.
  assert.deepEqual(objectFields(ts, alias, sourceFile), fixture.signalFields)
})

// ─── T6, T7 — resolved dependency direction ──────────────────────────────────────

test("T6: all three provider mappers resolve the signal contract to the port, type-only", async () => {
  const observed = (await scanModuleGraph(rootDir, ["app/lib/infrastructure/external"]))
    .filter((edge) => MAPPERS.includes(edge.file) && edge.resolvedTarget.endsWith("types.ts")
      && !edge.resolvedTarget.startsWith("app/lib/infrastructure/"))
    .map((edge) => `${edge.file} | ${edge.kind} | ${edge.resolvedTarget}`)
    .sort()
  assert.deepEqual(observed, MAPPERS.map((mapper) => `${mapper} | import-type | ${SIGNAL_PORT}`),
    "each mapper must import the contract from the port, and only from the port")
})

test("T7: every signal consumer resolves to the single declaration, through the compatibility surface", async () => {
  const edges = await scanModuleGraph(rootDir, ["app"])
  for (const consumer of SIGNAL_CONSUMERS) {
    const targets = edges.filter((edge) => edge.file === consumer
      && (edge.resolvedTarget === COMPAT_MODULE || edge.resolvedTarget === SIGNAL_PORT))
      .map((edge) => edge.resolvedTarget)
    assert.ok(targets.length > 0, `${consumer} must still consume the signal contract`)
    assert.deepEqual([...new Set(targets)], [COMPAT_MODULE],
      `${consumer} must resolve the contract through exactly one module`)
  }

  // The compatibility surface is not a second root: it resolves onward to the port and nowhere else.
  const compatTargets = [...new Set(edges.filter((edge) => edge.file === COMPAT_MODULE)
    .map((edge) => edge.resolvedTarget))]
  assert.deepEqual(compatTargets, [SIGNAL_PORT],
    "the compatibility module must resolve the signal family to the port alone")
})

// ─── T8 — the compatibility surface is a re-export, never a declaration ──────────

test("T8: the application module re-exports the signal family and declares none of it", async () => {
  const { ts, source, sourceFile } = await parseModule(COMPAT_MODULE)
  const aliases = typeAliases(ts, sourceFile)
  assert.deepEqual([...aliases.keys()].sort(), [...INBOX_SYMBOLS].sort(),
    "the application module must declare the Inbox family and nothing from the signal family")
  for (const symbol of RELOCATED_SYMBOLS) {
    assert.equal(new RegExp(`\\b(?:type|interface|class|enum)\\s+${symbol}\\b`).test(source), false,
      `${COMPAT_MODULE} must not declare ${symbol}`)
  }

  // The pair the compatibility plan depends on: a type-only re-export for consumers, and a
  // type-only import for the two symbols InboxWorkUnit itself references.
  assert.match(source, /export type \{[^}]*\} from "\.\.\/\.\.\/ports\/toolSignal\/types\.ts"/,
    "the re-export must be `export type { … } from` the port")
  assert.match(source, /import type \{[^}]*\} from "\.\.\/\.\.\/ports\/toolSignal\/types\.ts"/,
    "InboxWorkUnit's own references must arrive by `import type`")
  // Fail-closed against a truncated read: the file must still own the Inbox projection.
  assert.match(source, /export type InboxWorkUnit = \{/)
})

// ─── T9, T10 — provider behaviour is unchanged ───────────────────────────────────

async function loadMappers() {
  const [github, slack, calendar] = await Promise.all([
    import("../app/lib/infrastructure/external/github/toNormalizedToolSignal.ts"),
    import("../app/lib/infrastructure/external/slack/toNormalizedToolSignal.ts"),
    import("../app/lib/infrastructure/external/calendar/toNormalizedToolSignal.ts"),
  ])
  return (testCase: MapperCase): Record<string, unknown> => {
    if (testCase.provider === "github") return github.githubEventToNormalizedToolSignal(testCase.event as never)
    if (testCase.provider === "slack") return slack.slackEventToNormalizedToolSignal(testCase.event as never)
    return calendar.calendarEventToNormalizedToolSignal(testCase.event as never, { now: new Date(testCase.now as string) })
  }
}

test("T9: every recorded provider event still maps to its recorded signal", async () => {
  const fixture = await readContractFixture()
  const map = await loadMappers()
  assert.ok(fixture.mapperCases.length >= 10, "the fixture must exercise every provider branch")
  assert.deepEqual([...new Set(fixture.mapperCases.map((testCase) => testCase.provider))].sort(),
    ["calendar", "github", "slack"], "all three providers must be covered")

  for (const testCase of fixture.mapperCases) {
    const actual = map(testCase)
    // Own-key order is asserted separately from values, so an omitted optional field and an
    // explicitly-undefined one stay distinguishable rather than being normalized together.
    assert.deepEqual(Object.keys(actual), testCase.ownKeys, `${testCase.name}: emitted key set`)
    assert.deepEqual(JSON.parse(JSON.stringify(actual)), testCase.output, `${testCase.name}: emitted signal`)
  }
})

test("T10: optional omission and every provider branch behave as recorded", async () => {
  const fixture = await readContractFixture()
  const map = await loadMappers()

  // Every switch arm of all three mappers is covered, count-pinned per provider.
  const arms = (provider: string) => [...new Set(fixture.mapperCases
    .filter((testCase) => testCase.provider === provider).map((testCase) => testCase.eventType))].sort()
  assert.deepEqual(arms("github"), ["issue_assigned", "issue_blocked", "pull_request_review_requested"])
  assert.deepEqual(arms("slack"), ["decision_request", "mention_request", "thread_needs_reply"])
  assert.deepEqual(arms("calendar"), ["deadline_approaching", "meeting_preparation_needed"])

  // Absent provider values stay absent rather than becoming empty strings or nulls.
  const omissionCases = fixture.mapperCases.filter((testCase) =>
    ["actor", "assignee", "url"].some((field) => !(field in testCase.event)))
  assert.ok(omissionCases.length >= 3, "optional omission must be exercised on every provider")
  for (const testCase of omissionCases) {
    const actual = map(testCase)
    for (const [eventField, signalField] of [["actor", "actor"], ["assignee", "assignee"], ["url", "sourceUrl"]]) {
      if (eventField in testCase.event) continue
      assert.equal(actual[signalField], undefined, `${testCase.name}: ${signalField} must stay absent`)
      assert.equal(signalField in testCase.output, false, `${testCase.name}: ${signalField} must stay absent in the record`)
    }
  }

  // The Calendar two-day window, its boundary, and its non-finite guard are each pinned.
  const priorityOf = (name: string) => {
    const testCase = fixture.mapperCases.find((entry) => entry.name === name)
    assert.ok(testCase, `fixture case "${name}" is missing`)
    return map(testCase).priorityHint
  }
  assert.equal(priorityOf("calendar deadline_approaching inside the two-day window"), "high")
  assert.equal(priorityOf("calendar exactly two days out is still inside the window"), "high")
  assert.equal(priorityOf("calendar meeting_preparation_needed outside the two-day window"), "medium")
  assert.equal(priorityOf("calendar unparseable dueAt falls back to medium, not high"), "medium")
})

// ─── T11, T12 — no SourceRecordV1 relationship, no persistence coupling ──────────

test("T11: no production module consumes app/lib/domain/source, and no mapper mentions SourceRecordV1", async () => {
  const edges = await scanModuleGraph(rootDir, ["app", "scripts"])
  assert.ok(edges.length > 100, "the production scan must not be empty")
  const consumers = edges
    .filter((edge) => edge.resolvedTarget.startsWith("app/lib/domain/source/")
      && !edge.file.startsWith("app/lib/domain/source/"))
    .map((edge) => `${edge.file} -> ${edge.specifier}`)
  assert.deepEqual(consumers, [], `SourceRecordV1 must have no production consumer:\n${consumers.join("\n")}`)

  const ts = await typescript()
  const mentions: string[] = []
  let scannedCode = 0
  for (const file of [...MAPPERS, SIGNAL_PORT, COMPAT_MODULE]) {
    const code = stripComments(ts, await readSource(file))
    scannedCode += code.length
    if (/\bSourceRecordV1\b/.test(code)) mentions.push(file)
  }
  // Non-vacuity: comment-stripping must not have emptied the sources it inspects.
  assert.ok(scannedCode > 2000, "the comment-stripped sources must still contain code")
  assert.deepEqual(mentions, [], "the signal contract and its mappers must not reference SourceRecordV1 in code")
})

test("T12: the signal contract and its mappers have no persistence or route coupling", async () => {
  const edges = await scanModuleGraph(rootDir, ["app/lib/ports", "app/lib/infrastructure/external"])
  const scoped = edges.filter((edge) => edge.file === SIGNAL_PORT || MAPPERS.includes(edge.file))
  // Non-vacuity: the mappers do have edges, so an empty violation set is a real result.
  assert.ok(scoped.length >= MAPPERS.length, "the mapper scan must observe the mapper edges")

  const forbidden = ["app/lib/persistence/", "app/lib/infrastructure/persistence/", "app/api/", "app/components/", "migrations/"]
  const coupled = scoped
    .filter((edge) => forbidden.some((prefix) => edge.resolvedTarget.startsWith(prefix)))
    .map((edge) => `${edge.file} -> ${edge.specifier}`)
  assert.deepEqual(coupled, [], `signal contract must stay free of persistence, route and UI coupling:\n${coupled.join("\n")}`)

  // The closed debt stays closed: an empty ledger, in both directions.
  const ledger = JSON.parse(await readSource(DEBT_LEDGER)) as { debts: Array<{ id: string }> }
  assert.deepEqual(ledger.debts, [], "the declared-debt ledger must remain empty")
})

// The provider vocabulary and the route's accepted sources are two halves of one contract: a
// provider the port declares but the route rejects is a silent behaviour change that no existing
// suite detects. Adding a route source stays green; dropping one the port declares does not.
test("T12: every provider the port declares stays an accepted inbox route source", async () => {
  const { ts, sourceFile } = await parseModule(SIGNAL_PORT)
  const alias = typeAliases(ts, sourceFile).get("NormalizedToolProvider")
  assert.ok(alias, "the port must declare NormalizedToolProvider")
  const providers = stringUnionMembers(ts, alias)
  const serviceSource = await readSource(INBOX_SERVICE)
  const declared = /export const INBOX_SOURCES: readonly InboxSource\[\] = Object\.freeze\(\[([^\]]*)\]\)/.exec(serviceSource)
  assert.ok(declared, "the inbox service must still declare INBOX_SOURCES as a literal frozen list")
  const sources = declared[1].split(",").map((entry) => entry.trim().replace(/^"|"$/g, "")).filter(Boolean)
  assert.ok(sources.length >= providers.length, "non-vacuity: the service source list must be readable")
  assert.deepEqual(providers.filter((provider) => !sources.includes(provider)), [],
    "every provider the port declares must remain an accepted inbox source")

  // Both inbox routes must consume that single vocabulary rather than
  // re-declaring one, so the read and write paths cannot drift apart.
  for (const route of ["app/api/workunit/inbox/route.ts", "app/api/workunit/inbox/refresh/route.ts"]) {
    const routeSource = await readSource(route)
    assert.ok(routeSource.includes("isInboxSource"), `${route} must use the shared source guard`)
    assert.equal(/const VALID_SOURCES\s*=/.test(routeSource), false, `${route} must not re-declare the vocabulary`)
  }
})

// ─── T13 — the compatibility surface stays erased ────────────────────────────────

test("T13: the compatibility surface and the mappers emit no runtime edge to the port", async () => {
  const ts = await typescript()

  for (const file of [COMPAT_MODULE, ...MAPPERS]) {
    const emitted = stripComments(ts, emit(ts, await readSource(file)))
    assert.equal(referencesPortAtRuntime(emitted), false,
      `${file} must emit no runtime reference to the port:\n${emitted}`)
  }

  // Runtime semantics are equivalent across the relocation: a module declaring the types locally
  // and a module re-exporting them from the port emit the same absence of a runtime binding.
  const localDeclaration = 'export type WorkUnitPriority = "low" | "medium" | "high"\n'
  const relocated = 'export type { WorkUnitPriority } from "../../ports/toolSignal/types.ts"\n'
  assert.equal(referencesPortAtRuntime(emit(ts, localDeclaration)), false)
  assert.equal(referencesPortAtRuntime(emit(ts, relocated)), false)

  // Non-vacuity, and the exact defect M4 introduces: a value re-export IS a runtime edge, so this
  // assertion is demonstrably capable of failing rather than being unfalsifiable.
  const valueReExport = 'export { TOOL_SIGNAL_RUNTIME_SENTINEL } from "../../ports/toolSignal/types.ts"\n'
  assert.equal(referencesPortAtRuntime(emit(ts, valueReExport)), true,
    "a value re-export must be detected as a runtime edge, or this test proves nothing")
})

// ─── T14 — the port is a leaf, with no reverse dependency ────────────────────────

test("T14: the port imports nothing and no domain module depends on it", async () => {
  assert.deepEqual(await scanModuleGraph(rootDir, ["app/lib/ports"]), [],
    "the port layer must have zero outbound edges")

  const domainEdges = await scanModuleGraph(rootDir, ["app/lib/domain"])
  // Non-vacuity: the domain scan is large, so an empty reverse-dependency set is a real result.
  assert.ok(domainEdges.length > 10, "the domain scan must not be empty")
  assert.deepEqual(domainEdges.filter((edge) => edge.resolvedTarget.startsWith("app/lib/ports/")), [],
    "no domain module may depend on the ports layer")
})

// ─── T16 — no laundered edge back to the application model ──────────────────────

test("T16: no lower layer resolves to the application signal module, and no debt id returns", async () => {
  const edges = await scanModuleGraph(rootDir, ["app", "tests", "scripts"])
  const importers = edges.filter((edge) => edge.resolvedTarget === COMPAT_MODULE)
  // Non-vacuity: the compatibility surface must still be consumed, or "no forbidden importer"
  // would be trivially true because the module became unreachable.
  assert.ok(importers.length > 5, "the compatibility module must still have consumers")

  const forbiddenLayers = ["app/lib/infrastructure/", "app/lib/ports/", "app/lib/domain/"]
  const inverted = importers
    .filter((edge: ModuleEdge) => forbiddenLayers.some((prefix) => edge.file.startsWith(prefix)))
    .map((edge) => `${edge.file} -> ${edge.kind} ${edge.specifier}`)
  assert.deepEqual(inverted, [],
    `no infrastructure, port or domain module may depend on the application signal module:\n${inverted.join("\n")}`)
})

// ─── T17 — the eight legacy compatibility shims are untouched ───────────────────

test("T17: the eight legacy compatibility shims keep their exact form and targets", async () => {
  const shims = [...BARE_SHIMS, ...COMMENTED_SHIMS]
  assert.equal(shims.length, 8, "exactly eight shims are protected by this assertion")

  const observed: string[] = []
  for (const shim of shims) {
    // Fail-closed: a missing or unreadable shim throws rather than being skipped.
    const source = await readSource(shim.file)
    observed.push(`${shim.file} | ${source.trim()}`)
  }

  const expected = [
    ...BARE_SHIMS.map((shim) => `${shim.file} | export * from "${shim.specifier}"`),
    ...COMMENTED_SHIMS.map((shim) => [
      `${shim.file} | /**`,
      " * Compatibility export.",
      ` * Canonical ownership lives in app/lib/application/workunitInbox/${path.basename(shim.file)}`,
      " */",
      "",
      `export * from "${shim.specifier}"`,
    ].join("\n")),
  ]
  assert.deepEqual(observed, expected, "legacy compatibility shims must not drift or be repointed")
})

// ─── T18 — provider and Inbox behaviour suites stay green and count-pinned ──────

test("T18: the provider and Inbox suites stay green with an unchanged test count", () => {
  // The child must not inherit this run's test-runner context, or Node refuses to recurse and
  // silently reports nothing — which would make this assertion unfalsifiable.
  const childEnv = { ...process.env }
  delete childEnv.NODE_TEST_CONTEXT
  const result = spawnSync(process.execPath, [
    "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "--test", "--experimental-strip-types",
    ...PROVIDER_AND_INBOX_SUITES,
  ], { cwd: rootDir, encoding: "utf8", env: childEnv })

  const stdout = result.stdout ?? ""
  const pass = Number(/^# pass (\d+)$/m.exec(stdout)?.[1] ?? NaN)
  const fail = Number(/^# fail (\d+)$/m.exec(stdout)?.[1] ?? NaN)
  assert.ok(Number.isFinite(pass) && Number.isFinite(fail),
    `provider and Inbox suites produced no summary:\n${stdout}\n${result.stderr ?? ""}`)
  assert.equal(fail, 0, `provider and Inbox suites must stay green:\n${stdout}`)
  assert.equal(pass, PROVIDER_AND_INBOX_TEST_COUNT,
    "provider and Inbox test count drifted; a deliberate change updates this literal in the same review")
})
