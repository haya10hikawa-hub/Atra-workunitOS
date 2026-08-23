import { describe, expect, it } from "vitest";
import {
  ChunkSchema,
  SourceRecordSchema,
  chunkId,
  contentHash,
  deterministicId,
  sourceRecordId,
  validateChunkAgainstSource,
} from "@atra/source-contracts";
import { CandidatePairSchema, candidatePairId } from "@atra/candidate-contracts";
import {
  AdjudicationSchema,
  AnnotationSchema,
  GoldReleaseSchema,
  ReasonCodeSchema,
  RelationSchema,
  StructuredSignalSchema,
  WorkSignalClassSchema,
  WorkSlotNameSchema,
  WorkTypeSchema,
} from "@atra/gold-contracts";

const createdAt = "2026-08-21T10:00:00.000Z";

function makeSource() {
  const body = "Alex will fix the OAuth callback before release.";
  return {
    source_record_id: sourceRecordId("jira", "public-demo", "DEMO-1", "ingest-v1"),
    provider: "jira",
    dataset: "public-demo",
    native_id: "DEMO-1",
    record_type: "issue",
    title: "Fix OAuth callback",
    body,
    author_refs: ["user:alex"],
    participant_refs: ["user:alex"],
    created_at: createdAt,
    updated_at: null,
    parent_ref: null,
    external_refs: ["github:demo/observability#1"],
    source_uri: "https://example.invalid/jira/DEMO-1",
    content_hash: contentHash(body),
    license: "synthetic-test-fixture",
    source_classification: "SYNTHETIC",
    source_policy_version: "source-policy-v1",
    ingestion_version: "ingest-v1",
    raw_payload_ref: "fixture://jira/DEMO-1.json",
  } as const;
}

