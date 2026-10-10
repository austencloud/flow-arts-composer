import { describe, expect, it } from "vitest";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { LibraryCollection } from "#lib/shared/library/domain/models/collection.js";
import {
  addSequenceToCollection,
  removeSequenceFromCollection,
} from "#lib/shared/library/domain/models/collection.js";
import { createLibrarySequence } from "#lib/shared/library/domain/models/library-sequence.js";

function collection(
  sequenceIds: string[],
  sequenceCount: number
): LibraryCollection {
  const now = new Date();
  return {
    id: "collection-1",
    name: "Collection",
    ownerId: "owner-1",
    sequenceIds,
    sequenceCount,
    icon: "fa-folder",
    isPublic: false,
    sortOrder: 0,
    kind: "manual",
    createdAt: now,
    updatedAt: now,
  };
}

describe("collection membership count invariant", () => {
  it("derives add counts from the authoritative id list", () => {
    const result = addSequenceToCollection(
      collection(["sequence-1"], 7),
      "sequence-2"
    );

    expect(result.sequenceIds).toEqual(["sequence-1", "sequence-2"]);
    expect(result.sequenceCount).toBe(2);
  });

  it("heals a stale count when a duplicate add is retried", () => {
    const result = addSequenceToCollection(
      collection(["sequence-1"], 7),
      "sequence-1"
    );

    expect(result.sequenceIds).toEqual(["sequence-1"]);
    expect(result.sequenceCount).toBe(1);
  });

  it("derives remove counts from the remaining ids", () => {
    const result = removeSequenceFromCollection(
      collection(["sequence-1", "sequence-2"], 99),
      "sequence-1"
    );

    expect(result.sequenceIds).toEqual(["sequence-2"]);
    expect(result.sequenceCount).toBe(1);
  });
});

describe("library sequence visibility default", () => {
  it("creates new sequences as public unless a caller opts out", () => {
    const sequence = createLibrarySequence(
      {
        id: "sequence-1",
        name: "Example",
        word: "EXAMPLE",
        steps: [],
      } as SequenceData,
      "owner-1"
    );

    expect(sequence.visibility).toBe("public");
  });
});
