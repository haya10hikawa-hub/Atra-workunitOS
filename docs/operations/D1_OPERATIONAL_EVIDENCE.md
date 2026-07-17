# D1 Operational Evidence Packs (P0-OPS-016, Issue #155)

Repository-controlled, privacy-safe, offline-verifiable evidence that one explicitly
authorized remote environment completed the full D1 delivery sequence:

```text
validated config authority
→ migration plan
→ remote migration application
→ remote schema verification
→ bootstrap application
→ bootstrap COUNT verification
→ Worker schema preflight
→ Worker deployment
```

> **Status honesty.** This document describes an evidence *framework*. It is
> **implemented** and **tested offline**. Nothing has been **executed remotely**
> under it, and nothing has been **reviewed as operational evidence**. This patch
> does not prove staging or production readiness, and **Issue #155 remains open**
> until an explicitly authorized run, second-checkout verification, a
> Cloudflare-side evidence cross-check, and human review.

| Layer | Status |
| --- | --- |
| Evidence contract (`contracts/operations/d1-operational-evidence.v1.json`) | implemented |
| Session initializer (`npm run cf:d1:evidence:init`) | implemented |
| Command-**local** receipt emission (inside each operator command) | implemented |
| Non-signing receipt helpers (`scripts/lib/d1EvidenceReceipts.mjs`) | implemented |
| Core recorder + scanner (`scripts/lib/d1OperationalEvidence.mjs`) | implemented |
| Offline verifier + local-checkout binding (`npm run cf:d1:evidence:verify`) | implemented |
| Offline tests + mutation coverage | tested offline |
| Authorized remote run recorded as evidence | **not executed** |
| Human review of remote evidence | **not performed** |

## 0. Second repair — the previous emitter API was still forgeable

The first repair moved receipt creation behind seven **exported** `emit*Receipt(…)`
functions. That surface was still forgeable: an ordinary imported caller could
initialize a session, call each `emit*Receipt` directly with a **correctly-shaped
fabricated success result** (`{ completed: true, appliedPlan }`, `{ deployed: true }`,
…), let the library read the session key and sign, and assemble a pack that passed
every signature, chain, category, and pack-hash check — **without running any
command**. The initializer also accepted caller-supplied `derived.commitSha` /
`derived.dirtyTree` claims.

This second repair removes that forgeable surface entirely:

- The seven `emit*Receipt(…)` functions, the generic `produceReceipt(…)` /
  `signReceiptDigest(…)` core, and `initializeEvidenceSessionAt({ derived })` are
  **no longer exported** — importing the evidence modules exposes **no
  result-to-signed-receipt function**.
- Receipt creation and signing are now **command-local and private**: each command
  derives its own status and proof from its real result, reads the session key, and
  signs inline, after its existing gate and result boundary. No shared public
  function accepts a command result and signs it.
- The initializer accepts **only** `{ repoRoot, environmentClass }` and derives HEAD,
  worktree cleanliness, versions, and contract digests **internally**.
- The offline verifier now **binds the pack to the local clean checkout** at the
  recorded commit.

## 1. Execution provenance — the core invariant

**Pack-level hashing alone is not execution provenance**, and neither is a session
signature by itself. The repaired security boundary is:

```text
A caller that did not execute the actual repository command path
must not have a production API that can create or sign a successful
receipt from a caller-supplied result object.
```

Every operation entry in a pack is a **command-local receipt**, emitted by the real
operator command from inside its own (private, non-exported) result path:

| Producer | Command | Operation |
| --- | --- | --- |
| `cf_d1_migration_plan` | `cf:d1:migrations:check` | `migration_plan_verified` |
| `cf_d1_migration_apply` | `cf:d1:migrations:apply` | `migration_apply_completed` |
| `cf_d1_schema_verify_remote` | `cf:d1:schema:verify:remote` | `remote_schema_verified` |
| `cf_d1_bootstrap_apply` | `cf:d1:bootstrap:apply` | `bootstrap_apply_completed` |
| `cf_d1_bootstrap_counts` | `cf:d1:bootstrap:apply` (COUNT check) | `bootstrap_counts_verified` |
| `cf_worker_preflight` | `cf:deploy:preflight` | `worker_preflight_completed` |
| `cf_worker_deploy` | `cf:deploy` | `worker_deploy_completed` |

