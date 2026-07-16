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
> does not prove staging or production readiness, and **Issue #155 remains open**.

| Layer | Status |
| --- | --- |
| Evidence contract (`contracts/operations/d1-operational-evidence.v1.json`) | implemented |
| Evidence recorder (`scripts/lib/d1OperationalEvidence.mjs`) | implemented |
| Safe adapters (`scripts/lib/d1EvidenceAdapters.mjs`) | implemented |
| Offline verifier (`npm run cf:d1:evidence:verify`) | implemented |
| Offline tests + mutation coverage | tested offline |
| Authorized remote run recorded as evidence | **not executed** |
| Human review of remote evidence | **not performed** |

## 1. What evidence establishes

A valid, complete pack establishes:

- **which repository commit was tested** (`repository.commit_sha`, and
  `repository.dirty_tree` is the literal `false` — evidence from a dirty tree cannot
  be created);
- **which migration manifest and schema contract were used**
  (`contracts.migration_manifest_sha256`, `contracts.migration_plan_digest`,
  `contracts.schema_contract_sha256`, `contracts.expected_schema_version`);
- **which exact deploy-config authority was used** (`authority.sha256` — the SHA-256
  of the retained authority bytes from the shared deploy-config authority loader;
  the digest carries no database ID, name, or config content);
- **that Control and Tenant bindings were physically distinct**
  (`authority.control_tenant_physically_distinct` is the literal `true`, attested by
  the shared validator having passed — no ID is recorded);
- **that all remote operations used the same retained authority** (every operation's
  `authority_sha256` must equal `authority.sha256`);
- **that operations occurred in the required order** (contiguous sequences, canonical
  relative order, and hard prerequisites: schema verification requires migration
  apply, bootstrap COUNT verification requires bootstrap apply, deployment requires
  schema verification; no success may follow a failure);
- **that nothing sensitive was recorded** (see §2).

## 2. Prohibited content

The contract, recorder, and verifier all reject — **before serialization**, never by
after-the-fact redaction — any field or value containing:

D1 database UUIDs · database names (as sensitive keys) · OAuth/API tokens ·
authorization headers · cookies · user email addresses · provider subjects ·
tenant/user/membership/identity keys · raw environment-variable values · raw deploy
config · raw SQL (including bootstrap values) · application-row contents ·
filesystem paths · command stdout/stderr (any multi-line/control-character value).

Evidence stores **safe categories** (`[a-z][a-z0-9_]{0,47}`) and **digests**
(lowercase 64-hex SHA-256), not raw command output. A recursive sensitive-key and
sensitive-value scanner enforces this at record time, at finalization, at write
time, and again at verification.

## 3. The record (`evidence_version: "1"`)

Exact allowlists at every level — unknown top-level **and nested** fields are
rejected. All timestamps are strict UTC ISO-8601 with milliseconds. Every digest is
lowercase 64-hex SHA-256. `operations[].sequence` starts at 1 and is contiguous.
`chain.previous_record_sha256` (nullable) links retry packs;
`chain.evidence_sha256` is the SHA-256 of the record's **canonical serialization**
(recursively key-sorted JSON) with the digest field itself excluded — the verifier
always **recomputes** it and never trusts the stored value.

## 4. Recorder (observational only)

```text
createEvidenceSession(...)   → validates every input; refuses a dirty tree or a
                               non-distinct Control/Tenant attestation outright
recordEvidenceOperation(...) → append-only; one authority digest; no duplicates;
                               hard prerequisites; canonical order for successes;
                               a failure blocks all later successes; scans content
finalizeEvidenceSession(...) → contract + scan + ordering validation, canonical
                               digest, recursive freeze; the session is sealed
writeEvidencePack(...)       → re-validates everything, requires the git-ignored
                               `.d1-evidence/`, writes 0600, exclusively (`wx`),
                               collision-resistant secret-free name
```

