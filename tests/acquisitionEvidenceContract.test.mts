/**
 * P1-1 acquisition-evidence contract suite.
 *
 * This WorkUnit declares a neutral contract and nothing else. The hard part is not declaring it —
 * it is proving that declaring it changed no capability. A contract type is exactly the kind of
 * artifact whose meaning decays quietly: it can be extended a field at a time, wired into a
 * provider that cannot honour it, or read as evidence that a provider profile was proven. Every
 * assertion below pins one way that could happen.
 *
 * A1–A5   the contract's exact shape, its sole declaration site and its complete module surface
 * A6      no SourceRecord relationship
 * A7      no provider module depends on the contract
 * A8      NormalizedToolSignal is untouched
 * A9–A10  no profile is proven and no digest is computed
 * A11–A12 exactly one port edge, and no production dependency outside the ports layer
 *
 * Structural throughout: every claim is read off the TypeScript AST or the resolved module graph,
 * never off source text, so a comment cannot satisfy a check the code does not — and, just as
 * importantly, a comment cannot fail a check the code does not violate. Naming the contract in
 * prose is not using it; depending on the module is.
 *
 * What this suite does NOT claim. TypeScript is structurally typed, so nothing here prevents some
 * other module from declaring an object of the same field shape. That is intentional and stated as
 * such: a structural lookalike is not authorized conforming acquisition evidence, because shape
 * alone establishes no provider-native identity, no ratified identity or content-scope profile and
 * no truthful B2-P1 digest evidence. What is enforceable, and what is enforced here, is that no
 * production module outside the ports layer — and no provider module at all — has a dependency on
 * this contract. A conforming producer can only arrive through a separately authorized
 * provider-profile WorkUnit, which would have to create exactly such a dependency and would fail
 * A7/A12 until it is reviewed and the ratchet is deliberately re-cut.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFile, readdir } from "node:fs/promises"
import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { isCodeFilePath, resolveModuleTarget, scanModuleGraph } from "../scripts/lib/typescriptModuleGraph.mjs"

const rootDir = fileURLToPath(new URL("../", import.meta.url))

const EVIDENCE_PORT = "app/lib/ports/acquisitionEvidence/types.ts"
const EVIDENCE_PORT_DIR = "app/lib/ports/acquisitionEvidence/"
const PORTS_LAYER = "app/lib/ports/"
const SIGNAL_PORT = "app/lib/ports/toolSignal/types.ts"
const SIGNAL_BOUNDARY_SUITE = "tests/normalizedToolSignalBoundary.test.mts"
const SIGNAL_CONTRACT_FIXTURE = "tests/fixtures/architecture/normalized-signal-contract.v1.json"
const SEMANTICS_DOC = "docs/architecture/SOURCE_RECORD_V1_SEMANTICS.md"

const CONTRACT_SYMBOLS = ["AcquisitionEvidence", "AcquiredSignalObservation"]
const APPROVED_PORT_EDGE = `${EVIDENCE_PORT} | import-type | ${SIGNAL_PORT}`

const PROVIDER_ROOTS = ["github", "slack", "calendar"]
  .map((provider) => `app/lib/infrastructure/external/${provider}`)

type TS = typeof import("typescript")
type Alias = import("typescript").TypeAliasDeclaration

async function read(relativePath: string): Promise<string> {
  return readFile(path.join(rootDir, relativePath), "utf8")
}

async function typescript(): Promise<TS> {
  return (await import("typescript")).default
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

function scriptKindFor(ts: TS, filePath: string) {
  const lower = filePath.toLowerCase()
  if (lower.endsWith(".tsx")) return ts.ScriptKind.TSX
  if (lower.endsWith(".jsx")) return ts.ScriptKind.JSX
  if (/\.(?:cjs|mjs|js)$/.test(lower)) return ts.ScriptKind.JS
  return ts.ScriptKind.TS
}

/**
 * Every name a module declares, at any depth: type aliases, interfaces, enums, classes, functions,
 * namespaces and every binding introduced by a variable declaration, destructuring included. Read
 * off the AST rather than matched in source text, so a comment that merely mentions a contract
 * name is not mistaken for a second declaration of it.
 */
