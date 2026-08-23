import {
  ChunkSchema,
  SourceRecordSchema,
  chunkId,
  contentHash,
  sourceRecordId,
  validateChunkAgainstSource,
  type Chunk,
  type SourceRecord,
} from "@atra/source-contracts";

export interface SourceSnapshot {
  readonly source_snapshot_id: string;
  readonly snapshot_version: string;
  readonly source_records: readonly SourceRecord[];
  readonly chunks: readonly Chunk[];
}

export type Provider = "ami" | "jira" | "github" | "google-docs";

export interface FixtureConnector {
  readonly provider: Provider;
  readonly dataset: string;
  readonly snapshot_version: string;
  load(): readonly SourceRecord[];
}

function record(
  provider: Provider,
  dataset: string,
  nativeId: string,
  recordType: string,
  title: string,
  body: string,
): SourceRecord {
  const ingestion_version = "fixture-parser-v1";
  return SourceRecordSchema.parse({
    source_record_id: sourceRecordId(provider, dataset, nativeId, ingestion_version),
    provider,
    dataset,
    native_id: nativeId,
    record_type: recordType,
    title,
    body,
    author_refs: Object.freeze([]),
    participant_refs: Object.freeze([]),
    created_at: "2026-08-21T10:00:00.000Z",
    updated_at: null,
    parent_ref: null,
    external_refs: Object.freeze([]),
    source_uri: `fixture://${provider}/${nativeId}`,
    content_hash: contentHash(body),
    license: "synthetic-test-fixture",
    source_classification: "SYNTHETIC",
    source_policy_version: "source-policy-v1",
    ingestion_version,
    raw_payload_ref: `fixture://raw/${provider}/${nativeId}.json`,
  });
}

function fixtureConnector(
  provider: Provider,
  nativeId: string,
  recordType: string,
  title: string,
  body: string,
): FixtureConnector {
  const dataset = "mvp-synthetic-v1";
  return Object.freeze({
    provider,
    dataset,
    snapshot_version: "snapshot-v1",
    load: () => Object.freeze([record(provider, dataset, nativeId, recordType, title, body)]),
  });
}

export function createPublicJiraFixtureConnector(): FixtureConnector {
  return fixtureConnector(
    "jira",
    "OTEL-101",
    "issue",
    "Retry OTLP exporter connections",
    "Description:\nImplement one bounded retry when the OTLP exporter connection fails transiently.\n\nComment: preserve the existing retry telemetry fields.",
  );
}

export function createOpenTelemetryGitHubFixtureConnector(): FixtureConnector {
  return fixtureConnector(
    "github",
    "opentelemetry-collector-contrib#1001",
    "issue",
    "Exporter retry follow-up",
    "Body:\nAdd bounded retry handling for transient OTLP exporter connection failures.\n\n<!-- comment -->\ninclude the retry outcome in the GitHub issue update.",
  );
}

export function createGoogleDocsFixtureConnector(): FixtureConnector {
  return fixtureConnector(
    "google-docs",
    "doc-exporter-reliability",
    "authorized_reference",
    "Exporter reliability decision",
    "Decision: add one bounded retry for transient exporter connection failures.\nThis decision applies to connection failures only.\n\nOwner: collector maintainers implement the retry.\n\nAcceptance: record the retry outcome in the operational guide.",
  );
}

export interface AmiTranscriptTurn {
  readonly speaker: string;
  readonly timestamp: string;
  readonly content: string;
}

export interface AmiTranscriptInput {
  readonly meeting_id: string;
  readonly title: string;
  readonly turns: readonly AmiTranscriptTurn[];
  readonly snapshot_version?: string;
}

/** Converts explicitly supplied, locally acquired AMI turns; it never downloads corpus material. */
export function createAmiTranscriptConnector(input: AmiTranscriptInput): FixtureConnector {
  if (!input.meeting_id || !input.title || input.turns.length === 0) throw new TypeError("AMI transcript requires a meeting, title, and turns");
  const snapshot_version = input.snapshot_version ?? "ami-local-snapshot-v1";
  const ingestion_version = "ami-transcript-turn-v1";
  const body = input.turns.map((turn) => {
    if (!turn.speaker || !turn.timestamp || !turn.content) throw new TypeError("AMI turn requires speaker, timestamp, and content");
    return `[${turn.speaker} @ ${turn.timestamp}]\n${turn.content}`;
  }).join("\n\n");
  const source = SourceRecordSchema.parse({
    source_record_id: sourceRecordId("ami", "ami-meeting-corpus", input.meeting_id, ingestion_version),
    provider: "ami",
    dataset: "ami-meeting-corpus",
    native_id: input.meeting_id,
    record_type: "meeting_transcript",
    title: input.title,
    body,
    author_refs: Object.freeze([]),
    participant_refs: Object.freeze([...new Set(input.turns.map((turn) => turn.speaker))].sort()),
    created_at: null,
    updated_at: null,
    parent_ref: null,
    external_refs: Object.freeze([]),
    source_uri: `https://groups.inf.ed.ac.uk/ami/corpus/meetingids.shtml#${encodeURIComponent(input.meeting_id)}`,
    content_hash: contentHash(body),
    license: "CC-BY-4.0",
    source_classification: "PUBLIC_REDISTRIBUTABLE",
    source_policy_version: "source-policy-v1",
    ingestion_version,
    raw_payload_ref: `local://ami/${input.meeting_id}.json`,
  });
  return Object.freeze({ provider: "ami", dataset: source.dataset, snapshot_version, load: () => Object.freeze([source]) });
}

