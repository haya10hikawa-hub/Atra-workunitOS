import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { basename, resolve } from "node:path";
import {
  AdjudicationSchema,
  AnnotationSchema,
  GoldReleaseSchema,
  type Adjudication,
  type Annotation,
  type GoldRelease,
} from "@atra/gold-contracts";
import { contentHash, deterministicId } from "@atra/source-contracts";
import { CandidatePairSchema, type CandidatePair } from "@atra/candidate-contracts";
import type { SourceSnapshot } from "@atra/connectors";
import {
  InMemoryGoldWorkflow,
  type BlindedAnnotationPayload,
  type FrozenFixtureRelease,
  type ReleaseLabel,
} from "./index.js";

const migrationId = "0001_gold_lineage";
const fixedMigrationTimestamp = "2026-08-21T10:00:00.000Z";

export interface PersistedAssignment {
  readonly assignment_id: string;
  readonly candidate_pair_id: string;
  readonly annotator_id: string;
  readonly assignment_round: number;
  readonly assigned_at: string;
}

export interface PersistedCandidateBatch {
  readonly candidate_batch_id: string;
  readonly source_snapshot_id: string;
  readonly retrieval_config_hash: string;
  readonly index_version: string;
  readonly candidate_pairs: readonly CandidatePair[];
  readonly created_at: string;
}

