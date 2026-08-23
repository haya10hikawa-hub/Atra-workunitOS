import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
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
import { renderAnnotationScreen, submitTerminalAnnotation, type TerminalAnnotationInput } from "./index.js";
import type { ReasonCode, Relation, WorkType } from "@atra/gold-contracts";

const relations = ["SAME_WORK", "RELATED", "DIFFERENT_WORK", "UNKNOWN"] as const satisfies readonly Relation[];
const workTypes = ["INITIATIVE", "PROJECT", "TASK", "SUBTASK", "MILESTONE", "NOT_WORK", "UNKNOWN"] as const satisfies readonly WorkType[];

async function choose<T extends string>(prompt: string, options: readonly T[]): Promise<T> {
  while (true) {
    stdout.write(`\n${prompt}\n${options.map((option, index) => `${index + 1}. ${option}`).join("\n")}\n`);
    const answer = (await reader.question("> ")).trim();
    const selected = Number.parseInt(answer, 10);
    if (Number.isInteger(selected) && selected >= 1 && selected <= options.length) {
      const value = options[selected - 1];
      if (value) return value;
    }
    stdout.write("Choose a listed number.\n");
  }
}

const reader = createInterface({ input: stdin, output: stdout });

async function main(): Promise<void> {
  const snapshot = createSyntheticSnapshot([
    createPublicJiraFixtureConnector(),
    createOpenTelemetryGitHubFixtureConnector(),
    createGoogleDocsFixtureConnector(),
  ]);
  const batch = createDeterministicCandidateBatch(snapshot, fixtureRetrievalConfig, deterministicGteRetriever, deterministicEttinReranker, createFixtureSamplingOptions(snapshot));
  const candidate = batch.candidates[0];
  if (!candidate) throw new Error("fixture batch unexpectedly has no candidates");
  const workflow = new InMemoryGoldWorkflow(snapshot, [candidate]);
  workflow.assign(candidate.candidate_pair_id, "terminal-annotator", 1);
  const payload = workflow.annotationPayload(candidate.candidate_pair_id, "terminal-annotator");
  stdout.write(`${renderAnnotationScreen(payload, 1)}\n`);

  const relation = await choose("Relation", relations);
  const anchorWorkType = await choose("Work type for anchor", workTypes);
  const candidateWorkType = await choose("Work type for candidate", workTypes);
  const confidenceText = (await reader.question("Confidence (0 to 1): ")).trim();
  const confidence = Number(confidenceText);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error("confidence must be between 0 and 1");
  const notes = (await reader.question("Notes (optional): ")).trim();
  const input: TerminalAnnotationInput = {
    relation,
    anchor_work_type: anchorWorkType,
    candidate_work_type: candidateWorkType,
    evidence_spans: relation === "SAME_WORK" ? [{ chunk_id: candidate.anchor_chunk_id, start_offset: 0, end_offset: payload.anchor.text.length }] : [],
    reason_codes: [relation === "SAME_WORK" ? "same_completion_unit" : relation === "UNKNOWN" ? "insufficient_context" : "different_acceptance_criteria"] satisfies readonly ReasonCode[],
    confidence,
    notes: notes || null,
  };
  const annotation = submitTerminalAnnotation(workflow, "terminal-annotator", 1, payload, input);
  stdout.write(`\nSaved append-only annotation event: ${annotation.annotation_id}\n`);
}

void main().finally(() => reader.close());
