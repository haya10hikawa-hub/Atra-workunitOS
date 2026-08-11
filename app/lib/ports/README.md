# Ports Layer

## Ownership
- Neutral boundary contracts shared by adapters and the application layer.
- Declares the shape of data crossing a boundary; owns no orchestration and no I/O.
- `toolSignal/` owns the normalized provider-ingress signal contract.
- `acquisitionEvidence/` owns the neutral acquisition-evidence contract.

## Allowed imports
- `app/lib/ports/**`
- `app/lib/domain/**`

The allowlist above is the layer policy, not the live edge set. Exactly one
outbound edge from this layer is authorized:

```text
app/lib/ports/acquisitionEvidence/types.ts
  | import-type |
app/lib/ports/toolSignal/types.ts
```

`acquisitionEvidence` may depend type-only on `toolSignal`. `toolSignal` remains
a leaf and imports nothing at all — the dependency never runs the other way. Any
second port-to-port edge, any value/runtime edge, and any edge to another layer
is unauthorized and fails a permanent ratchet. This is one reviewed exception,
not general permission for port-to-port imports.

## Forbidden imports
- `app/lib/application/**`
- `app/lib/infrastructure/**`
- `app/lib/persistence/**`
- `app/components/**`
- `app/api/**`
- React, Next, provider clients, any external I/O.

## Canonical files
- `toolSignal/types.ts` — sole declaration of `NormalizedToolProvider`,
  `NormalizedToolSignalType`, `WorkUnitPriority` and `NormalizedToolSignal`.
- `acquisitionEvidence/types.ts` — sole declaration of `AcquisitionEvidence` and
  `AcquiredSignalObservation`.

## `acquisitionEvidence` non-ownership
It is a contract declaration only. It owns no provider I/O, no orchestration, no
hashing, no canonicalization, no SourceRecord production, no persistence and no
provider profile. Its existence proves no provider identity profile and no
provider content-scope profile; all six stay `REQUIRED_UNPROVEN`.

## Common mistakes
- Importing an application type to describe a port; the dependency runs the other way.
- Adding a runtime value (`const`, `function`, `class`, `enum`) to a contract module,
  which turns an erased type edge into a real runtime edge.
- Treating a port contract as domain truth, or as a `SourceRecordV1` relative.
