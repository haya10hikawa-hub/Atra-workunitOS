/**
 * P1-1 acquisition-evidence contract suite — revised contract.
 *
 * This WorkUnit revises a neutral contract and nothing else. The hard part is not declaring it —
 * it is proving that declaring it changed no capability, and that the revision actually closed the
 * defect it was called for. A contract type is exactly the kind of artifact whose meaning decays
 * quietly: it can be extended a field at a time, wired into a provider that cannot honour it, or
 * read as evidence that a provider profile was proven. Every assertion below pins one way that
 * could happen.
 *
 * A1–A2    the port's complete module surface, its sole declaration site, and its type-only-ness
 * A3–A4    the exact shape of the capture and of the replay
 * A5       no field owned by another contract, and no evaluation metadata anywhere
 * A6       no SourceRecord relationship, and no SourceRecord consumer
 * A7       no provider module depends on the contract
 * A8       NormalizedToolSignal is untouched, and nothing here depends on it
 * A9–A10   no profile is proven, no provider vocabulary is asserted, no digest is computed
 * A11–A12  the port layer is edge-free, and nothing outside it consumes the contract
 * A13      retained provider content is structurally required
 * A14      capture and replay are structurally distinct
 * A15      the acquisition mode union is closed and excludes live and fixture acquisition
 * A16      capture identity and tenant partition are branded, not bare strings
 * A17      the separations above hold under the type checker, not only in the AST
 *
 * Structural throughout: every claim is read off the TypeScript AST, the resolved module graph, or
 * a real type-check — never off source text, so a comment cannot satisfy a check the code does not
 * and cannot fail a check the code does not violate. Naming the contract in prose is not using it;
 * depending on the module is.
 *
 * What this suite does NOT claim. It does not prove provider authenticity, and no test of it could.
 * TypeScript is structurally typed, so nothing here prevents some other module from declaring an
 * object of the same field shape. That is intentional and stated as such: a structural lookalike is
 * not authorized conforming acquisition evidence, because shape alone establishes no provider-native
 * identity, no ratified identity or content-scope profile, and no proof that retained bytes came
 * from a provider. What is enforceable, and what is enforced here, is that no production module
 * outside the ports layer — and no provider module at all — has a dependency on this contract.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFile, readdir } from "node:fs/promises"
import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
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

/** The complete contract surface, in declaration order. */
const CONTRACT_SYMBOLS = [
  "AcquisitionCaptureId",
  "AcquisitionTenantPartition",
  "AcquisitionMode",
  "RetainedProviderContent",
  "ContentScopeBinding",
  "ProviderIdentityProvenance",
  "AcquisitionCapture",
  "AcquisitionCaptureReplay",
  "AcquisitionEvidence",
]

/**
 * Retired by this revision. The first contract paired evidence with a `NormalizedToolSignal`, which
 * made the projection the most available digest subject and identity source — the structural root
 * of the defect the revision exists to close. Both names must stay gone, or the superseded shape
 * comes back beside its replacement and a producer may pick either.
 */
const RETIRED_CONTRACT_SYMBOLS = ["AcquiredSignalObservation"]

const PROVIDER_ROOTS = ["github", "slack", "calendar"]
  .map((provider) => `app/lib/infrastructure/external/${provider}`)

type TS = typeof import("typescript")
type Alias = import("typescript").TypeAliasDeclaration
type TypeLiteral = import("typescript").TypeLiteralNode

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
function membersOf(ts: TS, literal: TypeLiteral, label: string, sourceFile: import("typescript").SourceFile) {
  return literal.members.map((member) => {
    assert.ok(ts.isPropertySignature(member), `${label} must contain only property signatures`)
    assert.ok(member.name !== undefined && ts.isIdentifier(member.name),
      `${label} members must be plain identifiers — no index signature, no computed name`)
    assert.ok(member.type !== undefined, `${label}.${member.name.text} must declare a type`)
    return {
      name: member.name.text,
      optional: member.questionToken !== undefined,
      readonly: (member.modifiers ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.ReadonlyKeyword),
      type: member.type.getText(sourceFile),
    }
  })
}

function objectAliasMembers(ts: TS, sourceFile: import("typescript").SourceFile, name: string) {
  const alias = aliasOf(ts, sourceFile, name)
  assert.ok(ts.isTypeLiteralNode(alias.type),
    `${name} must be a plain object type literal — no intersection, no extends, no alias`)
  assert.equal(alias.typeParameters, undefined, `${name} must not be generic`)
  return membersOf(ts, alias.type, name, sourceFile)
}

