/**
 * The silent failures: a same-id sequence by another person standing in for a
 * member (ids are word-derived and collide), placeholders drawn in an order the
 * cards don't take, and a half-known list producing shapes that then jump.
 */
import { describe, expect, it } from "vitest";
import type { LibraryCollection } from "#lib/shared/library/domain/models/collection.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { cardStepsKey } from "#lib/shared/library/domain/collection-card-steps.js";
import {
  collectionPlaceholderSteps,
  resolvePlaceholderSteps,
} from "../collection-placeholder-steps";

const OWNER = "owner-uid";

function collection(
  ids: string[],
  extra: Partial<LibraryCollection> = {}
): LibraryCollection {
  return {
    id: "col",
    name: "8-step caps",
    ownerId: OWNER,
    sequenceIds: ids,
    sequenceCount: ids.length,
    isPublic: true,
    sortOrder: 0,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...extra,
  } as LibraryCollection;
}

function seq(
  id: string,
  ownerId: string,
  sequenceLength: number,
  extra: Partial<SequenceData> = {}
): SequenceData {
  return { id, ownerId, word: id, sequenceLength, ...extra } as SequenceData;
}

const PUBLIC = { publicView: true };
const OWN = { publicView: false };

describe("collectionPlaceholderSteps", () => {
  it("keeps the collection's order, not the catalogue's", () => {
    const catalog = [
      seq("a", OWNER, 8),
      seq("b", OWNER, 20),
      seq("c", OWNER, 4),
    ];
    expect(
      collectionPlaceholderSteps(
        collection(["c", "a", "b"]),
        OWNER,
        catalog,
        PUBLIC
      )
    ).toEqual([4, 8, 20]);
  });

  it("matches by owner: the same id by someone else is not a member", () => {
    const catalog = [seq("a", "someone-else", 16), seq("b", OWNER, 8)];
    // Only one real member is public, so the count of two cannot be met.
    expect(
      collectionPlaceholderSteps(collection(["a", "b"]), OWNER, catalog, PUBLIC)
    ).toBeNull();
    // With the real one present too, it wins over the impostor.
    const withReal = [...catalog, seq("a", OWNER, 12)];
    expect(
      collectionPlaceholderSteps(
        collection(["a", "b"]),
        OWNER,
        withReal,
        PUBLIC
      )
    ).toEqual([12, 8]);
  });

  it("follows a gallery member to the person recorded for it", () => {
    const col = collection(["a", "b"], { galleryOwnerIds: { a: "creator" } });
    const catalog = [
      seq("a", "creator", 16),
      seq("a", OWNER, 4),
      seq("b", OWNER, 8),
    ];
    expect(collectionPlaceholderSteps(col, OWNER, catalog, PUBLIC)).toEqual([
      16, 8,
    ]);
  });

  it("public view: null unless the found count equals the public count", () => {
    const catalog = [seq("a", OWNER, 8), seq("b", OWNER, 8)];
    expect(
      collectionPlaceholderSteps(
        collection(["a", "b", "private"], { sequenceCount: 2 }),
        OWNER,
        catalog,
        PUBLIC
      )
    ).toEqual([8, 8]);
    expect(
      collectionPlaceholderSteps(
        collection(["a", "b", "private"], { sequenceCount: 3 }),
        OWNER,
        catalog,
        PUBLIC
      )
    ).toBeNull();
  });

  it("own collection: one member missing from the catalogue makes it null", () => {
    const catalog = [seq("a", OWNER, 8), seq("b", OWNER, 8)];
    expect(
      collectionPlaceholderSteps(
        collection(["a", "b", "private"]),
        OWNER,
        catalog,
        OWN
      )
    ).toBeNull();
    expect(
      collectionPlaceholderSteps(collection(["a", "b"]), OWNER, catalog, OWN)
    ).toEqual([8, 8]);
  });

  it("smart collections and a missing catalogue give null", () => {
    const catalog = [seq("a", OWNER, 8)];
    expect(
      collectionPlaceholderSteps(
        collection(["a"], { kind: "smart" }),
        OWNER,
        catalog,
        PUBLIC
      )
    ).toBeNull();
    expect(
      collectionPlaceholderSteps(collection(["a"]), OWNER, null, PUBLIC)
    ).toBeNull();
  });

  it("takes the step count the way the cards do (hydrated steps win)", () => {
    const steps = Array.from(
      { length: 12 },
      () => ({})
    ) as unknown as SequenceData["steps"];
    const catalog = [seq("a", OWNER, 8, { steps }), seq("b", OWNER, 0)];
    // Twelve real steps beat the stored length; no length at all reads as 4.
    expect(
      collectionPlaceholderSteps(collection(["a", "b"]), OWNER, catalog, PUBLIC)
    ).toEqual([12, 4]);
  });

  it("draws one placeholder per word, as the grid draws one card per word", () => {
    const catalog = [
      seq("a1", OWNER, 8, { word: "AB" }),
      seq("a2", OWNER, 16, { word: "ABAB" }),
      seq("c", OWNER, 4, { word: "C" }),
    ];
    expect(
      collectionPlaceholderSteps(
        collection(["a1", "a2", "c"]),
        OWNER,
        catalog,
        PUBLIC
      )
    ).toEqual([8, 4]);
  });
});

describe("resolvePlaceholderSteps", () => {
  const ids = ["a", "b"];
  const stored = { key: cardStepsKey(ids), steps: [3, 5] };

  it("uses the stored list on a cold public visit", () => {
    expect(
      resolvePlaceholderSteps(
        collection(ids, { cardSteps: stored }),
        OWNER,
        null,
        PUBLIC
      )
    ).toEqual([3, 5]);
  });

  it("lets the catalogue win over the stored list", () => {
    const catalog = [seq("a", OWNER, 8), seq("b", OWNER, 20)];
    expect(
      resolvePlaceholderSteps(
        collection(ids, { cardSteps: stored }),
        OWNER,
        catalog,
        PUBLIC
      )
    ).toEqual([8, 20]);
  });

  it("never uses the stored list in the owner's own view", () => {
    expect(
      resolvePlaceholderSteps(
        collection(ids, { cardSteps: stored }),
        OWNER,
        null,
        OWN
      )
    ).toBeNull();
  });

  it("ignores a stored list whose key no longer matches", () => {
    expect(
      resolvePlaceholderSteps(
        collection(["a", "c"], { cardSteps: stored }),
        OWNER,
        null,
        PUBLIC
      )
    ).toBeNull();
  });

  it("ignores the stored list of a smart collection", () => {
    expect(
      resolvePlaceholderSteps(
        collection(ids, { cardSteps: stored, kind: "smart" }),
        OWNER,
        null,
        PUBLIC
      )
    ).toBeNull();
  });
});
