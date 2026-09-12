import { validateCorpus } from '../validate/integrity.mjs'
import { families, levels, pairwise, structural } from '../validate/schema.mjs'
export const quotas = { jira: 200, smartshark: 180, slack: 120, disco: 80, wikimedia: 120, japanese_oss: 160, figma: 60, apache_mail: 80 }
const count = (values) => Object.fromEntries([...new Set(values)].sort().map(k => [k, values.filter(v => v === k).length]))
export function buildReport(episodes, manifests, rejected) {
  const { valid, errors } = validateCorpus(episodes, manifests)
  const languages = count(valid.map(e => e.language)), sources = count(valid.map(e => e.provenance.source_family))
  const projects = count(valid.map(e => e.project_id)), ecosystems = count(valid.map(e => e.ecosystem))
  const difficulties = count(valid.map(e => e.difficulty)), cases = count(valid.flatMap(e => e.hard_cases))
  const ambiguous = valid.filter(e => e.ambiguities.length).length
  const targets = {
    count: valid.length >= 1000, schema_and_integrity: errors.length === 0 && episodes.length === valid.length,
    english: (languages.en ?? 0) >= 700, japanese: (languages.ja ?? 0) >= 220, mixed: (languages.mixed ?? 0) >= 80,
    source_families: families.every(f => (sources[f] ?? 0) >= Math.ceil(quotas[f] * 0.9) && (sources[f] ?? 0) <= Math.floor(quotas[f] * 1.1)),
    project_diversity: Object.keys(projects).length >= 30 && Object.values(projects).every(n => n <= 50),
    japanese_repository_cap: Object.values(count(valid.filter(e => e.provenance.source_family === 'japanese_oss').map(e => e.project_id))).every(n => n <= 40),
    ecosystem_cap: Object.values(ecosystems).every(n => n <= valid.length * 0.25),
    hard_adversarial: (difficulties.hard ?? 0) + (difficulties.adversarial ?? 0) >= 550,
    adversarial: (difficulties.adversarial ?? 0) >= 200,
    hard_positive: (cases.HARD_POSITIVE ?? 0) >= 150, hard_negative: (cases.HARD_NEGATIVE ?? 0) >= 200,
    uncertainty: ambiguous >= 150, nontrivial: (cases.NONTRIVIAL ?? 0) >= Math.ceil(valid.length * 0.55) && valid.length > 0,
  }
  const relations = count(valid.flatMap(e => e.relations.map(r => r.type)))
  return { complete: Object.values(targets).every(Boolean), valid_episodes: valid.length, submitted_episodes: episodes.length,
    rejected_candidates: rejected.length, human_verified_episodes: 0, targets, errors, languages, sources, projects, ecosystems,
    difficulties, work_types: count(valid.map(e => e.work_type)), work_levels: count(valid.flatMap(e => e.work_nodes.map(n => n.level))),
    relations: Object.fromEntries([...pairwise, ...structural].map(k => [k, relations[k] ?? 0])), hard_cases: cases,
    ambiguous_episodes: ambiguous, splits: count(valid.map(e => e.split)),
    review_queue: valid.filter(e => e.difficulty === 'adversarial' || e.split === 'TEST-CANDIDATE' || e.work_nodes.some(n => n.level === 'ONTOLOGY_MISMATCH')).map(e => e.episode_id),
    quality: { schema_failure_rate: episodes.length ? (episodes.length - valid.length) / episodes.length : null,
      unsupported_claim_rate: valid.length ? 0 : null, critic_rejection_rate: null, duplicate_rate: null,
      note: 'No denominator means unmeasured. Critic rejection and duplicate rates require acquisition/run logs.' },
  }
}
export function ontologyReport(episodes, checkpoint) {
  if (episodes.length < checkpoint) throw Error(`checkpoint ${checkpoint} not reached`)
  const selected = episodes.slice(0, checkpoint).filter(e => e.split !== 'TEST-CANDIDATE')
  const counts = count(selected.flatMap(e => e.work_nodes.map(n => n.level)))
  const mismatches = selected.flatMap(e => e.ambiguities.filter(a => ['ONTOLOGY_MISMATCH', 'UNKNOWN_LEVEL', 'UNKNOWN_RELATION'].includes(a.kind)).map(a => ({ episode_id: e.episode_id, ...a })))
  return { checkpoint, discovery_episodes: selected.length, excluded_test_episodes: checkpoint - selected.length,
    levels: Object.fromEntries(levels.map(l => [l, counts[l] ?? 0])), mismatches,
    conclusion: 'Evidence inventory only; ontology revision requires recurring supported examples. Final Test is excluded.' }
}
