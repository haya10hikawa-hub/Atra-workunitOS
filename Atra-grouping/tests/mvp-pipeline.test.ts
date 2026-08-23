import { describe, expect, it } from "vitest";
import {
  createGoogleDocsFixtureConnector,
  createOpenTelemetryGitHubFixtureConnector,
  createPublicJiraFixtureConnector,
  createSyntheticSnapshot,
} from "@atra/connectors";
import {
  createFixtureSamplingOptions,
  createDeterministicCandidateBatch,
  deterministicEttinReranker,
  deterministicGteRetriever,
  fixtureRetrievalConfig,
} from "@atra/retrieval";
import {
  InMemoryGoldWorkflow,
  createBlindedAnnotationPayload,
  createFixtureAnnotation,
} from "@atra/gold";
import { evaluateFrozenRelease } from "@atra/evaluation";

function runFixturePipeline() {
  const snapshot = createSyntheticSnapshot([
    createPublicJiraFixtureConnector(),
    createOpenTelemetryGitHubFixtureConnector(),
    createGoogleDocsFixtureConnector(),
  ]);
  const batch = createDeterministicCandidateBatch(
    snapshot,
    fixtureRetrievalConfig,
    deterministicGteRetriever,
    deterministicEttinReranker,
    createFixtureSamplingOptions(snapshot),
  );
  const workflow = new InMemoryGoldWorkflow(snapshot, batch.candidates);

  for (const candidate of batch.candidates) {
    const payload = createBlindedAnnotationPayload(candidate, snapshot.chunks, snapshot.source_records);
    expect(Object.keys(payload).sort()).toEqual([
      "anchor",
      "candidate",
      "candidate_pair_id",
    ]);
    expect(JSON.stringify(payload)).not.toMatch(
      /score|rank|sampling|retrieval|reranker|gold|annotation|adjudication/i,
    );

    const first = createFixtureAnnotation(candidate, "annotator-a", 1);
    const second = createFixtureAnnotation(candidate, "annotator-b", 1);
    workflow.assign(candidate.candidate_pair_id, "annotator-a", 1);
    workflow.assign(candidate.candidate_pair_id, "annotator-b", 1);
    workflow.appendAnnotation(first, "annotator-a");
    workflow.appendAnnotation(second, "annotator-b");
  }

  return { snapshot, batch, workflow };
}

describe("deterministic MVP pipeline", () => {
  it("runs source snapshot through frozen read-only evaluation twice with identical output", () => {
    const first = runFixturePipeline();
    const second = runFixturePipeline();

    expect(first.snapshot).toEqual(second.snapshot);
    expect(first.batch).toEqual(second.batch);

    const firstRelease = first.workflow.freeze({
      semantic_version: "0.1.0",
      dataset_split: "evaluation",
      guideline_version: "1.0.0",
    });
    const secondRelease = second.workflow.freeze({
      semantic_version: "0.1.0",
      dataset_split: "evaluation",
      guideline_version: "1.0.0",
    });
    expect(firstRelease).toEqual(secondRelease);
    expect(Object.isFrozen(firstRelease)).toBe(true);

    const report = evaluateFrozenRelease(firstRelease, firstRelease.labels);
    expect(report.relation.macro_f1).toBe(1);
    expect(report.release_id).toBe(firstRelease.release.release_id);
    expect(Object.isFrozen(firstRelease)).toBe(true);
  });

  it("blocks freeze for incomplete and non-adjudicated disagreeing pairs", () => {
    const { snapshot, batch } = runFixturePipeline();
    const candidate = batch.candidates[0];
    expect(candidate).toBeDefined();
    if (!candidate) throw new Error("fixture candidate required");

    const incomplete = new InMemoryGoldWorkflow(snapshot, [candidate]);
    incomplete.assign(candidate.candidate_pair_id, "annotator-a", 1);
    incomplete.appendAnnotation(createFixtureAnnotation(candidate, "annotator-a", 1), "annotator-a");
    expect(() => incomplete.freeze({ semantic_version: "0.1.0", dataset_split: "evaluation", guideline_version: "1.0.0" })).toThrow(
      /two distinct assignments|two independent annotations/,
    );

    const disagreement = new InMemoryGoldWorkflow(snapshot, [candidate]);
    disagreement.assign(candidate.candidate_pair_id, "annotator-a", 1);
    disagreement.assign(candidate.candidate_pair_id, "annotator-b", 1);
    disagreement.appendAnnotation(createFixtureAnnotation(candidate, "annotator-a", 1), "annotator-a");
    disagreement.appendAnnotation(
      createFixtureAnnotation(candidate, "annotator-b", 1, { relation: "DIFFERENT_WORK" }),
      "annotator-b",
    );
    expect(() => disagreement.freeze({ semantic_version: "0.1.0", dataset_split: "evaluation", guideline_version: "1.0.0" })).toThrow(
      /adjudication/,
    );
  });

  it("rejects append attempts by unassigned annotators and duplicate annotation IDs", () => {
    const { snapshot, batch } = runFixturePipeline();
    const candidate = batch.candidates[0];
    expect(candidate).toBeDefined();
    if (!candidate) throw new Error("fixture candidate required");
    const workflow = new InMemoryGoldWorkflow(snapshot, [candidate]);
    const annotation = createFixtureAnnotation(candidate, "annotator-a", 1);

    expect(() => workflow.appendAnnotation(annotation, "annotator-a")).toThrow(/not assigned/);
    workflow.assign(candidate.candidate_pair_id, "annotator-a", 1);
    workflow.appendAnnotation(annotation, "annotator-a");
    expect(() => workflow.appendAnnotation(annotation, "annotator-a")).toThrow(/append-only/);
  });
});
