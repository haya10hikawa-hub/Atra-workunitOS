import { describe, expect, it } from "vitest";
import {
  createRecordedGitHubAcquisition,
  createRecordedJiraAcquisition,
  normalizeRecordedAcquisition,
} from "@atra/connectors";

describe("restartable recorded source acquisition", () => {
  it("normalizes pinned Jira and GitHub recorded responses deterministically", () => {
    const jira = createRecordedJiraAcquisition();
    const github = createRecordedGitHubAcquisition();
    const first = [normalizeRecordedAcquisition(jira), normalizeRecordedAcquisition(github)];
    const second = [normalizeRecordedAcquisition(jira), normalizeRecordedAcquisition(github)];
    expect(first).toEqual(second);
    expect(first.map((result) => result.job.state)).toEqual(["SUCCEEDED", "SUCCEEDED"]);
    expect(first.flatMap((result) => result.records).map((record) => record.content_hash)).toHaveLength(2);
    expect(first.every((result) => result.job.raw_payload_hash.length === 64)).toBe(true);
  });

  it("keeps a rate-limited cursor resumable without creating records", () => {
    const pending = normalizeRecordedAcquisition({ ...createRecordedJiraAcquisition(), rate_limit_remaining: 0, cursor: "page-2" });
    expect(pending.records).toEqual([]);
    expect(pending.job.state).toBe("RATE_LIMITED");
    expect(pending.job.cursor).toBe("page-2");
  });
});