interface TextRange {
  readonly start_offset: number;
  readonly end_offset: number;
  readonly speaker?: string;
  readonly timestamp?: string;
}

function paragraphRanges(text: string): readonly TextRange[] {
  const ranges: TextRange[] = [];
  let start = 0;
  for (const separator of text.matchAll(/\n\n/g)) {
    const end = separator.index ?? 0;
    if (text.slice(start, end).trim()) {
      ranges.push({ start_offset: start, end_offset: end });
    }
    start = end + separator[0].length;
  }
  if (text.slice(start).trim()) ranges.push({ start_offset: start, end_offset: text.length });
  return ranges;
}

function jiraRanges(text: string): readonly TextRange[] {
  const descriptionPrefix = "Description:\n";
  const commentMarker = "\n\nComment:";
  const start = text.startsWith(descriptionPrefix) ? descriptionPrefix.length : 0;
  const comment = text.indexOf(commentMarker, start);
  if (comment === -1) return [{ start_offset: start, end_offset: text.length }];
  return [
    { start_offset: start, end_offset: comment },
    { start_offset: comment + 2, end_offset: text.length },
  ];
}

function githubRanges(text: string): readonly TextRange[] {
  const bodyPrefix = "Body:\n";
  const commentMarker = "\n\n<!-- comment -->\n";
  const start = text.startsWith(bodyPrefix) ? bodyPrefix.length : 0;
  const comment = text.indexOf(commentMarker, start);
  if (comment === -1) return [{ start_offset: start, end_offset: text.length }];
  return [
    { start_offset: start, end_offset: comment },
    { start_offset: comment + commentMarker.length, end_offset: text.length },
  ];
}

function amiRanges(text: string): readonly TextRange[] {
  const headers = [...text.matchAll(/^\[([^\]]+) @ ([^\]]+)\]\n/gm)];
  if (headers.length === 0) throw new TypeError("AMI transcript body has no canonical turn headers");
  return headers.map((header, index) => {
    const start_offset = (header.index ?? 0) + header[0].length;
    const next = headers[index + 1];
    const end_offset = next ? (next.index ?? text.length) - 2 : text.length;
    const speaker = header[1];
    const timestamp = header[2];
    if (!speaker || !timestamp || end_offset <= start_offset) throw new TypeError("AMI transcript has an invalid turn");
    return { start_offset, end_offset, speaker, timestamp };
  });
}

function chunkerVersion(provider: FixtureConnector["provider"]): string {
  switch (provider) {
    case "ami":
      return "ami-speaker-turn-v1";
    case "jira":
      return "jira-issue-body-comment-v1";
    case "github":
      return "github-issue-pr-body-comment-v1";
    case "google-docs":
      return "google-docs-paragraph-line-range-v1";
  }
}

export function createProviderAwareChunks(source: SourceRecord): readonly Chunk[] {
  const provider = source.provider as FixtureConnector["provider"];
  const version = chunkerVersion(provider);
  const ranges = provider === "ami"
    ? amiRanges(source.body)
    : provider === "jira"
      ? jiraRanges(source.body)
      : provider === "github"
        ? githubRanges(source.body)
        : paragraphRanges(source.body);
  return Object.freeze(
    ranges.map((range, ordinal) => {
      const text = source.body.slice(range.start_offset, range.end_offset);
      const content_hash = contentHash(text);
      const chunk = ChunkSchema.parse({
        chunk_id: chunkId(source.source_record_id, ordinal, version, content_hash),
        source_record_id: source.source_record_id,
        ordinal,
        text,
        start_offset: range.start_offset,
        end_offset: range.end_offset,
        speaker: range.speaker ?? null,
        timestamp: range.timestamp ?? null,
        chunker_version: version,
        content_hash,
      });
      return validateChunkAgainstSource(chunk, source);
    }),
  );
}

