# P1-2 Run-3 acquisition control plane

Audit-only local utility. Not part of the Atra runtime; nothing here imports product
code and no product code imports it.

## Why this exists

This is the Run-3 experiment-integrity control plane: the sequencing/fidelity state
machine (`controller.mjs`), the metadata-only Gmail enumerator and deterministic
selection rule feeding it (`metadataEnumerator.mjs`, `selection.mjs`), the narrow
`acquireRaw` bridge to the byte-preserving Gmail RAW transport (`rawAdapter.mjs`), the
content-free sealed plan-authority verifier (`planAuthority.mjs`), the pre-T0
preflight that composes all of the above (`preflight.mjs`), and the sealed operator
entrypoint that composes them into a durable metadata selection
(`selectOperator.mjs`).

## Operator sequence

There are exactly two operator-facing Run-3 pre-T0 commands, in this order:

1. `run3-preflight` — read-only gate. Changes nothing.
2. `run3-select` — **only after explicit Human PM authorization**. Performs live
   Gmail METADATA-ONLY enumeration and writes durable Run-3 state.

`run3-select` stops at `METADATA_SELECTION_RESOLVED`. It does **not** record T0, does
**not** fetch RAW message bytes, and does **not** run the canary. Neither command may
be executed merely because it exists: the existence of `run3-select` is not authority
to run it, and running it is a real, recorded experiment action.

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

## The canonical Run-3 metadata-selection command

```bash
node tools/audit/p1-2-run3-controller/cli.mjs run3-select \
  --run-id <run-id> \
  --authorize-pm
```

This is the **only** operator-facing command that moves a Run-3 controller from
`PRE_T0` to `METADATA_SELECTION_RESOLVED`. Before it existed, the underlying
mechanisms were all merged and reviewed but nothing composed them, so the only way to
resolve a selection was an ad-hoc script — an unreviewed second implementation of
Run-3 authority. That gap was the `P1_2_RUN3_NO_CANONICAL_SELECTION_ENTRYPOINT` stop.

### What it does, in order

```
require explicit PM acknowledgement
  -> validate --run-id
  -> validate the canonical private state root (exists / directory / 0700)
  -> build the protocol config from PINNED CONSTANTS
  -> build the PM authorization record from PINNED CONSTANTS
  -> ControllerStateStore
  -> classify persisted state (fail-closed, BEFORE any controller exists)
  -> Run3AcquisitionController
  -> authorizePM                     (fresh runs only)
  -> enumerateGmailMetadata          (live, METADATA-ONLY)
  -> controller.resolveSelection     (fixed V1 observation window)
  -> print a content-free projection
  -> STOP
```

The CLI is composition only. It re-implements no scoring, sorting, eligibility rule,
sample size, canary designation, commitment construction, OAuth, pagination, or state
serialization — every one of those stays in the already-reviewed module that owns it.

### Live Gmail access

`run3-select` performs **live Gmail METADATA-ONLY enumeration**: `messages.list` with
`includeSpamTrash=true` and full pagination, then `{id, internalDate}` per message.
It never requests `format=raw`, never fetches message bodies, headers, subjects,
snippets, or attachments, and never records T0.

### Authority is pinned; only `--run-id` is free

Every protocol value comes from `protocolConstants.mjs` and the V1 window constants in
`selection.mjs`. `--run-id` is the sole caller-supplied value, and protocol authority
is never derived from it — it is a bounded, non-secret label
(`[A-Za-z0-9._-]`, 1–64 chars; no path separators, whitespace, or control characters).

There is no flag — and no equivalent spelling of one — for the plan hash, the GitHub
reuse count, the Gmail count, the total, the duration, the observation window, the
selection rule, the sample size, the state-machine state, the Gmail query, the page
size, or the state path. Unknown arguments fail closed; recognised authority-override
attempts are refused with `argument_forbidden_authority_override`.

`--authorize-pm` is a valueless acknowledgement of explicit operator intent. It grants
nothing and redefines nothing; it exists so a state-mutating, Gmail-contacting command
cannot fire from an incomplete or copy-pasted invocation. Its absence fails closed
before the state root is read and before Gmail is contacted. **It is not a substitute
for Human PM authorization, which remains required out of band.**

