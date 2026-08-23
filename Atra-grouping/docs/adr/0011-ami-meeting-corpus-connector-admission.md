# ADR 0011: AMI Meeting Corpus Connector Admission

## Status

Accepted

## Context

Phase 9 requires a source-specific license, acquisition, and export decision before connector implementation. The official AMI Corpus licence page states that the corpus and annotations are released under Creative Commons Attribution 4.0. The official download page identifies the manual and automatic annotation releases and their CC BY 4.0 status.

Evidence reviewed on 2026-08-22:

- https://groups.inf.ed.ac.uk/ami/corpus/license.shtml
- https://groups.inf.ed.ac.uk/ami/download
- https://groups.inf.ed.ac.uk/ami/corpus/

## Decision

Admit AMI as a local-acquisition connector source under `CC-BY-4.0`, subject to attribution in any distributed artifact. The connector accepts only explicitly supplied locally acquired meeting turns; it never fetches corpus material, credentials, or moving remote data itself. Raw AMI acquisition remains below ignored local data paths. Fixture tests use synthetic text only.

The canonical AMI source record preserves meeting ID, speaker identities, turn timestamps, the official source URI, parser version, local raw-payload reference, and content hash. AMI turns are chunked deterministically with `ami-speaker-turn-v1`.

Gold exports remain reference-only under ADR 0005 even though AMI is CC BY 4.0. A future export-mode change must add attribution metadata and a dedicated review.

## Consequences

- Phase 9 now has one legally documented, credentials-free external source family.
- No actual AMI corpus content is committed to this repository.
- QMSum, SmartSHARK, ECB+, and MAVEN-ERE remain blocked pending separate source-specific admission decisions.