Each command derives **its own** status privately from its real result, reads no
other command's result field, captures its own boundary timestamps, and recomputes
its proof facts from the repository (the committed migration plan, the built Worker
artifact bytes, the manifest and schema-contract digests). The shared library
exposes only **non-authorizing** helpers a command composes: `assembleUnsignedReceipt`
(pure canonical assembly of an **unsigned** receipt — worthless until signed),
`persistSignedReceipt` (which **verifies** an already-signed receipt against the
session key and refuses anything unsigned or foreign-key-signed), authority
derivation/binding, and pack assembly from already-verified receipts. There is no
exported `emit*Receipt`, `produceReceipt`, or `signReceiptDigest`.

## 2. Trust model — state it honestly

Receipts are signed with a **session-scoped Ed25519 key**, read and applied by the
emitting command itself:

- generated by `cf:d1:evidence:init`; private key written 0600, exclusively, into
  the git-ignored session directory; never printed, never in any record;
- the public key travels in the session manifest and the final pack;
- every receipt digest is signed; the verifier checks every signature;
- `--session <dir>` additionally anchors a pack to the initialized session's
  manifest (same session id, public key, and derived commit).

```text
The session key protects receipt integrity after a command writes
the receipt. It does not cryptographically attest which JavaScript
call site invoked the signing code and does not protect against a
machine owner who reads the local private key or modifies source.
```

**Ed25519 alone does not prove command execution.** A machine owner who deliberately
edits repository source or reads the session key is outside the trust model. What the
design prevents is an ordinary imported caller manufacturing a valid success pack
from a fabricated result — there is simply no production API that turns a result into
a signed receipt. Actual remote-execution proof still requires the documented
Cloudflare-side cross-check and human review (see §8). Two offline anchors narrow
even wholesale re-implementation: every receipt's `producer_source_sha256` must match
the **actual command source files in the local checkout**, and the verifier binds the
pack to the **clean local checkout at the recorded commit**.

## 3. Evidence sessions (`npm run cf:d1:evidence:init`)

Entirely offline — no network, D1, Wrangler, migration, bootstrap, or deploy
action; the only process it spawns is **read-only `git`** (`rev-parse`, `status`).
The production initializer accepts **only** `{ repoRoot, environmentClass }` — there
is no `derived` parameter and no test-injection point. It **derives** — and never
accepts as claims —

- the exact HEAD commit and worktree cleanliness (a dirty tree fails closed);
- the Node version and the installed Wrangler version;
- the migration-manifest, migration-plan, and schema-contract digests.

It fails closed when the tree is dirty, HEAD is unresolvable, required files are
missing, or contract digests cannot be derived. It creates
`.d1-evidence/<session-id>/` (0700) holding `session.json` and the private key
(both 0600, exclusive). Operators then export
`CF_D1_EVIDENCE_SESSION_DIR=<session dir>` and run the normal gated commands —
each emits its own receipt from command-local, private code; **no command gate is
set, satisfied, or weakened by the evidence layer** (it never reads `process.env`
and never names a gate).

> **Evidence-root permissions (P0-FIX-018).** The `.d1-evidence` root holds session
> private keys, so it must be a **plain, private `0700` directory**. One shared
> validator (`ensureEvidenceRootSecure`), used by BOTH session initialization and
> final pack writing, resolves exactly `<repo>/.d1-evidence`, creates it at `0700`
> only when absent (never recursively), and otherwise `lstat`s it and rejects a
> symlink, a non-directory, or **any group/other permission bit** (`(mode & 0o077) !== 0`).
> A pre-existing unsafe root — e.g. `0755` — is **rejected, not silently accepted**
> (`mkdirSync(recursive: true)` does not correct an existing directory). The single
> safe failure category is `evidence_directory_permissions_invalid`; the tool never
> `chmod`s and never prints an absolute path, and a failed validation writes **no
> key, manifest, receipt, or pack**. Manual remediation: `chmod 700 .d1-evidence`.
> Session directories stay `0700`; every manifest, key, authority binding, receipt,
> and pack stays `0600` and is created exclusively (`wx`).

