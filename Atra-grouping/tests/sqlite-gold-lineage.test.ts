import { describe, expect, it } from "vitest";
import { AnnotationSchema, AdjudicationSchema, GoldReleaseSchema } from "@atra/gold-contracts";
import { contentHash, deterministicId } from "@atra/source-contracts";
import { SqliteGoldEventRepository } from "@atra/gold/sqlite";

const annotation = AnnotationSchema.parse({
  annotation_id: deterministicId("ann", ["pair-1", "annotator-a", "1"]),
  candidate_pair_id: "pair-1",
  annotator_id: "annotator-a",
  assignment_round: 1,
  relation: "UNKNOWN",
  anchor_work_type: "UNKNOWN",
  candidate_work_type: "UNKNOWN",
  evidence_spans: [],
  reason_codes: ["insufficient_context"],
  confidence: 0.4,
  notes: null,
  guideline_version: "1.0.0",
  created_at: "2026-08-21T10:00:00.000Z",
});

const assignment = Object.freeze({
  assignment_id: deterministicId("assignment", ["pair-1", "annotator-a", "1"]),
  candidate_pair_id: "pair-1",
  annotator_id: "annotator-a",
  assignment_round: 1,
  assigned_at: "2026-08-21T10:00:00.000Z",
});

const adjudication = AdjudicationSchema.parse({
  adjudication_id: deterministicId("adj", ["pair-1", "ann-a", "ann-b", "adjudicator-a"]),
  candidate_pair_id: "pair-1",
  input_annotation_ids: ["ann-a", "ann-b"],
  relation: "UNKNOWN",
  anchor_work_type: "UNKNOWN",
  candidate_work_type: "UNKNOWN",
  decision_reason: "Evidence is insufficient.",
  adjudicator_id: "adjudicator-a",
  guideline_version: "1.0.0",
  created_at: "2026-08-21T10:00:00.000Z",
});

const release = GoldReleaseSchema.parse({
  release_id: deterministicId("release", ["0.1.0", "evaluation", "manifest"]),
  semantic_version: "0.1.0",
  dataset_split: "evaluation",
  pair_ids: ["pair-1"],
  schema_version: "1.0.0",
  guideline_version: "1.0.0",
  sampling_policy_version: "fixture-policy-v1",
  source_snapshot_ids: ["snapshot-1"],
  frozen_at: "2026-08-21T10:00:00.000Z",
  manifest_hash: "a".repeat(64),
  supersedes: null,
});

describe("SQLite Gold lineage repository", () => {
  it("applies migrations idempotently and preserves append-only annotation events across repository instances", () => {
    const connection = SqliteGoldEventRepository.inMemoryConnection();
    const first = new SqliteGoldEventRepository(connection);
    first.appendAnnotation(annotation);
    expect(() => first.appendAnnotation(annotation)).toThrow(/append-only/);

    const reopened = new SqliteGoldEventRepository(connection);
    expect(reopened.annotationsForPair("pair-1")).toEqual([annotation]);
    expect(reopened.appliedMigrations()).toEqual(["0001_gold_lineage"]);
  });

  it("opens a repository-local ignored SQLite database", () => {
    const repository = SqliteGoldEventRepository.openLocal(new URL("../", import.meta.url).pathname);
    expect(repository.appliedMigrations()).toEqual(["0001_gold_lineage"]);
  });

  it("persists immutable assignments, adjudications, and releases across repository reopen", () => {
    const connection = SqliteGoldEventRepository.inMemoryConnection();
    const first = new SqliteGoldEventRepository(connection);
    first.appendAssignment(assignment);
    first.appendAdjudication(adjudication);
    first.storeRelease(release);
    const manifest = JSON.stringify({ release_id: release.release_id, lineage: ["snapshot-1"] });
    const manifestRelease = GoldReleaseSchema.parse({ ...release, release_id: deterministicId("release", ["0.1.1", "evaluation", contentHash(manifest)]), semantic_version: "0.1.1", manifest_hash: contentHash(manifest) });
    first.storeRelease(manifestRelease);
    first.storeReleaseManifest(manifestRelease, manifest);
    const forgedManifest = JSON.stringify({ tampered: true });
    expect(() => first.storeReleaseManifest({ ...manifestRelease, manifest_hash: contentHash(forgedManifest) }, forgedManifest)).toThrow(/persisted release/);

    const reopened = new SqliteGoldEventRepository(connection);
    expect(reopened.assignmentsForPair("pair-1")).toEqual([assignment]);
    expect(reopened.adjudicationForPair("pair-1")).toEqual(adjudication);
    expect(reopened.releaseById(release.release_id)).toEqual(release);
    expect(reopened.manifestForRelease(manifestRelease.release_id)).toBe(manifest);
    expect(() => reopened.appendAssignment(assignment)).toThrow(/duplicate assignment/);
    expect(() => reopened.appendAdjudication(adjudication)).toThrow(/duplicate adjudication/);
    expect(() => reopened.storeRelease({ ...release, semantic_version: "0.1.1" })).toThrow(/duplicate release/);
    expect(reopened.storeRelease(release)).toEqual(release);
  });

  it("writes only idempotent content-addressed reference-safe artifacts under generated releases", () => {
    const repository = new SqliteGoldEventRepository(SqliteGoldEventRepository.inMemoryConnection());
    const root = new URL("../", import.meta.url).pathname;
    const artifact = JSON.stringify({ manifest_hash: release.manifest_hash, labels: [], evidence: [] });
    const firstPath = repository.writeFixtureExportArtifact(root, release.manifest_hash, artifact);
    expect(firstPath).toContain(`/data/generated/releases/${release.manifest_hash}/`);
    expect(repository.writeFixtureExportArtifact(root, release.manifest_hash, artifact)).toBe(firstPath);
    expect(() => repository.writeFixtureExportArtifact(root, release.manifest_hash, JSON.stringify({ manifest_hash: release.manifest_hash, labels: ["changed"], evidence: [] }))).toThrow(/immutable/);
    expect(() => repository.writeFixtureExportArtifact(root, release.manifest_hash, artifact, "../escape.json")).toThrow(/escape/);
    expect(() => repository.writeFixtureExportArtifact(root, release.manifest_hash, JSON.stringify({ body: "restricted raw evidence" }))).toThrow(/raw evidence/);
    expect(() => repository.writeFixtureExportArtifact(root, "c".repeat(64), JSON.stringify({ manifest_hash: "c".repeat(64), evidence: [{ source_record_id: "source-1" }] }))).toThrow(/reference-only mode/);
  });
});
