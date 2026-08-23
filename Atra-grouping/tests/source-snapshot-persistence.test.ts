import { describe, expect, it } from "vitest";
import { SqliteGoldEventRepository } from "@atra/gold/sqlite";
import { createSyntheticSnapshot, createPublicJiraFixtureConnector } from "@atra/connectors";

describe("source snapshot persistence", () => {
  it("stores immutable normalized source snapshots and exact chunks", () => {
    const repository = new SqliteGoldEventRepository(SqliteGoldEventRepository.inMemoryConnection());
    const snapshot = createSyntheticSnapshot([createPublicJiraFixtureConnector()]);
    repository.storeSourceSnapshot(snapshot);
    expect(repository.sourceSnapshotById(snapshot.source_snapshot_id)).toEqual(snapshot);
  });
});
