import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { root, jsonFiles, readJson, writeNew, verifyLocalEvidence } from './io.mjs'
import { episodeSchema, sourceSchema, candidateSchema, manifestSchema } from './validate/schema.mjs'
import { validateEpisode, validateCandidate, validateDraft, annotationDigest } from './validate/integrity.mjs'
import { buildReport, ontologyReport } from './report/report.mjs'
import { reconstructionPrompt, criticPrompt } from './annotate/prompts.mjs'
import { verifyRunReceipts } from './annotate/receipts.mjs'

async function corpus() {
  const files = await jsonFiles(resolve(root, 'gold_candidate_v0/episodes'))
  const episodes = await Promise.all(files.map(readJson))
  const manifests = (await readJson(resolve(root, 'external_sources/MANIFEST.yaml'))).datasets
  const rejected = await Promise.all((await jsonFiles(resolve(root, 'gold_candidate_v0/rejected'))).map(readJson))
  return { episodes, manifests, rejected }
}
async function main() {
  const [command, input, output] = process.argv.slice(2)
  if (command === 'schemas') {
    for (const [name, schema] of Object.entries({ ExternalSourceRecordV1: sourceSchema, EpisodeCandidateV1: candidateSchema, GoldCandidateEpisodeV1: episodeSchema, ManifestEntryV1: manifestSchema })) {
      const path = resolve(root, 'gold_candidate_v0/schema', `${name}.json`)
      await mkdir(resolve(root, 'gold_candidate_v0/schema'), { recursive: true })
      await writeFile(path, JSON.stringify(schema, null, 2) + '\n')
    }
    console.log('4 canonical JSON schemas exported'); return
  }
  if (command === 'prepare-a' || command === 'prepare-b') {
    if (!input || !output) throw Error('input and new output path required')
    const value = await readJson(input)
    if (command === 'prepare-a' && validateCandidate(value).length) throw Error('Pass A requires a validated sanitized candidate')
    if (command === 'prepare-b' && validateDraft(value).length) throw Error('Pass B requires a valid sanitized annotation draft')
    await writeNew(output, command === 'prepare-a' ? reconstructionPrompt(value) : criticPrompt(value, annotationDigest(value)))
    console.log('Prompt prepared; model execution has NOT occurred'); return
  }
  const { episodes, manifests, rejected } = await corpus()
  if (command === 'accept') {
    if (!input) throw Error('episode input required')
    const episode = await readJson(input), manifest = manifests.find(m => m.dataset_id === episode.dataset_id)
    const errors = validateEpisode(episode, manifest)
    if (!errors.length) errors.push(...await verifyLocalEvidence(episode, manifest))
    if (!errors.length) errors.push(...await verifyRunReceipts(episode))
    const proposed = buildReport([...episodes, episode], manifests, rejected)
    errors.push(...proposed.errors)
    if (errors.length) {
      await writeNew(resolve(root, 'gold_candidate_v0/rejected', `${Date.now()}.json`), { episode_id: episode.episode_id ?? null, errors: [...new Set(errors)] })
      throw Error(`acceptance rejected: ${[...new Set(errors)].join('; ')}`)
    }
    await writeNew(resolve(root, 'gold_candidate_v0/episodes', `${episode.episode_id}.json`), episode)
    console.log(`Accepted ${episode.episode_id} for human review`); return
  }
  if (!['validate', 'report'].includes(command)) throw Error('usage: cli.mjs schemas|prepare-a|prepare-b|accept|validate|report [input] [output]')
  const report = buildReport(episodes, manifests, rejected)
  for (const e of episodes) {
    const manifest = manifests.find(m => m.dataset_id === e.dataset_id)
    if (validateEpisode(e, manifest).length) continue
    report.errors.push(...await verifyLocalEvidence(e, manifest), ...await verifyRunReceipts(e))
  }
  if (report.errors.length) report.complete = false
  if (command === 'report') {
    const directory = resolve(root, 'gold_candidate_v0/reports')
    await mkdir(directory, { recursive: true })
    await writeFile(resolve(directory, 'quality_and_coverage.json'), JSON.stringify(report, null, 2) + '\n')
    for (const checkpoint of [100, 250, 500, 1000]) {
      if (report.valid_episodes < checkpoint || report.errors.length) continue
      const discovery = ontologyReport(episodes, checkpoint)
      const path = resolve(directory, `ontology_discovery_${checkpoint}.md`)
      try { await writeNew(path + '.json', discovery) } catch (error) { if (error.code !== 'EEXIST') throw error }
      try {
        await writeFile(path, `# Ontology discovery at ${checkpoint}\n\nFinal Test episodes excluded: ${discovery.excluded_test_episodes}.\n\n\`\`\`json\n${JSON.stringify(discovery, null, 2)}\n\`\`\`\n\nReview questions: Does L0–L3 fit? Are Project/Outcome and Milestone/Coordination distinct? Do Decision, Artifact or Micro-Action require new node kinds? Which relations recur or lack observable evidence?\n`, { flag: 'wx' })
      } catch (error) { if (error.code !== 'EEXIST') throw error }
    }
  }
  console.log(JSON.stringify({ valid_episodes: report.valid_episodes, complete: report.complete, errors: report.errors,
    unmet_targets: Object.keys(report.targets).filter(k => !report.targets[k]) }, null, 2))
  if (!report.complete) process.exitCode = 2
}
main().catch(error => { console.error(`gold-candidate: ${error.message}`); process.exitCode = 1 })
