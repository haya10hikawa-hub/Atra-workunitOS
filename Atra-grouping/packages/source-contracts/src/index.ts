import { createHash } from "node:crypto";
import { z } from "zod";

export interface DeterministicIdGenerator {
  create(namespace: string, parts: readonly string[]): string;
}

export const sha256IdGenerator: DeterministicIdGenerator = Object.freeze({
  create(namespace: string, parts: readonly string[]): string {
    if (!/^[a-z][a-z0-9_]*$/.test(namespace)) {
      throw new TypeError(`Invalid deterministic ID namespace: ${namespace}`);
    }
    const digest = createHash("sha256").update(JSON.stringify(parts), "utf8").digest("hex");
    return `${namespace}_${digest}`;
  },
});

export function deterministicId(namespace: string, parts: readonly string[]): string {
  return sha256IdGenerator.create(namespace, parts);
}

export function contentHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function sourceRecordId(
  provider: string,
  dataset: string,
  nativeId: string,
  ingestionVersion: string,
): string {
  return deterministicId("sr", [provider, dataset, nativeId, ingestionVersion]);
}

export function chunkId(
  sourceRecordIdValue: string,
  ordinal: number,
  chunkerVersion: string,
  chunkContentHash: string,
): string {
  return deterministicId("ch", [
    sourceRecordIdValue,
    ordinal.toString(10),
    chunkerVersion,
    chunkContentHash,
  ]);
}

const RequiredString = z.string().min(1);
const NullableString = RequiredString.nullable();
const Timestamp = z.iso.datetime({ offset: true });
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const StringRefs = z.array(RequiredString).readonly();
export const SourceClassificationSchema = z.enum(["PUBLIC_REDISTRIBUTABLE", "RESTRICTED_REFERENCE_ONLY", "SYNTHETIC"]);
export type SourceClassification = z.infer<typeof SourceClassificationSchema>;

export const SourceRecordSchema = z
  .object({
    source_record_id: RequiredString,
    provider: RequiredString,
    dataset: RequiredString,
    native_id: RequiredString,
    record_type: RequiredString,
    title: NullableString,
    body: z.string(),
    author_refs: StringRefs,
    participant_refs: StringRefs,
    created_at: Timestamp.nullable(),
    updated_at: Timestamp.nullable(),
    parent_ref: NullableString,
    external_refs: StringRefs,
    source_uri: RequiredString,
    content_hash: Sha256,
    license: RequiredString,
    source_classification: SourceClassificationSchema,
    source_policy_version: RequiredString,
    ingestion_version: RequiredString,
    raw_payload_ref: RequiredString,
  })
  .strict()
  .superRefine((source, context) => {
    if (
      source.source_record_id !==
      sourceRecordId(source.provider, source.dataset, source.native_id, source.ingestion_version)
    ) {
      context.addIssue({
        code: "custom",
        path: ["source_record_id"],
        message: "source_record_id must match provider, dataset, native_id, and ingestion_version",
      });
    }
    if (source.content_hash !== contentHash(source.body)) {
      context.addIssue({
        code: "custom",
        path: ["content_hash"],
        message: "source content_hash must match the canonical body",
      });
    }
  })
  .readonly();

export type SourceRecord = z.infer<typeof SourceRecordSchema>;

export const ChunkSchema = z
  .object({
    chunk_id: RequiredString,
    source_record_id: RequiredString,
    ordinal: z.number().int().nonnegative(),
    text: z.string(),
    start_offset: z.number().int().nonnegative(),
    end_offset: z.number().int().nonnegative(),
    speaker: NullableString,
    timestamp: Timestamp.nullable(),
    chunker_version: RequiredString,
    content_hash: Sha256,
  })
  .strict()
  .superRefine((chunk, context) => {
    if (chunk.end_offset < chunk.start_offset) {
      context.addIssue({ code: "custom", message: "end_offset must not precede start_offset" });
    }
    if (chunk.end_offset - chunk.start_offset !== chunk.text.length) {
      context.addIssue({
        code: "custom",
        message: "chunk offset range must match the canonical text length",
      });
    }
    if (chunk.content_hash !== contentHash(chunk.text)) {
      context.addIssue({
        code: "custom",
        path: ["content_hash"],
        message: "chunk content_hash must match text",
      });
    }
    if (
      chunk.chunk_id !==
      chunkId(chunk.source_record_id, chunk.ordinal, chunk.chunker_version, chunk.content_hash)
    ) {
      context.addIssue({
        code: "custom",
        path: ["chunk_id"],
        message: "chunk_id must match source, ordinal, chunker version, and content hash",
      });
    }
  })
  .readonly();

export type Chunk = z.infer<typeof ChunkSchema>;

export const ChunkSourceIntegritySchema = z
  .object({ source: SourceRecordSchema, chunk: ChunkSchema })
  .strict()
  .superRefine(({ source, chunk }, context) => {
    if (chunk.source_record_id !== source.source_record_id) {
      context.addIssue({
        code: "custom",
        path: ["chunk", "source_record_id"],
        message: "chunk must reference the supplied source record",
      });
    }
    if (chunk.end_offset > source.body.length) {
      context.addIssue({
        code: "custom",
        path: ["chunk", "end_offset"],
        message: "chunk offsets must be within the canonical source body",
      });
    }
    if (source.body.slice(chunk.start_offset, chunk.end_offset) !== chunk.text) {
      context.addIssue({
        code: "custom",
        path: ["chunk", "text"],
        message: "chunk text must equal the referenced canonical source slice",
      });
    }
  })
  .readonly();

export function validateChunkAgainstSource(chunk: unknown, source: unknown): Chunk {
  return ChunkSourceIntegritySchema.parse({ source, chunk }).chunk;
}