/** Every property name declared anywhere in the module, at any nesting depth. */
function allPropertyNames(ts: TS, sourceFile: import("typescript").SourceFile): string[] {
  const names: string[] = []
  const visit = (node: import("typescript").Node) => {
    if (ts.isPropertySignature(node) && node.name !== undefined && ts.isIdentifier(node.name)) {
      names.push(node.name.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return names
}

/** Every string-literal type declared anywhere in the module. */
function allStringLiteralTypes(ts: TS, sourceFile: import("typescript").SourceFile): string[] {
  const values: string[] = []
  const visit = (node: import("typescript").Node) => {
    if (ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal)) values.push(node.literal.text)
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return values
}

function unionMembers(ts: TS, alias: Alias, sourceFile: import("typescript").SourceFile) {
  assert.ok(ts.isUnionTypeNode(alias.type), `${alias.name.text} must be a union type`)
  return alias.type.types.map((node) => ({ node, text: node.getText(sourceFile) }))
}

// ─── A1 — sole declaration authority and complete module surface ────────────────

test("A1: the contract types are declared exactly once, at the evidence port, and the retired ones nowhere", async () => {
  const ts = await typescript()
  const sites: string[] = []
  const retired: string[] = []
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
      for (const symbol of RETIRED_CONTRACT_SYMBOLS) {
        if (declared.includes(symbol)) retired.push(`${relative} declares ${symbol}`)
      }
    }
  }
  // Non-vacuity: a sweep that found nothing to read proves nothing about what it did not find. The
  // port's own declarations are the reader's positive control — a broken collector returns an
  // empty site list, which fails this comparison rather than passing it.
  assert.ok(scanned > 100, "the production sweep must not be vacuous")
  assert.deepEqual(sites.sort(), CONTRACT_SYMBOLS.map((s) => `${EVIDENCE_PORT} declares ${s}`).sort(),
    "each contract type must have exactly one production declaration site")
  assert.deepEqual(retired, [],
    `the superseded contract types must not be redeclared anywhere:\n${retired.join("\n")}`)
})

/**
 * A1 proves the contract names are declared nowhere else. A1b proves the converse, and it is the
 * stronger half: the port declares nothing else either. The module — not a list of known symbols —
 * is the closed contract surface.
 *
 * This matters because a symbol-name sweep can only reject what it was told to look for. A tenth
 * exported type, a second payload-bearing evidence shape, a private helper type and a reopenable
 * interface all evade a known-symbol sweep simply by being named something new; none of them evades
 * an exact statement census. The permitted surface is exactly the nine exported contract aliases,
 * in order, so there is no tenth statement of any kind, exported or not — and, now that the
 * projection dependency is retired, no import either.
 */
test("A1b: the port's complete top-level surface is exactly the nine exported contract aliases", async () => {
  const { ts, sourceFile } = await parseEvidencePort()
  const statements = [...sourceFile.statements]

  assert.deepEqual(statements.map((statement) => ts.SyntaxKind[statement.kind]),
    CONTRACT_SYMBOLS.map(() => "TypeAliasDeclaration"),
    `${EVIDENCE_PORT} must contain exactly ${CONTRACT_SYMBOLS.length} type aliases and no other statement`)

  // Spelled out per kind as well, so a failure names what arrived rather than only that something
  // did. `total` closes the census: with nine aliases and nothing else there is no room for a
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
    total: 9,
    imports: 0,
    typeAliases: 9,
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
    assert.equal(alias.typeParameters, undefined, `${alias.name.text} must not be generic`)
  }
})

// ─── A2 — type-only, dependency-free contract module ────────────────────────────

