import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { writeNew, readJson, jsonFiles, safePath } from '../eval/classifier/scripts/io.mjs'
import { normalizeGithubRecord } from '../eval/classifier/scripts/normalize/github.mjs'
import { reconstructionPrompt, criticPrompt, repairPrompt } from '../eval/classifier/scripts/annotate/prompts.mjs'
import { verifyRunReceipts } from '../eval/classifier/scripts/annotate/receipts.mjs'
import { makeFixture } from '../eval/classifier/scripts/testing/fixture.mjs'
import { hash, annotationDigest } from '../eval/classifier/scripts/validate/integrity.mjs'
import { ontologyReport } from '../eval/classifier/scripts/report/report.mjs'
import { makeCriticJob, outputSchema, runCritic } from '../eval/classifier/scripts/annotate/codex-critic.mjs'
import { selectChatNeighborhoods, normalizeChatNeighborhood } from '../eval/classifier/scripts/normalize/chat.mjs'
import { assembleDraft, reconstructionSchema, runReconstruction } from '../eval/classifier/scripts/annotate/codex-reconstruct.mjs'

function commandFailure(value: unknown): value is Error & { status: number; stdout: string; stderr: string } {
  return value instanceof Error && 'status' in value && typeof value.status === 'number' &&
    'stdout' in value && typeof value.stdout === 'string' && 'stderr' in value && typeof value.stderr === 'string'
}

test('chat candidates preserve unknown timezone and cannot turn windows into thread truth', () => {
  const { manifest } = makeFixture()
  const snapshot = { provider: 'slack', extraction: { member: 'data/test.xml' }, records: Array.from({ length: 6 }, (_, i) => ({ text: `Test ${i}: try a fix for the bug`, user: `u${i % 2}`, timestamp_text: '2020-01-01T00:00:00', conversation_id: '1' })) }
  const groups = selectChatNeighborhoods(snapshot)
  assert.equal(groups.length, 1)
  const candidate = normalizeChatNeighborhood(groups[0], snapshot, { sha256: manifest.checksum, retrieved_at: manifest.retrieved_at, path: 'sandbox/test.json' }, manifest, 'example/project', 'DEV-CANDIDATE')
  assert.equal(candidate.sources[0].timestamp, null)
  assert.equal(candidate.sources[0].metadata.original_timestamp, '2020-01-01T00:00:00')
  assert.deepEqual(candidate.sources[0].structured_relations, [])
  assert.equal(selectChatNeighborhoods({ ...snapshot, records: snapshot.records.map(r => ({ ...r, conversation_id: null })) })[0].id, 'window-0')
  assert.throws(() => normalizeChatNeighborhood({ ...groups[0], id: '../escape' }, snapshot, {}, manifest, '', ''), /unsafe/)
})

test('model graph assembly resolves unique exact spans without fabricating offsets', async () => {
  const { episode, manifest } = makeFixture()
  const { language, difficulty, work_type, semantic_atoms, work_nodes, relations, evidence_map, timeline, ambiguities, negative_candidates, hard_cases } = episode
  const graph = { language, difficulty, work_type, semantic_atoms, work_nodes, relations, evidence_map, timeline, ambiguities, negative_candidates, hard_cases }
  const result = { status: 'ANNOTATED', reason: 'Synthetic test only', graph: { ...graph, confidence: 'medium', rationale: 'Synthetic test only' } }
  const draft = assembleDraft(episode, manifest, result, 'GC-000010', 'test-run', episode.annotation.created_at)
  assert.equal(draft.semantic_atoms[0].start, 0)
  assert.equal(draft.annotation.independent_review, null)
  assert.equal(reconstructionSchema.properties.status.type, 'string')
  assert.throws(() => assembleDraft(episode, manifest, { status: 'REJECTED', reason: 'No work' }, '', '', ''), /rejected/)
  const broken = structuredClone(result)
  broken.graph.semantic_atoms[0].exact_evidence_span = 'not in evidence'
  assert.throws(() => assembleDraft(episode, manifest, broken, '', '', ''), /exact/)
  await assert.rejects(runReconstruction('unused', 'GC-000001'), /explicit/)
})

test('critic runner prepares explicitly typed output schema and refuses implicit execution', async () => {
  const { episode } = makeFixture()
  const job = makeCriticJob(episode, 'separate-critic', '2026-01-01T00:00:00Z')
  assert.deepEqual(job.schema.properties.context, { const: 'separate-run', type: 'string' })
  assert.equal(job.schema.properties.checks.properties.over_merging.type, 'boolean')
  assert.equal(job.schema.properties.claims.items.properties.verdict.type, 'string')
  assert.equal(Object.hasOwn(job.schema.properties.claims.items.properties.evidence_refs, 'uniqueItems'), false)
  assert.equal(outputSchema(null), null)
  assert.throws(() => makeCriticJob({}, '', ''), /schema/)
  await assert.rejects(runCritic('unused'), /explicit --execute/)
})

