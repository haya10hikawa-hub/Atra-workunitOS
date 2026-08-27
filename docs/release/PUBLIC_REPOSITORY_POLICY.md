# Atra Public Repository Policy

This document defines the boundary between what Atra publishes and what it keeps
private, and how that boundary is enforced mechanically rather than by habit.

**Status:** the canonical repository is **private** and stays private. Nothing in
this document makes it public. Publication is a separate, explicitly authorized
step that additionally requires the outstanding third-party and scanner blockers
to be cleared. Those blockers are tracked in the private inventory and migration
manifest under `docs/release/`, which are deliberately not part of the public
export.

## Selected architecture: private canonical repository + public release mirror

Atra does **not** publish this repository directly. The public product is produced
as a deterministic, allowlist-driven export from the private canonical repository.

That choice is forced by the evidence, not by preference:

- `main`'s history permanently contains **2052 generated `.open-next/` build
  blobs**, roughly 25 of which have developer machine paths baked into them by the
  bundler. Removing a file in a later commit does not remove it from history.
- History and the current tree contain **internal engineering process material**:
  phase gate records, `EXPLICIT_HUMAN_GO` approvals, an agent automation prompt
  library, alpha release process state, a risk register, and go-to-market models.
- The current tree contains a **red-team assessment** that names residual, still-open
  weaknesses along with the private sandbox worktree and hardening branch used.
- Making that history public is irreversible, and no history rewrite is authorized.

Maintaining one deterministic export is safer than repeatedly cleaning a repository
whose history cannot be cleaned at all.

## What the public mirror contains

Everything required to build, run, verify, and understand Atra:

- application, domain, and UI source (`app/**`), the Electron shell (`electron/**`)
- canonical schema definitions and the migration manifest (`migrations/**`)
- the public operational evidence **schema** (`contracts/**`)
- build, migration, deployment, and safety-gate tooling (`scripts/**`, minus the
  internal developer loop tooling)
- the test suite (`tests/**`), including the security fixtures that prove tenant
  isolation, approval binding, CSRF protection, and redaction actually work
- first-party assets and vendored, provenance-recorded source icons (`public/**`)
- the public product/architecture/security/operations documentation subset
- build and lint configuration, the lockfile, the CI Safety Gate workflow, and
  `.gitignore`

## What stays private

- **Agent and session state** — `.hermes/` (removed from tracking), `.claude/`,
  `.codex/`, `.atra/`
- **Internal working documents** — `AGENTS.md`, `AI_JUDGMENT_CRITERIA.md`,
  `NODE_DECOMPOSITION_POLICY.md`, `NODE_DECOMPOSITION_WHITEBOARD.md`
- **Internal engineering process** — the `docs/**` default-private set: phase gates,
  human-go records, decision/risk/evidence ledgers, branch protection policy,
  doctrine, and commercial models
- **Security-sensitive material** — the red-team assessment
- **Internal tooling** — `scripts/loop/**`, `scripts/report-legacy-surface.mjs`,
  and the tests that cover them
- **Unreleased research** — `prototypes/**`
- **Operator and release state** — `docs/release/**`
- **Documentation-contract tests** — the ~44 tests that assert on the *content* of the
  internal governance documents above. They verify process artifacts, not public
  product behaviour, so they move with their subjects.
- **The boundary apparatus itself** — this policy, the manifest, the exporter, the
  verifier, and `tests/publicRepositoryBoundary.test.mts`. They govern the private
  canonical repository; the generated public mirror is a product repository and does
  not carry its own export machinery.

## Why `.gitignore` is required and must never be deleted

`.gitignore` is the first structural barrier that stops private material from ever
becoming a tracked object. Once something is committed it is in history forever, so
prevention is the only real control. It covers dependencies, build outputs, coverage,
caches, editor and OS files, environment files, private keys and certificates,
Cloudflare local state, generated deploy configuration, local databases, operator
bootstrap SQL containing identities, evidence bundles, export staging directories,
and agent-local state.

Two rules govern edits to it:

1. **Never delete it**, and never weaken a pattern that protects a private class.
2. **Never add a broad pattern** such as `/docs/`, `/scripts/`, `*.json`, or `*.md`.
   Broad patterns silently hide legitimate source instead of protecting private state.
   `tests/publicRepositoryBoundary.test.mts` asserts that a representative set of
   source paths stays trackable, so an over-broad rule fails the suite.

## How files are classified

[`config/public-repository-manifest.json`](../../config/public-repository-manifest.json)
is authoritative. It holds an **ordered** rule list; the **first** matching rule wins,
so specific carve-outs precede broad defaults. Every rule declares a classification,
an action, and a reason.

Classifications: `PUBLIC_REQUIRED`, `PUBLIC_OPTIONAL`, `PUBLIC_REDACTED`,
`PRIVATE_DEVELOPMENT`, `PRIVATE_OPERATIONS`, `GENERATED`, `LOCAL_ONLY`,
`THIRD_PARTY_VERIFIED`, `THIRD_PARTY_UNRESOLVED`, `OBSOLETE`, `SENSITIVE`, `BLOCKED`.