The recorder **authorizes nothing**: it never spawns Wrangler, never runs SQL,
never touches the network, and never reads or sets an operator gate
(`CF_DEPLOY_EXECUTE`, the migration execute flag + confirmation phrase, the
bootstrap execute flag + confirmation phrase all remain independent and
operator-supplied). There is deliberately **no wrapper** that runs the commands and
sets those gates for you.

The adapters (`d1EvidenceAdapters.mjs`) map each existing command's already-safe
result into exactly `{ operation, status, authorityDigest, resultDigest,
safeCategories }` — never a config path, SQL path, database ID/name, raw output, or
operator input. Raw category inputs are scanned **before** normalization so a
sensitive value cannot be laundered into a safe-looking category. `resultDigest` is
the SHA-256 of the canonical safe result itself.

## 5. Offline verifier

```bash
npm run cf:d1:evidence:verify -- --file .d1-evidence/<pack>.json
```

Reads ONE pack from an explicitly supplied path (never scans a default location);
rejects symlinks and non-plain files; enforces a bounded size **before** reading;
strictly parses against the contract; re-runs the sensitive scanner; recomputes the
canonical digest; verifies ordering, one authority digest, and completeness.
Category-only output (`evidence_valid`, `evidence_unparseable`,
`evidence_contract_invalid`, `evidence_sensitive_content`,
`evidence_digest_mismatch`, `evidence_authority_mismatch`,
`evidence_operation_order_invalid`, `evidence_incomplete`,
`evidence_failed_operation`, plus `evidence_unreadable` / `evidence_too_large`).
It performs **no network or database access** and should be run from a **second
clean checkout** when reviewing.

## 6. Operator-run evidence workflow (future; NOT executed by this patch)

Each numbered step below is a **separate human-approved action** against dedicated
remote **staging** databases. The operator supplies every gate and confirmation
directly; the recorder only observes safe results. Nothing sets another step's
environment variables.

```text
1.  prepare and inspect the generated deploy config      (cf:deploy:prepare + review)
2.  verify the offline migration plan                    (cf:d1:migrations:check / :plan)
3.  apply remote migrations                              (cf:d1:migrations:apply — its own
                                                          execute flag + confirmation phrase)
4.  verify remote schemas                                (cf:d1:schema:verify:remote)
5.  prepare and inspect the bootstrap artifact           (cf:d1:bootstrap:prepare + review)
6.  apply the bootstrap                                  (cf:d1:bootstrap:apply — its own
                                                          execute flag + confirmation phrase)
7.  verify bootstrap counts                              (read-only COUNT verification)
8.  run Worker preflight                                 (cf:deploy:preflight)
9.  deploy the Worker                                    (cf:deploy — CF_DEPLOY_EXECUTE=1)
10. finalize and verify the evidence pack                (recorder finalize + write, then
                                                          cf:d1:evidence:verify from a
                                                          second clean checkout)
```

## 7. Evidence acceptance policy — conditions before Issue #155 may close

1. Evidence was produced from a **clean tree** at a commit **reachable from `main`**.
2. The environment is identified only as `staging` or `production` — nothing more.
3. Control/Tenant **physical separation** is confirmed **without recording IDs**.
4. **Every required operation succeeded** (all seven, in order).
5. **Every operation uses the same authority digest.**
6. The **migration manifest and schema-contract digests match** the repository
   commit the evidence names.
7. The **evidence verifier succeeds from a second clean checkout**.
8. **No sensitive content** is present (the scanner and a human check agree).
9. The evidence is **reviewed by a human** — automation alone accepts nothing.
10. **Staging evidence proves reproducibility only.** It must never be described as
    production proof.
11. FakeD1, local SQLite, dry-run, mocks, and CI alone remain **insufficient**.

## 8. Relationship to `cf:d1:evidence`

`npm run cf:d1:evidence` (P0-PERSIST-015) produces a *build/test* evidence artifact
from local validation. THIS document's packs are *operational* evidence of a real
authorized remote run. Both live in the git-ignored `.d1-evidence/`; neither may be
committed; and neither, alone, closes Issue #155.
