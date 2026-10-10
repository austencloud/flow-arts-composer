import { describe, expect, it } from "vitest";
import { buildSequenceRevisionRecord } from "#lib/shared/library/services/sequence-revision.js";
import type { PublicSequenceProjectionWrite } from "#lib/shared/library/services/public-sequence-projection.js";

function projection(
  overrides: Partial<PublicSequenceProjectionWrite> = {}
): PublicSequenceProjectionWrite {
  return {
    id: "sequence-1",
    sourceRef: "users/owner-1/sequences/sequence-1",
    ownerId: "owner-1",
    ownerDisplayName: "Austen",
    name: "Sequence",
    word: "ABCD",
    thumbnails: ["one.webp"],
    sequenceLength: 4,
    isCircular: false,
    loopType: null,
    tags: [],
    isForked: false,
    contentHash: "c".repeat(64),
    contentHashVersion: 2,
    encoderHash: "e".repeat(64),
    forkCount: 0,
    viewCount: 0,
    starCount: 0,
    publicPerformanceCount: 0,
    publishedAt: new Date(0),
    updatedAt: new Date(0),
    publicProjectionRevision: 1,
    publicProjectionSchemaVersion: 2,
    publicProjectionDigest: "d".repeat(64),
    ...overrides,
  };
}

describe("retained sequence revisions", () => {
  it("keeps subject identity stable across discovery-only changes", async () => {
    const first = await buildSequenceRevisionRecord(projection(), new Date(0));
    const repainted = await buildSequenceRevisionRecord(
      projection({
        ownerDisplayName: "Renamed creator",
        thumbnails: ["two.webp"],
        publicProjectionDigest: "f".repeat(64),
        publicProjectionRevision: 2,
      }),
      new Date(1)
    );

    expect(repainted.revisionId).toBe(first.revisionId);
    expect(repainted.contentDigest).toBe(first.contentDigest);
  });

  it("creates a new retained subject when canonical motion changes", async () => {
    const first = await buildSequenceRevisionRecord(projection(), new Date(0));
    const changed = await buildSequenceRevisionRecord(
      projection({ contentHash: "f".repeat(64) }),
      new Date(1)
    );

    expect(changed.revisionId).not.toBe(first.revisionId);
    expect(changed.payload["word"]).toBe("ABCD");
    expect(changed.payload).not.toHaveProperty("starCount");
  });
});
