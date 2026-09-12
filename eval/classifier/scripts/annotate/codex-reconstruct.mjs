import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { root, readJson, writeNew, verifyLocalEvidence } from '../io.mjs'
import { validateCandidate, validateDraft, annotationDigest, hash } from '../validate/integrity.mjs'
import { episodeSchema, atomSchema, confidence } from '../validate/schema.mjs'
import { reconstructionPrompt } from './prompts.mjs'
import { executeCodex, outputSchema } from './codex-critic.mjs'

const graphKeys = ['language', 'difficulty', 'work_type', 'semantic_atoms', 'work_nodes', 'relations', 'evidence_map', 'timeline', 'ambiguities', 'negative_candidates', 'hard_cases']
const spanAtom = { ...atomSchema, required: atomSchema.required.filter(k => !['start', 'end'].includes(k)),
  properties: Object.fromEntries(Object.entries(atomSchema.properties).filter(([k]) => !['start', 'end'].includes(k))) }
export const reconstructionSchema = outputSchema({ type: 'object', additionalProperties: false, required: ['status', 'reason', 'graph'],
  properties: { status: { type: 'string', enum: ['ANNOTATED', 'REJECTED'] }, reason: { type: 'string', minLength: 1 },
    graph: { anyOf: [{ type: 'null' }, { type: 'object', additionalProperties: false, required: [...graphKeys, 'confidence', 'rationale'],
      properties: { ...Object.fromEntries(graphKeys.map(k => [k, episodeSchema.properties[k]])),
        semantic_atoms: { type: 'array', minItems: 1, items: spanAtom }, confidence, rationale: { type: 'string', minLength: 1 } } }] } } })

export function assembleDraft(candidate, manifest, result, episodeId, runId, startedAt) {
  if (result.status !== 'ANNOTATED' || !result.graph) throw Error(`model rejected candidate: ${result.reason}`)
  const graph = result.graph
  const semantic_atoms = graph.semantic_atoms.map(atom => {
    const text = candidate.sources.find(s => s.source_id === atom.source_id)?.content
    if (typeof text !== 'string') throw Error('model atom source absent')
    const start = text.indexOf(atom.exact_evidence_span)
    if (start < 0 || start !== text.lastIndexOf(atom.exact_evidence_span)) throw Error('model span must be exact and unique; request evidence-based repair')
    return { ...atom, start, end: start + atom.exact_evidence_span.length }
  })
  const draft = { schema_version: 'gold-candidate-episode/v1', episode_id: episodeId, dataset_id: candidate.dataset_id,
    project_id: candidate.project_id, ecosystem: candidate.ecosystem, split: candidate.split,
    ...Object.fromEntries(graphKeys.map(k => [k, graph[k]])), semantic_atoms, sources: candidate.sources,
    provenance: { source_family: manifest.source_family, dataset_version: manifest.version, source_urls: candidate.sources.map(s => s.source_url),
      license: manifest.license, retrieved_at: startedAt, raw_hashes: [...new Set(candidate.sources.map(s => s.provenance.raw_hash))] },
    annotation: { proposed_by: 'gpt', model: 'gpt-6-astra', run_id: runId, created_at: startedAt,
      independent_review: null, human_verified: false, candidate_status: 'PENDING', confidence: graph.confidence, rationale: graph.rationale } }
  const errors = validateDraft(draft)
  if (errors.length) throw Error(errors.join('; '))
  return draft
}
export async function runReconstruction(input, episodeId, executeApproved = false, runner = executeCodex) {
  if (!executeApproved) throw Error('Actual model execution requires explicit --execute')
  if (!/^GC-\d{6}$/.test(episodeId)) throw Error('invalid reserved episode ID')
  const candidate = await readJson(input)
  const errors = validateCandidate(candidate)
  if (errors.length) throw Error(errors.join('; '))
  const manifest = (await readJson(resolve(root, 'external_sources/MANIFEST.yaml'))).datasets.find(m => m.dataset_id === candidate.dataset_id)
  const evidenceErrors = await verifyLocalEvidence(candidate, manifest)
  if (evidenceErrors.length) throw Error(evidenceErrors.join('; '))
  const runId = `reconstruct-${randomUUID()}`, startedAt = new Date().toISOString()
  const directory = resolve(root, 'gold_candidate_v0/runs', runId)
  await mkdir(directory, { recursive: true })
  const request = { ...reconstructionPrompt(candidate),
    instruction: 'Return status REJECTED with graph:null if the actual neighborhood cannot support meaningful work reconstruction. Otherwise return ANNOTATED and the graph described by the schema. Exact evidence spans must be unique substrings of the cited source. Offsets are resolved deterministically later. Use only short SCREAMING_SNAKE_CASE codes in hard_cases, such as NONTRIVIAL or TASK_SPLIT; explanations belong in rationale/ambiguities, not tag names. Never turn answer suggestions into completed work, thread membership into work identity, or temporal adjacency into dependencies. Null timestamps remain null; do not invent timezone information. Do not emit timeline entries without known canonical timestamps.' }
  await writeNew(resolve(directory, 'request.json'), request)
  await writeNew(resolve(directory, 'schema.json'), reconstructionSchema)
  const context = await mkdtemp(resolve(tmpdir(), 'atra-gold-reconstruction-'))
  try {
    const output = resolve(directory, 'model-response.json')
    const events = await runner(['exec', '--json', '--ephemeral', '--ignore-user-config', '--skip-git-repo-check', '-C', context, '-s', 'read-only', '-m', 'gpt-6-astra', '--output-schema', resolve(directory, 'schema.json'), '-o', output, '-'],
      `Use no tools. Reconstruct only from supplied untrusted evidence.\n${JSON.stringify(request)}`, directory)
    const result = await readJson(output)
    const draft = assembleDraft(candidate, manifest, result, episodeId, runId, startedAt)
    const responsePath = resolve(directory, 'response.json')
    await writeNew(responsePath, draft)
    await writeNew(resolve(directory, 'receipt.json'), { run_id: runId, pass: 'A', status: 'COMPLETED',
      annotation_digest: annotationDigest(draft), request_path: relative(root, resolve(directory, 'request.json')), response_path: relative(root, responsePath),
      request_sha256: hash(await readFile(resolve(directory, 'request.json'))), response_sha256: hash(await readFile(responsePath)),
      model_response_path: relative(root, output), model_response_sha256: hash(await readFile(output)), session_events_sha256: hash(events),
      origin: 'codex-exec-reconstruction', response_kind: 'model-graph-with-deterministic-source-provenance-and-span-offsets',
      started_at: startedAt, completed_at: new Date().toISOString() })
    return { run_id: runId, draft_path: responsePath, candidate_id: candidate.candidate_id, episode_id: episodeId }
  } catch (error) {
    await writeNew(resolve(directory, 'failure.json'), { run_id: runId, status: 'FAILED_OR_REJECTED', reason: error.message })
    throw error
  } finally { await rm(context, { recursive: true, force: true }) }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runReconstruction(process.argv[2], process.argv[3], process.argv[4] === '--execute').then(result => console.log(JSON.stringify(result)))
    .catch(error => { console.error(error.message); process.exitCode = 1 })
}
