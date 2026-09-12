// Explicit allowlist: never copy source bodies, exact quotes, authors or model prompts.
export function referenceSummary(episode) {
  return {
    format: 'gold-candidate-reference/v1', episode_id: episode.episode_id,
    dataset_id: episode.dataset_id, project_id: episode.project_id, language: episode.language,
    status: 'ACCEPTED_FOR_HUMAN_REVIEW', human_verified: false, full_episode_included: false,
    limitation: 'Reference-only snapshot. Full local source evidence and run artifacts are required for corpus validation; this file is not itself a loadable Gold Candidate.',
    source_refs: episode.sources.map(s => ({ source_id: s.source_id, provider: s.provider, url: s.source_url,
      raw_hash: s.provenance.raw_hash, content_hash: s.provenance.content_hash })),
    atom_refs: episode.semantic_atoms.map(a => ({ atom_id: a.atom_id, source_id: a.source_id, start: a.start, end: a.end })),
    work_nodes: episode.work_nodes, relations: episode.relations, evidence_map: episode.evidence_map,
    critic: { run_id: episode.annotation.independent_review.run_id,
      annotation_digest: episode.annotation.independent_review.annotation_digest,
      claims: episode.annotation.independent_review.claims.map(c => ({ claim_id: c.claim_id, verdict: c.verdict, critical: c.critical })) },
  }
}
