import { contentHash, deterministicId, type Chunk, type SourceRecord } from "@atra/source-contracts";
import type { CandidatePair } from "@atra/candidate-contracts";
import {
  AnnotationSchema,
  AdjudicationSchema,
  GoldReleaseSchema,
  type Adjudication,
  type Annotation,
  type GoldRelease,
  type Relation,
  type WorkType,
} from "@atra/gold-contracts";
import type { SourceSnapshot } from "@atra/connectors";

export interface BlindedAnnotationPayload {
  readonly candidate_pair_id: string;
  readonly anchor: EvidenceSide;
  readonly candidate: EvidenceSide;
}

interface EvidenceSide {
  readonly provider: string;
  readonly record_type: string;
  readonly title: string | null;
  readonly text: string;
  readonly source_uri: string;
  readonly start_offset: number;
  readonly end_offset: number;
}

function sourceForChunk(chunk: Chunk, sources: readonly SourceRecord[]): SourceRecord {
  const source = sources.find((item) => item.source_record_id === chunk.source_record_id);
  if (!source) throw new Error(`Missing source for chunk ${chunk.chunk_id}`);
  return source;
}

function side(chunk: Chunk, sources: readonly SourceRecord[]): EvidenceSide {
  const source = sourceForChunk(chunk, sources);
  return Object.freeze({
    provider: source.provider,
    record_type: source.record_type,
    title: source.title,
    text: chunk.text,
    source_uri: source.source_uri,
    start_offset: chunk.start_offset,
    end_offset: chunk.end_offset,
  });
}

export function createBlindedAnnotationPayload(
  pair: CandidatePair,
  chunks: readonly Chunk[],
  sources: readonly SourceRecord[],
): BlindedAnnotationPayload {
  const anchor = chunks.find((item) => item.chunk_id === pair.anchor_chunk_id);
  const candidate = chunks.find((item) => item.chunk_id === pair.candidate_chunk_id);
  if (!anchor || !candidate) throw new Error(`Missing chunk for candidate ${pair.candidate_pair_id}`);
  return Object.freeze({
    candidate_pair_id: pair.candidate_pair_id,
    anchor: side(anchor, sources),
    candidate: side(candidate, sources),
  });
}

export interface ReleaseLabel {
  readonly candidate_pair_id: string;
  readonly relation: Relation;
  readonly anchor_work_type: WorkType;
  readonly candidate_work_type: WorkType;
}

/** Evaluation-only, release-pinned slice fields. UNAVAILABLE is explicit rather than inferred. */
export interface ReleaseAnalysisFields {
  readonly relation_label: Relation;
  readonly work_type: WorkType;
  readonly provider_pair: string;
  readonly source_family: string;
  readonly retrieval_score_band: "low" | "medium" | "high";
  readonly reranker_score_band: "low" | "medium" | "high";
  readonly challenge_bucket: string;
  readonly identifier_presence: "PRESENT" | "ABSENT";
  readonly evidence_length: number;
  readonly actor_time_overlap: "UNAVAILABLE";
  readonly work_hierarchy_relation: "UNAVAILABLE";
  readonly annotation_quality_state: "AGREED" | "ADJUDICATED";
}

export interface FrozenFixtureRelease {
  readonly release: GoldRelease;
  readonly labels: readonly ReleaseLabel[];
  readonly manifest: string;
  readonly analysis_fields: readonly ReleaseAnalysisFields[];
  readonly export: { readonly manifest_hash: string; readonly export_mode: "reference-only"; readonly labels: readonly ReleaseLabel[]; readonly evidence: readonly { readonly source_record_id: string; readonly chunk_id: string; readonly source_uri: string; readonly start_offset: number; readonly end_offset: number; readonly content_hash: string; readonly source_classification: SourceRecord["source_classification"]; readonly source_policy_version: string }[] };
}

export interface Assignment {
  readonly assignment_id: string;
  readonly candidate_pair_id: string;
  readonly annotator_id: string;
  readonly assignment_round: number;
  readonly assigned_at: string;
}

