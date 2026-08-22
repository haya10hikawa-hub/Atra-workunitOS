# P1-2 Run-3 acquisition control plane

Audit-only local utility. Not part of the Atra runtime; nothing here imports product
code and no product code imports it.

## Why this exists

This is the Run-3 experiment-integrity control plane: the sequencing/fidelity state
machine (`controller.mjs`), the metadata-only Gmail enumerator and deterministic
selection rule feeding it (`metadataEnumerator.mjs`, `selection.mjs`), the narrow
`acquireRaw` bridge to the byte-preserving Gmail RAW transport (`rawAdapter.mjs`), the
content-free sealed plan-authority verifier (`planAuthority.mjs`), and the pre-T0
preflight that composes all of the above (`preflight.mjs`).

## The canonical Run-3 pre-T0 preflight command

```bash
node tools/audit/p1-2-run3-controller/cli.mjs run3-preflight \
  --run2-manifest /secure/local/p1-2-dataset/v1-run2/manifest.private.jsonl \
  --run2-artifact-root /secure/local/p1-2-dataset/v1-run2/sources \
  --run2-selection-resolved /secure/local/p1-2-dataset/v1-run2/selection-resolved.private.json
```

This is the **only** operator-facing Run-3 pre-T0 preflight command. There is no other
one anywhere in this repository — `tools/audit/p1-2-gmail-raw-transport/cli.mjs` has no
`preflight` command (see the note at the top of that file).

It routes through `runRun3Preflight` (`preflight.mjs`), which routes plan authority
through `verifySealedPlanAuthority` (`planAuthority.mjs`). That function's real
signature is exactly `{planBuffer, sidecarBuffer}` — there is no `expectedSha256` (or
any equivalent) parameter anywhere on this path, and the CLI never passes one. The
pinned commitment (`PLAN_AUTHORITY_SHA256`, `PLAN_AUTHORITY_BYTE_LENGTH` in
`planAuthority.mjs`, re-exported from `protocolConstants.mjs`) is a module-level
constant, ratified out of band; there is no flag through which an operator can supply
or override it. `--plan-sha256`, `--expected-plan-sha`, `--expectedSha256`,
`--authority-hash`, and any equivalent are refused outright as an unknown/forbidden
argument — argument parsing fails, it is never silently ignored.

### Plan document and sidecar location

The plan document (`RUN3_PREREGISTRATION.md`) and its independent sidecar
(`RUN3_PREREGISTRATION.sha256`) are located by a **fixed convention**, not an
operator-supplied flag — an operator cannot redefine what "the plan" means by pointing
the gate at a different file:

| variable | default |
| --- | --- |
| `ATRA_P1_2_RUN3_PLAN_PATH` | `~/atra-private/p1-2-dataset/RUN3_PREREGISTRATION.md` |
| `ATRA_P1_2_RUN3_PLAN_SIDECAR_PATH` | `~/atra-private/p1-2-dataset/RUN3_PREREGISTRATION.sha256` |
| `ATRA_P1_2_RUN3_STATE_PATH` | `~/atra-private/p1-2-dataset/v1-run3/controller-state/state.private.json` |

Overriding *where* these files live (for tests, or an alternate private-dataset root)
is not the same thing as overriding *what hash counts as authoritative* — that stays
pinned in `planAuthority.mjs` regardless of either variable. A missing plan or sidecar
file fails the gate (`plan_authority_valid: false`) with a stable code; it is never
auto-created.

`--run2-manifest`, `--run2-artifact-root`, and `--run2-selection-resolved` remain
ordinary operator-supplied flags: they point at already-integrity-checked Run-2
evidence (byte-verified inside the preflight itself against the pinned reuse count and
per-row content hashes), not at anything that redefines plan authority.

### Read-only by construction

The preflight never creates the private state root, never constructs a
`Run3AcquisitionController`, never records T0, and never calls the Gmail RAW
transport — see the module docstring in `preflight.mjs`. Missing prerequisites (an
absent private state root, a run root that already holds files, …) fail the gate; they
are never silently repaired.

### Content-free output

Output is PASS/FAIL, check names, and booleans only — never plan contents, Gmail
identities, subjects, sender/recipient, snippets, RAW bytes, or any OAuth/refresh/
client secret.

## The ratified Run-3 protocol contract

`protocolConstants.mjs` is the single source of truth both the preflight path and the
`Run3AcquisitionController` config-validation path import from, so the two paths cannot
silently drift apart:

| constant | value |
| --- | --- |
| `PLAN_AUTHORITY_SHA256` | `8b8bd19df7369a28ebb410c93dee8ed5cdf0085ce46d8a3f01c395396a837b9c` |
| `PLAN_AUTHORITY_BYTE_LENGTH` | `13067` |
| `EXPECTED_GITHUB_REUSE` | `34` |
| `EXPECTED_GMAIL_NEW` | `26` |
| `EXPECTED_TOTAL` | `60` |
| `ACQUISITION_DURATION_HOURS` | `4` |

`Run3AcquisitionController`'s constructor validates its `config` against these
constants — every field except `runId` (deliberately left run-specific/free) — BEFORE
touching the state store, before restoring persisted state, and before any
PM-authorization record is ever read. A config that fails this can never be rescued by
a PM-authorization record that happens to internally match that same wrong config: the
PM-authorization check (`authorizePM`) only proves a record is self-consistent with
`this.config`, never that `this.config` itself is the one the protocol ratified.

## Validation

`tests/p1_2Run3AcquisitionController.test.mts` and
`tests/p1_2Run3FinalIntegration.test.mts` — synthetic fixtures and mocked `fetch`
only, no real network call, no real OAuth token, no real Gmail message id.