test("A2: the evidence port declares no runtime value and depends on nothing at all", async () => {
  const { ts, source, sourceFile } = await parseEvidencePort()

  const runtime = sourceFile.statements.filter((statement) =>
    ts.isVariableStatement(statement) || ts.isFunctionDeclaration(statement)
    || ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement)
    || ts.isModuleDeclaration(statement) || ts.isExpressionStatement(statement))
  assert.deepEqual(runtime.map((statement) => statement.getText(sourceFile).slice(0, 60)), [],
    `${EVIDENCE_PORT} must declare no const, let, var, function, class or enum`)

  // The revision removed the contract's one dependency along with the projection pairing that
  // needed it. The module is a graph leaf again, which is the strongest form this can take: not
  // "its only edge is erased", but "it has no edge".
  assert.deepEqual(sourceFile.statements.filter(ts.isImportDeclaration), [],
    `${EVIDENCE_PORT} must import nothing at all`)

  // The decisive check: what survives compilation. Comments are removed first: prose about imports
  // is not an import.
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

// ─── A3 — exact capture shape ───────────────────────────────────────────────────

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

  // deepEqual on the ordered descriptor list rejects every A3 case at once: an extra field, a
  // missing field, a reordering, an optional field, a dropped readonly and a changed type.
  assert.deepEqual(objectAliasMembers(ts, sourceFile, "AcquisitionCapture"), CAPTURE_FIELDS,
    "AcquisitionCapture's field set, order, optionality, readonly-ness and types are all pinned")

  // C5: `recordedAt` is not acquisition-owned, so the capture has no slot for it to be stated in.
  assert.deepEqual(CAPTURE_FIELDS.filter((field) => field.name === "recordedAt"), [],
    "recordedAt belongs to a later producer and must have no slot on the capture")

  assert.deepEqual(sourceFile.statements.filter(ts.isInterfaceDeclaration), [],
    "no interface may be declared — an interface can be reopened and extended elsewhere")

  // The two component contracts the capture composes are pinned in the same breath, or the capture
  // could be hollowed out one nested type at a time while its own field list stayed intact.
  assert.deepEqual(objectAliasMembers(ts, sourceFile, "ContentScopeBinding"), [
    { name: "contentScopeProfileId", optional: false, readonly: true, type: "string" },
    { name: "contentScopeProfileVersion", optional: false, readonly: true, type: "string" },
    { name: "contentDigest", optional: false, readonly: true, type: "string" },
  ], "C3: the content-scope binding is exactly a profile identity, its version, and the digest")

  assert.deepEqual(objectAliasMembers(ts, sourceFile, "ProviderIdentityProvenance"), [
    { name: "providerNamespace", optional: false, readonly: true, type: "string" },
    { name: "providerObjectKey", optional: false, readonly: true, type: "string" },
    { name: "identityProfileId", optional: false, readonly: true, type: "string" },
    { name: "identityProfileVersion", optional: false, readonly: true, type: "string" },
  ], "C4: identity provenance is exactly the namespace, the key, and the identity profile version")
})

// ─── A4 — exact replay shape and boundary union ─────────────────────────────────

const REPLAY_FIELDS = [
  { name: "kind", optional: false, readonly: true, type: '"REPLAY_OF_CAPTURE"' },
  { name: "captureId", optional: false, readonly: true, type: "AcquisitionCaptureId" },
]

test("A4: AcquisitionCaptureReplay is exactly its marker and the original capture identity", async () => {
  const { ts, sourceFile } = await parseEvidencePort()
  assert.deepEqual(objectAliasMembers(ts, sourceFile, "AcquisitionCaptureReplay"), REPLAY_FIELDS,
    "the replay is exactly two required readonly fields and no third")

  // C7: the boundary union is closed, and closed on exactly these two forms. This is where a live
  // provider read would have to be added, so its absence here is the deferral.
  const members = unionMembers(ts, aliasOf(ts, sourceFile, "AcquisitionEvidence"), sourceFile)
  assert.deepEqual(members.map((member) => member.text), ["AcquisitionCapture", "AcquisitionCaptureReplay"],
    "AcquisitionEvidence is exactly the capture and the replay — no third acquisition form")
  for (const member of members) {
    assert.ok(ts.isTypeReferenceNode(member.node),
      "each union member must be a reference to a declared contract type, not an inline shape")
  }
})

// ─── A5 — forbidden duplicate ownership and evaluation metadata ─────────────────

// Ownership is partitioned. These belong to NormalizedToolSignal, to a future canonical Source
// producer, or to SourceRecordV1 — never to acquisition evidence. Duplicating one "for convenience"
// creates a second place the same fact can be stated, and therefore disagree.
const FORBIDDEN_OWNED_FIELDS = [
  "id", "tenantId", "provider", "signalType", "title", "summary", "sourceUrl", "actor", "assignee",
  "repository", "priorityHint", "dueAt", "createdAt", "updatedAt",
  "declaredSourceRef", "recordedAt", "recordVersion",
]

// Evaluation truth is separate from runtime source evidence, in both directions: a capture never
// carries it, and it is never reachable from one.
const FORBIDDEN_EVALUATION_FIELDS = [
  "datasetId", "dataset", "goldLabel", "label", "labels", "isNegative", "hardNegative", "negative",
  "split", "trainSplit", "testSplit", "fold", "correlationGroupId", "correlationResult",
  "workUnitCandidateId", "candidateId", "score", "confidence", "selectionRule",
]

// Read off identifiers rather than source text: the contract's prose has to be able to explain what
// it excludes without thereby failing the check that it excludes it.
const FORBIDDEN_EVALUATION_FRAGMENTS = ["dataset", "goldlabel", "isnegative", "correlation", "candidate", "traintest"]