The Control/Tenant **physical-separation fact is derived** during the first
authority-bearing command by parsing the retained authority bytes (recomputing the
digest, checking exactly one CONTROL_DB and one TENANT_DB_DEFAULT with distinct
valid ids and names). It is never supplied as a bare boolean, and no database ID
or name is ever recorded. The session then binds to that ONE authority digest —
first-writer-wins, immutable, enforced on every later receipt.

## 4. Receipts

Each receipt carries: `sequence` (append-only, contiguous), `operation`, `status`,
boundary timestamps, `authority_sha256`, `session_id`, `repository_commit_sha`,
`producer`, `producer_source_sha256`, `input_digest`, `result_digest`, an
operation-specific `proof` object, sorted + deduplicated `safe_categories`,
`previous_receipt_sha256` (chain), `receipt_sha256` (canonical digest), and
`receipt_signature` (Ed25519, 128-hex).

- **Timestamps come from the execution boundary**: `started_at` is captured
  immediately before the operation begins (after the command's gates), and
  `completed_at` immediately after its result is known. A receipt can never start
  before its session was initialized or before its predecessor completed.
- **Result digests are command-specific**: they cover operation, status, authority
  digest, session id, repository commit, producer identity, producer-source digest,
  and the operation's proof facts (e.g. manifest + plan digests; ordered
  applied-steps digest + ledger reconciliation category; schema-contract +
  category-only summary digests; canonical bootstrap-artifact digest; allowlisted
  boolean COUNT assertions — never raw row values; Worker artifact digest). The
  verifier recomputes every one from fields contained in the receipt.
- **A failed receipt blocks every later success**, duplicates are refused, hard
  prerequisites hold (verify ⇐ apply, counts ⇐ bootstrap, deploy ⇐ verify), and
  successful operations advance in canonical order only.

## 5. Safe categories — exact per-operation allowlists

Arbitrary strings are **not** categories. The contract defines
`safe_categories_by_operation`; unknown categories are rejected; nothing is
normalized into a category (the pre-repair normalization turned the database name
`atra-control-prod` into an accepted `atra_control_prod` — that path is gone).
Commands map internal outcomes to repository-defined categories only; raw command
messages are never accepted; lists are deduplicated and canonically sorted before
digesting. The recursive sensitive-key/value scanner (UUIDs, hex blobs, emails,
tokens, subjects, SQL, paths, raw output, structured blobs) remains as **defence in
depth underneath** the allowlists, not as the primary authorization mechanism.

## 6. Offline verifier (`npm run cf:d1:evidence:verify`)

```bash
npm run cf:d1:evidence:verify -- --file .d1-evidence/<pack>.json [--session .d1-evidence/<session-id>]
```

In addition to the pack-level checks (strict contract, scanner, recomputed
canonical digest, ordering, one authority, completeness, symlink/size protections),
the verifier, per receipt: verifies the session public key and **every signature**;
**recomputes every receipt digest** plus the input and result digests; verifies the
chain, session id, repository commit, authority digest, producer identity, and
producer-source digest **against the local checkout's actual command sources**;
enforces the per-operation category allowlists; and enforces **cross-operation
timestamp monotonicity** (`operation[i].started_at >= operation[i-1].completed_at`).

**Local-checkout binding (this repair).** Signatures do not say *which* repository a
pack belongs to. So the verifier also derives the **local** HEAD and worktree
cleanliness via read-only `git` and requires `local HEAD == commit_sha` on a **clean
tree**, and it recomputes the migration-manifest, migration-plan, and schema-contract
digests from the local files and compares each independently. Run it from a **second
clean checkout at the evidence commit**. A complete but unsigned fabricated pack
fails; so does a pack whose commit is not the local HEAD, whose local tree is dirty,
or whose local contract or command-source files drifted. Category-only output, with
receipt- and checkout-binding categories: `evidence_receipt_unsigned`,
`evidence_receipt_signature_invalid`, `evidence_receipt_digest_mismatch`,
`evidence_receipt_chain_invalid`, `evidence_session_mismatch`,
`evidence_repository_mismatch`, `evidence_producer_mismatch`,
`evidence_producer_source_mismatch`, `evidence_category_not_allowlisted`,
`evidence_temporal_order_invalid`, `evidence_local_head_mismatch`,
`evidence_local_tree_dirty`, `evidence_local_contract_mismatch`. The only process it
spawns is read-only `git`; it performs **no network or database access** and reads no
environment.

