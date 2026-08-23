import { CandidatePairSchema, candidatePairId, type CandidatePair } from "@atra/candidate-contracts";
import type { SourceSnapshot } from "@atra/connectors";
import { contentHash, type Chunk } from "@atra/source-contracts";

export interface RetrievalConfig {
  readonly gte_model: string;
  readonly gte_revision: string;
  readonly ettin_model: string;
  readonly ettin_revision: string;
}

export const fixtureRetrievalConfig: RetrievalConfig = Object.freeze({
  gte_model: "deterministic-token-gte",
  gte_revision: "fixture-v1",
  ettin_model: "deterministic-token-ettin",
  ettin_revision: "fixture-v1",
});

const requiredChallengeBuckets = Object.freeze([
  "same_identifier_different_work",
  "no_identifier_same_work",
  "same_people_time_different_work",
  "same_topic_different_acceptance",
  "parent_child_related",
  "milestone_task_related",
  "paraphrase_related_not_same",
  "high_score_not_same",
  "low_score_same",
  "sparse_unknown",
  "contradictory_unknown",
  "easy_positive_control",
  "easy_negative_control",
]);

export interface SamplingControl {
  readonly candidate_pair_id: string;
  readonly sampling_bucket: string;
  readonly sampling_reason: string;
}

export interface SamplingPolicy {
  readonly policy_version: string;
  readonly provider_pair_quotas: Readonly<Record<string, number>>;
  readonly challenge_bucket_quotas: Readonly<Record<string, number>>;
}

export interface SamplingOptions {
  readonly policy: SamplingPolicy;
  readonly controls: readonly SamplingControl[];
}

export function createFixtureSamplingOptions(snapshot: SourceSnapshot): SamplingOptions {
  const sourcesById = new Map(snapshot.source_records.map((source) => [source.source_record_id, source]));
  const pairIds = snapshot.chunks.flatMap((anchor, index) =>
    snapshot.chunks.slice(index + 1).flatMap((candidate) => {
      const anchorSource = sourcesById.get(anchor.source_record_id);
      const candidateSource = sourcesById.get(candidate.source_record_id);
      if (!anchorSource || !candidateSource || anchorSource.provider === candidateSource.provider) return [];
      return [candidatePairId(anchor.chunk_id, candidate.chunk_id)];
    }),
  );
  const controls = [...new Set(pairIds)]
    .sort()
    .slice(0, requiredChallengeBuckets.length)
    .map((candidate_pair_id, index) => ({
      candidate_pair_id,
      sampling_bucket: requiredChallengeBuckets[index] ?? "easy_negative_control",
      sampling_reason: "Synthetic construction control; not a human judgment.",
    }));
  return Object.freeze({
    policy: Object.freeze({
      policy_version: "fixture-policy-v2",
      provider_pair_quotas: Object.freeze({ "github:google-docs": 6, "github:jira": 6, "google-docs:jira": 6 }),
      challenge_bucket_quotas: Object.freeze(Object.fromEntries(requiredChallengeBuckets.map((bucket) => [bucket, 1]))),
    }),
    controls: Object.freeze(controls),
  });
}

export interface Retriever {
  score(anchor: string, candidate: string): number;
}

export interface Reranker {
  score(anchor: string, candidate: string): number;
}

function tokenSet(value: string): Set<string> {
  return new Set(value.toLowerCase().match(/[a-z0-9]+/g) ?? []);
}

function jaccard(anchor: string, candidate: string): number {
  const left = tokenSet(anchor);
  const right = tokenSet(candidate);
  const union = new Set([...left, ...right]);
  const intersection = [...left].filter((token) => right.has(token));
  return union.size === 0 ? 0 : intersection.length / union.size;
}

export const deterministicGteRetriever: Retriever = Object.freeze({ score: jaccard });
export const deterministicEttinReranker: Reranker = Object.freeze({ score: jaccard });

export interface CandidateBatch {
  readonly candidates: readonly CandidatePair[];
  readonly retrieval_config: RetrievalConfig;
  readonly sampling_report: SamplingReport;
}