The acknowledgement is enforced **twice**, deliberately: once in the argument parser
(`--authorize-pm`) and once in the composition itself (`runRun3Select`'s required
`pmAcknowledged === true`). This is not redundancy for its own sake. The
acknowledgement is a precondition of the *state mutation*, not of *argument parsing*,
so it belongs on the layer that actually mutates — a check living only in the parser
means any other caller, or a parser regression, reaches `authorizePM` and writes
durable Run-3 state with no operator intent recorded anywhere. This WorkUnit's
mutation testing demonstrated exactly that failure: deleting the single parser line
was sufficient to drive a write to the real canonical state path.

### State authority

`run3-select` is bound to the single canonical state file:

```
~/atra-private/p1-2-dataset/v1-run3/controller-state/state.private.json
```

Unlike the read-only preflight, this path is **not** flag- or env-overridable: a
mutating command must never be able to spawn a second Run-3 state authority. Tests
reach the composition through `runRun3Select`'s explicit `statePath` parameter with
temporary directories instead.

The state root must **already** exist as a real directory with mode `0700`.
`run3-select` never creates it and never chmods it — provisioning is a separately
authorized bootstrap step. A symlink is refused even when its target would qualify.
An absent or wrong-permissioned root fails closed *before* Gmail is contacted.

### Restart and recovery contract

`authorizePM()` persists `PM_AUTHORIZED` before live enumeration begins, so a failed
enumeration legitimately leaves the run at `PM_AUTHORIZED`. That is a supported,
explicitly tested state, not a corruption:

| persisted state | behaviour |
| --- | --- |
| none, or fresh `PRE_T0` | authorize, enumerate, resolve |
| `PM_AUTHORIZED` (record matches this run) | **resume**: do *not* re-authorize; enumerate and resolve |
| `METADATA_SELECTION_RESOLVED` | re-report the existing commitment; **no** Gmail access, **no** write |
| any acquisition / T0 / `VOID` / in-flight / unrecognised state | fail closed |

Resume is safe at `PM_AUTHORIZED` and only there: no selection was ever committed and
T0 has not started, so re-enumerating cannot invalidate anything that already exists.
There is no reset, no deletion, no reselection, and no overwrite anywhere on this path.

Persisted state is classified from a plain `ControllerStateStore.load()` **before** a
controller is constructed. This ordering is load-bearing: the controller fails closed
on restore by transitioning to `VOID` *and persisting it* when the restored
authorization does not match its config, and `VOID` is terminal — so constructing
first would let a single mistyped `--run-id` permanently void a live authorized run.
Classifying first turns that typo into a stable `state_authorization_mismatch` error
with the run left byte-identical.

### Content-free output

Success prints exactly these fields and nothing else:

```json
{
  "status": "P1_2_RUN3_METADATA_SELECTION_RESOLVED",
  "state": "METADATA_SELECTION_RESOLVED",
  "rule_id": "P1_2_RUN3_GMAIL_METADATA_SELECTION_V1",
  "eligible_count": 0,
  "selected_count": 26,
  "canary_count": 1,
  "remaining_count": 25,
  "selection_commitment": "<64 hex>"
}
```

`controller.getState()` is never serialized to stdout: its `selection` carries the
private Gmail message identities (selected set, canary, remaining set), which stay in
the private state file. Failures print a bare stable `error_code` — never a provider
body, message id, path, OAuth detail, or stack trace; anything unrecognised collapses
to `internal_error`.

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

`tests/p1_2Run3AcquisitionController.test.mts`,
`tests/p1_2Run3FinalIntegration.test.mts`, `tests/p1_2Run3PreflightCli.test.mts`, and
`tests/p1_2Run3SelectionOperator.test.mts` — synthetic fixtures and mocked/injected
`fetch` only, no real network call, no real OAuth token, no real Gmail message id, and
no write outside a per-test temporary directory.
