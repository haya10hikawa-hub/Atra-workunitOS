/**
 * P1-1 acquisition-evidence contract suite.
 *
 * The contract is no longer inert: one real recorded provider source now travels through it to a
 * canonical `SourceRecordV1`. So the claim this suite protects has changed shape. It used to be
 * "nothing depends on this". It is now "exactly these two modules depend on this, and the contract
 * still cannot be widened, duplicated, or read as proving a provider profile it does not prove".
 *
 * A1–A5   the contract's exact shape, its sole declaration site and its complete module surface
 * A6      no SourceRecord relationship, and exactly one authorized record consumer
 * A7      provider wiring is exactly the one profiled provider
 * A8      NormalizedToolSignal is untouched and shares no field with evidence
 * A9–A10  only the profiled provider's gates moved, and the port still computes no digest
 * A11–A12 the port layer is a leaf again, and the contract's consumers are exactly two
 *
 * Structural throughout: every claim is read off the TypeScript AST or the resolved module graph,
 * never off source text, so a comment cannot satisfy a check the code does not — and, just as
 * importantly, a comment cannot fail a check the code does not violate. Naming the contract in
 * prose is not using it; depending on the module is.
 *
 * What this suite does NOT claim. TypeScript is structurally typed, so nothing here prevents some
 * other module from declaring an object of the same field shape. A structural lookalike is not
 * authorized conforming acquisition evidence, because shape alone establishes no provider-native
 * identity, no ratified identity or content-scope profile and no truthful B2-P1 digest evidence.
 * What is enforceable, and what is enforced here, is that the set of production modules depending
 * on this contract is exactly the reviewed pair, and that a third arrival fails until it is
 * reviewed and this ratchet is deliberately re-cut.
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

/** The GitHub acquisition adapter and the canonical producer. Exactly these, in sorted order. */
const GITHUB_ACQUISITION = "app/lib/infrastructure/external/github/recordedIssueCapture.ts"
const SOURCE_PRODUCER = "app/lib/application/source/sourceRecordProduction.ts"
const AUTHORIZED_CONTRACT_CONSUMERS = [GITHUB_ACQUISITION, SOURCE_PRODUCER].sort()

/**
 * The contract's complete declared surface, in declaration order.
 *
 * Pinned as an ordered list rather than a set: reordering a contract is a diff a reviewer should
 * see, and an added or removed alias must fail here regardless of what it is named.
 */
const CONTRACT_SYMBOLS = [
  "AcquisitionCaptureId", "AcquisitionTenantPartition", "AcquisitionMode",
  "RetainedProviderContent", "ContentScopeBinding", "ProviderIdentityProvenance",
  "AcquisitionCapture", "AcquisitionEvidence",
]

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
  // port's own declarations are the reader's positive control — a broken collector returns an
  // empty site list, which fails this comparison rather than passing it.
  assert.ok(scanned > 100, "the production sweep must not be vacuous")
  assert.deepEqual(sites.sort(), CONTRACT_SYMBOLS.map((s) => `${EVIDENCE_PORT} declares ${s}`).sort(),
    "each contract type must have exactly one production declaration site")
})

// ─── A1b — complete module surface ──────────────────────────────────────────────

/**
 * A1 proves the contract names are declared nowhere else. A1b proves the converse, and it is the
 * stronger half: the port declares nothing else either. The module — not a list of known symbols —
 * is the closed contract surface.
 *
 * A symbol-name sweep can only reject what it was told to look for. A ninth exported type, a second
 * payload-bearing evidence shape, a private helper type and a reopenable interface all evade a
 * known-symbol sweep simply by being named something new; none of them evades an exact statement
 * census. The permitted surface is exactly the eight exported aliases and nothing else — no import
 * among them, because the port is a graph leaf again.
 */
test("A1b: the port's complete top-level surface is exactly the eight exported contract aliases", async () => {
  const { ts, sourceFile } = await parseEvidencePort()
  const statements = [...sourceFile.statements]

  assert.deepEqual(statements.map((statement) => ts.SyntaxKind[statement.kind]),
    CONTRACT_SYMBOLS.map(() => "TypeAliasDeclaration"),
    `${EVIDENCE_PORT} must contain exactly the contract aliases and no other statement`)

  // Spelled out per kind as well, so a failure names what arrived rather than only that something
  // did. `total` closes the census: with eight aliases and nothing else there is no room for a
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
    total: CONTRACT_SYMBOLS.length,
    imports: 0,
    typeAliases: CONTRACT_SYMBOLS.length,
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
    "the aliases are exactly the contract types, in order — no extra type, and no private helper type")
  for (const alias of aliases) {
    assert.ok((alias.modifiers ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword),
      `${alias.name.text} must be exported — the contract surface is public, and nothing else exists to be private`)
  }
})