describe("canonical source and candidate contracts", () => {
  it("validates and freezes canonical source evidence", () => {
    const parsed = SourceRecordSchema.parse(makeSource());
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.author_refs)).toBe(true);
    expect(parsed.body).toBe(makeSource().body);
    expect(Reflect.set(parsed, "body", "rewritten")).toBe(false);
    expect(parsed.body).toBe(makeSource().body);
    expect(SourceRecordSchema.safeParse({ ...makeSource(), unexpected: true }).success).toBe(false);
  });

  it.each([
    ["source_record_id", "sr_forged"],
    ["content_hash", contentHash("different source body")],
  ] as const)("rejects a source with an inconsistent %s", (field, value) => {
    expect(SourceRecordSchema.safeParse({ ...makeSource(), [field]: value }).success).toBe(false);
  });

  it("validates chunks whose offsets round-trip to canonical source text", () => {
    const source = SourceRecordSchema.parse(makeSource());
    const text = source.body.slice(0, 19);
    const chunk = ChunkSchema.parse({
      chunk_id: chunkId(source.source_record_id, 0, "chunker-v1", contentHash(text)),
      source_record_id: source.source_record_id,
      ordinal: 0,
      text,
      start_offset: 0,
      end_offset: 19,
      speaker: null,
      timestamp: null,
      chunker_version: "chunker-v1",
      content_hash: contentHash(text),
    });
    expect(source.body.slice(chunk.start_offset, chunk.end_offset)).toBe(chunk.text);
    expect(validateChunkAgainstSource(chunk, source)).toEqual(chunk);
    expect(ChunkSchema.safeParse({ ...chunk, end_offset: -1 }).success).toBe(false);
  });

  it("rejects forged chunk identity and content hashes", () => {
    const source = SourceRecordSchema.parse(makeSource());
    const text = source.body.slice(0, 19);
    const chunk = {
      chunk_id: chunkId(source.source_record_id, 0, "chunker-v1", contentHash(text)),
      source_record_id: source.source_record_id,
      ordinal: 0,
      text,
      start_offset: 0,
      end_offset: 19,
      speaker: null,
      timestamp: null,
      chunker_version: "chunker-v1",
      content_hash: contentHash(text),
    } as const;

    expect(ChunkSchema.safeParse({ ...chunk, chunk_id: "ch_forged" }).success).toBe(false);
    expect(ChunkSchema.safeParse({ ...chunk, content_hash: contentHash("other text") }).success).toBe(
      false,
    );
  });

  it.each([
    ["wrong source reference", { source_record_id: "sr_missing" }],
    ["offset outside source", { start_offset: 1, end_offset: 20 }],
    ["text not from source slice", { text: "This is not source." }],
  ] as const)("rejects a chunk with %s", (_name, mutation) => {
    const source = SourceRecordSchema.parse(makeSource());
    const text = source.body.slice(0, 19);
    const base = {
      source_record_id: source.source_record_id,
      ordinal: 0,
      text,
      start_offset: 0,
      end_offset: 19,
      speaker: null,
      timestamp: null,
      chunker_version: "chunker-v1",
      content_hash: contentHash(text),
    };
    const candidate = { ...base, ...mutation };
    const chunk = {
      ...candidate,
      content_hash: contentHash(candidate.text),
      chunk_id: chunkId(
        candidate.source_record_id,
        candidate.ordinal,
        candidate.chunker_version,
        contentHash(candidate.text),
      ),
    };

    expect(() => validateChunkAgainstSource(chunk, source)).toThrow();
  });

  it("uses collision-safe deterministic IDs and order-stable pair identity", () => {
    expect(deterministicId("test", ["ab", "c"])).not.toBe(deterministicId("test", ["a", "bc"]));
    expect(deterministicId("test", ["same"])).toBe(deterministicId("test", ["same"]));
    expect(candidatePairId("ch_b", "ch_a")).toBe(candidatePairId("ch_a", "ch_b"));
  });

  it("validates candidate metadata without any human or Gold label", () => {
    const candidate = {
      candidate_pair_id: candidatePairId("ch_anchor", "ch_candidate"),
      anchor_chunk_id: "ch_anchor",
      candidate_chunk_id: "ch_candidate",
      retrieval_model: "gte-fixture",
      retrieval_model_version: "revision-1",
      retrieval_score: 0.82,
      reranker_model: "ettin-fixture",
      reranker_version: "revision-1",
      reranker_score: 0.71,
      sampling_bucket: "same_topic_different_acceptance",
      sampling_reason: "Synthetic hard negative",
      policy_version: "policy-v1",
      created_at: createdAt,
    };
    expect(CandidatePairSchema.parse(candidate)).toEqual(candidate);
    expect(CandidatePairSchema.safeParse({ ...candidate, candidate_pair_id: "cp_wrong" }).success).toBe(
      false,
    );
    expect(CandidatePairSchema.safeParse({ ...candidate, relation: "SAME_WORK" }).success).toBe(false);
    expect(CandidatePairSchema.safeParse({ ...candidate, anchor_chunk_id: "ch_anchor", candidate_chunk_id: "ch_anchor" }).success).toBe(false);
  });
});

