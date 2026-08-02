# Ports Layer

## Ownership
- Neutral boundary contracts shared by adapters and the application layer.
- Declares the shape of data crossing a boundary; owns no orchestration and no I/O.
- `toolSignal/` owns the normalized provider-ingress signal contract.

## Allowed imports
- `app/lib/ports/**`
- `app/lib/domain/**`

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

## Common mistakes
- Importing an application type to describe a port; the dependency runs the other way.
- Adding a runtime value (`const`, `function`, `class`, `enum`) to a contract module,
  which turns an erased type edge into a real runtime edge.
- Treating a port contract as domain truth, or as a `SourceRecordV1` relative.
