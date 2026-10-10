import { describe, it, expect } from "vitest";
import {
  createSmartCollectionModel,
  isSmartCollection,
  type SmartFilterSpec,
  type LibraryCollection,
} from "#lib/shared/library/domain/models/collection.js";

const SPEC: SmartFilterSpec = {
  source: "community",
  filters: [
    { key: "difficulty", type: "difficulty", value: 2, label: "Level 2", chipColor: "var(--semantic-info)" },
  ],
  sortMethod: "alphabetical",
  sortDirection: "asc",
};

function manual(): LibraryCollection {
  return {
    id: "c1", name: "Manual", ownerId: "u1", sequenceIds: ["a"], sequenceCount: 1,
    isPublic: false, sortOrder: 0, createdAt: new Date(), updatedAt: new Date(),
  };
}

describe("smart collection model", () => {
  it("createSmartCollectionModel stamps kind + filterSpec, empty members", () => {
    const c = createSmartCollectionModel("Level 2s", "u1", SPEC);
    expect(c.kind).toBe("smart");
    expect(c.filterSpec).toEqual(SPEC);
    expect(c.sequenceIds).toEqual([]);
    expect(c.sequenceCount).toBe(0);
    expect(c.icon).toBe("fa-wand-magic-sparkles");
    expect(c.isPublic).toBe(false);
  });

  it("isSmartCollection true only for kind==='smart'", () => {
    const c = createSmartCollectionModel("x", "u1", SPEC);
    expect(isSmartCollection({ ...manual(), ...c, id: "c2" })).toBe(true);
    expect(isSmartCollection(manual())).toBe(false); // no kind → manual
    expect(isSmartCollection({ ...manual(), kind: "manual" })).toBe(false);
  });

  it("filters is an array of objects (Firestore-safe, no nested arrays)", () => {
    const c = createSmartCollectionModel("x", "u1", SPEC);
    expect(Array.isArray(c.filterSpec!.filters)).toBe(true);
    for (const f of c.filterSpec!.filters) {
      expect(Array.isArray(f)).toBe(false); // each entry is an object, not a tuple
      expect(typeof f.key).toBe("string");
    }
  });
});