test('append-only file output and sandbox path validation', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'atra-gold-test-'))
  try {
    await writeNew(resolve(dir, 'nested/a.json'), { real: false })
    assert.deepEqual(await readJson(resolve(dir, 'nested/a.json')), { real: false })
    await assert.rejects(writeNew(resolve(dir, 'nested/a.json'), {}), { code: 'EEXIST' })
    assert.equal((await jsonFiles(resolve(dir, 'nested'))).length, 1)
    assert.deepEqual(await jsonFiles(resolve(dir, 'absent')), [])
    assert.ok((await safePath(dir, 'nested/a.json')).endsWith('a.json'))
    await assert.rejects(safePath(resolve(dir, 'nested'), '../nested'), /escapes/)
    await assert.rejects(jsonFiles(resolve(dir, 'nested/a.json')), { code: 'ENOTDIR' })
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('GitHub normalization preserves byte-derived provenance without equating refs to truth', () => {
  const { manifest } = makeFixture()
  const raw = { id: 1, html_url: 'https://github.com/example/project/issues/1', title: 'Fix parser', body: 'See https://github.com/example/project/issues/2', created_at: '2026-01-01T00:00:00Z', user: { login: 'contributor' } }
  const receipt = { sha256: manifest.checksum, retrieved_at: manifest.retrieved_at, path: 'sandbox/source.raw' }
  const source = normalizeGithubRecord(raw, 0, receipt, manifest, 'example/project', raw.html_url)
  assert.equal(source.content, raw.title + '\n\n' + raw.body)
  assert.deepEqual(source.explicit_refs, ['https://github.com/example/project/issues/2'])
  assert.deepEqual(source.structured_relations, [])
  assert.equal(source.provenance.raw_reference, 'sandbox/source.raw#/0')
  assert.equal(source.author_anonymized.includes('contributor'), false)
  assert.equal(normalizeGithubRecord({ ...raw, pull_request: {} }, 0, receipt, manifest, 'example/project', raw.html_url).source_type, 'pull_request')
  assert.equal(normalizeGithubRecord({ ...raw, title: undefined }, 0, receipt, manifest, 'example/project', raw.html_url).source_type, 'issue_comment')
  assert.throws(() => normalizeGithubRecord({}, 0, receipt, manifest, '', ''), /invalid/)
  assert.throws(() => normalizeGithubRecord({ ...raw, title: '', body: '' }, 0, receipt, manifest, '', ''), /empty/)
})

test('prompts keep phases separate; invented receipt cannot enter a corpus', async () => {
  const { episode } = makeFixture()
  assert.equal(reconstructionPrompt(episode).pass, 'A')
  assert.equal(criticPrompt(episode, 'digest').pass, 'B')
  assert.equal(repairPrompt(episode, {}).pass, 'C')
  assert.equal((await verifyRunReceipts(episode)).length, 2)
  episode.annotation.run_id = '../escape'
  assert.ok((await verifyRunReceipts(episode)).includes('unsafe annotation run ID'))
})

test('ontology discovery excludes final Test and never creates an unearned checkpoint', () => {
  const { episode } = makeFixture()
  assert.throws(() => ontologyReport([], 100), /not reached/)
  const report = ontologyReport([{ ...episode, split: 'TEST-CANDIDATE' }, episode], 2)
  assert.equal(report.discovery_episodes, 1)
  assert.equal(report.excluded_test_episodes, 1)
})

test('receipt verification binds actual request and response files to both passes', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'atra-gold-receipt-test-'))
  try {
    const { episode } = makeFixture()
    await writeNew(resolve(dir, 'episode.json'), episode)
    for (const [pass, id] of [['A', episode.annotation.run_id], ['B', episode.annotation.independent_review.run_id]]) {
      const request = pass === 'A' ? reconstructionPrompt({ sources: episode.sources }) : criticPrompt(episode, annotationDigest(episode))
      const response = pass === 'A' ? episode : episode.annotation.independent_review
      const base = `gold_candidate_v0/runs/${id}`
      const requestText = JSON.stringify(request), responseText = JSON.stringify(response)
      await mkdir(resolve(dir, base), { recursive: true })
      await writeFile(resolve(dir, base, 'request.json'), requestText)
      await writeFile(resolve(dir, base, 'response.json'), responseText)
      await writeNew(resolve(dir, base, 'receipt.json'), { run_id: id, pass, status: 'COMPLETED', annotation_digest: annotationDigest(episode),
        request_path: `${base}/request.json`, response_path: `${base}/response.json`, request_sha256: hash(requestText), response_sha256: hash(responseText) })
    }
    const modulePath = resolve('eval/classifier/scripts/annotate/receipts.mjs')
    const script = `import { readFile } from 'node:fs/promises'; const { verifyRunReceipts } = await import(process.argv[1]); console.log(JSON.stringify(await verifyRunReceipts(JSON.parse(await readFile(process.argv[2],'utf8')))));`
    const run = () => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script, modulePath, resolve(dir, 'episode.json')], { env: { ...process.env, ATRA_GOLD_ROOT: dir }, encoding: 'utf8' }))
    assert.deepEqual(run(), [])
    await writeFile(resolve(dir, `gold_candidate_v0/runs/${episode.annotation.run_id}/response.json`), '{}')
    assert.ok(run().length)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('critic orchestration writes bound receipts with an offline test double and records failed runs', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'atra-gold-runner-test-'))
  try {
    const { episode } = makeFixture()
    await writeNew(resolve(dir, 'draft.json'), episode)
    const modulePath = resolve('eval/classifier/scripts/annotate/codex-critic.mjs')
    const script = `
      import { readFile, writeFile } from 'node:fs/promises';
      const moduleUrl = process.argv[1]; process.argv[1] = 'offline-test-harness';
      const { runCritic } = await import(moduleUrl);
      const draft = JSON.parse(await readFile(process.argv[2], 'utf8'));
      const fake = async (args) => {
        const schema = JSON.parse(await readFile(args[args.indexOf('--output-schema')+1], 'utf8'));
        const response = {...draft.annotation.independent_review, ...Object.fromEntries(['run_id','model','reviewed_at','annotation_digest'].map(k=>[k,schema.properties[k].const]))};
        await writeFile(args[args.indexOf('-o')+1], JSON.stringify(response));
        return 'SYNTHETIC TEST DOUBLE ONLY';
      };
      const good = await runCritic(process.argv[2], true, fake);
      let failed = false; try { await runCritic(process.argv[2], true, async()=>{throw Error('synthetic failure')}) } catch { failed=true }
      console.log(JSON.stringify({good,failed}));`
    const value = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script, modulePath, resolve(dir, 'draft.json')], { env: { ...process.env, ATRA_GOLD_ROOT: dir }, encoding: 'utf8' }))
    assert.equal(value.failed, true)
    assert.equal(value.good.claims.length, episode.annotation.independent_review.claims.length)
    const review = await readJson(value.good.reviewed_path)
    assert.notEqual(review.annotation.run_id, review.annotation.independent_review.run_id)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('CLI end-to-end empty dataset reports zero and rejects a synthetic fixture without acquisition proof', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'atra-gold-cli-test-'))
  const cli = resolve('eval/classifier/scripts/cli.mjs')
  const run = (args: string[]) => execFileSync(process.execPath, [cli, ...args], { env: { ...process.env, ATRA_GOLD_ROOT: dir }, encoding: 'utf8', stdio: 'pipe' })
  try {
    const { episode, manifest } = makeFixture()
    await writeNew(resolve(dir, 'external_sources/MANIFEST.yaml'), { datasets: [manifest] })
    run(['schemas'])
    assert.equal((await jsonFiles(resolve(dir, 'gold_candidate_v0/schema'))).length, 4)
    assert.throws(() => run(['report']), (error: unknown) => commandFailure(error) && error.status === 2 && error.stdout.includes('"valid_episodes": 0'))
    await writeNew(resolve(dir, 'draft.json'), episode)
    const candidate = { schema_version: 'episode-candidate/v1', candidate_id: 'fixture', dataset_id: episode.dataset_id,
      project_id: episode.project_id, ecosystem: episode.ecosystem, split: episode.split, sources: episode.sources,
      selection_rationale: 'Synthetic test only', status: 'ANNOTATION_PENDING' }
    await writeNew(resolve(dir, 'candidate.json'), candidate)
    run(['prepare-a', resolve(dir, 'candidate.json'), resolve(dir, 'prompt-a.json')])
    assert.throws(() => run(['prepare-a', resolve(dir, 'draft.json'), resolve(dir, 'invalid-prompt.json')]), (error: unknown) => commandFailure(error) && error.status === 1)
    run(['prepare-b', resolve(dir, 'draft.json'), resolve(dir, 'prompt-b.json')])
    assert.equal((await readJson(resolve(dir, 'prompt-b.json'))).pass, 'B')
    assert.throws(() => run(['accept', resolve(dir, 'draft.json')]), (error: unknown) => commandFailure(error) && error.status === 1 && error.stderr.includes('acceptance rejected'))
    assert.equal((await jsonFiles(resolve(dir, 'gold_candidate_v0/episodes'))).length, 0)
    assert.equal((await jsonFiles(resolve(dir, 'gold_candidate_v0/rejected'))).length, 1)
    assert.throws(() => run(['invalid']), (error: unknown) => commandFailure(error) && error.status === 1)
    await mkdir(resolve(dir, 'gold_candidate_v0/episodes'), { recursive: true })
    await writeFile(resolve(dir, 'gold_candidate_v0/episodes/broken.json'), '{broken')
    assert.throws(() => run(['validate']), (error: unknown) => commandFailure(error) && error.status === 1)
  } finally { await rm(dir, { recursive: true, force: true }) }
})
