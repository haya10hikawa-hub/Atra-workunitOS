import { describe, expect, it } from "vitest";
import {
  createGoogleDocsFixtureConnector,
  createOpenTelemetryGitHubFixtureConnector,
  createPublicJiraFixtureConnector,
  createSyntheticSnapshot,
} from "@atra/connectors";
import { createDeterministicCandidateBatch, createFixtureSamplingOptions, deterministicEttinReranker, deterministicGteRetriever, fixtureRetrievalConfig } from "@atra/retrieval";
import { InMemoryGoldWorkflow, createFixtureAnnotation } from "@atra/gold";

describe("release analysis fields", () => {
  it("pins all twelve analysis axes without fabricating unavailable overlap or hierarchy values", () => {
    const snapshot = createSyntheticSnapshot([createPublicJiraFixtureConnector(), createOpenTelemetryGitHubFixtureConnector(), createGoogleDocsFixtureConnector()]);
    const batch = createDeterministicCandidateBatch(snapshot, fixtureRetrievalConfig, deterministicGteRetriever, deterministicEttinReranker, createFixtureSamplingOptions(snapshot));
    const candidate = batch.candidates[0];
    if (!candidate) throw new Error("candidate required");
    const workflow = new InMemoryGoldWorkflow(snapshot, [candidate]);
    for (const annotator of ["a", "b"]) {
      workflow.assign(candidate.candidate_pair_id, annotator, 1);
      workflow.appendAnnotation(createFixtureAnnotation(candidate, annotator, 1), annotator);
    }
    const frozen = workflow.freeze({ semantic_version: "0.1.0", dataset_split: "evaluation", guideline_version: "1.0.0" });
    const fields = frozen.analysis_fields[0];
    expect(fields).toBeDefined();
    expect(Object.keys(fields ?? {}).sort()).toEqual([
      "actor_time_overlap", "annotation_quality_state", "challenge_bucket", "evidence_length", "identifier_presence", "provider_pair", "relation_label", "reranker_score_band", "retrieval_score_band", "source_family", "work_hierarchy_relation", "work_type",
    ]);
    expect(fields?.actor_time_overlap).toBe("UNAVAILABLE");
    expect(fields?.work_hierarchy_relation).toBe("UNAVAILABLE");
  });
});