The CLI and imported-library API use the identical production path:
`verifyEvidencePackAtPath(path, { repoRoot, sessionDir })` always calls
`deriveGitFacts(repoRoot)`. Production exposes **no Git runner, dependency, spawn, or
execution override**. The private runner accepts only `rev-parse --verify HEAD` and
`status --porcelain=v1 --untracked-files=all --ignore-submodules=none`, disables
optional index locks, filesystem monitors, and the untracked cache, and uses a fixed
child environment so caller-supplied `GIT_DIR`, `GIT_WORK_TREE`, `GIT_CONFIG_*`, or
`PATH` cannot replace the checkout authority or hide worktree changes.

## 7. Operator-run evidence workflow (future; NOT executed by this patch)

Each numbered step is a **separate human-approved action** against dedicated remote
**staging** databases. The operator supplies every gate and confirmation directly;
the evidence layer only observes results. Nothing sets another step's environment.

```text
0.  npm run cf:d1:evidence:init -- --environment staging     (clean tree required)
    export CF_D1_EVIDENCE_SESSION_DIR=.d1-evidence/<session-id>
1.  prepare and inspect the generated deploy config           (cf:deploy:prepare + review)
2.  verify the offline migration plan                         (cf:d1:migrations:check --config …)
3.  apply remote migrations                                   (cf:d1:migrations:apply — its own
                                                               execute flag + confirmation phrase)
4.  verify remote schemas                                     (cf:d1:schema:verify:remote)
5.  prepare and inspect the bootstrap artifact                (cf:d1:bootstrap:prepare + review)
6.  apply the bootstrap                                       (cf:d1:bootstrap:apply — its own
                                                               execute flag + confirmation phrase)
7.  verify bootstrap counts                                   (emitted by the same command)
8.  run Worker preflight                                      (cf:deploy:preflight --config … --check-artifacts)
9.  deploy the Worker                                         (cf:deploy — CF_DEPLOY_EXECUTE=1)
10. assemble and verify the evidence pack                     (cf:d1:evidence:init --assemble <session dir>,
                                                               then cf:d1:evidence:verify from a
                                                               SECOND clean checkout, with --session)
```

## 8. Evidence acceptance policy — conditions before Issue #155 may close

1. Evidence was produced from a **clean tree** at a commit **reachable from `main`**
   (the initializer derives both; a dirty tree cannot open a session).
2. The environment is identified only as `staging` or `production` — nothing more.
3. Control/Tenant **physical separation** was derived from the validated authority
   **without recording IDs or names**.
4. **Every required operation succeeded**, as command-issued, session-signed
   receipts in order, with consistent timestamps.
5. **Every receipt uses the same session, commit, and authority digest.**
6. The **migration manifest and schema-contract digests match** the repository
   commit the evidence names.
7. The **evidence verifier succeeds from a second clean checkout**, with the
   session anchor (`--session`).
8. **Cloudflare-side evidence is cross-checked** (deployment visible in the
   dashboard/API for the same window) — receipts alone are one-sided.
9. **No sensitive content** is present (the scanner and a human check agree).
10. The evidence is **reviewed by a human** — automation alone accepts nothing.
11. **Staging evidence proves reproducibility only.** It must never be described
    as production proof. FakeD1, local SQLite, dry-run, mocks, and CI alone remain
    insufficient.

## 9. Relationship to `cf:d1:evidence`

`npm run cf:d1:evidence` (P0-PERSIST-015) produces a *build/test* evidence artifact
from local validation. THIS document's packs are *operational* evidence of a real
authorized remote run. Both live in the git-ignored `.d1-evidence/`; neither may be
committed; and neither, alone, closes Issue #155.
