# Reachability and Non-Import Reference Instrument

## What this is

A deterministic, read-only measurement of two things over the source-controlled
tree:

- **entry-point-rooted reachability** — which modules are reached, and from
  which class of entry point
- **non-import references** — path strings, configuration, package scripts,
  operator commands and documentation commands, which the TypeScript module
  graph cannot see

It exists because the legacy edge/file baseline is a static-syntax measure over
four legacy roots and says nothing about reachability. The WU-10 cleanup exit
gate in `docs/architecture/CANONICAL_WORKUNIT_PIPELINE_REFACTOR_PROGRAM.md`
names this instrument as a precondition.

## What this is not

**This instrument measures. It authorises nothing.**

- It does not authorise deleting any module.
- It does not start, complete, or alter WU-10 or any WU-10 gate condition.
- It does not change the legacy edge/file baseline, the legacy roots, or
  `INITIAL_LEGACY_EDGE_CEILING`.
- It does not change the declared architecture-debt ledger or any debt
  disposition.
- It does not record a product decision about dormant surfaces.

`UNREACHABLE` is a measurement result, not a disposition. A module classified
`UNREACHABLE` is a candidate for human adjudication. Reachability and product
disposition are different questions, and this instrument answers only the first.

## Running it

```bash
npm run architecture:reachability
```

To regenerate the reconciliation artifact after an intended change:

```bash
node scripts/report-reachability-surface.mjs --write
```

The artifact lives at `tests/fixtures/architecture/reachability-surface.v1.json`
and is reconciled by `tests/architectureReachabilitySurface.test.mts`.

## Classification

Every module in the scan universe receives exactly one primary classification:

| Classification | Meaning |
| --- | --- |
| `PRODUCTION_REACHABLE` | reached from a production entry point |
| `OPERATOR_REACHABLE` | reached from an operator entry point, not from production |
| `TEST_ONLY` | reached only from test roots |
| `DOCUMENTATION_ONLY` | reached only from a documented command |
| `UNREACHABLE` | reached from no entry point |
| `UNKNOWN` | reachability could not be established — always fatal |

Precedence is `PRODUCTION > OPERATOR > TEST > DOCUMENTATION > UNKNOWN`. A module
reached from more than one class keeps **every** class it was reached from in
`reachedBy`; precedence only decides which name the single primary
classification carries. Secondary reachability is never discarded — a module
that both production and tests reach is `PRODUCTION_REACHABLE` with
`reachedBy: ["PRODUCTION", "TEST"]`.

## Entry points

Entry points are discovered, not hardcoded, and the discovered set is reconciled
so a future addition cannot silently escape analysis.

- **Production** — Next.js reserved file names under `app/` (`page`, `layout`,
  `route`, `template`, `loading`, `error`, `not-found`, `default`,
  `global-error`), root runtime entry points (`middleware`, `instrumentation`),
  build/runtime configuration modules, and tracked Electron runtime entry
  points. A file under `app/` is **not** an entry point merely because of its
  directory.
- **Test** — tracked `tests/**/*.test.*` files, which is what the test runner
  executes. A test helper is reachable only if something imports it.
- **Operator** — modules named by `package.json` scripts, by scripts those
  scripts invoke, and by source-controlled workflow `run:` steps.
- **Documentation** — modules named by an executable command in tracked
  documentation.

A root's class comes from where the file lives when the location is
class-bearing, and otherwise from how it was discovered. This is what stops
`npm test` from reclassifying every test file as operator reachability, and
`npm run electron:dev` from reclassifying the Electron runtime entry point as
tooling.

An entry point whose class cannot be determined is `UNKNOWN` and fails the
command, rather than being assumed dead.

## Non-import references

| Type | Source |
| --- | --- |
| `PATH_STRING` | string literals in code that name a repository path |
| `CONFIG_REFERENCE` | `package.json`, `tsconfig*.json`, `wrangler*.json`, `next.config.*`, `open-next.config.*`, `postcss.config.*`, `eslint.config.*` |
| `PACKAGE_SCRIPT` | `package.json` `scripts` |
| `OPERATOR_COMMAND` | workflow `run:` steps and tracked shell scripts |
| `DOCUMENTATION_COMMAND` | executable commands in `docs/**` and `**/README.md` |

Each reference records its source file, the raw value, the normalized target,
the resolution status and the reference class.

### Two rules that keep the measurement honest

**A path string does not confer reachability.** Reading a module's source is not
executing it. The legacy measurement instruments name the four legacy roots as
path strings; if path strings conferred reachability, every legacy module would
be reported reachable and the measurement would be worthless. Instead the
reference is recorded against the target, so an `UNREACHABLE` module that
carries path-string references is visibly not a blind deletion candidate.

**A configuration glob is not a reference.** A glob names a set, not a module.
Expanding `tsconfig` `include` entries would make every TypeScript file in the
tree production-reachable. Globs in command operands *are* expanded, because
`--test tests/*.test.mts` is how the runner discovers its inputs.

### Resolution statuses

`resolved_file`, `resolved_directory`, `resolved_basename` (a path assembled
segment by segment, matched by unique base name), `ambiguous_basename`,
`build_output`, `glob_pattern`, `unresolved`, `external`.

## Fail-closed conditions

The command exits non-zero when:

- a tracked source file cannot be parsed
- a discovered entry point cannot be classified
- any module classification is `UNKNOWN`
- an **executable** reference does not resolve
- a positive control produces no reference
- the canonical output contains a machine-dependent value
- the artifact and the live scan drift

Unresolved **path-string** references are evidence rather than a hard failure —
tests legitimately name paths that do not exist, to prove a negative — but they
are enumerated in the artifact, so a new one is drift.

## Determinism

The inventory is `git ls-files`, not a filesystem walk, so an untracked scratch
file cannot change the output for a given tree. There are no timestamps, no
absolute paths, no home directories and no machine identities in the canonical
output; two runs on the same tree produce byte-identical output.

## Known limitations

- Path composition is resolved by unique base name. A composed path whose base
  name is ambiguous is reported as `ambiguous_basename` rather than resolved.
- A bare single-segment string in prose is not treated as a repository path, so
  a reference written that way outside a command is not detected.
- An unterminated Markdown code fence follows CommonMark and runs to end of
  document, which suppresses inline-span reading for the rest of that file. Such
  files are reported in `documentationAnomalies`.