export function createSyntheticSnapshot(connectors: readonly FixtureConnector[]): SourceSnapshot {
  const records = connectors
    .flatMap((connector) => connector.load())
    .sort((left, right) => left.source_record_id.localeCompare(right.source_record_id));
  const chunks = records.flatMap(createProviderAwareChunks);
  return Object.freeze({
    source_snapshot_id: `snapshot_${contentHash(records.map((item) => item.content_hash).join("\n"))}`,
    snapshot_version: "snapshot-v1",
    source_records: Object.freeze(records),
    chunks: Object.freeze(chunks),
  });
}

export type AcquisitionJobState = "RATE_LIMITED" | "SUCCEEDED";
export interface RecordedAcquisition { readonly source_family: "public-jira" | "opentelemetry-github"; readonly snapshot_id: string; readonly cursor: string | null; readonly parser_version: string; readonly license: string; readonly source_policy_version: string; readonly rate_limit_remaining: number; readonly retry_attempt: number; readonly payload: Readonly<Record<string, string | number>>; }
export interface AcquisitionJob { readonly acquisition_job_id: string; readonly source_family: RecordedAcquisition["source_family"]; readonly snapshot_id: string; readonly cursor: string | null; readonly state: AcquisitionJobState; readonly parser_version: string; readonly raw_payload_hash: string; readonly license: string; readonly source_policy_version: string; readonly retry_attempt: number; }
export interface RecordedAcquisitionResult { readonly job: AcquisitionJob; readonly records: readonly SourceRecord[]; readonly failures: readonly { readonly code: "RATE_LIMITED"; readonly retryable: true }[]; }

const recorded = (source_family: RecordedAcquisition["source_family"], payload: Readonly<Record<string, string | number>>): RecordedAcquisition => Object.freeze({ source_family, snapshot_id: `${source_family}-recorded-2026-08-21`, cursor: null, parser_version: `${source_family}-recorded-v1`, license: "Apache-2.0", source_policy_version: "source-policy-v1", rate_limit_remaining: 100, retry_attempt: 0, payload });
export function createRecordedJiraAcquisition(): RecordedAcquisition { return recorded("public-jira", Object.freeze({ native_id: "OTEL-501", title: "Record-safe retry acquisition", body: "Preserve retry cursor and rate-limit state.", updated_at: "2026-08-21T10:00:00.000Z" })); }
export function createRecordedGitHubAcquisition(): RecordedAcquisition { return recorded("opentelemetry-github", Object.freeze({ native_id: "opentelemetry/opentelemetry-collector-contrib#501", title: "Recorded acquisition lineage", body: "Preserve GitHub cursor, payload hash, and parser version.", updated_at: "2026-08-21T10:00:00.000Z" })); }

export function normalizeRecordedAcquisition(input: RecordedAcquisition): RecordedAcquisitionResult {
  const raw_payload_hash = contentHash(JSON.stringify(input.payload));
  const acquisition_job_id = `acq_${contentHash([input.source_family, input.snapshot_id, input.cursor ?? "", input.parser_version, raw_payload_hash].join("\n"))}`;
  const job = (state: AcquisitionJobState): AcquisitionJob => Object.freeze({ acquisition_job_id, source_family: input.source_family, snapshot_id: input.snapshot_id, cursor: input.cursor, state, parser_version: input.parser_version, raw_payload_hash, license: input.license, source_policy_version: input.source_policy_version, retry_attempt: input.retry_attempt });
  if (input.rate_limit_remaining <= 0) return Object.freeze({ job: job("RATE_LIMITED"), records: Object.freeze([]), failures: Object.freeze([{ code: "RATE_LIMITED" as const, retryable: true as const }]) });
  const provider = input.source_family === "public-jira" ? "jira" : "github";
  const native_id = String(input.payload.native_id);
  const body = String(input.payload.body);
  const record = SourceRecordSchema.parse({ source_record_id: sourceRecordId(provider, input.source_family, native_id, input.parser_version), provider, dataset: input.source_family, native_id, record_type: "issue", title: String(input.payload.title), body, author_refs: [], participant_refs: [], created_at: null, updated_at: String(input.payload.updated_at), parent_ref: null, external_refs: [], source_uri: `recorded://${input.source_family}/${encodeURIComponent(native_id)}`, content_hash: contentHash(body), license: input.license, source_classification: "PUBLIC_REDISTRIBUTABLE", source_policy_version: input.source_policy_version, ingestion_version: input.parser_version, raw_payload_ref: `local://recorded/${raw_payload_hash}.json` });
  return Object.freeze({ job: job("SUCCEEDED"), records: Object.freeze([record]), failures: Object.freeze([]) });
}