Actions: `KEEP`, `KEEP_WITH_REDACTION`, `REGENERATE_FROM_TEMPLATE`,
`REMOVE_FROM_TRACKING`, `MOVE_TO_PRIVATE_REPOSITORY`, `REPLACE_WITH_PUBLIC_EQUIVALENT`,
`REQUIRES_HISTORY_PURGE`, `BLOCK_PUBLICATION`.

Inclusion is **allowlist-based**. A path that matches no rule is not "probably fine" —
it is `UNCLASSIFIED` and fails verification.

## Adding a new file

**A new public file.** Put it under a path already covered by an `include` rule, or
add a rule. Then update `trackedPathCount` and `trackedPathsDigest`:

```bash
node scripts/verify-public-repository.mjs --check-current
```

The command prints the digest mismatch; update the manifest to the reported value.
That step is deliberate friction — it is what turns "a file appeared" into "a human
decided this file is public."

**A new private local file.** Add an ignore rule to `.gitignore` and do not track it.
Moving a private file into another directory inside this repository does not make it
private; only not tracking it, or keeping it out of the public allowlist, does.

## How the public export is generated

```bash
node scripts/export-public-repository.mjs --verify
```

Exports to an invocation-owned temporary directory, verifies it, prints the digest,
and deletes it. To retain a snapshot for independent build verification:

```bash
node scripts/export-public-repository.mjs --out /path/outside/the/repo
```

The destination must be outside the repository, so a snapshot can never be committed
back into it. The exporter refuses to copy a path that traverses (`..`), escapes via
symlink, matches a forbidden pattern, is unclassified, carries an unresolved
placeholder, or is an oversized unexpected binary. It never copies `.git/`,
`node_modules/`, ignored local state, or any excluded path. It emits
`public-export-manifest.json` containing relative path, mode, size, SHA-256, and
classification for every file — and no absolute machine paths.

## How public history is handled

The existing history is classified **`PUBLIC_HISTORY_UNSAFE`** and is never published.
The public mirror starts from a clean initial history built from an export. No history
rewrite has been performed in this repository, and none may be performed without
separate explicit human authorization.

## How secrets are handled

No credential, token, private key, real database identifier, or tenant identity may be
committed. Configuration follows **tracked template + untracked instance**:
`wrangler.json` is the committed safe template carrying `REPLACE_WITH_*` placeholders,
while generated deploy configs (`wrangler.deploy*.json`) and operator bootstrap SQL
(`bootstrap.control*.sql`) are ignored and never committed.

A full-history scan found **no credential requiring rotation**. Token-shaped strings in
the test suite are synthetic negative fixtures (for example AWS's own documentation key
`AKIAIOSFODNN7EXAMPLE`, and D1 ids of the form `00000000-0000-4000-8000-…`), and email
addresses use reserved domains (`.invalid`, `.test`, `.local`, `example.com`). These are
deliberately public: they are the evidence that redaction and validation work.

Two test files are explicitly allowed to contain absolute-path literals
(`tests/d1evidenceRecorder.test.mts`, `tests/d1migrationOperatorGates.test.mts`) because
they assert that such paths are **rejected**. The boundary test verifies those rejection
assertions still exist, so the allowance cannot outlive its justification.

Note that no dedicated secret scanner (`gitleaks`, `trufflehog`) is installed in this
environment. The scan performed was a bounded pattern-based fallback and is **not**
equivalent to a real scanner. Running one before publication remains an open item.

## How third-party assets are reviewed

Every retained binary must have a recorded source, owner, licence, and purpose.

- `public/workunit-source-icons/**` — vendored Simple Icons SVGs with provenance in
  `SOURCES.md`. The files are CC0; the depicted marks remain third-party trademarks.
- `public/Photos/**` — raster brand marks (Slack, Gmail, Google Calendar, Salesforce)
  rendered by the UI with **no recorded provenance**. Classified
  `THIRD_PARTY_UNRESOLVED` / `BLOCK_PUBLICATION`. They are retained because removing
  them is a product-UI change beyond this boundary work, but publication is blocked
  until redistribution rights are resolved.

Unknown binaries block publication. Small size is not a justification for retention.

## How the licensing and cleanup WorkUnits interact

Public-repository cleanup (this document) and source-available licensing are separate
WorkUnits with disjoint file ownership. This WorkUnit did **not** modify `LICENSE`,
`NOTICE`, `COMMERCIAL_LICENSE.md`, `TRADEMARKS.md`, `THIRD_PARTY_NOTICES.md`,
`CONTRIBUTING.md`, `package.json` licence metadata, or the README licence section.

Recommended integration order:

1. this public-repository boundary change
2. the licensing branch, rebased onto the result
3. a re-run of the third-party and licence inventory, which must resolve the
   `THIRD_PARTY_UNRESOLVED` raster assets above
4. a final public-release audit

Public-release readiness is evaluated only after both results are combined.
