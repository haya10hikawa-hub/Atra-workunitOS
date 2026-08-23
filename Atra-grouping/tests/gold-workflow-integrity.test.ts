import { describe, expect, it } from "vitest";
import { createGoogleDocsFixtureConnector, createOpenTelemetryGitHubFixtureConnector, createPublicJiraFixtureConnector, createSyntheticSnapshot } from "@atra/connectors";
import { createDeterministicCandidateBatch, createFixtureSamplingOptions, deterministicEttinReranker, deterministicGteRetriever, fixtureRetrievalConfig } from "@atra/retrieval";
import { InMemoryGoldWorkflow, createFixtureAnnotation } from "@atra/gold";

function setup() {
  const snapshot = createSyntheticSnapshot([createPublicJiraFixtureConnector(), createOpenTelemetryGitHubFixtureConnector(), createGoogleDocsFixtureConnector()]);
  const batch = createDeterministicCandidateBatch(snapshot, fixtureRetrievalConfig, deterministicGteRetriever, deterministicEttinReranker, createFixtureSamplingOptions(snapshot));
  const candidate = batch.candidates[0];
  if (!candidate) throw new Error("candidate required");
  return { snapshot, candidate, workflow: new InMemoryGoldWorkflow(snapshot, [candidate]) };
}

describe("Gold workflow integrity", () => {
  it("enforces distinct blind assignments and recipient-scoped evidence", () => {
    const { candidate, workflow } = setup();
    workflow.assign(candidate.candidate_pair_id, "annotator-a", 1);
    expect(() => workflow.assign(candidate.candidate_pair_id, "annotator-a", 2)).toThrow(/already assigned/);
    expect(() => workflow.annotationPayload(candidate.candidate_pair_id, "annotator-b")).toThrow(/not assigned/);
    const payload = workflow.annotationPayload(candidate.candidate_pair_id, "annotator-a");
    expect(JSON.stringify(payload)).not.toMatch(/score|rank|sampling|peer|gold|adjudication/i);
  });

  it("requires adjudication inputs to be the two pair annotations and exports immutable provenance", () => {
    const { candidate, workflow } = setup();
    workflow.assign(candidate.candidate_pair_id, "annotator-a", 1);
    workflow.assign(candidate.candidate_pair_id, "annotator-b", 1);
    const a = createFixtureAnnotation(candidate, "annotator-a", 1);
    const b = createFixtureAnnotation(candidate, "annotator-b", 1, { relation: "DIFFERENT_WORK" });
    workflow.appendAnnotation(a, "annotator-a");
    expect(() => workflow.appendAnnotation({ ...a, annotation_id: `${a.annotation_id}-duplicate` }, "annotator-a")).toThrow(/already submitted/);
    workflow.appendAnnotation(b, "annotator-b");
    expect(() => workflow.adjudicate(candidate.candidate_pair_id, { candidate_pair_id: candidate.candidate_pair_id, relation: "UNKNOWN", anchor_work_type: "UNKNOWN", candidate_work_type: "UNKNOWN" })).toThrow(/input annotation/);
    expect(() => workflow.adjudicate(candidate.candidate_pair_id, { candidate_pair_id: candidate.candidate_pair_id, relation: "UNKNOWN", anchor_work_type: "UNKNOWN", candidate_work_type: "UNKNOWN", input_annotation_ids: [a.annotation_id, b.annotation_id], adjudicator_id: "annotator-a", decision_reason: "conflict" })).toThrow(/cannot adjudicate/);
    workflow.adjudicate(candidate.candidate_pair_id, { candidate_pair_id: candidate.candidate_pair_id, relation: "UNKNOWN", anchor_work_type: "UNKNOWN", candidate_work_type: "UNKNOWN", input_annotation_ids: [a.annotation_id, b.annotation_id], adjudicator_id: "adjudicator-a", decision_reason: "conflict" });
    const frozen = workflow.freeze({ semantic_version: "0.1.0", dataset_split: "evaluation", guideline_version: "1.0.0" });
    expect(Object.isFrozen(frozen.export)).toBe(true); expect(frozen.export.manifest_hash).toBe(frozen.release.manifest_hash);
  });
});
