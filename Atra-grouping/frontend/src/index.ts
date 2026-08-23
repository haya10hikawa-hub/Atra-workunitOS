import { deterministicId, type Chunk } from "@atra/source-contracts";
import {
  AnnotationSchema,
  type Annotation,
  type EvidenceSpan,
  type ReasonCode,
  type Relation,
  type WorkType,
} from "@atra/gold-contracts";
import type { BlindedAnnotationPayload, InMemoryGoldWorkflow } from "@atra/gold";

const relations: readonly Relation[] = ["SAME_WORK", "RELATED", "DIFFERENT_WORK", "UNKNOWN"];
const workTypes: readonly WorkType[] = ["INITIATIVE", "PROJECT", "TASK", "SUBTASK", "MILESTONE", "NOT_WORK", "UNKNOWN"];

export interface TerminalAnnotationInput {
  readonly relation: Relation;
  readonly anchor_work_type: WorkType;
  readonly candidate_work_type: WorkType;
  readonly evidence_spans: readonly EvidenceSpan[];
  readonly reason_codes: readonly ReasonCode[];
  readonly confidence: number;
  readonly notes: string | null;
}

function choices(values: readonly string[]): string {
  return values.map((value) => `○ ${value}`).join("\n");
}

function evidence(label: string, side: BlindedAnnotationPayload["anchor"]): string {
  return [
    label,
    "──────────────────────",
    `Provider: ${side.provider}`,
    `Record type: ${side.record_type}`,
    side.title ? `Title: ${side.title}` : "",
    `Source: ${side.source_uri}`,
    `Offsets: ${side.start_offset}-${side.end_offset}`,
    "Text:",
    side.text,
  ].filter(Boolean).join("\n");
}

/** Renders evidence and canonical choices only; retrieval and Gold metadata never cross this boundary. */
export function renderAnnotationScreen(payload: BlindedAnnotationPayload, displayNumber: number): string {
  return [
    `Gold #${displayNumber.toString().padStart(6, "0")}`,
    "",
    evidence("Anchor", payload.anchor),
    "",
    evidence("Candidate Evidence", payload.candidate),
    "",
    "Human Annotation",
    "──────────────────────",
    "Relation:",
    choices(relations),
    "",
    "Work Type (Anchor):",
    choices(workTypes),
    "",
    "Work Type (Candidate):",
    choices(workTypes),
    "",
    "Use the completion-unit test: would one completion necessarily close both?",
  ].join("\n");
}

export function submitTerminalAnnotation(
  workflow: InMemoryGoldWorkflow,
  annotatorId: string,
  assignmentRound: number,
  payload: BlindedAnnotationPayload,
  input: TerminalAnnotationInput,
): Annotation {
  const annotation = AnnotationSchema.parse({
    annotation_id: deterministicId("ann", [payload.candidate_pair_id, annotatorId, String(assignmentRound)]),
    candidate_pair_id: payload.candidate_pair_id,
    annotator_id: annotatorId,
    assignment_round: assignmentRound,
    relation: input.relation,
    anchor_work_type: input.anchor_work_type,
    candidate_work_type: input.candidate_work_type,
    evidence_spans: input.evidence_spans,
    reason_codes: input.reason_codes,
    confidence: input.confidence,
    notes: input.notes,
    guideline_version: "1.0.0",
    created_at: "2026-08-21T10:00:00.000Z",
  });
  workflow.appendAnnotation(annotation, annotatorId);
  return annotation;
}

export function fullChunkSpan(chunk: Chunk): EvidenceSpan {
  return Object.freeze({ chunk_id: chunk.chunk_id, start_offset: 0, end_offset: chunk.text.length });
}