test("A5: the contract duplicates no owned field and carries no evaluation metadata", async () => {
  const { ts, sourceFile } = await parseEvidencePort()
  const propertyNames = allPropertyNames(ts, sourceFile)
  const typeNames = sourceFile.statements.filter(ts.isTypeAliasDeclaration).map((alias) => alias.name.text)

  // Non-vacuity: the intersections are empty because the guarded lists are real, not because the
  // name sweep came back empty.
  assert.ok(propertyNames.length > 15, "the property sweep must observe the contract's real members")
  assert.equal(typeNames.length, CONTRACT_SYMBOLS.length, "the type-name sweep must observe every alias")

  assert.deepEqual(propertyNames.filter((name) => FORBIDDEN_OWNED_FIELDS.includes(name)), [],
    "acquisition evidence must not duplicate a field owned by another contract")
  assert.deepEqual(propertyNames.filter((name) => FORBIDDEN_EVALUATION_FIELDS.includes(name)), [],
    "acquisition evidence must carry no evaluation metadata")

  const identifiers = [...propertyNames, ...typeNames].map((name) => name.toLowerCase())
  const leaked = identifiers.filter((name) => FORBIDDEN_EVALUATION_FRAGMENTS.some((f) => name.includes(f)))
  assert.deepEqual(leaked, [],
    `no declared identifier may name evaluation material:\n${leaked.join("\n")}`)
})

// ─── A6 — SourceRecord independence ─────────────────────────────────────────────