function declaredNamesIn(ts: TS, sourceFile: import("typescript").SourceFile): string[] {
  const names: string[] = []
  const visitBinding = (name: import("typescript").BindingName) => {
    if (ts.isIdentifier(name)) {
      names.push(name.text)
      return
    }
    for (const element of name.elements) {
      if (!ts.isOmittedExpression(element)) visitBinding(element.name)
    }
  }
  const visit = (node: import("typescript").Node) => {
    if (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isEnumDeclaration(node)) {
      names.push(node.name.text)
    } else if ((ts.isClassDeclaration(node) || ts.isFunctionDeclaration(node)) && node.name !== undefined) {
      names.push(node.name.text)
    } else if (ts.isModuleDeclaration(node) && ts.isIdentifier(node.name)) {
      names.push(node.name.text)
    } else if (ts.isVariableDeclaration(node)) {
      visitBinding(node.name)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return names
}

type Edge = Awaited<ReturnType<typeof scanModuleGraph>>[number]

/**
 * A dependency on the acquisition-evidence contract: the module itself, or anything beside it.
 *
 * Matched case-insensitively, deliberately. A specifier whose casing differs from the file on disk
 * resolves on a case-insensitive filesystem and is a real dependency there; on a case-sensitive one
 * the same specifier does not resolve, and the scanner falls back to the literal path — which is
 * still the contract's path, differently cased. Comparing case-insensitively catches that
 * dependency on both, and can only ever widen what is caught: no other repository path differs from
 * this one by case alone.
 */
function contractDependencies(edges: Edge[]): Edge[] {
  const target = EVIDENCE_PORT.toLowerCase()
  const directory = EVIDENCE_PORT_DIR.toLowerCase()
  return edges.filter((edge) => {
    const resolved = edge.resolvedTarget.toLowerCase()
    return resolved === target || resolved.startsWith(directory)
  })
}

function describeEdge(edge: Edge): string {
  return `${edge.file} | ${edge.kind} | ${edge.specifier} -> ${edge.resolvedTarget}`
}

/**
 * Positive control for the dependency filter below. "No edge resolved to the evidence port" is only
 * evidence of absence if the resolver would in fact name the evidence port that way; otherwise a
 * moved file or a changed resolver would turn A7/A12 into checks of nothing. This resolves a real
 * specifier — the one a module at `from` would have to write to reach the contract — and requires
 * the exact target string the filter compares against.
 */
function assertResolverNamesEvidencePort(from: string): void {
  const specifier = path.relative(path.dirname(from), path.join(rootDir, EVIDENCE_PORT)).split(path.sep).join("/")
  assert.ok(specifier.startsWith("."), `the control specifier must be relative, got ${specifier}`)
  assert.equal(resolveModuleTarget(rootDir, from, specifier), EVIDENCE_PORT,
    `the module resolver must name the evidence port as ${EVIDENCE_PORT} from ${path.relative(rootDir, from)}`)
}

async function parseEvidencePort() {
  const ts = await typescript()
  const source = await read(EVIDENCE_PORT)
  const sourceFile = ts.createSourceFile(EVIDENCE_PORT, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)
  return { ts, source, sourceFile }
}

function aliasOf(ts: TS, sourceFile: import("typescript").SourceFile, name: string): Alias {
  const alias = sourceFile.statements.find(
    (statement): statement is Alias => ts.isTypeAliasDeclaration(statement) && statement.name.text === name,
  )
  assert.ok(alias, `${EVIDENCE_PORT} must declare ${name} as a type alias`)
  return alias
}

/**
 * Field descriptors read off the AST. `readonly` and optionality are read from the modifiers and
 * the question token rather than from source text, so reformatting cannot change the result and a
 * dropped `readonly` cannot hide behind a comment.
 */
function fieldsOf(ts: TS, alias: Alias, sourceFile: import("typescript").SourceFile) {
  assert.ok(ts.isTypeLiteralNode(alias.type),
    `${alias.name.text} must be a plain object type literal — no intersection, no extends, no alias`)
  return alias.type.members.map((member) => {
    assert.ok(ts.isPropertySignature(member), `${alias.name.text} must contain only property signatures`)
    assert.ok(member.name !== undefined && ts.isIdentifier(member.name),
      `${alias.name.text} members must be plain identifiers — no index signature, no computed name`)
    assert.ok(member.type !== undefined, `${alias.name.text}.${member.name.text} must declare a type`)
    return {
      name: member.name.text,
      optional: member.questionToken !== undefined,
      readonly: (member.modifiers ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.ReadonlyKeyword),
      type: member.type.getText(sourceFile),
    }
  })
}

// ─── A1 — sole declaration authority ────────────────────────────────────────────

test("A1: the contract types are declared exactly once, at the evidence port", async () => {
  const ts = await typescript()
  const sites: string[] = []
  let scanned = 0
  for (const root of ["app", "scripts"]) {
    for (const file of await collectCodeFiles(path.join(rootDir, root))) {
      const relative = path.relative(rootDir, file)
      const source = await readFile(file, "utf8")
      scanned += 1
      const sourceFile = ts.createSourceFile(relative, source, ts.ScriptTarget.Latest, true, scriptKindFor(ts, relative))
      const declared = declaredNamesIn(ts, sourceFile)
      for (const symbol of CONTRACT_SYMBOLS) {
        if (declared.includes(symbol)) sites.push(`${relative} declares ${symbol}`)
      }
    }
  }
  // Non-vacuity: a sweep that found nothing to read proves nothing about what it did not find. The
  // port's own two declarations are the reader's positive control — a broken collector returns an
  // empty site list, which fails this comparison rather than passing it.
  assert.ok(scanned > 100, "the production sweep must not be vacuous")
  assert.deepEqual(sites.sort(), CONTRACT_SYMBOLS.map((s) => `${EVIDENCE_PORT} declares ${s}`).sort(),
    "each contract type must have exactly one production declaration site")
})

// ─── A1b — complete module surface ──────────────────────────────────────────────

/**
 * A1 proves the two contract names are declared nowhere else. A1b proves the converse, and it is
 * the stronger half: the port declares nothing else either. The module — not a list of known
 * symbols — is the closed contract surface.
 *
 * This matters because a symbol-name sweep can only reject what it was told to look for. A third
 * exported type, a second payload-bearing evidence shape, a private helper type and a reopenable
 * interface all evade a known-symbol sweep simply by being named something new; none of them
 * evades an exact statement census. The permitted surface is exactly one import declaration and
 * exactly the two exported contract aliases, so there is no fourth statement of any kind, exported
 * or not.
 */
const CONTRACT_TOP_LEVEL_KINDS = ["ImportDeclaration", "TypeAliasDeclaration", "TypeAliasDeclaration"]

test("A1b: the port's complete top-level surface is one import and exactly the two exported contract aliases", async () => {
  const { ts, sourceFile } = await parseEvidencePort()
  const statements = [...sourceFile.statements]

  assert.deepEqual(statements.map((statement) => ts.SyntaxKind[statement.kind]), CONTRACT_TOP_LEVEL_KINDS,
    `${EVIDENCE_PORT} must contain exactly one import and two type aliases, in that order, and no fourth statement`)

  // Spelled out per kind as well, so a failure names what arrived rather than only that something
  // did. `total` closes the census: with one import and two aliases there is no room for a
  // statement kind this list forgot to enumerate.
  assert.deepEqual({
    total: statements.length,
    imports: statements.filter(ts.isImportDeclaration).length,
    typeAliases: statements.filter(ts.isTypeAliasDeclaration).length,
    interfaces: statements.filter(ts.isInterfaceDeclaration).length,
    enums: statements.filter(ts.isEnumDeclaration).length,
    namespaces: statements.filter(ts.isModuleDeclaration).length,
    classes: statements.filter(ts.isClassDeclaration).length,
    functions: statements.filter(ts.isFunctionDeclaration).length,
    variables: statements.filter(ts.isVariableStatement).length,
    exportDeclarations: statements.filter(ts.isExportDeclaration).length,
    exportAssignments: statements.filter(ts.isExportAssignment).length,
  }, {
    total: 3,
    imports: 1,
    typeAliases: 2,
    interfaces: 0,
    enums: 0,
    namespaces: 0,
    classes: 0,
    functions: 0,
    variables: 0,
    exportDeclarations: 0,
    exportAssignments: 0,
  }, `${EVIDENCE_PORT}'s top-level statement census is pinned exactly`)

  const aliases = statements.filter(ts.isTypeAliasDeclaration)
  assert.deepEqual(aliases.map((alias) => alias.name.text), CONTRACT_SYMBOLS,
    "the two aliases are exactly the contract types — no third type, and no private helper type")
  for (const alias of aliases) {
    assert.ok((alias.modifiers ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword),
      `${alias.name.text} must be exported — the contract surface is public, and nothing else exists to be private`)
  }
})

// ─── A2 — type-only contract module ─────────────────────────────────────────────

test("A2: the evidence port declares no runtime value and its only dependency is erased", async () => {
  const { ts, source, sourceFile } = await parseEvidencePort()

  const runtime = sourceFile.statements.filter((statement) =>
    ts.isVariableStatement(statement) || ts.isFunctionDeclaration(statement)
    || ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement)
    || ts.isModuleDeclaration(statement) || ts.isExpressionStatement(statement))
  assert.deepEqual(runtime.map((statement) => statement.getText(sourceFile).slice(0, 60)), [],
    `${EVIDENCE_PORT} must declare no const, let, var, function, class or enum`)

  const imports = sourceFile.statements.filter(ts.isImportDeclaration)
  assert.equal(imports.length, 1, `${EVIDENCE_PORT} must have exactly one import`)
  assert.equal(imports[0].importClause?.isTypeOnly, true,
    "the NormalizedToolSignal dependency must be a type-only import")
  assert.equal((imports[0].moduleSpecifier as import("typescript").StringLiteral).text, "../toolSignal/types.ts")

  // The decisive check: what survives compilation. A type-only edge is erased, so the emitted
  // module must carry no dependency at all — this is what keeps the port a runtime leaf.
  // Comments are removed first: prose about imports is not an import.
  const emitted = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, removeComments: true },
  }).outputText
  // `export {};` is TypeScript's marker for a file whose every export was erased — it is the
  // proof of type-only-ness, not a dependency. It is removed before the dependency check so the
  // check cannot be satisfied by its presence or confused by it.
  const residue = emitted.replace(/export\s*\{\s*\}\s*;?/g, "").trim()
  assert.equal(/\b(?:import|require|export)\b/.test(residue), false,
    `${EVIDENCE_PORT} must emit no runtime module dependency, got:\n${emitted}`)
  assert.equal(residue, "", `${EVIDENCE_PORT} must emit no runtime code at all, got:\n${emitted}`)
})

