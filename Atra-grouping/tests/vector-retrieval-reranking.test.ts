import { describe, expect, it } from "vitest";
import {
  createGoogleDocsFixtureConnector,
  createOpenTelemetryGitHubFixtureConnector,
  createPublicJiraFixtureConnector,
  createSyntheticSnapshot,
} from "@atra/connectors";
import {
  createVectorCandidateBatch,
  createFeatureSampledCandidateBatch,
  deterministicEmbeddingProvider,
  deterministicEttinReranker,
  fixtureRetrievalConfig,
  LocalVectorIndex,
} from "@atra/retrieval";
import { contentHash } from "@atra/source-contracts";

const lineage = Object.freeze({
  model_id: "Alibaba-NLP/gte-multilingual-base",
  model_revision: "9bbca17d9273fd0d03d5725c7a4b0f6b45142062",
  tokenizer_revision: "9bbca17d9273fd0d03d5725c7a4b0f6b45142062",
  dimension: 16,
  normalization: "l2" as const,
  truncation: "right" as const,
  dtype: "float16",
  inference_mode: "eval" as const,
  config_hash: contentHash("gte-multilingual-base:test-config"),
});

function snapshot() {
  return createSyntheticSnapshot([
    createPublicJiraFixtureConnector(),
    createOpenTelemetryGitHubFixtureConnector(),
    createGoogleDocsFixtureConnector(),
  ]);
}

describe("vector retrieval and reranking production boundary", () => {
  it("creates lineage-rich embeddings and deterministic cross-provider top-k hits", () => {
    const sourceSnapshot = snapshot();
    const embeddings = deterministicEmbeddingProvider.embed(sourceSnapshot.chunks, lineage);
    const first = new LocalVectorIndex(sourceSnapshot, embeddings, "local-vector-index-v1").queryCrossProviderTopK(sourceSnapshot.chunks[0]?.chunk_id ?? "", 3);
    const second = new LocalVectorIndex(sourceSnapshot, embeddings, "local-vector-index-v1").queryCrossProviderTopK(sourceSnapshot.chunks[0]?.chunk_id ?? "", 3);

    expect(first).toEqual(second);
    expect(embeddings[0]?.lineage).toMatchObject({ model_id: lineage.model_id, adapter_kind: "deterministic-test-double" });
    expect(embeddings[0]?.input_hash).toHaveLength(64);
    expect(embeddings[0]?.output_hash).toHaveLength(64);
    expect(first.length).toBeGreaterThan(0);
    expect(first.every((hit) => hit.anchor_chunk_id !== hit.candidate_chunk_id)).toBe(true);
    expect(first.map((hit) => hit.retrieval_rank)).toEqual(first.map((_, index) => index + 1));
  });

  it("excludes exact duplicate chunk text and emits reranked candidate pairs without Gold access", () => {
    const sourceSnapshot = snapshot();
    const duplicate = sourceSnapshot.chunks.find((chunk) => chunk.chunker_version === "github-issue-pr-body-comment-v1");
    if (!duplicate) throw new Error("duplicate fixture chunk required");
    const duplicatedSnapshot = Object.freeze({
      ...sourceSnapshot,
      chunks: Object.freeze([...sourceSnapshot.chunks, { ...duplicate, chunk_id: "ch_duplicate_for_vector_test" }]),
    });
    const embeddings = deterministicEmbeddingProvider.embed(duplicatedSnapshot.chunks, lineage);
    const batch = createVectorCandidateBatch(
      duplicatedSnapshot,
      fixtureRetrievalConfig,
      embeddings,
      deterministicEttinReranker,
      { top_k: 4, index_version: "local-vector-index-v1" },
    );

    expect(batch.candidates.length).toBeGreaterThan(0);
    expect(batch.candidates.every((candidate) => candidate.sampling_bucket === "vector_topk_unsampled")).toBe(true);
    expect(batch.candidates.some((candidate) =>
      [candidate.anchor_chunk_id, candidate.candidate_chunk_id].includes(duplicate.chunk_id) &&
      [candidate.anchor_chunk_id, candidate.candidate_chunk_id].includes("ch_duplicate_for_vector_test"),
    )).toBe(false);
    expect(batch.sampling_report.challenge_buckets.vector_topk_unsampled?.selected).toBe(batch.candidates.length);
  });

  it("samples vector candidates by deterministic feature buckets and reports shortages", () => {
    const sourceSnapshot = snapshot();
    const unsampled = createVectorCandidateBatch(
      sourceSnapshot,
      fixtureRetrievalConfig,
      deterministicEmbeddingProvider.embed(sourceSnapshot.chunks, lineage),
      deterministicEttinReranker,
      { top_k: 4, index_version: "local-vector-index-v1" },
    );
    const policy = Object.freeze({
      policy_version: "feature-sampling-v1",
      seed: "gold-pilot-seed",
      max_pairs: 3,
      bucket_quotas: Object.freeze({
        high_score_semantic_review: 1,
        high_score_identifier_review: 1,
        ambiguous_score_review: 1,
        low_score_semantic_review: 1,
      }),
    });
    const first = createFeatureSampledCandidateBatch(sourceSnapshot, unsampled, policy);
    const second = createFeatureSampledCandidateBatch(sourceSnapshot, unsampled, policy);

    expect(first).toEqual(second);
    expect(first.candidates.length).toBeLessThanOrEqual(3);
    expect(first.candidates.every((candidate) => candidate.policy_version === "feature-sampling-v1")).toBe(true);
    expect(Object.keys(first.sampling_report.challenge_buckets)).toEqual(Object.keys(policy.bucket_quotas));
    expect(Object.values(first.sampling_report.challenge_buckets).some((report) => report.available < report.requested)).toBe(true);
  });
});
