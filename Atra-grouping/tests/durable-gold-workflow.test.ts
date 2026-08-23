import { describe, expect, it } from "vitest";
import { createGoogleDocsFixtureConnector, createOpenTelemetryGitHubFixtureConnector, createPublicJiraFixtureConnector, createSyntheticSnapshot } from "@atra/connectors";
import { createDeterministicCandidateBatch, createFixtureSamplingOptions, deterministicEttinReranker, deterministicGteRetriever, fixtureRetrievalConfig } from "@atra/retrieval";
import { DurableGoldWorkflow, SqliteGoldEventRepository } from "@atra/gold/sqlite";
import { createFixtureAnnotation } from "@atra/gold";

function setup() {
  const snapshot = createSyntheticSnapshot([createPublicJiraFixtureConnector(), createOpenTelemetryGitHubFixtureConnector(), createGoogleDocsFixtureConnector()]);
  const batch = createDeterministicCandidateBatch(snapshot, fixtureRetrievalConfig, deterministicGteRetriever, deterministicEttinReranker, createFixtureSamplingOptions(snapshot));
  const candidate = batch.candidates[0];
  if (!candidate) throw new Error("candidate required");
  return { snapshot, candidate };
}

describe("durable Gold workflow adapter", () => {
  it("rehydrates append-only workflow state and persists freeze metadata plus the reference-safe artifact", () => {
    const { snapshot, candidate } = setup();
    const repository = new SqliteGoldEventRepository(SqliteGoldEventRepository.inMemoryConnection());
    const first = new DurableGoldWorkflow(snapshot, [candidate], repository, new URL("../", import.meta.url).pathname);
    first.assign(candidate.candidate_pair_id, "annotator-a", 1);
    first.assign(candidate.candidate_pair_id, "annotator-b", 1);
    first.appendAnnotation(createFixtureAnnotation(candidate, "annotator-a", 1), "annotator-a");
    const second = createFixtureAnnotation(candidate, "annotator-b", 1, { relation: "RELATED" });
    first.appendAnnotation(second, "annotator-b");
    first.adjudicate(candidate.candidate_pair_id, {
      candidate_pair_id: candidate.candidate_pair_id,
      relation: "UNKNOWN",
      anchor_work_type: "UNKNOWN",
      candidate_work_type: "UNKNOWN",
      input_annotation_ids: [createFixtureAnnotation(candidate, "annotator-a", 1).annotation_id, second.annotation_id],
      adjudicator_id: "adjudicator-a",
      decision_reason: "Fixture disagreement requires explicit human resolution.",
      guideline_version: "1.0.0",
    });

    const reopened = new DurableGoldWorkflow(snapshot, [candidate], repository, new URL("../", import.meta.url).pathname);
    expect(reopened.annotationPayload(candidate.candidate_pair_id, "annotator-a").candidate_pair_id).toBe(candidate.candidate_pair_id);
    expect(() => reopened.assign(candidate.candidate_pair_id, "annotator-a", 1)).toThrow(/already assigned/);
    const frozen = reopened.freeze({ semantic_version: "0.2.1", dataset_split: "evaluation", guideline_version: "1.0.0" });
    expect(repository.releaseById(frozen.release.release_id)).toEqual(frozen.release);
    expect(frozen.artifact_path).toContain(`/data/generated/releases/${frozen.release.manifest_hash}/`);
    expect(frozen.analysis_fields[0]?.annotation_quality_state).toBe("ADJUDICATED");
  });
});