// ─── A2 — type-only contract module ─────────────────────────────────────────────

test("A2: the evidence port declares no runtime value and depends on nothing", async () => {
  const { ts, source, sourceFile } = await parseEvidencePort()

  const runtime = sourceFile.statements.filter((statement) =>
    ts.isVariableStatement(statement) || ts.isFunctionDeclaration(statement)
    || ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement)
    || ts.isModuleDeclaration(statement) || ts.isExpressionStatement(statement))
  assert.deepEqual(runtime.map((statement) => statement.getText(sourceFile).slice(0, 60)), [],
    `${EVIDENCE_PORT} must declare no const, let, var, function, class or enum`)

  // The first shape of this contract paired evidence with a NormalizedToolSignal and therefore had
  // one type-only import. Removing that pairing removed the edge; the port is a leaf again, and an
  // import of any kind returning here is the visible signal that the pairing came back.
  assert.deepEqual(sourceFile.statements.filter(ts.isImportDeclaration), [],
    `${EVIDENCE_PORT} must import nothing at all`)

  // The decisive check: what survives compilation. Comments are removed first, because prose about
  // imports is not an import.
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

// ─── A3 — exact AcquisitionCapture shape ────────────────────────────────────────

const CAPTURE_FIELDS = [
  { name: "kind", optional: false, readonly: true, type: '"CAPTURE"' },
  { name: "captureId", optional: false, readonly: true, type: "AcquisitionCaptureId" },
  { name: "tenantPartition", optional: false, readonly: true, type: "AcquisitionTenantPartition" },
  { name: "acquisitionMode", optional: false, readonly: true, type: "AcquisitionMode" },
  { name: "identity", optional: false, readonly: true, type: "ProviderIdentityProvenance" },
  { name: "retainedContent", optional: false, readonly: true, type: "RetainedProviderContent" },
  { name: "contentScope", optional: false, readonly: true, type: "ContentScopeBinding" },
  { name: "observedAt", optional: false, readonly: true, type: "string" },
  { name: "sourceEventAt", optional: false, readonly: true, type: "string | null" },
]

test("A3: AcquisitionCapture is exactly nine required readonly fields, in order", async () => {
  const { ts, sourceFile } = await parseEvidencePort()
  const alias = aliasOf(ts, sourceFile, "AcquisitionCapture")

  // deepEqual on the ordered descriptor list rejects every A3 case at once: an extra field, a
  // missing field, a reordering, an optional field, a dropped readonly and a changed type.
  assert.deepEqual(fieldsOf(ts, alias, sourceFile), CAPTURE_FIELDS,
    "AcquisitionCapture's field set, order, optionality, readonly-ness and types are all pinned")

  assert.equal(alias.typeParameters, undefined, "AcquisitionCapture must not be generic")
  assert.equal(ts.isIntersectionTypeNode(alias.type), false, "AcquisitionCapture must not be an intersection")
  assert.deepEqual(sourceFile.statements.filter(ts.isInterfaceDeclaration), [],
    "no interface may be declared — an interface can be reopened and extended elsewhere")

  // `recordedAt` is absent, and its absence is the contract: recording is the producer's act, and a
  // slot for it here would invite acquisition to state a time it does not own.
  assert.deepEqual(CAPTURE_FIELDS.map((field) => field.name).filter((name) => name === "recordedAt"), [],
    "acquisition must have no recordedAt slot")
})

// ─── A4 — exact component shapes ────────────────────────────────────────────────

test("A4: every component of a capture is pinned, including the two closed unions", async () => {
  const { ts, sourceFile } = await parseEvidencePort()

  assert.deepEqual(fieldsOf(ts, aliasOf(ts, sourceFile, "ProviderIdentityProvenance"), sourceFile), [
    { name: "providerNamespace", optional: false, readonly: true, type: "string" },
    { name: "providerObjectKey", optional: false, readonly: true, type: "string" },
    { name: "identityProfileId", optional: false, readonly: true, type: "string" },
    { name: "identityProfileVersion", optional: false, readonly: true, type: "string" },
  ], "identity provenance carries the key and the profile version it is admissible under")

  assert.deepEqual(fieldsOf(ts, aliasOf(ts, sourceFile, "ContentScopeBinding"), sourceFile), [
    { name: "contentScopeProfileId", optional: false, readonly: true, type: "string" },
    { name: "contentScopeProfileVersion", optional: false, readonly: true, type: "string" },
    { name: "contentDigest", optional: false, readonly: true, type: "string" },
  ], "a digest is comparable only within a profile version, so the version travels with it")

  // Retention: inline bytes only. A locator arm would be the point at which a pointer whose target
  // can change could stand in for retained content, so it is absent until a retention store exists.
  assert.deepEqual(fieldsOf(ts, aliasOf(ts, sourceFile, "RetainedProviderContent"), sourceFile), [
    { name: "retention", optional: false, readonly: true, type: '"INLINE_BYTES"' },
    { name: "bytesBase64", optional: false, readonly: true, type: "string" },
  ], "retention is inline bytes only")

  // The acquisition mode union is the authorization surface: no fixture mode, and no live mode.
  const mode = aliasOf(ts, sourceFile, "AcquisitionMode")
  const modes = ts.isUnionTypeNode(mode.type)
    ? mode.type.types.map((node) => node.getText(sourceFile))
    : [mode.type.getText(sourceFile)]
  assert.deepEqual(modes, ['"HUMAN_TRIGGERED_PROVIDER_EXPORT"'],
    "exactly one acquisition mode is authorized; widening it must be a visible contract change")
  for (const forbidden of [/FIXTURE/i, /LIVE/i, /SYNTHETIC/i, /SEED/i, /MOCK/i]) {
    assert.equal(forbidden.test(modes.join(" ")), false, `no acquisition mode may match ${forbidden}`)
  }

  // The two brands exist to stop assignment in the wrong direction: a source identity must not be
  // assignable to a capture id, and an unvalidated projection string must not be assignable to a
  // tenant partition.
  for (const brand of ["AcquisitionCaptureId", "AcquisitionTenantPartition"]) {
    const alias = aliasOf(ts, sourceFile, brand)
    assert.equal(ts.isIntersectionTypeNode(alias.type), true, `${brand} must stay a branded intersection`)
    assert.equal(alias.type.getText(sourceFile).startsWith("string &"), true,
      `${brand} must brand a string rather than replace it`)
  }

  // The boundary union has exactly one arm today. It is named separately so a second form of
  // evidence — a replay above all — has to arrive here, in a reviewable diff.
  const evidence = aliasOf(ts, sourceFile, "AcquisitionEvidence")
  assert.equal(evidence.type.getText(sourceFile), "AcquisitionCapture",
    "AcquisitionEvidence is exactly a capture until a second evidence form is reviewed")
})

// ─── A5 — forbidden duplicate ownership ─────────────────────────────────────────

// Ownership is partitioned. These belong to NormalizedToolSignal, to the canonical Source producer,
// or to SourceRecordV1 — never to a capture. Duplicating one "for convenience" creates a second
// place the same fact can be stated, and therefore disagree.
const FORBIDDEN_EVIDENCE_FIELDS = [
  "tenantId", "provider", "signalType", "title", "summary", "sourceUrl", "actor", "assignee",
  "repository", "priorityHint", "dueAt", "createdAt", "updatedAt",
  "declaredSourceRef", "recordedAt", "recordVersion",
]

test("A5: no contract type duplicates a signal-, record- or producer-owned field", async () => {
  const { ts, sourceFile } = await parseEvidencePort()
  const objectAliases = ["AcquisitionCapture", "ProviderIdentityProvenance", "ContentScopeBinding",
    "RetainedProviderContent"]
  const names = objectAliases.flatMap((name) =>
    fieldsOf(ts, aliasOf(ts, sourceFile, name), sourceFile).map((field) => field.name))
  // Non-vacuity: the intersection is empty because the guarded list is real, not because the field
  // list came back empty.
  assert.ok(names.length > 15, "the contract field sweep must be non-empty")
  assert.deepEqual(names.filter((name) => FORBIDDEN_EVIDENCE_FIELDS.includes(name)), [],
    "the acquisition contract must not duplicate a field owned by another contract")
})

// ─── A6 — SourceRecord independence, and exactly one record consumer ────────────

test("A6: the evidence port has no SourceRecord relationship and the record has one consumer", async () => {
  const { ts, sourceFile } = await parseEvidencePort()

  // Structural, not textual. The port's comments necessarily discuss SourceRecordV1 — explaining
  // that the two are unrelated is the whole point of the boundary note — so the check reads the
  // declared structure: every import specifier, and every field's declared type. Prose cannot trip
  // it, and an actual dependency cannot hide from it.
  const specifiers = sourceFile.statements.filter(ts.isImportDeclaration)
    .map((node) => (node.moduleSpecifier as import("typescript").StringLiteral).text)
  const declaredTypes = sourceFile.statements
    .filter(ts.isTypeAliasDeclaration)
    .flatMap((alias) => [
      alias.name.text,
      ...(ts.isTypeLiteralNode(alias.type)
        ? fieldsOf(ts, alias, sourceFile).flatMap((field) => [field.name, field.type])
        : [alias.type.getText(sourceFile)]),
    ])
  // Non-vacuity: the declared-type list is real, so an absent token is a real absence.
  assert.deepEqual(specifiers, [], "the port must have no import specifier at all")
  assert.ok(declaredTypes.length > 20, "the declared-type sweep must not be empty")

  for (const token of ["SourceRecord", "domain/source", "declaredSourceRef", "recordedAt"]) {
    assert.deepEqual(declaredTypes.filter((value) => value.includes(token)), [],
      `${EVIDENCE_PORT} must declare no type or field referencing ${token}`)
  }

  // The canonical record now has a production consumer, and exactly one: the producer. The domain
  // module's own files are excluded, as ever. A second consumer — a route, a repository, a UI
  // projection — must fail here until it is reviewed.
  const edges = await scanModuleGraph(rootDir, ["app", "scripts"])
  assert.ok(edges.length > 100, "the production scan must not be empty")
  const consumers = [...new Set(edges
    .filter((edge) => edge.resolvedTarget.startsWith("app/lib/domain/source/")
      && !edge.file.startsWith("app/lib/domain/source/"))
    .map((edge) => edge.file))].sort()
  assert.deepEqual(consumers, [SOURCE_PRODUCER],
    `the canonical record's only production consumer is its producer:\n${consumers.join("\n")}`)
})

// ─── A7 — provider wiring is exactly the profiled provider ──────────────────────

/**
 * Provider wiring is now non-zero, and the claim is an exact set rather than an absence: the GitHub
 * acquisition adapter depends on the contract because a reviewed GitHub issue profile exists. Slack
 * and Calendar have no proven profile, so a dependency from either is a defect, and so is a second
 * GitHub module arriving without review.
 *
 * Read off the resolved module graph, which covers every dependency syntax the scanner resolves —
 * plain, aliased, default, namespace, type-only, inline-type, side-effect, re-export,
 * import-equals, dynamic import, `require` and import-type expressions — and which, being a
 * resolution rather than a text match, is indifferent to how the specifier is spelled. A comment
 * naming the contract is not a dependency and must not fail here.
 */
test("A7: the only provider module wired to the contract is the profiled GitHub adapter", async () => {
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
  // Non-vacuity: the provider modules really do have dependencies, so the contract-dependency set
  // is a fact about the contract and not about a scan that resolved nothing.
  assert.ok(edges.length > providerFiles.length, "the provider module-graph scan must not be vacuous")

  const wired = [...new Set(contractDependencies(edges).map((edge) => edge.file))].sort()
  assert.deepEqual(wired, [GITHUB_ACQUISITION],
    `provider wiring is exactly the profiled GitHub adapter:\n${contractDependencies(edges).map(describeEdge).join("\n")}`)

  // The unproven providers stay unwired, stated separately so a failure names the provider.
  for (const provider of ["slack", "calendar"]) {
    const offenders = contractDependencies(edges)
      .filter((edge) => edge.file.includes(`/external/${provider}/`))
      .map(describeEdge)
    assert.deepEqual(offenders, [], `${provider} has no proven profile and must stay unwired`)
  }
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

  // Evidence lives in a separate envelope. No capture-owned fact may leak into the signal.
  const signalNames = observed.map((field) => field.name)
  const evidenceOwned = ["captureId", "tenantPartition", "acquisitionMode", "identity",
    "retainedContent", "contentScope", "observedAt", "sourceEventAt"]
  assert.deepEqual(evidenceOwned.filter((name) => signalNames.includes(name)), [],
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

// ─── A9 — only the reviewed provider's gates moved ──────────────────────────────

/**
 * Two gates moved, for one provider resource, on the strength of a reviewed profile. Every other
 * gate must stay `REQUIRED_UNPROVEN`, and the moved pair must stay scoped to GitHub issues: a gate
 * that quietly widens from "GitHub issues" to "GitHub" is the same defect as one that promotes
 * itself out of `REQUIRED_UNPROVEN` without a profile.
 */
const UNPROVEN_GATES = [
  "GitHub identity profile, other resources", "Slack identity profile", "Google Calendar identity profile",
  "GitHub content-scope profile, other resources", "Slack content-scope profile",
  "Google Calendar content-scope profile",
]
// Only ONE of the two moved gates is proven. Identity is not: it carries a PM-accepted Phase-1
// exception over five unproven requirements, so it must read the scoped state and must not read
// `PROVEN`. Listing it here as proven would be the false-proof claim this suite is meant to catch.
const PROVEN_GATES = ["GitHub issue content-scope profile"]
const SCOPED_EXCEPTION_GATE = "GitHub issue identity profile"
const SCOPED_EXCEPTION_STATE = "PHASE1_SCOPED_ACCEPTED_WITH_UNPROVEN_RESIDUAL"
const GATE_STATE = "REQUIRED_UNPROVEN"
const FORBIDDEN_GATE_STATES = [
  /\bRATIFIED\b/, /\bPROVEN\b/, /\bCOMPLETE\b/, /\bDONE\b/, /\bSATISFIED\b/, /\bAUTHORIZED\b/,
]

test("A9: only the reviewed GitHub issue gates moved, and the profile doc backs them", async () => {
  const raw = await read(SEMANTICS_DOC)
  const lines = raw.split("\n")
  for (const gate of UNPROVEN_GATES) {
    const gateLines = lines.filter((line) => line.includes(gate) && line.includes("="))
    assert.equal(gateLines.length, 1, `${gate} must have exactly one gate line`)
    assert.ok(gateLines[0].includes(GATE_STATE), `${gate} must stay ${GATE_STATE}: ${gateLines[0]}`)
    // `UNPROVEN` contains `PROVEN`, so the state is removed before promotions are looked for.
    const withoutState = gateLines[0].split(GATE_STATE).join("")
    assert.deepEqual(FORBIDDEN_GATE_STATES.filter((p) => p.test(withoutState)).map(String), [],
      `${gate} must not be promoted: ${gateLines[0]}`)
  }
  for (const gate of PROVEN_GATES) {
    const gateLines = lines.filter((line) => line.includes(gate) && line.includes("="))
    assert.equal(gateLines.length, 1, `${gate} must have exactly one gate line`)
    assert.ok(/=\s*PROVEN\b/.test(gateLines[0]), `${gate} must read PROVEN: ${gateLines[0]}`)
  }

  const identityGate = lines.filter(
    (line) => line.includes(SCOPED_EXCEPTION_GATE) && line.includes("="))
  assert.equal(identityGate.length, 1, `${SCOPED_EXCEPTION_GATE} must have exactly one gate line`)
  assert.ok(new RegExp(`=\\s*${SCOPED_EXCEPTION_STATE}\\b`).test(identityGate[0]),
    `${SCOPED_EXCEPTION_GATE} must read ${SCOPED_EXCEPTION_STATE}: ${identityGate[0]}`)
  assert.equal(/=\s*PROVEN\b/.test(identityGate[0]), false,
    `${SCOPED_EXCEPTION_GATE} must not be promoted to PROVEN: ${identityGate[0]}`)

  // A moved gate is only as good as the profile behind it. The profile document must exist, must
  // scope itself to issues, and must name the exact profile identifiers the code uses. For the
  // identity half it must also carry the scoped state and the residuals, so the acceptance cannot
  // be read anywhere as a proof.
  const profile = await read("docs/architecture/GITHUB_ISSUE_ACQUISITION_PROFILE.md")
  for (const required of [
    "github.issue.rest.database-primary-key", "github.issue.rest.retained-response-body",
    "github.com/rest/issues", "Identifies the primary key from the database",
    "GitHub issues only", SCOPED_EXCEPTION_STATE,
    "REST issue `id` lifetime immutability",
    "non-reuse of a REST issue `id` after deletion",
    "persistence of a REST issue `id` across repository transfer",
    "provider-backed collision guarantee for github.com/rest/issues",
    "normative REST `id` = GraphQL `databaseId` equivalence",
  ]) {
    assert.ok(profile.includes(required), `the profile document must record ${required}`)
  }

  // The contract module itself still asserts no provider identifier: naming one there would present
  // a guess as a proven profile for every provider at once.
  const evidence = await read(EVIDENCE_PORT)
  for (const pattern of [/\bnode[_ ]?id\b/i, /\bdatabase id\b/i, /\bts tuple\b/i, /\bevent id tuple\b/i]) {
    assert.equal(pattern.test(evidence), false, `${EVIDENCE_PORT} must assert no provider identifier: ${pattern}`)
  }
})

// ─── A10 — no digest implementation at the contract ─────────────────────────────

test("A10: the evidence port carries a digest and computes none", async () => {
  const source = await read(EVIDENCE_PORT)
  for (const token of [
    "node:crypto", 'from "crypto"', "require(\"crypto\")", "createHash", "subtle.digest", "subtle",
    "JSON.stringify", "TextEncoder", "sha256(", "sha1(", "md5(",
  ]) {
    assert.equal(source.includes(token), false, `${EVIDENCE_PORT} must not contain ${token}`)
  }
  const { ts, sourceFile } = await parseEvidencePort()
  assert.deepEqual(sourceFile.statements.filter(ts.isFunctionDeclaration), [],
    "a digest constructor would have to arrive as a function; none may exist")
})

// ─── A11 — exact port-layer edge set ────────────────────────────────────────────

// Proven here as well as in the architecture suite, deliberately. The layer's edge set is part of
// this contract's own proof: it cannot be widened in the architecture suite alone without also
// failing here.
test("A11: the port layer has no outbound edge at all", async () => {
  const edges = await scanModuleGraph(rootDir, ["app/lib/ports"])
  const portFiles = await collectCodeFiles(path.join(rootDir, "app/lib/ports"))
  // Non-vacuity: an empty edge set proves nothing unless the layer actually contains code.
  assert.ok(portFiles.length >= 2, "the ports layer must contain scanned modules")
  assert.deepEqual(edges.map((edge) => `${edge.file} | ${edge.kind} | ${edge.resolvedTarget}`).sort(), [],
    "every port module is a graph leaf: no port-to-port edge, no value edge, no other layer")
})

// ─── A12 — the contract's consumers are exactly two ─────────────────────────────

/**
 * The contract's complete production dependency set, across every module under `app/**` and
 * `scripts/**`: the GitHub acquisition adapter and the canonical producer, and nothing else.
 *
 * A dependency is what counts; a textual mention is irrelevant, and a module that happens to
 * contain the words — in a comment, in a document string, in an unrelated local identifier — does
 * not fail. A third consumer is the arrival this ratchet exists to stop, whether it is a route, a
 * repository, a UI projection or a second provider adapter.
 */
test("A12: the contract's production consumers are exactly the reviewed pair", async () => {
  const outsidePorts = (await collectCodeFiles(path.join(rootDir, "app")))
    .filter((file) => !path.relative(rootDir, file).split(path.sep).join("/").startsWith(PORTS_LAYER))
  assert.ok(outsidePorts.length > 50, "the production sweep must observe real modules outside the ports layer")
  assertResolverNamesEvidencePort(outsidePorts[0])

  const edges = await scanModuleGraph(rootDir, ["app", "scripts"])
  assert.ok(edges.length > 100, "the production module-graph scan must not be vacuous")

  const consumers = [...new Set(contractDependencies(edges)
    .filter((edge) => !edge.file.startsWith(PORTS_LAYER))
    .map((edge) => edge.file))].sort()
  assert.deepEqual(consumers, AUTHORIZED_CONTRACT_CONSUMERS,
    `the acquisition contract's consumers are pinned:\n${consumers.join("\n")}`)
})
