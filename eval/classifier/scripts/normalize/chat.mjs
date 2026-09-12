import { hash, validateCandidate } from '../validate/integrity.mjs'
import { sanitizePublicRecord } from './sanitize.mjs'
const actionWords = /\b(?:fix(?:ed|ing)?|bug|implement|release|update|change|debug|patch|test|workaround|resolved|solution|tried|try|works|working)\b/gi
export function selectChatNeighborhoods(snapshot, limit = 10) {
  const grouped = new Map()
  snapshot.records.forEach((record, index) => {
    const id = record.conversation_id ?? `window-${Math.floor(index / 15)}`
    grouped.set(id, [...(grouped.get(id) ?? []), { record, index }])
  })
  return [...grouped.entries()].filter(([, items]) => items.length >= 5 && items.length <= 30 && items.every(i => i.record.text.trim()) && items.reduce((n, i) => n + i.record.text.length, 0) <= 30000 && new Set(items.map(i => i.record.user)).size >= 2)
    .map(([id, items]) => ({ id, items, score: items.reduce((n, i) => n + (i.record.text.match(actionWords)?.length ?? 0), 0) }))
    .filter(group => group.score >= 4).sort((a, b) => b.score - a.score || String(a.id).localeCompare(String(b.id))).slice(0, limit)
}
export function normalizeChatNeighborhood(group, snapshot, receipt, manifest, project, split) {
  if (!/^(?:\d+|window-\d+)$/.test(String(group.id))) throw Error('unsafe conversation identity')
  const context = `${manifest.source_url}#${encodeURIComponent(snapshot.extraction.member)}:neighborhood-${group.id}`
  const sources = group.items.map(({ record, index }) => sanitizePublicRecord({
    schema_version: 'external-source-record/v1', source_id: `${manifest.dataset_id}:${receipt.sha256.slice(0, 12)}:${index}`,
    provider: snapshot.provider, dataset: manifest.dataset_id, project, source_type: 'chat_message',
    external_id: `${receipt.sha256}:${index}`, source_url: `${manifest.source_url}#${encodeURIComponent(snapshot.extraction.member)}:message-${index}`,
    timestamp: null, author: record.user, title: '', content: record.text, explicit_refs: [], structured_relations: [],
    metadata: { artifact_only: false, context_ref: context, original_timestamp: record.timestamp_text }, license: manifest.license,
    provenance: { raw_hash: receipt.sha256, content_hash: hash(record.text), retrieved_at: receipt.retrieved_at, raw_reference: `${receipt.path}#/records/${index}` },
  }))
  const candidate = { schema_version: 'episode-candidate/v1', candidate_id: `RAW-${manifest.source_family}-${receipt.sha256.slice(0, 12)}-${group.id}`,
    dataset_id: manifest.dataset_id, project_id: project, ecosystem: project.split('/')[0], split, sources,
    selection_rationale: 'Lifecycle-keyword retrieval only, not work identity. Slack uses publisher-proposed conversation IDs; Discord uses disjoint chronological windows, NOT asserted threads. Unqualified source timestamps are retained verbatim; no UTC offset is invented. No external distractor has been selected.',
    status: 'ANNOTATION_PENDING' }
  const errors = validateCandidate(candidate)
  if (errors.length) throw Error(errors.join('; '))
  return candidate
}
