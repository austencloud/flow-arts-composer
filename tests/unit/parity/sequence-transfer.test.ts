import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertTransferablePublicAggregate,
  buildMovedOwnerRecord,
  buildTransferredPublicProjection,
  parseSequenceTransferArgs,
} from "../../../scripts/transfer-sequence";
import { computeStoredProjectionDigest } from "#lib/shared/library/services/public-sequence-projection.js";

const projectRoot = path.resolve(import.meta.dirname, "../../..");

function readProjectFile(relativePath: string): string {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

describe("sequence ownership transfer", () => {
  it("makes the common temporary-owner handoff one command", () => {
    expect(parseSequenceTransferArgs(["sequence-123", "MakeRainbows"])).toEqual(
      {
        sequenceId: "sequence-123",
        targetSelector: "MakeRainbows",
        sourceOwnerId: "PBp3GSBO6igCKPwJyLZNmVEmamI3",
        dryRun: false,
      }
    );

    const packageJson = JSON.parse(readProjectFile("package.json")) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts["sequence:transfer"]).toBe(
      "node --import tsx scripts/transfer-sequence.ts"
    );
  });

  it("supports a safe preview and an explicit source owner", () => {
    expect(
      parseSequenceTransferArgs([
        "sequence-456",
        "target-uid",
        "--from",
        "source-uid",
        "--dry-run",
      ])
    ).toEqual({
      sequenceId: "sequence-456",
      targetSelector: "target-uid",
      sourceOwnerId: "source-uid",
      dryRun: true,
    });
  });

  it("rejects selectors that could escape their Firestore paths", () => {
    expect(() =>
      parseSequenceTransferArgs(["sequence-456", "users/target"])
    ).toThrow(/cannot contain/);
  });

  it("drops source-library metadata while preserving movement data", () => {
    const now = new Date("2026-09-01T03:00:00.000Z");
    const moved = buildMovedOwnerRecord(
      {
        ownerId: "source-uid",
        word: "LDJFLDJF",
        contentHash: "movement-hash",
        isFavorite: true,
        collectionIds: ["source-collection"],
        tagIds: ["source-tag"],
        sequenceTags: ["source-tag"],
      },
      "target-uid",
      now,
      { revision: 8, schema: 2, digest: "new-digest" }
    );

    expect(moved).toMatchObject({
      ownerId: "target-uid",
      word: "LDJFLDJF",
      contentHash: "movement-hash",
      isFavorite: false,
      updatedAt: now,
      publicProjectionRevision: 8,
      publicProjectionSchemaVersion: 2,
      publicProjectionDigest: "new-digest",
    });
    expect(moved).not.toHaveProperty("collectionIds");
    expect(moved).not.toHaveProperty("tagIds");
    expect(moved).not.toHaveProperty("sequenceTags");
  });

  it("re-attributes the public projection without resetting engagement", async () => {
    const stored = {
      ownerId: "source-uid",
      ownerDisplayName: "Temporary Owner",
      ownerAvatarUrl: "https://example.com/old.png",
      sourceRef: "users/source-uid/sequences/sequence-123",
      contentHashVersion: 2,
      contentHash: "movement-hash",
      word: "LDJFLDJF",
      viewCount: 17,
      starCount: 4,
      forkCount: 3,
      publicProjectionSchemaVersion: 2,
      publicProjectionRevision: 7,
      publicProjectionDigest: "old-digest",
    };
    const moved = await buildTransferredPublicProjection(
      stored,
      "sequence-123",
      { ownerId: "target-uid", displayName: "MakeRainbows" },
      new Date("2026-09-01T03:00:00.000Z")
    );

    expect(moved).toMatchObject({
      ownerId: "target-uid",
      ownerDisplayName: "MakeRainbows",
      sourceRef: "users/target-uid/sequences/sequence-123",
      viewCount: 17,
      starCount: 4,
      forkCount: 3,
      publicProjectionSchemaVersion: 2,
      publicProjectionRevision: 8,
    });
    expect(moved).not.toHaveProperty("ownerAvatarUrl");
    expect(moved["publicProjectionDigest"]).not.toBe("old-digest");
    expect(moved["publicProjectionDigest"]).toBe(
      await computeStoredProjectionDigest(moved)
    );
  });

  it("refuses a public transfer when projection parity is stale", async () => {
    const publicData = {
      ownerId: "source-uid",
      sourceRef: "users/source-uid/sequences/sequence-123",
      contentHashVersion: 2,
      contentHash: "movement-hash",
      word: "LDJFLDJF",
      publicProjectionSchemaVersion: 2,
      publicProjectionRevision: 7,
      publicProjectionDigest: "stale-digest",
    };
    const sourceData = { ...publicData, visibility: "public" };
    const claimData = {
      ownerId: "source-uid",
      sequenceId: "sequence-123",
      contentHashVersion: 2,
      contentHash: "movement-hash",
    };

    await expect(
      assertTransferablePublicAggregate(
        sourceData,
        publicData,
        claimData,
        "source-uid",
        "sequence-123",
        "users/source-uid/sequences/sequence-123"
      )
    ).rejects.toThrow(/stale/);
  });

  it("refuses a public transfer when the claim belongs elsewhere", async () => {
    const publicData: Record<string, unknown> = {
      ownerId: "source-uid",
      sourceRef: "users/source-uid/sequences/sequence-123",
      contentHashVersion: 2,
      contentHash: "movement-hash",
      word: "LDJFLDJF",
      publicProjectionSchemaVersion: 2,
      publicProjectionRevision: 7,
    };
    publicData["publicProjectionDigest"] =
      await computeStoredProjectionDigest(publicData);
    const sourceData = { ...publicData, visibility: "public" };

    await expect(
      assertTransferablePublicAggregate(
        sourceData,
        publicData,
        {
          ownerId: "another-user",
          sequenceId: "sequence-123",
          contentHashVersion: 2,
          contentHash: "movement-hash",
        },
        "source-uid",
        "sequence-123",
        "users/source-uid/sequences/sequence-123"
      )
    ).rejects.toThrow(/hash claim/);
  });

  it("keeps every ownership surface and both counters in one transaction", () => {
    const script = readProjectFile("scripts/transfer-sequence.ts");
    const transaction = script.slice(
      script.indexOf("return db.runTransaction")
    );

    expect(transaction).toContain(
      "transaction.set(targetOwnerRef, movedOwner)"
    );
    expect(transaction).toContain("transaction.delete(sourceOwnerRef)");
    expect(transaction).toContain("transaction.set(publicRef, nextPublic)");
    expect(transaction).toContain("transaction.update(claimRef");
    expect(transaction).toContain("shortcodes/${shortcode.id}");
    expect(transaction).toContain("transaction.update(sourceProfileRef");
    expect(transaction).toContain("transaction.update(targetProfileRef");
  });
});
