# Ports Layer

## Ownership
- Neutral boundary contracts shared by adapters and the application layer.
- Declares the shape of data crossing a boundary; owns no orchestration and no I/O.
- `toolSignal/` owns the normalized provider-ingress signal contract.
- `acquisitionEvidence/` owns the neutral acquisition-evidence contract.

## Allowed imports
- `app/lib/ports/**`
- `app/lib/domain/**`

The allowlist above is the layer policy, not the live edge set. The live edge set
is **empty**: every module in this layer imports nothing at all and is a graph
leaf.

The single reviewed exception this layer briefly carried — a type-only edge from
`acquisitionEvidence/types.ts` to `toolSignal/types.ts` — is retired. The revised
acquisition contract depends on no Atra projection by design, so the exception
has no remaining subject and the layer-wide zero is restored. Any port-to-port
edge, any value/runtime edge, and any edge to another layer is unauthorized and
fails a permanent ratchet.

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
- `acquisitionEvidence/types.ts` — sole declaration of `AcquisitionCaptureId`,
  `AcquisitionTenantPartition`, `AcquisitionMode`, `RetainedProviderContent`,
  `ContentScopeBinding`, `ProviderIdentityProvenance`, `AcquisitionCapture`,
  `AcquisitionCaptureReplay` and `AcquisitionEvidence`.

## `acquisitionEvidence` non-ownership
It is a contract declaration only. It owns no provider I/O, no orchestration, no
hashing, no canonicalization, no retention store, no SourceRecord production, no
persistence and no provider profile. Its existence proves no provider identity
profile and no provider content-scope profile; all six stay `REQUIRED_UNPROVEN`.

The revision replaced the earlier four-string `AcquisitionEvidence` and the
`AcquiredSignalObservation` envelope, which paired evidence with a
`NormalizedToolSignal`. Both are removed: see
docs/architecture/ACQUISITION_EVIDENCE_CONTRACT.md for the capabilities the
replacement expresses and the reason the projection pairing had to go.

## Common mistakes
- Importing an application type to describe a port; the dependency runs the other way.
- Adding a runtime value (`const`, `function`, `class`, `enum`) to a contract module,
  which turns an erased type edge into a real runtime edge.
- Treating a port contract as domain truth, or as a `SourceRecordV1` relative.
