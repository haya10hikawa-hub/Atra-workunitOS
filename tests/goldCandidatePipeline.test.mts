import test from 'node:test'
import assert from 'node:assert/strict'
import { validateEpisode, validateCorpus, hash, annotationDigest } from '../eval/classifier/scripts/validate/integrity.mjs'
import { makeFixture } from '../eval/classifier/scripts/testing/fixture.mjs'
import { buildReport } from '../eval/classifier/scripts/report/report.mjs'
import { sanitizePublicRecord } from '../eval/classifier/scripts/normalize/sanitize.mjs'
import { referenceSummary } from '../eval/classifier/scripts/report/reference.mjs'
type FixtureEpisode = ReturnType<typeof makeFixture>['episode']

test('reference-only publication excludes raw text, quoted spans, author data and prompts', () => {
  const { episode } = makeFixture()
  const result = referenceSummary(episode)
  assert.equal(result.full_episode_included, false)
  assert.equal(Object.hasOwn(result, 'sources'), false)
  assert.equal(Object.hasOwn(result.atom_refs[0], 'exact_evidence_span'), false)
  assert.equal(Object.hasOwn(result.source_refs[0], 'author_anonymized'), false)
  assert.equal(result.critic.claims.length, episode.annotation.independent_review.claims.length)
})

test('a fully evidenced fixture validates without claiming human Gold', () => {
  const { episode, manifest } = makeFixture()
  assert.deepEqual(validateEpisode(episode, manifest), [])
  assert.equal(episode.annotation.human_verified, false)
})

for (const [name, change, expected] of [
  ['missing critic', (e: FixtureEpisode) => { Reflect.set(e.annotation, 'independent_review', null) }, 'schema'],
  ['same context critic', (e: FixtureEpisode) => { e.annotation.independent_review.run_id = e.annotation.run_id }, 'independent'],
  ['stale critic', (e: FixtureEpisode) => { Reflect.set(e.work_nodes[0], 'goal', 'Changed after review') }, 'digest'],
  ['missing reviewed node', (e: FixtureEpisode) => { e.annotation.independent_review.claims.pop() }, 'coverage'],
  ['unsupported node', (e: FixtureEpisode) => { e.annotation.independent_review.claims[0].verdict = 'UNSUPPORTED' }, 'unsupported'],
  ['invented span', (e: FixtureEpisode) => { e.semantic_atoms[0].exact_evidence_span = 'invented' }, 'span'],
  ['dangling source', (e: FixtureEpisode) => { e.semantic_atoms[0].source_id = 'missing' }, 'source'],
  ['dangling node evidence', (e: FixtureEpisode) => { e.work_nodes[0].evidence_refs = ['missing'] }, 'evidence'],
  ['dangling relation', (e: FixtureEpisode) => { e.relations[0].to_id = 'missing' }, 'endpoint'],
  ['duplicate source ID', (e: FixtureEpisode) => { e.sources[1].source_id = e.sources[0].source_id }, 'duplicate'],
  ['secret', (e: FixtureEpisode) => { e.sources[0].content += ' -----BEGIN PRIVATE KEY-----' }, 'sensitive'],
  ['private address', (e: FixtureEpisode) => { e.sources[0].content += ' person@example.com' }, 'sensitive'],
  ['future evidence', (e: FixtureEpisode) => { e.sources[0].timestamp = '2099-01-01T00:00:00Z' }, 'future'],
  ['wrong raw hash', (e: FixtureEpisode) => { e.sources[0].content = 'Different content' }, 'hash'],
  ['fake family', (e: FixtureEpisode) => { e.provenance.source_family = 'slack' }, 'manifest'],
  ['unreviewed uncertainty', (e: FixtureEpisode) => { e.ambiguities = [] }, 'uncertainty'],
  ['missing evidence mapping', (e: FixtureEpisode) => { e.evidence_map.pop() }, 'mapping'],
  ['human promotion', (e: FixtureEpisode) => { e.annotation.human_verified = true }, 'schema'],
  ['prose instead of countable hard-case tags', (e: FixtureEpisode) => { Reflect.set(e, 'hard_cases', ['No HARD_POSITIVE is asserted.']) }, 'schema'],
] as const) {
  test(`acceptance rejects ${name}`, () => {
    const { episode, manifest } = makeFixture()
    change(episode)
    assert.ok(validateEpisode(episode, manifest).some((s: string) => s.includes(expected)))
  })
}

test('manifest must be acquired and license reviewed', () => {
  const { episode, manifest } = makeFixture()
  assert.ok(validateEpisode(episode, { ...manifest, status: 'DISCOVERED' }).length)
  assert.ok(validateEpisode(episode, { ...manifest, license: 'UNKNOWN' }).length)
})

test('corpus catches duplicate neighborhoods and project leakage', () => {
  const { episode, manifest } = makeFixture()
  const second = { ...structuredClone(episode), episode_id: 'GC-000002', split: 'TEST-CANDIDATE' }
  second.annotation.independent_review.annotation_digest = annotationDigest(second)
  const errors = validateCorpus([episode, second], [manifest]).errors
  assert.ok(errors.some((s: string) => s.includes('neighborhood')))
  assert.ok(errors.some((s: string) => s.includes('leakage')))
})

test('empty corpus and a single valid episode cannot pass completion', () => {
  const { episode, manifest } = makeFixture()
  assert.equal(buildReport([], [], []).complete, false)
  const report = buildReport([episode], [manifest], [])
  assert.equal(report.valid_episodes, 1)
  assert.equal(report.complete, false)
  assert.equal(report.human_verified_episodes, 0)
})

test('invalid input is rejected without throwing', () => {
  for (const bad of [null, {}, [], 'invalid', { sources: [null] }]) {
    assert.ok(validateEpisode(bad, {}).length)
  }
})

test('sanitizer pseudonymizes authors, preserves safe evidence and fails closed', () => {
  const { episode } = makeFixture()
  const record = { ...episode.sources[0], author: 'real-user' }
  const safe = sanitizePublicRecord(record)
  assert.equal(safe.author_anonymized, `author-${hash('real-user').slice(0, 16)}`)
  assert.equal(Object.hasOwn(safe, 'author'), false)
  assert.throws(() => sanitizePublicRecord({ ...record, content: 'person@example.com' }), /sensitive/)
  assert.throws(() => sanitizePublicRecord({ ...record, source_url: 'http://127.0.0.1/private' }), /public/)
})

test('critic digest excludes review metadata but binds graph and evidence', () => {
  const { episode } = makeFixture()
  const before = annotationDigest(episode)
  episode.annotation.independent_review.run_id = 'another-critic'
  assert.equal(annotationDigest(episode), before)
  episode.sources[0].content += ' changed'
  assert.notEqual(annotationDigest(episode), before)
})
