# WorkUnit OS

AI work OS for converting scattered work signals into reviewable WorkUnit Nodes and safe Action Field work.

## Overview

WorkUnit OS ingests work signals from multiple sources (Slack, GitHub, Calendar), normalizes them into WorkUnit candidates, and provides a safe preparation loop: draft → preview → human/server approval → dry-run verification. Real external execution is intentionally disabled in the current release.

## Current Internal Alpha Capabilities

- **WorkUnit Launcher / Graph foundation** — multi-source signal ingestion (mock GitHub, Slack, Calendar) feeding WorkUnit candidates
- **Action Preview** — server-generated preview with SHA-256 hashes (hashes never returned to browser)
- **Approve / Reject** — server-side approval records with tenant isolation
- **Approval Status** — `GET /api/workunit/:id/approval/status` returns safe summary (none/pending/approved/rejected/expired/used)
- **Approval Status Trace** — API-backed approval trace using `approvalDecisionTraceModel.ts`
- **Execution Readiness** — pure model gating on server-derived approval status + `externalExecutionEnabled` flag
- **Execution Command Envelope** — safe blocked-envelope display (mode, reason, previewRefCount, requestedActionType)
- **Execution Dry-run Route** — `POST /api/workunit/:id/execution/dry-run` verifies persisted approval, hashes, tenant, and kill switch without side effects
- **UI Dry-run Verification** — calls dry-run only, never real execution
- **Dry-run Result Viewer** — `executionResultViewerModel.ts` displays verified/blocked/not_ready/failed
- **Clear / Re-run Controls** — local-only state management, no API calls for Clear
- **Internal Alpha Flow Regression** — 34 regression tests locking the complete alpha loop

## Execution Safety Boundary

- Real external execution is **intentionally disabled**.
- The system supports preview, approval, readiness, command envelope display, and dry-run verification only.
- Dry-run **does not call external providers** (no Slack, Gmail, GitHub, Calendar).
- Dry-run **does not mark approvals as used**.
- Execution-looking UI controls must not be exposed from WorkUnit Launcher, WorkUnit Graph, Command Palette, Tool Pin, or editable Action Field text.
- UI code **must not call** `/api/workunit/tools` for real external execution.
- Approval hashes (`targetHash`, `payloadHash`) are **never returned to the browser**.
- `tenantId`, `actorUserId`, `role` are **server-derived** — never trusted from client.

## What Is Not Implemented Yet

- OAuth integration
- Token storage / vault
- Real Slack posting
- Real Gmail sending
- Real GitHub issue creation
- Real Calendar event creation
- Billing
- Production tenant administration UI
- Real external execution
- Mock/internal execution route

## Local Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Lint
npm run lint

# Type-check and build
npm run build

# Run tests (Node.js built-in test runner)
npm test

# Cloudflare Workers build (OpenNext → .open-next/worker.js)
npm run cf:build

# Cloudflare Workers dev (local Worker + local D1)
npm run cf:dev

# Deploy preflight + non-uploading dry-run (synthetic config, no credentials)
npm run cf:deploy:preflight
npm run cf:deploy:dry-run
```

Environment variables:

```bash
# Required for dev sessions
ALLOW_DEV_SESSION=true
ALLOW_DEV_WORKSPACE_BOOTSTRAP=true

# External execution (keep disabled)
EXTERNAL_ACTIONS_ENABLED=false

# Source providers (use fake for local dev)
GITHUB_SOURCE_MODE=fake
```

## Testing

Tests use Node.js built-in test runner with `--experimental-strip-types` for TypeScript directly.

```bash
# Run all tests
npm test

# Run a specific test file
node --test --experimental-strip-types tests/executionDryRunRoute.test.mts
```

Tests include: pure model tests, route behavior tests, source-scan regression tests, and internal alpha flow coverage.

## Cloudflare Deployment (Workers / OpenNext)

The single deployment target is **Cloudflare Workers** built with OpenNext. The
committed config is `wrangler.json` (Workers target, placeholder D1 IDs only).
Full details: [docs/operations/CLOUDFLARE_RUNTIME_DEPLOYMENT.md](docs/operations/CLOUDFLARE_RUNTIME_DEPLOYMENT.md).

```bash
npm run cf:build            # → .open-next/worker.js + .open-next/assets
npm run cf:deploy:preflight # fail-closed config validation (no network)
npm run cf:deploy:dry-run   # wrangler deploy --dry-run, no upload

