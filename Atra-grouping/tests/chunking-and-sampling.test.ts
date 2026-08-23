import { describe, expect, it } from "vitest";
import {
  createAmiTranscriptConnector,
  createGoogleDocsFixtureConnector,
  createOpenTelemetryGitHubFixtureConnector,
  createPublicJiraFixtureConnector,
  createSyntheticSnapshot,
} from "@atra/connectors";
import { validateChunkAgainstSource } from "@atra/source-contracts";
import {
  createFixtureSamplingOptions,
  createDeterministicCandidateBatch,
  deterministicEttinReranker,
  deterministicGteRetriever,
  fixtureRetrievalConfig,
} from "@atra/retrieval";

function snapshot() {
  return createSyntheticSnapshot([
    createPublicJiraFixtureConnector(),
    createOpenTelemetryGitHubFixtureConnector(),
    createGoogleDocsFixtureConnector(),
  ]);
}

describe("provider-aware fixture chunking", () => {
  it("preserves AMI meeting, speaker, timestamp, and turn provenance without fetching external data", () => {
    const sourceSnapshot = createSyntheticSnapshot([
      createAmiTranscriptConnector({
        meeting_id: "ES2002a",
        title: "Synthetic AMI integration fixture",
        turns: [
          { speaker: "A", timestamp: "2026-08-21T10:00:00.000Z", content: "We need a revised prototype plan." },
          { speaker: "B", timestamp: "2026-08-21T10:01:00.000Z", content: "I will draft the action list." },
        ],
      }),
    ]);
    const source = sourceSnapshot.source_records[0];
    expect(source?.provider).toBe("ami");
    expect(source?.license).toBe("CC-BY-4.0");
    expect(source?.raw_payload_ref).toBe("local://ami/ES2002a.json");
    expect(sourceSnapshot.chunks.map(({ speaker, timestamp, text, chunker_version }) => ({ speaker, timestamp, text, chunker_version }))).toEqual([
      { speaker: "A", timestamp: "2026-08-21T10:00:00.000Z", text: "We need a revised prototype plan.", chunker_version: "ami-speaker-turn-v1" },
      { speaker: "B", timestamp: "2026-08-21T10:01:00.000Z", text: "I will draft the action list.", chunker_version: "ami-speaker-turn-v1" },
    ]);
  });

  it("creates deterministic, provider-specific chunks that round-trip to canonical source text", () => {
    const first = snapshot();
    const second = snapshot();
    expect(first.chunks).toEqual(second.chunks);

    for (const chunk of first.chunks) {
      const source = first.source_records.find((record) => record.source_record_id === chunk.source_record_id);
      expect(source).toBeDefined();
      if (!source) throw new Error("chunk source required");
      expect(validateChunkAgainstSource(chunk, source)).toEqual(chunk);
    }

    const chunksByProvider = new Map(
      first.source_records.map((record) => [
        record.provider,
        first.chunks.filter((chunk) => chunk.source_record_id === record.source_record_id),
      ]),
    );
    expect(chunksByProvider.get("jira")?.length).toBeGreaterThan(1);
    expect(chunksByProvider.get("github")?.length).toBeGreaterThan(1);
    expect(chunksByProvider.get("google-docs")?.length).toBeGreaterThan(1);
    expect(
      first.chunks
        .filter((chunk) => chunk.chunker_version === "jira-issue-body-comment-v1")
        .map((chunk) => chunk.text),
    ).toEqual([
      "Implement one bounded retry when the OTLP exporter connection fails transiently.",
      "Comment: preserve the existing retry telemetry fields.",
    ]);
    expect(
      first.chunks
        .filter((chunk) => chunk.chunker_version === "github-issue-pr-body-comment-v1")
        .map((chunk) => chunk.text),
    ).toEqual([
      "Add bounded retry handling for transient OTLP exporter connection failures.",
      "include the retry outcome in the GitHub issue update.",
    ]);
    expect(
      first.chunks.find((chunk) => chunk.chunker_version === "google-docs-paragraph-line-range-v1")
        ?.text,
    ).toContain("\n");
  });
});

describe("deterministic candidate sampling", () => {
  it("deduplicates repeated chunks, excludes self-pairs, and reports score/challenge/provider quotas", () => {
    const sourceSnapshot = snapshot();
    const duplicatedSnapshot = Object.freeze({
      ...sourceSnapshot,
      chunks: Object.freeze([...sourceSnapshot.chunks, ...sourceSnapshot.chunks]),
    });
    const first = createDeterministicCandidateBatch(
      duplicatedSnapshot,
      fixtureRetrievalConfig,
      deterministicGteRetriever,
      deterministicEttinReranker,
      createFixtureSamplingOptions(duplicatedSnapshot),
    );
    const second = createDeterministicCandidateBatch(
      duplicatedSnapshot,
      fixtureRetrievalConfig,
      deterministicGteRetriever,
      deterministicEttinReranker,
      createFixtureSamplingOptions(duplicatedSnapshot),
    );

    expect(first).toEqual(second);
    expect(new Set(first.candidates.map((candidate) => candidate.candidate_pair_id)).size).toBe(
      first.candidates.length,
    );
    for (const candidate of first.candidates) {
      expect(candidate.anchor_chunk_id).not.toBe(candidate.candidate_chunk_id);
    }
    expect(Object.keys(first.sampling_report.score_bands).sort()).toEqual(["high", "low", "medium"]);
    expect(first.sampling_report.provider_pairs["github:jira"]?.requested).toBeGreaterThan(0);
    expect(first.sampling_report.challenge_buckets["same_identifier_different_work"]?.requested).toBe(1);
    expect(first.sampling_report.challenge_buckets["same_identifier_different_work"]?.selected).toBe(1);
    expect(first.sampling_report.challenge_buckets["easy_negative_control"]?.available).toBeGreaterThanOrEqual(0);
    expect(first.sampling_report.challenge_buckets["easy_negative_control"]?.selected).toBeLessThanOrEqual(1);
    expect(first.sampling_report.policy_version).toBe(
      createFixtureSamplingOptions(duplicatedSnapshot).policy.policy_version,
    );
  });

  it("reports quota exhaustion without selecting an uncontrolled extra candidate", () => {
    const sourceSnapshot = snapshot();
    const defaults = createFixtureSamplingOptions(sourceSnapshot);
    const options = {
      ...defaults,
      policy: {
        ...defaults.policy,
        challenge_bucket_quotas: {
          ...defaults.policy.challenge_bucket_quotas,
          easy_negative_control: 0,
        },
      },
    };
    const batch = createDeterministicCandidateBatch(
      sourceSnapshot,
      fixtureRetrievalConfig,
      deterministicGteRetriever,
      deterministicEttinReranker,
      options,
    );

    expect(batch.sampling_report.challenge_buckets.easy_negative_control).toEqual({
      requested: 0,
      available: 1,
      selected: 0,
    });
  });
});
