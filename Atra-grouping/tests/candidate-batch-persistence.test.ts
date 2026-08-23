import { describe, expect, it } from "vitest";
import { createGoogleDocsFixtureConnector, createOpenTelemetryGitHubFixtureConnector, createPublicJiraFixtureConnector, createSyntheticSnapshot } from "@atra/connectors";
import { SqliteGoldEventRepository } from "@atra/gold/sqlite";
import { contentHash, deterministicId } from "@atra/source-contracts";
import { createVectorCandidateBatch, deterministicEmbeddingProvider, deterministicEttinReranker, fixtureRetrievalConfig } from "@atra/retrieval";

const lineage = Object.freeze({
  model_id: "Alibaba-NLP/gte-multilingual-base",
  model_revision: "9bbca17d9273fd0d03d5725c7a4b0f6b45142062",
  tokenizer_revision: "9bbca17d9273fd0d03d5725c7a4b0f6b45142062",
  dimension: 16,
  normalization: "l2" as const,
  truncation: "right" as const,
  dtype: "float16",
  inference_mode: "eval" as const,
  config_hash: contentHash("candidate-batch-persistence-test"),
});

describe("candidate batch persistence", () => {
  it("stores vector candidate batches immutably for later blind annotation", () => {
    const repository = new SqliteGoldEventRepository(SqliteGoldEventRepository.inMemoryConnection());
    const snapshot = createSyntheticSnapshot([
      createPublicJiraFixtureConnector(),
      createOpenTelemetryGitHubFixtureConnector(),
      createGoogleDocsFixtureConnector(),
    ]);
    const batch = createVectorCandidateBatch(
      snapshot,
      fixtureRetrievalConfig,
      deterministicEmbeddingProvider.embed(snapshot.chunks, lineage),
      deterministicEttinReranker,
      { top_k: 2, index_version: "local-vector-index-v1" },
    );
    const persisted = {
      candidate_batch_id: deterministicId("cb", [snapshot.source_snapshot_id, lineage.config_hash, "local-vector-index-v1"]),
      source_snapshot_id: snapshot.source_snapshot_id,
      retrieval_config_hash: lineage.config_hash,
      index_version: "local-vector-index-v1",
      candidate_pairs: batch.candidates,
      created_at: "2026-08-21T10:00:00.000Z",
    };

    repository.storeCandidateBatch(persisted);
    repository.storeCandidateBatch(persisted);
    expect(repository.candidateBatchById(persisted.candidate_batch_id)).toEqual(persisted);
    expect(() => repository.storeCandidateBatch({ ...persisted, index_version: "different-index" })).toThrow(/immutable different content/);
  });
});