describe("canonical Gold contracts", () => {
  it("exposes exactly the documented label taxonomies and reason codes", () => {
    expect(RelationSchema.options).toEqual(["SAME_WORK", "RELATED", "DIFFERENT_WORK", "UNKNOWN"]);
    expect(WorkTypeSchema.options).toEqual([
      "INITIATIVE",
      "PROJECT",
      "TASK",
      "SUBTASK",
      "MILESTONE",
      "NOT_WORK",
      "UNKNOWN",
    ]);
    expect(ReasonCodeSchema.options).toContain("same_completion_unit");
    expect(ReasonCodeSchema.options).toContain("insufficient_context");
    expect(WorkSignalClassSchema.options).toEqual([
      "WORK_ACTION",
      "WORK_DECISION",
      "WORK_STATUS_UPDATE",
      "WORK_REFERENCE",
      "NOT_WORK",
      "UNKNOWN",
    ]);
    expect(WorkSlotNameSchema.options).toContain("acceptance_criterion");
  });

  it("validates classification and slot-filling structured signals separately from Gold labels", () => {
    const signal = StructuredSignalSchema.parse({
      structured_signal_id: deterministicId("sig", ["ch-anchor", "needle-style-v1"]),
      chunk_id: "ch-anchor",
      signal_class: "WORK_ACTION",
      work_type: "TASK",
      slots: [
        {
          slot_name: "owner",
          value: "Alex",
          normalized_value: "user:alex",
          evidence_span: { chunk_id: "ch-anchor", start_offset: 0, end_offset: 4 },
          confidence: 0.8,
        },
        {
          slot_name: "acceptance_criterion",
          value: "fix the OAuth callback",
          normalized_value: null,
          evidence_span: { chunk_id: "ch-anchor", start_offset: 10, end_offset: 32 },
          confidence: 0.72,
        },
      ],
      classifier_model: "needle-style-classifier",
      classifier_model_version: "schema-v1",
      slot_model: "needle-style-slot-filler",
      slot_model_version: "schema-v1",
      confidence: 0.76,
      guideline_version: "1.0.0",
      created_at: createdAt,
    });

    expect(signal.signal_class).toBe("WORK_ACTION");
    expect(signal.slots.map((slot) => slot.slot_name)).toEqual(["owner", "acceptance_criterion"]);
    expect(StructuredSignalSchema.safeParse({ ...signal, relation: "SAME_WORK" }).success).toBe(false);
    expect(StructuredSignalSchema.safeParse({ ...signal, signal_class: "NOT_WORK" }).success).toBe(false);
  });

  it("requires evidence for SAME_WORK annotations", () => {
    const annotation = {
      annotation_id: deterministicId("ann", ["pair-1", "annotator-a", "1"]),
      candidate_pair_id: "pair-1",
      annotator_id: "annotator-a",
      assignment_round: 1,
      relation: "SAME_WORK",
      anchor_work_type: "TASK",
      candidate_work_type: "TASK",
      evidence_spans: [],
      reason_codes: ["same_completion_unit"],
      confidence: 0.9,
      notes: null,
      guideline_version: "1.0.0",
      created_at: createdAt,
    } as const;
    expect(AnnotationSchema.safeParse(annotation).success).toBe(false);
    expect(
      AnnotationSchema.safeParse({
        ...annotation,
        evidence_spans: [{ chunk_id: "ch_anchor", start_offset: 0, end_offset: 10 }],
      }).success,
    ).toBe(true);
  });

  it("validates adjudication and immutable release manifests", () => {
    const adjudication = AdjudicationSchema.parse({
      adjudication_id: deterministicId("adj", ["pair-1", "1"]),
      candidate_pair_id: "pair-1",
      input_annotation_ids: ["ann-1", "ann-2"],
      relation: "UNKNOWN",
      anchor_work_type: "UNKNOWN",
      candidate_work_type: "UNKNOWN",
      decision_reason: "The available evidence is contradictory.",
      adjudicator_id: "adjudicator-a",
      guideline_version: "1.0.0",
      created_at: createdAt,
    });
    expect(Object.isFrozen(adjudication.input_annotation_ids)).toBe(true);

    const release = GoldReleaseSchema.parse({
      release_id: deterministicId("release", ["1.0.0", "evaluation"]),
      semantic_version: "1.0.0",
      dataset_split: "evaluation",
      pair_ids: ["pair-1"],
      schema_version: "1.0.0",
      guideline_version: "1.0.0",
      sampling_policy_version: "policy-v1",
      source_snapshot_ids: ["snapshot-synthetic-v1"],
      frozen_at: createdAt,
      manifest_hash: contentHash("manifest"),
      supersedes: null,
    });
    expect(Object.isFrozen(release)).toBe(true);
    expect(Object.isFrozen(release.pair_ids)).toBe(true);
  });
});