export interface EmbeddingModelLineage {
  readonly model_id: string;
  readonly model_revision: string;
  readonly tokenizer_revision: string;
  readonly dimension: number;
  readonly normalization: "l2";
  readonly truncation: "right";
  readonly dtype: string;
  readonly inference_mode: "eval";
  readonly config_hash: string;
  readonly adapter_kind: "production-hf-service" | "deterministic-test-double";
}

export interface EmbeddingRecord {
  readonly chunk_id: string;
  readonly vector: readonly number[];
  readonly input_hash: string;
  readonly output_hash: string;
  readonly lineage: EmbeddingModelLineage;
}

export interface EmbeddingProvider {
  embed(chunks: readonly Chunk[], lineage: Omit<EmbeddingModelLineage, "adapter_kind">): readonly EmbeddingRecord[];
}

export interface VectorRetrievalOptions {
  readonly top_k: number;
  readonly index_version: string;
}

export interface VectorRetrievalHit {
  readonly candidate_pair_id: string;
  readonly anchor_chunk_id: string;
  readonly candidate_chunk_id: string;
  readonly retrieval_score: number;
  readonly retrieval_rank: number;
  readonly index_version: string;
  readonly retrieval_config_hash: string;
}

export interface FeatureSamplingPolicy {
  readonly policy_version: string;
  readonly seed: string;
  readonly max_pairs: number;
  readonly bucket_quotas: Readonly<Record<string, number>>;
}

export interface SamplingReport {
  readonly policy_version: string;
  readonly score_bands: Readonly<Record<"low" | "medium" | "high", number>>;
  readonly provider_pairs: Readonly<Record<string, QuotaReport>>;
  readonly challenge_buckets: Readonly<Record<string, QuotaReport>>;
}

export interface QuotaReport {
  readonly requested: number;
  readonly available: number;
  readonly selected: number;
}

function normalize(vector: readonly number[]): readonly number[] {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) throw new Error("embedding vector cannot be all zero");
  return Object.freeze(vector.map((value) => value / norm));
}

function stableVector(text: string, dimension: number): readonly number[] {
  const digest = contentHash(text);
  const values = Array.from({ length: dimension }, (_, index) => {
    const offset = (index * 2) % digest.length;
    return Number.parseInt(digest.slice(offset, offset + 2), 16) / 255;
  });
  return normalize(values);
}

function vectorOutputHash(vector: readonly number[]): string {
  return contentHash(JSON.stringify(vector));
}

export const deterministicEmbeddingProvider: EmbeddingProvider = Object.freeze({
  embed(chunks: readonly Chunk[], lineage: Omit<EmbeddingModelLineage, "adapter_kind">) {
    return Object.freeze(chunks.map((chunk) => {
      const vector = stableVector(chunk.text, lineage.dimension);
      return Object.freeze({
        chunk_id: chunk.chunk_id,
        vector,
        input_hash: contentHash(chunk.text),
        output_hash: vectorOutputHash(vector),
        lineage: Object.freeze({ ...lineage, adapter_kind: "deterministic-test-double" as const }),
      });
    }));
  },
});

function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
  if (left.length !== right.length) throw new Error("embedding dimensions must match");
  return left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0);
}

export class LocalVectorIndex {
  private readonly embeddingsByChunkId: ReadonlyMap<string, EmbeddingRecord>;
  private readonly chunksById: ReadonlyMap<string, Chunk>;

  public constructor(
    private readonly snapshot: SourceSnapshot,
    embeddings: readonly EmbeddingRecord[],
    private readonly indexVersion: string,
  ) {
    this.embeddingsByChunkId = new Map(embeddings.map((embedding) => [embedding.chunk_id, embedding]));
    this.chunksById = new Map(snapshot.chunks.map((chunk) => [chunk.chunk_id, chunk]));
    for (const chunk of snapshot.chunks) {
      if (!this.embeddingsByChunkId.has(chunk.chunk_id)) throw new Error(`missing embedding for chunk ${chunk.chunk_id}`);
    }
  }

