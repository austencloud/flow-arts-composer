/**
 * The silent failures: a stale stored list drawn after membership changed, a
 * malformed field breaking the page, and the owner write firing when it
 * should not (private, someone else's, offline, unchanged).
 */
import { describe, expect, it } from "vitest";
import type { LibraryCollection } from "../models/collection.js";
import {
  cardStepsKey,
  cardStepsToWrite,
  parseCardSteps,
  storedCardSteps,
} from "../collection-card-steps.js";

function col(
  ids: string[],
  extra: Partial<LibraryCollection> = {}
): LibraryCollection {
  return {
    id: "c",
    name: "n",
    ownerId: "me",
    sequenceIds: ids,
    sequenceCount: ids.length,
    isPublic: true,
    sortOrder: 0,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...extra,
  } as LibraryCollection;
}

describe("cardStepsKey", () => {
  it("is stable and order-sensitive", () => {
    expect(cardStepsKey(["a", "b"])).toBe(cardStepsKey(["a", "b"]));
    expect(cardStepsKey(["a", "b"])).not.toBe(cardStepsKey(["b", "a"]));
    expect(cardStepsKey(["a", "b"])).not.toBe(cardStepsKey(["a"]));
    expect(cardStepsKey(["ab", "c"])).not.toBe(cardStepsKey(["a", "bc"]));
  });
});

describe("storedCardSteps", () => {
  const ids = ["a", "b", "c"];
  const good = { key: cardStepsKey(ids), steps: [4, 8, 8] };

  it("returns the list when the key matches", () => {
    expect(storedCardSteps(col(ids, { cardSteps: good }))).toEqual([4, 8, 8]);
  });
  it("ignores a mismatched key (membership changed elsewhere)", () => {
    expect(
      storedCardSteps(col(["a", "b", "d"], { cardSteps: good }))
    ).toBeNull();
  });
  it("ignores a malformed field", () => {
    for (const bad of [
      "x",
      [1],
      { key: cardStepsKey(ids), steps: "no" },
      { key: cardStepsKey(ids), steps: [4, "8"] },
      { key: cardStepsKey(ids), steps: [4, -1] },
      { key: "", steps: [4] },
    ]) {
      expect(
        storedCardSteps(col(ids, { cardSteps: bad as never }))
      ).toBeNull();
      expect(parseCardSteps(bad)).toBeUndefined();
    }
  });
  it("ignores a smart collection", () => {
    expect(
      storedCardSteps(col(ids, { cardSteps: good, kind: "smart" }))
    ).toBeNull();
  });
  it("ignores a list longer than the public count", () => {
    expect(
      storedCardSteps(col(ids, { cardSteps: good, sequenceCount: 2 }))
    ).toBeNull();
  });
});

describe("cardStepsToWrite", () => {
  const ids = ["a", "b"];
  const base = { viewerId: "me", steps: [4, 8], online: true };

  it("writes when nothing is stored", () => {
    expect(cardStepsToWrite({ ...base, collection: col(ids) })).toEqual({
      key: cardStepsKey(ids),
      steps: [4, 8],
    });
  });
  it("writes when the steps differ or the key is stale", () => {
    const key = cardStepsKey(ids);
    expect(
      cardStepsToWrite({
        ...base,
        collection: col(ids, { cardSteps: { key, steps: [4, 9] } }),
      })
    ).not.toBeNull();
    expect(
      cardStepsToWrite({
        ...base,
        collection: col(ids, { cardSteps: { key: "old", steps: [4, 8] } }),
      })
    ).not.toBeNull();
  });
  it("does not write when equal", () => {
    expect(
      cardStepsToWrite({
        ...base,
        collection: col(ids, {
          cardSteps: { key: cardStepsKey(ids), steps: [4, 8] },
        }),
      })
    ).toBeNull();
  });
  it("does not write for private, smart, system, non-owner, offline or no answer", () => {
    const c = col(ids);
    expect(
      cardStepsToWrite({ ...base, collection: col(ids, { isPublic: false }) })
    ).toBeNull();
    expect(
      cardStepsToWrite({ ...base, collection: col(ids, { kind: "smart" }) })
    ).toBeNull();
    expect(
      cardStepsToWrite({
        ...base,
        collection: col(ids, { systemType: "favorites" }),
      })
    ).toBeNull();
    expect(
      cardStepsToWrite({ ...base, collection: c, viewerId: "someone" })
    ).toBeNull();
    expect(
      cardStepsToWrite({ ...base, collection: c, viewerId: null })
    ).toBeNull();
    expect(
      cardStepsToWrite({ ...base, collection: c, online: false })
    ).toBeNull();
    expect(
      cardStepsToWrite({ ...base, collection: c, steps: null })
    ).toBeNull();
  });
});
