/**
 * P1-1 acquisition-evidence contract suite.
 *
 * This WorkUnit declares a neutral contract and nothing else. The hard part is not declaring it —
 * it is proving that declaring it changed no capability. A contract type is exactly the kind of
 * artifact whose meaning decays quietly: it can be extended a field at a time, wired into a
 * provider that cannot honour it, or read as evidence that a provider profile was proven. Every
 * assertion below pins one way that could happen.
 *
 * A1–A5   the contract's exact shape and sole declaration site
 * A6      no SourceRecord relationship
 * A7      no provider path can claim conforming evidence
 * A8      NormalizedToolSignal is untouched
 * A9–A10  no profile is proven and no digest is computed
 * A11–A12 exactly one port edge, and zero runtime consumers
 *
 * Structural throughout: shape claims are read off the TypeScript AST and the module graph, never
 * off prose, so a comment cannot satisfy a check the code does not.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFile, readdir } from "node:fs/promises"
import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { isCodeFilePath, scanModuleGraph } from "../scripts/lib/typescriptModuleGraph.mjs"

const rootDir = fileURLToPath(new URL("../", import.meta.url))

const EVIDENCE_PORT = "app/lib/ports/acquisitionEvidence/types.ts"
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
  const sites: string[] = []
  let scanned = 0
  for (const root of ["app", "scripts"]) {
    for (const file of await collectCodeFiles(path.join(rootDir, root))) {
      const source = await readFile(file, "utf8")
      scanned += 1
      for (const symbol of CONTRACT_SYMBOLS) {
        if (new RegExp(`\\b(?:type|interface|class|enum|const|let|var|function)\\s+${symbol}\\b`).test(source)) {
          sites.push(`${path.relative(rootDir, file)} declares ${symbol}`)
        }
      }
    }
  }
  // Non-vacuity: a sweep that found nothing to read proves nothing about what it did not find.
  assert.ok(scanned > 100, "the production sweep must not be vacuous")
  assert.deepEqual(sites.sort(), CONTRACT_SYMBOLS.map((s) => `${EVIDENCE_PORT} declares ${s}`).sort(),
    "each contract type must have exactly one production declaration site")
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

// This is the executable form of the WorkUnit's operative requirement: every current provider path
// remains unable to claim conforming acquisition evidence. Not because it is told not to — because
// it cannot name the contract at all.
test("A7: no GitHub, Slack or Calendar production module can name the evidence contract", async () => {
  const references: string[] = []
  let scanned = 0
  for (const root of PROVIDER_ROOTS) {
    const files = await collectCodeFiles(path.join(rootDir, root))
    // Non-vacuity, per provider: a renamed or moved provider directory must fail here rather than
    // silently turning this into a scan of nothing.
    assert.ok(files.length > 0, `${root} must contain scanned provider modules`)
    scanned += files.length
    for (const file of files) {
      const source = await readFile(file, "utf8")
      const relative = path.relative(rootDir, file)
      for (const token of [...CONTRACT_SYMBOLS, "ports/acquisitionEvidence", "acquisitionEvidence"]) {
        if (source.includes(token)) references.push(`${relative} references ${token}`)
      }
    }
  }
  assert.ok(scanned >= PROVIDER_ROOTS.length, "the provider sweep must not be vacuous")
  assert.deepEqual(references, [],
    `PROVIDER_WIRING must stay 0 — no provider path may claim conforming evidence:\n${references.join("\n")}`)
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

// ─── A12 — no runtime consumer ──────────────────────────────────────────────────

// Stronger than A7: not one provider path, but every production module. After this WorkUnit the
// contract is declared and used by nothing.
test("A12: no production module outside the ports layer references the contract", async () => {
  const references: string[] = []
  let scanned = 0
  for (const root of ["app", "scripts"]) {
    for (const file of await collectCodeFiles(path.join(rootDir, root))) {
      const relative = path.relative(rootDir, file)
      scanned += 1
      if (relative.startsWith("app/lib/ports/")) continue
      const source = await readFile(file, "utf8")
      for (const token of [...CONTRACT_SYMBOLS, "ports/acquisitionEvidence"]) {
        if (source.includes(token)) references.push(`${relative} references ${token}`)
      }
    }
  }
  assert.ok(scanned > 100, "the production sweep must not be vacuous")
  assert.deepEqual(references, [],
    `contract declaration = YES, runtime production use = NO:\n${references.join("\n")}`)

  const edges = await scanModuleGraph(rootDir, ["app", "scripts"])
  const importers = edges
    .filter((edge) => edge.resolvedTarget === EVIDENCE_PORT && !edge.file.startsWith("app/lib/ports/"))
    .map((edge) => `${edge.file} -> ${edge.specifier}`)
  assert.deepEqual(importers, [], `the evidence port must have no production importer:\n${importers.join("\n")}`)
})