function migrate(connection: DatabaseSync): void {
  connection.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      migration_id TEXT PRIMARY KEY NOT NULL,
      applied_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS annotation_events (
      annotation_id TEXT PRIMARY KEY NOT NULL,
      candidate_pair_id TEXT NOT NULL,
      event_json TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS assignment_events (
      assignment_id TEXT PRIMARY KEY NOT NULL,
      candidate_pair_id TEXT NOT NULL,
      annotator_id TEXT NOT NULL,
      assignment_round INTEGER NOT NULL,
      assigned_at TEXT NOT NULL,
      event_json TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS adjudication_events (
      adjudication_id TEXT PRIMARY KEY NOT NULL,
      candidate_pair_id TEXT NOT NULL UNIQUE,
      event_json TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS frozen_releases (
      release_id TEXT PRIMARY KEY NOT NULL,
      manifest_hash TEXT NOT NULL,
      release_json TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS release_manifests (
      release_id TEXT PRIMARY KEY NOT NULL,
      manifest_hash TEXT NOT NULL UNIQUE,
      manifest_json TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS source_snapshots (
      source_snapshot_id TEXT PRIMARY KEY NOT NULL,
      snapshot_json TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS candidate_batches (
      candidate_batch_id TEXT PRIMARY KEY NOT NULL,
      source_snapshot_id TEXT NOT NULL,
      retrieval_config_hash TEXT NOT NULL,
      index_version TEXT NOT NULL,
      batch_json TEXT NOT NULL
    ) STRICT;
  `);
  const exists = connection.prepare("SELECT migration_id FROM schema_migrations WHERE migration_id = ?").get(migrationId);
  if (!exists) connection.prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (?, ?)").run(migrationId, fixedMigrationTimestamp);
}

function parseAssignment(value: PersistedAssignment): PersistedAssignment {
  if (!value.assignment_id || !value.candidate_pair_id || !value.annotator_id || !Number.isInteger(value.assignment_round) || value.assignment_round < 1 || !value.assigned_at) {
    throw new TypeError("assignment is invalid");
  }
  return Object.freeze({ ...value });
}

function parseCandidateBatch(value: PersistedCandidateBatch): PersistedCandidateBatch {
  if (!value.candidate_batch_id || !value.source_snapshot_id || !/^[a-f0-9]{64}$/.test(value.retrieval_config_hash) || !value.index_version || !value.created_at) {
    throw new TypeError("candidate batch is invalid");
  }
  return Object.freeze({
    ...value,
    candidate_pairs: Object.freeze(value.candidate_pairs.map((candidate) => CandidatePairSchema.parse(candidate))),
  });
}

function assertReferenceSafe(value: unknown): void {
  if (Array.isArray(value)) {
    for (const child of value) assertReferenceSafe(child);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (["body", "text", "raw_payload", "raw_payload_ref"].includes(key)) throw new Error("fixture export artifact cannot contain raw evidence");
    assertReferenceSafe(child);
  }
}

function assertExportPolicy(value: unknown): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const artifact = value as { readonly export_mode?: unknown; readonly evidence?: unknown };
  if (!Array.isArray(artifact.evidence) || artifact.evidence.length === 0) return;
  if (artifact.export_mode !== "reference-only") throw new Error("fixture export artifact must declare reference-only mode");
  for (const item of artifact.evidence) {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("fixture export evidence is invalid");
    const evidence = item as { readonly source_classification?: unknown; readonly source_policy_version?: unknown };
    if (!["PUBLIC_REDISTRIBUTABLE", "RESTRICTED_REFERENCE_ONLY", "SYNTHETIC"].includes(String(evidence.source_classification)) || typeof evidence.source_policy_version !== "string" || evidence.source_policy_version.length === 0) {
      throw new Error("fixture export evidence requires source classification and policy version");
    }
  }
}

function rows<T>(value: unknown): readonly T[] {
  return value as readonly T[];
}

/** Local Stage 3 persistence adapter for append-only Gold events and immutable fixture artifacts. */
export class SqliteGoldEventRepository {
  private readonly connection: DatabaseSync;

  public constructor(connection: DatabaseSync) {
    this.connection = connection;
    migrate(connection);
  }

  public static inMemoryConnection(): DatabaseSync {
    return new DatabaseSync(":memory:");
  }

  public static openLocal(repositoryRoot: string): SqliteGoldEventRepository {
    const localDataRoot = resolve(repositoryRoot, "data/local");
    mkdirSync(localDataRoot, { recursive: true });
    return new SqliteGoldEventRepository(new DatabaseSync(resolve(localDataRoot, "gold-lineage.sqlite")));
  }

  public appendAnnotation(annotation: Annotation): void {
    const validated = AnnotationSchema.parse(annotation);
    const existing = this.connection.prepare("SELECT annotation_id FROM annotation_events WHERE annotation_id = ?").get(validated.annotation_id);
    if (existing) throw new Error("append-only annotations cannot reuse an annotation ID");
    if (this.annotationsForPair(validated.candidate_pair_id).some((item) => item.annotator_id === validated.annotator_id && item.assignment_round === validated.assignment_round)) throw new Error("annotator already submitted an annotation for this pair and round");
    this.connection.prepare("INSERT INTO annotation_events (annotation_id, candidate_pair_id, event_json) VALUES (?, ?, ?)").run(validated.annotation_id, validated.candidate_pair_id, JSON.stringify(validated));
  }

  public appendAssignment(assignment: PersistedAssignment): void {
    const validated = parseAssignment(assignment);
    const existing = this.connection.prepare("SELECT assignment_id FROM assignment_events WHERE assignment_id = ?").get(validated.assignment_id);
    if (existing) throw new Error("duplicate assignment ID");
    this.connection.prepare("INSERT INTO assignment_events (assignment_id, candidate_pair_id, annotator_id, assignment_round, assigned_at, event_json) VALUES (?, ?, ?, ?, ?, ?)").run(validated.assignment_id, validated.candidate_pair_id, validated.annotator_id, validated.assignment_round, validated.assigned_at, JSON.stringify(validated));
  }

  public appendAdjudication(adjudication: Adjudication): void {
    const validated = AdjudicationSchema.parse(adjudication);
    const existing = this.connection.prepare("SELECT adjudication_id FROM adjudication_events WHERE adjudication_id = ?").get(validated.adjudication_id);
    if (existing) throw new Error("duplicate adjudication ID");
    this.connection.prepare("INSERT INTO adjudication_events (adjudication_id, candidate_pair_id, event_json) VALUES (?, ?, ?)").run(validated.adjudication_id, validated.candidate_pair_id, JSON.stringify(validated));
  }

  public storeRelease(release: GoldRelease): GoldRelease {
    const validated = GoldReleaseSchema.parse(release);
    const serialized = JSON.stringify(validated);
    const existing = this.connection.prepare("SELECT release_json FROM frozen_releases WHERE release_id = ?").get(validated.release_id) as unknown as { readonly release_json: string } | undefined;
    if (existing) {
      if (existing.release_json !== serialized) throw new Error("duplicate release ID has different immutable metadata");
      return validated;
    }
    this.connection.prepare("INSERT INTO frozen_releases (release_id, manifest_hash, release_json) VALUES (?, ?, ?)").run(validated.release_id, validated.manifest_hash, serialized);
    return validated;
  }

  public storeSourceSnapshot(snapshot: SourceSnapshot): void {
    const serialized = JSON.stringify(snapshot);
    const existing = this.connection.prepare("SELECT snapshot_json FROM source_snapshots WHERE source_snapshot_id = ?").get(snapshot.source_snapshot_id) as unknown as { readonly snapshot_json: string } | undefined;
    if (existing) {
      if (existing.snapshot_json !== serialized) throw new Error("source snapshot ID has immutable different content");
      return;
    }
    this.connection.prepare("INSERT INTO source_snapshots (source_snapshot_id, snapshot_json) VALUES (?, ?)").run(snapshot.source_snapshot_id, serialized);
  }

  public sourceSnapshotById(sourceSnapshotId: string): SourceSnapshot | undefined {
    const row = this.connection.prepare("SELECT snapshot_json FROM source_snapshots WHERE source_snapshot_id = ?").get(sourceSnapshotId) as unknown as { readonly snapshot_json: string } | undefined;
    return row ? Object.freeze(JSON.parse(row.snapshot_json) as SourceSnapshot) : undefined;
  }

  public storeCandidateBatch(batch: PersistedCandidateBatch): void {
    const validated = parseCandidateBatch(batch);
    const serialized = JSON.stringify(validated);
    const existing = this.connection.prepare("SELECT batch_json FROM candidate_batches WHERE candidate_batch_id = ?").get(validated.candidate_batch_id) as unknown as { readonly batch_json: string } | undefined;
    if (existing) {
      if (existing.batch_json !== serialized) throw new Error("candidate batch ID has immutable different content");
      return;
    }
    this.connection.prepare("INSERT INTO candidate_batches (candidate_batch_id, source_snapshot_id, retrieval_config_hash, index_version, batch_json) VALUES (?, ?, ?, ?, ?)").run(validated.candidate_batch_id, validated.source_snapshot_id, validated.retrieval_config_hash, validated.index_version, serialized);
  }

  public candidateBatchById(candidateBatchId: string): PersistedCandidateBatch | undefined {
    const row = this.connection.prepare("SELECT batch_json FROM candidate_batches WHERE candidate_batch_id = ?").get(candidateBatchId) as unknown as { readonly batch_json: string } | undefined;
    return row ? parseCandidateBatch(JSON.parse(row.batch_json) as PersistedCandidateBatch) : undefined;
  }

  public storeReleaseManifest(release: GoldRelease, manifest: string): void {
    const validated = GoldReleaseSchema.parse(release);
    const persisted = this.releaseById(validated.release_id);
    if (!persisted || persisted.manifest_hash !== validated.manifest_hash) throw new Error("release manifest must match the persisted release metadata");
    if (contentHash(manifest) !== validated.manifest_hash) throw new Error("release manifest checksum does not match release metadata");
    JSON.parse(manifest);
    const existing = this.connection.prepare("SELECT manifest_json FROM release_manifests WHERE release_id = ?").get(validated.release_id) as unknown as { readonly manifest_json: string } | undefined;
    if (existing) {
      if (existing.manifest_json !== manifest) throw new Error("immutable release manifest already exists with different bytes");
      return;
    }
    this.connection.prepare("INSERT INTO release_manifests (release_id, manifest_hash, manifest_json) VALUES (?, ?, ?)").run(validated.release_id, validated.manifest_hash, manifest);
  }

  public annotationsForPair(candidatePairId: string): readonly Annotation[] {
    const result = rows<{ readonly event_json: string }>(this.connection.prepare("SELECT event_json FROM annotation_events WHERE candidate_pair_id = ? ORDER BY annotation_id").all(candidatePairId));
    return Object.freeze(result.map((row) => AnnotationSchema.parse(JSON.parse(row.event_json))));
  }

  public assignmentsForPair(candidatePairId: string): readonly PersistedAssignment[] {
    const result = rows<{ readonly event_json: string }>(this.connection.prepare("SELECT event_json FROM assignment_events WHERE candidate_pair_id = ? ORDER BY assignment_id").all(candidatePairId));
    return Object.freeze(result.map((row) => parseAssignment(JSON.parse(row.event_json) as PersistedAssignment)));
  }

  public adjudicationForPair(candidatePairId: string): Adjudication | undefined {
    const row = this.connection.prepare("SELECT event_json FROM adjudication_events WHERE candidate_pair_id = ?").get(candidatePairId) as unknown as { readonly event_json: string } | undefined;
    return row ? AdjudicationSchema.parse(JSON.parse(row.event_json)) : undefined;
  }

  public releaseById(releaseId: string): GoldRelease | undefined {
    const row = this.connection.prepare("SELECT release_json FROM frozen_releases WHERE release_id = ?").get(releaseId) as unknown as { readonly release_json: string } | undefined;
    return row ? GoldReleaseSchema.parse(JSON.parse(row.release_json)) : undefined;
  }

  public manifestForRelease(releaseId: string): string | undefined {
    const row = this.connection.prepare("SELECT manifest_json FROM release_manifests WHERE release_id = ?").get(releaseId) as unknown as { readonly manifest_json: string } | undefined;
    return row?.manifest_json;
  }

  public writeFixtureExportArtifact(repositoryRoot: string, manifestHash: string, artifactJson: string, filename = "export.json"): string {
    if (!/^[a-f0-9]{64}$/.test(manifestHash)) throw new TypeError("manifest hash must be SHA-256 hex");
    if (basename(filename) !== filename) throw new Error("artifact path escape is not allowed");
    const parsed = JSON.parse(artifactJson) as unknown;
    assertReferenceSafe(parsed);
    assertExportPolicy(parsed);
    const root = resolve(repositoryRoot);
    const releasesRoot = resolve(root, "data/generated/releases");
    const artifactPath = resolve(releasesRoot, manifestHash, filename);
    if (!artifactPath.startsWith(`${releasesRoot}/`)) throw new Error("artifact path escape is not allowed");
    mkdirSync(resolve(releasesRoot, manifestHash), { recursive: true });
    if (this.fileExists(artifactPath)) {
      if (readFileSync(artifactPath, "utf8") !== artifactJson) throw new Error("immutable artifact already exists with different bytes");
      return artifactPath;
    }
    writeFileSync(artifactPath, artifactJson, { encoding: "utf8", flag: "wx" });
    return artifactPath;
  }

  public appliedMigrations(): readonly string[] {
    const result = rows<{ readonly migration_id: string }>(this.connection.prepare("SELECT migration_id FROM schema_migrations ORDER BY migration_id").all());
    return Object.freeze(result.map((row) => row.migration_id));
  }

  private fileExists(path: string): boolean {
    try {
      readFileSync(path);
      return true;
    } catch (error: unknown) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return false;
      throw error;
    }
  }
}

export interface DurableFreezeOptions {
  readonly semantic_version: string;
  readonly dataset_split: string;
  readonly guideline_version: string;
  readonly export_mode?: "reference-only";
}

export interface DurableFrozenFixtureRelease extends FrozenFixtureRelease {
  readonly artifact_path: string;
}

/** Rehydrates local Gold events before delegating validation to the canonical workflow. */
export class DurableGoldWorkflow {
  private readonly workflow: InMemoryGoldWorkflow;
  private readonly repository: SqliteGoldEventRepository;
  private readonly repositoryRoot: string;

  public constructor(
    snapshot: SourceSnapshot,
    candidates: readonly CandidatePair[],
    repository: SqliteGoldEventRepository,
    repositoryRoot: string,
  ) {
    this.workflow = new InMemoryGoldWorkflow(snapshot, candidates);
    this.repository = repository;
    this.repositoryRoot = repositoryRoot;
    for (const candidate of candidates) this.rehydrateCandidate(candidate);
  }

  public assign(candidatePairId: string, annotatorId: string, assignmentRound: number): void {
    this.workflow.assign(candidatePairId, annotatorId, assignmentRound);
    this.repository.appendAssignment({
      assignment_id: deterministicId("assignment", [candidatePairId, annotatorId, String(assignmentRound)]),
      candidate_pair_id: candidatePairId,
      annotator_id: annotatorId,
      assignment_round: assignmentRound,
      assigned_at: fixedMigrationTimestamp,
    });
  }

  public annotationPayload(candidatePairId: string, annotatorId: string): BlindedAnnotationPayload {
    return this.workflow.annotationPayload(candidatePairId, annotatorId);
  }

  public appendAnnotation(annotation: Annotation, actorId: string): void {
    this.workflow.appendAnnotation(annotation, actorId);
    this.repository.appendAnnotation(annotation);
  }

  public adjudicate(candidatePairId: string, label: ReleaseLabel & { readonly input_annotation_ids?: readonly string[]; readonly adjudicator_id?: string; readonly decision_reason?: string; readonly guideline_version?: string }): void {
    this.workflow.adjudicate(candidatePairId, label);
    if (!label.input_annotation_ids || !label.adjudicator_id || !label.decision_reason) throw new Error("adjudication requires complete audit data");
    this.repository.appendAdjudication(AdjudicationSchema.parse({
      adjudication_id: deterministicId("adj", [candidatePairId, ...[...label.input_annotation_ids].sort(), label.adjudicator_id]),
      candidate_pair_id: candidatePairId,
      input_annotation_ids: label.input_annotation_ids,
      relation: label.relation,
      anchor_work_type: label.anchor_work_type,
      candidate_work_type: label.candidate_work_type,
      decision_reason: label.decision_reason,
      adjudicator_id: label.adjudicator_id,
      guideline_version: label.guideline_version ?? "1.0.0",
      created_at: fixedMigrationTimestamp,
    }));
  }

  public freeze(options: DurableFreezeOptions): DurableFrozenFixtureRelease {
    const frozen = this.workflow.freeze(options);
    this.repository.storeRelease(frozen.release);
    this.repository.storeReleaseManifest(frozen.release, frozen.manifest);
    const artifact_path = this.repository.writeFixtureExportArtifact(this.repositoryRoot, frozen.release.manifest_hash, JSON.stringify(frozen.export));
    return Object.freeze({ ...frozen, artifact_path });
  }

  private rehydrateCandidate(candidate: CandidatePair): void {
    for (const assignment of this.repository.assignmentsForPair(candidate.candidate_pair_id)) {
      this.workflow.assign(assignment.candidate_pair_id, assignment.annotator_id, assignment.assignment_round);
    }
    for (const annotation of this.repository.annotationsForPair(candidate.candidate_pair_id)) {
      this.workflow.appendAnnotation(annotation, annotation.annotator_id);
    }
    const adjudication = this.repository.adjudicationForPair(candidate.candidate_pair_id);
    if (adjudication) {
      this.workflow.adjudicate(candidate.candidate_pair_id, {
        candidate_pair_id: candidate.candidate_pair_id,
        relation: adjudication.relation,
        anchor_work_type: adjudication.anchor_work_type,
        candidate_work_type: adjudication.candidate_work_type,
        input_annotation_ids: adjudication.input_annotation_ids,
        adjudicator_id: adjudication.adjudicator_id,
        decision_reason: adjudication.decision_reason,
        guideline_version: adjudication.guideline_version,
      });
    }
  }
}