  public queryCrossProviderTopK(anchorChunkId: string, topK: number): readonly VectorRetrievalHit[] {
    if (topK < 1) throw new Error("top_k must be positive");
    const anchor = this.chunksById.get(anchorChunkId);
    const anchorEmbedding = this.embeddingsByChunkId.get(anchorChunkId);
    if (!anchor || !anchorEmbedding) throw new Error(`unknown anchor chunk ${anchorChunkId}`);
    const anchorSource = this.sourceProvider(anchor);
    const hits = this.snapshot.chunks.flatMap((candidate): VectorRetrievalHit[] => {
      if (candidate.chunk_id === anchor.chunk_id) return [];
      if (candidate.content_hash === anchor.content_hash) return [];
      const candidateProvider = this.sourceProvider(candidate);
      if (candidateProvider === anchorSource) return [];
      const candidateEmbedding = this.embeddingsByChunkId.get(candidate.chunk_id);
      if (!candidateEmbedding) throw new Error(`missing embedding for chunk ${candidate.chunk_id}`);
      return [{
        candidate_pair_id: candidatePairId(anchor.chunk_id, candidate.chunk_id),
        anchor_chunk_id: anchor.chunk_id,
        candidate_chunk_id: candidate.chunk_id,
        retrieval_score: cosineSimilarity(anchorEmbedding.vector, candidateEmbedding.vector),
        retrieval_rank: 0,
        index_version: this.indexVersion,
        retrieval_config_hash: anchorEmbedding.lineage.config_hash,
      }];
    });
    return Object.freeze(hits
      .sort((left, right) => right.retrieval_score - left.retrieval_score || left.candidate_pair_id.localeCompare(right.candidate_pair_id))
      .slice(0, topK)
      .map((hit, index) => Object.freeze({ ...hit, retrieval_rank: index + 1 })));
  }

  private sourceProvider(chunk: Chunk): string {
    const source = this.snapshot.source_records.find((item) => item.source_record_id === chunk.source_record_id);
    if (!source) throw new Error(`missing source for chunk ${chunk.chunk_id}`);
    return source.provider;
  }
}

function scoreBand(score: number): "low" | "medium" | "high" {
  if (score < 1 / 3) return "low";
  if (score < 2 / 3) return "medium";
  return "high";
}

function providerPair(anchorProvider: string, candidateProvider: string): string {
  return [anchorProvider, candidateProvider].sort().join(":");
}