// ─── A3 — exact AcquisitionEvidence shape ───────────────────────────────────────

const EVIDENCE_FIELDS = [
  { name: "providerObjectKey", optional: false, readonly: true, type: "string" },
  { name: "observedAt", optional: false, readonly: true, type: "string" },
  { name: "sourceEventAt", optional: false, readonly: true, type: "string | null" },
  { name: "contentDigest", optional: false, readonly: true, type: "string" },
]

test("A3: AcquisitionEvidence is exactly four required readonly fields, in order", async () => {
  const { ts, sourceFile } = await parseEvidencePort()
  const alias = aliasOf(ts, sourceFile, "AcquisitionEvidence")

  // deepEqual on the ordered descriptor list rejects every A3 case at once: an extra field, a
  // missing field, a reordering, an optional field, a dropped readonly and a changed type.
  assert.deepEqual(fieldsOf(ts, alias, sourceFile), EVIDENCE_FIELDS,
    "AcquisitionEvidence's field set, order, optionality, readonly-ness and types are all pinned")

  assert.equal(alias.typeParameters, undefined, "AcquisitionEvidence must not be generic")
  assert.equal(ts.isIntersectionTypeNode(alias.type), false, "AcquisitionEvidence must not be an intersection")
  assert.equal(ts.isTypeReferenceNode(alias.type), false, "AcquisitionEvidence must not alias another type")
  assert.deepEqual(sourceFile.statements.filter(ts.isInterfaceDeclaration), [],
    "no interface may be declared — an interface can be reopened and extended elsewhere")
})

