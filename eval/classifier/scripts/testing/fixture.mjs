// Synthetic test fixture ONLY. Never import this module into acquisition/annotation.
import { hash, annotationDigest } from '../validate/integrity.mjs'
export function makeFixture() {
  const date = '2026-01-01T00:00:00Z', url = 'https://example.org/project/issues/1'
  const manifest = {
    dataset_id: 'test-only', name: 'SYNTHETIC TEST ONLY', source_family: 'jira', source_url: url,
    version: 'fixture-v1', retrieved_at: date, license: 'CC0-1.0', license_evidence_url: url,
    redistribution_policy: 'open-with-attribution', attribution_required: false, attribution: 'Synthetic test author',
    contains_personal_data: false, anonymized: true, source_types: ['issue'], language: ['en'],
    known_limitations: ['SYNTHETIC: never count toward the external corpus'], checksum: hash('fixture'),
    local_path: 'test-only', notes: 'Unit test input', status: 'ACQUIRED',
  }
  const sources = ['Fix the parser crash.', 'Verify parser behavior.', 'The trigger is unknown.', 'An unrelated release.', 'More context is needed.'].map((content, i) => ({
    schema_version: 'external-source-record/v1', source_id: `s${i}`, provider: 'jira', dataset: 'test-only',
    project: 'example/project', source_type: 'issue', external_id: `${i}`, source_url: `${url}/${i}`, timestamp: date,
    author_anonymized: 'author-unknown', title: '', content, explicit_refs: [], structured_relations: [],
    metadata: { artifact_only: false, context_ref: url }, license: manifest.license,
    provenance: { raw_hash: hash(content), content_hash: hash(content), retrieved_at: date, raw_reference: `${url}/${i}` },
    sanitization: { boundary: 'public-source-sandbox/v1', version: '1', trust: 'untrusted' },
  }))
  const semantic_atoms = sources.slice(0, 2).map((s, i) => ({ atom_id: `a${i}`, source_id: s.source_id,
    exact_evidence_span: s.content, start: 0, end: s.content.length, normalized_statement: s.content,
    semantic_type: 'action', certainty: 'medium', time_reference: null, entity_refs: [] }))
  const work_nodes = semantic_atoms.map((a, i) => ({ node_id: `n${i}`, title: a.normalized_statement,
    level: 'L3', goal: null, done_condition: null, status: 'UNKNOWN', time_window: null,
    evidence_refs: [a.atom_id], confidence: 'medium' }))
  const relations = [{ relation_id: 'r1', from_id: 'n0', to_id: 'n1', type: 'UNCERTAIN', evidence_refs: ['a0', 'a1'],
    rationale: 'Similar subject does not prove work identity.', confidence: 'low' }]
  const evidence_map = [...work_nodes.map(n => ({ claim_id: n.node_id, atom_ids: n.evidence_refs })), { claim_id: 'r1', atom_ids: ['a0', 'a1'] }]
  const episode = { schema_version: 'gold-candidate-episode/v1', episode_id: 'GC-000001', dataset_id: manifest.dataset_id,
    project_id: 'example/project', ecosystem: 'example', language: 'en', difficulty: 'hard', work_type: 'bug', split: 'DEV-CANDIDATE',
    provenance: { source_family: 'jira', dataset_version: manifest.version, source_urls: sources.map(s => s.source_url),
      license: manifest.license, retrieved_at: date, raw_hashes: sources.map(s => s.provenance.raw_hash) },
    sources, semantic_atoms, work_nodes, relations, evidence_map, timeline: [],
    ambiguities: [{ kind: 'UNCERTAIN', description: 'Work identity is not proven.', evidence_refs: ['a0', 'a1'] }],
    negative_candidates: [], hard_cases: [], annotation: { proposed_by: 'gpt', model: 'TEST-FIXTURE', run_id: 'test-A', created_at: date,
      independent_review: { run_id: 'test-B', model: 'TEST-FIXTURE', reviewed_at: date, annotation_digest: '', context: 'separate-run',
        claims: [...evidence_map, ...['labels.language', 'labels.difficulty', 'labels.work_type'].map(claim_id => ({ claim_id, atom_ids: ['a0'] }))].map(m => ({ claim_id: m.claim_id, verdict: 'SUPPORTED', critical: true, evidence_refs: m.atom_ids, rationale: 'Synthetic test assertion.' })),
        checks: Object.fromEntries(['invented_goals', 'invented_deadlines', 'invented_dependencies', 'over_merging', 'over_splitting', 'forced_ontology'].map(k => [k, true])) },
      human_verified: false, candidate_status: 'PENDING', confidence: 'medium', rationale: 'SYNTHETIC TEST ONLY' } }
  episode.annotation.independent_review.annotation_digest = annotationDigest(episode)
  return { episode, manifest }
}
