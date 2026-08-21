# P1-2 Run-3 acquisition controller

Deterministic experiment-integrity control plane for the Run-3 Gmail
acquisition. This package contains no OAuth, no Google SDK, and no `fetch()`
call — it depends on a narrow injected capability
(`AcquireRawFn` in [`types.d.mts`](./types.d.mts)) that the final integration
owner binds to the real byte-preserving Gmail RAW transport
(`tools/audit/p1-2-gmail-raw-transport/`). Every test in this package uses
synthetic acquisition adapters only.

## Files

- `selection.mjs` / `selection.d.mts` — pure, deterministic
  `P1_2_RUN3_GMAIL_METADATA_SELECTION_V1` sample selection and canary
  designation. Reads only `{message_id, internalDate}`.
- `stateStore.mjs` / `stateStore.d.mts` — atomic private JSON persistence
  (temp-file write + `fsync` + rename). No database.
- `controller.mjs` / `controller.d.mts` — `Run3AcquisitionController`, the
  state machine described below.
- `types.d.mts` — shared capability-boundary type surface.

## State machine

```
PRE_T0
  -> PM_AUTHORIZED               authorizePM(record)
  -> METADATA_SELECTION_RESOLVED resolveSelection(candidates, window)
  -> T0_RECORDED                 recordT0()
  -> CANARY_PENDING              (automatic, on T0)
  -> CANARY_PASSED               runCanary(acquireRaw, destinationFor)
  -> GMAIL_ACQUIRING             (automatic, on first remaining success)
  -> ACQUISITION_COMPLETE        (automatic, on 26/26)
  -> VALIDATION_PENDING          completeToValidationPending()

any non-terminal state -> VOID   (terminal; every mutating call rejects after)
```

Selection is resolved **before** T0, per the Run-3 pre-registration amendment
(PM decision token `ATRA_PM_P1_2_RUN3_GMAIL_SELECTION_RULE_V1_RATIFIED`):
metadata-only enumeration is not content-bearing acquisition and does not
start T0, but T0 cannot be recorded without an existing selection commitment.

## Invariants enforced

- No PM authorization → no T0 (selection resolution requires
  `PM_AUTHORIZED`; T0 requires a resolved, commitment-verified selection).
- T0 recorded exactly once; deadline (`T0 + 4h`) is derived once and never
  mutated.
- The canary (`selected[0]`) must be the first content-bearing acquisition;
  no other identity may be fetched before it.
- Canary byte-fidelity failure, a later Gmail fidelity failure, an ambiguous
  (thrown/crashed) acquisition call, or an exceeded deadline all transition
  to `VOID` immediately. `VOID` is terminal: every subsequent mutating call
  is rejected and the original `voidReason` is preserved (never overwritten).
- No automatic retry, substitution, or reselection — ever. A crash between
  the external acquisition call and state registration is treated as
  ambiguous and fails closed to `VOID`, not retried.
- Controller state persists to a private JSON file and survives process
  restart: `T0` cannot be recreated, completed identities are not lost, and
  a terminal `VOID` remains terminal after reload.
- Persisted state never contains Gmail body, RAW MIME, credentials, or OAuth
  tokens — only identities, hashes, byte lengths, and timestamps.

## Not in scope for this package

- Live Gmail access, OAuth, or credential handling of any kind.
- Dataset freeze / Gold construction (a separate parallel WorkUnit).
- Re-implementing the Run-2 GitHub reuse byte validator (that authority
  already exists elsewhere; this controller only records the declared
  `github_reuse_expected` count at `VALIDATION_PENDING`).
