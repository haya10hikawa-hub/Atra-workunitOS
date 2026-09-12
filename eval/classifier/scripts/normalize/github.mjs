import { resolve } from 'node:path'
import { hash } from '../validate/integrity.mjs'
import { sanitizePublicRecord } from './sanitize.mjs'
import { readJson, writeNew, root, safePath } from '../io.mjs'

export function normalizeGithubRecord(raw, index, receipt, manifest, project, contextRef) {
  if (!raw || !Number.isSafeInteger(raw.id) || typeof raw.html_url !== 'string') throw Error('invalid GitHub record')
  const content = [raw.title, raw.body].filter(Boolean).join('\n\n')
  if (!content.trim()) throw Error('empty GitHub record')
  return sanitizePublicRecord({ schema_version: 'external-source-record/v1',
    source_id: `github:${project}:${raw.id}`, provider: 'github', dataset: manifest.dataset_id, project,
    source_type: raw.title ? raw.pull_request ? 'pull_request' : 'issue' : 'issue_comment',
    external_id: `${project}:${raw.id}`, source_url: raw.html_url, timestamp: raw.created_at,
    author: raw.user?.login ?? 'unknown', title: raw.title ?? '', content,
    explicit_refs: [...new Set(content.match(/https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/(?:issues|pull)\/\d+/g) ?? [])],
    structured_relations: [], metadata: { artifact_only: false, context_ref: contextRef }, license: manifest.license,
    provenance: { raw_hash: receipt.sha256, content_hash: hash(content), retrieved_at: receipt.retrieved_at, raw_reference: `${receipt.path}#/${index}` },
  })
}
export async function importGithubNeighborhood({ issueReceiptPath, commentsReceiptPath, number, manifest, project, split }) {
  const issueReceipt = await readJson(issueReceiptPath), commentsReceipt = await readJson(commentsReceiptPath)
  const issues = await readJson(await safePath(root, issueReceipt.path)), comments = await readJson(await safePath(root, commentsReceipt.path))
  const index = issues.findIndex(i => i.number === number)
  if (index < 0) throw Error('requested issue absent from receipt')
  const context = issues[index].html_url, rejected = []
  const input = [{ raw: issues[index], index, receipt: issueReceipt }, ...comments.map((raw, index) => ({ raw, index, receipt: commentsReceipt }))]
  const sources = input.flatMap(item => {
    try { return [normalizeGithubRecord(item.raw, item.index, item.receipt, manifest, project, context)] }
    catch (error) { rejected.push({ external_id: String(item.raw.id), reason: error.message }); return [] }
  })
  if (sources.length < 5) throw Error('fewer than five safe source records; neighborhood stays quarantined')
  const candidate = { schema_version: 'episode-candidate/v1', candidate_id: `RAW-${project.replaceAll('/', '-')}-${number}`,
    dataset_id: manifest.dataset_id, project_id: project, ecosystem: project.split('/')[0], split, sources,
    selection_rationale: 'Public issue and its actual comments; thread membership is Silver evidence only. No distractor selected yet.', status: 'ANNOTATION_PENDING' }
  const output = resolve(root, 'silver/episodes', `${candidate.candidate_id}.json`)
  await writeNew(output, candidate)
  await writeNew(resolve(root, 'raw_index/japanese_oss', `${candidate.candidate_id}.json`), {
    candidate_id: candidate.candidate_id, source_urls: sources.map(s => s.source_url), source_count: sources.length,
    rejected_records: rejected, gold_candidate: false, source_receipts: [issueReceiptPath, commentsReceiptPath] })
  return { candidate_id: candidate.candidate_id, sources: sources.length, rejected: rejected.length }
}