// ─── A4 — exact observation envelope ────────────────────────────────────────────

test("A4: AcquiredSignalObservation is exactly the signal and its evidence", async () => {
  const { ts, sourceFile } = await parseEvidencePort()
  const alias = aliasOf(ts, sourceFile, "AcquiredSignalObservation")
  assert.deepEqual(fieldsOf(ts, alias, sourceFile), [
    { name: "signal", optional: false, readonly: true, type: "NormalizedToolSignal" },
    { name: "evidence", optional: false, readonly: true, type: "AcquisitionEvidence" },
  ], "the envelope is exactly two required readonly fields and no third")
  assert.equal(alias.typeParameters, undefined, "AcquiredSignalObservation must not be generic")
  assert.equal(ts.isTypeLiteralNode(alias.type), true, "the envelope must be a plain object type literal")
})

// ─── A5 — forbidden duplicate ownership ─────────────────────────────────────────

// Ownership is partitioned. These belong to NormalizedToolSignal, to a future canonical Source
// producer, or to SourceRecordV1 — never to the evidence envelope. Duplicating one "for
// convenience" creates a second place the same fact can be stated, and therefore disagree.
const FORBIDDEN_EVIDENCE_FIELDS = [
  "tenantId", "provider", "signalType", "title", "summary", "sourceUrl", "actor", "assignee",
  "repository", "priorityHint", "dueAt", "createdAt", "updatedAt",
  "declaredSourceRef", "recordedAt", "recordVersion",
]

