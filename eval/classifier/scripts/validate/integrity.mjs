import { createHash } from 'node:crypto'
import Ajv from 'ajv'
import { episodeSchema, manifestSchema, candidateSchema } from './schema.mjs'
import { sensitive, isPublicUrl } from '../normalize/sanitize.mjs'

const ajv = new Ajv({ allErrors: true, jsonPointers: true })
const schemaCheck = ajv.compile(episodeSchema)
const manifestCheck = ajv.compile(manifestSchema)
const candidateCheck = ajv.compile(candidateSchema)
const draftCheck = ajv.compile({ ...episodeSchema, properties: { ...episodeSchema.properties,
  annotation: { ...episodeSchema.properties.annotation, properties: { ...episodeSchema.properties.annotation.properties,
    independent_review: { anyOf: [episodeSchema.properties.annotation.properties.independent_review, { type: 'null' }] } } } } })
export const hash = (value) => createHash('sha256').update(value).digest('hex')
const stable = (v) => Array.isArray(v) ? v.map(stable) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, stable(v[k])])) : v
export const annotationDigest = (episode) => hash(JSON.stringify(stable({ ...episode, annotation: { ...episode.annotation, independent_review: null } })))
const duplicate = (ids) => new Set(ids).size !== ids.length
export function validateCandidate(candidate) {
  if (!candidateCheck(candidate)) return ['candidate schema invalid']
  if (sensitive(JSON.stringify(candidate))) return ['sensitive candidate material']
  if (duplicate(candidate.sources.map(s => s.source_id))) return ['duplicate candidate sources']
  if (candidate.sources.some(s => s.project !== candidate.project_id || s.dataset !== candidate.dataset_id || !isPublicUrl(s.source_url) || hash(s.content) !== s.provenance.content_hash)) return ['candidate provenance mismatch']
  return []
}
export function validateDraft(draft) {
  if (!draftCheck(draft)) return ['draft schema invalid']
  if (sensitive(JSON.stringify(draft))) return ['sensitive draft material']
  return validateCandidate({ schema_version: 'episode-candidate/v1', candidate_id: draft.episode_id, dataset_id: draft.dataset_id,
    project_id: draft.project_id, ecosystem: draft.ecosystem, split: draft.split, sources: draft.sources,
    selection_rationale: 'Draft validation boundary', status: 'CRITIC_PENDING' })
}
export function validateManifest(manifest) {
  if (!manifestCheck(manifest)) return ['manifest schema invalid']
  if (/unknown|pending|noassertion/i.test(manifest.license)) return ['manifest license unresolved']
  if (!isPublicUrl(manifest.source_url) || !isPublicUrl(manifest.license_evidence_url)) return ['manifest URL is not public']
  return []
}
export function validateEpisode(episode, manifest) {
  if (!schemaCheck(episode)) return [`schema: ${ajv.errorsText(schemaCheck.errors)}`]
  const errors = [...validateManifest(manifest)]
  if (errors.length) return errors
  const e = episode, p = e.provenance
  if (e.dataset_id !== manifest.dataset_id || p.source_family !== manifest.source_family || p.dataset_version !== manifest.version || p.license !== manifest.license) errors.push('manifest provenance mismatch')
  if (sensitive(JSON.stringify(e))) errors.push('sensitive material in episode')
  const sources = new Map(e.sources.map(s => [s.source_id, s]))
  const atoms = new Map(e.semantic_atoms.map(a => [a.atom_id, a]))
  const nodes = new Set(e.work_nodes.map(n => n.node_id))
  const claims = [...e.work_nodes.map(n => n.node_id), ...e.relations.map(r => r.relation_id)]
  const allIds = [...sources.keys(), ...atoms.keys(), ...nodes, ...e.relations.map(r => r.relation_id)]
  if (sources.size !== e.sources.length || atoms.size !== e.semantic_atoms.length || nodes.size !== e.work_nodes.length || duplicate(allIds)) errors.push('duplicate graph identity')
  for (const s of e.sources) {
    if (s.dataset !== e.dataset_id || s.project !== e.project_id || s.license !== manifest.license) errors.push('source manifest identity mismatch')
    if (!isPublicUrl(s.source_url) || !p.source_urls.includes(s.source_url)) errors.push('source URL provenance missing')
    if (hash(s.content) !== s.provenance.content_hash || !p.raw_hashes.includes(s.provenance.raw_hash)) errors.push('source hash mismatch')
    if (Date.parse(s.timestamp) > Date.parse(s.provenance.retrieved_at) || Date.parse(s.provenance.retrieved_at) > Date.parse(p.retrieved_at)) errors.push('future source evidence')
  }
  for (const a of e.semantic_atoms) {
    const s = sources.get(a.source_id)
    if (!s) errors.push('atom source missing')
    else if (s.content.slice(a.start, a.end) !== a.exact_evidence_span) errors.push('atom evidence span mismatch')
  }
  const checkRefs = (refs) => { if (refs.some(id => !atoms.has(id))) errors.push('dangling evidence reference') }
  for (const n of e.work_nodes) checkRefs(n.evidence_refs)
  for (const r of e.relations) {
    checkRefs(r.evidence_refs)
    if (!nodes.has(r.from_id) || !nodes.has(r.to_id) || r.from_id === r.to_id) errors.push('relation endpoint missing or self edge')
  }
  for (const n of e.negative_candidates) {
    checkRefs(n.evidence_refs)
    if (!nodes.has(n.from_id) || !nodes.has(n.to_id) || n.from_id === n.to_id) errors.push('negative endpoint invalid')
  }
  for (const a of e.ambiguities) checkRefs(a.evidence_refs)
  for (const t of e.timeline) if (!sources.has(t.source_id) || sources.get(t.source_id).timestamp !== t.timestamp) errors.push('timeline source mismatch')
  const mapping = new Map(e.evidence_map.map(m => [m.claim_id, m.atom_ids]))
  if (mapping.size !== e.evidence_map.length || mapping.size !== claims.length || claims.some(id => !mapping.has(id))) errors.push('evidence mapping incomplete')
  for (const m of e.evidence_map) { checkRefs(m.atom_ids); if (!claims.includes(m.claim_id)) errors.push('unknown mapping claim') }
  for (const n of [...e.work_nodes, ...e.relations]) {
    const refs = mapping.get(n.node_id ?? n.relation_id) ?? []
    if (n.evidence_refs.some(id => !refs.includes(id)) || refs.some(id => !n.evidence_refs.includes(id))) errors.push('evidence mapping mismatch')
  }
  if ((e.relations.some(r => ['UNCERTAIN', 'UNKNOWN_RELATION'].includes(r.type)) || e.work_nodes.some(n => ['UNKNOWN_LEVEL', 'ONTOLOGY_MISMATCH'].includes(n.level))) && !e.ambiguities.length) errors.push('uncertainty discarded')
  validateCritic(e, claims, checkRefs, errors)
  return errors
}
function validateCritic(e, claims, checkRefs, errors) {
  const review = e.annotation.independent_review
  if (review.run_id === e.annotation.run_id) errors.push('critic must be independent')
  if (review.annotation_digest !== annotationDigest(e)) errors.push('critic annotation digest stale')
  if (Date.parse(review.reviewed_at) < Date.parse(e.annotation.created_at)) errors.push('critic predates annotation')
  const reviewed = review.claims.map(c => c.claim_id)
  const required = [...claims, 'labels.language', 'labels.difficulty', 'labels.work_type', ...e.hard_cases.map(t => `labels.hard_cases.${t}`)]
  if (duplicate(reviewed) || required.some(id => !reviewed.includes(id)) || reviewed.some(id => !required.includes(id) && !id.startsWith('checks.'))) errors.push('critic coverage incomplete')
  for (const c of review.claims) {
    checkRefs(c.evidence_refs)
    if (c.verdict === 'UNSUPPORTED' || (c.critical && c.verdict !== 'SUPPORTED')) errors.push('unsupported claim remains')
    if (c.verdict === 'PARTIALLY_SUPPORTED' && !e.ambiguities.length) errors.push('critic uncertainty missing')
  }
}
export function validateCorpus(episodes, manifests) {
  const errors = [], valid = [], seen = new Set(), projects = new Map(), neighborhoods = new Set(), texts = new Set()
  const entries = new Map(manifests.map(m => [m.dataset_id, m]))
  if (entries.size !== manifests.length) errors.push('duplicate manifest dataset')
  const sourceHashes = new Map(), acceptedSources = []
  for (const e of episodes) {
    const local = validateEpisode(e, entries.get(e?.dataset_id))
    if (local.length) { errors.push(...local.map(s => `${e?.episode_id ?? 'unknown'}: ${s}`)); continue }
    if (seen.has(e.episode_id)) errors.push('duplicate episode ID')
    seen.add(e.episode_id)
    const key = e.project_id
    if (projects.has(key) && projects.get(key) !== e.split) errors.push(`project leakage: ${key}`)
    projects.set(key, e.split)
    const refs = new Set(e.sources.map(s => `${s.provider}:${s.external_id}`))
    const neighborhood = [...refs].sort().join('|')
    const text = hash(e.sources.map(s => s.content.toLowerCase().replace(/\s+/g, ' ').trim()).sort().join('\n'))
    if (neighborhoods.has(neighborhood) || texts.has(text)) errors.push('duplicate neighborhood or text')
    for (const previous of acceptedSources) {
      const intersection = [...refs].filter(id => previous.has(id)).length
      if (intersection / Math.min(refs.size, previous.size) >= 0.8) errors.push('near-duplicate source neighborhood')
    }
    for (const s of e.sources) {
      const old = sourceHashes.get(s.provenance.content_hash)
      if (old && old.split !== e.split) errors.push('source content leakage across splits')
      sourceHashes.set(s.provenance.content_hash, { split: e.split })
    }
    acceptedSources.push(refs); neighborhoods.add(neighborhood); texts.add(text); valid.push(e)
  }
  return { errors: [...new Set(errors)], valid }
}
