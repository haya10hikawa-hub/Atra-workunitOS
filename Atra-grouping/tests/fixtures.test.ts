import { describe, expect, it } from "vitest";
import { CandidatePairSchema } from "@atra/candidate-contracts";
import { AnnotationSchema, RelationSchema, WorkTypeSchema } from "@atra/gold-contracts";
import { ChunkSchema, SourceRecordSchema } from "@atra/source-contracts";
import { syntheticCases } from "@atra/fixtures";

describe("synthetic calibration fixtures", () => {
  const requiredChallengeBuckets = [
    "same_identifier_different_work",
    "no_identifier_same_work",
    "same_people_time_different_work",
    "same_topic_different_acceptance",
    "parent_child_related",
    "milestone_task_related",
    "paraphrase_related_not_same",
    "high_score_not_same",
    "low_score_same",
    "sparse_unknown",
    "contradictory_unknown",
    "easy_positive_control",
    "easy_negative_control",
  ] as const;

  it("validates every record, chunk, candidate, and expected annotation", () => {
    for (const fixture of syntheticCases) {
      fixture.source_records.forEach((record) => SourceRecordSchema.parse(record));
      fixture.chunks.forEach((chunk) => ChunkSchema.parse(chunk));
      CandidatePairSchema.parse(fixture.candidate_pair);
      AnnotationSchema.parse(fixture.expected_annotation);
    }
  });

  it("covers every canonical relation and work type", () => {
    const relations = new Set(syntheticCases.map(({ expected_annotation }) => expected_annotation.relation));
    const workTypes = new Set(
      syntheticCases.flatMap(({ expected_annotation }) => [
        expected_annotation.anchor_work_type,
        expected_annotation.candidate_work_type,
      ]),
    );
    expect([...relations].sort()).toEqual([...RelationSchema.options].sort());
    expect([...workTypes].sort()).toEqual([...WorkTypeSchema.options].sort());
  });

  it("includes hierarchy, milestone, not-work, and ambiguous calibration cases", () => {
    const caseIds = syntheticCases.map(({ case_id }) => case_id);
    expect(caseIds).toEqual(
      expect.arrayContaining([
        "same-work-without-shared-id",
        "project-task-related",
        "task-subtask-related",
        "milestone-task-related",
        "not-work-different",
        "ambiguous-unknown",
      ]),
    );
  });

  it("covers every required challenge bucket", () => {
    const buckets = new Set(syntheticCases.map(({ candidate_pair }) => candidate_pair.sampling_bucket));
    expect([...buckets].sort()).toEqual([...requiredChallengeBuckets].sort());
  });

  it("keeps fixtures synthetic and source text unchanged by schema round-trip", () => {
    for (const fixture of syntheticCases) {
      for (const source of fixture.source_records) {
        expect(source.license).toBe("synthetic-test-fixture");
        expect(SourceRecordSchema.parse(source).body).toBe(source.body);
      }
    }
  });
});