test("A5: AcquisitionEvidence duplicates no signal, record or producer-owned field", async () => {
  const { ts, sourceFile } = await parseEvidencePort()
  const names = fieldsOf(ts, aliasOf(ts, sourceFile, "AcquisitionEvidence"), sourceFile).map((f) => f.name)
  // Non-vacuity: the intersection is empty because the guarded list is real, not because the
  // field list came back empty.
  assert.equal(names.length, EVIDENCE_FIELDS.length, "the evidence field list must be non-empty")
  assert.deepEqual(names.filter((name) => FORBIDDEN_EVIDENCE_FIELDS.includes(name)), [],
    "AcquisitionEvidence must not duplicate a field owned by another contract")
})

// ─── A6 — SourceRecord independence ─────────────────────────────────────────────

test("A6: the evidence port has no SourceRecord relationship and SourceRecord has no consumer", async () => {
  const { ts, sourceFile } = await parseEvidencePort()

  // Structural, not textual. The port's comments necessarily discuss SourceRecordV1 — explaining
  // that the two are unrelated is the whole point of the boundary note — so the check reads the
  // declared structure: every import specifier, and every field's declared type. Prose cannot
  // trip it, and an actual dependency cannot hide from it.
  const specifiers = sourceFile.statements.filter(ts.isImportDeclaration)
    .map((node) => (node.moduleSpecifier as import("typescript").StringLiteral).text)
  const declaredTypes = sourceFile.statements
    .filter(ts.isTypeAliasDeclaration)
    .flatMap((alias) => [
      alias.name.text,
      ...fieldsOf(ts, alias, sourceFile).flatMap((field) => [field.name, field.type]),
    ])
  // Non-vacuity: both lists are real, so an absent token is a real absence.
  assert.equal(specifiers.length, 1, "the import sweep must observe the port's one import")
  assert.ok(declaredTypes.length > 10, "the declared-type sweep must not be empty")

  for (const token of ["SourceRecord", "domain/source", "declaredSourceRef", "recordedAt"]) {
    assert.deepEqual(specifiers.filter((value) => value.includes(token)), [],
      `${EVIDENCE_PORT} must not import ${token}`)
    assert.deepEqual(declaredTypes.filter((value) => value.includes(token)), [],
      `${EVIDENCE_PORT} must declare no type or field referencing ${token}`)
  }

  const edges = await scanModuleGraph(rootDir, ["app", "scripts"])
  assert.ok(edges.length > 100, "the production scan must not be empty")
  const consumers = edges
    .filter((edge) => edge.resolvedTarget.startsWith("app/lib/domain/source/")
      && !edge.file.startsWith("app/lib/domain/source/"))
    .map((edge) => `${edge.file} -> ${edge.specifier}`)
  assert.deepEqual(consumers, [], `SOURCE_RECORD_CONSUMERS must stay 0:\n${consumers.join("\n")}`)
})