interface FreezeOptions {
  readonly semantic_version: string;
  readonly dataset_split: string;
  readonly guideline_version: string;
  readonly export_mode?: "reference-only";
}

function scoreBand(score: number): "low" | "medium" | "high" {
  if (score < 1 / 3) return "low";
  if (score < 2 / 3) return "medium";
  return "high";
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function materialDisagreement(left: Annotation, right: Annotation): boolean {
  return (
    left.relation !== right.relation ||
    left.anchor_work_type !== right.anchor_work_type ||
    left.candidate_work_type !== right.candidate_work_type ||
    left.confidence <= 0.5 ||
    right.confidence <= 0.5
  );
}

export class InMemoryGoldWorkflow {
  private readonly assignments: Assignment[] = [];
  private readonly annotations: Annotation[] = [];
  private readonly adjudicated = new Map<string, Adjudication>();
  private frozen = false;
  private readonly snapshot: SourceSnapshot;
  private readonly candidates: readonly CandidatePair[];

  public constructor(
    snapshot: SourceSnapshot,
    candidates: readonly CandidatePair[],
  ) {
    this.snapshot = snapshot;
    this.candidates = candidates;
  }

  public assign(candidatePairId: string, annotatorId: string, assignmentRound: number): void {
    if (this.frozen) throw new Error("frozen releases cannot accept assignments");
    if (!this.candidates.some((candidate) => candidate.candidate_pair_id === candidatePairId)) {
      throw new Error(`Unknown candidate pair ${candidatePairId}`);
    }
    if (this.assignments.some((item) => item.candidate_pair_id === candidatePairId && item.annotator_id === annotatorId)) {
      throw new Error("annotator already assigned to this pair");
    }
    this.assignments.push(Object.freeze({ assignment_id: deterministicId("assignment", [candidatePairId, annotatorId, String(assignmentRound)]), candidate_pair_id: candidatePairId, annotator_id: annotatorId, assignment_round: assignmentRound, assigned_at: "2026-08-21T10:00:00.000Z" }));
  }

  public annotationPayload(candidatePairId: string, annotatorId: string): BlindedAnnotationPayload {
    if (!this.assignments.some((item) => item.candidate_pair_id === candidatePairId && item.annotator_id === annotatorId)) {
      throw new Error("annotator is not assigned to this pair");
    }
    const pair = this.candidates.find((item) => item.candidate_pair_id === candidatePairId);
    if (!pair) throw new Error(`Unknown candidate pair ${candidatePairId}`);
    return createBlindedAnnotationPayload(pair, this.snapshot.chunks, this.snapshot.source_records);
  }

  public appendAnnotation(annotation: Annotation, actorId: string): void {
    if (this.frozen) throw new Error("frozen releases cannot accept annotations");
    if (annotation.annotator_id !== actorId) throw new Error("annotation actor does not match annotator");
    if (!this.assignments.some((item) => item.candidate_pair_id === annotation.candidate_pair_id && item.annotator_id === actorId && item.assignment_round === annotation.assignment_round)) {
      throw new Error("annotator is not assigned to this pair and round");
    }
    if (this.annotations.some((item) => item.annotation_id === annotation.annotation_id)) {
      throw new Error("append-only annotations cannot reuse an annotation ID");
    }
    if (this.annotations.some((item) => item.candidate_pair_id === annotation.candidate_pair_id && item.annotator_id === annotation.annotator_id && item.assignment_round === annotation.assignment_round)) {
      throw new Error("annotator already submitted an annotation for this pair and round");
    }
    this.annotations.push(AnnotationSchema.parse(annotation));
  }

  public adjudicate(candidatePairId: string, label: ReleaseLabel & { readonly input_annotation_ids?: readonly string[]; readonly adjudicator_id?: string; readonly decision_reason?: string; readonly guideline_version?: string }): void {
    if (this.frozen) throw new Error("frozen releases cannot accept adjudications");
    if (label.candidate_pair_id !== candidatePairId) throw new Error("adjudication label must match candidate pair");
    if (!label.input_annotation_ids || new Set(label.input_annotation_ids).size !== label.input_annotation_ids.length || label.input_annotation_ids.length < 2 || !label.adjudicator_id || !label.decision_reason) throw new Error("adjudication requires input annotation IDs");
    const entries = this.annotations.filter((item) => item.candidate_pair_id === candidatePairId);
    if (!label.input_annotation_ids.every((id) => entries.some((item) => item.annotation_id === id))) throw new Error("adjudication input annotation IDs must belong to this pair");
    if (entries.some((item) => item.annotator_id === label.adjudicator_id)) throw new Error("annotator cannot adjudicate their own pair");
    this.adjudicated.set(candidatePairId, deepFreeze(AdjudicationSchema.parse({ adjudication_id: deterministicId("adj", [candidatePairId, ...[...label.input_annotation_ids].sort(), label.adjudicator_id]), candidate_pair_id: candidatePairId, input_annotation_ids: label.input_annotation_ids, relation: label.relation, anchor_work_type: label.anchor_work_type, candidate_work_type: label.candidate_work_type, decision_reason: label.decision_reason, adjudicator_id: label.adjudicator_id, guideline_version: label.guideline_version ?? "1.0.0", created_at: "2026-08-21T10:00:00.000Z" })));
  }

  public freeze(options: FreezeOptions): FrozenFixtureRelease {
    if (this.frozen) throw new Error("workflow is already frozen");
    if ((options.export_mode ?? "reference-only") !== "reference-only") throw new Error("unsupported export mode");
    if (new Set(this.candidates.map((candidate) => candidate.candidate_pair_id)).size !== this.candidates.length) throw new Error("release cannot contain duplicate candidate pairs");
    const labels = this.candidates.map((candidate) => {
      const assigned = new Set(this.assignments.filter((item) => item.candidate_pair_id === candidate.candidate_pair_id).map((item) => item.annotator_id));
      if (assigned.size !== 2) throw new Error(`candidate ${candidate.candidate_pair_id} requires two distinct assignments`);
      const entries = this.annotations.filter((item) => item.candidate_pair_id === candidate.candidate_pair_id);
      const annotators = new Set(entries.map((item) => item.annotator_id));
      if (annotators.size < 2) throw new Error(`candidate ${candidate.candidate_pair_id} requires two independent annotations`);
      const [first, second] = entries;
      if (!first || !second) throw new Error("candidate annotations are incomplete");
      const adjudicated = this.adjudicated.get(candidate.candidate_pair_id);
      if (materialDisagreement(first, second) && !adjudicated) {
        throw new Error(`candidate ${candidate.candidate_pair_id} requires adjudication`);
      }
      return adjudicated ?? {
        candidate_pair_id: candidate.candidate_pair_id,
        relation: first.relation,
        anchor_work_type: first.anchor_work_type,
        candidate_work_type: first.candidate_work_type,
      };
    });
    const manifest = JSON.stringify({
      candidates: this.candidates.map((item) => item.candidate_pair_id),
      assignments: this.assignments.map((item) => item.assignment_id).sort(),
      annotations: this.annotations.map((item) => item.annotation_id).sort(),
      adjudications: [...this.adjudicated.values()].map((item) => item.adjudication_id).sort(),
      models: this.candidates.map((item) => ({ retrieval: item.retrieval_model_version, reranker: item.reranker_version })),
      export_mode: options.export_mode ?? "reference-only",
      labels,
      snapshot: this.snapshot.source_snapshot_id,
      options,
    });
    const release = GoldReleaseSchema.parse({
      release_id: deterministicId("release", [options.semantic_version, options.dataset_split, contentHash(manifest)]),
      semantic_version: options.semantic_version,
      dataset_split: options.dataset_split,
      pair_ids: this.candidates.map((item) => item.candidate_pair_id),
      schema_version: "1.0.0",
      guideline_version: options.guideline_version,
      sampling_policy_version: this.candidates[0]?.policy_version ?? "none",
      source_snapshot_ids: [this.snapshot.source_snapshot_id],
      frozen_at: "2026-08-21T10:00:00.000Z",
      manifest_hash: contentHash(manifest),
      supersedes: null,
    });
    this.frozen = true;
    const evidence = this.snapshot.chunks.map((chunk) => {
      const source = sourceForChunk(chunk, this.snapshot.source_records);
      return { source_record_id: source.source_record_id, chunk_id: chunk.chunk_id, source_uri: source.source_uri, start_offset: chunk.start_offset, end_offset: chunk.end_offset, content_hash: chunk.content_hash, source_classification: source.source_classification, source_policy_version: source.source_policy_version };
    });
    const analysis_fields: ReleaseAnalysisFields[] = this.candidates.map((candidate) => {
      const anchor = this.snapshot.chunks.find((chunk) => chunk.chunk_id === candidate.anchor_chunk_id);
      const compared = this.snapshot.chunks.find((chunk) => chunk.chunk_id === candidate.candidate_chunk_id);
      if (!anchor || !compared) throw new Error("candidate provenance is incomplete");
      const anchorSource = sourceForChunk(anchor, this.snapshot.source_records);
      const candidateSource = sourceForChunk(compared, this.snapshot.source_records);
      const label = labels.find((item) => item.candidate_pair_id === candidate.candidate_pair_id);
      if (!label) throw new Error("candidate final label is missing");
      const sourceText = `${anchorSource.title ?? ""}\n${anchorSource.body}\n${candidateSource.title ?? ""}\n${candidateSource.body}`;
      return Object.freeze({
        relation_label: label.relation,
        work_type: label.anchor_work_type,
        provider_pair: [anchorSource.provider, candidateSource.provider].sort().join(":"),
        source_family: [anchorSource.dataset, candidateSource.dataset].sort().join(":"),
        retrieval_score_band: scoreBand(candidate.retrieval_score),
        reranker_score_band: scoreBand(candidate.reranker_score),
        challenge_bucket: candidate.sampling_bucket,
        identifier_presence: /(?:\b[A-Z][A-Z0-9]+-\d+\b|#\d+\b)/.test(sourceText) ? "PRESENT" : "ABSENT",
        evidence_length: anchor.text.length + compared.text.length,
        actor_time_overlap: "UNAVAILABLE",
        work_hierarchy_relation: "UNAVAILABLE",
        annotation_quality_state: this.adjudicated.has(candidate.candidate_pair_id) ? "ADJUDICATED" : "AGREED",
      });
    });
    return deepFreeze({ release, labels, manifest, analysis_fields, export: { manifest_hash: release.manifest_hash, export_mode: "reference-only", labels, evidence } });
  }
}

export function createFixtureAnnotation(
  candidate: CandidatePair,
  annotatorId: string,
  assignmentRound: number,
  overrides: Partial<Pick<Annotation, "relation" | "anchor_work_type" | "candidate_work_type">> = {},
): Annotation {
  const relation = overrides.relation ?? "UNKNOWN";
  return AnnotationSchema.parse({
    annotation_id: deterministicId("ann", [candidate.candidate_pair_id, annotatorId, String(assignmentRound)]),
    candidate_pair_id: candidate.candidate_pair_id,
    annotator_id: annotatorId,
    assignment_round: assignmentRound,
    relation,
    anchor_work_type: overrides.anchor_work_type ?? "UNKNOWN",
    candidate_work_type: overrides.candidate_work_type ?? "UNKNOWN",
    evidence_spans: [],
    reason_codes: ["insufficient_context"],
    confidence: 0.9,
    notes: "Synthetic fixture annotation.",
    guideline_version: "1.0.0",
    created_at: "2026-08-21T10:00:00.000Z",
  });
}