function increment(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

export function createDeterministicCandidateBatch(
  snapshot: SourceSnapshot,
  config: RetrievalConfig,
  retriever: Retriever,
  reranker: Reranker,
  options: SamplingOptions,
): CandidateBatch {
  const candidatesById = new Map<string, CandidatePair>();
  const controlsByPairId = new Map(options.controls.map((control) => [control.candidate_pair_id, control]));
  const chunksById = new Map(snapshot.chunks.map((chunk) => [chunk.chunk_id, chunk]));
  const sourcesById = new Map(snapshot.source_records.map((source) => [source.source_record_id, source]));
  const providerPairForCandidate = (candidate: CandidatePair): string => {
    const anchor = chunksById.get(candidate.anchor_chunk_id);
    const compared = chunksById.get(candidate.candidate_chunk_id);
    if (!anchor || !compared) throw new Error("candidate must reference snapshot chunks");
    const anchorSource = sourcesById.get(anchor.source_record_id);
    const candidateSource = sourcesById.get(compared.source_record_id);
    if (!anchorSource || !candidateSource) throw new Error("candidate chunks must have source records");
    return providerPair(anchorSource.provider, candidateSource.provider);
  };
  for (const [index, anchor] of snapshot.chunks.entries()) {
    for (const candidate of snapshot.chunks.slice(index + 1)) {
      if (anchor.chunk_id === candidate.chunk_id) continue;
      const anchorSource = snapshot.source_records.find(
        (source) => source.source_record_id === anchor.source_record_id,
      );
      const candidateSource = snapshot.source_records.find(
        (source) => source.source_record_id === candidate.source_record_id,
      );
      if (!anchorSource || !candidateSource || anchorSource.provider === candidateSource.provider) continue;
      const candidatePair = CandidatePairSchema.parse({
        candidate_pair_id: candidatePairId(anchor.chunk_id, candidate.chunk_id),
        anchor_chunk_id: anchor.chunk_id,
        candidate_chunk_id: candidate.chunk_id,
        retrieval_model: config.gte_model,
        retrieval_model_version: config.gte_revision,
        retrieval_score: retriever.score(anchor.text, candidate.text),
        reranker_model: config.ettin_model,
        reranker_version: config.ettin_revision,
        reranker_score: reranker.score(anchor.text, candidate.text),
        sampling_bucket: controlsByPairId.get(candidatePairId(anchor.chunk_id, candidate.chunk_id))?.sampling_bucket ?? "uncontrolled",
        sampling_reason: controlsByPairId.get(candidatePairId(anchor.chunk_id, candidate.chunk_id))?.sampling_reason ?? "No construction control selected this pair.",
        policy_version: options.policy.policy_version,
        created_at: "2026-08-21T10:00:00.000Z",
      });
      candidatesById.set(candidatePair.candidate_pair_id, candidatePair);
    }
  }
  const candidates = [...candidatesById.values()].sort((left, right) =>
    left.candidate_pair_id.localeCompare(right.candidate_pair_id),
  );
  const selected: CandidatePair[] = [];
  const selectedByProviderPair: Record<string, number> = {};
  const selectedByChallengeBucket: Record<string, number> = {};
  for (const candidate of candidates) {
    const control = controlsByPairId.get(candidate.candidate_pair_id);
    if (!control) continue;
    const pair = providerPairForCandidate(candidate);
    const providerQuota = options.policy.provider_pair_quotas[pair] ?? 0;
    const challengeQuota = options.policy.challenge_bucket_quotas[control.sampling_bucket] ?? 0;
    if ((selectedByProviderPair[pair] ?? 0) >= providerQuota) continue;
    if ((selectedByChallengeBucket[control.sampling_bucket] ?? 0) >= challengeQuota) continue;
    selected.push(candidate);
    increment(selectedByProviderPair, pair);
    increment(selectedByChallengeBucket, control.sampling_bucket);
  }
  const score_bands: Record<"low" | "medium" | "high", number> = { low: 0, medium: 0, high: 0 };
  const availableByProviderPair: Record<string, number> = {};
  const availableByChallengeBucket: Record<string, number> = {};
  for (const candidate of candidates) {
    const control = controlsByPairId.get(candidate.candidate_pair_id);
    if (!control) continue;
    increment(availableByProviderPair, providerPairForCandidate(candidate));
    increment(availableByChallengeBucket, control.sampling_bucket);
  }
  for (const candidate of selected) {
    score_bands[scoreBand(candidate.reranker_score)] += 1;
  }
  const quotaReport = (
    quotas: Readonly<Record<string, number>>,
    available: Record<string, number>,
    selectedCounts: Record<string, number>,
  ): Record<string, QuotaReport> =>
    Object.fromEntries(
      Object.keys(quotas).map((key) => [
        key,
        Object.freeze({ requested: quotas[key] ?? 0, available: available[key] ?? 0, selected: selectedCounts[key] ?? 0 }),
      ]),
    );
  return Object.freeze({
    candidates: Object.freeze(selected),
    retrieval_config: config,
    sampling_report: Object.freeze({
      policy_version: options.policy.policy_version,
      score_bands: Object.freeze(score_bands),
      provider_pairs: Object.freeze(quotaReport(options.policy.provider_pair_quotas, availableByProviderPair, selectedByProviderPair)),
      challenge_buckets: Object.freeze(quotaReport(options.policy.challenge_bucket_quotas, availableByChallengeBucket, selectedByChallengeBucket)),
    }),
  });
}

export function createVectorCandidateBatch(
  snapshot: SourceSnapshot,
  config: RetrievalConfig,
  embeddings: readonly EmbeddingRecord[],
  reranker: Reranker,
  options: VectorRetrievalOptions,
): CandidateBatch {
  const index = new LocalVectorIndex(snapshot, embeddings, options.index_version);
  const bestHitsByPairId = new Map<string, VectorRetrievalHit>();
  for (const chunk of snapshot.chunks) {
    for (const hit of index.queryCrossProviderTopK(chunk.chunk_id, options.top_k)) {
      const current = bestHitsByPairId.get(hit.candidate_pair_id);
      if (!current || hit.retrieval_score > current.retrieval_score || (hit.retrieval_score === current.retrieval_score && hit.retrieval_rank < current.retrieval_rank)) {
        bestHitsByPairId.set(hit.candidate_pair_id, hit);
      }
    }
  }
  const chunksById = new Map(snapshot.chunks.map((chunk) => [chunk.chunk_id, chunk]));
  const candidates = [...bestHitsByPairId.values()]
    .sort((left, right) => right.retrieval_score - left.retrieval_score || left.candidate_pair_id.localeCompare(right.candidate_pair_id))
    .map((hit) => {
      const anchor = chunksById.get(hit.anchor_chunk_id);
      const candidate = chunksById.get(hit.candidate_chunk_id);
      if (!anchor || !candidate) throw new Error("retrieval hit references missing chunks");
      return CandidatePairSchema.parse({
        candidate_pair_id: hit.candidate_pair_id,
        anchor_chunk_id: hit.anchor_chunk_id,
        candidate_chunk_id: hit.candidate_chunk_id,
        retrieval_model: config.gte_model,
        retrieval_model_version: config.gte_revision,
        retrieval_score: hit.retrieval_score,
        reranker_model: config.ettin_model,
        reranker_version: config.ettin_revision,
        reranker_score: reranker.score(anchor.text, candidate.text),
        sampling_bucket: "vector_topk_unsampled",
        sampling_reason: `Selected by ${hit.index_version} cross-provider top-${options.top_k}; sampling policy not yet applied.`,
        policy_version: "vector-retrieval-v1",
        created_at: "2026-08-21T10:00:00.000Z",
      });
    });
  const score_bands: Record<"low" | "medium" | "high", number> = { low: 0, medium: 0, high: 0 };
  const selectedByProviderPair: Record<string, number> = {};
  const sourcesByChunkId = new Map(snapshot.chunks.map((chunk) => {
    const source = snapshot.source_records.find((record) => record.source_record_id === chunk.source_record_id);
    if (!source) throw new Error(`missing source for chunk ${chunk.chunk_id}`);
    return [chunk.chunk_id, source.provider];
  }));
  for (const candidate of candidates) {
    score_bands[scoreBand(candidate.reranker_score)] += 1;
    increment(selectedByProviderPair, providerPair(String(sourcesByChunkId.get(candidate.anchor_chunk_id)), String(sourcesByChunkId.get(candidate.candidate_chunk_id))));
  }
  return Object.freeze({
    candidates: Object.freeze(candidates),
    retrieval_config: config,
    sampling_report: Object.freeze({
      policy_version: "vector-retrieval-v1",
      score_bands: Object.freeze(score_bands),
      provider_pairs: Object.freeze(Object.fromEntries(Object.entries(selectedByProviderPair).map(([key, selected]) => [key, Object.freeze({ requested: selected, available: selected, selected })]))),
      challenge_buckets: Object.freeze({ vector_topk_unsampled: Object.freeze({ requested: candidates.length, available: candidates.length, selected: candidates.length }) }),
    }),
  });
}

function candidateTexts(snapshot: SourceSnapshot, candidate: CandidatePair): { readonly anchor: string; readonly compared: string } {
  const chunksById = new Map(snapshot.chunks.map((chunk) => [chunk.chunk_id, chunk]));
  const anchor = chunksById.get(candidate.anchor_chunk_id);
  const compared = chunksById.get(candidate.candidate_chunk_id);
  if (!anchor || !compared) throw new Error("candidate references missing chunks");
  return { anchor: anchor.text, compared: compared.text };
}

function featureBucket(snapshot: SourceSnapshot, candidate: CandidatePair): string {
  const { anchor, compared } = candidateTexts(snapshot, candidate);
  const combined = `${anchor}\n${compared}`;
  const hasIdentifier = /(?:\b[A-Z][A-Z0-9]+-\d+\b|#\d+\b)/.test(combined);
  if (candidate.reranker_score >= 2 / 3 && candidate.retrieval_score >= 2 / 3) return hasIdentifier ? "high_score_identifier_review" : "high_score_semantic_review";
  if (candidate.reranker_score < 1 / 3 && candidate.retrieval_score < 1 / 3) return hasIdentifier ? "low_score_identifier_review" : "low_score_semantic_review";
  return "ambiguous_score_review";
}

function seededOrder(seed: string, candidate: CandidatePair): string {
  return contentHash([seed, candidate.candidate_pair_id, candidate.retrieval_score.toFixed(12), candidate.reranker_score.toFixed(12)].join("\n"));
}

export function createFeatureSampledCandidateBatch(
  snapshot: SourceSnapshot,
  input: CandidateBatch,
  policy: FeatureSamplingPolicy,
): CandidateBatch {
  if (policy.max_pairs < 1) throw new Error("max_pairs must be positive");
  const availableByBucket: Record<string, number> = {};
  const selectedByBucket: Record<string, number> = {};
  const selected: CandidatePair[] = [];
  const candidates = [...input.candidates]
    .map((candidate) => ({ candidate, bucket: featureBucket(snapshot, candidate) }))
    .sort((left, right) => seededOrder(policy.seed, left.candidate).localeCompare(seededOrder(policy.seed, right.candidate)));
  for (const { bucket } of candidates) increment(availableByBucket, bucket);
  for (const { candidate, bucket } of candidates) {
    if (selected.length >= policy.max_pairs) break;
    const quota = policy.bucket_quotas[bucket] ?? 0;
    if ((selectedByBucket[bucket] ?? 0) >= quota) continue;
    selected.push(CandidatePairSchema.parse({
      ...candidate,
      sampling_bucket: bucket,
      sampling_reason: `Feature-based deterministic sampling using ${policy.policy_version}; seed=${policy.seed}.`,
      policy_version: policy.policy_version,
    }));
    increment(selectedByBucket, bucket);
  }
  const score_bands: Record<"low" | "medium" | "high", number> = { low: 0, medium: 0, high: 0 };
  const providerCounts: Record<string, number> = {};
  const sourcesByChunkId = new Map(snapshot.chunks.map((chunk) => {
    const source = snapshot.source_records.find((record) => record.source_record_id === chunk.source_record_id);
    if (!source) throw new Error(`missing source for chunk ${chunk.chunk_id}`);
    return [chunk.chunk_id, source.provider];
  }));
  for (const candidate of selected) {
    score_bands[scoreBand(candidate.reranker_score)] += 1;
    increment(providerCounts, providerPair(String(sourcesByChunkId.get(candidate.anchor_chunk_id)), String(sourcesByChunkId.get(candidate.candidate_chunk_id))));
  }
  const bucketReports = Object.fromEntries(Object.keys(policy.bucket_quotas).map((bucket) => [
    bucket,
    Object.freeze({ requested: policy.bucket_quotas[bucket] ?? 0, available: availableByBucket[bucket] ?? 0, selected: selectedByBucket[bucket] ?? 0 }),
  ]));
  return Object.freeze({
    candidates: Object.freeze(selected),
    retrieval_config: input.retrieval_config,
    sampling_report: Object.freeze({
      policy_version: policy.policy_version,
      score_bands: Object.freeze(score_bands),
      provider_pairs: Object.freeze(Object.fromEntries(Object.entries(providerCounts).map(([key, count]) => [key, Object.freeze({ requested: count, available: count, selected: count })]))),
      challenge_buckets: Object.freeze(bucketReports),
    }),
  });
}