// ─── A7 — zero provider wiring ──────────────────────────────────────────────────

/**
 * PROVIDER_CONTRACT_DEPENDENCY_WIRING = 0. No current GitHub, Slack or Calendar production module
 * depends on the acquisition-evidence contract.
 *
 * That is the whole claim, and it is deliberately narrower than "no provider path can claim
 * conforming evidence". TypeScript is structurally typed; a provider could assemble an object with
 * the same four fields without importing anything, and no test can prevent that. What such an
 * object would not be is *authorized* conforming evidence — see the contract module's own note and
 * the suite header. Conformance is established by a reviewed provider identity and content-scope
 * profile, not by field shape, and no provider has one.
 *
 * So this proves the thing that is provable and load-bearing: the wiring is absent. It is read off
 * the resolved module graph, which covers every dependency syntax the scanner resolves — plain,
 * aliased, default, namespace, type-only, inline-type, side-effect, re-export, import-equals,
 * dynamic import, `require` and import-type expressions — and which, being a resolution rather than
 * a text match, is indifferent to how the specifier is spelled. A comment naming the contract is
 * not a dependency and must not fail here.
 */
test("A7: no provider production module depends on the acquisition-evidence contract", async () => {
  const providerFiles: string[] = []
  for (const root of PROVIDER_ROOTS) {
    const files = await collectCodeFiles(path.join(rootDir, root))
    // Non-vacuity, per provider: a renamed or moved provider directory must fail here rather than
    // silently turning this into a scan of nothing.
    assert.ok(files.length > 0, `${root} must contain scanned provider modules`)
    providerFiles.push(...files)
  }
  assertResolverNamesEvidencePort(providerFiles[0])

  const edges = await scanModuleGraph(rootDir, PROVIDER_ROOTS)
  // Non-vacuity: the provider modules really do have dependencies, so an empty contract-dependency
  // set is a fact about the contract and not about a scan that resolved nothing.
  assert.ok(edges.length > providerFiles.length, "the provider module-graph scan must not be vacuous")

  const dependencies = contractDependencies(edges).map(describeEdge)
  assert.deepEqual(dependencies, [],
    `PROVIDER_CONTRACT_DEPENDENCY_WIRING must stay 0:\n${dependencies.join("\n")}`)
})

// ─── A8 — NormalizedToolSignal unchanged ────────────────────────────────────────