# Real deploy: supply IDs via env, then run the guarded orchestrator.
export CLOUDFLARE_CONTROL_DB_ID=<uuid>
export CLOUDFLARE_TENANT_DB_DEFAULT_ID=<uuid>
# prepare → preflight → build → verify artifacts → verify remote D1 schema (read-only) → deploy
CF_DEPLOY_EXECUTE=1 npm run cf:deploy
```

Real D1 IDs are never committed: they are assembled at deploy time into an
untracked, git-ignored `wrangler.deploy.json`.

**Worker deploy never applies database migrations** — a real deploy first requires a
successful *read-only* remote D1 schema verification.

**Remote execution is entrypoint-only.** Worker deploy and remote D1 schema
verification exist **only** in the direct command entrypoints (`cf:deploy`,
`cf:d1:schema:verify:remote`), each gated by its own module-private authorization
latch that only the CLI opens after all gates pass. No **imported** production
function can authorize a deploy or a remote query — a boolean argument is never
authorization. Local evidence-session signatures are integrity for the local journal,
**not** a Cloudflare attestation; no remote proof has been produced, and Issue #155
remains open. The `.d1-evidence` directory (session private keys) must be a plain
`0700` directory — an unsafe directory fails closed.

## D1 migrations & bootstrap

`migrations/manifest.json` is the canonical source of truth for the two migration
lanes (immutable, SHA-256 pinned, append-only). Full guide:
[docs/operations/CLOUDFLARE_D1_SETUP.md §6 + §10](docs/operations/CLOUDFLARE_D1_SETUP.md).

```text
CONTROL_DB
  0001_control_db.sql                     replay_safe
  0004_control_auth_workspace.sql         replay_safe

TENANT_DB_DEFAULT
  0002_tenant_core.sql                    replay_safe
  0003_tenant_persistence_foundation.sql  replay_safe
  0005_tenant_scoped_indexes.sql          replay_safe
  0006_action_preview_creator.sql         once
