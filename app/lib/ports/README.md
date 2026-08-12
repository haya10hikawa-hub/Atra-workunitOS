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
is **empty**: every port module is a graph leaf and imports nothing at all.

`acquisitionEvidence` briefly held one reviewed `import-type` edge to
`toolSignal`, because its first shape paired evidence with a
`NormalizedToolSignal`. That pairing was the defect — it left the integrity
evidence with no subject other than the Atra projection sitting beside it — so
the envelope and the edge were removed together. Any port-to-port edge, any
value/runtime edge, and any edge to another layer is unauthorized and fails a
permanent ratchet.

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
- `acquisitionEvidence/types.ts` — sole declaration of `AcquisitionEvidence`,
  `AcquisitionCapture`, `AcquisitionCaptureId`, `AcquisitionTenantPartition`,
  `AcquisitionMode`, `RetainedProviderContent`, `ContentScopeBinding` and
  `ProviderIdentityProvenance`.

## `acquisitionEvidence` non-ownership
It is a contract declaration only. It owns no provider I/O, no orchestration, no
hashing, no canonicalization, no SourceRecord production, no persistence and no
provider profile. Its existence proves no provider identity profile and no
provider content-scope profile.

Provider profiles are proven elsewhere, per provider and per resource, and never
by this contract. The GitHub **issue** identity and content-scope profiles are
proven in `docs/architecture/GITHUB_ISSUE_ACQUISITION_PROFILE.md` and implemented
at `app/lib/infrastructure/external/github/recordedIssueCapture.ts`; every other
provider profile gate stays `REQUIRED_UNPROVEN`.

## Common mistakes
- Importing an application type to describe a port; the dependency runs the other way.
- Adding a runtime value (`const`, `function`, `class`, `enum`) to a contract module,
  which turns an erased type edge into a real runtime edge.
- Treating a port contract as domain truth, or as a `SourceRecordV1` relative.