test("A6: the evidence port has no SourceRecord relationship and SourceRecord has no consumer", async () => {
  const { ts, sourceFile } = await parseEvidencePort()

  // Structural, not textual. The port's comments necessarily discuss SourceRecordV1 — explaining
  // that the two are unrelated is the whole point of the boundary note — so the check reads the
  // declared structure: every import specifier, and every declared type and member name. Prose
  // cannot trip it, and an actual dependency cannot hide from it.
  const specifiers = sourceFile.statements.filter(ts.isImportDeclaration)
    .map((node) => (node.moduleSpecifier as import("typescript").StringLiteral).text)
  const declared = [
    ...sourceFile.statements.filter(ts.isTypeAliasDeclaration).map((alias) => alias.name.text),
    ...allPropertyNames(ts, sourceFile),
  ]
  assert.deepEqual(specifiers, [], "the revised contract imports nothing, so there is no specifier to inspect")
  assert.ok(declared.length > 20, "the declared-name sweep must not be empty")

  for (const token of ["SourceRecord", "declaredSourceRef", "recordedAt"]) {
    assert.deepEqual(declared.filter((value) => value.includes(token)), [],
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
 * the same fields without importing anything, and no test can prevent that. What such an object
 * would not be is *authorized* conforming evidence — see the contract module's own note and the
 * suite header. Conformance is established by a reviewed provider identity and content-scope
 * profile over retained provider bytes, not by field shape, and no provider has one.
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

// ─── A8 — NormalizedToolSignal unchanged and unreferenced ───────────────────────

test("A8: the 14-field signal contract is unchanged, unreferenced by the contract, and its boundary suite still passes", async () => {
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
  const observed = membersOf(ts, signal.type, "NormalizedToolSignal", signalFile)
    .map((field) => ({ name: field.name, optional: field.optional, type: field.type }))
  assert.deepEqual(observed, fixture.signalFields, "the signal's field set, order and types are unchanged")

  // The revision's central move: acquisition evidence no longer touches the projection in either
  // direction. No evidence field may leak into the signal, and no signal type may be referenced by
  // the contract — the second half is what the first contract could not claim.
  const { sourceFile: evidenceFile } = await parseEvidencePort()
  const signalNames = observed.map((field) => field.name)
  const evidenceNames = allPropertyNames(ts, evidenceFile)
  assert.deepEqual(evidenceNames.filter((name) => signalNames.includes(name)), [],
    "no acquisition-evidence field may share a name with a NormalizedToolSignal field")

  const evidenceText = [
    ...evidenceFile.statements.filter(ts.isTypeAliasDeclaration).map((alias) => alias.type.getText(evidenceFile)),
  ].join("\n")
  for (const token of ["NormalizedToolSignal", "NormalizedToolProvider", "NormalizedToolSignalType", "WorkUnitPriority"]) {
    assert.equal(evidenceText.includes(token), false,
      `no declared type in ${EVIDENCE_PORT} may reference ${token}`)
  }

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

/**
 * Every string-literal type the contract declares. Pinned exactly, because this is the one place a
 * provider vocabulary could enter: naming a provider in a literal union would be provider selection
 * presented as a neutral contract, and mapping `NormalizedToolProvider`'s spelling onto a provider
 * namespace would be provider relabelling. `providerNamespace` is an unconstrained `string` for
 * exactly that reason, and this census is what keeps it one.
 */
const CONTRACT_STRING_LITERALS = [
  "AcquisitionCaptureId",
  "AcquisitionTenantPartition",
  "HUMAN_TRIGGERED_PROVIDER_EXPORT",
  "RECORDED_PROVIDER_PAYLOAD",
  "OTHER_READ_ONLY_CAPTURE",
  "INLINE_BYTES",
  "INTEGRITY_BOUND_REFERENCE",
  "CAPTURE",
  "REPLAY_OF_CAPTURE",
]

test("A9: declaring the contract promoted no provider profile gate and asserts no provider vocabulary", async () => {
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

  const { ts, sourceFile } = await parseEvidencePort()
  assert.deepEqual(allStringLiteralTypes(ts, sourceFile), CONTRACT_STRING_LITERALS,
    "the contract's complete string-literal vocabulary is pinned — no provider name may enter it")

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

test("A10: the evidence port carries digests and computes none", async () => {
  const source = await read(EVIDENCE_PORT)
  for (const token of [
    "node:crypto", 'from "crypto"', "require(\"crypto\")", "createHash", "subtle", "digest(",
    "canonicalizeProviderContent", "JSON.stringify", "TextEncoder", "atob", "Buffer.from",
    "sha256(", "sha1(", "md5(",
  ]) {
    assert.equal(source.includes(token), false, `${EVIDENCE_PORT} must not contain ${token}`)
  }
  const { ts, sourceFile } = await parseEvidencePort()
  assert.deepEqual(sourceFile.statements.filter(ts.isFunctionDeclaration), [],
    "a digest constructor or a decoder would have to arrive as a function; none may exist")
})

// ─── A11 — the port layer is edge-free again ────────────────────────────────────

// Proven here as well as in the architecture suite, deliberately. The architectural exception was
// created for this contract, so retiring it is part of this contract's own proof: the layer-wide
// zero cannot be re-weakened in the architecture suite alone without also failing here.
test("A11: the port layer has no outbound edge at all", async () => {
  const portFiles = await collectCodeFiles(path.join(rootDir, PORTS_LAYER))
  // Non-vacuity: an empty edge set proves nothing unless the scan root actually contains modules.
  assert.ok(portFiles.length >= 2, "the ports layer must contain the scanned contract modules")

  const edges = await scanModuleGraph(rootDir, [PORTS_LAYER])
  assert.deepEqual(edges.map((edge) => `${edge.file} | ${edge.kind} | ${edge.resolvedTarget}`).sort(), [],
    "every port module is a leaf: no port-to-port edge, no value edge, no edge to another layer")
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

// ─── A13 — retained provider content is structurally required ───────────────────

/**
 * C2. The defect this revision exists to close: the first contract attested a `contentDigest` with
 * no retained subject anywhere, so the attestation was unfalsifiable by construction. Retention is
 * now a required member of every capture, and every admissible retention form carries actual
 * content material.
 *
 * The inadmissible form is the one this pins hardest: a bare locator. A pointer whose target may
 * change is a re-fetch handle, and re-fetching at verification time is a new observation of a
 * possibly-changed object — which also silently converts a non-live capture into a live read. The
 * reference arm is admissible only because it carries its own integrity value alongside the
 * locator.
 */
test("A13: retained provider content is required, and no retention form is a bare pointer", async () => {
  const { ts, sourceFile } = await parseEvidencePort()

  const retained = CAPTURE_FIELDS.find((field) => field.name === "retainedContent")
  assert.ok(retained, "the capture must declare retained content")
  assert.equal(retained.optional, false, "retained content must not be optional — a capture without it is not one")
  assert.equal(retained.type, "RetainedProviderContent", "retained content must be the declared retention union")

  const arms = unionMembers(ts, aliasOf(ts, sourceFile, "RetainedProviderContent"), sourceFile)
  assert.equal(arms.length, 2, "exactly the two admissible retention forms, and no third")
  const shapes = arms.map((arm) => {
    assert.ok(ts.isTypeLiteralNode(arm.node), "each retention form must be a plain object type literal")
    return membersOf(ts, arm.node, "RetainedProviderContent", sourceFile)
  })

  assert.deepEqual(shapes, [
    [
      { name: "retention", optional: false, readonly: true, type: '"INLINE_BYTES"' },
      { name: "bytesBase64", optional: false, readonly: true, type: "string" },
    ],
    [
      { name: "retention", optional: false, readonly: true, type: '"INTEGRITY_BOUND_REFERENCE"' },
      { name: "retainedContentLocator", optional: false, readonly: true, type: "string" },
      { name: "retainedContentDigest", optional: false, readonly: true, type: "string" },
    ],
  ], "each retention form carries content material: inline bytes, or a locator bound by its own integrity value")

  // Stated as an independent claim rather than only as a consequence of the shape above, because
  // this is the requirement, not an incidental property of how it happens to be spelled.
  for (const shape of shapes) {
    const names = shape.map((member) => member.name)
    assert.deepEqual(names.filter((name) => /url|permalink|href|link|refetch/i.test(name)), [],
      "no retention form may be a provider URL or a re-fetch handle")
    const isBarePointer = names.length === 2 && names.some((name) => /locator|ref|pointer/i.test(name))
    assert.equal(isBarePointer, false, "a locator without an integrity value is a re-fetch handle, not retention")
  }

  // C2 vs C3: the two digests attest different subjects and must stay distinguishable by name.
  // A single shared name would let a profile-scoped value stand in for raw-content integrity.
  const digestNames = allPropertyNames(ts, sourceFile).filter((name) => /digest/i.test(name)).sort()
  assert.deepEqual(digestNames, ["contentDigest", "retainedContentDigest"],
    "exactly two digest-bearing members, with distinct names for their distinct subjects")
})

// ─── A14 — capture and replay are structurally distinct ─────────────────────────

/**
 * C7. Replay must be representable and must not be able to masquerade as a capture. The AST half is
 * here; A17 proves the assignability half under the type checker.
 */
test("A14: the replay carries the capture's identity, no observation, and a disjoint marker", async () => {
  const captureNames = CAPTURE_FIELDS.map((field) => field.name)
  const replayNames = REPLAY_FIELDS.map((field) => field.name)

  const captureKind = CAPTURE_FIELDS.find((field) => field.name === "kind")?.type
  const replayKind = REPLAY_FIELDS.find((field) => field.name === "kind")?.type
  assert.ok(captureKind !== undefined && replayKind !== undefined, "both forms must carry a marker")
  assert.notEqual(captureKind, replayKind, "the two markers must be disjoint literals, or the forms collapse")

  // Retains capture identity.
  assert.ok(replayNames.includes("captureId"), "a replay must carry the original capture's identity")
  assert.equal(
    REPLAY_FIELDS.find((f) => f.name === "captureId")?.type,
    CAPTURE_FIELDS.find((f) => f.name === "captureId")?.type,
    "the replay's capture identity must be the same branded identity, not a re-minted one",
  )

  // Creates no new observation, and alters no evidence: every observational and evidential member
  // of the capture is absent from the replay. Derived from the capture's own field list, so a new
  // capture field is covered here automatically rather than needing to be added to a second list.
  const evidential = captureNames.filter((name) => name !== "kind" && name !== "captureId")
  assert.ok(evidential.length > 5, "the capture must have real evidential members for this to exclude")
  assert.deepEqual(replayNames.filter((name) => evidential.includes(name)), [],
    "a replay restates no observation and no evidence: it has none of the capture's evidential fields")
  assert.deepEqual(replayNames.filter((name) => /observedat|at$/i.test(name)), [],
    "a replay carries no instant at all, so there is no observedAt for it to re-stamp")
})

// ─── A15 — the acquisition mode union is closed ─────────────────────────────────

test("A15: acquisition mode is exactly the three authorized read-only modes", async () => {
  const { ts, sourceFile } = await parseEvidencePort()
  const modes = unionMembers(ts, aliasOf(ts, sourceFile, "AcquisitionMode"), sourceFile).map((m) => m.text)
  assert.deepEqual(modes, ['"HUMAN_TRIGGERED_PROVIDER_EXPORT"', '"RECORDED_PROVIDER_PAYLOAD"', '"OTHER_READ_ONLY_CAPTURE"'],
    "the mode union is closed on the three ratified non-live modes")

  // Live provider acquisition is deferred and unauthorized; a fixture is never a capture. Both are
  // absent by construction above, and named here so the reason a future addition fails is legible.
  const rendered = modes.join(" ")
  for (const forbidden of ["LIVE", "FIXTURE", "SYNTHETIC", "HAND", "GENERATED", "SEED"]) {
    assert.equal(rendered.includes(forbidden), false, `${forbidden} must not appear in the acquisition mode union`)
  }
})

// ─── A16 — distinct identities are branded, not bare strings ────────────────────

/**
 * C1 and C8. A bare `string` makes the distinction a comment: a source identity becomes assignable
 * to a capture identity, and an unvalidated projection tenant string becomes assignable to a tenant
 * partition. Both are exactly the collapses the capabilities name.
 */
test("A16: capture identity and tenant partition are branded strings, and the capture uses the brands", async () => {
  const { ts, sourceFile } = await parseEvidencePort()

  const markers: string[] = []
  for (const [name, brand] of [
    ["AcquisitionCaptureId", "__acquisitionCaptureId"],
    ["AcquisitionTenantPartition", "__acquisitionTenantPartition"],
  ] as const) {
    const alias = aliasOf(ts, sourceFile, name)
    assert.ok(ts.isIntersectionTypeNode(alias.type), `${name} must be a branded intersection, not a bare string`)
    assert.equal(alias.type.types.length, 2, `${name} must be exactly a string and one brand marker`)
    const [base, marker] = alias.type.types
    assert.equal(base.getText(sourceFile), "string", `${name} must be based on string`)
    assert.ok(ts.isTypeLiteralNode(marker), `${name}'s brand must be an object type literal`)
    assert.deepEqual(membersOf(ts, marker, name, sourceFile), [
      { name: brand, optional: false, readonly: true, type: `"${name}"` },
    ], `${name} must carry exactly one readonly phantom brand member`)
    markers.push(`${brand}: "${name}"`)
  }

  // Two brands sharing a marker are one brand, and would be mutually assignable.
  assert.equal(new Set(markers).size, markers.length, "each brand's marker must be unique to it")

  // The brands are only load-bearing if the capture actually uses them.
  assert.equal(CAPTURE_FIELDS.find((f) => f.name === "captureId")?.type, "AcquisitionCaptureId",
    "the capture's identity must be the branded capture id")
  assert.equal(CAPTURE_FIELDS.find((f) => f.name === "tenantPartition")?.type, "AcquisitionTenantPartition",
    "the capture's tenancy must be the branded tenant partition")
})

// ─── A17 — the separations hold under the type checker ──────────────────────────

/**
 * Everything above reads structure. This compiles against it.
 *
 * An AST census proves a field is spelled a certain way; it does not prove the type system draws
 * the line the contract claims. The probe below asserts the four separations operationally, using
 * `@ts-expect-error` so the check is symmetric: a negative case that stops being an error fails as
 * an unused directive, and a positive control that starts being an error fails as an error. Zero
 * diagnostics is therefore the only passing outcome in both directions.
 *
 * The probe compiles ENTIRELY IN MEMORY, and both halves share one program. Neither choice is
 * incidental. Test files run in parallel here, so a scratch file written under `app/**` would be
 * seen by the whole-tree censuses in this very suite, and scratch files written under the system
 * temp directory contend with the D1 evidence suites, which build real repositories there. A
 * virtual `CompilerHost` writes nothing anywhere. The stub lib and `noLib` keep it cheap for the
 * same reason: this assertion needs `string` and a couple of mapped-type helpers, not the whole DOM
 * and ES library, and a test that loads them costs a second of CPU in a shared pool for nothing.
 */

/**
 * The minimum global surface the checker requires, plus the two mapped-type helpers the probe uses.
 * Declared rather than loaded: with `noLib`, this is the entire library the probe sees, so nothing
 * it asserts can quietly depend on an ambient type that is not written here.
 */
const PROBE_LIB = `
interface Boolean {}
interface Number {}
interface String {}
interface Object {}
interface Function {}
interface CallableFunction extends Function {}
interface NewableFunction extends Function {}
interface IArguments {}
interface RegExp {}
interface Symbol {}
interface Array<T> {}
type Pick<T, K extends keyof T> = { [P in K]: T[P] }
type Exclude<T, U> = T extends U ? never : T
type Omit<T, K extends keyof any> = Pick<T, Exclude<keyof T, K>>
`

const TYPE_PROBE = `
import type {
  AcquisitionCapture,
  AcquisitionCaptureReplay,
  AcquisitionCaptureId,
  AcquisitionTenantPartition,
  AcquisitionMode,
  AcquisitionEvidence,
} from "SPECIFIER"

declare const capture: AcquisitionCapture
declare const replay: AcquisitionCaptureReplay
declare const evidence: AcquisitionEvidence
declare const plain: string
declare const withoutRetainedContent: Omit<AcquisitionCapture, "retainedContent">

// C7 — CAPTURE != REPLAY, in both directions.
// @ts-expect-error a capture is not a replay
const c7a: AcquisitionCaptureReplay = capture
// @ts-expect-error a replay is not a capture
const c7b: AcquisitionCapture = replay

// C7 — a consumer must narrow on the marker before reading any observation, because a replay is
// not an observation and has nothing to read.
// @ts-expect-error acquisition evidence is not unconditionally an observation
const c7c: string = evidence.observedAt

// C7 positive control — both forms are acquisition evidence, and the union does narrow.
const c7d: AcquisitionEvidence = capture
const c7e: AcquisitionEvidence = replay
const c7f: string = evidence.kind === "CAPTURE" ? evidence.observedAt : evidence.captureId

// C5 — a replay has no observation instant to re-stamp.
// @ts-expect-error a replay declares no observedAt
const c5a: string = replay.observedAt

// C1 — source identity is not capture identity.
// @ts-expect-error a bare string is not a capture identity
const c1a: AcquisitionCaptureId = plain
// @ts-expect-error a provider object key is a source identity, not a capture identity
const c1b: AcquisitionCaptureId = capture.identity.providerObjectKey
// Documented asymmetry, asserted rather than assumed: the brand narrows what may enter the slot,
// not what may leave it. A cast defeats it either way; this is a declaration, not a validator.
const c1c: string = capture.captureId

// C8 — an unvalidated projection tenant string is not a tenant partition.
// @ts-expect-error a bare string is not a tenant partition
const c8a: AcquisitionTenantPartition = plain

// C6 — live and fixture acquisition are unrepresentable.
// @ts-expect-error LIVE_PROVIDER is deferred and unauthorized
const c6a: AcquisitionMode = "LIVE_PROVIDER"
// @ts-expect-error a hand-authored payload is never an acquisition mode
const c6b: AcquisitionMode = "FIXTURE"
const c6c: AcquisitionMode = "RECORDED_PROVIDER_PAYLOAD"

// C2 — retained content is required; a capture without it is not a capture.
// @ts-expect-error retainedContent is not optional
const c2a: AcquisitionCapture = withoutRetainedContent

export type { }
`

/** Deliberately broken, with no directive: proves the checker in use actually reports errors. */
const CONTROL_PROBE = `
import type { AcquisitionCapture } from "SPECIFIER"
declare const capture: AcquisitionCapture
const broken: number = capture.observedAt
export type { }
`

test("A17: the capture, replay, brand and mode separations hold under the type checker", async () => {
  const ts = await typescript()

  // The virtual files sit beside the real contract so `./types.ts` resolves to it on disk with no
  // path arithmetic. They are never written: the host below answers for them from memory, and the
  // repository tree is untouched.
  const portDir = path.join(rootDir, EVIDENCE_PORT_DIR)
  const libPath = path.join(portDir, "__contract_probe_lib__.d.ts")
  const probePath = path.join(portDir, "__contract_probe__.ts")
  const controlPath = path.join(portDir, "__contract_probe_control__.ts")
  const virtual = new Map([
    [libPath, PROBE_LIB],
    [probePath, TYPE_PROBE.replaceAll("SPECIFIER", "./types.ts")],
    [controlPath, CONTROL_PROBE.replaceAll("SPECIFIER", "./types.ts")],
  ])
  for (const file of virtual.keys()) {
    assert.equal(existsSync(file), false, `${path.basename(file)} must stay virtual and never exist on disk`)
  }

  const options: import("typescript").CompilerOptions = {
    strict: true,
    noEmit: true,
    noLib: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowImportingTsExtensions: true,
  }
  const host = ts.createCompilerHost(options, true)
  const realGetSourceFile = host.getSourceFile.bind(host)
  const realFileExists = host.fileExists.bind(host)
  const realReadFile = host.readFile.bind(host)
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) => {
    const text = virtual.get(path.resolve(fileName))
    return text === undefined
      ? realGetSourceFile(fileName, languageVersion, onError, shouldCreate)
      : ts.createSourceFile(fileName, text, languageVersion, true, ts.ScriptKind.TS)
  }
  host.fileExists = (fileName) => virtual.has(path.resolve(fileName)) || realFileExists(fileName)
  host.readFile = (fileName) => virtual.get(path.resolve(fileName)) ?? realReadFile(fileName)

  // One program for both halves: the control and the probe are checked against exactly the same
  // library, options and resolved contract, so the control's non-vacuity transfers to the probe.
  const program = ts.createProgram([libPath, controlPath, probePath], options, host)
  const diagnose = (file: string) => {
    const source = program.getSourceFile(file)
    assert.ok(source, `the probe program must include ${path.basename(file)}`)
    return [...program.getSyntacticDiagnostics(source), ...program.getSemanticDiagnostics(source)]
      .map((d) => `${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`)
  }

  // The contract really was resolved from disk, not invented: without this, a probe that failed to
  // resolve its import could report zero diagnostics for the wrong reason.
  const resolvedPort = program.getSourceFile(path.join(rootDir, EVIDENCE_PORT))
  assert.ok(resolvedPort, "the probe must resolve the real contract module from disk")
  assert.ok(resolvedPort.text.includes("export type AcquisitionCapture = {"),
    "the resolved module must be the contract itself")

  // Non-vacuity: the checker is live and does report errors against this contract, so an empty
  // result for the probe is a real result rather than a program that type-checked nothing.
  assert.ok(diagnose(controlPath).length > 0,
    "the control probe must produce a diagnostic, or this test proves nothing")

  assert.deepEqual(diagnose(probePath), [],
    "every @ts-expect-error case must genuinely be an error, and every positive control must compile")

  // The stub library must not have silently swallowed a real failure by leaving the probe's own
  // globals undeclared; the library file itself must be clean.
  assert.deepEqual(diagnose(libPath), [], "the probe's stub library must itself type-check")
})