```

Every committed migration is in exactly one lane; there is no `deferred` escape
hatch. **`replay_safe`** migrations are `IF NOT EXISTS`-guarded and re-run every
time. **`once`** migrations are not raw-re-runnable (SQLite has no
`ADD COLUMN IF NOT EXISTS`), so they are applied a single time and recorded in the
`__atra_d1_migrations` ledger, which makes replaying a lane safe. `0006` is required:
Action Preview creation always writes `created_by_user_id`, so a clean bootstrap
includes it and supports **Action Preview and Approval**, not just WorkUnit.

```bash
npm run cf:d1:migrations:check     # manifest, paths, digests, lanes, SQL safety (offline)
npm run cf:d1:migrations:plan      # ordered plan (no database IDs, no SQL)
npm run cf:d1:bootstrap:local      # isolated fresh bootstrap + idempotence + local fixture
npm run cf:d1:schema:verify:local  # verify both schemas against the schema contract
```

Production migration apply is **operator-gated** (`--remote` + a validated generated
config + `CF_D1_MIGRATE_EXECUTE=1` + `CF_D1_MIGRATE_CONFIRM=APPLY_PRODUCTION_D1_MIGRATIONS`)
and is never part of `cf:deploy`.

The production Control DB bootstrap is repository-controlled and follows
`prepare → inspect safe plan → gated apply → read-only verification → cleanup`, via
`cf:d1:bootstrap:prepare` then `cf:d1:bootstrap:apply` (`--remote` + a validated
config + `CF_D1_BOOTSTRAP_EXECUTE=1` +
`CF_D1_BOOTSTRAP_CONFIRM=APPLY_PRODUCTION_CONTROL_BOOTSTRAP`).

**The deploy config is authority-bearing** — it selects the physical databases and
the Worker deployment configuration. Authority is the **retained exact bytes and their
SHA-256**, not a filesystem path (a path is a mutable file that could be altered
between calls). One shared library loads and validates it **once** and retains those
bytes plus their digest. Every Wrangler invocation then gets its **own short-lived
scoped config**, written from the exact bytes (exclusively created, read-only `0400`),
verified to hash to the retained digest, and removed the instant its one call returns
— `withPrivateExecutionConfig` never returns or reuses a path. Every remote command —
`cf:d1:migrations:apply`, `cf:d1:schema:verify:remote`, `cf:d1:bootstrap:apply`, and
`cf:deploy` — derives every call from one retained authority; Wrangler never sees the
original mutable path or a reusable private config. The deploy orchestrator verifies
in-process and, **before uploading, asserts the verification digest equals its retained
digest**: verification and upload may use different ephemeral paths but execute
byte-for-byte identical bytes — byte identity, not a false same-path claim. Editing,
replacing, or deleting the original after validation cannot redirect anything, nor can
mutating a prior call's already-removed scoped file. Scoped configs self-remove; the
orchestrator removes the original generated config the moment its bytes are retained
and again on every exit.

**`CONTROL_DB` and `TENANT_DB_DEFAULT` must be different physical D1 databases.** The
shared deploy-config validator compares the two `database_id`s and refuses a
collision before any database access, so every command inherits it — `CONTROL_DB is
never tenant-data storage` is an architecture guarantee, not a naming convention.
Database names are validated and must be distinct too.

The **prepared artifact is a reviewable plan, not execution authority**: apply
reconstructs the canonical SQL from the operator environment at apply time and
compares the whole file byte-for-byte, so a stale or tampered artifact fails closed
before Wrangler. Registry database metadata must match the deploy config's real
`TENANT_DB_DEFAULT` binding, and the registry `schema_version` is canonical (declared
once in the manifest, pinned to a digest of the tenant lane — which covers the
once-migration effect probe) rather than an arbitrary digit string.

**Wrangler receives private temporary files, never mutable preparation files**: the
canonical SQL is snapshotted, and the apply and every post-bootstrap COUNT query each
mint a fresh scoped config from the **same retained authority**, so the database
written and the database verified cannot diverge — yet no reusable config path
survives between the write and the verification. The five records apply as one atomic
batch, are verified read-only with COUNT-only queries over every supplied field, and
all generated files are removed on every exit path. Because verification
runs after the batch commits, a verification failure is an operator-action state —
not a rollback. Never apply the generated file with a raw `wrangler d1 execute` —
that bypasses every gate.

**Worker deploy never applies migrations and never writes bootstrap records**; it
only verifies the remote schema read-only. D1 data rollback is **separate** from
Worker rollback. FakeD1 and `cf:deploy:dry-run` are **not** production-readiness
proof — Issue #155 remains open until authorized remote evidence is reviewed.

**D1 operational evidence packs (P0-OPS-016)** define how that future authorized
run will be recorded: every operation is a **command-bound receipt** emitted from
inside the real operator command's result path — **pack-level hashing alone is not
execution provenance**. `npm run cf:d1:evidence:init` (offline; read-only `git`
only) derives the commit + clean tree + contract digests and mints a 0600 Ed25519
session key; each command signs its own receipt, bound to one session + repository
commit + deploy-config **authority digest**, chained, with proof facts recomputed
from the repository. Safe categories are exact per-operation allowlists (no
arbitrary string — e.g. a database name — becomes a category); a recursive scanner
adds defence in depth. `npm run cf:d1:evidence:verify -- --file <pack> [--session <dir>]`
verifies fully offline: recomputed pack + receipt digests, every signature, chain,
one authority, per-operation categories, and cross-operation timestamp monotonicity
— a complete but unsigned fabricated pack fails. The evidence layer satisfies no
operator gate and reads no environment. CLI and library verification share
`verifyEvidencePackAtPath(path, { repoRoot, sessionDir })`; actual HEAD and
`git status --porcelain` come only from its private allowlisted read-only Git path,
with no production runner injection or override. Session signatures prove one local
evidence-session origin only — **not** a Cloudflare attestation, no defence against a
malicious machine owner. See
[docs/operations/D1_OPERATIONAL_EVIDENCE.md](docs/operations/D1_OPERATIONAL_EVIDENCE.md);
the framework itself is **not** remote proof.

After `cf:build`, clean generated artifacts before committing:

```bash
git restore .open-next
git clean -fd .open-next
```

`.open-next/`, `.npm-cache/`, and `wrangler.deploy*.json` are in `.gitignore` and
must never be committed.

## Repository Hygiene

- `.open-next/**` and `.npm-cache/**` are gitignored
- `*.swp` and `*.swo` editor temp files are gitignored
- Generated build artifacts must be restored/cleaned before each commit
- All imports use `.ts` extensions (required by `--experimental-strip-types`)

## Roadmap

- Mock/internal execution model foundation (non-external)
- Docs tree reorganization
- Production auth hardening
- Limited, approved, auditable external execution design
