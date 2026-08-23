import { describe, expect, it } from "vitest";
import {
  createGoogleDocsFixtureConnector,
  createOpenTelemetryGitHubFixtureConnector,
  createPublicJiraFixtureConnector,
  createSyntheticSnapshot,
} from "@atra/connectors";
import {
  createDeterministicCandidateBatch,
  createFixtureSamplingOptions,
  deterministicEttinReranker,
  deterministicGteRetriever,
  fixtureRetrievalConfig,
} from "@atra/retrieval";
import { InMemoryGoldWorkflow } from "@atra/gold";
import { renderAnnotationScreen, submitTerminalAnnotation } from "@atra/frontend";

function setup() {
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
  const candidate = batch.candidates[0];
  if (!candidate) throw new Error("fixture candidate required");
  const workflow = new InMemoryGoldWorkflow(snapshot, [candidate]);
  workflow.assign(candidate.candidate_pair_id, "annotator-a", 1);
  return { candidate, workflow };
}

describe("terminal annotation UI", () => {
  it("renders only blinded evidence and submits a validated append-only human event", () => {
    const { candidate, workflow } = setup();
    const payload = workflow.annotationPayload(candidate.candidate_pair_id, "annotator-a");
    const screen = renderAnnotationScreen(payload, 184);
    expect(screen).toContain("Gold #000184");
    expect(screen).toContain("Relation:");
    expect(screen).toContain("SAME_WORK");
    expect(screen).toContain("Work Type (Anchor):");
    expect(screen).not.toMatch(/score|rank|sampling|reranker|retrieval|peer|gold state/i);

    const annotation = submitTerminalAnnotation(workflow, "annotator-a", 1, payload, {
      relation: "RELATED",
      anchor_work_type: "TASK",
      candidate_work_type: "PROJECT",
      reason_codes: ["parent_child"],
      confidence: 0.8,
      notes: "The evidence describes different completion units.",
      evidence_spans: [],
    });
    expect(annotation.annotator_id).toBe("annotator-a");
    expect(() => submitTerminalAnnotation(workflow, "annotator-a", 1, payload, {
      relation: "RELATED", anchor_work_type: "TASK", candidate_work_type: "PROJECT",
      reason_codes: ["parent_child"], confidence: 0.8, notes: null, evidence_spans: [],
    })).toThrow(/append-only/);
  });
});