test("A8: the 14-field signal contract is unchanged and its boundary suite still passes", async () => {
  const fixture = JSON.parse(await read(SIGNAL_CONTRACT_FIXTURE)) as {
    signalFields: Array<{ name: string; optional: boolean; type: string }>
  }
  assert.equal(fixture.signalFields.length, 14, "the pinned signal contract must still be 14 fields")

  const ts = await typescript()
  const signalSource = await read(SIGNAL_PORT)
  const signalFile = ts.createSourceFile(SIGNAL_PORT, signalSource, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)
  const signal = signalFile.statements.find(
    (statement): statement is Alias =>
      ts.isTypeAliasDeclaration(statement) && statement.name.text === "NormalizedToolSignal",
  )
  assert.ok(signal && ts.isTypeLiteralNode(signal.type), "NormalizedToolSignal must still be an object type literal")
  const observed = signal.type.members.map((member) => {
    assert.ok(ts.isPropertySignature(member) && member.name !== undefined && ts.isIdentifier(member.name))
    assert.ok(member.type !== undefined)
    return { name: member.name.text, optional: member.questionToken !== undefined, type: member.type.getText(signalFile) }
  })
  assert.deepEqual(observed, fixture.signalFields, "the signal's field set, order and types are unchanged")

  // Evidence lives in a separate envelope. None of the four evidence facts may leak into the signal.
  const signalNames = observed.map((field) => field.name)
  assert.deepEqual(EVIDENCE_FIELDS.map((f) => f.name).filter((name) => signalNames.includes(name)), [],
    "no acquisition-evidence field may be copied into NormalizedToolSignal")

  // Bound, not merely referenced: the boundary suite is executed, so this contract cannot be
  // reported as intact while the ratchet that protects the signal is failing.
  // NODE_TEST_CONTEXT is deleted from the child's environment: inherited, it puts the child into
  // the runner's child-process reporting protocol, and the TAP summary this test reads never
  // appears. The child then exits 0 having reported nothing, which is exactly the vacuous pass
  // the count assertion below exists to reject.
  const childEnv = { ...process.env }
  delete childEnv.NODE_TEST_CONTEXT
  const run = spawnSync(process.execPath, [
    "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "--test", "--experimental-strip-types", SIGNAL_BOUNDARY_SUITE,
  ], { cwd: rootDir, encoding: "utf8", env: childEnv })
  assert.equal(run.status, 0, `${SIGNAL_BOUNDARY_SUITE} must pass:\n${run.stdout}\n${run.stderr}`)
  // Non-vacuity: a run that executed nothing also exits 0. The binding is only meaningful if the
  // suite actually reported passing tests.
  const passed = Number(/^# pass (\d+)$/m.exec(run.stdout)?.[1] ?? 0)
  assert.ok(passed > 10, `${SIGNAL_BOUNDARY_SUITE} must report real passing tests, got ${passed}`)
})

// ─── A9 — all provider profiles remain unproven ─────────────────────────────────

const PROFILE_GATES = [
  "GitHub identity profile", "Slack identity profile", "Google Calendar identity profile",
  "GitHub content-scope profile", "Slack content-scope profile", "Google Calendar content-scope profile",
]
const GATE_STATE = "REQUIRED_UNPROVEN"
const FORBIDDEN_GATE_STATES = [
  /\bRATIFIED\b/, /\bPROVEN\b/, /\bCOMPLETE\b/, /\bDONE\b/, /\bSATISFIED\b/, /\bAUTHORIZED\b/,
]

test("A9: declaring the contract promoted no provider profile gate", async () => {
  const raw = await read(SEMANTICS_DOC)
  const lines = raw.split("\n")
  for (const gate of PROFILE_GATES) {
    const gateLines = lines.filter((line) => line.includes(gate) && line.includes("="))
    assert.equal(gateLines.length, 1, `${gate} must have exactly one gate line`)
    assert.ok(gateLines[0].includes(GATE_STATE), `${gate} must stay ${GATE_STATE}: ${gateLines[0]}`)
    // `UNPROVEN` contains `PROVEN`, so the state is removed before promotions are looked for.
    const withoutState = gateLines[0].split(GATE_STATE).join("")
    assert.deepEqual(FORBIDDEN_GATE_STATES.filter((p) => p.test(withoutState)).map(String), [],
      `${gate} must not be promoted: ${gateLines[0]}`)
  }

  // The contract must not assert a concrete provider identity field or content scope, which would
  // present a guess as a proven profile.
  const evidence = await read(EVIDENCE_PORT)
  for (const pattern of [/\bnode[_ ]?id\b/i, /\bdatabase id\b/i, /\bts tuple\b/i, /\bevent id tuple\b/i]) {
    assert.equal(pattern.test(evidence), false, `${EVIDENCE_PORT} must assert no provider identifier: ${pattern}`)
  }
  assert.ok(raw.includes("ACQUISITION_SCOPE_CHANGE_REQUIRED = YES"),
    "the declared contract does not by itself satisfy the acquisition scope change")
})

// ─── A10 — no digest implementation ─────────────────────────────────────────────

test("A10: the evidence port carries a digest and computes none", async () => {
  const source = await read(EVIDENCE_PORT)
  for (const token of [
    "node:crypto", 'from "crypto"', "require(\"crypto\")", "createHash", "subtle.digest", "subtle",
    "canonicalizeProviderContent", "JSON.stringify", "TextEncoder", "sha256(", "sha1(", "md5(",
  ]) {
    assert.equal(source.includes(token), false, `${EVIDENCE_PORT} must not contain ${token}`)
  }
  const { ts, sourceFile } = await parseEvidencePort()
  assert.deepEqual(sourceFile.statements.filter(ts.isFunctionDeclaration), [],
    "a digest constructor would have to arrive as a function; none may exist")
})

// ─── A11 — exact port-layer edge set ────────────────────────────────────────────

// Proven here as well as in the architecture suite, deliberately. The architectural exception was
// created for this contract, so it is part of this contract's own proof: the exception cannot be
// widened in the architecture suite alone without also failing here.
test("A11: the port layer's complete outbound edge set is exactly the one approved type edge", async () => {
  const edges = await scanModuleGraph(rootDir, ["app/lib/ports"])
  assert.deepEqual(edges.map((edge) => `${edge.file} | ${edge.kind} | ${edge.resolvedTarget}`).sort(),
    [APPROVED_PORT_EDGE],
    "exactly one port-to-port import-type edge: no second edge, no value edge, no other layer")
  assert.deepEqual(edges.filter((edge) => edge.file === SIGNAL_PORT), [],
    "the tool signal port must stay a leaf")
})

// ─── A12 — no consumer outside the ports layer ──────────────────────────────────

/**
 * ACQUISITION_CONTRACT_DEPENDENCY_WIRING = 0 outside `app/lib/ports/**`. Broader than A7: not the
 * three provider trees, but every production module under `app/**` and `scripts/**`.
 *
 * Same standard of proof, and the same deliberate limit. A dependency is forbidden; a textual
 * mention is irrelevant, and a module that happens to contain the words — in a comment, in a
 * document string, in an unrelated local identifier — does not fail. After this WorkUnit the
 * contract is declared and depended on by nothing.
 */
test("A12: no production module outside the ports layer depends on the acquisition-evidence contract", async () => {
  const outsidePorts = (await collectCodeFiles(path.join(rootDir, "app")))
    .filter((file) => !path.relative(rootDir, file).split(path.sep).join("/").startsWith(PORTS_LAYER))
  assert.ok(outsidePorts.length > 50, "the production sweep must observe real modules outside the ports layer")
  assertResolverNamesEvidencePort(outsidePorts[0])

  const edges = await scanModuleGraph(rootDir, ["app", "scripts"])
  assert.ok(edges.length > 100, "the production module-graph scan must not be vacuous")

  const consumers = contractDependencies(edges)
    .filter((edge) => !edge.file.startsWith(PORTS_LAYER))
    .map(describeEdge)
  assert.deepEqual(consumers, [],
    `PRODUCTION_CONTRACT_CONSUMERS_OUTSIDE_PORTS must stay 0:\n${consumers.join("\n")}`)
})
